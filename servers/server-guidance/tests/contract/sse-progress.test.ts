/**
 * Spec 016 contract test — Stufe 3 SSE progress (AC3, FR-5..FR-8).
 *
 * A client sending Accept: text/event-stream + _meta.progressToken for a
 * long-running call receives: >=1 notifications/progress per gate, a terminal
 * result event, keepalive comment frames during silence, and no credential
 * material anywhere in the stream.
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
  ws = mkdtempSync(join(tmpdir(), "guidance-sse-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
  // Short keepalive so the test observes a frame during the gate's silence.
  process.env.GUIDANCE_SSE_KEEP_ALIVE_MS = "300";
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
  delete process.env.GUIDANCE_SSE_KEEP_ALIVE_MS;
  rmSync(ws, { recursive: true, force: true });
});

interface SseResult {
  stream: ReadableStream<Uint8Array> | null;
  contentType: string;
}

async function postSse(
  port: number,
  body: Record<string, unknown>,
): Promise<SseResult> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Streamable HTTP requires both accept types on every POST; the SSE
      // upgrade keys on the progressToken opt-in, not on Accept alone.
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  return {
    stream: res.body,
    contentType: res.headers.get("content-type") ?? "",
  };
}

/** Reads the SSE stream until the stream closes or the deadline passes. */
async function readStream(
  stream: ReadableStream<Uint8Array>,
  deadlineMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + deadlineMs;
  try {
    while (Date.now() < deadline) {
      const timer = new Promise<null>((r) => setTimeout(r, deadline - Date.now()));
      const chunk = await Promise.race([reader.read(), timer]);
      if (!chunk || chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      // Terminal JSON-RPC response arrived — stop reading.
      if (text.includes('"result"') && text.includes('"content"')) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

describe("spec 016 — SSE progress (Stufe 3)", () => {
  it("AC3: progress per gate, terminal event, keepalives, no credential material", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const start = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "start_workflow",
          arguments: { workspaceRoot: ws, request: "spec-016-sse-contract" },
        },
      }),
    });
    const startPayload = JSON.parse(
      ((await start.json()) as { result?: { content?: { text: string }[] } })
        .result?.content?.[0]?.text ?? "{}",
    ) as { sessionId: string };
    const sessionId = startPayload.sessionId;

    const { stream, contentType } = await postSse(port, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "submit_understanding",
        arguments: { sessionId, summary: "sse progress contract" },
        _meta: { progressToken: 42 },
      },
    });
    expect(contentType).toContain("text/event-stream");

    const raw = await readStream(stream!, 15_000);

    // FR-6: progress notifications for the gate (started + terminal outcome),
    // bound to the client's progressToken.
    const progressMatches = raw.match(/notifications\/progress/g) ?? [];
    expect(progressMatches.length).toBeGreaterThanOrEqual(2);
    expect(raw).toContain('"progressToken":42');
    expect(raw).toContain("slow-gate");

    // Terminal JSON-RPC result event on the same stream (result payload is
    // embedded as escaped JSON inside the content text).
    expect(raw).toContain('"result"');
    expect(raw).toContain("currentPhase");
    expect(raw).toContain("plan");

    // FR-7: keepalive comment frames during silence.
    expect(raw).toContain(": keepalive");

    // FR-8: no credential material in the stream.
    expect(raw.toLowerCase()).not.toContain("bearer");
    expect(raw.toLowerCase()).not.toContain("token=");
    expect(raw).not.toContain("GUIDANCE_AUTH_TOKEN");
  }, 30_000);

  it("FR-9: clients accepting both JSON and SSE keep the plain-JSON response as before", async () => {
    const { port } = await startHttpServer("127.0.0.1", 0);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { result?: { tools?: unknown[] } };
    expect(body.result?.tools?.length).toBeGreaterThan(0);
  }, 30_000);
});
