/** specs/017 follow-up B1: next_feature_number tool wiring. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerSpecKitTools } from "../../src/mcp-server/register-spec-kit-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";

let ws: string;
let server: ReturnType<typeof createGuidanceServer>;
let client: Client;

const specKitConfig = {
  featureRoot: "specs",
  strategy: "singleCandidate" as const,
  requireUniqueMatch: false,
  artifactPatterns: {},
  maxTasks: 3,
  maxEntities: 2000,
  maxExcerptBytes: 65536,
};

function start(sessionWorkspace?: (sid: string) => string | undefined): void {
  server = createGuidanceServer();
  registerSpecKitTools(server, {
    workspaceRoot: ws,
    stateDir: join(ws, "state"),
    configVersion: "test",
    specKitConfig,
    getSessionWorkspace: sessionWorkspace,
    audit: () => {},
  });
}

async function connect(): Promise<void> {
  const pair = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(pair[0]),
    (client = new Client({ name: "t", version: "1" })).connect(pair[1]),
  ]);
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-fn-"));
  mkdirSync(join(ws, "specs"), { recursive: true });
});

afterEach(async () => {
  await client?.close();
  await server?.close();
  rmSync(ws, { recursive: true, force: true });
});

describe("next_feature_number tool (specs/017 FR-10 / B1)", () => {
  it("returns the next feature id for the session workspace", async () => {
    mkdirSync(join(ws, "specs", "001-auth"));
    mkdirSync(join(ws, "specs", "017-speckit"));
    start();
    await connect();
    const res = await client.callTool({
      name: "next_feature_number",
      arguments: { sessionId: "s1" },
    });
    const payload = JSON.parse(
      (res.content as { type: string; text: string }[])[0]!.text,
    ) as { nextFeatureId: string };
    expect(payload.nextFeatureId).toBe("018");
  });

  it("returns 001 when the feature root has no numbered dirs", async () => {
    start();
    await connect();
    const res = await client.callTool({
      name: "next_feature_number",
      arguments: { sessionId: "s1" },
    });
    const payload = JSON.parse(
      (res.content as { type: string; text: string }[])[0]!.text,
    ) as { nextFeatureId: string };
    expect(payload.nextFeatureId).toBe("001");
  });

  it("returns 001 when the feature root directory is missing entirely", async () => {
    rmSync(join(ws, "specs"), { recursive: true, force: true });
    start();
    await connect();
    const res = await client.callTool({
      name: "next_feature_number",
      arguments: { sessionId: "s1" },
    });
    const payload = JSON.parse(
      (res.content as { type: string; text: string }[])[0]!.text,
    ) as { nextFeatureId: string };
    expect(payload.nextFeatureId).toBe("001");
  });

  it("is registered on the server", async () => {
    start();
    await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("next_feature_number");
  });

  it("engine method delegates to the pure helper (session workspace routing)", async () => {
    // Session workspace different from the pool root: the resolver resolves
    // the engine under the SESSION root (SKP-1 wiring) — prove the method
    // reads THAT root.
    const sessionWs = mkdtempSync(join(tmpdir(), "guidance-fn-session-"));
    try {
      mkdirSync(join(sessionWs, "specs", "005-other"), { recursive: true });
      writeFileSync(
        join(ws, "state-root-marker"),
        "pool root should not be read",
      );
      start((sid) => sessionWs);
      await connect();
      const res = await client.callTool({
        name: "next_feature_number",
        arguments: { sessionId: "s1" },
      });
      const payload = JSON.parse(
        (res.content as { type: string; text: string }[])[0]!.text,
      ) as { nextFeatureId: string };
      expect(payload.nextFeatureId).toBe("006");
    } finally {
      rmSync(sessionWs, { recursive: true, force: true });
    }
  });
});
