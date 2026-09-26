import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import type { Episode, Observation, Workflow } from '../../src/domain/types.js';

// L256 FTS coverage regression (2026-09-24 review): the FTS index used to
// cover ONLY goal_summary, so searches for observation/fix wording never
// matched. These tests address the FTS arm DIRECTLY (searchFullText), not
// the scope-list fallback (all relevance 0.25) — the fallback previously
// masked every FTS bug layer (2026-09-22 lesson).

let dir: string;
let adapter: SqliteAdapter;

const CTX = { scope_id: 'scope-a' };

function makeEpisode(id: string, workflow_id: string, goal_summary: string): Episode {
  return {
    experience_id: id,
    workflow_id,
    scope_id: CTX.scope_id,
    visibility: 'private',
    goal_summary,
    acceptance_criteria: ['c1'],
    problem_summary: 'problem',
    state: 'active',
    created_at: new Date().toISOString(),
  } as Episode;
}

async function seedEpisodeWithObservation(id: string, goal: string, observation: string): Promise<void> {
  const wf: Workflow = {
    workflow_id: `wf-${id}`,
    goal,
    scope_id: CTX.scope_id,
    state: 'active',
    revision: 1,
    actor_id: 'test',
    created_at: new Date().toISOString(),
  } as Workflow;
  await adapter.createWorkflow(wf);
  await adapter.createEpisode(makeEpisode(id, wf.workflow_id, goal));
  const obs: Observation = {
    observation_id: `obs-${id}`,
    episode_id: id,
    kind: 'failure_output',
    content: observation,
    provenance: { source: 'test' },
  } as unknown as Observation;
  await adapter.insertObservation(obs);
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'emms-fts-obs-'));
  adapter = new SqliteAdapter(join(dir, 'store.db'));
  await adapter.init();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('FTS observation coverage (L256)', () => {
  it('an observation wording is findable via searchFullText (insert-time trigger)', async () => {
    await seedEpisodeWithObservation(
      'exp-1',
      'Persist lesson: some-slug',
      'vitest worker crashed with ERR_TEST_WORKER_EXIT after named params rebuild'
    );
    // "worker" appears ONLY in the observation, not in goal_summary.
    const rows = await adapter.searchFullText('worker crashed', CTX.scope_id);
    expect(rows.map((r) => r.episode_id)).toContain('exp-1');
  });

  it('observations written BEFORE the index existed are picked up by the init backfill', async () => {
    await seedEpisodeWithObservation('exp-2', 'Persist lesson: backfill-slug', 'zanzibar quixotic failure string');
    // Simulate a store created before observations_fts existed: wipe the
    // observation index rows, then re-init on the same file.
    (adapter as unknown as { db: Database.Database }).db.exec('DELETE FROM observations_fts');
    await adapter.close();
    adapter = new SqliteAdapter(join(dir, 'store.db'));
    await adapter.init();
    const rows = await adapter.searchFullText('zanzibar quixotic', CTX.scope_id);
    expect(rows.map((r) => r.episode_id)).toContain('exp-2');
  });

  it('bare FTS operators in observation wording do not throw (CB-12 parity on the new index)', async () => {
    await seedEpisodeWithObservation('exp-3', 'Persist lesson: ops-slug', 'NOT AND OR NEAR punctuation, "quoted" stuff');
    // Quoted-token matching (CB-12 fix) means these are phrase queries, not
    // syntax errors: "NOT" legitimately matches the observation above — the
    // contract is only that no FTS5 syntax error is thrown.
    await expect(adapter.searchFullText('NOT', CTX.scope_id)).resolves.toBeDefined();
    await expect(adapter.searchFullText('AND OR NEAR', CTX.scope_id)).resolves.toBeDefined();
  });

  it('scope filter applies on the observation index (other scope does not see private episode)', async () => {
    await seedEpisodeWithObservation('exp-4', 'Persist lesson: scope-slug', 'uniquemarkerword only here');
    const rows = await adapter.searchFullText('uniquemarkerword', 'scope-b');
    expect(rows.map((r) => r.episode_id)).not.toContain('exp-4');
  });

  it('observation contents beyond 500 chars are indexed only by their first 500 chars', async () => {
    const long = 'a'.repeat(490) + ' tailmarker tailmarker tailmarker';
    await seedEpisodeWithObservation('exp-5', 'Persist lesson: cap-slug', long);
    // Index holds substr(content, 1, 500) = 490 a's + " tailma" — the token
    // "tailmarker" is truncated at the cap and must NOT match.
    const rows = await adapter.searchFullText('tailmarker', CTX.scope_id);
    expect(rows.map((r) => r.episode_id)).not.toContain('exp-5');
  });

  it('repeated init() does not double-insert backfill rows', async () => {
    await seedEpisodeWithObservation('exp-6', 'Persist lesson: reinit-slug', 'reinitchecktoken here');
    await adapter.close();
    adapter = new SqliteAdapter(join(dir, 'store.db'));
    await adapter.init(); // backfill path (counts mismatch cannot happen here —
    // the trigger already indexed the row — but init must stay a no-op)
    await adapter.close();
    adapter = new SqliteAdapter(join(dir, 'store.db'));
    await adapter.init();
    const db = (adapter as unknown as { db: Database.Database }).db;
    const n = db.prepare("SELECT COUNT(*) AS n FROM observations_fts WHERE episode_id = 'exp-6'").get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('an episode matching in BOTH indexes is returned exactly once', async () => {
    await seedEpisodeWithObservation('exp-7', 'Persist lesson: dualmatch dualmatch', 'dualmatch observation text');
    const rows = await adapter.searchFullText('dualmatch', CTX.scope_id);
    expect(rows.filter((r) => r.episode_id === 'exp-7')).toHaveLength(1);
  });
});
