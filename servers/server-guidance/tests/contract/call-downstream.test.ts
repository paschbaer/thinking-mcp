/**
 * CT-ARGS-1: agent-supplied downstream tool arguments.
 *
 * (1) call_downstream — transparent, session-routed passthrough to a
 *     configured downstream server's tool, routed through the SAME gated
 *     invoker closure as operations (WC-1 allowlist, WC-1-B
 *     unconfigured-wildcard rejection, FR-053 egress via riskClass).
 * (2) run_operation gains an optional `arguments` record that is deep-merged
 *     OVER the operation's fixed/template-resolved arguments (agent keys win
 *     per-key); operations with argumentsLocked reject overrides.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

// ---- in-process stateful MCP HTTP stub (pattern: client-manager-http-stateful) ----

interface StubState {
  server: ReturnType<typeof createServer>;
  url: string;
}

function startEchoMcpServer(): Promise<StubState> {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    const bodyText: string = await new Promise((resolveBody, rejectBody) => {
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
      req.on("error", rejectBody);
    });
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      res.writeHead(400).end();
      return;
    }

    const header = (req.headers["mcp-session-id"] as string | undefined) ?? null;
    const method = (body as { method?: string }).method;

    if (method === "initialize" || !header) {
      const server = new McpServer({ name: "ct-args-stub", version: "1.0.0" });
      server.tool(
        "echo",
        "echoes the message",
        { message: z.string().optional() },
        async (args) => ({
          content: [{ type: "text", text: `echo:${(args as { message?: string }).message ?? ""}` }],
        }),
      );
      server.tool("ping", "no-args health check", {}, async () => ({
        content: [{ type: "text", text: "pong" }],
      }));
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      const sid = transport.sessionId;
      if (sid) sessions.set(sid, { transport, server });
      return;
    }

    const entry = header ? sessions.get(header) : undefined;
    if (!entry) {
      res.writeHead(404).end();
      return;
    }
    try {
      await entry.transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  return new Promise<StubState>((resolveStub) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveStub({
        server: httpServer,
        url: `http://127.0.0.1:${port}/mcp`,
      });
    });
  });
}

// ---- engine harness ----

let ws: string;
let stateDir: string;
let configDir: string;
let stub: StubState | undefined;

interface ServerCfg {
  allowTools: string[];
  url?: string;
}

function seedWorkspace(servers: Record<string, ServerCfg>, operations: Record<string, unknown>): void {
  ws = mkdtempSync(join(tmpdir(), "guidance-ctargs-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }

  const serversOut: Record<string, unknown> = {};
  for (const [id, cfg] of Object.entries(servers)) {
    serversOut[id] = {
      displayName: id,
      enabled: true,
      required: false,
      trustLevel: "trusted",
      transport: { type: "http", http: { url: cfg.url } },
      capabilities: { allow: { tools: cfg.allowTools, resources: [], prompts: [] } },
      connection: { requestTimeoutSeconds: 5 },
    };
  }
  writeFileSync(
    join(configDir, "downstream-servers.json"),
    JSON.stringify({ version: 2, servers: serversOut }, null, 2),
  );
  const firstUrl = Object.values(servers)[0]!.url!;
  const host = new URL(firstUrl).host;
  writeFileSync(
    join(configDir, "policies.json"),
    JSON.stringify(
      {
        version: 2,
        trustLevels: { trusted: { dataEgress: "project_data" } },
        egress: { httpHostAllowlist: [host] },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(configDir, "operations.json"),
    JSON.stringify(
      {
        version: 2,
        operations: {
          // keep the fixture's lifecycle ops (workflow.json hooks reference
          // query-project-insights etc.) so session activation succeeds
          ...((JSON.parse(
            readFileSync(join(FIXTURE, "operations.json"), "utf-8"),
          ) as { operations: Record<string, unknown> }).operations),
          ...operations,
        },
      },
      null,
      2,
    ),
  );
  // guidance.json must reference the operations file (fixture default may
  // already do so — force it to be safe).
  const guidance = JSON.parse(readFileSync(join(configDir, "guidance.json"), "utf-8")) as Record<string, unknown>;
  guidance.operations = { file: "operations.json" };
  writeFileSync(join(configDir, "guidance.json"), JSON.stringify(guidance, null, 2));
}

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine({ config: loadConfig(configDir), stateDir });
}

async function startSession(engine: WorkflowEngine) {
  return engine.startWorkflow({ workspaceRoot: ws, request: "r" });
}

beforeEach(async () => {
  stub = await startEchoMcpServer();
});

afterEach(async () => {
  await new Promise<void>((r) => (stub ? stub.server.close(() => r()) : r()));
  if (ws) rmSync(ws, { recursive: true, force: true });
});

describe("call_downstream: gated passthrough (CT-ARGS-1)", () => {
  it("invokes a configured downstream tool with agent arguments (success)", async () => {
    seedWorkspace(
      { stub: { allowTools: ["*"], url: stub!.url } },
      {
        "stub-echo": {
          type: "mcpTool",
          server: "stub",
          capability: "echo",
          required: false,
          riskClass: "read_only",
        },
      },
    );
    const engine = makeEngine();
    const start = await startSession(engine);
    const res = await engine.callDownstream(start.sessionId, "stub", "echo", { message: "hi" });
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("echo:hi");
  });

  it("denies an unconfigured downstream server (fail-closed, no network)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, {});
    const engine = makeEngine();
    const start = await startSession(engine);
    await expect(
      engine.callDownstream(start.sessionId, "nope", "echo", {}),
    ).rejects.toMatchObject({ code: "downstream_server_not_configured" });
  });

  it("denies a tool outside the explicit allowlist (WC-1)", async () => {
    seedWorkspace({ stub: { allowTools: ["ping"], url: stub!.url } }, {});
    const engine = makeEngine();
    const start = await startSession(engine);
    await expect(
      engine.callDownstream(start.sessionId, "stub", "echo", { message: "x" }),
    ).rejects.toMatchObject({ code: "downstream_capability_not_allowed" });
  });

  it("denies an unconfigured tool on a wildcard server (WC-1-B)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, {});
    const engine = makeEngine();
    const start = await startSession(engine);
    await expect(
      engine.callDownstream(start.sessionId, "stub", "ghost", {}),
    ).rejects.toMatchObject({ code: "authorization_required" });
  });

  it("routes a workspace (child-engine) session like run_operation", async () => {
    seedWorkspace(
      { stub: { allowTools: ["*"], url: stub!.url } },
      {
        "stub-echo": {
          type: "mcpTool",
          server: "stub",
          capability: "echo",
          required: false,
          riskClass: "read_only",
        },
      },
    );
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // same session, no explicit re-route — routedFor delegates internally
    const res = await engine.callDownstream(start.sessionId, "stub", "echo", { message: "routed" });
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("echo:routed");
  });
});

describe("run_operation arguments override (CT-ARGS-1)", () => {
  const baseOps = (): Record<string, unknown> => ({
    "ct-op": {
      type: "mcpTool",
      server: "stub",
      capability: "echo",
      invocableByAgent: true,
      required: false,
      riskClass: "read_only",
      arguments: { mode: "fixed", value: { message: "from-op" } },
    },
    "locked-op": {
      type: "mcpTool",
      server: "stub",
      capability: "echo",
      invocableByAgent: true,
      required: false,
      riskClass: "read_only",
      arguments: { mode: "fixed", value: { message: "pinned" } },
      argumentsLocked: true,
    },
  });

  it("uses operation-defined arguments when no override is given (backwards compat)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, baseOps());
    const engine = makeEngine();
    const start = await startSession(engine);
    const res = await engine.runOperation(start.sessionId, "ct-op");
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("echo:from-op");
  });

  it("deep-merges agent overrides over operation arguments (agent keys win)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, baseOps());
    const engine = makeEngine();
    const start = await startSession(engine);
    const res = await engine.runOperation(start.sessionId, "ct-op", {
      message: "from-agent",
    });
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("echo:from-agent");
    expect(JSON.stringify(res.content)).not.toContain("from-op");
  });

  it("rejects overrides for argumentsLocked operations (fail-closed)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, baseOps());
    const engine = makeEngine();
    const start = await startSession(engine);
    const res = await engine.runOperation(start.sessionId, "locked-op", {
      message: "spoof",
    });
    expect(res.status).toBe("failed");
    expect(JSON.stringify(res)).toContain("argumentsLocked");
  });

  it("process operations ignore overrides with a warning (no argv injection)", async () => {
    seedWorkspace({ stub: { allowTools: ["*"], url: stub!.url } }, {
      "proc-op": {
        type: "process",
        executable: "node",
        args: ["-e", "console.log('hi')"],
        required: false,
        invocableByAgent: true,
        timeoutSeconds: 10,
        validation: { exitCodeMustBeZero: true },
      },
    });
    const engine = makeEngine();
    const start = await startSession(engine);
    const res = await engine.runOperation(start.sessionId, "proc-op", {
      args: ["-e", "console.log('PWNED')"],
    });
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res)).not.toContain("PWNED");
    expect(JSON.stringify(res.warnings ?? [])).toContain("argument_overrides_ignored");
  });
});
