/**
 * HD-3 regression: stateful downstream sessions over streamable HTTP.
 *
 * Replaces the manual live verification (insight/gitnexus at :3002/:4747)
 * with an in-process stateful MCP HTTP server using the REAL SDK server
 * transport (StreamableHTTPServerTransport with sessionIdGenerator), so
 * mcp-session-id issuance/propagation and per-session tool calls are
 * exercised through ClientManager exactly as in production (HTTP downstream
 * branch of transportFor).
 *
 * Known coverage boundary: the stub answers with plain JSON
 * (enableJsonResponse) — the SSE response variant of live servers is not
 * exercised here (tracked in the remaining-work-plan HD-3 entry).
 */
import { describe, expect, it, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ClientManager } from "../../src/mcp-client/ClientManager.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

interface StubState {
  sessions: Map<string, SessionEntry>;
  lastSessionHeader: string | null;
  notFoundCount: number;
  server: Server;
  url: string;
  resetSessions(): void;
}

let notFoundCount = 0;

function startStatefulMcpServer(): Promise<StubState> {
  const sessions = new Map<string, SessionEntry>();
  let lastSessionHeader: string | null = null;

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
      // stateful: issue a fresh session per initialize. The session id is
      // exposed on the transport AFTER the handshake (no onsessionid option
      // in this SDK version).
      const server = new McpServer({ name: "stateful-stub", version: "1.0.0" });
      server.tool("ping", "health check", {}, async () => ({ content: [{ type: "text", text: "pong" }] }));
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      const sid = transport.sessionId;
      if (sid) {
        sessions.set(sid, { transport, server });
        lastSessionHeader = sid;
      }
      return;
    }

    const entry = header ? sessions.get(header) : undefined;
    if (!entry) {
      // stateful servers reject unknown/expired sessions with 404
      notFoundCount++;
      res.writeHead(404).end();
      return;
    }
    try {
      await entry.transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("[stub] handleRequest(session) failed:", err);
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  const state: StubState = {
    sessions,
    get lastSessionHeader() {
      return lastSessionHeader;
    },
    server: httpServer,
    url: "",
    notFoundCount: 0,
    resetSessions() {
      sessions.clear();
      notFoundCount = 0;
    },
  };
  Object.defineProperty(state, "notFoundCount", {
    get: () => notFoundCount,
  });

  return new Promise<StubState>((resolveStub) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      state.url = `http://127.0.0.1:${port}/mcp`;
      resolveStub(state);
    });
  });
}

let stub: StubState;
let cleanup: (() => Promise<void>)[] = [];

async function bootManager(): Promise<ClientManager> {
  stub = await startStatefulMcpServer();
  const mgr = new ClientManager();
  mgr.useTransport("stateful", () => new StreamableHTTPClientTransport(new URL(stub.url)));
  cleanup = [
    async () => {
      await mgr.shutdown();
      await new Promise<void>((r) => stub.server.close(() => r()));
    },
  ];
  return mgr;
}

afterEach(async () => {
  for (const fn of cleanup) await fn();
  cleanup = [];
});

describe("ClientManager over stateful HTTP downstream (HD-3 regression)", () => {
  it("ensureReady issues a session and reaches ready via streamable HTTP", async () => {
    const mgr = await bootManager();
    const status = await mgr.ensureReady("stateful");
    expect(status.status).toBe("ready");
    expect(status.tools.map((t) => t.name)).toContain("ping");
  });

  it("invokeTool succeeds inside the session and the server sees the mcp-session-id header", async () => {
    const mgr = await bootManager();
    await mgr.ensureReady("stateful");
    const out = await mgr.invokeTool("stateful", "ping", {});
    expect(out.kind).toBe("success");
    expect(stub.lastSessionHeader).toMatch(/^.+-/); // issued session id, not null
    expect(stub.sessions.size).toBeGreaterThanOrEqual(1);
  });

  it("a lost server-side session is classified as a transport failure (no crash, no false tool_reported)", async () => {
    const mgr = await bootManager();
    await mgr.ensureReady("stateful");
    stub.resetSessions(); // server loses the session (restart simulation)
    const out = await mgr.invokeTool("stateful", "ping", {});
    expect(out.kind).toBe("transport"); // deterministic classification
    expect(stub.notFoundCount).toBeGreaterThanOrEqual(1); // the 404 came from the stateful stub
  });
});
