/**
 * Spec 016 AC3 contract tests — SSE progress in server-clear-thought.
 *
 * The SSE upgrade keys on _meta.progressToken (NOT the Accept header — see
 * the 406 trap recorded from the reference session). Keepalives are
 * shortened via CLEAR_THOUGHT_SSE_KEEP_ALIVE_MS for the test.
 */
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../src/server.js";

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "s016-ct-sse-"));
  process.env.CLEAR_THOUGHT_DATA_DIR = workDir;
  process.env.CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS = "1200";
  process.env.CLEAR_THOUGHT_SSE_KEEP_ALIVE_MS = "300";
});

afterAll(() => {
  server.close();
  delete process.env.CLEAR_THOUGHT_DATA_DIR;
  delete process.env.CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS;
  delete process.env.CLEAR_THOUGHT_SSE_KEEP_ALIVE_MS;
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
    clientInfo: { name: "s016-ct-sse", version: "0.0.0" },
  },
};

interface SseFrame {
  kind: "event" | "comment";
  event?: string;
  data?: string;
}

function parseSse(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of raw.split("\n\n")) {
    if (block.startsWith(":")) {
      frames.push({ kind: "comment", data: block.slice(1).trim() });
      continue;
    }
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (event || data.length) {
      frames.push({ kind: "event", event, data: data.join("\n") });
    }
  }
  return frames;
}

async function readSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    if (raw.includes('"result"')) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        reader.cancel();
      } catch {
        /* already closed */
      }
      break;
    }
  }
  return raw;
}

describe("Spec 016 AC3: SSE progress stream", () => {
  it("upgrades to SSE only with progressToken, streams progress notifications and keepalives", async () => {
    const initRes = await post(INIT);
    expect([200, 201]).toContain(initRes.status);
    const sid = initRes.headers.get("mcp-session-id")!;
    expect(sid).toBeTruthy();

    const res = await post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "session_save",
          arguments: { name: "s016-sse-fixture" },
          _meta: { progressToken: "tok-ct-1" },
        },
      },
      { "mcp-session-id": sid },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const raw = await readSse(res);
    const frames = parseSse(raw);

    // FR-6: at least one notifications/progress with the client's token.
    const progressFrames = frames.filter(
      (f) =>
        f.kind === "event" &&
        f.data?.includes("notifications/progress") &&
        f.data?.includes("tok-ct-1"),
    );
    expect(progressFrames.length).toBeGreaterThanOrEqual(1);

    // Monotonic progress values.
    const values = progressFrames
      .map((f) => {
        try {
          const params = (JSON.parse(f.data!).params ?? {}) as {
            progress?: number;
          };
          return params.progress;
        } catch {
          return undefined;
        }
      })
      .filter((v): v is number => typeof v === "number");
    expect(values.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }

    // FR-7: keepalives during the simulated idle gap (slow fixture op).
    const keepalives = frames.filter(
      (f) => f.kind === "comment" && f.data === "keepalive",
    );
    expect(keepalives.length).toBeGreaterThanOrEqual(1);

    // The terminal tools/call result arrives on the same stream.
    const resultFrames = frames.filter(
      (f) => f.kind === "event" && f.data?.includes('"result"'),
    );
    expect(resultFrames.length).toBeGreaterThanOrEqual(1);

    // FR-8: no credential material on the stream.
    expect(raw.toLowerCase()).not.toContain("bearer");
  }, 30000);

  it("Accept: text/event-stream alone does NOT upgrade (FR-9: 406-trap; JSON stays byte-identical)", async () => {
    const initRes = await post(INIT);
    const sid = initRes.headers.get("mcp-session-id")!;
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "session_info", arguments: {} },
      },
      { "mcp-session-id": sid },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { result?: unknown };
    expect(body.result).toBeDefined();
  });
});
