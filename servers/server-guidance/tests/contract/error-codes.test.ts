import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode } from "../../src/types/errors.js";

/**
 * R-010 (final review feature 003): exact-surface equality snapshot of the
 * error-code registry. Every code addition/removal must consciously update
 * this snapshot — keeps the public error contract deliberate.
 */
const EXPECTED_ERROR_CODES = [
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
  // spec 003: toolchain-bootstrap / run_operation
  "agent_invocation_denied",
  "operation_in_progress",
  "workspace_lock_unavailable",
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
];

describe("error code registry (R-010 exact-surface snapshot)", () => {
  it("matches the expected code set exactly (order and content)", () => {
    expect([...ERROR_CODES]).toEqual(EXPECTED_ERROR_CODES);
  });

  it("has no duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("isErrorCode accepts every registered code and rejects unknown ones", () => {
    for (const code of ERROR_CODES) expect(isErrorCode(code)).toBe(true);
    expect(isErrorCode("totally_unknown_code")).toBe(false);
  });
});
