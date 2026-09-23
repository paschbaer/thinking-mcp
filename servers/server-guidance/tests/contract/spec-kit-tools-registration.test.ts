import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { composeApplication } from "../../src/main.js";
import { registerWorkflowTools, WORKFLOW_TOOL_NAMES } from "../../src/mcp-server/register-tools.js";
import { registerSpecKitTools, SPEC_KIT_TOOL_NAMES, toEngineSpecKitConfig } from "../../src/mcp-server/register-spec-kit-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";
import { loadConfig } from "../../src/config.js";
import { GuidanceError } from "../../src/types/errors.js";

let ws: string;
let server: ReturnType<typeof createGuidanceServer>;
let client: Client;

function setupWorkspace(profile: "plain" | "spec-kit"): { cfgDir: string; stateDir: string } {
  ws = mkdtempSync(join(tmpdir(), "guidance-skt-"));
  writeFileSync(join(ws, "package.json"), JSON.stringify({ name: "ws" }));
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of ["workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(fixture, f)));
  }
  const guidance = JSON.parse(readFileSync(join(fixture, "guidance.json"), "utf-8")) as Record<string, unknown>;
  guidance.profile = profile;
  if (profile === "spec-kit") {
    guidance.integrations = {
      specKit: {
        enabled: true,
        discovery: { featureRoot: "specs", strategy: "singleCandidate" },
      },
    };
  }
  writeFileSync(join(cfgDir, "guidance.json"), JSON.stringify(guidance, null, 2));
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(cfgDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  // Minimales Spec-Kit-Feature (spec/plan/tasks) für den Import.
  const feature = join(ws, "specs", "001-demo");
  mkdirSync(feature, { recursive: true });
  writeFileSync(join(feature, "spec.md"), "# Feature\n\n## Acceptance Criteria\n\n- **SC-001**: works\n");
  writeFileSync(join(feature, "plan.md"), "# Plan\n");
  writeFileSync(join(feature, "tasks.md"), "# Tasks\n\n- [ ] T001 First task\n- [ ] T002 Second task\n");
  return { cfgDir, stateDir: join(ws, "state") };
}

async function start(profile: "plain" | "spec-kit"): Promise<void> {
  const { cfgDir, stateDir } = setupWorkspace(profile);
  const app = composeApplication(ws, cfgDir, stateDir);
  server = createGuidanceServer();
  registerWorkflowTools(server, app.tools, ws);
  if (profile === "spec-kit") {
    registerSpecKitTools(server, {
      workspaceRoot: ws,
      stateDir,
      configVersion: app.config.configVersion,
      specKitConfig: toEngineSpecKitConfig(app.config.specKit!),
      audit: () => {},
    });
  }
  const pair = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(pair[0]), (client = new Client({ name: "test", version: "1" })).connect(pair[1])]);
}

function textOf(res: unknown): Record<string, unknown> {
  return JSON.parse(((res as { content: { type: string; text: string }[] }).content)[0]!.text) as Record<string, unknown>;
}

beforeEach(() => { ws = ""; });
afterEach(async () => {
  if (client) await client.close();
  if (ws) rmSync(ws, { recursive: true, force: true });
});

describe("Spec-Kit tool registration (Review Finding 7, Option C)", () => {
  it("fail-closed: registerSpecKitTools ohne Konfiguration wirft spec_kit_not_enabled", () => {
    expect(() =>
      registerSpecKitTools(new McpServer({ name: "t", version: "1" }), {
        workspaceRoot: "/tmp", stateDir: "/tmp", configVersion: "x",
        specKitConfig: undefined as never,
        audit: () => {},
      }),
    ).toThrowError(GuidanceError);
  });

  it("plain profile: keine Spec-Kit-Tools (R17)", async () => {
    await start("plain");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of SPEC_KIT_TOOL_NAMES) expect(names).not.toContain(n);
  });

  it("spec-kit profile: exakt Workflow- + Spec-Kit-Oberfläche (keine Duplikate, nichts fehlt)", async () => {
    await start("spec-kit");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [...WORKFLOW_TOOL_NAMES, ...SPEC_KIT_TOOL_NAMES].sort();
    // Exakte Mengengleichheit: fängt fehlende UND doppelt registrierte Tools.
    expect(names).toEqual(expected);
    expect(new Set(names).size).toBe(names.length);
  });

  it("discover → import → get_next_task Round-Trip über das Protokoll", async () => {
    await start("spec-kit");
    const disc = textOf(await client.callTool({ name: "discover_spec_kit_feature", arguments: { sessionId: "s1" } }));
    expect(disc.featureId).toBe("001-demo");
    const imp = textOf(await client.callTool({ name: "import_spec_kit_artifacts", arguments: { sessionId: "s1" } }));
    expect(imp.activeSnapshotId).toBeTruthy();
    expect(imp.taskCount).toBe(2);
    const next = textOf(await client.callTool({ name: "get_next_task", arguments: { sessionId: "s1" } }));
    expect(next.nextTaskId).toBe("T001");
    const status = textOf(await client.callTool({ name: "get_spec_kit_status", arguments: { sessionId: "s1" } }));
    expect((status.tasks as Record<string, number>)["pending"]).toBe(2);
  });

  it("Traversal-SessionId wird abgewiesen (Path Safety Regression)", async () => {
    await start("spec-kit");
    const res = await client.callTool({ name: "get_spec_kit_status", arguments: { sessionId: "../../escaped" } });
    expect(res.isError).toBe(true);
    const text = String((res.content as { type: string; text: string }[])[0]!.text);
    expect(text).toMatch(/invalid sessionId/);
  });

  it("get_spec_kit_status vor dem Import liefert strukturierten Fehler (kein Crash)", async () => {
    await start("spec-kit");
    const res = await client.callTool({ name: "get_spec_kit_status", arguments: { sessionId: "ghost" } });
    expect(res.isError).toBe(true);
  });
});
