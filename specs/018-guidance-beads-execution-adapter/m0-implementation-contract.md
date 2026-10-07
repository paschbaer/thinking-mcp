# Spec 018 — M0 Implementation Contract (RFC §24 Methods)

**Status:** ACCEPTED — approved by user 2026-10-07; binding for
WP-05/WP-06/WP-07 AC-A3 contract tests (decision record: DEC-GBEA-M0 in
`memory-bank/decisions.md`).

Request/response **types** are normative in the RFC (§5 signatures,
Appendix A) and are not restated here; this contract fixes, per method:
authentication, authorization, idempotency behavior, error codes, and audit
events. Shared rules first.

## 0. Shared Rules

- **Authentication:** two caller classes. *Agent* — an authenticated MCP
  session with an agent identity registered for the execution (same
  transport security as the existing guidance server; agents
  re-authenticate after reconnect per RFC §11.3). *Administrator* — a
  caller holding the admin role for the workspace (config-designated;
  existing trust-level machinery).
- **Authorization:** every state-changing adapter operation additionally
  requires an internally issued `AdapterAuthorizationProof` (RFC §11.5)
  whose `scope` covers the operation; proof verification (audited) is the
  adapter-side gate. Agent-visible exclusions/reasons are `safeDescription`
  only (§10.3).
- **Idempotency (RFC §5.1):** every mutating request carries
  `idempotencyKey`; identical retry returns the original logical result;
  same key + different request digest → `IDEMPOTENCY_CONFLICT`. Read-only
  methods (`status`, `ready`, `get_context`, list/health/capabilities/
  inspect) are idempotent by nature and carry only `correlationId`.
- **Errors:** §17 taxonomy only; every error carries correlation ID,
  retryability, remediation hint; backend diagnostics redacted per
  §20.8/§23 `security.redactBackendDiagnostics`.
- **Audit:** every method emits at least one §18 event (table below);
  audit records use Guidance IDs and MAY include backend IDs (§7).
- **Fencing:** heartbeat/release/progress/blocker/completion and admin
  repair present the current `fencingToken`; stale/lower →
  `REVISION_CONFLICT` (§11.4).

## 1. Agent-Facing Methods (RFC §24.1)

| Method | Authn | Authz | Request → Response (RFC type) | Idempotency | Key error codes | Audit events |
|---|---|---|---|---|---|---|
| `guidance.execution.status` | Agent | Execution membership | `executionId` → status aggregate (snapshot of `CompletionState`s, authorization state, suspension) | n/a (read) | `BINDING_NOT_FOUND`, `BACKEND_UNAVAILABLE` | read not audited as event; metrics only |
| `guidance.work.ready` | Agent | Execution membership + §10.2 filter inputs | `ReadyWorkRequest`-shaped → `GovernedReadyWorkResult` (§10.3) | n/a (read); cache rules §10.4 | `BACKEND_UNAVAILABLE`, `RECONCILIATION_REQUIRED` | readiness evaluation metric + `policySetDigest` in result |
| `guidance.work.claim` | Agent | §10.2 full authorization, non-cached + CAS (§10.4) | `ClaimWorkRequest` → `WorkClaim` + `ExecutionContextEnvelope` | idempotencyKey required | `WORK_NOT_READY`, `WORK_ALREADY_CLAIMED`, `REVISION_CONFLICT`, `OPERATION_NOT_AUTHORIZED`, `CAPABILITY_UNAVAILABLE` (claiming disabled, §11.6) | `work.claimed` |
| `guidance.work.heartbeat` | Agent | Active claim owner | `ClaimHeartbeatRequest` → `WorkClaim` (extended) | idempotencyKey required; repeat within policy = re-receipt | `CLAIM_EXPIRED`, `REVISION_CONFLICT`, `INVALID_STATE_TRANSITION` | `work.claim.heartbeat` |
| `guidance.work.release` | Agent | Active claim owner (or admin override, audited) | `ReleaseClaimRequest` → `ReleaseClaimResult` | idempotent per §11.3 | `CLAIM_EXPIRED`, `REVISION_CONFLICT` | `work.claim.released` |
| `guidance.work.report_progress` | Agent | Active claim owner + fencing + `claimReportSequence` (§13) | `ProgressReport` → `ProgressReceipt` | duplicate sequence → original receipt (`duplicate: true`) | `REVISION_CONFLICT`, `INVALID_STATE_TRANSITION` (late report, §18.1), gap → suspect-stream handling §13 | `work.progressed` |
| `guidance.work.report_blocker` | Agent | Active claim owner + fencing | `BlockerReport` → `BlockerReceipt` (state REPORTED) | idempotencyKey required | `REVISION_CONFLICT`, `INVALID_STATE_TRANSITION` | `work.blocked` (on acceptance; REPORTED intake audited) |
| `guidance.work.submit_completion` | Agent | Active, non-expired claim + fencing (§15.3) | `CompletionSubmission` → `CompletionReceipt` | idempotencyKey required; replay → original receipt | `CLAIM_EXPIRED`, `REVISION_CONFLICT`, `INVALID_STATE_TRANSITION` | `work.completion.submitted` |
| `guidance.work.get_context` | Agent | Active claim owner | claim/work ids → `ExecutionContextEnvelope` | n/a (read); least-privilege §12 | `CLAIM_EXPIRED`, `BINDING_NOT_FOUND` | metrics only |

