# Tasks 018 — Guidance Beads Execution Adapter

**Status:** Draft — tasks phase
**Derived from:** `specs/018-guidance-beads-execution-adapter/plan.md` (work
packages WP-00..WP-10) and `spec.md` (milestones, AC, testing strategy).
**Normative authority:** RFC GBEA-SPEC-001 v0.6.1-draft (precedence:
RFC > spec > plan > tasks).
**Task ID convention:** `T0NN` sequential across phases; `[WP-x.y]` maps to
the plan task; `Verify:` names the gate (RFC §26 suite and/or RFC §25
criterion). Every task MUST cite its RFC anchor and MUST NOT widen normative
behavior.
**ADR gating:** tasks marked ⏳ADR start only after WP-00 approval.

---

## Phase 0: M0 — Decisions and Implementation Contract (WP-00)

- [x] T001: [WP-00/T00.1] Record ADR 1–8 (transport, Beads limits, persistence tech per §11.4+§21.1, lease-recovery tooling, sync strategy, canonical JSON per §8.3, retention/archive, backend upgrade policy) in `memory-bank/decisions.md` with user approval. RFC §28. Verify: user approval; each ADR cites its constraining RFC sections. — DONE 2026-10-07: all 8 approved unchanged (DEC-GBEA-M0).
- [x] T002: [WP-00/T00.2] Implementation contract for all 22 RFC §24 methods: authentication, authorization, request/response schemas, idempotency behavior, error codes, audit events. RFC §24. Verify: contract review; AC-A3 traceability table exists per method. — DONE 2026-10-07: `m0-implementation-contract.md` (ACCEPTED).
- [x] T003: [WP-00/T00.3] Proof-signing design: key provisioning/rotation, signature algorithm, single-use nonce store contract. RFC §11.5. Verify: design review; replay-protection model documented. — DONE 2026-10-07: Ed25519 design in `m0-adr-proposals.md` (ACCEPTED).
- [x] T004: [WP-00/T00.4] Pin Beads v1.3 conformance baseline (statuses open/in_progress/blocked/closed, issue schema, metadata rules, dependency types) as mapping-v1 ground truth. Verify: baseline doc committed; referenced by golden fixtures (T038). — DONE 2026-10-07: `m0-beads-v1.3-baseline.md` (ACCEPTED).
- [x] T005: [WP-00/T00.5] Fix shipped default `executionBackends.beads.enabled: false` and config surface decisions for WP-01. RFC §4.1, §23. Verify: decision recorded; AC-A1 test contract defined. — DONE 2026-10-07: absent→disabled default, RFC-§23-keys-only (DEC-GBEA-M0).

## Phase 1: M1 — Foundation (WP-01, WP-02 partial, WP-10 core)

