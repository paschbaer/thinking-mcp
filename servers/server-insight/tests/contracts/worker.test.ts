/**
 * Consolidation Worker contract tests: stale scan, dedup, lesson promotion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { ConsolidationWorker } from '../../src/consolidation/worker.ts';

const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };
let dir: string;
let service: EmmsService;
let worker: ConsolidationWorker;

async function seedVerified(failure: string): Promise<void> {
  const { result } = await service.startWorkflow({ goal: `fix: ${failure.slice(0, 40)}`, scope_id: CTX.scope_id, client_context: CTX });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: `${failure} exited with code 1`, exit_code: 1, expected_revision: rev++, client_context: CTX });
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peers', expected_revision: rev++, client_context: CTX });
  await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: rev++, client_context: CTX });
  await service.proposeSolution({ workflow_id: wf, strategy: 'align', mechanism: 'semver', checks: [
    { criterion: 'c', test_type: 'build', expected_result: 'ok', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
  ], expected_revision: rev++, client_context: CTX });
  const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('pass').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev++, client_context: CTX });
  await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev++, client_context: CTX });
  await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: rev, client_context: CTX });
}

describe('ConsolidationWorker (Phase 3)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-worker-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
    worker = new ConsolidationWorker(adapter, service.lessons, { staleDays: 90 });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runOnce returns report without errors on empty store', async () => {
    const report = await worker.runOnce();
    expect(report.errors).toHaveLength(0);
    expect(report.scopes_scanned).toBeGreaterThanOrEqual(0);
  });

  it('stale_flagged counts episodes past threshold', async () => {
    await seedVerified('npm ERR code ERESOLVE');
    const report = await worker.runOnce();
    // Fresh episodes (just verified) should NOT be stale
    expect(report.stale_flagged).toBe(0);
  });

  it('dedup_groups counts duplicate groups', async () => {
    await seedVerified('npm ERR code ERESOLVE');
    await seedVerified('npm ERR code ERESOLVE');
    const report = await worker.runOnce();
    expect(report.dedup_groups).toBeGreaterThanOrEqual(1);
  });

  it('lessons_promoted counts auto-proposed lessons', async () => {
    await seedVerified('npm ERR code ERESOLVE');
    const report = await worker.runOnce();
    expect(report.lessons_promoted).toBeGreaterThanOrEqual(1);
  });

  it('worker start/stop lifecycle works', () => {
    worker.start();
    worker.stop();
    // No timer leak — no assertion needed, just ensure no throw
  });
});
