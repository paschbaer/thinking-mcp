/**
 * HTTP transport entry (FR-027): loopback-only binding.
 * A non-loopback host MUST fail at startup (fail-closed).
 */
import express from "express";
import { GuidanceError } from "./types/errors.js";
import { createGuidanceServer } from "./mcp-server/GuidanceServer.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertLoopback(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new GuidanceHttpError(`refusing to bind non-loopback host: ${host} (FR-027)`);
  }
}

export class GuidanceHttpError extends GuidanceError {
  constructor(message: string) {
    super("configuration_invalid", message, { recoverable: false });
  }
}

export async function startHttpServer(host = "127.0.0.1", port = 0): Promise<{ port: number }> {
  assertLoopback(host);
  const app = express();
  // The MCP streamable-HTTP adapter mounts here in a later task; the guard is
  // the security-relevant part of this scaffold.
  app.get("/health", (_req, res) => {
    res.json({ server: "guidance", status: "ok" });
  });
  void createGuidanceServer; // wired to the streamable transport in Phase 5+ tasks
  return await new Promise((resolvePromise) => {
    const server = app.listen(port, host, () => {
      resolvePromise({ port: (server.address() as { port: number }).port });
    });
  });
}
