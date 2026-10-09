/**
 * Tool registry: wires the EMMS tools (contracts/tools.md) onto the MCP server.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ServerConfig } from "../config.js";
import { buildStorageAdapter } from "../storage/factory.js";
import { EmmsService } from "../service.js";
import { registerEmmsTools } from "./register.js";
import { registerSetupInsight } from "./setup-insight.js";
import { ConsolidationWorker } from "../consolidation/worker.js";
import { TransformersEmbedding } from "../retrieval/semantic.js";

export function registerTools(server: McpServer, config: ServerConfig): void {
  // Shared process-wide storage handle (SRCH-2-R3): memoized per backend —
  // sqlite default or EMMS_STORAGE_BACKEND=postgres (fail-closed on a
  // missing EMMS_PG_CONNECTION_STRING).
  const { adapter, artifactsDir } = buildStorageAdapter(config);
  const service = new EmmsService(
    adapter,
    artifactsDir,
    undefined,
    new TransformersEmbedding(),
  );
  // Async init deferred: better-sqlite3 init is synchronous; run at first use.
  void adapter.init().catch((e) => {
    throw new Error(`EMMS storage init failed: ${(e as Error).message}`);
  });

  registerEmmsTools(server, { service, adapter });
  registerSetupInsight(server);

  // Start consolidation worker (stale scan, auto-dedup, lesson promotion)
  const worker = new ConsolidationWorker(adapter, service.lessons);
  worker.start();
}

/**
 * Fire-and-forget semantic warmup, ONCE PER PROCESS (not per session/MCP
 * server): the HTTP entry builds a fresh service per MCP session, so wiring
 * the warmup into registerTools would run it per session. Since SRCH-2-R3 the
 * warmup shares the MEMOIZED process-wide adapter from buildStorageAdapter —
 * a postgres deployment now warms Postgres, not a stray local sqlite store,
 * and the shared adapter must NOT be closed here (tools + consolidation
 * worker keep using it; the adapter's close() is guarded against
 * double-close/uninitialized db). Never blocks startup or /health; skips
 * cleanly when embeddings are disabled or the model fails to load; the
 * explicit .catch keeps a warmup failure from becoming an unhandled
 * rejection (process crash).
 */
export function launchSemanticWarmup(config: ServerConfig): void {
  const { adapter, artifactsDir } = buildStorageAdapter(config);
  const service = new EmmsService(
    adapter,
    artifactsDir,
    undefined,
    new TransformersEmbedding(),
  );
  const started = Date.now();
  void adapter
    .init()
    .then(() => service.warmupSemanticIndex())
    .then((r) => {
      if (r.skipped)
        console.log(`[insight] semantic warmup skipped: ${r.reason}`);
      else
        console.log(
          `[insight] semantic warmup complete: ${r.embedded} summaries embedded in ${Date.now() - started}ms`,
        );
    })
    .catch((e: unknown) => {
      console.error(
        `[insight] semantic warmup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
}
