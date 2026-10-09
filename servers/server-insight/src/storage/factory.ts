/**
 * Process-wide storage factory (SRCH-2-R3).
 *
 * Exactly ONE StorageAdapter per configured backend per process. Previously
 * registerTools and launchSemanticWarmup each constructed their own
 * SqliteAdapter (two sqlite handles), and an EMMS_STORAGE_BACKEND=postgres
 * deployment would still have warmed a stray local sqlite store because the
 * backend env vars were never consulted here.
 *
 * Backend selection: EMMS_STORAGE_BACKEND=postgres + EMMS_PG_CONNECTION_STRING
 * (fail-closed: a postgres backend without a connection string throws loudly
 * at startup instead of silently falling back to sqlite). Everything else
 * keeps the sqlite default (EMMS_STORAGE_PATH override, ~/.insight default).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import {
  resolveConfig,
  resolveStorageBackend,
  resolvePostgresConnectionString,
  type ServerConfig,
} from "../config.js";
import { SqliteAdapter } from "./sqlite.js";
import { PostgresAdapter } from "./postgres.js";
import type { StorageAdapter } from "./adapter.js";

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
export function defaultStoragePath(): string {
  const dir = join(homedir(), ".insight");
  mkdirSync(dir, { recursive: true });
  return join(dir, "emms-store.db");
}

export interface StorageHandle {
  adapter: StorageAdapter;
  /** Filesystem location for evidence artifacts (backend-independent). */
  artifactsDir: string;
}

let memoized: StorageHandle | null = null;

/** Returns the memoized process-wide storage handle (see module docs).
 * NOTE: after the first call the memo wins — config arguments passed by
 * later callers are intentionally ignored (all production entries pass the
 * same env-resolved config; per-process singleton by design). */
export function buildStorageAdapter(config: ServerConfig = {}): StorageHandle {
  if (memoized) return memoized;
  const backend = resolveStorageBackend();
  if (backend === "postgres") {
    const connectionString = resolvePostgresConnectionString();
    if (!connectionString) {
      throw new Error(
        'EMMS storage backend "postgres" requires EMMS_PG_CONNECTION_STRING — refusing to silently fall back to a local sqlite store. Set EMMS_PG_CONNECTION_STRING (or unset EMMS_STORAGE_BACKEND to use sqlite).',
      );
    }
    memoized = {
      adapter: new PostgresAdapter({
        connectionString,
        autoCreateExtension: true,
      }),
      // Artifacts stay on the filesystem regardless of the metadata backend:
      // EMMS_STORAGE_PATH if set, else the ~/.insight default.
      artifactsDir: defaultArtifactsDir(),
    };
    return memoized;
  }
  const resolved = resolveConfig(config);
  // resolveConfig already honors EMMS_STORAGE_PATH
  const storagePath = resolved.storagePath ?? defaultStoragePath();
  memoized = {
    adapter: new SqliteAdapter(storagePath),
    artifactsDir: join(storagePath, "..", "emms-artifacts"),
  };
  return memoized;
}

function defaultArtifactsDir(): string {
  const override = process.env.EMMS_STORAGE_PATH;
  return override
    ? join(override, "..", "emms-artifacts")
    : join(homedir(), ".insight", "emms-artifacts");
}

/** Test-only: drops the memo so a new handle is constructed on next call. */
export function __resetStorageFactoryForTests(): void {
  memoized = null;
}
