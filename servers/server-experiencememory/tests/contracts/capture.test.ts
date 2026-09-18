import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';

let dir: string;
let service: EmmsService;
const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };
const CHECK = {
  criterion: 'clean install exits 0',
  test_type: 'build',
  expected_result: 'exit 0',
  regression_coverage: false,
  timeout_s: 300,
  evidence_requirement: true,
  targets_original_failure: true,
};
const REGRESSION_CHECK = { ...CHECK, criterion: 'unit tests pass', regression_coverage: true, targets_original_failure: false };

async function startEpisode(): Promise<{ wf: string; rev: number }> {
  const { result } = await service.startWorkflow({
    goal: 'fix install', scope_id: CTX.scope_id, problem_summary: 'ERESOLVE',
    idempotency_key: 'wf-' + Math.random(), client_context: CTX,
  });
  return { wf: result.workflow_id as string, rev: result.revision as number };
}

describe('Capture contract (FR-001..009, FR-019/028/029/032)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-cap-'));
    service = new EmmsService(await makeAdapter(dir), join(dir, 'artifacts'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('state transitions are gated (FR-019): no validation run before solution', async () => {
    const { wf, rev } = await startEpisode();
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR ERESOLVE exited with code 1', exit_code: 1, expected_revision: rev, client_context: CTX });
    await expect(
      service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', expected_revision: rev + 1, client_context: CTX })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('provenance is recorded on observations (FR-032)', async () => {
    const { wf, rev } = await startEpisode();
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'fail', expected_revision: rev, client_context: { ...CTX, trace_id: 'tr-1' } });
    // provenance persisted via events + observations table; assert via durability of events
    const events = await (service as unknown as { adapter: { listEvents: (id: string) => Promise<{ type: string }[]> } }).adapter.listEvents(wf);
    expect(events.some((e) => e.type === 'observation.recorded')).toBe(true);
  });

  it('verified status requires objective evidence on every check (FR-008)', async () => {
    const { wf, rev } = await startEpisode();
    let r = rev;
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR ERESOLVE exited with code 1', exit_code: 1, expected_revision: r, client_context: CTX }); r++;
    await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: 'node 20 linux', expected_revision: r, client_context: CTX }); r++;
    const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peer deps', expected_revision: r, client_context: CTX }); r++;
    await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'installed cleanly', classification: 'successful', expected_revision: r, client_context: CTX }); r++;
    const sol = await service.proposeSolution({ workflow_id: wf, strategy: 'align peers', mechanism: 'semver align', checks: [CHECK, REGRESSION_CHECK], expected_revision: r, client_context: CTX }); r++;
    void sol;
    const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('install log: exit 0').toString('base64'), kind: 'test_report', media_type: 'text/plain', expected_revision: r, client_context: CTX }); r++;
    const evidenceId = ev.result.artifact_id as string;
    await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: evidenceId, expected_revision: r, client_context: CTX }); r++;

    // Missing regression run => finalize(verified) must NOT verify
    await expect(
      service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: r, client_context: CTX })
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_EVIDENCE', details: { missing: expect.arrayContaining(['checks[1].passed_evidence']) } });

    await service.recordValidationRun({ workflow_id: wf, check_index: 1, status: 'passed', exit_code: 0, evidence_artifact_id: evidenceId, expected_revision: r, client_context: CTX }); r++;
    const fin = await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: r, client_context: CTX });
    expect(fin.result.final_state).toBe('LOCALLY_VERIFIED');
  });

  it('harmful attempt without resolution blocks verified status (FR-008 side effects)', async () => {
    const { wf, rev } = await startEpisode();
    let r = rev;
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'boom exited with code 1', exit_code: 1, expected_revision: r, client_context: CTX }); r++;
    await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: 'node 20', expected_revision: r, client_context: CTX }); r++;
    const att = await service.recordAttempt({ workflow_id: wf, intent: 'disable peer checks', expected_revision: r, client_context: CTX }); r++;
    await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'broke runtime', classification: 'harmful', expected_revision: r, client_context: CTX }); r++;
    await service.proposeSolution({ workflow_id: wf, strategy: 'retry', mechanism: 'same', checks: [CHECK], expected_revision: r, client_context: CTX }); r++;
    const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('ok').toString('base64'), kind: 'test_report', media_type: 'text/plain', expected_revision: r, client_context: CTX }); r++;
    await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: r, client_context: CTX }); r++;
    await expect(
      service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: r, client_context: CTX })
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_EVIDENCE', details: { missing: expect.arrayContaining(['unresolved_critical_side_effect']) } });
  });

  it('idempotent replay returns the original result, no duplicates (FR-028)', async () => {
    const key = 'start-once';
    const a = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, idempotency_key: key, client_context: CTX });
    const b = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, idempotency_key: key, client_context: CTX });
    expect(b.result.experience_id).toBe(a.result.experience_id);
  });

  it('stale revision is rejected with current revision (D2)', async () => {
    const { wf, rev } = await startEpisode();
    await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: 'node 20', expected_revision: rev, client_context: CTX });
    await expect(
      service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: 'node 22', expected_revision: rev, client_context: CTX })
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    try {
      await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: 'x', expected_revision: rev, client_context: CTX });
    } catch (e) {
      expect((e as { current_revision?: number }).current_revision ?? (e as { details?: { current_revision?: number } }).details?.current_revision).toBeGreaterThan(rev);
    }
  });

  it('abandon finalizes UNRESOLVED and retains evidence (FR-009/030)', async () => {
    const { wf, rev } = await startEpisode();
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'fail', expected_revision: rev, client_context: CTX });
    const out = await service.abandon(wf, CTX, rev + 1, 'budget exhausted');
    expect(out.result.final_state).toBe('UNRESOLVED');
    const status = await service.status(wf, CTX);
    expect(status.result.state).toBe('UNRESOLVED');
  });

  it('artifact redaction before persistence + hash verify (FR-025/031)', async () => {
    const { wf, rev } = await startEpisode();
    const secret = 'token=AKIAIOSFODNN7EXAMPLE and /home/alice/file\n';
    const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from(secret).toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev, client_context: CTX });
    expect(ev.result.redaction).toMatchObject({ status: 'completed' });
    expect((ev.result.redaction as { findings_count: number }).findings_count).toBeGreaterThanOrEqual(2);
    const stored = readFileSync(join(dir, 'artifacts', (ev.result.content_hash as string).replace('sha256:', '') + '.bin'), 'utf8');
    expect(stored).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('tampered artifact between record_run and finalize blocks verification (FR-008a)', async () => {
    const { wf, rev } = await startEpisode();
    let r = rev;
    await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR ERESOLVE exited with code 1', exit_code: 1, expected_revision: r, client_context: CTX }); r++;
    await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: '{"os":"linux"}', expected_revision: r, client_context: CTX }); r++;
    const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peers', expected_revision: r, client_context: CTX }); r++;
    await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: r, client_context: CTX }); r++;
    await service.proposeSolution({ workflow_id: wf, strategy: 'align', mechanism: 'semver', checks: [CHECK, REGRESSION_CHECK], expected_revision: r, client_context: CTX }); r++;
    const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('original evidence').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: r, client_context: CTX }); r++;
    const evidenceId = ev.result.artifact_id as string;
    const contentHash = (ev.result.content_hash as string).replace('sha256:', '');
    await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: evidenceId, expected_revision: r, client_context: CTX }); r++;
    await service.recordValidationRun({ workflow_id: wf, check_index: 1, status: 'passed', exit_code: 0, evidence_artifact_id: evidenceId, expected_revision: r, client_context: CTX }); r++;

    // Tamper: overwrite the content-addressed file after the runs
    writeFileSync(join(dir, 'artifacts', contentHash + '.bin'), 'tampered content');

    await expect(
      service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: r, client_context: CTX })
    ).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
  });

  it('oversized and disallowed artifacts are rejected (FR-031)', async () => {
    const { wf, rev } = await startEpisode();
    await expect(
      service.attachArtifact({ workflow_id: wf, content_base64: Buffer.alloc(2 * 1024 * 1024).toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev, client_context: CTX })
    ).rejects.toMatchObject({ code: 'ARTIFACT_REJECTED' });
    await expect(
      service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('x').toString('base64'), kind: 'log', media_type: 'application/zip', expected_revision: rev, client_context: CTX })
    ).rejects.toMatchObject({ code: 'ARTIFACT_REJECTED' });
  });

  it('durability: state survives reopen mid-workflow (FR-009)', async () => {
    const path = join(dir, 'store.db');
    const adapter = new SqliteAdapter(path);
    await adapter.init();
    const svc = new EmmsService(adapter, join(dir, 'artifacts'));
    const { result } = await svc.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, client_context: CTX });
    await svc.recordObservation({ workflow_id: result.workflow_id as string, kind: 'failure_output', content: 'fail', expected_revision: 1, client_context: CTX });
    await adapter.close();

    const adapter2 = new SqliteAdapter(path);
    await adapter2.init();
    const svc2 = new EmmsService(adapter2, join(dir, 'artifacts'));
    const status = await svc2.status(result.workflow_id as string, CTX);
    expect(status.result.state).toBe('OBSERVED');
    await adapter2.close();
  });
});

async function makeAdapter(dir: string) {
  const adapter = new SqliteAdapter(join(dir, 'store.db'));
  await adapter.init();
  return adapter;
}

void writeFileSync;
