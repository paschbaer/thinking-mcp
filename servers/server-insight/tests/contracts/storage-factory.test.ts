import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildStorageAdapter,
  __resetStorageFactoryForTests,
} from "../../src/storage/factory.ts";
import { SqliteAdapter } from "../../src/storage/sqlite.ts";
import { PostgresAdapter } from "../../src/storage/postgres.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

describe("Storage factory (SRCH-2-R3)", () => {
  beforeEach(() => {
    __resetStorageFactoryForTests();
    dir = mkdtempSync(join(tmpdir(), "emms-factory-"));
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    __resetStorageFactoryForTests();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the SAME memoized handle on every call (one adapter per process)", () => {
    vi.stubEnv("EMMS_STORAGE_PATH", join(dir, "store.db"));
    const a = buildStorageAdapter();
    const b = buildStorageAdapter();
    const c = buildStorageAdapter({});
    expect(b.adapter).toBe(a.adapter);
    expect(c.adapter).toBe(a.adapter);
    expect(a.adapter).toBeInstanceOf(SqliteAdapter);
    expect(a.artifactsDir).toBe(join(dir, "emms-artifacts"));
  });

  it("sqlite backend stays the default without EMMS_STORAGE_BACKEND", () => {
    vi.stubEnv("EMMS_STORAGE_PATH", join(dir, "store.db"));
    const { adapter } = buildStorageAdapter();
    expect(adapter).toBeInstanceOf(SqliteAdapter);
  });

  it("postgres backend without EMMS_PG_CONNECTION_STRING fails loudly (no silent sqlite fallback)", () => {
    vi.stubEnv("EMMS_STORAGE_BACKEND", "postgres");
    vi.stubEnv("EMMS_STORAGE_PATH", join(dir, "store.db"));
    expect(() => buildStorageAdapter()).toThrow(
      /EMMS_PG_CONNECTION_STRING.*refusing to silently fall back/s,
    );
  });

  it("postgres backend with a connection string constructs a PostgresAdapter (memoized)", () => {
    vi.stubEnv("EMMS_STORAGE_BACKEND", "postgres");
    vi.stubEnv("EMMS_PG_CONNECTION_STRING", "postgres://mock");
    vi.stubEnv("EMMS_STORAGE_PATH", join(dir, "store.db"));
    const a = buildStorageAdapter();
    const b = buildStorageAdapter();
    expect(a.adapter).toBeInstanceOf(PostgresAdapter);
    expect(b.adapter).toBe(a.adapter);
    // Artifacts stay filesystem-based next to EMMS_STORAGE_PATH
    expect(a.artifactsDir).toBe(join(dir, "emms-artifacts"));
  });
});
