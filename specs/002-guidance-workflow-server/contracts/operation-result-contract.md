# Contract: Operation Execution & Result

Feature: specs/002-guidance-workflow-server · Governs every local/downstream operation run (FR-036–043, FR-045; profile §23 verification).

## Execution pipeline

```
prepare (resolve templates, policy/allowlist/risk/limits check)
  → audit operation_prepared | operation_rejected_by_policy
  → ensure connection ready (MCP types) — else explicit fallback (audited) or fail
  → execute (attempt 1..maxAttempts; retry only retryOn classes)
  → normalize → validate (explicit success policy)
  → audit operation_completed | operation_failed | operation_result_rejected
  → persist result (+ raw evidence per output.retainRawResult, redacted)
  → report per output.returnToAgent
```

## Status & error classification

Statuses: `pending, running, succeeded, failed, timed_out, cancelled, input_required, unknown, reconciling`. `errorKind ∈ { transport, protocol, tool_reported, validation, policy, timeout, cancelled }` — tool-reported vs transport failures are never conflated (SC-007). A required op succeeds only on validated success; validation failure ≠ protocol success (FR-036).

## Retry classification

Retryable: connection_lost, server_unavailable, timeout, restart. Non-retryable: invalid arguments, capability missing/not allowed, schema mismatch, authorization/policy denial, deterministic domain errors.

## Idempotency & crash recovery (FR-043)

Unique `executionId` per run; `requestId` ledger prevents duplicates across task start, import, reconciliation, verification, completion. Interrupted `running` ops reconcile to `succeeded|failed|unknown`; unknown-outcome state-changing ops block instead of re-running; read-only/idempotent ops may auto-retry. Idempotency keys passed downstream where supported.

## Verification scopes (profile §23)

Operations declare scope `task | batch | feature | repository` and bind results to tasks/criteria via the traceability graph; `repository-analysis` remains a required completion operation (FR-005, FR-074). Agent statements are never evidence (FR-070).

## Audit events (FR-045 + profile §44)

v1/v2 event set plus `spec_kit_*` events (feature discovered/selected, artifact imported/rejected, snapshot created/refreshed, reconciliation previewed/applied, task normalized/ready/released/started/implementation_submitted/reviewed/verified/completed/blocked/deferred, plan_change proposed/approved/rejected, traceability_updated, completion_validated) — every `spec_kit_*` event carries the active snapshot identifier; all secret-redacted.

## Contract tests (write FIRST)

1. Tool-error vs transport-error classification under stub fault modes.
2. Timeout ⇒ `timed_out` + downstream cancel observed.
3. Capability drift ⇒ `downstream_capability_changed`, transition blocked, audited.
4. Injection content ⇒ exposure-mode-only surfacing, zero policy impact (SC-009).
5. Duplicate requestId ⇒ exactly one downstream invocation (SC-005).
6. Restart with `running` op ⇒ reconciliation; unknown state-changing outcome blocks completion.
7. Verification results bind to tasks/criteria in the traceability graph (SC-015 evidence path).