- [ ] T006: [WP-01/T01.1] Port module: `WorkExecutionAdapter` interface + Appendix A request/result types (D-01); enforce `idempotencyKey` on mutations, `correlationId` on all requests, `expectedRevision` convention. RFC §5/§5.1. Verify: contract suite skeleton (T018); type-level lint: Guidance domain imports only `port/` (§25.1).
- [ ] T007: [WP-01/T01.2] Canonical types §6 (package, node, edge, completion policy, provenance, work states, RFC §6.8 timestamps) with schema-version emission + major-version rejection (§6.6) and `sha256:<lowercase-hex>` digest validation (§8.3). Verify: unit tests (§26.1).
- [ ] T008: [WP-01/T01.3] CLI transport: `bd` via argument arrays without shell, env allowlist, timeouts + process termination, `maxOutputBytes` schema-validated output guard. RFC §20.2–20.6, §20.9–20.10, §23. Verify: security suite transport cases (T050); negative suite oversized-output case (T039).
- [ ] T009: [WP-01/T01.4] Config schema + fail-closed startup validation (security-sensitive misconfiguration rejected); workspace block incl. stealth-mode rules (§23.1: no git hooks, no git ops, no committed Beads files) and `allowedRoots` canonicalization. RFC §23/§23.1. Verify: AC-A2 tests.
- [ ] T010: [WP-01/T01.5] `probeCapabilities` + `health`: startup + interval probing, REQUIRED-capability gate → unavailable, version-range check → `BACKEND_VERSION_UNSUPPORTED` fail-closed, `NegotiatedCompatibility` persisted in audit log, re-negotiation updates it. RFC §19. Verify: contract tests; §25.7 version-gate criterion.
- [ ] T011: [WP-01/T01.6] Error normalization to §17 taxonomy: stable code, operation, retryability, correlation, safe message, redacted backend diagnostic, remediation hint. RFC §17, §20.8. Verify: unit tests incl. redaction assertions.
- [ ] T012: [WP-01/T01.7] Disabled-path invariance: with `enabled: false`, no port registration, zero behavior change; existing guidance suites pass unchanged. RFC §4.1. Verify: AC-A1 full existing suite run.
- [ ] T013: [WP-02/T02.1] ⏳ADR-6 Canonicalization module: versioned profile identifier, sorted keys, UTF-8 without insignificant whitespace, enumerated non-deterministic-field exclusions, algorithm-change invalidation. RFC §8.3. Verify: unit suite determinism + format tests (§26.1).
- [ ] T014: [WP-02/T02.2] Field/type mapping per §9.6.2: kind→issueType/labels, priority classes→0–3 (backlog 4 prohibited), ordinal→metadata only, criteria rendering into description, titles without mutable state. Verify: unit tests (§26.1).
- [ ] T015: [WP-10/T10.1] Fake backend: in-memory, deterministic, fault-injectable `WorkExecutionAdapter` implementation for contract tests. RFC §27 M1. Verify: used by T018.
- [ ] T016: [WP-10/T10.2] Second minimal test adapter without Beads dependencies (port-neutrality proof). RFC §25.1. Verify: runs the same contract suite as fake backend.
- [ ] T017: [WP-10/T10.3a] Unit suite: canonicalization, mapping tables, validation rules, error normalization. RFC §26.1. Verify: green.
- [ ] T018: [WP-10/T10.4] Contract suite: every adapter method × fake backend × second adapter; per-method implementation-contract coverage (authn/authz/schemas/idempotency/errors/audit). RFC §26.2, AC-A3. Verify: green.

## Phase 2: M2 — Controlled Projection (WP-02 rest, WP-03, WP-04, WP-07 detection, tests)