## 2. Administrative Methods (RFC §24.2)

| Method | Authn | Authz | Request → Response | Idempotency | Key error codes | Audit events |
|---|---|---|---|---|---|---|
| `guidance.execution.open` | Admin | Policy decision `EXECUTION_AUTHORIZED` reachable; proof scope `openExecution` | `OpenExecutionRequest` → `ExecutionBinding` | idempotencyKey required | `BINDING_CONFLICT`, `STALE_PACKAGE`, `OPERATION_NOT_AUTHORIZED` | `execution.opened` |
| `guidance.execution.publish` | Admin | Package authorized (§8.2); proof scope `publishWorkGraph`; dry-run allowed read-only | `PublishWorkGraphRequest` → `PublishWorkGraphResult` | idempotencyKey required; `IDEMPOTENCY_CONFLICT` on digest mismatch | `STALE_PACKAGE`, `PROJECTION_FAILED`, `BACKEND_VERSION_UNSUPPORTED`, `BACKEND_SCHEMA_INCOMPATIBLE` | `work.published` / `work.updated` (per item class) |
| `guidance.execution.reconcile` | Admin | Workspace admin | `ReconcileWorkGraphRequest` → `ReconciliationResult` | idempotent per checkpoint semantics (§16.6) | `RECONCILIATION_REQUIRED`, `SEMANTIC_DRIFT` (reported, not thrown silently) | `reconciliation.completed` (+ `backend.drift.detected` per finding) |
| `guidance.execution.close` | Admin | §24 closure preconditions (no active claims, no open high/critical drift, no quarantined items) unless audited override; proof scoped to close | `CloseExecutionRequest` → `CloseExecutionResult` | idempotencyKey required; `already-closed` outcome | `INVALID_STATE_TRANSITION`, `OPERATION_NOT_AUTHORIZED` | terminal closure event + snapshot SHOULD (§18.2) |
| `guidance.adapters.list` | Admin | Workspace admin | — → adapter registry (id, version, enabled, health summary) | n/a | — | metrics only |
| `guidance.adapters.capabilities` | Admin | Workspace admin | `CapabilityProbeRequest` → `CapabilityProbeResult` | n/a (probes refresh `NegotiatedCompatibility`, §19) | `BACKEND_UNAVAILABLE`, `BACKEND_VERSION_UNSUPPORTED` | re-negotiation audit |
| `guidance.adapters.health` | Admin | Workspace admin | `BackendHealthRequest` → `BackendHealthResult` | n/a | `BACKEND_UNAVAILABLE` | `backend.unavailable` on transition |
| `guidance.adapters.reconcile` | Admin | Workspace admin | all-adapters reconcile trigger → per-adapter `ReconciliationResult` | idempotent per checkpoint | as `execution.reconcile` | `reconciliation.completed` per execution |
| `guidance.adapters.inspect_drift` | Admin | Workspace admin | execution filter → `DriftFinding[]` (full detail allowed, §10.3) | n/a | `BINDING_NOT_FOUND` | read audited in admin log |
| `guidance.adapters.resolve_drift` | Admin | Workspace admin; agents MUST NOT (§16.5) | `findingId` + exactly one `DriftResolutionAction` → updated finding (OPEN→RESOLVING→RESOLVED) | idempotent per `findingId` | `INVALID_STATE_TRANSITION`, `BINDING_CONFLICT` | drift resolution audit + reconciliation event; resume unblocks suspended mutations |
| `guidance.blockers.accept` | Admin | Workspace admin | blocker id → `BlockerReceipt` (ACCEPTED; disposition per §14.2) | idempotent per blocker + transition | `INVALID_STATE_TRANSITION` | audited lifecycle transition (+ `work.blocked` projection where applicable) |
| `guidance.blockers.reject` | Admin | Workspace admin | blocker id + reason → `BlockerReceipt` (REJECTED) | idempotent per blocker + transition | `INVALID_STATE_TRANSITION` | audited lifecycle transition |
| `guidance.blockers.resolve` | Admin | Workspace admin | blocker id (+ dependency/amendment reference) → `BlockerReceipt` (RESOLVED/SUPERSEDED) | idempotent per blocker + transition | `INVALID_STATE_TRANSITION` | audited lifecycle transition; dependent readiness re-evaluated |

## 3. Method-to-Work-Package Ownership

- WP-05 (T048): `execution.status`, `work.ready`, `work.claim`,
  `work.heartbeat`, `work.release`, `work.get_context`, (wiring of
  `report_progress`/`report_blocker` entry points).
- WP-06 (T055/T060/T061): `report_progress`, `report_blocker`,
  `submit_completion`, `execution.open/publish/close`, `blockers.*`.
- WP-07 (T064): `execution.reconcile`, `adapters.*`.
- AC-A3: every row above gets at least one contract test covering
  authn-fail, authz-fail, schema round-trip, idempotency behavior, error
  code, and audit-event emission.
