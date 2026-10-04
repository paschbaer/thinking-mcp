/**
 * Spec 016 AC1/AC2 contract tests — async acceptance in server-clear-thought.
 *
 * The wrapped set is session_save/session_load (the only plausible
 * slow-operation candidates in this server; all other tools are in-memory
 * session-state computations). The test fixture CLEAR_THOUGHT_ASYNC_TEST_
 * MIN_DURATION_MS makes the wrapped handler observably slow (mirrors
 * guidance's slow-gate fixture); production default is 0 (no delay).
 */
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../src/server.js";

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "s016-ct-"));
  process.env.CLEAR_THOUGHT_DATA_DIR = workDir;
  process.env.CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS = "1200";
});

afterAll(() => {
  server.close();
  delete process.env.CLEAR_THOUGHT_DATA_DIR;
  delete process.env.CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS;
  delete process.env.CLEAR_THOUGHT_ASYNC_ACCEPTANCE;
  rmSync(workDir, { recursive: true, force: true });
});

const server = app.listen(0, "127.0.0.1");
const port = () => (server.address() as { port: number }).port;

async function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port()}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "s016-ct-contract", version: "0.0.0" },
  },
};

let sid: string;

async function init(): Promise<void> {
  const res = await post(INIT);
  expect([200, 201]).toContain(res.status);
  sid = res.headers.get("mcp-session-id")!;
  expect(sid).toBeTruthy();
}

interface JsonRpc {
  result?: Record<string, unknown>;
  error?: unknown;
  id?: unknown;
}

async function callTool(
  id: number,
  name: string,
  args: Record<string, unknown>,
  meta?: Record<string, unknown>,
): Promise<JsonRpc> {
  const params: Record<string, unknown> = { name, arguments: args };
  if (meta) params._meta = meta;
  const res = await post(
    { jsonrpc: "2.0", id, method: "tools/call", params },
    { "mcp-session-id": sid },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as JsonRpc;
}

function payloadOf(res: JsonRpc): Record<string, unknown> {
  const content = res.result?.content as
    Array<{ type: string; text: string }> | undefined;
  expect(Array.isArray(content)).toBe(true);
  return JSON.parse(content![0].text) as Record<string, unknown>;
}

async function pollSessionInfo(
  id: number,
): Promise<Record<string, unknown> | undefined> {
  const res = await callTool(id, "session_info", {});
  return payloadOf(res).asyncOperations as
    Record<string, Record<string, unknown>> | undefined;
}

describe("Spec 016 AC1: async acceptance returns promptly; outcome via session_info", () => {
  it("accepts a slow wrapped call in <1s and reports the terminal outcome via session_info", async () => {
    await init();
    const t0 = Date.now();
    const res = await callTool(
      2,
      "session_save",
      { name: "s016-fixture" },
      {
        async: true,
      },
    );
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1000);

    const acceptance = payloadOf(res);
    expect(acceptance.accepted).toBe(true);
    expect(typeof acceptance.operationId).toBe("string");

    const deadline = Date.now() + 15000;
    let ops: Record<string, Record<string, unknown>> | undefined;
    while (Date.now() < deadline) {
      ops = await pollSessionInfo(3);
      const rec = ops?.session_save;
      if (rec && rec.status !== "in_flight") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(ops?.session_save).toBeDefined();
    const rec = ops!.session_save!;
    expect(["succeeded", "failed"]).toContain(rec.status);
    expect(rec.result ?? rec.error).toBeDefined();
    expect(rec.operationId).toBe(acceptance.operationId);
  }, 30000);
});

describe("Spec 016 AC2: in-flight retry is idempotent (single flight)", () => {
  it("a second identical submit returns the in-flight state instead of a second execution", async () => {
    await init();
    const first = payloadOf(
      await callTool(
        10,
        "session_save",
        { name: "s016-retry" },
        {
          async: true,
        },
      ),
    );
    expect(first.accepted).toBe(true);

    const second = payloadOf(
      await callTool(
        11,
        "session_save",
        { name: "s016-retry" },
        {
          async: true,
        },
      ),
    );
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("operation_in_progress");
    expect(second.operationId).toBe(first.operationId);

    // A DIFFERENT payload in flight is flagged, not swallowed (F5).
    const other = payloadOf(
      await callTool(
        12,
        "session_save",
        { name: "s016-other" },
        {
          async: true,
        },
      ),
    );
    expect(other.accepted).toBe(false);
    expect(other.reason).toBe("operation_in_progress");
    expect(other.payloadMatches).toBe(false);

    const deadline = Date.now() + 15000;
    let rec: Record<string, unknown> | undefined;
    while (Date.now() < deadline) {
      const ops = await pollSessionInfo(13);
      rec = ops?.session_save;
      if (rec && rec.status !== "in_flight") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(rec?.status).toBe("succeeded");
    expect(rec?.operationId).toBe(first.operationId);
  }, 30000);
});

describe("Spec 016 FR-4/FR-10: opt-in, synchronous is the default", () => {
  it("without _meta.async and without the server default env, execution stays synchronous", async () => {
    await init();
    const res = await callTool(20, "session_save", { name: "s016-sync" });
    const payload = payloadOf(res);
    expect(payload.accepted).toBeUndefined();
    expect(payload.operationId).toBeUndefined();
    // Plain session_save result.
    expect(payload.saved).toBeDefined();
  });

  it("CLEAR_THOUGHT_ASYNC_ACCEPTANCE=1 makes the server default async; _meta.async=false overrides back to sync", async () => {
    await init();
    process.env.CLEAR_THOUGHT_ASYNC_ACCEPTANCE = "1";
    try {
      const auto = payloadOf(
        await callTool(21, "session_save", { name: "s016-envdef" }),
      );
      expect(auto.accepted).toBe(true);

      const override = payloadOf(
        await callTool(
          22,
          "session_save",
          { name: "s016-override" },
          {
            async: false,
          },
        ),
      );
      expect(override.accepted).toBeUndefined();
    } finally {
      delete process.env.CLEAR_THOUGHT_ASYNC_ACCEPTANCE;
    }
  }, 30000);
});

describe("Spec 016 FR-9: plain-JSON clients are unaffected", () => {
  it("a read tool without _meta returns the exact plain payload (no async keys)", async () => {
    await init();
    const res = await callTool(30, "session_info", {});
    const payload = payloadOf(res);
    expect(payload.accepted).toBeUndefined();
    expect(payload.asyncOperations).toBeUndefined();
    expect(payload.status).toBe("success");
  });
});
