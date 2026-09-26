import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpApp } from "../../src/server.js";
import { PairStore } from "../../src/remote/pair-store.js";
import { loadConfig } from "../../src/config.js";
import type { Server } from "node:http";

/**
 * spec 005 US3 (FR-404, FR-104.5-Nachfolger): one-time report tokens bind
 * client reports to the exact pending operation — fabricated, missing,
 * mismatched, or replayed tokens are rejected.
 */
let ws: string;
let server: Server | undefined;
let port: number;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-report-token-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
});
afterEach(() => {
  server?.close();
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  rmSync(ws, { recursive: true, force: true });
});

async function boot(): Promise<void> {
  const app = createHttpApp({
    workspaceRoot: ws,
    configDir: join(ws, ".guidance"),
    stateDir: join(ws, ".guidance", "state"),
    remote: { pairs: new PairStore([]) },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  port = (server!.address() as { port: number }).port;
}

function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const text = ((await res.json()) as { result?: { content?: { text: string }[] } }).result?.content?.[0]?.text ?? "{}";
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { rawError: text };
    }
  })();
}

const CONFIG: Record<string, unknown> = {
  version: 2,
  project: { name: "token-test" },
  configFiles: {
    "guidance.json": JSON.stringify({
      version: 2, profile: "plain", project: { name: "token-test" },
      workflow: { file: "workflow.json" }, responses: { file: "responses.json" },
      operations: { file: "operations.json" }, downstreamServers: { file: "downstream-servers.json" },
      policies: { file: "policies.json" }, state: { directory: "state", persistAfterEveryOperation: true },
      security: { restrictWorkingDirectory: true, redactSensitiveOutput: true },
    }),
    "workflow.json": JSON.stringify({
      version: 2,
      workflow: { id: "w", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
      phases: {
        understand: {
          response: "understand",
          submissionSchema: "schemas/understand.schema.json",
          lifecycle: { afterEnter: ["client-op"] },
          transitions: [{ to: "completed", when: "required_operations_succeeded" }],
        },
      },
      states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
    }),
    "responses.json": JSON.stringify({ version: 2, responses: { understand: { title: "U", instruction: "u", requiredActions: [] } } }),
    "operations.json": JSON.stringify({
      version: 2,
      operations: {
        "client-op": {
          description: "client-executed op", type: "process", executable: "node",
          args: ["-e", "process.exit(0)"], required: false, timeoutSeconds: 30,
          validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" },
        },
      },
    }),
    "downstream-servers.json": JSON.stringify({ version: 2, servers: {} }),
    "policies.json": JSON.stringify({ version: 2, trustLevels: { trusted: { dataEgress: "project_data" } }, validation: {}, reviewFindings: { blockingSeverities: ["high"] }, redaction: { patterns: [] }, outputDefaults: { returnToAgent: "summary_and_errors" } }),
    "schemas/understand.schema.json": JSON.stringify({ type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } }),
  },
};

describe("remote report tokens (spec 005 FR-404, SC-402)", () => {
  it("awaiting_client exposes a one-time token; correct token accepted once; replay rejected", async () => {
    await boot();
    const init = await call("init_session", { config: CONFIG });
    const sid = init.sessionId as string;
    const start = await call("start_workflow", { sessionId: sid, request: "r" });
    expect(start.accepted).toBe(true);
    const ops = start.operations as { id: string; opToken?: string }[];
    const token = ops.find((o) => o.id === "client-op")?.opToken;
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    // correct token accepted exactly once
    const ok = await call("report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded",
      summary: "done", reportToken: token,
    });
    expect(ok.recorded ?? ok.accepted).toBeTruthy();

    // replay → rejected
    const replay = await call("report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded",
      summary: "replay", reportToken: token as string,
    });
    expect(replay.rawError ?? "").toMatch(/client_report_invalid/);
  });

  it("missing or wrong token → client_report_invalid, no report recorded", async () => {
    await boot();
    const init = await call("init_session", { config: CONFIG });
    const sid = init.sessionId as string;
    const start = await call("start_workflow", { sessionId: sid, request: "r" });
    const ops = start.operations as { id: string; opToken?: string }[];
    const token = ops.find((o) => o.id === "client-op")?.opToken as string;

    const missing = await call("report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded", summary: "no token",
    });
    expect(missing.rawError ?? "").toMatch(/client_report_invalid/);

    const wrong = await call("report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded", summary: "bad", reportToken: "f".repeat(32),
    });
    expect(wrong.rawError ?? "").toMatch(/client_report_invalid/);

    // the valid token still works afterwards (nothing was burned by rejects)
    const ok = await call("report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded", summary: "ok", reportToken: token,
    });
    expect(ok.recorded ?? ok.accepted).toBeTruthy();
  });
});
