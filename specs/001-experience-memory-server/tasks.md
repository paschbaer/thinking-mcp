# Tasks: Experience Memory Server (EMMS)

**Input**: Design documents from `specs/001-experience-memory-server/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D5), data-model.md, contracts/tools.md, contracts/guidance.md, quickstart.md

**Tests**: REQUIRED — Constitution gate III (Test-First, NON-NEGOTIABLE): contract tests are written BEFORE implementation within each story phase.

**Organization**: Grouped by user story (US1–US5 from spec.md); server code lives under `servers/server-experiencememory/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths included in every description

## Path Conventions

All implementation under `servers/server-experiencememory/` (existing scaffold: `src/index.ts`, `src/server.ts`, `src/dev.ts`, `src/config.ts`, `src/tools/index.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Install dependencies and verify build passes: add `better-sqlite3` (+ `@types/better-sqlite3`) to `servers/server-experiencememory/package.json`, run `npm install`, `npm run build`, `npm test` (empty suite OK)
- [X] T002 Create domain type definitions (all entities from data-model.md as TypeScript types + zod schemas) in `servers/server-experiencememory/src/domain/types.ts` and `servers/server-experiencememory/src/domain/schemas.ts`
- [X] T003 [P] Implement episode state machine (states + transition table per data-model.md; invalid transitions throw `INVALID_TRANSITION`) in `servers/server-experiencememory/src/domain/state-machine.ts` with unit test `servers/server-experiencememory/tests/unit/state-machine.test.ts` written first
- [X] T004 [P] Implement revision logic (monotonic per-workflow integer starting at 1; `assertExpectedRevision(expected, current)` throwing `STALE_REVISION` with `current_revision`) in `servers/server-experiencememory/src/domain/revision.ts` with unit test `tests/unit/revision.test.ts` written first (D2)

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage, guidance, and error infrastructure required by ALL user stories.

- [X] T005 Define `StorageAdapter` interface (episodes, workflows, events append-only, artifacts metadata, idempotency keys, audit) in `servers/server-experiencememory/src/storage/adapter.ts`
- [X] T006 Implement `SqliteAdapter` (WAL mode; tables per data-model.md; FTS5 index over episode summary/failure excerpt; normalized-signature hash columns) in `servers/server-experiencememory/src/storage/sqlite.ts` with schema migration `servers/server-experiencememory/src/storage/migrations.ts`
- [X] T007 Write storage contract test FIRST: durability across reopen, append-only event immutability, no physical deletion path for episodes/artifacts (FR-034: any delete attempt leaves rows intact and audit-visible), idempotency-key uniqueness, visibility filtering at read level in `servers/server-experiencememory/tests/contracts/storage.test.ts` (fails before T006 completes, green after)
- [X] T008 Implement canonical error contract (`{error:{code,message,retryable,details}, guidance}`; codes: INVALID_REQUEST, STALE_REVISION, INVALID_TRANSITION, MISSING_REQUIRED_EVIDENCE, ARTIFACT_REJECTED, DUPLICATE_IDEMPOTENCY, RATE_LIMITED, INTERNAL_ERROR) in `servers/server-experiencememory/src/domain/errors.ts`
- [X] T009 Implement `GuidanceEnvelope` zod schema + invariants 1–7 from contracts/guidance.md (allowed-tools subset check, placeholder restriction to `<collect value>`/`<attach artifact>`, revision read-after-write) in `servers/server-experiencememory/src/guidance/envelope.ts` with contract test `tests/contracts/guidance.test.ts` written first (D4)
- [X] T010 Implement guidance computation engine (missing_information from episode state, allowed_next_tools from state machine, evidence-collection-over-speculation preference) in `servers/server-experiencememory/src/guidance/engine.ts`
- [X] T011 Implement content-addressed evidence store (SHA-256 file addressing, size/type validation, hash-verify on read) in `servers/server-experiencememory/src/evidence/store.ts`
- [X] T012 Implement deterministic pattern-based redactor (API-key/token formats, connection strings, private keys, passwords, home-directory paths; findings count; versioned ruleset id) plus instruction-like-string flagging (flags artifact `trust` note when content matches instruction-imperative patterns — data only, never executed) in `servers/server-experiencememory/src/evidence/redact.ts` with unit test `tests/unit/redact.test.ts` written first (FR-025, FR-026)
- [X] T013 Implement failure normalization (line endings, timestamps/volatile IDs stripped, home paths replaced, exit-code extraction, exact rare tokens preserved, canonical-JSON SHA-256 normalized hash) in `servers/server-experiencememory/src/domain/normalize.ts` with unit test `tests/unit/normalize.test.ts` written first
- [X] T014 Register tool scaffolding pipeline: a `registerTool` helper in `servers/server-experiencememory/src/tools/register.ts` that wraps every handler with schema validation, idempotency check, revision check, guidance attachment, and error-mapping (single choke point for contracts/tools.md common fields)

## Phase 3: User Story 1 — Agent avoids repeating known failures (P1)

**Goal**: Search returns the most applicable prior experience with applicability reasons, known-bad attempts, and incompatibility demotion.
**Independent Test**: Seed store with a verified episode (fixtures); search with matching signature + environment → top result is the compatible verified episode; harmful attempt flagged; incompatible env demoted with mismatches. (quickstart.md G1 step 5, G2, G3)

- [X] T015 [US1] Write retrieval contract tests FIRST in `servers/server-experiencememory/tests/contracts/retrieval.test.ts`: exact-signature top result, normalized-hash fallback, FTS5 full-text arm, incompatibility demotion with mismatch reporting, stale flag, contradiction flag (D5), semantic-absence note `retrieval_notes.semantic_available: false`
- [X] T016 [US1] Implement retrieval arms (exact hash, normalized hash, FTS5 full-text, technology/version filter) behind `RetrievalArm` interface in `servers/server-experiencememory/src/retrieval/arms.ts`
- [X] T017 [US1] Implement applicability scoring (env comparison → matches/mismatches/unknowns/hard_exclusions) and weighted ranking with configurable weights (defaults in `servers/server-experiencememory/src/config.ts`), applicability-before-similarity enforcement in `servers/server-experiencememory/src/retrieval/ranking.ts`
- [X] T018 [US1] Implement duplicate/contradiction detection (D5: identical normalized hash + Jaccard ≥ 0.8 goal similarity = duplicate; same hash + opposing classifications each with ≥1 evidence artifact = contradiction) in `servers/server-experiencememory/src/retrieval/detect.ts`
- [X] T019 [US1] Implement `experience.search` tool (result cards, limit default 5 max 20, visibility filter, include_unverified/include_negative policies) in `servers/server-experiencememory/src/tools/search.ts` wired via `src/tools/index.ts`
- [X] T020 [US1] Create evaluation fixture corpus seed (≥30 tasks per D3 composition; includes verified episode, Windows episode for G2, harmful-attempt episode for G3) as `servers/server-experiencememory/tests/fixtures/corpus.json` with loader `tests/fixtures/load.ts`
- [X] T021 [US1] Validate G2/G3 scenarios from quickstart.md against the running server; record results in `servers/server-experiencememory/tests/fixtures/golden-results.md`

## Phase 4: User Story 2 — Agent captures a verified fix end-to-end (P1)

**Goal**: Complete capture workflow with intent/fact/observation/interpretation separation; verified status only with objective evidence.
**Independent Test**: Drive capture→validate→finalize with evidence → LOCALLY_VERIFIED; same without regression run → NEEDS_MORE_EVIDENCE; unsupported assertion alone never verified. (quickstart.md G1 steps 1–4, 6)

- [X] T022 [US2] Write capture contract tests FIRST in `servers/server-experiencememory/tests/contracts/capture.test.ts`: state transitions gated (FR-019), intent/fact separation preserved (FR-003), provenance recorded on every observation/claim (actor, source type, timestamps, observed/inferred/summarized — FR-032), evidence-required verification (FR-008 incl. critical-side-effect criteria), idempotent replays (FR-028), revision conflicts (D2), finalization outcomes incl. NEEDS_MORE_EVIDENCE and DUPLICATE_CANDIDATE
- [X] T023 [US2] Implement episode service (create episode, record_observation, record_attempt, complete_attempt, propose/update_hypothesis, propose_solution with validation plan) in `servers/server-experiencememory/src/domain/episode-service.ts` using StorageAdapter + state machine + revision logic
- [X] T024 [US2] Implement validation service (validation.plan with ≥1 acceptance-criteria-linked check, validation.record_run with evidence requirement, finalize assessment: verified requires original-failure check + regression checks each with evidence artifact) in `servers/server-experiencememory/src/domain/validation-service.ts`
- [X] T025 [US2] Implement capture tools (`workflow.start`, `workflow.status`, `experience.begin`, `experience.record_observation`, `experience.record_attempt`, `experience.complete_attempt`, `experience.propose_hypothesis`, `experience.update_hypothesis`, `experience.propose_solution`, `validation.plan`, `validation.record_run`, `experience.finalize`) in `servers/server-experiencememory/src/tools/capture.ts` via registerTool pipeline
- [X] T026 [US2] Implement `artifact.attach`/`artifact.describe` tools (redaction pipeline before persistence, findings count, trust label, content-addressed storage) in `servers/server-experiencememory/src/tools/artifacts.ts`
- [X] T027 [US2] Validate G1 (capture→finalize→verified, then negative: missing regression run → NEEDS_MORE_EVIDENCE) and idempotency/stale-revision scenarios from quickstart.md; extend `tests/fixtures/golden-results.md`
- [X] T028 [US2] Implement durable resumption: all state via StorageAdapter transactions; add test that killing and reopening the store mid-workflow preserves all records (FR-009) in `tests/contracts/durability.test.ts`
- [X] T047 [US2] Implement `workflow.abandon` tool (finalizes episode UNRESOLVED, retains all evidence, appends event + audit record, guidance stop_conditions note) in `servers/server-experiencememory/src/tools/capture.ts` with acceptance test in `tests/contracts/capture.test.ts` (FR-009, FR-030; contracts/tools.md §workflow.abandon)

## Phase 5: User Story 3 — Server guides the agent's next step (P2)

**Goal**: Every response carries a valid GuidanceEnvelope; agents can decline guidance.
**Independent Test**: workflow.status on a fresh workflow lists missing required info with hints; every recommended request schema-validates; invalid requests return corrected templates; decline path recalculates. (contracts/guidance.md invariants)

- [X] T029 [US3] Write guidance contract tests FIRST in `servers/server-experiencememory/tests/contracts/guidance-flow.test.ts`: envelope present on every tool response, recommendation ∈ allowed tools and schema-valid, placeholder-only unknowns, invalid-state request → recoverable error + corrected template, decline-with-reason recalculates path
- [X] T030 [US3] Implement `guidance_decision` decline handling (reason_code + explanation; recalculation without penalty) in `servers/server-experiencememory/src/guidance/engine.ts`
- [X] T031 [US3] Implement workflow profile limits (max diagnostic turns, max repeated identical attempts, budget thresholds, escalation to evidence-collection or human input, stop conditions) in `servers/server-experiencememory/src/guidance/limits.ts` (FR-013)
- [X] T032 [US3] Wire guidance into every registered tool (verify via registerTool pipeline integration test `tests/contracts/all-tools-guidance.test.ts` iterating the tool registry)
- [X] T033 [US3] Implement schema-validation audit: test that every `arguments_template` the engine emits validates against the target tool's zod schema (extends `tests/contracts/guidance.test.ts`)

## Phase 6: User Story 4 — Memory stays trustworthy over time (P2)

**Goal**: Staleness, contradictions, regression demotion, honest lesson promotion, auditability.
**Independent Test**: Seeded stale/contradicted episodes demote with visible warnings; regression drops priority immediately; single verified episode stays "candidate" lesson; invalidation excludes from default search. (quickstart.md; D5)

- [X] T034 [US4] Write lifecycle contract tests FIRST in `servers/server-experiencememory/tests/contracts/lifecycle.test.ts`: append-only event log on every transition (FR-020), regression → immediate priority reduction + warning + linked episode (FR-023), staleness flag + ranking penalty, invalidated excluded from default search but auditable (FR-018), single-verified-episode lesson stays candidate (FR-022, lesson schema reserved)
- [X] T035 [US4] Implement staleness/recaclculation service (last_verified_at thresholds, freshness flag, ranking penalty hookup) in `servers/server-experiencememory/src/domain/freshness.ts`
- [X] T036 [US4] Implement regression recording (`experience.mark_regression` lowering priority, attaching warning, linking failing episode, flagging contradiction per D5) in `servers/server-experiencememory/src/domain/regression.ts` + tool registration in `src/tools/lifecycle.ts`
- [X] T037 [US4] Implement `experience.invalidate` and `experience.record_reuse_feedback` (feedback influences ranking per FR-024) in `servers/server-experiencememory/src/tools/lifecycle.ts`
- [X] T038 [US4] Implement audit event recording for all privileged operations (actor D1, action, target, revisions, reason, policy/ruleset version; no sensitive content) in `servers/server-experiencememory/src/domain/audit.ts`, hooked into registerTool pipeline
- [X] T039 [US4] Implement reuse-feedback ranking factor and verify SC-009 demotion observable via test in `tests/contracts/lifecycle.test.ts`

## Phase 7: User Story 5 — Knowledge shared safely across boundaries (P3)

**Goal**: Visibility isolation (incl. no existence leaks), redaction-before-persistence, complete audit, idempotent replay.
**Independent Test**: Cross-scope search returns nothing from other scope; secret-bearing artifacts redacted with findings count; replayed mutations create no duplicates; audit records complete. (quickstart.md additional scenarios)

- [X] T040 [US5] Write isolation/security contract tests FIRST in `servers/server-experiencememory/tests/contracts/isolation.test.ts`: cross-scope search empty (incl. counts/ids), same-repo-renamed recognition via scope fingerprint match (FR-033), redaction findings on seeded secret artifacts, idempotency replay across all mutating tools, audit completeness for privileged ops
- [X] T041 [US5] Enforce scope filtering in every StorageAdapter read path (not only search) with tenant/visibility predicate in `servers/server-experiencememory/src/storage/sqlite.ts`; add negative test for existence leaks (counts, totals, errors)
- [X] T042 [US5] Add end-to-end isolation + redaction + audit scenario validation per quickstart.md "Additional validation scenarios"; extend `tests/fixtures/golden-results.md`

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T043 [P] Update `servers/server-experiencememory/README.md`: tool families implemented, quickstart pointer, config options (ranking weights, storage path)
- [X] T044 [P] Update root `README.md` with the new server entry (Constitution: docs in sync)
- [X] T045 Run `gitnexus analyze --no-stats` and `detect_changes()` to verify affected scope (Constitution pre-commit gate)
- [ ] T046 Run full suite `npm test` + `npm run typecheck` in `servers/server-experiencememory`; run `quickstart.md` G1–G3 end-to-end; update memory-bank `progress.md`, `lessonsLearned.md`, `activeContext.md`, and mark reviewed items in `checklists/spec-quality.md` (reviewer)
- [X] T048 [P] Implement SC-001 baseline harness: corpus runner mode with retrieval disabled (baseline) vs enabled, emitting per-task ineffective/harmful attempt counts and the reduction percentage, in `servers/server-experiencememory/tests/fixtures/baseline-run.ts`; write the SC-001 measurement procedure from spec.md as its contract test in `tests/contracts/evaluation.test.ts` first

---

## Dependencies

```text
Phase 1 (T001–T004) → Phase 2 (T005–T014) → Phase 3 (US1) → Phase 4 (US2)
                                          ↘ Phase 5 (US3) [needs T010, T014]
Phase 4 → Phase 6 (US4) [needs episode+validation services]
Phase 2 → Phase 7 (US5) [needs storage+evidence; best after US1/US2 for fixtures]
Phase 8 last
```

- US1 depends on foundational storage/guidance (Phase 2).
- US2 depends on US1's detection only for DUPLICATE_CANDIDATE finalize outcome (can start in parallel after Phase 2 with stub detection).
- US3 depends on Phase 2 guidance engine; independent of US1/US2 content.
- US4 depends on US2 (episodes with verified states exist).
- US5 can start after Phase 2; realistic validation needs US1/US2 fixtures.

## Parallel Execution Examples

- Phase 1: T003, T004 together (independent files).
- Phase 2: T005→T006→T007 sequential; T008, T011, T012, T013 in parallel after T002.
- Phase 3: T016–T018 parallel after T015 (tests first); T020 parallel with all.
- Phase 4: T023/T024 parallel after T022; T025/T026 after services.
- US3/US4/US5 test tasks (T029/T034/T040) can be written in parallel once Phase 2 completes.

## Implementation Strategy

- **MVP first**: Phases 1–4 deliver the core value (US1+US2 = capture, verify, retrieve) — shippable single-developer increment.
- **Test-first enforced**: every contract test task precedes its implementation task; Constitution gate III.
- **Incremental delivery**: each story phase ends independently testable per its "Independent Test" line and quickstart.md scenarios.

## Format validation

All tasks follow `- [ ] T### [P?] [USn?] Description with file path`; story labels only in Phases 3–7; setup/foundational/polish phases unlabeled.