- [ ] T019: [WP-02/T02.3] Labels + metadata encoding: invariant `guidance.managed`, `guidance.execution=<id>` label, single namespaced `guidance` metadata key as canonical JSON, `bd:`/`_` prefix prohibition, 32 KiB limit with per-item `PROJECTION_FAILED` + actionable diagnostic, no silent truncation. RFC §9.6.3. Verify: unit tests incl. limit boundary.
- [ ] T020: [WP-02/T02.4] Dependency mapping: §9.6.4 table incl. virtual approval gates (no Beads item/dependency, Guidance-enforced blocking) and forbidden dependency types (never produced; drift on detection). Verify: unit tests.
- [ ] T021: [WP-02/T02.5] Status mapping §9.6.7 as pure table: state→status projection, unknown/custom statuses → `BACKEND_SCHEMA_INCOMPATIBLE` (never guessed), claim/blocker-overlay comparison. Verify: unit tests.
- [ ] T022: [WP-02/T02.6] Round-trip encode/decode (§9.6.6): lossless recovery of canonical fields except virtual gates; immutability guards for `policyDecisionId`/`originPackageDigest`. Verify: golden fixtures (T038).
- [ ] T023: [WP-02/T02.7] Mapping-version plumbing: emit/verify `guidance.beads-mapping/v1` on every projection result, binding, metadata envelope; callable §9.7 migration scaffold (freeze/plan/receipt steps). Verify: unit tests.
- [ ] T024: [WP-03/T03.1] ⏳ADR-3 Coordination/binding store satisfying every §21.1 bullet (durability before success report, atomicity or WAL-equivalent crash consistency, retention hook). RFC §21.1. Verify: persistence fault-injection (T040).
- [ ] T025: [WP-03/T03.2] `ExternalWorkBinding` CRUD: uniqueness `(executionId, guidanceWorkId)` and `(backend, backendInstanceId, backendWorkId)`, restart durability, no binding reuse after backend-item deletion, `projectionRevision` increment on authorized re-creation. RFC §7. Verify: unit + persistence tests.
- [ ] T026: [WP-03/T03.3] Backend-instance identity: store-root resolution (discovery, `BEADS_DIR`, worktree sharing, sharing scope), canonicalization (symlink-resolved, platform-normalized separators), persistent fallback `guidanceBackendStoreId` beside the Guidance store, identity formula, fail-closed `BINDING_CONFLICT` paths (collision, missing/changed store id); Windows/WSL dual-layout test case. RFC §7.1. Verify: unit tests incl. shared-store identity (§25.3 criterion groundwork).
- [ ] T027: [WP-03/T03.4] Operation journal §21.3: PREPARED persisted before dispatch, atomic DISPATCHED, OUTCOME_UNKNOWN resolution via read-back/idempotent re-execution, REPAIR_REQUIRED alerting, restart replay, audit event atomic with FINALIZED. Verify: fault-injection (T040).
- [ ] T028: [WP-03/T03.5] Query patterns without steady-state full scans: by `executionId`, by `workId`, cursor reads, lease sweeps, drift inspection. RFC §21.1, AC-A4. Verify: query-plan assertions in fault-injection suite.
- [ ] T029: [WP-04/T04.1] Ingestion pipeline steps 1–14 (§8.1) as delta over specs/017 import: work-graph derivation, evidence-requirement derivation, risk classification, policy-set resolution + `policySetDigest`, deterministic package hashing, authorization-decision recording. Verify: unit + contract tests; determinism property (§8.3).
- [ ] T030: [WP-04/T04.2] Authorization-state machine §8.2: full transition graph incl. SUSPENDED resume revalidation, terminal REVOKED/COMPLETED, publication only from `EXECUTION_AUTHORIZED`, suspension recording. Verify: state-machine tests.
- [ ] T031: [WP-04/T04.3] `openExecution` (no node publication, §9.1) + `publishWorkGraph` algorithm §9.3 steps 1–13: authorization/schema validation, binding resolution, `STALE_PACKAGE` guard without backend modification, topological validation, unsupported-edge rejection, per-node digests, deterministic create order, CAS updates, dependencies after endpoints, graph validation, binding persistence, outcome counts. Verify: contract + §25.2 criteria.
- [ ] T032: [WP-04/T04.4] Dry-run mode (intended mutations, zero backend change) and idempotency-key semantics (identical request → original result; different digest → `IDEMPOTENCY_CONFLICT`). RFC §9.4/§9.5. Verify: idempotency suite (T039).
- [ ] T033: [WP-04/T04.5] Publication atomicity: `batchTransaction` path when negotiated; staged path (`guidance.staged` label, in-place validation, deterministic activation); incomplete staged publications flagged for reconciliation. RFC §9.3, §21. Verify: contract + fault-injection partial-projection cases.
- [ ] T034: [WP-04/T04.6] Amendment/package-revision handling: new package revision advances `currentPackageDigest` (origin unchanged), accepted items superseded not modified, readiness impact identified. RFC §14.2. Verify: unit + contract tests.
- [ ] T035: [WP-07/T07.1] Reconciliation engine: input assembly (§16.1), ownership-class diffing (§16.2/§16.3), `DriftFinding` records, severity classification (§16.4), scoped suspension (item/subtree/execution, minimum-safe default, policy may only tighten) with reason referencing the finding. Verify: drift tests; §25.5 criteria.
- [ ] T036: [WP-07/T07.2] Incremental reconciliation + `ReconciliationCheckpoint` (all §16.6 fields): changed-after-checkpoint requests incl. transitive endpoints, full-trigger detection, atomic advancement (no advance on failed/partial), incremental ≡ full equivalence, no steady-state full scans. Verify: equivalence property tests; §25.7 criterion.
- [ ] T037: [WP-07/T07.3] Recovery actions: completion/rollback of incomplete staged publications (§9.3) and orphaned backend claims via markers (§11.1). Verify: fault-injection scenarios.
- [ ] T038: [WP-10/T10.3b] Golden suite: projected item representations + lossless round-trip from Beads representation; unknown-status rejection; virtual gates excluded and Guidance-recoverable. RFC §26.3, §9.6.6. Verify: green against T004 baseline.
- [ ] T039: [WP-10/T10.5] Idempotency suite (every mutation incl. conflicts) + negative suite (malformed JSON, unsupported versions §6.6, schema skew, oversized/malformed output §20.9). RFC §26.4/§26.6. Verify: green.
- [ ] T040: [WP-10/T10.8a] Fault-injection suite (initial tier): timeouts, process crashes, partial projection, storage failure, backend unavailability; journal replay after restart. RFC §26.8, §21.1/§21.3. Verify: green; extended in later phases with each feature.

