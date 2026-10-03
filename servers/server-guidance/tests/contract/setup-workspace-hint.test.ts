/**
 * WIZ-4 contract tests: setup_guidance_start accepts an optional
 * workspaceNameHint and the workspaceRoot question carries the composed
 * default GUIDANCE_WORKSPACE_ROOT + "/" + hint (variant ii — only when BOTH
 * are present, no plausibility logic).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";
import { registerSetupTools } from "../../src/mcp-server/register-setup-tools.js";
import {
  catalogOverview,
  normalizeProjectName,
  workspaceRootDefault,
  type SetupQuestion,
} from "../../src/setup/ConfigAssistant.js";

const ENV_KEY = "GUIDANCE_WORKSPACE_ROOT";
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

// "no suggestion" = falsy default: the workspaceRoot catalog question ships
// with default "" (empty string), so absence is the empty string, not undefined.
function workspaceRootQuestion(
  questions: SetupQuestion[],
): SetupQuestion | undefined {
  return questions.find((q) => q.id === "workspaceRoot");
}

describe("WIZ-4 workspaceRootDefault", () => {
  it("composes env + hint and trims trailing slashes on the env value", () => {
    process.env[ENV_KEY] = "/workspaces/";
    expect(workspaceRootDefault("thinking-mcp")).toBe(
      "/workspaces/thinking-mcp",
    );
  });

  it("returns undefined when the env variable is missing", () => {
    delete process.env[ENV_KEY];
    expect(workspaceRootDefault("thinking-mcp")).toBeUndefined();
  });

  it("returns undefined when the env value is blank", () => {
    process.env[ENV_KEY] = "   ";
    expect(workspaceRootDefault("thinking-mcp")).toBeUndefined();
  });

  it("returns undefined when the hint is missing or blank", () => {
    process.env[ENV_KEY] = "/workspaces";
    expect(workspaceRootDefault(undefined)).toBeUndefined();
    expect(workspaceRootDefault("   ")).toBeUndefined();
  });
});

describe("WIZ-4 catalogOverview default injection", () => {
  it("injects the composed default into the workspaceRoot question when env+hint are present", () => {
    process.env[ENV_KEY] = "/workspaces";
    const out = catalogOverview({}, { workspaceNameHint: "thinking-mcp" });
    const q = workspaceRootQuestion(out.questions);
    expect(q?.default).toBe("/workspaces/thinking-mcp");
    expect(out.nextQuestion?.id).toBe("configSource");
  });

  it("leaves the catalog unchanged when the env variable is missing", () => {
    delete process.env[ENV_KEY];
    const out = catalogOverview({}, { workspaceNameHint: "thinking-mcp" });
    expect(workspaceRootQuestion(out.questions)?.default).toBeFalsy();
  });

  it("leaves the catalog unchanged when the hint is missing", () => {
    process.env[ENV_KEY] = "/workspaces";
    const out = catalogOverview({});
    expect(workspaceRootQuestion(out.questions)?.default).toBeFalsy();
  });

  it("does not mutate the shared QUESTIONS catalog across calls", () => {
    process.env[ENV_KEY] = "/workspaces";
    catalogOverview({}, { workspaceNameHint: "thinking-mcp" });
    delete process.env[ENV_KEY];
    const after = catalogOverview({});
    expect(workspaceRootQuestion(after.questions)?.default).toBeFalsy();
  });
});

describe("WIZ-2 normalizeProjectName", () => {
  it("passes already-valid kebab-case names through", () => {
    expect(normalizeProjectName("thinking-mcp")).toBe("thinking-mcp");
  });

  it("strips a leading npm scope", () => {
    expect(normalizeProjectName("@paschbaer/guidance")).toBe("guidance");
  });

  it("maps whitespace, underscores and dots to single dashes", () => {
    expect(normalizeProjectName("My_Repo  Name.v2")).toBe("my-repo-name-v2");
  });

  it("collapses repeated dashes and trims edges", () => {
    expect(normalizeProjectName("--a__b--")).toBe("a-b");
  });

  it("returns undefined for blank or missing hints", () => {
    expect(normalizeProjectName(undefined)).toBeUndefined();
    expect(normalizeProjectName("   ")).toBeUndefined();
  });

  it("returns undefined when nothing valid remains", () => {
    expect(normalizeProjectName("@scope")).toBeUndefined();
    expect(normalizeProjectName("///")).toBeUndefined();
    expect(normalizeProjectName("---")).toBeUndefined();
  });

  it("rejects the reserved name 'default' even after normalization", () => {
    expect(normalizeProjectName("default")).toBeUndefined();
    expect(normalizeProjectName("Default")).toBeUndefined();
  });

  it("rejects results that still violate the registry name pattern", () => {
    expect(normalizeProjectName("-@")).toBeUndefined();
    expect(normalizeProjectName("a".repeat(70))).toBeUndefined();
  });
});

describe("WIZ-2 catalogOverview projectName default injection", () => {
  it("injects the normalized name as the projectName default", () => {
    const out = catalogOverview(
      {},
      { workspaceNameHint: "@paschbaer/server_guidance" },
    );
    const q = out.questions.find((item) => item.id === "projectName");
    expect(q?.default).toBe("server-guidance");
  });

  it("leaves projectName untouched when the hint normalizes to nothing", () => {
    const out = catalogOverview({}, { workspaceNameHint: "@scope" });
    const q = out.questions.find((item) => item.id === "projectName");
    expect(q?.default).toBeUndefined();
  });

  it("injects both defaults when env and hint are present", () => {
    process.env[ENV_KEY] = "/workspaces";
    const out = catalogOverview({}, { workspaceNameHint: "Thinking MCP" });
    expect(
      out.questions.find((item) => item.id === "projectName")?.default,
    ).toBe("thinking-mcp");
    expect(workspaceRootQuestion(out.questions)?.default).toBe(
      "/workspaces/Thinking MCP",
    );
  });
});

describe("WIZ-4 setup_guidance_start MCP tool", () => {
  async function callStart(args: Record<string, unknown>) {
    const server = createGuidanceServer();
    registerSetupTools(server);
    const pair = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])]);
    try {
      const res = await client.callTool({
        name: "setup_guidance_start",
        arguments: args,
      });
      const content = res.content as Array<{ type: string; text: string }>;
      return JSON.parse(content[0]!.text) as {
        questions: SetupQuestion[];
        nextQuestion: { id: string } | null;
      };
    } finally {
      await client.close();
    }
  }

  it("returns the composed default when called with workspaceNameHint", async () => {
    process.env[ENV_KEY] = "/workspaces";
    const out = await callStart({ workspaceNameHint: "zed" });
    expect(workspaceRootQuestion(out.questions)?.default).toBe(
      "/workspaces/zed",
    );
  });

  it("carries the normalized projectName default (WIZ-2)", async () => {
    const out = await callStart({ workspaceNameHint: "@paschbaer/guidance" });
    expect(out.questions.find((q) => q.id === "projectName")?.default).toBe(
      "guidance",
    );
  });

  it("remains backward compatible when called without arguments", async () => {
    delete process.env[ENV_KEY];
    const out = await callStart({});
    expect(out.nextQuestion?.id).toBe("configSource");
    const q = workspaceRootQuestion(out.questions);
    expect(q?.default).toBeFalsy();
  });

  it("rejects a call with no arguments field at the SDK layer (pre-change behavior)", async () => {
    delete process.env[ENV_KEY];
    const server = createGuidanceServer();
    registerSetupTools(server);
    const pair = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])]);
    try {
      const res = await client.callTool({
        name: "setup_guidance_start",
      });
      // The SDK validates the arguments field before our zod schema runs —
      // omitting it entirely is an MCP protocol error, independent of WIZ-4.
      expect(res.isError).toBe(true);
      const content = res.content as Array<{ type: string; text: string }>;
      expect(content[0]!.text).toContain("MCP error");
    } finally {
      await client.close();
    }
  });
});
