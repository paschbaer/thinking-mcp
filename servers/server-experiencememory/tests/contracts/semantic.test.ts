/**
 * Semantic retrieval arm contract tests (FR-014, spec Clarifications):
 * - with provider: semantic arm active, near-miss with same words but different
 *   subsystem retrieved (the case exact/FTS arms cannot handle well)
 * - provider unavailable: search still works, semantic_available: false
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { TransformersEmbedding, cosineSimilarity, type EmbeddingProvider } from '../../src/retrieval/semantic.ts';

const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

class UnavailableEmbedding implements EmbeddingProvider {
  async available(): Promise<boolean> { return false; }
  async embed(): Promise<Float32Array | null> { return null; }
}

let dir: string;
let adapter: SqliteAdapter;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'emms-sem-'));
  adapter = new SqliteAdapter(join(dir, 's.db'));
  await adapter.init();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function seedVerifiedEpisode(service: EmmsService, summary: string): Promise<string> {
  const { result } = await service.startWorkflow({ goal: summary, scope_id: CTX.scope_id, client_context: CTX });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR code ERESOLVE exited with code 1', exit_code: 1, expected_revision: rev++, client_context: CTX });
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: '{"os":"linux","node":"20"}', expected_revision: rev++, client_context: CTX });
  await service.putEnvironmentDirect(wf, { os: 'linux', node: '20' }, CTX.scope_id);
  const att = await service.recordAttempt({ workflow_id: wf, intent: 'align peer dependency versions', expected_revision: rev++, client_context: CTX });
  await service.completeAttempt({ workflow_id: wf, attempt_id: att.result.attempt_id as string, outcome: 'ok', classification: 'successful', expected_revision: rev++, client_context: CTX });
  await service.proposeSolution({ workflow_id: wf, strategy: 'align peers', mechanism: 'semver', checks: [
    { criterion: 'clean install exits 0', test_type: 'build', expected_result: 'exit 0', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true },
  ], expected_revision: rev++, client_context: CTX });
  const ev = await service.attachArtifact({ workflow_id: wf, content_base64: Buffer.from('pass').toString('base64'), kind: 'log', media_type: 'text/plain', expected_revision: rev++, client_context: CTX });
  await service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', exit_code: 0, evidence_artifact_id: ev.result.artifact_id as string, expected_revision: rev++, client_context: CTX });
  await service.finalize({ workflow_id: wf, requested_outcome: 'verified', expected_revision: rev, client_context: CTX });
  return result.experience_id as string;
}

describe('semantic retrieval arm', () => {
  it('cosineSimilarity: identical vectors = 1, orthogonal = 0', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0);
  });

  it('TransformersEmbedding produces normalized 384-dim vectors', async () => {
    const emb = new TransformersEmbedding();
    const vec = await emb.embed('npm peer dependency conflict');
    expect(vec).not.toBeNull();
    expect(vec!.length).toBe(384);
    const norm = Math.sqrt(vec!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 1);
  }, 120_000);

  it('semantic arm retrieves paraphrased problem that exact/FTS would rank lower', async () => {
    const embedding = new TransformersEmbedding();
    const service = new EmmsService(adapter, join(dir, 'art'), undefined, embedding);
    // Episode summary uses DIFFERENT wording than the query
    const expId = await seedVerifiedEpisode(service, 'restoring reproducible dependency installation across peer ranges');
    const out = await service.search({
      query: 'cannot install packages because of conflicting version requirements',
      scope_id: CTX.scope_id,
      environment: { os: 'linux', node: '20' },
    });
    const results = out.result.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    const notes = (out.result as Record<string, unknown>).retrieval_notes as Record<string, unknown>;
    expect(notes.semantic_available).toBe(true);
    // paraphrased query should still surface the episode via semantic similarity
    expect(results.some((r) => r.experience_id === expId)).toBe(true);
  }, 180_000);

  it('unavailable provider: search works and reports semantic_available: false', async () => {
    const service = new EmmsService(adapter, join(dir, 'art'), undefined, new UnavailableEmbedding());
    await seedVerifiedEpisode(service, 'dependency install fix');
    const out = await service.search({ query: 'ERESOLVE install', scope_id: CTX.scope_id });
    const notes = (out.result as Record<string, unknown>).retrieval_notes as Record<string, unknown>;
    expect(notes.semantic_available).toBe(false);
    const results = out.result.results as unknown[];
    expect(results.length).toBeGreaterThan(0); // FTS arm still delivers
  });
});