## Phase 3: M3 — Governed Execution (WP-05, concurrency/security tests)

- [ ] T041: [WP-05/T05.1] Backend ready-set query + governed filtering (§10.1/§10.2 all ten filter inputs) + `GovernedReadyWorkResult` with exclusions whose `safeDescription` never leaks protected policy info (§10.3). Verify: contract tests; §25.3 unauthorized-not-returned criterion.
- [ ] T042: [WP-05/T05.2] Readiness evaluation cache §10.4: full key composition (execution, work, agent identity/role digest, capability digest, policy decision, approval/claim/context digests, backend revision), invalidation triggers, configurable TTL (default 30 s, `0` = off), claim-time non-cached final authorization + CAS, diagnostics counters. Verify: cache unit tests + invalidation tests.
- [ ] T043: [WP-05/T05.3] Claim-intent records: transactional insert/acquire keyed `(backendInstanceId, executionId, workId)` with unique constraint, monotonic fencing tokens, owner instance, expiry, request digest; protocol steps 1–4 incl. idempotent release/expire. RFC §11.4. Verify: concurrency suite (T049).
- [ ] T044: [WP-05/T05.4] `claimWork` flow §11.1 steps 1–7: authentication, authorization, proof issuance, adapter-side verification (§11.5: signature/audience/scope/expiry/single-use nonce; replay → `OPERATION_NOT_AUTHORIZED`; audit), `expectedRevision` guard → `WORK_NOT_READY`, atomic backend claim + `BackendClaimMarker` per negotiated `claimCorrelation` (incl. `unsupported` → claiming disabled fail-closed), governed lease persistence, context envelope return; orphaned-claim detection at startup + periodic, per-execution claim suspension while unresolved. Verify: contract + fault-injection crash-between-steps-5-and-6; §25.3 criteria.
- [ ] T045: [WP-05/T05.5] Leases §11.3: expiry, heartbeat extension within policy limits, idempotent release, reassignment → new claim id, completion rejection under expired/superseded claim, restart semantics (downtime counts against expiry, stale-claim policy auditable, startup orphan sweep before serving). Verify: contract + fault-injection.
- [ ] T046: [WP-05/T05.6] Fencing-token presentation on heartbeat/release/progress/blocker/completion/admin repair; stale owner or lower token → `REVISION_CONFLICT`; serialization through claim-intent + post-mutation assignment verification when Beads cannot store tokens. RFC §11.4. Verify: split-brain suite (T049).
- [ ] T047: [WP-05/T05.7] Execution context envelopes §12: full envelope fields, least-privilege disclosure, expiry; Beads never invokes other downstream servers. Verify: contract tests.
- [ ] T048: [WP-05/T05.8] Agent-facing MCP methods: `guidance.execution.status`, `guidance.work.ready/claim/heartbeat/release/report_progress/report_blocker/get_context` per implementation contract (T002). RFC §24.1. Verify: AC-A3 per-method contract tests.
- [ ] T049: [WP-10/T10.6] Concurrency suite: parallel claims (≤1 winner), stale fencing tokens, CAS conflicts, reconciliation races, **split-brain across ≥2 Guidance instances (mandatory)**. RFC §26.5, §11.4. Verify: green; §25.3 concurrency criteria.
- [ ] T050: [WP-10/T10.7] Security suite: command injection via titles/descriptions/paths/IDs over CLI transport, path traversal/workspace escape, secret leakage in logs + projected metadata, output exhaustion, proof replay/expiry. RFC §26.7, §20, §25.6. Verify: green.

## Phase 4: M4 — Evidence-Gated Completion (WP-08 core, WP-06, e2e)

