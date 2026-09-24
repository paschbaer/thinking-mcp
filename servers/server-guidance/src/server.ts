/**
 * HTTP transport entry (FR-027): loopback-only binding by default.
 * A non-loopback host MUST fail at startup (fail-closed) — unless the operator
 * sets GUIDANCE_BIND_HOST explicitly (Docker port-mapping opt-in, insight-
 * pattern EMMS_BIND_HOST).
 *
 * MCP endpoint: POST /mcp (streamable HTTP, stateless mode).
 * Auth: optional — if GUIDANCE_AUTH_TOKEN is set, /mcp requires
 * `Authorization: Bearer <token>`.
 */
import express from "express";
import { join } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { GuidanceError } from "./types/errors.js";
import { existsSync } from "node:fs";
import { createGuidanceServer } from "./mcp-server/GuidanceServer.js";
import { registerWorkflowTools } from "./mcp-server/register-tools.js";
import { registerSpecKitTools, toEngineSpecKitConfig } from "./mcp-server/register-spec-kit-tools.js";
import { composeApplication, ensureConfiguration } from "./main.js";
import { PairStore, loadPairsFromEnv } from "./remote/pair-store.js";
import { RemoteSessionManager } from "./remote/remote-session-manager.js";
import { registerRemoteTools } from "./remote/remote-tools.js";
import { runWithBearerToken } from "./remote/remote-context.js";
import { AuditRepository } from "./state/SessionRepository.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response, NextFunction } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertLoopback(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new GuidanceHttpError(`refusing to bind non-loopback host: ${host} (FR-027; set GUIDANCE_BIND_HOST explicitly to override for container port-mapping)`);
  }
}

export class GuidanceHttpError extends GuidanceError {
  constructor(message: string) {
    super("configuration_invalid", message, { recoverable: false });
  }
}

/** Resolves the effective bind host: explicit env wins, default loopback. */
export function resolveBindHost(): string {
  const env = process.env.GUIDANCE_BIND_HOST;
  if (env && env.length > 0) return env; // operator override (containers)
  return "127.0.0.1";
}

export interface HttpAppOptions {
  workspaceRoot: string;
  configDir: string;
  stateDir: string;
  /** Set to require `Authorization: Bearer <token>` on /mcp. */
  authToken?: string;
  /** FR-100: Remote-Modus (zentraler Container, Config-Upload je Session). */
  remote?: { pairs: PairStore };
}

interface ComposedApp {
  tools: import("./mcp-server/ToolHandlers.js").WorkflowTools;
  profile: string;
  configVersion: string;
  specKit?: import("./config.js").SpecKitConfig;
}

/** Creates a fully wired McpServer over the SHARED composition (one per boot,
 * not per request — SessionRepository locks are instance-scoped and would be
 * defeated by per-request composition). */
export function createConfiguredServer(opts: HttpAppOptions, composed: ComposedApp | undefined): McpServer {
  const server = createGuidanceServer();
  if (!composed) return server; // Remote-Modus: Registrierung via registerRemoteTools
  registerWorkflowTools(server, composed.tools, opts.workspaceRoot);
  if (composed.profile === "spec-kit") {
    if (!composed.specKit) {
      throw new GuidanceHttpError("profile spec-kit requires specKit integration config");
    }
    const audit = new AuditRepository(join(opts.stateDir, "history"));
    registerSpecKitTools(server, {
      workspaceRoot: opts.workspaceRoot,
      stateDir: opts.stateDir,
      configVersion: composed.configVersion,
      specKitConfig: toEngineSpecKitConfig(composed.specKit),
      audit: (event) => audit.append({ sessionId: event.sessionId, eventType: event.eventType, phase: event.phase, data: event.data }),
    });
  }
  return server;
}

