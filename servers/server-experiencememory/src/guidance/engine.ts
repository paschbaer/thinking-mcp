/**
 * Guidance computation (FR-010..FR-013, contracts/guidance.md).
 * Evidence collection is preferred over speculative diagnosis (invariant 7).
 */
import type { Episode, EpisodeState, Workflow } from '../domain/types.js';
import {
  severityFor,
  validateEnvelope,
  type GuidanceEnvelope,
  type Warning,
} from './envelope.js';
import { stateRequirements } from '../domain/state-machine.js';

const ALLOWED_BY_STATE: Record<EpisodeState, string[]> = {
  DRAFT: ['experience.record_observation', 'workflow.abandon'],
  OBSERVED: ['experience.record_observation', 'experience.record_attempt', 'experience.propose_hypothesis', 'workflow.abandon'],
  DIAGNOSING: ['experience.record_observation', 'experience.record_attempt', 'experience.propose_hypothesis', 'experience.propose_solution'],
  SOLUTION_PROPOSED: ['validation.plan', 'experience.record_observation', 'experience.record_attempt'],
  VALIDATING: ['validation.record_run', 'validation.plan', 'experience.record_observation'],
  LOCALLY_VERIFIED: ['experience.finalize', 'experience.search', 'experience.record_reuse_feedback'],
  REPRODUCED: ['experience.finalize', 'experience.search', 'experience.record_reuse_feedback'],
  CROSS_PROJECT_VERIFIED: ['experience.finalize', 'experience.search', 'experience.record_reuse_feedback'],
  UNRESOLVED: ['experience.search', 'experience.record_reuse_feedback'],
  PARTIALLY_VERIFIED: ['experience.search', 'experience.record_reuse_feedback'],
  NEEDS_REVIEW: ['experience.search'],
  CONTRADICTED: ['experience.search', 'experience.record_reuse_feedback'],
  INVALIDATED: ['experience.search'],
  DEPRECATED: ['experience.search'],
  SUPERSEDED: ['experience.search'],
};

export interface GuidanceInput {
  workflow: Workflow;
  episode?: Episode;
  hasFailureObservation: boolean;
  hasEnvironmentFact: boolean;
  hasAttempt: boolean;
  hasSolution: boolean;
  hasValidationPlan: boolean;
  hasVerifiedOriginal: boolean;
  hasVerifiedRegression: boolean;
  warnings?: Warning[];
  stopConditions?: string[];
}

export function buildGuidance(input: GuidanceInput): GuidanceEnvelope {
  const { workflow, episode } = input;
  const state = workflow.state;
  const allowed = ALLOWED_BY_STATE[state];

  const missing: GuidanceEnvelope['missing_information'] = [];
  if (!input.hasFailureObservation && (state === 'DRAFT' || state === 'OBSERVED')) {
    missing.push({
      field: 'failure.exact_output',
      reason: 'Preserve the exact failure before attempting remediation',
      required: true,
      safe_collection_hint: 'Record the failing command output and exit code',
    });
  }
  if (!input.hasEnvironmentFact) {
    missing.push({
      field: 'environment.facts',
      reason: 'Version-sensitive applicability ranking requires environment facts',
      required: true,
      safe_collection_hint: 'Record runtime and platform versions as environment_fact observations',
    });
  }

  const warnings: Warning[] = [...(input.warnings ?? [])];
  if (input.hasAttempt && !input.hasSolution && (state === 'DIAGNOSING' || state === 'OBSERVED')) {
    warnings.push({ code: 'UNVERIFIED_ROOT_CAUSE', severity: severityFor('UNVERIFIED_ROOT_CAUSE'), message: 'Root-cause statements are still hypotheses until validated' });
  }

  // Recommendation: evidence collection first, then state progression.
  let rec: GuidanceEnvelope['recommended_next_request'];
  const template = {
    workflow_id: workflow.workflow_id,
    experience_id: episode?.experience_id ?? '<collect value>',
    expected_revision: workflow.revision,
  };
  if (missing.some((m) => m.field === 'failure.exact_output')) {
    rec = {
      tool: 'experience.record_observation',
      reason: 'Preserve the exact failure before attempting remediation',
      arguments_template: {
        ...template,
        observation: { kind: 'failure_output', content: '<collect value>', exit_code: '<collect value>' },
      },
    };
  } else if (missing.some((m) => m.field === 'environment.facts') && allowed.includes('experience.record_observation')) {
    rec = {
      tool: 'experience.record_observation',
      reason: 'Environment facts are required for applicability ranking',
      arguments_template: {
        ...template,
        observation: { kind: 'environment_fact', content: '<collect value>' },
      },
    };
  } else {
    switch (state) {
      case 'DRAFT':
        rec = {
          tool: 'experience.record_observation',
          reason: 'Start by preserving the failure and environment facts',
          arguments_template: { ...template, observation: { kind: 'failure_output', content: '<collect value>' } },
        };
        break;
      case 'OBSERVED':
        rec = { tool: 'experience.record_attempt', reason: 'Record the intended strategy before executing it', arguments_template: { ...template, intent: '<collect value>' } };
        break;
      case 'DIAGNOSING':
        rec = { tool: 'experience.propose_solution', reason: 'A solution with mechanism and validation plan is needed before validating', arguments_template: { ...template, strategy: '<collect value>', mechanism: '<collect value>' } };
        break;
      case 'SOLUTION_PROPOSED':
        rec = { tool: 'validation.plan', reason: 'Define checks tied to the original acceptance criteria', arguments_template: { ...template, checks: [{ criterion: '<collect value>', test_type: '<collect value>', expected_result: '<collect value>', regression_coverage: false, timeout_s: 300, evidence_requirement: true, targets_original_failure: true }] } };
        break;
      case 'VALIDATING':
        rec = {
          tool: 'validation.record_run',
          reason: input.hasVerifiedOriginal ? 'Complete the required regression checks with objective result data' : 'Complete the original-failure check with objective result data',
          arguments_template: { ...template, check_index: '<collect value>', status: '<collect value>', evidence_artifact_id: '<attach artifact>' },
        };
        break;
      case 'LOCALLY_VERIFIED':
        rec = { tool: 'experience.finalize', reason: 'Evidence satisfies the validation plan; finalize the episode', arguments_template: { ...template, requested_outcome: 'verified' } };
        break;
      default:
        rec = { tool: 'experience.search', reason: 'No further capture actions are available in this state', arguments_template: { query: '<collect value>', scope_id: workflow.scope_id } };
    }
  }

  const envelope: GuidanceEnvelope = {
    workflow_id: workflow.workflow_id,
    experience_id: episode?.experience_id,
    workflow_state: state,
    revision: workflow.revision,
    objective: workflow.goal,
    missing_information: missing,
    warnings,
    allowed_next_tools: allowed,
    recommended_next_request: rec,
    alternative_next_requests: [],
    stop_conditions: input.stopConditions ?? [],
    human_approval: { required: false },
  };
  return validateEnvelope(envelope);
}

/** Allowed tools lookup for pipelines that must validate requests (FR-010). */
export function allowedToolsForState(state: EpisodeState): string[] {
  return ALLOWED_BY_STATE[state];
}

export { stateRequirements };
