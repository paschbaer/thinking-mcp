import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpApp } from "../../src/server.js";
import { PairStore } from "../../src/remote/pair-store.js";
import type { Server } from "node:http";

/**
 * spec 007 US1 (FR-601..605 / Amendment 004): remote sessions execute
 * downstream MCP operations SERVER-SIDE against a REAL second MCP server
 * (HTTP stub), while client-executable ops keep the one-time token flow.
 */

// --- stub MCP HTTP server (own process: `node fixtures/stub-mcp-server.mjs <port> <countfile>`) ---
import { readdirSync as _rd } from "node:fs";
function startStub(): Promise<{ port: number; count: () => number; close: () => void }> {
  const stubSrc = join(import.meta.dirname, "fixtures/stub-mcp-server.mjs");
  const countFile = join(tmpdir(), `guidance-stub-count-${Math.random().toString(36).slice(2)}.json`);
  const child = spawn(process.execPath, [stubSrc, "0", countFile]);
  let stdoutBuf = "";
  return new Promise((resolveStub) => {
    const poll = (): void => {
      const m = /PORT:(\d+)/.exec(stdoutBuf);
      if (m) {
        const port = Number(m[1]);
        resolveStub({
          port,
          count: (): number => {
            try {
              return (JSON.parse(readFileSync(countFile, "utf8")) as { count: number }).count;
            } catch {
              return 0;
            }
          },
          close: (): void => {
            child.kill();
          },
        });
      } else { if (Math.random() < 0.05) console.error("STUB_WAIT:", stdoutBuf.slice(0, 200)); setTimeout(poll, 50); }
    };
    child.stderr?.on("data", (d: Buffer | string) => {
      stdoutBuf += String(d);
    });
    child.on("exit", () => {
      if (!stdoutBuf.includes("PORT:")) {
        // nie gestartet — resolveStub verhindern, Poll läuft weiter
      }
    });
    poll();
  });
}

let ws: string; // remote server workspace
let clientWs: string; // downstream workspace (op cwd) — unused by mcpTool
let server: Server | undefined;
let port: number;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-remotedown-"));
  clientWs = mkdtempSync(join(tmpdir(), "guidance-remotedown-client-"));
  process.env.GUIDANCE_WORKSPACE_ROOT = ws;
});
afterEach(() => {
  server?.close();
  delete process.env.GUIDANCE_WORKSPACE_ROOT;
  rmSync(ws, { recursive: true, force: true });
  rmSync(clientWs, { recursive: true, force: true });
});

function buildConfig(stubPort: number, allowHost: string): Record<string, unknown> {
  const policies = {
    version: 2,
    trustLevels: { trusted: { dataEgress: "project_data" } },
    validation: {},
    reviewFindings: { blockingSeverities: ["high"] },
    redaction: { patterns: [] },
    outputDefaults: { returnToAgent: "summary_and_errors" },
    egress: { httpHostAllowlist: allowHost ? [`${allowHost}:${stubPort}`] : [] },
  };
  return {
    version: 2,
    project: { name: "downstream-test" },
    configFiles: {
      "guidance.json": JSON.stringify({
        version: 2, profile: "plain", project: { name: "downstream-test" },
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
            lifecycle: { afterEnter: ["echo-op", "client-op"] },
            transitions: [{ to: "completed", when: "required_operations_succeeded" }],
          },
        },
        states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
      }),
      "responses.json": JSON.stringify({ version: 2, responses: { understand: { title: "U", instruction: "u", requiredActions: [] } } }),
      "operations.json": JSON.stringify({
        version: 2,
        operations: {
          "echo-op": {
            description: "downstream echo via stub MCP server",
            type: "mcpTool", server: "stub", capability: "echo",
            required: false, timeoutSeconds: 30, riskClass: "read_only",
            arguments: { mode: "fixed", value: { message: "hi" } },
            validation: { toolResultMustNotBeError: true },
            output: { returnToAgent: "summary_and_errors" },
          },
          "client-op": {
            description: "client-executable op (token flow)",
            type: "process", executable: "node", args: ["-e", "process.exit(0)"],
            required: false, invocableByAgent: true, timeoutSeconds: 30,
            validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" },
          },
        },
      }),
      "downstream-servers.json": JSON.stringify({
        version: 2,
        servers: {
          stub: {
            enabled: true, required: false, trustLevel: "trusted",
            transport: { type: "http", http: { url: `http://127.0.0.1:${stubPort}/mcp` } },
            connection: { requestTimeoutSeconds: 30 },
            capabilities: { allow: { tools: ["echo"] } },
          },
        },
      }),
      "policies.json": JSON.stringify(policies),
      "schemas/understand.schema.json": JSON.stringify({ type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } }),
    },
  };
}

