/**
 * Lesson consolidation contract tests (FR-022 as scoped, D5 thresholds):
 * candidate → provisional → verified promotion; contested via
 * counterexamples; lesson_search/get round-trip.
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
const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

async function seedVerified(scope: string, failure: string): Promise<string> {
  const ctx = { scope_id: scope, agent_id: 'local-agent' };
  const { result } = await service.startWorkflow({ goal: `fix: ${failure.slice(0, 40)}`, scope_id: scope, client_context: ctx });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: `${failure} exited with code 1`, exit_code: 1, expected_revision: rev++, client_context: ctx });
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: '{"os":"linux"}', expected_revision: rev++, client_context: ctx });
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peer dependency versions', expected_revision: rev++, client_context: ctx });
  await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: rev++, client_context: ctx });
  await service.proposeSolution({ workflow_id: wf, strategy: 'align peers', mechanism: 'semver', checks: [
    { criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
  ], expected_revision: rev++, client_context: ctx });
  const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('pass').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev++, client_context: ctx });
  await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev++, client_context: ctx });
  const fin = await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: rev, client_context: ctx });
  return fin.result.final_state as string === 'LOCALLY_VERIFIED' ? result.experience_id as string : 'FAIL';
}

const hash = (failure: string) => normalizeFailure(`${failure} exited with code 1`, [], 1).normalized_hash;

describe('lesson consolidation (FR-022 scoped, D5 thresholds)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-lesson-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('propose with 0 verified episodes → lesson: null', async () => {
    const out = await service.lesson_propose({
      normalized_hash: hash('unique unknown failure'), pattern: 'unique',
      rule: 'r', recommended_strategy: 's', scope_id: CTX.scope_id,
    });
    expect(out.result.lesson).toBeNull();
  });

  it('1 verified episode → candidate (D5 threshold)', async () => {
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    const out = await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    const lesson = out.result.lesson as Record<string, unknown>;
    expect(lesson).not.toBeNull();
    expect(lesson.status).toBe('candidate');
  });

  it('2 independent verified episodes → provisional (D5 threshold)', async () => {
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    const out = await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    const lesson = out.result.lesson as Record<string, unknown>;
    expect(lesson.status).toBe('provisional');
  });

  it('3 verified episodes → verified (D5 threshold)', async () => {
    for (let i = 0; i < 3; i++) await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    const out = await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    const lesson = out.result.lesson as Record<string, unknown>;
    expect(lesson.status).toBe('verified');
  });

  it('harmful attempt + successful → lesson still verified but contradiction flagged elsewhere', async () => {
    // This scenario is covered by the dedup tests (hasContradiction).
    // Here we verify the contested path via contradicting episodes:
    // seed 2 verified + 1 with harmful-only (no successful resolution)
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    // seed a harmful episode with the same signature (not verified)
    const ctx = CTX;
    const { result } = await service.startWorkflow({ goal: 'harmful attempt', scope_id: CTX.scope_id, client_context: ctx });
    const wf = result.workflow_id as string;
    let rev = result.revision as number;
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR code ERESOLVE exited with code 1', exit_code: 1, expected_revision: rev++, client_context: ctx });
    const att = await service.recordAttempt({ workflow_id: wf, intent: 'disable peer checks', expected_revision: rev++, client_context: ctx });
    await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'broke runtime', classification: 'harmful', expected_revision: rev++, client_context: ctx });

    const out = await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    // 2 verified supporting, 1 harmful not blocking provisional (no verified contradiction)
    const lesson = out.result.lesson as Record<string, unknown>;
    expect(lesson).not.toBeNull();
    // The harmful attempt (same signature, harmful classification) marks the
    // lesson CONTESTED per D5 — a contradicting outcome is present even
    // though the attempt itself wasn't a verified episode (FR-021: any
    // contradicting outcome marks contested).
    expect(lesson.status).toBe('contested');
  });

  it('lesson_search returns stored lessons', async () => {
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    const out = await service.lesson_search('ERESOLVE');
    expect((out.result as Record<string, unknown>).count).toBeGreaterThan(0);
  });

  it('lesson_get returns lesson by id', async () => {
    await seedVerified(CTX.scope_id, 'npm ERR code ERESOLVE');
    const prop = await service.lesson_propose({
      normalized_hash: hash('npm ERR code ERESOLVE'), pattern: 'ERESOLVE',
      rule: 'Align peer versions', recommended_strategy: 'semver align',
      scope_id: CTX.scope_id,
    });
    const lesson = prop.result.lesson as Record<string, unknown>;
    const out = await service.lesson_get(lesson.lesson_id as string);
    const got = out.result as Record<string, unknown>;
    expect(got.lesson_id ?? got.rule).toBeDefined();
  });
});
