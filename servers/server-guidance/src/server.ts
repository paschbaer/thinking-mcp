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
import { createGuidanceServer } from "./mcp-server/GuidanceServer.js";
import { registerWorkflowTools } from "./mcp-server/register-tools.js";
import { registerSpecKitTools, toEngineSpecKitConfig } from "./mcp-server/register-spec-kit-tools.js";
import { composeApplication } from "./main.js";
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
export function createConfiguredServer(opts: HttpAppOptions, composed: ComposedApp): McpServer {
  const server = createGuidanceServer();
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

  // Komposition EINMAL pro Boot (HIGH-2): geteilte Repositories/Locks.
  const composed = composeApplication(opts.workspaceRoot, opts.configDir, opts.stateDir);
  const composedView: ComposedApp = {
    tools: composed.tools,
    profile: composed.config.profile,
    configVersion: composed.config.configVersion,
    specKit: composed.config.specKit,
  };

  app.get("/health", (_req, res) => {
    res.json({ server: "guidance", status: "ok" });
  });

  // Stateless streamable HTTP: fresh server+transport per request; workflow
  // sessions persist in stateDir, so nothing session-critical lives in RAM.
  app.post("/mcp", express.json({ limit: "10mb" }), authHeader, async (req: Request, res: Response) => {
    try {
      const server = createConfiguredServer(opts, composedView);
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
      if (!res.headersSent) {
        console.error("[guidance] /mcp error:", err);
        // MEDIUM-1: kein internes Detail an den Client (nur Server-Log).
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
      }
    }
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
  const app = createHttpApp({
    workspaceRoot,
    configDir: join(workspaceRoot, ".guidance"),
    stateDir: join(workspaceRoot, ".guidance", "state"),
    authToken: process.env.GUIDANCE_AUTH_TOKEN,
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
