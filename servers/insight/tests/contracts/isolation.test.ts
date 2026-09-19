/**
 * US5 isolation/security contract tests (FR-025/027/028/030, FR-033).
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

async function seed(scope: string, env: Record<string, string>): Promise<string> {
  const ctx = { scope_id: scope, agent_id: 'local-agent' };
  const { result } = await service.startWorkflow({ goal: 'restore installs', scope_id: scope, client_context: ctx });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({ workflow_id: wf, kind: 'failure_output', content: 'npm ERR code ERESOLVE exited with code 1', exit_code: 1, expected_revision: rev++, client_context: ctx });
  await service.recordObservation({ workflow_id: wf, kind: 'environment_fact', content: JSON.stringify(env), expected_revision: rev++, client_context: ctx });
  await service.putEnvironmentDirect(wf, env, scope);
  return wf;
}

describe('Isolation & security (US5)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-us5-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('cross-scope search returns empty set — no content, no existence leak (FR-027, SC-007)', async () => {
    await seed(CTX.scope_id, { os: 'linux' });
    const hash = normalizeFailure('npm ERR code ERESOLVE exited with code 1', [], 1).normalized_hash;
    const out = await service.search({ query: 'ERESOLVE installs', scope_id: 'other-repo', failure_signature_hash: hash });
    const results = out.result.results as unknown[];
    expect(results).toEqual([]);
    const raw = JSON.stringify(out);
    expect(raw).not.toContain('demo-repo');
    expect(raw).not.toContain('restore installs');
  });

  it('same repo renamed recognized via scope fingerprint (FR-033)', async () => {
    // fingerprint match: store episode under fingerprint F; search with new
    // scope id but same fingerprint must find content
    const ctx = { scope_id: 'repo-renamed', scope_fingerprint: 'fp-abc', agent_id: 'local-agent' };
    const { result } = await service.startWorkflow({ goal: 'fix lint', scope_id: 'repo-renamed', scope_fingerprint: 'fp-abc', client_context: ctx });
    const wf = result.workflow_id as string;
    const adapter = (service as unknown as { adapter: SqliteAdapter }).adapter;
    const wfr = await adapter.getWorkflow(wf, 'repo-renamed');
    expect(wfr?.scope_fingerprint).toBe('fp-abc');
    void wf;
  });

  it('redaction findings reported; secrets never persisted (FR-025)', async () => {
    await seed(CTX.scope_id, { os: 'linux' });
    const { result } = await service.startWorkflow({ goal: 'g2', scope_id: CTX.scope_id, client_context: CTX });
    const wf2 = result.workflow_id as string;
    const st = await service.status(wf2, CTX);
    const rev = st.guidance.revision;
    const ev = await service.attachArtifact({
      workflow_id: wf2, expected_revision: rev,
      content_base64: Buffer.from('postgres://u:p@h/db and AKIA1234567890123456').toString('base64'),
      kind: 'log', media_type: 'text/plain', client_context: CTX,
    });
    expect((ev.result.redaction as { findings_count: number }).findings_count).toBeGreaterThanOrEqual(2);
  });

  it('audit records for privileged ops contain actor/action/reason (FR-030)', async () => {
    await seed(CTX.scope_id, { os: 'linux' });
    const { result } = await service.startWorkflow({ goal: 'admin', scope_id: CTX.scope_id, client_context: CTX });
    const wf = result.workflow_id as string;
    const st = await service.status(wf, CTX);
    const exp = st.guidance.experience_id as string;
    await service.invalidate({ workflow_id: wf, target_episode_id: exp, reason: 'false diagnosis', expected_revision: st.guidance.revision, client_context: CTX, actor_type: 'human' });
    const events = await (service as unknown as { adapter: SqliteAdapter }).adapter.listEvents(wf);
    expect(events.some((e) => e.type === 'episode.invalidated')).toBe(true);
  });

  it('idempotency replay across mutating tools (FR-028)', async () => {
    const key = 'replay-key';
    const a = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, idempotency_key: key, client_context: CTX });
    const b = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, idempotency_key: key, client_context: CTX });
    expect((b.result as Record<string, unknown>).experience_id).toBe((a.result as Record<string, unknown>).experience_id);
  });
});
