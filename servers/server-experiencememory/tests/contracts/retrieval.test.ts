import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { normalizeFailure } from '../../src/domain/normalize.ts';

let dir: string;
let service: EmmsService;
const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

async function seedVerifiedEpisode(scope: string, env: Record<string, string>, signature: string): Promise<void> {
  const ctx = { scope_id: scope, agent_id: 'local-agent' };
  const { result } = await service.startWorkflow({ goal: 'restore reproducible dependency installation', scope_id: scope, client_context: ctx });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: `${signature} exited with code 1`, exit_code: 1, expected_revision: rev, client_context: ctx }); rev++;
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: JSON.stringify(env), expected_revision: rev, client_context: ctx }); rev++;
  await service.putEnvironmentDirect(wf, env, scope);
  const bad = await service.recordAttempt({ workflow_id: wf, intent: 'disable peer dependency checks', expected_revision: rev, client_context: ctx }); rev++;
  await service.completeAttempt({ workflow_id: wf, attempt_id: bad.result.attempt_id as string, outcome: 'runtime failures', classification: 'harmful', expected_revision: rev, client_context: ctx }); rev++;
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peer dependency versions', expected_revision: rev, client_context: ctx }); rev++;
  await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: rev, client_context: ctx }); rev++;
  await service.proposeSolution({ workflow_id: wf, strategy: 'align peers', mechanism: 'semver', checks: [
    { criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
    { criterion: 'unit tests pass', test_type: 'test', expected_result: 'pass', regression_coverage: true, timeout_s: 300, evidence_requirement: true, targets_original_failure: false },
  ], expected_revision: rev, client_context: ctx }); rev++;
  const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('pass').toString('base64'), kind: 'test_report', media_type: 'text/plain', expected_revision: rev, client_context: ctx }); rev++;
  await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev, client_context: ctx }); rev++;
  await service.recordValidationRun({ workflow_id: wf, check_index: 1, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev, client_context: ctx }); rev++;
  await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: rev, client_context: ctx });
}

describe('Retrieval contract (FR-014..018, US1)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-ret-'));
    service = new EmmsService(await makeAdapter(dir), join(dir, 'artifacts'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('exact-signature verified episode is top result with known-bad attempts and stale-free rank (G3, SC-002)', async () => {
    await seedVerifiedEpisode(CTX.scope_id, { os: 'linux', node: '20' }, 'npm ERR code ERESOLVE');
    const hash = normalizeFailure('npm ERR code ERESOLVE exited with code 1', [], 1).normalized_hash;
    const out = await service.search({
      query: 'ERESOLVE dependency installation',
      scope_id: CTX.scope_id,
      failure_signature_hash: hash,
      environment: { os: 'linux', node: '20' },
    });
    const results = out.result.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].validation).toMatchObject({ tier: 'LOCALLY_VERIFIED' });
    const bad = results[0].known_bad_attempts as Array<{ strategy: string }>;
    expect(bad.some((b) => b.strategy.includes('disable peer'))).toBe(true);
    expect((out.result.retrieval_notes as Record<string, unknown>).semantic_available).toBe(false);
  });

  it('incompatible environment is demoted with mismatches and reference_only (FR-015/016, G2)', async () => {
    await seedVerifiedEpisode(CTX.scope_id, { os: 'windows', node: '22' }, 'npm ERR code ERESOLVE');
    const hash = normalizeFailure('npm ERR code ERESOLVE exited with code 1', [], 1).normalized_hash;
    const out = await service.search({
      query: 'ERESOLVE dependency installation',
      scope_id: CTX.scope_id,
      failure_signature_hash: hash,
      environment: { os: 'linux', node: '20' },
    });
    const results = out.result.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect((results[0].applicability as Record<string, unknown>).mismatches).toEqual(expect.arrayContaining(['os']));
    expect(results[0].recommended_use).toBe('reference_only');
  });

  it('cross-scope search returns nothing (FR-027; detailed leaks test in isolation.test.ts)', async () => {
    await seedVerifiedEpisode(CTX.scope_id, { os: 'linux' }, 'npm ERR code ERESOLVE');
    const hash = normalizeFailure('npm ERR code ERESOLVE exited with code 1', [], 1).normalized_hash;
    const out = await service.search({ query: 'ERESOLVE', scope_id: 'other-repo', failure_signature_hash: hash });
    expect(out.result.results).toEqual([]);
  });

  it('reuse feedback: harmful verdict demotes the episode (SC-009, FR-024)', async () => {
    await seedVerifiedEpisode(CTX.scope_id, { os: 'linux', node: '20' }, 'npm ERR code ERESOLVE');
    const hash = normalizeFailure('npm ERR code ERESOLVE exited with code 1', [], 1).normalized_hash;
    const before = await service.search({ query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, failure_signature_hash: hash, environment: { os: 'linux', node: '20' } });
    const id = ((before.result.results as Array<Record<string, unknown>>)[0]).experience_id as string;

    const { result } = await service.startWorkflow({ goal: 'g2', scope_id: CTX.scope_id, client_context: CTX });
    await service.recordReuseFeedback({ workflow_id: result.workflow_id as string, experience_id: id, verdict: 'harmful', client_context: CTX });

    // Seed a second, non-flagged verified episode so a ranking comparison exists
    await seedVerifiedEpisode(CTX.scope_id, { os: 'linux', node: '20' }, 'npm ERR code ERESOLVE');
    const after = await service.search({ query: 'ERESOLVE dependency installation', scope_id: CTX.scope_id, failure_signature_hash: hash, environment: { os: 'linux', node: '20' } });
    const results = after.result.results as Array<Record<string, unknown>>;
    const idx = results.findIndex((r) => r.experience_id === id);
    // Demotion observable: no longer top-ranked once a clean peer exists
    expect(idx !== 0).toBe(true);
  });
});

async function makeAdapter(dir: string) {
  const adapter = new SqliteAdapter(join(dir, 'store.db'));
  await adapter.init();
  return adapter;
}
