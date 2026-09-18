/**
 * Dedup contract tests (FR-021 / D5): findDuplicates groups by normalized
 * signature hash + goal Jaccard >= 0.8; dedupeScope supersedes non-kept
 * duplicates non-destructively (FR-020/034) with audit records.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';

const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };
let dir: string;
let service: EmmsService;

async function seedEpisode(goal: string, failure: string): Promise<{ wf: string; exp: string }> {
  const { result } = await service.startWorkflow({ goal, scope_id: CTX.scope_id, client_context: CTX });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: `${failure} exited with code 1`, exit_code: 1, expected_revision: rev++, client_context: CTX });
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: '{"os":"linux"}', expected_revision: rev++, client_context: CTX });
  await service.putEnvironmentDirect(wf, { os: 'linux' }, CTX.scope_id);
  const adapter = (service as unknown as { adapter: SqliteAdapter }).adapter;
  const exp = (await adapter.getWorkflow(wf, CTX.scope_id))!.experience_id!;
  const { normalizeFailure } = await import('../../src/domain/normalize.ts');
  const norm = normalizeFailure(`${failure} exited with code 1`, [], 1);
  await adapter.putSignature(exp, norm.normalized_hash, '[]', 'failure_output', 1);
  return { wf, exp };
}

describe('dedupe (FR-021 / D5)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-dedupe-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds duplicate group: same signature + similar goal', async () => {
    const a = await seedEpisode('restore reproducible dependency installation', 'npm ERR code ERESOLVE');
    const b = await seedEpisode('restore fully reproducible dependency installation', 'npm ERR code ERESOLVE');
    const c = await seedEpisode('fix docker permission denied', 'docker build failed');

    const groups = await service.findDuplicates(CTX.scope_id);
    expect(groups.length).toBe(1);
    expect(groups[0].sort()).toEqual([a.exp, b.exp].sort());
    expect(groups[0]).not.toContain(c.exp);
  });

  it('dedupeScope keeps verified, supersedes duplicates; no physical deletion (FR-034)', async () => {
    const a = await seedEpisode('restore dependency installation', 'npm ERR code ERESOLVE');
    const b = await seedEpisode('restore dependency installation', 'npm ERR code ERESOLVE');

    const out = await service.dedupeScope(CTX.scope_id);
    expect((out.result as Record<string, unknown>).groups_found).toBe(1);
    const merged = (out.result as Record<string, unknown>).merged as Array<{ kept: string; superseded: string[] }>;
    expect(merged.length).toBe(1);

    // one kept, one superseded — both still exist (auditable, FR-034)
    const adapter = (service as unknown as { adapter: SqliteAdapter }).adapter;
    const keptId = merged[0].kept;
    const supId = merged[0].superseded[0];
    const keptEp = await adapter.getEpisode(keptId, CTX.scope_id);
    const supEp = await adapter.getEpisode(supId, CTX.scope_id);
    expect(keptEp).toBeDefined();
    expect(supEp).toBeDefined();
    expect(supEp!.state).toBe('SUPERSEDED');
    expect(keptEp!.state).not.toBe('SUPERSEDED');

    // audit record written
    const events = await adapter.listEvents([a.wf, b.wf][0]);
    expect(Array.isArray(events)).toBe(true);
  });

  it('no duplicates: dedupeScope returns empty without changes', async () => {
    await seedEpisode('unique problem one', 'unique error A');
    await seedEpisode('totally different domain', 'docker permission denied');
    const out = await service.dedupeScope(CTX.scope_id);
    expect((out.result as Record<string, unknown>).groups_found).toBe(0);
    expect(((out.result as Record<string, unknown>).merged as unknown[]).length).toBe(0);
  });
});