- [ ] T051: [WP-08/T08.1] Event log: §18 envelope, transactional strictly-increasing gap-free `executionSequence` allocation (crash ⇒ no reuse/gaps), append-only audit storage, all 15 required event types emitted from feature integration points. RFC §18, §21.1. Verify: unit + fault-injection sequence tests.
- [ ] T052: [WP-08/T08.2] `collectEvents` cursor API: ascending order, exact resume after `afterExecutionSequence`, `hasMore`/`nextAfterExecutionSequence`, at-least-once semantics. RFC §18. Verify: cursor tests.
- [ ] T053: [WP-08/T08.3] Ordering/causality rules §18.1: no cross-execution order, per-execution total order, per-claim report mapping, `causationId` sequencing constraint, late-report deterministic drop as unsequenced diagnostic (`INVALID_STATE_TRANSITION`). Verify: ordering tests.
- [ ] T054: [WP-06/T06.1] Progress reporting §13: per-claim monotonic `claimReportSequence` from 1 (reset per claim), duplicate → original receipt, fencing presentation, gap detection (never silently ignored), bounded out-of-order pending set + suspect-stream re-sync, untrusted summaries, optional Beads note projection (governed record stays in Guidance). Verify: contract + sequence tests.
- [ ] T055: [WP-06/T06.2] Blocker intake + lifecycle §14: six blocker types, REPORTED→VALIDATING→ACCEPTED/REJECTED→RESOLVED/SUPERSEDED with Guidance-owned audited transitions (`guidance.blockers.accept/reject/resolve`), specification blockers suspend + return to Spec-Kit lifecycle, new-scope → structured `AmendmentRequest`. Verify: lifecycle tests.
- [ ] T056: [WP-06/T06.3] `submitCompletion` + validation: submission shape §15.1, all 11 §15.2 checks, `policySetDigest` persisted with every validation result. Verify: contract tests; §25.4 missing-evidence criterion.
- [ ] T057: [WP-06/T06.4] `acceptanceState` machine §15.3: transitions incl. withdrawal, `VALIDATION_TIMEOUT` expiry, bounded transient retries → `VALIDATION_ERROR`, REJECTED→IN_PROGRESS remediation; config bounds wired. Verify: state-machine tests.
- [ ] T058: [WP-06/T06.5] Acceptance receipts §15.4: immutable receipt per `AcceptanceReceipt` (evidence refs, policy decision + set digest, origin/current package digests, source revision), `work.completion.accepted` event binding (`eventId` + `payloadDigest`) verified against the append-only log, canonical `acceptanceDigest` with recorded profile + recomputing verification; persisted before backend closure. Depends: T051/T052. Verify: receipt verification tests; §25.4 criteria.
- [ ] T059: [WP-06/T06.6] `backendClosureState` machine §15.3: NOT_STARTED→PENDING only after ACCEPTED, PENDING→CLOSED/RETRYING, bounded RETRYING (`maxClosureAttempts`) → REPAIR_REQUIRED (stop + operational alert), audited repair → CLOSED; `closeAcceptedWork` closes only the matching bound item; closure failure never alters acceptance; idempotent retry without duplicate acceptance. Verify: fault-injection crash-between-acceptance-and-closure; §25.4 criteria.
- [ ] T060: [WP-06/T06.7] `recordCompletionRejection` + remediation flow §15.5 (machine-readable reason codes, human-readable remediation, no backend close) + MCP methods `guidance.work.submit_completion` (+ report methods wired from T048/T054/T055). RFC §24.1. Verify: AC-A3 contract tests.
- [ ] T061: [WP-06/T06.8] Execution-level operations: `guidance.execution.open/publish/close` with §24 closure preconditions (no active claims, no open high/critical drift, no quarantined items — unless audited administrative override; close requires proof scoped to close). Verify: precondition tests.
- [ ] T062: [WP-08/T08.4] Snapshotting §18.2: configurable threshold (default 10,000, min 1,000), full snapshot contents, atomic creation/checkpoint publication, chained `previousSnapshotDigest`, replay from latest valid snapshot with fallback chain, replay ≡ full replay. Verify: snapshot/replay-equivalence tests; §25.7 criterion.
- [ ] T063: [WP-10/T10.9] End-to-end suite §29 scenario: Spec-Kit package → authorization → projection → claim → progress → **evidence rejection** → remediation → acceptance → closure → release of dependent work. Verify: green against fake backend; repeated against real `bd` sandbox in R-pilot.

