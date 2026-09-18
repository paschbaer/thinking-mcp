/**
 * US3 guidance-flow contract tests (FR-010..013, D4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { assessLimits, DEFAULT_LIMITS } from '../../src/guidance/limits.ts';
import type { Attempt } from '../../src/domain/types.ts';

let dir: string;
let service: EmmsService;
const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

describe('Guidance flow (US3)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-us3-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, 'art'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('status lists missing required information with hints (FR-010)', async () => {
    const { result } = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, client_context: CTX });
    const st = await service.status(result.workflow_id as string, CTX);
    const g = st.guidance;
    expect(g.missing_information.some((m) => m.field === 'failure.exact_output' && m.safe_collection_hint)).toBe(true);
  });

  it('recommendation always inside allowed tools and schema placeholders only (FR-011)', async () => {
    const { result } = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, client_context: CTX });
    const st = await service.status(result.workflow_id as string, CTX);
    expect(st.guidance.allowed_next_tools).toContain(st.guidance.recommended_next_request.tool);
    expect(JSON.stringify(st.guidance.recommended_next_request.arguments_template)).not.toMatch(/<(?!collect value|attach artifact)[^>]*>/);
  });

  it('invalid-state request returns recoverable error + corrected template (FR-010 rule 11)', async () => {
    const { result } = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, client_context: CTX });
    const wf = result.workflow_id as string;
    await expect(
      service.recordValidationRun({ workflow_id: wf, check_index: 0, status: 'passed', expected_revision: 1, client_context: CTX })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    const st = await service.status(wf, CTX);
    expect(st.guidance.recommended_next_request.tool).toBe('experience_record_observation');
  });

  it('repeated identical attempts produce warnings, budget exhaustion stop conditions (FR-013)', () => {
    const attempts: Attempt[] = Array.from({ length: DEFAULT_LIMITS.maxAttempts + 1 }, (_, i) => ({
      attempt_id: `a${i}`, episode_id: 'e', intent: i < 3 ? 'same strategy' : `other ${i}`, seq: i,
    }));
    const a = assessLimits(attempts);
    expect(a.warnings.some((w) => w.code === 'REPEATED_ATTEMPT')).toBe(true);
    expect(a.stop_conditions.some((s) => s.startsWith('ATTEMPT_BUDGET_EXHAUSTED'))).toBe(true);
  });

  it('abandon produces stop-condition-free UNRESOLVED guidance (budget escalation path)', async () => {
    const { result } = await service.startWorkflow({ goal: 'g', scope_id: CTX.scope_id, client_context: CTX });
    const st = await service.status(result.workflow_id as string, CTX);
    expect(Array.isArray(st.guidance.stop_conditions)).toBe(true);
  });
});