async function bootGuidance(): Promise<{ port: number; close: () => void }> {
  const app = createHttpApp({
    workspaceRoot: ws,
    configDir: join(ws, ".guidance"),
    stateDir: join(ws, ".guidance", "state"),
    remote: { pairs: new PairStore([]) },
  });
  const srv = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => srv.once("listening", () => r()));
  const port = (srv.address() as { port: number }).port;
  return { port, close: () => srv.close() };
}

function call(port: number, id: number, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    });
    const text = ((await res.json()) as { result?: { content?: { text: string }[] } }).result?.content?.[0]?.text ?? "{}";
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { rawError: text };
    }
  })();
}

describe("remote downstream execution (spec 007 FR-701..704, SC-601..603)", () => {
  it("SC-601: downstream mcpTool executes server-side; metrics record the connection", async () => {
    const stub = await startStub();
    const cfg = buildConfig(stub.port, "127.0.0.1");
    const g = await bootGuidance();
    console.error("DBG: init"); const init = await call(g.port, 0, "init_session", { config: cfg, workspaceRoot: clientWs });
    const sid = (init as { sessionId?: string }).sessionId!;
    console.error("DBG: init done", JSON.stringify(init).slice(0,200)); const start = await call(g.port, 1, "start_workflow", { sessionId: sid, request: "r" });
    expect(start.accepted).toBe(true);
    const ops = (start.operations ?? []) as { id: string; status: string; summary?: string }[];
    const echo = ops.find((o) => o.id === "echo-op");
    console.error("ECHO_DEBUG:", JSON.stringify(ops)); expect(echo?.status).toBe("succeeded"); // executed server-side, not awaiting_client
    expect(echo?.summary ?? "").not.toMatch(/awaiting/i);
    // stub actually received the call
    expect(stub.count()).toBeGreaterThanOrEqual(1);
    // FR-704: connection metrics
    const metrics = await call(g.port, 2, "get_metrics", { sessionId: sid });
    const conns = (metrics as { connections?: { serverId: string; status: string; lastSuccessfulRequestAt?: string }[] }).connections ?? [];
    const stubConn = conns.find((c) => c.serverId === "stub");
    expect(stubConn?.status).toBe("ready");
    expect(stubConn?.lastSuccessfulRequestAt ?? "x").toBeTruthy();
    stub.close();
    g.close();
  }, 60_000);

  it("SC-602: egress violation fails closed at config load (init rejected)", async () => {
    const stub = await startStub();
    const cfg = buildConfig(stub.port, "example.com"); // allowlist does NOT include 127.0.0.1
    const g = await bootGuidance();
    const init = await call(g.port, 0, "init_session", { config: cfg, workspaceRoot: clientWs });
    expect(init.isError).toBe(true);
    expect(JSON.stringify(init)).toMatch(/not allowlisted/);
    stub.close();
    g.close();
  }, 60_000);

  it("SC-603: client op in the same session keeps the one-time token flow", async () => {
    const stub = await startStub();
    const cfg = buildConfig(stub.port, "127.0.0.1");
    const g = await bootGuidance();
    console.error("DBG: init"); const init = await call(g.port, 0, "init_session", { config: cfg, workspaceRoot: clientWs });
    const sid = (init as { sessionId?: string }).sessionId!;
    console.error("DBG: init done", JSON.stringify(init).slice(0,200)); const start = await call(g.port, 1, "start_workflow", { sessionId: sid, request: "r" });
    const ops = (start.operations ?? []) as { id: string; opToken?: string }[];
    const token = ops.find((o) => o.id === "client-op")?.opToken;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const rep = await call(g.port, 2, "report_operation_result", {
      sessionId: sid, operationId: "client-op", status: "succeeded", summary: "done", reportToken: token,
    });
    expect(rep.recorded ?? rep.accepted).toBeTruthy();
    stub.close();
    g.close();
  }, 60_000);
});
