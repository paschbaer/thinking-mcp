# Contract: Upstream MCP Tools (agent-facing surface)

Feature: specs/002-guidance-workflow-server · Transport-independent (stdio + loopback HTTP, FR-027). Stable error codes; optional `requestId` idempotency on all state-changing calls (FR-043, FR-047-profile §47).

## Workflow tools (all profiles)

| Tool | Input | Output / behavior |
|---|---|---|
| `start_workflow` | `{ workspaceRoot, request, workflowId?, profile?, featureId?, metadata? }` | session created; profile resolved per FR-060 (explicit > implied spec-kit > plain); phase `understand` + guidance returned |
| `get_current_guidance` | `{ sessionId }` | read-only, idempotent |
| `submit_understanding` / `submit_plan` / `submit_plan_review` / `submit_implementation` / `submit_implementation_review` / `submit_verification` | `{ sessionId, requestId?, ...payload }` | phase-locked (FR-003), strict schema (FR-030), lifecycle ops run, normalized op summaries per exposure mode |
| `complete_workflow` | `{ sessionId, requestId?, completionReport }` | success → `completed` with op results; failure → `required_operation_failed` + retry actions. Profile `spec-kit` additionally gates on FR-074 invariants |
| `get_workflow_state` | `{ sessionId, includeHistory?, includeHookOutput? }` | session record incl. downstream state; `specKit` summary when profile active |
| `retry_hook` (deprecated alias) / `retry_operation` | `{ sessionId, operationId, requestId? }` | new execution result + resulting state | only when policy permits (FR-040, §35) — canonical name: `retry_operation` |
| `report_blocker` | `{ sessionId, category, description, requiresUserDecision?, options? }` | `blocked`, previous phase preserved |
| `resume_workflow` | `{ sessionId, resolution }` | only exit from `blocked` (FR-028) |
| `cancel_workflow` | `{ sessionId }` | graceful drain, then `cancelled` (FR-057) |

## Orchestration tools (FR-046)

`get_orchestration_status`, `list_configured_operations` (safe view only), `get_operation_result` (exposure+redaction applied), `retry_operation`, `resolve_operation_input` (validated against stored request schema), `get_downstream_status` (no transport/auth details).

## Spec-Kit profile tools (registered only for profile `spec-kit`, R17)

| Tool | Input | Output / behavior |
|---|---|---|
| `discover_spec_kit_feature` | `{ sessionId, featureId? }` | resolves/validates feature (FR-061); ambiguous auto-selection → block |
| `import_spec_kit_artifacts` | `{ sessionId, requestId? }` | full pipeline (FR-062/063): hashes, parse, structural validation, normalize, graph, snapshot, audit |
| `get_spec_kit_status` | `{ sessionId }` | read-only: snapshot id, staleness, task summary, criterion coverage, pending plan changes |
| `get_next_task` | `{ sessionId }` | next ready task/batch per scheduler; agent cannot select blocked tasks (FR-067) |
| `start_task` | `{ sessionId, batchId, requestId? }` | claims a released batch; rejects if not released / not ready / wrong phase / dependency unsatisfied |
| `submit_task_implementation` | `{ sessionId, batchId, requestId?, tasks[] evidence }` | batch members only (unless configured opportunistic); evidence bound to snapshot (FR-069) |
| `submit_task_review` | `{ sessionId, batchId, findings[], unresolvedFindings[] }` | blocking findings → `fix_required` (FR-069) |
| `complete_task` | `{ sessionId, taskId, requestId? }` | requires evidence + review + task verification + approved deviations (FR-069) |
| `propose_plan_change` | `{ sessionId, requestId?, change }` | classified; major → approval via elicitation/blocker (FR-072); returns `artifact_update_required` + instruction |
| `refresh_spec_kit_artifacts` | `{ sessionId, requestId? }` | new snapshot + reconciliation preview → apply (FR-073); evidence preserved |
| `get_traceability_report` | `{ sessionId, includeFiles?, includeVerification?, onlyUncovered? }` | coverage per criterion incl. link sources (FR-071) |
| `validate_spec_kit_completion` | `{ sessionId }` | read-only invariant evaluation (FR-074) |

## Error model

`{ accepted: false, error: { code, message, recoverable }, currentPhase, workflowStatus?, allowedActions? }`. Codes: v1/v2 sets plus profile set (`spec_kit_feature_not_found|ambiguous|outside_workspace|in_use`, `spec_kit_artifact_missing|empty|invalid`, `spec_kit_duplicate_task_id`, `spec_kit_unknown_dependency`, `spec_kit_dependency_cycle`, `spec_kit_snapshot_stale`, `spec_kit_reconciliation_required`, `spec_kit_task_not_ready|not_released|already_active|dependency_unsatisfied`, `spec_kit_plan_change_required|pending`, `spec_kit_traceability_incomplete`, `spec_kit_acceptance_criterion_unverified`, `spec_kit_completion_invariant_failed`, …).

## Behavioral guarantees (contract tests must assert)

1. Plain-profile sessions never expose Spec-Kit tools (R17).
2. Duplicate `requestId` ⇒ recorded result, no duplicate downstream invocation/task start/snapshot (SC-005, §47).
3. `completed` unreachable with failing required operation (SC-002) or unmet FR-074 invariants (SC-013).
4. Checkbox `[x]` without evidence never completes a task (SC-011).
5. Unreleased/blocked task start rejected (SC-012).
6. Injection-style artifact content never alters policy or transitions (SC-009).
7. Loopback-only HTTP bind; transition overhead < 1 s p95 with stubs (SC-010).
