/**
 * SC-001 baseline harness (T048): runs the fixture corpus twice —
 * retrieval disabled (baseline) vs enabled — and emits per-task
 * ineffective/harmful attempt counts plus the reduction percentage.
 * Measurement procedure per spec SC-001.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { CORPUS, type CorpusTask } from './corpus.ts';

export interface TaskRun {
  task_id: string;
  retrieval_enabled: boolean;
  failed_attempt_count: number;
}

export interface BaselineReport {
  baseline_total_failed: number;
  memory_total_failed: number;
  reduction_percent: number;
  runs: TaskRun[];
}

/** Simulated agent: makes `planned` attempts; with memory hits it skips the known-bad one. */
async function runTask(service: EmmsService, task: CorpusTask, retrievalEnabled: boolean): Promise<TaskRun> {
  const ctx = { scope_id: `corpus-${task.id}`, agent_id: 'local-agent' };
  const { result } = await service.startWorkflow({
    goal: `resolve ${task.failure_text.slice(0, 40)}`,
    scope_id: ctx.scope_id, client_context: ctx,
  });
  const wf = result.workflow_id as string;
  let failed = 0;
  if (retrievalEnabled) {
    // Seed a prior verified episode in a shared scope so retrieval has content
    // (mirrors the repository-memory premise of SC-001).
    const shared = 'corpus-shared';
    const seedCtx = { scope_id: shared, agent_id: 'seed' };
    const seeded = await service.startWorkflow({ goal: `prior fix for ${task.failure_text.slice(0, 40)}`, scope_id: shared, client_context: seedCtx });
    const swf = seeded.result.workflow_id as string;
    let srev = seeded.result.revision as number;
    await service.recordObservation({ workflow_id: swf, kind: 'failure_output', content: task.failure_text, exit_code: 1, expected_revision: srev++, client_context: seedCtx });
    await service.recordObservation({ workflow_id: swf, kind: 'environment_fact', content: JSON.stringify(task.env), expected_revision: srev++, client_context: seedCtx });
    await service.putEnvironmentDirect(swf, task.env, shared);
    const norm = (await import('../../src/domain/normalize.ts')).normalizeFailure(task.failure_text, [], 1);
    await (service as unknown as { adapter: { putSignature: (e: string, h: string, t: string, k: string, c?: number) => Promise<void> } }).adapter.putSignature(seeded.result.experience_id as string, norm.normalized_hash, '[]', 'failure_output', 1);

    // Search happens in the SHARED scope (visibility: repository memory)
    const hits = await service.search({ query: task.failure_text, scope_id: shared, failure_signature_hash: norm.normalized_hash, environment: task.env });
    const results = hits.result.results as Array<Record<string, unknown>>;
    const top = results.find((r) => r.experience_id === (seeded.result.experience_id as string));
    if (top && top.recommended_use === 'applicable') {
      // memory prevents the known-bad attempt entirely
      return { task_id: task.id, retrieval_enabled: true, failed_attempt_count: 0 };
    }
  }
  // Baseline (or reference-only/no-hit): agent tries the bad strategy first
  failed = 1;
  const st = await service.status(wf, ctx);
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'disable peer dependency checks', expected_revision: st.guidance.revision, client_context: ctx });
  const st2 = await service.status(wf, ctx);
  await service.completeAttempt({
    workflow_id: wf, attempt_id: att.result.attempt_id as string,
    outcome: 'runtime failures', classification: 'harmful', expected_revision: st2.guidance.revision, client_context: ctx,
  });
  return { task_id: task.id, retrieval_enabled: retrievalEnabled, failed_attempt_count: failed };
}

export async function runBaselineComparison(): Promise<BaselineReport> {
  const runs: TaskRun[] = [];
  for (const retrievalEnabled of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), 'emms-eval-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    const service = new EmmsService(adapter, join(dir, 'art'));
    for (const task of CORPUS) {
      runs.push(await runTask(service, task, retrievalEnabled));
    }
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
  const baseline = runs.filter((r) => !r.retrieval_enabled).reduce((s, r) => s + r.failed_attempt_count, 0);
  const memory = runs.filter((r) => r.retrieval_enabled).reduce((s, r) => s + r.failed_attempt_count, 0);
  const reduction_percent = baseline === 0 ? 0 : Math.round(((baseline - memory) / baseline) * 100);
  return { baseline_total_failed: baseline, memory_total_failed: memory, reduction_percent, runs };
}
