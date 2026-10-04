/**
 * Spec 016 contract tests — Stufe 2 async acceptance (AC1, AC2) and the
 * synchronous default (FR-4/FR-10).
 *
 * Fixture: guidance-slow — "understand" phase has a required beforeExit gate
 * "slow-gate" (node sleep ~1.2 s) so transitions run long enough to observe
 * prompt acceptance vs. synchronous completion.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttpServer } from "../../src/server.js";

let ws: string;
const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance-slow");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-async-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
  const cfgDir = join(ws, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
});

afterEach(() => {
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  delete process.env.GUIDANCE_ASYNC_ACCEPTANCE;
  rmSync(ws, { recursive: true, force: true });
});

interface RpcResult {
  result?: { content?: { text: string }[] };
}

function mcpCall(
  port: number,
  id: number,
  name: string,
  args: Record<string, unknown>,
  meta?: Record<string, unknown>,
): Promise<{ status: number; body: RpcResult }> {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Streamable HTTP requires clients to accept both; JSON is still
      // served because SSE needs an EXCLUSIVE text/event-stream Accept.
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
    }),
  }).then(async (res) => ({
    status: res.status,
    body: (await res.json()) as RpcResult,
  }));
}

function parse(body: RpcResult): Record<string, unknown> {
  return JSON.parse(body.result?.content?.[0]?.text ?? "{}") as Record<
    string,
    unknown
  >;
}

async function startSession(port: number): Promise<string> {
  const start = await mcpCall(port, 1, "start_workflow", {
    workspaceRoot: ws,
    request: "spec-016-async-contract",
  });
  expect(start.status).toBe(200);
  const payload = parse(start.body);
  expect(payload.accepted).toBe(true);
  return payload.sessionId as string;
}

async function getState(
  port: number,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const res = await mcpCall(port, 99, "get_workflow_state", { sessionId });
  return parse(res.body);
}

async function waitForTerminal(
  port: number,
  sessionId: string,
): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> = {};
  for (let i = 0; i < 100; i++) {
    state = await getState(port, sessionId);
    const ops = state.asyncOperations as
      | Record<string, { status: string }>
      | undefined;
    if (ops?.submit_understanding && ops.submit_understanding.status !== "in_flight") {
      return state;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return state;
}

describe("spec 016 — async acceptance (Stufe 2)", () => {
  beforeEach(() => {
    process.env.GUIDANCE_ASYNC_ACCEPTANCE = "1";
  });

  it("AC1: async submit returns <1 s with acceptance state; outcome retrievable via get_workflow_state", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const sessionId = await startSession(port);

    const t0 = Date.now();
    const res = await mcpCall(
      port,
      2,
      "submit_understanding",
      { sessionId, summary: "async acceptance contract" },
      { async: true },
    );
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    const payload = parse(res.body);
    expect(payload.accepted).toBe(true);
    expect(payload.asyncAccepted).toBe(true);
    expect(payload.status).toBe("in_flight");
    expect(payload.pollWith).toBe("get_workflow_state");
    expect(elapsed).toBeLessThan(1000);

    // Terminal outcome becomes retrievable via the status interface (FR-3).
    const state = await waitForTerminal(port, sessionId);
    const op = (
      state.asyncOperations as Record<string, Record<string, unknown>>
    ).submit_understanding;
    expect(op?.status).toBe("succeeded");
    expect(state.currentPhase).toBe("plan");
  }, 30_000);

  it("F5: a DIFFERENT payload while in flight is rejected, not swallowed as a retry", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const sessionId = await startSession(port);

    const first = mcpCall(
      port,
      7,
      "submit_understanding",
      { sessionId, summary: "original payload" },
      { async: true },
    );
    await new Promise((r) => setTimeout(r, 150));
    const second = await mcpCall(
      port,
      8,
      "submit_understanding",
      { sessionId, summary: "DIFFERENT payload" },
      { async: true },
    );
    const secondText = second.body.result?.content?.[0]?.text ?? "";
    expect(secondText).toMatch(/in flight|operation_in_progress/);
    // The original transition still completes normally.
    const firstPayload = parse((await first).body);
    expect(firstPayload.asyncAccepted).toBe(true);
    await waitForTerminal(port, sessionId);
  }, 30_000);

  it("AC2: retry while in flight is idempotent — same operation, no second execution", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const sessionId = await startSession(port);

    const args = { sessionId, summary: "idempotent retry" };
    const first = mcpCall(port, 3, "submit_understanding", args, { async: true });
    // Fire the retry while the first transition is behind the slow gate.
    await new Promise((r) => setTimeout(r, 150));
    const second = await mcpCall(port, 4, "submit_understanding", args, {
      async: true,
    });
    const firstPayload = parse((await first).body);
    const secondPayload = parse(second.body);

    expect(firstPayload.asyncAccepted).toBe(true);
    expect(secondPayload.asyncAccepted).toBe(true);
    expect(secondPayload.retry).toBe(true);
    expect(secondPayload.operationId).toBe(firstPayload.operationId);

    // Single execution proof: one retained record with one completedAt and
    // the phase advanced exactly once (plan, not beyond).
    const state = await waitForTerminal(port, sessionId);
    const ops = state.asyncOperations as Record<
      string,
      { status: string; completedAt?: string }
    >;
    expect(ops.submit_understanding?.status).toBe("succeeded");
    expect(ops.submit_understanding?.completedAt).toBeDefined();
    expect(state.currentPhase).toBe("plan");
  }, 30_000);

  it("per-request opt-out: _meta.async=false stays synchronous even with server default on", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const sessionId = await startSession(port);

    const res = await mcpCall(
      port,
      5,
      "submit_understanding",
      { sessionId, summary: "sync opt-out" },
      { async: false },
    );
    const payload = parse(res.body);
    expect(payload.asyncAccepted).toBeUndefined();
    expect(payload.accepted).toBe(true);
    expect(payload.currentPhase).toBe("plan");
  }, 30_000);
});

describe("spec 016 — synchronous default unchanged (FR-4/FR-10)", () => {
  it("without _meta.async and without env default, submit responds synchronously as before", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const sessionId = await startSession(port);

    const res = await mcpCall(port, 6, "submit_understanding", {
      sessionId,
      summary: "plain sync submission",
    });
    const payload = parse(res.body);
    expect(payload.asyncAccepted).toBeUndefined();
    expect(payload.accepted).toBe(true);
    expect(payload.currentPhase).toBe("plan");
  }, 30_000);
});
