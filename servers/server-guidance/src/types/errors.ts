/** Stable machine-readable error codes (spec Error Model, v1 + v2 + profile). */
export const ERROR_CODES = [
  // v1
  "configuration_not_found",
  "configuration_invalid",
  "workflow_not_found",
  "session_not_found",
  "session_locked",
  "invalid_active_phase",
  "invalid_transition",
  "submission_invalid",
  "required_field_missing",
  "required_hook_failed",
  "hook_not_found",
  "hook_retry_not_allowed",
  "hook_timed_out",
  "command_not_found",
  "working_directory_invalid",
  "workspace_boundary_violation",
  "state_persistence_failed",
  "workflow_already_completed",
  "workflow_cancelled",
  "workflow_blocked",
  "chain_activation_incomplete",
  "internal_error",
  // v2 orchestration
  "downstream_server_not_configured",
  "downstream_server_disabled",
  "downstream_server_unavailable",
  "downstream_connection_failed",
  "downstream_protocol_error",
  "downstream_capability_missing",
  "downstream_capability_not_allowed",
  "downstream_capability_changed",
  "operation_not_configured",
  "operation_not_allowed_in_phase",
  "operation_arguments_invalid",
  "operation_input_required",
  "operation_cancelled",
  "operation_timed_out",
  "operation_result_invalid",
  "operation_result_too_large",
  "operation_retry_not_allowed",
  "operation_retry_limit_exceeded",
  "authorization_required",
  "authorization_failed",
  "user_approval_required",
  "user_approval_declined",
  "data_egress_denied",
  "fallback_unavailable",
  "nested_request_limit_exceeded",
  // Spec-Kit profile
  "spec_kit_feature_in_use",
  "spec_kit_not_enabled",
  "spec_kit_feature_not_found",
  "spec_kit_feature_ambiguous",
  "spec_kit_feature_outside_workspace",
  "spec_kit_artifact_missing",
  "spec_kit_artifact_unreadable",
  "spec_kit_artifact_empty",
  "spec_kit_artifact_invalid",
  "spec_kit_required_section_missing",
  "spec_kit_task_id_missing",
  "spec_kit_duplicate_task_id",
  "spec_kit_unknown_dependency",
  "spec_kit_dependency_cycle",
  "spec_kit_snapshot_stale",
  "spec_kit_reconciliation_required",
  "spec_kit_task_not_found",
  "spec_kit_task_not_ready",
  "spec_kit_task_not_released",
  "spec_kit_task_already_active",
  "spec_kit_task_dependency_unsatisfied",
  "spec_kit_task_review_required",
  "spec_kit_task_verification_required",
  "spec_kit_plan_change_required",
  "spec_kit_plan_change_pending",
  "spec_kit_traceability_incomplete",
  "spec_kit_acceptance_criterion_unverified",
  "spec_kit_completion_invariant_failed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

/** Stable error response shape: { accepted, error{code,message,recoverable}, ... }. */
export interface GuidanceErrorResponse {
  accepted: false;
  error: { code: ErrorCode; message: string; recoverable: boolean };
  currentPhase?: string;
  workflowStatus?: string;
  allowedActions?: string[];
}

export class GuidanceError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly currentPhase?: string;
  readonly workflowStatus?: string;
  readonly allowedActions?: string[];

  constructor(
    code: ErrorCode,
    message: string,
    opts: {
      recoverable?: boolean;
      currentPhase?: string;
      workflowStatus?: string;
      allowedActions?: string[];
    } = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "GuidanceError";
    this.code = code;
    this.recoverable = opts.recoverable ?? true;
    this.currentPhase = opts.currentPhase;
    this.workflowStatus = opts.workflowStatus;
    this.allowedActions = opts.allowedActions;
  }

  toResponse(): GuidanceErrorResponse {
    return {
      accepted: false,
      error: {
        code: this.code,
        message: this.message,
        recoverable: this.recoverable,
      },
      currentPhase: this.currentPhase,
      workflowStatus: this.workflowStatus,
      allowedActions: this.allowedActions,
    };
  }
}
