import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import type { Episode, Workflow } from '../../src/domain/types.ts';

let dir: string;
let adapter: SqliteAdapter;

const wf = (id: string, scope = 'repo-a'): Workflow => ({
  workflow_id: id,
  goal: 'g',
  scope_id: scope,
  state: 'DRAFT',
  revision: 1,
  actor_id: 'local-agent',
  created_at: '2026-09-17T00:00:00Z',
});

const ep = (id: string, workflow_id: string, scope = 'repo-a'): Episode => ({
  experience_id: id,
  workflow_id,
  scope_id: scope,
  visibility: 'repository',
  goal_summary: 'fix build',
  acceptance_criteria: ['install exits 0'],
  problem_summary: 'ERESOLVE',
  state: 'OBSERVED',
  created_at: '2026-09-17T00:00:00Z',
});

describe('StorageAdapter contract (FR-009/018/020/027/028/034)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-'));
    adapter = new SqliteAdapter(join(dir, 'store.db'));
    await adapter.init();
  });
  afterEach(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is durable across reopen (FR-009)', async () => {
    await adapter.createWorkflow(wf('wf1'));
    await adapter.close();
    const reopened = new SqliteAdapter(join(dir, 'store.db'));
    await reopened.init();
    expect(await reopened.getWorkflow('wf1', 'repo-a')).toBeDefined();
    await reopened.close();
  });

  it('event log is append-only and ordered (FR-020)', async () => {
    await adapter.createWorkflow(wf('wf1'));
    for (let i = 0; i < 3; i++) {
      await adapter.appendEvent({
        event_id: `e${i}`, workflow_id: 'wf1', type: 'test', payload: { i },
        seq: 0, recorded_at: '2026-09-17T00:00:00Z',
      });
    }
    const events = await adapter.listEvents('wf1');
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.seq)).toEqual([...events.map((e) => e.seq)].sort((a, b) => a - b));
  });

  it('idempotency keys are unique and first write wins (FR-028)', async () => {
    const rec = { key: 'k1', actor_id: 'a', tool: 't', request_id: 'r1', result_json: '{"ok":1}' };
    expect(await adapter.putIdempotency(rec)).toBe(true);
    expect(await adapter.putIdempotency({ ...rec, result_json: '{"ok":2}' })).toBe(false);
    expect((await adapter.getIdempotency('k1'))?.result_json).toBe('{"ok":1}');
  });

  it('visibility filtering hides other scopes at read level (FR-027)', async () => {
    await adapter.createWorkflow(wf('wf1', 'repo-a'));
    expect(await adapter.getWorkflow('wf1', 'repo-b')).toBeUndefined();
    await adapter.createEpisode(ep('exp1', 'wf1', 'repo-a'));
    expect(await adapter.getEpisode('exp1', 'repo-b')).toBeUndefined();
    expect(await adapter.getEpisode('exp1', 'repo-a')).toBeDefined();
  });
});
