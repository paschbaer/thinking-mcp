import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpApp } from "../../src/server.js";
import { PairStore } from "../../src/remote/pair-store.js";
import { loadConfig } from "../../src/config.js";
import type { Server } from "node:http";

let ws: string;
let server: Server | undefined;
let port: number;

const cfg = () => loadConfig(join(ws, ".guidance"));

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-remote-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
});
afterEach(() => {
  server?.close();
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  rmSync(ws, { recursive: true, force: true });
});

async function boot(opts: { pairs?: { key: string; token: string }[]; forceRemote?: boolean } = {}): Promise<void> {
  const stateDir = join(ws, ".guidance", "state");
  const app = createHttpApp({
    workspaceRoot: ws,
    configDir: join(ws, ".guidance"),
    stateDir,
    remote: opts.pairs || opts.forceRemote ? { pairs: new PairStore(opts.pairs ?? []) } : undefined,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  port = (server!.address() as { port: number }).port;
}

function mcp(body: Record<string, unknown>, token?: string) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function call(name: string, args: Record<string, unknown>, token?: string) {
  const res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token);
  expect(res.status).toBe(200);
  return JSON.parse(((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text) as Record<string, unknown>;
}

// Minimale Inline-Konfiguration (7 Phasen kompakt: understand → plan → complete)
const MINIMAL_CONFIG: Record<string, unknown> = {
  version: 2,
  project: { name: "remote-test" },
  workflow: { file: "workflow.json" },
  responses: { file: "responses.json" },
  operations: { file: "operations.json" },
  downstreamServers: { file: "downstream-servers.json" },
  policies: { file: "policies.json" },
  state: { directory: "state", persistAfterEveryOperation: true },
  security: { restrictWorkingDirectory: true, redactSensitiveOutput: true },
  configFiles: {
    "workflow.json": JSON.stringify({
      version: 2,
      workflow: { id: "w", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
      phases: {
        understand: { response: "understand", submissionSchema: "schemas/understand.schema.json", transitions: [{ to: "plan", when: "submission_valid" }] },
        plan: { response: "plan", submissionSchema: "schemas/plan.schema.json", transitions: [{ to: "completed", when: "submission_valid" }] },
      },
      states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
    }),
    "responses.json": JSON.stringify({ version: 2, responses: {
      understand: { title: "U", instruction: "understand it", requiredActions: [] },
      plan: { title: "P", instruction: "plan it", requiredActions: [] },
    } }),
    "operations.json": JSON.stringify({ version: 2, operations: {} }),
    "downstream-servers.json": JSON.stringify({ version: 2, servers: {} }),
    "policies.json": JSON.stringify({ version: 2, trustLevels: { trusted: { dataEgress: "project_data" } }, validation: {}, reviewFindings: { blockingSeverities: ["high"] }, redaction: { patterns: [] }, outputDefaults: { returnToAgent: "summary_and_errors" } }),
    "schemas/understand.schema.json": JSON.stringify({ type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } }),
    "schemas/plan.schema.json": JSON.stringify({ type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } }),
  },
};

describe("remote mode (spec amendment 001)", () => {
  it("anonymous: init_session ohne key + start_workflow über die Session (FR-101.6)", async () => {
    await boot({ forceRemote: true });
    const init = await call("init_session", { config: MINIMAL_CONFIG });
    expect(init.sessionId).toBeTruthy();
    const sid = init.sessionId as string;
    const start = await call("start_workflow", { sessionId: sid, request: "remote demo" });
    expect(start.accepted).toBe(true);
    expect(start.currentPhase).toBe("understand");
  });

  it("pairs: init_session ohne key ⇒ Fehler; mit key+falschem Token ⇒ unauthorized (FR-102.1)", async () => {
    await boot({ forceRemote: true, pairs: [{ key: "repo-a", token: "tok-a-1234567890abcdef" }] });
    // ohne key ⇒ HTTP 401 (FR-101.7: key ist bei Pairs Pflicht)
    const noKey = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "init_session", arguments: { config: MINIMAL_CONFIG } } });
    expect(noKey.status).toBe(401);
    // mit key + falschem Token ⇒ 401
    const badKey = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "init_session", arguments: { key: "repo-a", config: MINIMAL_CONFIG } } }, "wrong-token-1234567890");
    expect(badKey.status).toBe(401);
  });

  it("pairs: key+token ⇒ Session; fremder Token kann die Session NICHT bedienen (FR-103.1)", async () => {
    await boot({ forceRemote: true, pairs: [
      { key: "repo-a", token: "tok-a-1234567890abcdef" },
      { key: "repo-b", token: "tok-b-1234567890abcdef" },
    ] });
    const init = await call("init_session", { key: "repo-a", config: MINIMAL_CONFIG }, "tok-a-1234567890abcdef");
    const sid = init.sessionId as string;
    // Repo-B-Token auf Repo-A-Session ⇒ session_not_found (kein Existenz-Oracle)
    const foreign = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_current_guidance", arguments: { sessionId: sid } } }, "tok-b-1234567890abcdef");
    expect(foreign.status).toBe(404);
    const foreignBody = (await foreign.json()) as { error?: { message?: string } };
    expect(foreignBody.error?.message).toMatch(/session_not_found/);
    // richtiger Token funktioniert
    const start = await call("start_workflow", { sessionId: sid, request: "binding demo" }, "tok-a-1234567890abcdef");
    expect(start.accepted).toBe(true);
    // Workflow-Session-Id (von start_workflow) ist die operative Id:
    const wfSid = start.sessionId as string;
    const ok = await call("get_current_guidance", { sessionId: wfSid }, "tok-a-1234567890abcdef");
    expect(ok.currentPhase).toBe("understand");
  });

  it("idempotent: identische Config ⇒ gleiche Session (FR-102.4)", async () => {
    await boot({ forceRemote: true });
    const a = await call("init_session", { config: MINIMAL_CONFIG });
    const b = await call("init_session", { config: MINIMAL_CONFIG });
    expect(b.sessionId).toBe(a.sessionId);
  });
});
