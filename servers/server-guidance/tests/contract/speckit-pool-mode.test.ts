import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerSpecKitTools } from "../../src/mcp-server/register-spec-kit-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";

// SKP-1 (specs/008 T6): the HTTP pool entry (src/server.ts) must wire
// getSessionWorkspace so SpecKitEngineResolver resolves features under the
// SESSION workspace root, not the pool root (GUIDANCE_WORKSPACE_ROOT).
// These tests pin the resolver contract directly at the registration layer.

let poolRoot: string;
let sessionRoot: string;
let stateDir: string;
let server: ReturnType<typeof createGuidanceServer>;
let client: Client;

function makeRoot(prefix: string, withFeature: boolean): string {
  const root = mkdtempSync(join(tmpdir(), `guidance-skp-${prefix}-`));
  if (withFeature) {
    const feature = join(root, "specs", "001-demo");
    mkdirSync(feature, { recursive: true });
    writeFileSync(
      join(feature, "spec.md"),
      "# Feature\n\n## Acceptance Criteria\n\n- **SC-001**: works\n",
    );
  }
  return root;
}

const specKitConfig = {
  featureRoot: "specs",
  strategy: "singleCandidate" as const,
  requireUniqueMatch: false,
  artifactPatterns: {},
  maxTasks: 3,
  maxEntities: 2000,
  maxExcerptBytes: 65536,
};

function start(getSessionWorkspace?: (sid: string) => string | undefined): void {
  server = createGuidanceServer();
  registerSpecKitTools(server, {
    // Pool root has NO specs/ — only the session root owns the feature.
    workspaceRoot: poolRoot,
    stateDir,
    configVersion: "test",
    specKitConfig,
    getSessionWorkspace,
    audit: () => {},
  });
}

async function connect(): Promise<void> {
  const pair = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(pair[0]),
    (client = new Client({ name: "test", version: "1" })).connect(pair[1]),
  ]);
}

function textOf(res: unknown): Record<string, unknown> {
  return JSON.parse(
    (res as { content: { type: string; text: string }[] }).content[0]!.text,
  ) as Record<string, unknown>;
}

async function errorText(res: unknown): Promise<string> {
  const r = res as { isError?: boolean; content: { text: string }[] };
  expect(r.isError).toBe(true);
  return String(r.content[0]!.text);
}

beforeEach(() => {
  poolRoot = makeRoot("pool", false);
  sessionRoot = makeRoot("session", true);
  stateDir = mkdtempSync(join(tmpdir(), "guidance-skp-state-"));
  client = undefined as never;
});

afterEach(async () => {
  if (client) await client.close();
  rmSync(join(sessionRoot, "..", "escape-target"), {
    recursive: true,
    force: true,
  });
  for (const dir of [poolRoot, sessionRoot, stateDir])
    rmSync(dir, { recursive: true, force: true });
});

describe("Spec-Kit pool-mode session-root resolution (SKP-1, specs/008 T6)", () => {
  it("A: getSessionWorkspace routes discovery under the SESSION root, not the pool root", async () => {
    start((sid) => (sid === "s1" ? sessionRoot : undefined));
    await connect();
    const res = textOf(
      await client.callTool({
        name: "discover_spec_kit_feature",
        arguments: { sessionId: "s1" },
      }),
    );
    expect(String(res["directory"])).toContain(sessionRoot);
    expect(String(res["featureId"])).toBe("001-demo");
  });

  it("B: unknown sessionId falls back to the pool root with a structured error (no crash)", async () => {
    start((sid) => (sid === "s1" ? sessionRoot : undefined));
    await connect();
    const res = await client.callTool({
      name: "discover_spec_kit_feature",
      arguments: { sessionId: "ghost" },
    });
    // Pool root has no specs/ → documented spec_kit_feature_not_found fallback.
    const text = await errorText(res);
    expect(text).toContain("spec_kit_feature_not_found");
    expect(text).toContain("feature root missing: specs");
  });

  it("B2: without the callback entirely, pool-root behavior is unchanged (pre-fix regression guard)", async () => {
    start();
    await connect();
    const text = await errorText(
      await client.callTool({
        name: "discover_spec_kit_feature",
        arguments: { sessionId: "s1" },
      }),
    );
    expect(text).toContain("spec_kit_feature_not_found");
  });

  it("C: T6 root-check still enforced with a session-rooted engine (outside_workspace)", async () => {
    start((sid) => (sid === "s1" ? sessionRoot : undefined));
    await connect();
    // Relative traversal target that EXISTS outside the session workspace,
    // so the existsSync pre-check passes and the T6 root-check must reject it.
    mkdirSync(join(sessionRoot, "..", "escape-target"), { recursive: true });
    const text = await errorText(
      await client.callTool({
        name: "discover_spec_kit_feature",
        arguments: { sessionId: "s1", featureId: "../../escape-target" },
      }),
    );
    expect(text).toContain("spec_kit_feature_outside_workspace");
  });
});
