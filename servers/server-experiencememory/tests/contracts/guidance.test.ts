import { describe, it, expect } from 'vitest';
import {
  GuidanceEnvelopeSchema,
  assertPlaceholdersOnly,
  validateEnvelope,
  severityFor,
  type GuidanceEnvelope,
} from '../../src/guidance/envelope.ts';
import { buildGuidance } from '../../src/guidance/engine.ts';
import type { Workflow } from '../../src/domain/types.ts';

const wf: Workflow = {
  workflow_id: 'wf1',
  experience_id: 'exp1',
  goal: 'fix build',
  scope_id: 'repo-a',
  state: 'OBSERVED',
  revision: 4,
  actor_id: 'local-agent',
  created_at: '2026-09-17T00:00:00Z',
};

const baseInput = {
  workflow: wf,
  episode: undefined,
  hasFailureObservation: true,
  hasEnvironmentFact: true,
  hasAttempt: false,
  hasSolution: false,
  hasValidationPlan: false,
  hasVerifiedOriginal: false,
  hasVerifiedRegression: false,
};

describe('GuidanceEnvelope contract (FR-010..013, D4)', () => {
  it('schema validates a well-formed envelope', () => {
    const env = buildGuidance(baseInput);
    expect(GuidanceEnvelopeSchema.parse(env)).toBeTruthy();
  });

  it('recommended tool is always in allowed_next_tools (invariant 1)', () => {
    for (const state of ['DRAFT', 'OBSERVED', 'DIAGNOSING', 'SOLUTION_PROPOSED', 'VALIDATING', 'LOCALLY_VERIFIED'] as const) {
      const env = buildGuidance({ ...baseInput, workflow: { ...wf, state } });
      expect(env.allowed_next_tools).toContain(env.recommended_next_request.tool);
    }
  });

  it('prefers evidence collection over speculative diagnosis (invariant 7)', () => {
    const env = buildGuidance({ ...baseInput, hasFailureObservation: false, workflow: { ...wf, state: 'OBSERVED' } });
    expect(env.recommended_next_request.tool).toBe('experience.record_observation');
    expect(env.missing_information.some((m) => m.field === 'failure.exact_output')).toBe(true);
  });

  it('template uses only reserved placeholders (invariant, FR-011)', () => {
    const env = buildGuidance({ ...baseInput, workflow: { ...wf, state: 'VALIDATING' } });
    expect(() => assertPlaceholdersOnly(env.recommended_next_request.arguments_template)).not.toThrow();
    expect(() => assertPlaceholdersOnly({ x: '<make up value>' })).toThrow(/Fabricated placeholder/);
  });

  it('revision equals workflow revision (invariant 3)', () => {
    expect(buildGuidance(baseInput).revision).toBe(4);
  });

  it('severity mapping follows the canonical table (invariant 8)', () => {
    expect(severityFor('CONTRADICTION')).toBe('high');
    expect(severityFor('STALE')).toBe('low');
    expect(severityFor('UNKNOWN_CODE')).toBe('medium');
  });

  it('validateEnvelope rejects recommended tool outside allowed set', () => {
    const env = buildGuidance(baseInput) as GuidanceEnvelope;
    const bad = { ...env, recommended_next_request: { ...env.recommended_next_request, tool: 'experience.finalize' } };
    expect(() => validateEnvelope(bad as GuidanceEnvelope)).toThrow(/allowed_next_tools/);
  });
});