/** Builds the express app with the MCP streamable transport mounted at /mcp. */
export function createHttpApp(opts: HttpAppOptions) {
  const app = express();
  const authHeader = opts.authToken !== undefined
    ? (req: Request, res: Response, next: NextFunction) => {
        const provided = req.headers.authorization ?? "";
        const expected = `Bearer ${opts.authToken}`;
        // timing-safe comparison (constant-length digests)
        const a = createHash("sha256").update(provided).digest();
        const b = createHash("sha256").update(expected).digest();
        if (!timingSafeEqual(a, b)) {
          res.status(401).json({ error: "unauthorized" });
          return;
        }
        next();
      }
    : (_req: Request, _res: Response, next: NextFunction) => next();

  // Scaffold-on-first-start (Option D) VOR der Komposition.
  ensureConfiguration(opts.configDir);
  // Komposition EINMAL pro Boot (HIGH-2) — im Remote-Modus (FR-100) KEINE
  // Boot-Komposition: Engine/Tools je Session via RemoteSessionManager.
  const manager = opts.remote ? new RemoteSessionManager(opts.stateDir, opts.remote.pairs) : undefined;
  const composed = opts.remote ? undefined : composeApplication(opts.workspaceRoot, opts.configDir, opts.stateDir);
  const composedView: ComposedApp | undefined = composed
    ? {
        tools: composed.tools,
        profile: composed.config.profile,
        configVersion: composed.config.configVersion,
        specKit: composed.config.specKit,
      }
    : undefined;

  app.get("/health", (_req, res) => {
    // configured = guidance.json existiert aktuell. Nach dem Scaffold im Boot
    // ist das praktisch immer true; false signalisiert post-bootes Löschen
    // oder Scaffold=off-Betrieb (dann startet der Server aber gar nicht).
    res.json({ server: "guidance", status: "ok", configured: existsSync(join(opts.configDir, "guidance.json")) });
  });

  // Stateless streamable HTTP: fresh server+transport per request; workflow
  // sessions persist in stateDir, so nothing session-critical lives in RAM.
  app.post("/mcp", express.json({ limit: "10mb" }), authHeader, async (req: Request, res: Response) => {
    // FR-103.1: Bearer-Token in den Tool-Handler-Kontext propagieren.
      const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      // FR-103.1: Session-Binding — Session nur mit dem Token ihres Keys.
      if (manager) {
        const pName = (req.body as { params?: { name?: string } } | undefined)?.params?.name;
        const args = (req.body as { params?: { arguments?: { sessionId?: string; key?: string } } } | undefined)?.params?.arguments;
        // FR-102.1: init_session-Auth (key MUSS zum Bearer-Token passen).
        if (pName === "init_session" && manager.pairsConfigured) {
          const key = args?.key;
          if (!key || !manager.authenticateKey(key, token)) {
            res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized: key/token mismatch" }, id: (req.body as { id?: unknown })?.id ?? null });
            return;
          }
        }
        // Q4: Rate-Limit für init_session (20/min pro Quell-IP, 429).
        if (pName === "init_session") {
          const ip = (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
          try {
            manager.checkInitRateLimit(ip);
          } catch (err) {
            res.status(429).json({ jsonrpc: "2.0", error: { code: -32002, message: String((err as Error).message) }, id: (req.body as { id?: unknown })?.id ?? null });
            return;
          }
        }
        const sid = args?.sessionId;
        if (typeof sid === "string") {
          try {
            const meta = manager.getSessionMeta(sid) ?? { sessionId: sid, key: null, configVersion: "", createdAt: "", lastAccessAt: "" };

            manager.assertSessionBinding(meta, token);
          } catch (err) {
            // FR-103.1: strukturiertes JSON-RPC-Error (kein Existenz-Oracle).
            res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: String((err as Error).message) }, id: req.body?.id ?? null });
            return;
          }
        }
      }
      return await runWithBearerToken(token, async () => {
      try {
      const server = createConfiguredServer(opts, composedView!);
      if (manager) registerRemoteTools(server, manager);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error("[guidance] /mcp error:", err);
        // MEDIUM-1: kein internes Detail an den Client (nur Server-Log).
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
        }
      }
    });
  });

  // Stateless mode: GET (SSE stream) and DELETE (session termination) are invalid.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "method not allowed (stateless mode)" }, id: null });
  };
  app.get("/mcp", authHeader, methodNotAllowed);
  app.delete("/mcp", authHeader, methodNotAllowed);

  return app;
}

/** Boots the HTTP server. Explicit host env overrides loopback default. */
export async function startHttpServer(host?: string, port = 0): Promise<{ port: number; host: string }> {
  const effectiveHost = host ?? resolveBindHost();
  if (process.env.GUIDANCE_BIND_HOST === undefined || process.env.GUIDANCE_BIND_HOST === "") {
    assertLoopback(effectiveHost); // fail-closed unless explicitly overridden
  }
  const workspaceRoot = process.env.GUIDANCE_WORKSPACE_ROOT || process.cwd();
  // FR-101: Pairs laden (optional). Konfiguriert ⇒ Remote-Modus (FR-100).
  const pairs = new PairStore(await loadPairsFromEnv());
  const remote = pairs.configured || process.env.GUIDANCE_REMOTE_MODE === "1"
    ? { pairs }
    : undefined;
  const app = createHttpApp({
    workspaceRoot,
    configDir: join(workspaceRoot, ".guidance"),
    stateDir: join(workspaceRoot, ".guidance", "state"),
    authToken: process.env.GUIDANCE_AUTH_TOKEN,
    remote,
  });
  return await new Promise((resolvePromise) => {
    const server = app.listen(port, effectiveHost, () => {
      resolvePromise({ port: (server.address() as { port: number }).port, host: effectiveHost });
    });
  });
}

const isDirectRun = process.argv[1] !== undefined
  && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const PORT = Number(process.env.PORT) || 3003;
  const { port, host } = await startHttpServer(undefined, PORT);
  process.stderr.write(`[guidance] http ready on http://${host}:${port}/mcp (workspace: ${process.env.GUIDANCE_WORKSPACE_ROOT || process.cwd()})\n`);
  const shutdown = (signal: string) => {
    process.stderr.write(`[guidance] ${signal} received, shutting down\n`);
    setTimeout(() => process.exit(0), 5000).unref();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
