# EMMS Requirements Quality Checklist: Experience Memory Server

**Purpose**: Rigorous requirements-quality validation of spec.md + design decisions (research.md D1–D5, contracts/) across trust & evidence, retrieval quality, guidance & workflow, security, and scenario coverage — used as a pre-`/speckit-tasks` gate.
**Created**: 2026-09-17
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [research.md](../research.md) · [contracts](../contracts/)

**Review Ownership**: This checklist is a reviewer-owned requirements-quality review artifact. Mark an item `[x]` only when the reviewer determines the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Requirement Completeness

- [x] CHK001 - Are data retention limits quantified for artifact files (max size per artifact, max count per episode)? [Completeness, Spec §FR-031]
- [x] CHK002 - Is the minimum required content of `client_context` fully specified for every mutating tool? [Completeness, Contracts §tools]
- [x] CHK003 - Are requirements defined for what happens when `workflow.abandon` is called mid-validation? [Completeness, Gap]
- [x] CHK004 - Are completion/cancellation semantics defined for an episode whose workflow is deleted or expires? [Completeness, Gap]
- [x] CHK005 - Is the set of "critical side effects" that block verified status (FR-008 finalization) defined with criteria? [Completeness, Spec §FR-008]
- [x] CHK006 - Are requirements specified for concurrent workflows touching the same episode? [Completeness, Gap]
- [x] CHK007 - Is the `session` and `workflow` visibility level (FR-027) behaviorally defined beyond naming? [Completeness, Spec §FR-027]
- [x] CHK008 - Are requirements defined for artifact deduplication when identical content is attached twice? [Completeness, Gap]
- [x] CHK009 - Does the spec define the actor's permissions model for each tool (who may finalize, invalidate, attach)? [Completeness, D1, Gap]
- [x] CHK010 - Are environment-snapshot required-vs-optional fields enumerated per collection level? [Completeness, Spec §FR-001, Gap]

## Requirement Clarity

- [x] CHK011 - Is "credible baseline evidence" (FR-008 minimum local verification) defined with objective criteria? [Clarity, Spec §FR-008]
- [x] CHK012 - Is "semantic similarity ≥ 0.8" (D5 duplicate threshold) traceably defined as token-set Jaccard in the spec itself, not only research.md? [Clarity, Traceability]
- [x] CHK013 - Is the ranking combination (FR-014 "configurable ranking weights") specified with default values and a configuration source? [Clarity, Spec §FR-014]
- [x] CHK014 - Are "misleading" vs "harmful" reuse-feedback verdicts (FR-024) distinguished with definitions? [Clarity, Spec §FR-024]
- [x] CHK015 - Is the severity mapping for guidance warnings (low/medium/high, D4) defined — which conditions produce which severity? [Clarity, Contracts §guidance]
- [x] CHK016 - Is "interactive agent use / perceived as instant" (SC-005) quantified with a measurable threshold in the spec? [Clarity, Spec §SC-005]
- [x] CHK017 - Is "relevant prior experience in the top 3" (SC-002) defined against a specific ranking function version? [Clarity, Spec §SC-002]
- [x] CHK018 - Are placeholder strings `<collect value>` / `<attach artifact>` the ONLY permitted placeholders, and is this stated as exhaustive? [Clarity, Contracts §guidance]

## Requirement Consistency

- [x] CHK019 - Do FR-034 (no physical deletion) and audit-based administrator deletion (FR-030) state a consistent precedence order? [Consistency, Spec §FR-034]
- [x] CHK020 - Is FR-015 (applicability before similarity) consistent with SC-002 (top-3 retrieval) for corpora where all candidates are incompatible? [Consistency]
- [x] CHK021 - Do D2 revision rules and FR-028 idempotency rules define non-conflicting behavior for a replayed request with a stale revision? [Consistency, Spec §FR-028/029]
- [x] CHK022 - Are observation `kind` values consistent between spec FR-002 and the contracts tool table? [Consistency, Contracts §tools]
- [x] CHK023 - Is the episode state machine consistent between spec FR-019 and data-model.md (same states, same transition set)? [Consistency, Data Model]
- [x] CHK024 - Does the "MVP ships without semantic arm" decision (FR-014) conflict with SC-002's hybrid-retrieval phrasing anywhere in the spec? [Consistency, Spec §SC-002]

## Acceptance Criteria Quality

- [x] CHK025 - Can SC-001's "40% reduction in repeated failed attempts" be objectively measured with the defined evaluation corpus? [Measurability, Spec §SC-001, D3]
- [x] CHK026 - Is a baseline defined against which SC-001's reduction percentage is computed? [Measurability, Gap]
- [x] CHK027 - Are SC-007 isolation criteria defined as concrete testable assertions rather than "zero leaks"? [Measurability, Spec §SC-007]
- [x] CHK028 - Can "measurably demoted" (SC-009) be verified without knowing ranking internals — is the observable defined? [Measurability, Spec §SC-009]
- [x] CHK029 - Are acceptance scenarios defined for every tool error code in the error contract? [Coverage, Contracts §tools]

## Scenario Coverage

- [x] CHK030 - Are requirements defined for the exception flow when artifact upload fails midway (partial content-addressed file)? [Coverage, Exception Flow, Gap]
- [x] CHK031 - Are recovery requirements defined after a store corruption or interrupted write (SQLite WAL assumptions documented)? [Coverage, Recovery, Gap]
- [x] CHK032 - Are alternate-flow requirements defined when an agent repeatedly submits identical failed attempts (loop protection, FR-013)? [Coverage, Alternate Flow]
- [x] CHK033 - Are requirements specified for search when scope fingerprint matches but scope_id differs (same repo renamed)? [Coverage, Edge Case, FR-033]
- [x] CHK034 - Are non-functional requirements defined for store growth limits (corpus size assumptions behind <1.5 s search)? [Coverage, Non-Functional, Gap]
- [x] CHK035 - Are requirements defined for time-of-day/timestamp sources (clock skew between workflow events)? [Coverage, Gap]
- [x] CHK036 - Is behavior specified when an evidence artifact is modified on disk after attachment (hash mismatch handling)? [Coverage, Edge Case, FR-031]

## Non-Functional Requirements Quality

- [x] CHK037 - Are performance targets defined for mutation operations separately from search (SC-005 covers search only)? [Completeness, Non-Functional, Gap]
- [x] CHK038 - Are backup/restore requirements stated for the embedded SQLite store, even if deferred? [Completeness, Gap]
- [x] CHK039 - Are prompt-injection defense requirements (FR-026) traceable to concrete tool-response constraints rather than prose? [Traceability, Spec §FR-026]
- [x] CHK040 - Is the redaction ruleset (FR-025 pattern set) versioned so audit records can reference the ruleset used? [Completeness, Spec §FR-025/030]

## Dependencies & Assumptions

- [x] CHK041 - Is the assumption "agent-supplied failure signatures are well-formed" validated or guarded by input-validation requirements? [Assumption, Gap]
- [x] CHK042 - Is the SQLite FTS5 dependency documented with a fallback requirement if unavailable on a target platform? [Dependency, Gap]
- [x] CHK043 - Is the deferred PostgreSQL adapter (Clarifications) constrained by interface-stability requirements so tool behavior cannot diverge between adapters? [Dependency, Spec §Clarifications]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Items marked [Gap] indicate missing requirements; resolve via spec amendment before or during `/speckit-tasks`
- `/speckit-implement` reads checklist checkbox state as a gate and must not modify markers
- `checklists/requirements.md` has a separate built-in lifecycle maintained by `/speckit-specify` and `/speckit-clarify`
