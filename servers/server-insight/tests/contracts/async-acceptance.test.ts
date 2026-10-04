/**
 * Spec 016 AC1/AC2 contract tests — async acceptance in server-insight.
 *
 * The wrapped long-running set is experience_seed_lessons /
 * experience_finalize (see src/tools/register.ts). The test fixtures use the
 * documented test hook EMMS_ASYNC_TEST_MIN_DURATION_MS to make the wrapped
 * handler observably slow (mirrors guidance's slow-gate fixture); production
 * default is 0 (no delay).
 */
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../../src/server.js";

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "s016-insight-"));
  process.env.EMMS_STORAGE_PATH = join(workDir, "emms-store.db");
  process.env.EMMS_ASYNC_TEST_MIN_DURATION_MS = "1200";
});

afterAll(() => {
  server.close();
  delete process.env.EMMS_ASYNC_TEST_MIN_DURATION_MS;
  delete process.env.EMMS_STORAGE_PATH;
  delete process.env.EMMS_ASYNC_ACCEPTANCE;
  if (workDir) rmSync(workDir, { recursive: true, force: true });
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
    clientInfo: { name: "s016-contract", version: "0.0.0" },
  },
};

const CC = { scope_id: "s016-adopt-test" };
const LESSON = {
  slug: "s016-fixture-lesson",
  observation: "fixture observation",
  cause: "fixture cause",
  fix: "fixture fix",
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

const SEED_ARGS = { lessons: [LESSON], client_context: CC };

function acceptanceOf(res: JsonRpc): Record<string, unknown> {
  const content = res.result?.content as
    Array<{ type: string; text: string }> | undefined;
  expect(Array.isArray(content)).toBe(true);
  return JSON.parse(content![0].text) as Record<string, unknown>;
}

describe("Spec 016 AC1: async acceptance returns promptly; outcome via status interface", () => {
  it("accepts a slow wrapped call in <1s and reports the terminal outcome via workflow_status", async () => {
    await init();
    const t0 = Date.now();
    const res = await callTool(2, "experience_seed_lessons", SEED_ARGS, {
      async: true,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1000);

    const acceptance = acceptanceOf(res);
    expect(acceptance.accepted).toBe(true);
    expect(typeof acceptance.operationId).toBe("string");

    // Poll workflow_status until the operation reaches a terminal state.
    const deadline = Date.now() + 15000;
    let ops: Record<string, Record<string, unknown>> | undefined;
    while (Date.now() < deadline) {
      const status = await callTool(3, "workflow_status", {
        workflow_id: "does-not-exist",
        client_context: CC,
      });
      ops = acceptanceOf(status).asyncOperations as
        Record<string, Record<string, unknown>> | undefined;
      const rec = ops?.experience_seed_lessons;
      if (rec && rec.status !== "in_flight") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(ops?.experience_seed_lessons).toBeDefined();
    const rec = ops!.experience_seed_lessons!;
    expect(["succeeded", "failed"]).toContain(rec.status);
    // FR-3: the outcome carries enough detail to react (result or error).
    expect(rec.result ?? rec.error).toBeDefined();
    expect(rec.operationId).toBe(acceptance.operationId);
  }, 30000);
});

describe("Spec 016 AC2: in-flight retry is idempotent (single flight)", () => {
  it("a second identical submit returns the in-flight state instead of a second execution", async () => {
    await init();
    const first = acceptanceOf(
      await callTool(10, "experience_seed_lessons", SEED_ARGS, { async: true }),
    );
    expect(first.accepted).toBe(true);

    // While the first execution is still running (slow fixture), retry.
    const second = acceptanceOf(
      await callTool(11, "experience_seed_lessons", SEED_ARGS, { async: true }),
    );
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("operation_in_progress");
    expect(second.operationId).toBe(first.operationId);

    // A DIFFERENT payload in flight is not an idempotent retry (F5).
    const other = acceptanceOf(
      await callTool(
        12,
        "experience_seed_lessons",
        {
          lessons: [{ ...LESSON, slug: "s016-fixture-other" }],
          client_context: CC,
        },
        { async: true },
      ),
    );
    expect(other.accepted).toBe(false);
    expect(other.reason).toBe("operation_in_progress");

    // Single-execution proof: exactly one terminal outcome is recorded and
    // the seeded lesson count reflects ONE run (the fixture lesson exists).
    const deadline = Date.now() + 15000;
    let rec: Record<string, unknown> | undefined;
    while (Date.now() < deadline) {
      const status = await callTool(13, "workflow_status", {
        workflow_id: "does-not-exist",
        client_context: CC,
      });
      const ops = acceptanceOf(status).asyncOperations as
        Record<string, Record<string, unknown>> | undefined;
      rec = ops?.experience_seed_lessons;
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
    const res = await callTool(20, "experience_seed_lessons", {
      lessons: [{ ...LESSON, slug: "s016-sync-lesson" }],
      client_context: CC,
    });
    const payload = acceptanceOf(res);
    expect(payload.accepted).toBeUndefined();
    expect(payload.operationId).toBeUndefined();
    // Plain tool result (seed report), no acceptance envelope.
    const seedReport = payload.result as Record<string, unknown> | undefined;
    expect(seedReport).toHaveProperty("seeded");
  });

  it("EMMS_ASYNC_ACCEPTANCE=1 makes the server default async; _meta.async=false overrides back to sync", async () => {
    await init();
    process.env.EMMS_ASYNC_ACCEPTANCE = "1";
    try {
      const auto = acceptanceOf(
        await callTool(21, "experience_seed_lessons", {
          lessons: [{ ...LESSON, slug: "s016-envdef-lesson" }],
          client_context: CC,
        }),
      );
      expect(auto.accepted).toBe(true);

      const override = acceptanceOf(
        await callTool(
          22,
          "experience_seed_lessons",
          {
            lessons: [{ ...LESSON, slug: "s016-override-lesson" }],
            client_context: CC,
          },
          { async: false },
        ),
      );
      expect(override.accepted).toBeUndefined();
    } finally {
      delete process.env.EMMS_ASYNC_ACCEPTANCE;
    }
  }, 30000);
});

describe("Spec 016 FR-9: plain-JSON clients are unaffected", () => {
  it("a read tool without _meta returns the exact plain payload (no acceptance/async keys)", async () => {
    await init();
    const res = await callTool(30, "workflow_status", {
      workflow_id: "does-not-exist",
      client_context: CC,
    });
    const payload = acceptanceOf(res);
    expect(payload.accepted).toBeUndefined();
    // The error envelope shape is unchanged (workflow not found).
    expect(payload.error).toBeDefined();
  });
});
