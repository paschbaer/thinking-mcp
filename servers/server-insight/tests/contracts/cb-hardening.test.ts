import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EvidenceStore } from '../../src/evidence/store.js';

let dir: string;
let adapter: SqliteAdapter;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'emms-cb-'));
  adapter = new SqliteAdapter(join(dir, 'store.db'));
  await adapter.init();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('CB hardening (Codebase-Review 2026-09-24)', () => {
  it('CB-11: malformed/traversal artifact hashes are rejected before reaching join()', async () => {
    const store = new EvidenceStore(join(dir, 'artifacts'));
    await expect(store.read('sha256:../../etc/passwd')).rejects.toThrowError(/Malformed artifact hash/);
    await expect(store.read('nothex')).rejects.toThrowError(/Malformed artifact hash/);
    await expect(store.read(`sha256:${'g'.repeat(64)}`)).rejects.toThrowError(/Malformed artifact hash/);
  });

  it('CB-12: bare FTS5 operators (NOT/AND/OR) do not throw, they just match nothing', async () => {
    await expect(adapter.searchFullText('NOT', 'scope-a')).resolves.toEqual([]);
    await expect(adapter.searchFullText('AND OR NEAR', 'scope-a')).resolves.toEqual([]);
    await expect(adapter.searchFullText('install not dependencies', 'scope-a')).resolves.toEqual([]);
  });
});
