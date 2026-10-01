/**
 * specs/008 T10 (AC-1): two registered workspaces run parallel sessions with
 * fully isolated state (child engine per non-default workspace, state dir
 * <root>/.guidance/state).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { composeApplication } from "../../src/main.js";
import { registerWorkflowTools } from "../../src/mcp-server/register-tools.js";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";

let wsA: string;
let wsB: string;
let client: Client;

function textOf(res: unknown): Record<string, unknown> {
  return JSON.parse(
    (res as { content: { type: string; text: string }[] }).content[0]!.text,
  ) as Record<string, unknown>;
}

function errText(res: unknown): string {
  const content = (res as { content?: { type: string; text: string }[] })
    .content;
  return content?.[0]?.text ?? "";
}

function scaffoldConfig(dir: string, workspaces?: unknown): void {
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  const cfgDir = join(dir, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(fixture, f)));
  }
  const guidance = JSON.parse(
    readFileSync(join(fixture, "guidance.json"), "utf-8"),
  ) as Record<string, unknown>;
  if (workspaces !== undefined) guidance.workspaces = workspaces;
  writeFileSync(
    join(cfgDir, "guidance.json"),
    JSON.stringify(guidance, null, 2),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(fixture, "schemas", f)),
    );
  }
}

function sessionFiles(stateDir: string): string[] {
  const sessionsDir = join(stateDir, "sessions");
  if (!existsSync(sessionsDir)) return [];
  return readdirSync(sessionsDir);
}

beforeEach(() => {
  wsA = mkdtempSync(join(tmpdir(), "wsa-"));
  wsB = mkdtempSync(join(tmpdir(), "wsb-"));
  scaffoldConfig(wsA, [
    { name: "main", root: wsA },
    { name: "other", root: wsB },
  ]);
  scaffoldConfig(wsB); // own .guidance → own config + configurationVersion
  const app = composeApplication(
    wsA,
    join(wsA, ".guidance"),
    join(wsA, ".guidance", "state"),
  );
  const server = createGuidanceServer();
  registerWorkflowTools(server, app.tools, wsA, app.config.workspaces);
  const pair = InMemoryTransport.createLinkedPair();
  void server.connect(pair[0]);
  client = new Client({ name: "test", version: "1" });
  void client.connect(pair[1]);
});

afterEach(async () => {
  await client.close();
  rmSync(wsA, { recursive: true, force: true });
  rmSync(wsB, { recursive: true, force: true });
});

describe("multi-workspace parallel sessions (specs/008 T10, AC-1)", () => {
  it("sessions in two workspaces run in parallel with isolated state dirs", async () => {
    const a = textOf(
      await client.callTool({
        name: "start_workflow",
        arguments: { workspace: "main", request: "request A" },
      }),
    );
    const b = textOf(
      await client.callTool({
        name: "start_workflow",
        arguments: { workspace: "other", request: "request B" },
      }),
    );
    const idA = a.sessionId as string;
    const idB = b.sessionId as string;
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);

    // State isolation: B's session state lives under wsB/.guidance/state,
    // A's under wsA/.guidance/state. The parent state must not contain B.
    const filesA = sessionFiles(join(wsA, ".guidance", "state"));
    const filesB = sessionFiles(join(wsB, ".guidance", "state"));
    expect(filesA.some((f) => f.includes(idA))).toBe(true);
    expect(filesB.some((f) => f.includes(idB))).toBe(true);
    expect(filesA.some((f) => f.includes(idB))).toBe(false);

    // Both sessions are independently addressable through the same server.
    const stateA = textOf(
      await client.callTool({
        name: "get_workflow_state",
        arguments: { sessionId: idA },
      }),
    );
    const stateB = textOf(
      await client.callTool({
        name: "get_workflow_state",
        arguments: { sessionId: idB },
      }),
    );
    expect(stateA.sessionId).toBe(idA);
    expect(stateB.sessionId).toBe(idB);
    // specs/008 T13: orchestration context (incl. gate ops) resolves per
    // child workspace — the child scaffold carries its own operations.json.
    const orchB = textOf(
      await client.callTool({
        name: "get_orchestration_status",
        arguments: { sessionId: idB },
      }),
    );
    expect(orchB.sessionId).toBe(idB);
  });

  it("AC-5: changing a workspace config invalidates its persisted sessions on the next operation", async () => {
    const a = textOf(
      await client.callTool({
        name: "start_workflow",
        arguments: { workspace: "main", request: "A" },
      }),
    );
    const b = textOf(
      await client.callTool({
        name: "start_workflow",
        arguments: { workspace: "other", request: "B" },
      }),
    );
    const idA = a.sessionId as string;
    const idB = b.sessionId as string;
    await client.close();

    // Mutate wsB's config (registry entry unchanged, config content changed)
    // and recompose — the new composition binds to the new configVersion.
    const cfgB = join(wsB, ".guidance", "guidance.json");
    const g = JSON.parse(readFileSync(cfgB, "utf-8")) as Record<
      string,
      unknown
    >;
    (g.project as Record<string, unknown>).name = "other-changed";
    writeFileSync(cfgB, JSON.stringify(g, null, 2));

    const app2 = composeApplication(
      wsA,
      join(wsA, ".guidance"),
      join(wsA, ".guidance", "state"),
    );
    const server2 = createGuidanceServer();
    registerWorkflowTools(server2, app2.tools, wsA, app2.config.workspaces);
    const pair2 = InMemoryTransport.createLinkedPair();
    void server2.connect(pair2[0]);
    client = new Client({ name: "test2", version: "1" });
    await client.connect(pair2[1]);

    // Unchanged parent workspace: persisted session still valid (AC-3).
    const stateA = textOf(
      await client.callTool({
        name: "get_workflow_state",
        arguments: { sessionId: idA },
      }),
    );
    expect(stateA.sessionId).toBe(idA);

    // Changed child workspace (valid change): the session REBINDS to the new
    // composition (specs/015 addendum AC-14/AC-17 — R2 decision; the old
    // unconditional fail-closed is covered by the AC-15 test in
    // registry-rebind.test.ts for invalid configs).
    const stateB = textOf(
      await client.callTool({
        name: "get_workflow_state",
        arguments: { sessionId: idB },
      }),
    );
    expect(stateB.sessionId).toBe(idB);
    const historyB = readFileSync(
      join(wsB, ".guidance", "state", "history", `${idB}.jsonl`),
      "utf-8",
    );
    expect(historyB).toContain("session_rebound");
  });
});
