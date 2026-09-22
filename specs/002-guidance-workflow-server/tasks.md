# Tasks: Guidance — Configurable MCP Workflow Orchestrator with Spec-Kit Integration

**Feature**: specs/002-guidance-workflow-server · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-22
**Principles**: Test-First (constitution III — every story starts with failing tests); server isolation; conventional commits; `gitnexus analyze --no-stats` + `detect_changes()` before **every commit** (not only at the end — applies to each task's commit).
**Paths**: implementation under `servers/server-guidance/`; tests under `tests/` relative to that package; `src/…` = `servers/server-guidance/src/…`; `tests/…` = `servers/server-guidance/tests/…`.

## Phase 1 — Setup

- [x] T001 Scaffold `servers/server-guidance` package: `package.json` (`@paschbaer/guidance`, ESM, bin `mcp-server-guidance`, scripts build/test/typecheck mirroring `servers/server-insight`), `tsconfig.json` + `tsconfig.build.json` (strict, Node16), `vitest.config.ts`, `.gitignore`
- [x] T002 Create directory skeleton `src/{mcp-server,mcp-client,orchestration,workflow,integrations/spec-kit,policy,state,types}` and `tests/{contract,fixtures,orchestration,workflow,speckit,integration}` with placeholder barrel exports
- [x] T003 Add pinned dependencies per plan research R1/R10: `@modelcontextprotocol/sdk`, `ajv`, `zod`, `express` + dev deps `tsx`, `typescript`, `vitest`; verify `npm install && npm run build` succeeds
- [x] T004 Create default JSON configuration template files in `examples/default-guidance/` (`guidance.json`, `workflow.json`, `responses.json`, `operations.json`, `downstream-servers.json`, `policies.json`, `profiles/spec-kit.json`) matching `contracts/downstream-config-contract.md`, including GitNexus/Insight/Memory bindings (FR-056) and checklist-derived defaults (spec Assumptions)
- [x] T005 [P] Write README skeleton with build/run/test instructions and transport notes

## Phase 2 — Foundational (blocks all stories)

- [x] T006 Write failing contract tests for config loading in `tests/contract/config-loader.test.ts`: valid minimal config, each `configuration_invalid` violation class, YAML rejection, profile resolution (explicit / implied spec-kit / plain per FR-060), config hash stability (FR-009, FR-026, R15)
- [x] T007 Implement `src/config.ts`: JSON loader, Ajv-based built-in config schema validation (strict additionalProperties), sha256 `configurationVersion`, profile resolver, fail-closed errors — make T006 pass
- [x] T008 [P] Define core types in `src/types/`: session, submission, operation configs, operation execution/normalized result, snapshot, task, plan change, traceability, audit events per `data-model.md`
- [x] T009 [P] Implement stable error model in `src/types/errors.ts` + `src/mcp-server/errors.ts`: full v1+v2+profile code set, `{accepted, error{code,message,recoverable}, allowedActions}` response shape (contracts/upstream-mcp-tools.md)
- [x] T010 Write failing tests for atomic persistence in `tests/contract/state-repositories.test.ts`: tmp+rename session writes, JSONL append-only audit, operation-result files, corruption-on-crash simulation (FR-019, FR-021)
- [x] T011 Implement `src/state/`: `SessionRepository` (atomic read/write), `AuditRepository` (JSONL, secret-redaction hook), `OperationRepository`, session mutex — make T010 pass (FR-019, FR-021, FR-022)
- [x] T012 [P] Implement per-session async mutex + feature-lock file registry in `src/state/locks.ts` with stale-lock startup sweep (`feature_in_use` errors, FR-061/R19); tests in `tests/contract/feature-lock.test.ts` first
- [x] T013 [P] Implement Ajv validator factory in `src/workflow/schema-validator.ts`: draft 2020-12, strict `additionalProperties: false`, schema hash pinning (FR-007, FR-030, FR-042); tests first in `tests/contract/schema-validator.test.ts`
- [x] T014 [P] Implement closed-namespace template resolver in `src/orchestration/template-resolver.ts` (`${ns.path}`, fail on unknown vars, no code execution, R6); tests first in `tests/contract/template-resolver.test.ts`
- [x] T015 Implement upstream MCP server skeleton in `src/mcp-server/`: SDK `McpServer`, tool registration registry, zod input parsing, stdio entry `src/index.ts` (FR-016/027/031); smoke test in `tests/contract/server-smoke.test.ts` first
- [x] T016 Implement credential reference resolution + redaction engine in `src/policy/redaction.ts` (secret patterns, never-log list, FR-050); tests first in `tests/contract/redaction.test.ts`

## Phase 3 — US1: Deterministic workflow session (P1)

**Goal**: seven-phase engine with plain-profile tools and completion invariant.
**Independent test**: fixture config → walk phases with valid/invalid submissions; out-of-phase rejected; `completed` gated on required operations.

- [x] T017 [US1] Write failing workflow engine tests in `tests/workflow/engine.test.ts`: single active phase, allowed-transitions-only, `invalid_active_phase` rejection, transition table from config (FR-001–003)
- [x] T018 [US1] Implement `src/workflow/WorkflowEngine.ts` + `PhaseLifecycle.ts` + `TransitionValidator.ts` (lifecycle order per FR-038) — make T017 pass
- [x] T019 [US1] Write failing tests for submission validation in `tests/workflow/submissions.test.ts` (strict schemas, unknown fields rejected, one accepted submission per phase instance per FR-030)
- [x] T020 [US1] Implement submission validation + persistence wiring in `src/workflow/` using T013 — make T019 pass
- [x] T021 [US1] Write failing contract tests for plain workflow tools in `tests/contract/tools-workflow.test.ts`: `start_workflow`, `get_current_guidance`, 6 submit tools, `get_workflow_state` shapes per contract
- [x] T022 [US1] Implement tool handlers + response mapping in `src/mcp-server/ToolHandlers.ts`/`ResponseMapper.ts` — make T021 pass
- [x] T023 [P] [US1] Write failing tests for phase instruction composition in `tests/workflow/guidance.test.ts` (configured responses returned verbatim per FR-006)
- [x] T024 [US1] Implement response composition from `responses.json` in `src/workflow/` — make T023 pass
- [x] T025 [US1] Write failing tests for the v1 completion gate in `tests/workflow/completion.test.ts` (no `completed` while required operations unresolved — FR-004)
- [x] T026 [US1] Implement completion invariant gate in `src/workflow/TransitionValidator.ts` wired to operation results — make T025 pass
- [x] T027 [P] [US1] Implement `report_blocker` + `resume_workflow` + `blocked` state preservation in `src/workflow/` (FR-028); tests first in `tests/workflow/blocker.test.ts`
- [x] T028 [US1] Golden end-to-end test `tests/integration/plain-flow.test.ts`: full 7-phase walk with stub operations (quickstart validation A)

## Phase 4 — US2: Configuration-driven customization (P2)

**Goal**: two projects, two processes, one binary.
**Independent test**: swap `.guidance/` dirs → different instructions/transitions/ops; invalid config fails closed (already covered) and custom ops execute.

- [x] T029 [US2] Write failing tests in `tests/contract/profile-config.test.ts`: custom instructions returned, custom lifecycle ops bound to phases, second fixture project differs (SC-006, FR-006/008)
- [x] T030 [US2] Implement default config artifacts load + example profile JSON validation in `src/config.ts` consumers — make T029 pass
- [x] T031 [P] [US2] Implement sampling/elicitation/composite operation config types + validation in `src/types/operation.ts` (FR-039)
- [x] T032 [P] [US2] Write failing tests for verify-phase lifecycle binding (`lint`,`test`,`build` process ops) in `tests/workflow/verify-ops.test.ts` (US2 scenario 2)
- [x] T033 [US2] Implement process-type operation execution in `src/orchestration/OperationEngine.ts` (executable+args, cwd validation, timeout, output capture per FR-010–012) — make T032 pass

## Phase 5 — US4: Deterministic downstream orchestration (P1)

**Goal**: Guidance invokes and validates downstream MCP operations itself; completion invariant enforced.
**Independent test**: stub downstream servers (success/fail/timeout/drift/disappear) gate completion exactly per configuration.

- [x] T034 [US4] Build SDK-based stub downstream server harness in `tests/orchestration/stubs/`: configurable success/tool-error/transport-failure/timeout/schema-drift/injection-payload/invocation-counter modes (research R5)
- [x] T035 [US4] Write failing tests for the client manager in `tests/orchestration/client-manager.test.ts`: per-server client instances, stdio supervision, eager/lazy per required flag, handshake, failure isolation (FR-031/033/034, SC-008)
- [x] T036 [US4] Implement `src/mcp-client/ClientManager.ts` + `ClientConnection.ts` + `CapabilityDiscovery.ts` (SDK negotiation, hash-pinned contracts) — make T035 pass
- [x] T037 [US4] Write failing tests for tool invocation in `tests/orchestration/invocation.test.ts`: invoke mapped tool, normalize result, distinguish tool-reported vs transport errors (FR-032/037, contract tests 1)
- [x] T038 [US4] Implement `src/orchestration/` OperationEngine + ResultNormalizer + ResultValidator (explicit validation policies, FR-036) — make T037 pass
- [x] T039 [US4] Write failing tests for retry + limits in `tests/orchestration/retry-limits.test.ts`: transient vs deterministic classification, backoff, timeout ⇒ `timed_out` + downstream cancel, size caps (FR-041)
- [x] T040 [US4] Implement RetryController + cancellation (AbortController, SIGTERM→SIGKILL supervision) — make T039 pass (R8)
- [x] T041 [US4] Write failing tests for drift detection in `tests/orchestration/drift.test.ts` (schema hash change ⇒ `downstream_capability_changed`, blocked transition, audit event, FR-042)
- [x] T042 [US4] Implement capability drift detection + snapshot pinning — make T041 pass
- [x] T043 [US4] Write failing tests for idempotency in `tests/orchestration/idempotency.test.ts` (duplicate `requestId` ⇒ recorded result, invocation counter unchanged, SC-005, FR-043)
- [x] T044 [US4] Implement request-id ledger + execution-id idempotency in `src/state/`/`src/orchestration/` — make T043 pass
- [x] T045 [US4] Write failing tests for completion integration in `tests/workflow/completion-gitnexus.test.ts`: `repository-analysis` op at complete.beforeExit via GitNexus binding; fail ⇒ remain in `complete`; success ⇒ `completed`; explicit fallback chain (MCP→local command) audited (FR-005, FR-055, SC-002)
- [x] T046 [US4] Implement completion invariant v2 wiring + fallback executor (`firstAvailable` strategy) — make T045 pass
- [x] T047 [US4] Write failing tests for orchestration tools in `tests/contract/tools-orchestration.test.ts`: `get_orchestration_status`, `list_configured_operations` (safe view), `get_operation_result` (exposure filtering), `retry_operation`, `get_downstream_status` (FR-046)
- [x] T048 [US4] Implement orchestration tool handlers — make T047 pass
- [x] T049 [US4] Write failing tests for persistence of downstream state in `tests/orchestration/state.test.ts` (per-server status, snapshot hash ref, per-op attempts in session JSON, FR-044) and implement in `src/state/SessionRepository.ts`

## Phase 6 — US5: Governed downstream access (P2)

**Goal**: least authority; injection-proof; secret-free outputs.
**Independent test**: forbidden registrations/invocations rejected + audited; injection payloads never change outcomes; no secrets in outputs.

- [x] T050 [US5] Write failing tests for agent-side restrictions in `tests/orchestration/governance.test.ts`: register-server/expand-allowlist/arbitrary-tool attempts rejected + audited (FR-047/048, SC-003)
- [x] T051 [US5] Implement policy checks in `src/policy/PolicyEngine.ts` — make T050 pass
- [x] T052 [US5] Write failing injection tests in `tests/orchestration/injection.test.ts`: policy-overriding text in tool results/prompts/descriptions never changes transitions; exposure-mode-only surfacing (FR-049, SC-009)
- [x] T053 [US5] Implement untrusted-content handling + exposure modes in ResultNormalizer/response composition — make T052 pass
- [x] T054 [US5] Write failing tests for egress/risk/approval in `tests/orchestration/egress.test.ts`: trust-level data rules, risk classes, destructive/credential-sensitive ops require authorization (FR-052/053)
- [x] T055 [US5] Implement DataEgressPolicy + ApprovalPolicy in `src/policy/` — make T054 pass
- [x] T056 [P] [US5] Write failing tests for secrets hygiene in `tests/contract/secrets.test.ts` (0 secret patterns in responses/state/audit; FR-050, SC-007) and wire redaction into all writers — make pass

## Phase 7 — US7: Artifact-driven task orchestration (P1 — spec-kit profile)

**Goal**: import → validate → snapshot → schedule → evidence-gated completion.
**Independent test**: fixture feature directories drive import, release order, and evidence gating.

- [ ] T057 [US7] Create fixture feature directories in `tests/fixtures/` per research R18 (`valid-minimal`, `valid-full`, `missing-tasks`, `empty-spec`, `duplicate-task-ids`, `unknown-dependency`, `dependency-cycle`, `checkbox-tampered`, `injected-instructions`, `stale-snapshot`)
- [ ] T058 [US7] Write failing parser golden tests in `tests/speckit/parser.test.ts` over `valid-full` (T### IDs, `[P]`, bold section → sourceSection, dependency refs, FR/AC reference capture, unknown markers ⇒ warnings) (FR-063)
- [ ] T059 [US7] Implement line-based deterministic parser `src/integrations/spec-kit/ArtifactParser.ts` + `TaskNormalizer.ts` (parserVersion constant) — make T058 pass
- [ ] T060 [US7] Write failing tests for discovery + import in `tests/speckit/discovery-import.test.ts`: explicit/branch/auto strategies, ambiguity blocks, workspace boundary rejection, artifact identity records, structural validation error classes (FR-061/062/063)
- [ ] T061 [US7] Implement `FeatureDiscovery.ts` + `ArtifactDiscovery.ts` + `ArtifactImporter.ts` + `ArtifactValidator.ts` — make T060 pass
- [ ] T062 [US7] Write failing snapshot tests in `tests/speckit/snapshots.test.ts`: immutable manifests, linked history, tiered staleness (stat per state change; full hash at completion), `spec_kit_snapshot_stale` (FR-064)
- [ ] T063 [US7] Implement `SnapshotManager.ts` + `src/state/SnapshotStore.ts` — make T062 pass
- [ ] T064 [US7] Write failing task-state machine tests in `tests/speckit/task-states.test.ts`: legal transitions, Guidance-only authority, checkbox = hint (FR-066, SC-011)
- [ ] T065 [US7] Implement task state machine + readiness predicate (fixed set {`completed`,`verified`}, FR-067) — make T064 pass
- [ ] T066 [US7] Write failing scheduler tests in `tests/speckit/scheduler.test.ts`: modes single/batch(3)/allReady/phaseGroup, ready-only release, release/lock lifecycle (FR-068, SC-012)
- [ ] T067 [US7] Implement `DependencyGraph.ts` + `TaskScheduler.ts` — make T066 pass
- [ ] T068 [US7] Write failing contract tests for profile tools in `tests/contract/tools-speckit.test.ts`: `discover_spec_kit_feature`, `import_spec_kit_artifacts`, `get_spec_kit_status`, `get_next_task`, `start_task`, `submit_task_implementation`, `submit_task_review`, `complete_task`, `validate_spec_kit_completion` (read-only invariant evaluation incl. fault-injection cases: stale snapshot, pending plan change, unverified criterion, incomplete task — SC-013) (release/evidence gating per FR-069; profile-only registration R17)
- [ ] T069 [US7] Implement profile tool handlers in `src/mcp-server/` — make T068 pass
- [ ] T070 [US7] Write failing tests for evidence-gated verification binding in `tests/speckit/verification.test.ts` (scopes task/batch/feature/repository bound to tasks via FR-070; agent claims never evidence) and implement verification bindings in `src/integrations/spec-kit/`
- [ ] T071 [US7] Golden end-to-end test `tests/integration/speckit-flow.test.ts`: import → implement batches → review → verify → complete with stub downstream (quickstart validation B)

## Phase 8 — US8: Traceability (P2)

**Goal**: requirement → criterion → task → file → test → verification graph with coverage statuses.
**Independent test**: fixture import + stub verification → report matches expected graph; uncovered criteria listed.

- [ ] T072 [US8] Write failing tests for link acquisition in `tests/speckit/traceability.test.ts`: parsed vs asserted links, invalid asserted IDs rejected, coverage status derivation (FR-071)
- [ ] T073 [US8] Implement `TraceabilityGraph.ts` + normalizer links — make T072 pass
- [ ] T074 [P] [US8] Write failing tests for `get_traceability_report` in `tests/contract/tools-traceability.test.ts` (`onlyUncovered` filter) and implement the handler — make pass

## Phase 9 — US9: Controlled plan changes (P2)

**Goal**: proposals, deterministic classification, approval, refresh + atomic reconciliation.
**Independent test**: fixture proposals drive classification/approval/refresh; evidence preserved.

- [ ] T075 [US9] Write failing tests for proposal + classification in `tests/speckit/plan-changes.test.ts`: closed trigger list, deterministic minor/major rules, major ⇒ approval via elicitation/blocker channel (FR-072)
- [ ] T076 [US9] Implement `PlanChangeService.ts` + deterministic classifier — make T075 pass
- [ ] T077 [US9] Write failing reconciliation tests in `tests/speckit/reconciliation.test.ts`: FR-073 rules table per changed-task class, evidence preservation, atomic apply (crash ⇒ old snapshot authoritative, SC-014)
- [ ] T078 [US9] Implement `ReconciliationEngine.ts` + `refresh_spec_kit_artifacts` + `propose_plan_change` handlers (preview → atomic apply) — make T077 pass
- [ ] T079 [US9] Write failing tests for waiver flow in `tests/speckit/waiver.test.ts` (user approval via FR-054 channel, reason, audit event, completion-report listing per FR-071) and implement — make pass

## Phase 10 — US3: Recoverable & auditable execution (P3)

**Goal**: restart survival, idempotent recovery, full auditability.
**Independent test**: restart between every state change; history complete; concurrent requests serialized.

- [ ] T080 [US3] Write failing restart-recovery tests in `tests/integration/restart.test.ts`: resume at same phase + orchestration state; `running` op reconciliation; unknown state-changing outcome blocks re-run (FR-043, SC-004)
- [ ] T081 [US3] Implement crash-recovery reconciliation in `src/state/` + `src/orchestration/` — make T080 pass
- [ ] T082 [US3] Write failing concurrency tests in `tests/workflow/concurrency.test.ts`: per-session serialization, `session_locked` recoverable error (FR-022) — make pass with T011 mutex
- [ ] T083 [US3] Write failing audit-completeness tests in `tests/contract/audit.test.ts`: every v1+v2+profile event emitted at the right transition incl. snapshot id (FR-045, SC-015) — close gaps in emitters
- [ ] T084 [US3] Write failing retention tests in `tests/contract/retention.test.ts` (FR-029: 90-day default, archive-or-delete recorded, active never pruned) and implement in `src/state/`

## Phase 11 — US6: Structured human input (P3)

**Goal**: elicitation with graceful degradation; bounded sampling.
**Independent test**: stub host with/without elicitation+sampling capabilities.

- [ ] T085 [US6] Write failing tests for sampling/elicitation operations in `tests/orchestration/sampling-elicitation.test.ts`: bounded sampling (purpose/prompt/token/retry limits, advisory-only), elicitation request when supported, structured blocker + `resolve_operation_input` fallback, denied credential fields (FR-039/054, US6)
- [ ] T086 [US6] Implement `src/orchestration/SamplingOperation.ts` + `ElicitationOperation.ts` + shared `src/policy/ElicitationService.ts` — make T085 pass

## Phase 12 — Polish & cross-cutting

- [ ] T087 Implement loopback-only HTTP transport in `src/server.ts` + Express adapter (bind guard test: non-loopback bind fails; FR-027); tests first in `tests/contract/http-transport.test.ts`
- [ ] T088 [P] Write failing perf test `tests/integration/overhead.test.ts` (SC-010: <1 s p95 Guidance-added transition overhead with stubs) and optimize hot paths to pass
- [ ] T089 [P] Implement structured leveled operational logging (FR-059) behind `src/state/AuditRepository.ts` logger with redaction; tests in `tests/contract/logging.test.ts` first
- [ ] T090 Full contract-test sweep: run all `tests/contract/` suites; fix regressions across stories; confirm behavioral guarantees 1–7 in `contracts/upstream-mcp-tools.md`
- [ ] T091 Update `README.md` (build, run, transports, profiles, config reference) and root docs references; remove examples of stale behavior
- [ ] T092 Pre-merge gate: run full `npm test`, `npm run typecheck`; update knowledge graph (`gitnexus analyze --no-stats`); run `detect_changes()`; update `memory-bank/activeContext.md` + `progress.md` (constitution IV)

## Dependencies

- Phase 2 blocks every story.
- US1 (Phase 3) → US2 (Phase 4) → US4 (Phase 5) → US5 (Phase 6).
- US7 (Phase 7) requires Phases 3–5 (engine, config, orchestration).
- US8 (Phase 8) and US9 (Phase 9) require US7; US9 also uses US5 approval policy.
- US3 (Phase 10) requires US1 + US4; US6 (Phase 11) requires US4.
- Phase 12 last.

## Parallel Execution Examples

- Phase 2: T008, T009, T012, T013, T014, T016 all touch disjoint files after T006/T007 land.
- Phase 5: T039–T044 (retry/idempotency) parallelizable against T037–T038 once stub harness T034 exists.
- Phase 7: T058–T059 (parser) parallel to T060–T061 (discovery/import); T064–T067 parallel to T068 after entity types exist.
- Story phases themselves are sequential except US8 ∥ US9 (disjoint modules) and US6 ∥ US3 (disjoint files).

## Implementation Strategy

- MVP = Phase 3 (US1): a working plain-profile workflow engine is independently valuable and demoable.
- Increment 2 = Phases 4–6: downstream orchestration + governance (the v2 differentiator, SC-002/005/008/009).
- Increment 3 = Phases 7–9: Spec-Kit profile (US7–9).
- Increment 4 = Phases 10–12: resilience, human input, transports, polish.
- Every task: failing test first (constitution III), conventional-commit per logical group, `gitnexus analyze --no-stats` + `detect_changes()` before commit.
