/**
 * Tool registry: wires the EMMS tools (contracts/tools.md) onto the MCP server.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  resolveConfig,
  resolveStorageBackend,
  resolvePostgresConnectionString,
  type ServerConfig,
} from "../config.js";
import { SqliteAdapter } from "../storage/sqlite.js";
import { EmmsService } from "../service.js";
import { registerEmmsTools } from "./register.js";
import { registerSetupInsight } from "./setup-insight.js";
import { ConsolidationWorker } from "../consolidation/worker.js";
import { TransformersEmbedding } from "../retrieval/semantic.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Persistent default store: ~/.insight/emms-store.db.
 *
 * The previous default (cwd/emms-store.db) was a workflow-persistence trap:
 * agents launching the server via stdio from arbitrary cwds got a fresh,
 * cwd-local store each session, so workflows from earlier sessions were
 * "not found" (reported by the Niyama capture session, wf_225bf751-af3).
 * Override via config.storagePath or EMMS_STORAGE_PATH (docker-compose sets
 * it to the persistent volume).
 */
function defaultStoragePath(): string {
  const dir = join(homedir(), ".insight");
  mkdirSync(dir, { recursive: true });
  return join(dir, "emms-store.db");
}

export function registerTools(server: McpServer, config: ServerConfig): void {
  const resolved = resolveConfig(config);
  // resolveConfig already honors EMMS_STORAGE_PATH
  const storagePath = resolved.storagePath ?? defaultStoragePath();
  const artifactsDir = join(storagePath, "..", "emms-artifacts");
  const adapter = new SqliteAdapter(storagePath);
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
 * the warmup into registerTools would run it per session. This helper owns a
 * short-lived adapter (closed afterwards) that warms the SHARED embeddings
 * table. Never blocks startup or /health; skips cleanly when embeddings are
 * disabled or the model fails to load; the explicit .catch keeps a warmup
 * failure from becoming an unhandled rejection (process crash).
 */
export function launchSemanticWarmup(config: ServerConfig): void {
  const resolved = resolveConfig(config);
  const storagePath = resolved.storagePath ?? defaultStoragePath();
  const adapter = new SqliteAdapter(storagePath);
  const service = new EmmsService(
    adapter,
    join(storagePath, "..", "emms-artifacts"),
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
    })
    .finally(() => {
      void adapter.close();
    });
}
