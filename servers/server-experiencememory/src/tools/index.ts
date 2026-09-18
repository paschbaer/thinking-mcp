/**
 * Tool registry: wires the EMMS tools (contracts/tools.md) onto the MCP server.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { resolveConfig, type ServerConfig } from '../config.js';
import { SqliteAdapter } from '../storage/sqlite.js';
import { EmmsService } from '../service.js';
import { registerEmmsTools } from './register.js';
import { TransformersEmbedding } from '../retrieval/semantic.js';
import { join } from 'node:path';

export function registerTools(server: McpServer, config: ServerConfig): void {
  const resolved = resolveConfig(config);
  const storagePath = resolved.storagePath ?? join(process.cwd(), 'emms-store.db');
  const artifactsDir = join(storagePath, '..', 'emms-artifacts');
  const adapter = new SqliteAdapter(storagePath);
  const service = new EmmsService(adapter, artifactsDir, undefined, new TransformersEmbedding());
  // Async init deferred: better-sqlite3 init is synchronous; run at first use.
  void adapter.init().catch((e) => {
    throw new Error(`EMMS storage init failed: ${(e as Error).message}`);
  });

  registerEmmsTools(server, { service, adapter });
}
