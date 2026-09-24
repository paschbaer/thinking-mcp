/**
 * HTTP transport entry: MCP streamable HTTP (stateful sessions) at /mcp,
 * implemented directly on the official MCP SDK's StreamableHTTPServerTransport.
 *
 * Replaces the former @smithery/sdk createStatefulServer wrapper (removed
 * dependency + no more sed-patch of the Smithery SDK in the Dockerfile).
 * Session semantics: one McpServer + transport per MCP session, keyed by the
 * `mcp-session-id` header.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import createExperienceMemoryServer from './index.js';
import { ServerConfigSchema, resolveConfig, type ServerConfig } from './config.js';

interface HttpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  /** Epoch ms of last request — used by the idle-session reaper. */
  lastSeen: number;
  /** Wire session id once the client initializes (set via onsessioninitialized). */
  sessionId?: string;
}

/** Session registry — populated via onsessioninitialized. */
const sessions = new Map<string, HttpSession>();

// CB-20 (Decision 2): optional bearer auth — if EMMS_AUTH_TOKEN is set, /mcp
// requires `Authorization: Bearer <token>` (timing-safe via constant-length
// digests, same pattern as guidance). Unset ⇒ open (loopback default bind).
const requireBearer = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.EMMS_AUTH_TOKEN;
  if (!expected) return next();
  const provided = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
};

/** Resolve server config from the environment (EMMS_STORAGE_PATH etc.). */
function resolveEnvConfig(): ServerConfig {
  return ServerConfigSchema.parse(resolveConfig());
}

/** Create a fresh McpServer + transport pair (one per MCP session). */
function createSession(): HttpSession {
  const server = createExperienceMemoryServer({ config: resolveEnvConfig() });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id: string) => {
      session.sessionId = id;
      sessions.set(id, session);
    },
  });
  transport.onclose = () => {
    if (session.sessionId) sessions.delete(session.sessionId);
  };
  const session: HttpSession = { server, transport, lastSeen: Date.now() };
  return session;
}


// --- Session hygiene (review HIGH-2): bound in-memory session growth. ---
const IDLE_SESSION_TTL_MS = 3600000;
const MAX_SESSIONS = 500;

/** Close + drop sessions idle longer than the TTL; also evict oldest beyond MAX_SESSIONS. */
function sweepSessions(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > IDLE_SESSION_TTL_MS) {
      sessions.delete(id);
      void s.transport.close().catch(() => undefined);
      void s.server.close().catch(() => undefined);
    }
  }
  while (sessions.size > MAX_SESSIONS) {
    let oldestId: string | undefined;
    let oldest = Infinity;
    for (const [id, s] of sessions) {
      if (s.lastSeen < oldest) { oldest = s.lastSeen; oldestId = id; }
    }
    if (!oldestId) break;
    const victim = sessions.get(oldestId);
    sessions.delete(oldestId);
    void victim?.transport.close().catch(() => undefined);
    void victim?.server.close().catch(() => undefined);
  }
}
const sweepTimer = setInterval(sweepSessions, 5 * 60_000);
sweepTimer.unref();

// Express app with the MCP streamable transport mounted at /mcp.
// Exported so tests can bind it to an ephemeral port.
export const app = express();

app.post('/mcp', express.json({ limit: '10mb' }), requireBearer, async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    const known = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    if (known) known.lastSeen = Date.now();
    // CB-3 hardening: without a known session id, only a genuine initialize
    // request may create a server+transport. Garbage/batch/non-initialize POSTs
    // previously created reaper-invisible orphan instances per request.
    if (!known && !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request: initialize required (no valid mcp-session-id header)' },
        id: null,
      });
      return;
    }
    const session = known ?? createSession();
    if (!known) {
      // Covers initialize (no session id yet): a fresh server instance with
      // its own SessionState.
      await session.server.connect(session.transport);
    }
    await session.transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      console.error('MCP endpoint error:', err);
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// GET (SSE stream) and DELETE (session termination) require a known session.
const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'unknown or missing MCP session id' },
      id: null,
    });
    return;
  }
  await session.transport.handleRequest(req, res, req.body);
};

app.get('/mcp', requireBearer, (req: Request, res: Response) => { void handleSessionRequest(req, res); });
app.delete('/mcp', requireBearer, (req: Request, res: Response) => { void handleSessionRequest(req, res); });

// Add health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'experience-memory-mcp',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return _next(err);
  // 1caa690(a): body-parser failures are client errors — 400/-32700 instead of 500.
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });
    return;
  }
  console.error('Server error:', err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? message : undefined,
  });
});

/** Close all live MCP sessions (used on shutdown). */
export async function closeAllSessions(): Promise<void> {
  for (const [, s] of sessions) {
    try {
      await s.transport.close();
      await s.server.close();
    } catch {
      // best-effort shutdown
    }
  }
  sessions.clear();
}

function startServer(): void {
  // Number(): env vars are strings; listen(port, host) requires a numeric port
  // (TS2769 under the 2-arg overload — masked before the host arg was added).
  const PORT = Number(process.env.PORT) || 3002;
  // Default-sicher: nur localhost binden. Der Docker-Container setzt
  // EMMS_BIND_HOST=0.0.0.0, damit das Port-Mapping (3002:3002) erreichbar ist.
  const HOST = process.env.EMMS_BIND_HOST || '127.0.0.1';

  const server = app.listen(PORT, HOST, () => {
    console.log(`Experience Memory MCP server running on ${HOST}:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
  });

  const shutdown = () => {
    clearInterval(sweepTimer);
    void closeAllSessions();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Only start when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
