import { z } from 'zod';

/**
 * Server configuration schema for the Experience Memory MCP Server (EMMS).
 *
 * Functionality is defined by specs/001-experience-memory-server/spec.md.
 */
export const ServerConfigSchema = z.object({
  // Storage location for the experience memory (details determined by the spec's
  // storage requirements; kept configurable to allow local-first MVP usage).
  storagePath: z.string().optional(),
});

/** Env fallback (Docker/compose sets EMMS_STORAGE_PATH). */
export function resolveConfig(raw: Partial<{ storagePath: string }> = {}): ServerConfig {
  return {
    storagePath: raw.storagePath ?? process.env.EMMS_STORAGE_PATH,
  };
}

/** Storage backend selection: 'sqlite' (default) | 'postgres'. */
export function resolveStorageBackend(): 'sqlite' | 'postgres' {
  return process.env.EMMS_STORAGE_BACKEND === 'postgres' ? 'postgres' : 'sqlite';
}

/** Postgres connection string (required when backend = postgres). */
export function resolvePostgresConnectionString(): string | undefined {
  return process.env.EMMS_PG_CONNECTION_STRING;
}

/**
 * Relevance boost for full-text (FTS) matches in experience_search ranking.
 * Must stay BELOW the signature-exact weight (0.40) so exact signature hits
 * keep ranking first (review invariant, 2026-09-22). Configurable via
 * EMMS_FTS_RELEVANCE_BOOST; invalid/missing values fall back to 0.30.
 */
export function resolveFtsRelevanceBoost(): number {
  const env = process.env.EMMS_FTS_RELEVANCE_BOOST;
  if (env === undefined || env.trim() === '') return 0.30;
  const raw = Number(env);
  if (!Number.isFinite(raw)) return 0.30;
  return Math.min(Math.max(raw, 0), 0.39);
}

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const DEFAULT_CONFIG: ServerConfig = {};