## Phase 5: M5 — Hardening (WP-07 resolution, WP-08 retention, WP-09, WP-10 migration/scale)

- [ ] T064: [WP-07/T07.4] Drift admin workflow: `guidance.adapters.inspect_drift` + `guidance.adapters.resolve_drift` (idempotent per `findingId`, OPEN→RESOLVING→RESOLVED, exactly one action per finding: accept-backend [requires amendment]/restore-canonical/quarantine), `guidance.adapters.reconcile/list/capabilities/health`; audited resume only after all blocking findings RESOLVED; agents never resolve high/critical. RFC §16.5, §24.2. Verify: workflow tests; §25.5 criteria.
- [ ] T065: [WP-07/T07.5] Auto-resolution rules: informational/low/medium per §16.3 conflict rules only; high/critical strictly administrative. Verify: rule tests.
- [ ] T066: [WP-08/T08.5] ⏳ADR-7 Retention/pruning §18.2: pruning only into immutable archive with verified integrity + cursor continuity, retention-policy gate, no pruning under receipt/legal hold, `CURSOR_EXPIRED`/archive locators (never silent skips), `retentionEpoch` invalidation. Verify: retention tests.
- [ ] T067: [WP-08/T08.6] Dead-letter handling for repeatedly failing normalized events. RFC §21. Verify: fault-injection.
- [ ] T068: [WP-09/T09.1] Metrics module: every §22.1 bullet incl. reconciliation-mode (scanned/changed/fallback-to-full), readiness-cache diagnostics, snapshot/replay-fallback counts, backend availability/capability status; wired at all integration points; no protected-policy leakage. Verify: metric-emission tests.
- [ ] T069: [WP-09/T09.2] Structured logging with §22.2 field set (timestamp, correlation, execution/work, adapter version, backend instance, operation, result, duration, error code) + §20.8 redaction. Verify: log-correlation test.
- [ ] T070: [WP-09/T09.3] Trace spans across request handling → policy evaluation → adapter operation → backend invocation → persistence → event emission. RFC §22.3. Verify: trace-correlation test.
- [ ] T071: [WP-09/T09.4] Dashboards + alerts: closure repair, high/critical drift, backend unavailability, lease-expiry bursts, capability mismatch (actionable health diagnostics). Verify: §25.7 criteria.
- [ ] T072: [WP-09/T09.5] Runbooks + rollout documentation: publication/claim/closure recovery exercises, drift resolution, orphaned claims, stale-lease policy, store-id rebinding (§7.1), upgrade/rollback incl. version-range widening (ADR 8) and §9.7 mapping migration; rollout stages R0–R5 per spec 018 §8. RFC §29. Verify: runbook walkthroughs recorded.
- [ ] T073: [WP-10/T10.10] Migration suite §26.10: adapter/binding schema upgrades; mapping MAJOR migration per §9.7 (freeze→…→receipt→resume) with verifiable migration receipt and untouched historical receipts. Verify: green.
- [ ] T074: [WP-10/T10.11] Scale tier §21.2: 100k-item execution; full reconciliation ≤ 30 min, incremental ≤ 5 min, readiness p95 ≤ 2 s under §10.4 cache rules; separate non-CI-fast tier. Verify: measured conformance report (M5 gate).

---

## Completion Gate

All phases green ⇒ RFC §29 Definition of Done review: all mandatory §25
criteria, all ten §26 suites, approved threat model + security review,
demonstrated publication/claim/closure recovery, dashboards + alerts,
compatibility/upgrade documentation, conformance tests (mapping, status,
distributed claim, snapshot, reconciliation checkpoint, backend-instance
identity), and the complete e2e execution (T063).

## Notes

- Batching: phases map to guidance workflow batches; within a phase, tasks
  with shared write scope (e.g. T024–T028 store cluster) should be released
  as one batch; T013/T024/T066 are ⏳ADR-gated (WP-00 first).
- Baseline-aware testing per AGENTS.md: pre-existing full-suite failures are
  labeled separately, never attributed to this feature.
- GBEA-F016 (partitioning) stays deferred; no task may introduce
  partitioning.
