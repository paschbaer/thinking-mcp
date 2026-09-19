/**
 * Cross-project lesson visibility contract tests (spec §18.3 visibility
 * levels + FR-027 existence-leak protection):
 * - public lessons are found by any scope
 * - repository-scoped episodes remain invisible to other scopes
 * - unpublish narrows visibility back
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { normalizeFailure } from '../../src/domain/normalize.ts';

let dir: string;
let service: EmmsService;
const FAILURE = 'npm ERR code ERESOLVE';
const HASH = normalizeFailure(`${FAILURE} exited with code 1`, [], 1).normalized_hash;

async function seedVerified(scope: string, goal: string): Promise<{ exp: string; wf: string }> {
  const ctx = { scope_id: scope, agent_id: 'local-agent' };
  const { result } = await service.startWorkflow({ goal, scope_id: scope, client_context: ctx });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: `${FAILURE} exited with code 1`, exit_code: 1, expected_revision: rev++, client_context: ctx });
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: '{"os":"linux"}', expected_revision: rev++, client_context: ctx });
  await service.putEnvironmentDirect(wf, { os: 'linux' }, scope);
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peer dependency versions', expected_revision: rev++, client_context: ctx });
  await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: rev++, client_context: ctx });
  await service.proposeSolution({ workflow_id: wf, strategy: 'align peers', mechanism: 'semver', checks: [
    { criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
  ], expected_revision: rev++, client_context: ctx });
  const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('pass').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev++, client_context: ctx });
  await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev++, client_context: ctx });
  await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: rev, client_context: ctx });
  return { exp: result.experience_id as string, wf };
}

describe('cross-project lesson visibility (§18.3, FR-027)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-vis-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('repository-scoped episode invisible to other scopes (baseline)', async () => {
    await seedVerified('niyama-lessons', 'fix build');
    const out = await service.search({ query: FAILURE, scope_id: 'other-project', failure_signature_hash: HASH });
    expect((out.result.results as unknown[]).length).toBe(0);
  });

  it('lesson_publish widens to public — found from any scope', async () => {
    const { exp } = await seedVerified('niyama-lessons', 'fix build');
    const { result } = await service.startWorkflow({ goal: 'publish', scope_id: 'niyama-lessons', client_context: { scope_id: 'niyama-lessons' } });
    await service.lesson_publish({
      workflow_id: result.workflow_id as string,
      experience_id: exp,
      expected_revision: (await service.status(result.workflow_id as string, { scope_id: 'niyama-lessons' })).guidance.revision,
      client_context: { scope_id: 'niyama-lessons' },
    });

    const out = await service.search({ query: FAILURE, scope_id: 'different-project', failure_signature_hash: HASH });
    const results = out.result.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.experience_id === exp)).toBe(true);
  });

  it('lesson_unpublish narrows visibility back to repository-only', async () => {
    const { exp } = await seedVerified('niyama-lessons', 'fix build');
    const { result } = await service.startWorkflow({ goal: 'unpub', scope_id: 'niyama-lessons', client_context: { scope_id: 'niyama-lessons' } });
    const wf = result.workflow_id as string;
    let rev = (await service.status(wf, { scope_id: 'niyama-lessons' })).guidance.revision;

    await service.lesson_publish({ workflow_id: wf, experience_id: exp, expected_revision: rev, client_context: { scope_id: 'niyama-lessons' } });
    rev = (await service.status(wf, { scope_id: 'niyama-lessons' })).guidance.revision;
    await service.lesson_unpublish({ workflow_id: wf, experience_id: exp, expected_revision: rev, client_context: { scope_id: 'niyama-lessons' } });

    const out = await service.search({ query: FAILURE, scope_id: 'other-project', failure_signature_hash: HASH });
    expect((out.result.results as unknown[]).length).toBe(0);
  });
});
