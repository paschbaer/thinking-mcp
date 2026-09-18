/**
 * Domain entity types for the Experience Memory Server (EMMS).
 * Mirrors specs/001-experience-memory-server/data-model.md.
 */

export type Visibility = 'session' | 'workflow' | 'repository';

export type EpisodeState =
  | 'DRAFT'
  | 'OBSERVED'
  | 'DIAGNOSING'
  | 'SOLUTION_PROPOSED'
  | 'VALIDATING'
  | 'LOCALLY_VERIFIED'
  | 'REPRODUCED'
  | 'CROSS_PROJECT_VERIFIED'
  | 'UNRESOLVED'
  | 'PARTIALLY_VERIFIED'
  | 'NEEDS_REVIEW'
  | 'CONTRADICTED'
  | 'INVALIDATED'
  | 'DEPRECATED'
  | 'SUPERSEDED';

export const TERMINAL_STATES: EpisodeState[] = [
  'UNRESOLVED',
  'PARTIALLY_VERIFIED',
  'NEEDS_REVIEW',
  'CONTRADICTED',
  'INVALIDATED',
  'DEPRECATED',
  'SUPERSEDED',
];

export const ACTIVE_PROGRESSION: EpisodeState[] = [
  'DRAFT',
  'OBSERVED',
  'DIAGNOSING',
  'SOLUTION_PROPOSED',
  'VALIDATING',
  'LOCALLY_VERIFIED',
  'REPRODUCED',
  'CROSS_PROJECT_VERIFIED',
];

export type ObservationKind =
  | 'failure_output'
  | 'command_output'
  | 'test_result'
  | 'environment_fact'
  | 'file_state'
  | 'dependency_graph_fact'
  | 'user_feedback'
  | 'performance_measurement'
  | 'security_measurement'
  | 'external_service_result'
  | 'agent_reflection';

export type AttemptClassification =
  | 'successful'
  | 'partially_successful'
  | 'ineffective'
  | 'harmful'
  | 'inconclusive'
  | 'not_applicable';

export interface Provenance {
  actor_type: 'agent' | 'human' | 'system';
  actor_id: string;
  source_type: string;
  source_artifact_id?: string;
  recorded_at: string;
  derivation: 'observed' | 'inferred' | 'summarized';
  trace_id?: string;
}

export interface Observation {
  observation_id: string;
  episode_id: string;
  kind: ObservationKind;
  content: string;
  exit_code?: number;
  evidence_artifact_id?: string;
  provenance: Provenance;
  seq: number;
}

export interface Attempt {
  attempt_id: string;
  episode_id: string;
  intent: string;
  fact?: string;
  risk_classification?: string;
  rationale?: string;
  prior_knowledge_used?: string;
  outcome?: string;
  side_effects?: string[];
  affected_artifacts?: string[];
  classification?: AttemptClassification;
  seq: number;
}

export type HypothesisStatus = 'proposed' | 'supported' | 'rejected' | 'superseded';

export interface Hypothesis {
  hypothesis_id: string;
  episode_id: string;
  statement: string;
  status: HypothesisStatus;
  supporting_evidence: string[];
  conflicting_evidence: string[];
  seq: number;
}

export interface ValidationCheck {
  criterion: string;
  test_type: string;
  expected_result: string;
  regression_coverage: boolean;
  timeout_s: number;
  evidence_requirement: boolean;
  targets_original_failure: boolean;
}

export interface ValidationPlan {
  validation_plan_id: string;
  episode_id: string;
  checks: ValidationCheck[];
  seq: number;
}

export interface ValidationRun {
  run_id: string;
  episode_id: string;
  check_index: number;
  status: 'passed' | 'failed';
  exit_code?: number;
  evidence_artifact_id?: string;
  seq: number;
}

export interface EvidenceArtifact {
  artifact_id: string;
  episode_id: string;
  scope_id: string;
  content_hash: string;
  kind: string;
  media_type: string;
  byte_size: number;
  redaction_status: 'completed' | 'failed';
  redaction_findings: number;
  redaction_ruleset_version: string;
  trust: string;
  created_at: string;
}

export interface FailureSignature {
  kind: string;
  exact_tokens: string[];
  exit_code?: number;
  normalized_hash: string;
}

export interface Episode {
  experience_id: string;
  workflow_id: string;
  scope_id: string;
  scope_fingerprint?: string;
  visibility: Visibility;
  goal_summary: string;
  acceptance_criteria: string[];
  problem_summary: string;
  state: EpisodeState;
  last_verified_at?: string;
  created_at: string;
}

export interface Workflow {
  workflow_id: string;
  experience_id?: string;
  goal: string;
  scope_id: string;
  scope_fingerprint?: string;
  state: EpisodeState;
  revision: number;
  actor_id: string;
  created_at: string;
}

/** Append-only event log entry (FR-020). */
export interface DomainEvent {
  event_id: string;
  workflow_id: string;
  episode_id?: string;
  type: string;
  payload: unknown;
  seq: number;
  recorded_at: string;
}

export interface AuditEvent {
  event_id: string;
  actor: { actor_type: 'agent' | 'human' | 'system'; actor_id: string };
  action: string;
  target: string;
  before_revision?: number;
  after_revision?: number;
  timestamp: string;
  policy_version: string;
  reason?: string;
}

export interface ReuseFeedback {
  feedback_id: string;
  episode_id: string;
  verdict: 'applicable' | 'useful' | 'misleading' | 'harmful';
  changed_plan?: boolean;
  outcome?: string;
  seq: number;
}

export interface IdempotencyRecord {
  key: string;
  actor_id: string;
  tool: string;
  request_id: string;
  result_json: string;
}

export interface Config {
  storagePath?: string;
}
