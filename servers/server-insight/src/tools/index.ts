/**
 * Tool registry: wires the EMMS tools (contracts/tools.md) onto the MCP server.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { resolveConfig, resolveStorageBackend, resolvePostgresConnectionString, type ServerConfig } from '../config.js';
import { SqliteAdapter } from '../storage/sqlite.js';
import { EmmsService } from '../service.js';
import { registerEmmsTools } from './register.js';
import { registerSetupInsight } from './setup-insight.js';
import { ConsolidationWorker } from '../consolidation/worker.js';
import { TransformersEmbedding } from '../retrieval/semantic.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

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
  const dir = join(homedir(), '.insight');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'emms-store.db');
}

export function registerTools(server: McpServer, config: ServerConfig): void {
  const resolved = resolveConfig(config);
  // resolveConfig already honors EMMS_STORAGE_PATH
  const storagePath = resolved.storagePath ?? defaultStoragePath();
  const artifactsDir = join(storagePath, '..', 'emms-artifacts');
  const adapter = new SqliteAdapter(storagePath);
  const service = new EmmsService(adapter, artifactsDir, undefined, new TransformersEmbedding());
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
