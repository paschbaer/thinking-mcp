import { describe, expect, it, vi } from 'vitest';
import { PostgresAdapter } from '../../src/storage/postgres.ts';

// L257 Postgres FTS parity — contract-level tests with a mocked pg client
// (no live Postgres in this environment; live smoke verification is tracked
// as a follow-up triggered by first EMMS_STORAGE_BACKEND=postgres activation).
// Assertions address the SQL contract directly (the SQLite FTS bug class —
// silent empty results, INNER JOIN filtering — was only visible at the
// query level, so the emitted SQL shape is pinned here).

function adapterWithMock(rows: Record<string, unknown>[]) {
  const adapter = new PostgresAdapter({ connectionString: 'postgres://mock' });
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (adapter as unknown as { client: { query: typeof query } | null }).client = { query };
  return { adapter, query };
}

const ROW = {
  episode_id: 'exp-1',
  summary: 'Persist lesson: some-slug',
  state: 'verified',
  scope_id: 'scope-a',
  last_verified_at: null,
  normalized_hash: null,
  exact_tokens: null,
};

describe('PostgresAdapter.searchFullText (L257 parity)', () => {
  it('emits sanitized AND-joined tsquery, LEFT JOIN signatures, observation coverage', async () => {
    const { adapter, query } = adapterWithMock([ROW]);
    const rows = await adapter.searchFullText('worker crashed, "quoted"', 'scope-a');
    expect(rows).toEqual([ROW]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    // sanitization: punctuation stripped, tokens AND-joined (SQLite
    // space-joined quoted-token = implicit AND parity)
    expect(params[0]).toBe('worker & crashed & quoted');
    // scope filter as $2, never interpolated into SQL text
    expect(params[1]).toBe('scope-a');
    expect(sql).toContain('LEFT JOIN signatures');
    expect(sql).not.toMatch(/(?<!LEFT )JOIN signatures/); // no INNER JOIN (bug class 2026-09-22)
    expect(sql).toMatch(/to_tsvector\('simple', e\.goal_summary\) @@ to_tsquery\('simple', \$1\)/);
    expect(sql).toMatch(/to_tsvector\('simple', substr\(o\.content, 1, 500\)\) @@ to_tsquery\('simple', \$1\)/);
    expect(sql).toMatch(/o\.episode_id = e\.experience_id/);
    expect(sql).toContain('e.scope_id = $2');
    // the old ILIKE arm must be gone (coverage + injection-surface parity)
    expect(sql).not.toContain('ILIKE');
  });

  it('no scope filter and no $2 when scope_id is empty', async () => {
    const { adapter, query } = adapterWithMock([]);
    await adapter.searchFullText('anything', '');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['anything']);
    expect(sql).not.toContain('$2');
  });

  it('terms that sanitize to nothing return [] without querying', async () => {
    const { adapter, query } = adapterWithMock([]);
    await expect(adapter.searchFullText('!!! ,,, ;;;', 'scope-a')).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('bare operators do not produce tsquery operator syntax (they are tokens)', async () => {
    const { adapter, query } = adapterWithMock([]);
    await adapter.searchFullText('NOT AND OR', 'scope-a');
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    // AND-joining sanitized tokens keeps them as plain lexemes — no tsquery
    // syntax error possible (CB-12 parity)
    expect(params[0]).toBe('NOT & AND & OR');
  });

  it('migrations create expression GIN indexes matching the query expressions', async () => {
    const adapter = new PostgresAdapter({ connectionString: 'postgres://mock' });
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    (adapter as unknown as { client: { query: typeof query } | null }).client = { query };
    await (adapter as unknown as { runMigrations(): Promise<void> }).runMigrations();
    const ddl = (query.mock.calls as [string][]).map(([sql]) => sql).join('\n');
    expect(ddl).toContain("CREATE INDEX IF NOT EXISTS idx_episodes_fts ON episodes\n        USING GIN (to_tsvector('simple', goal_summary))");
    expect(ddl).toContain("CREATE INDEX IF NOT EXISTS idx_observations_fts ON observations\n        USING GIN (to_tsvector('simple', substr(content, 1, 500)))");
  });
});
