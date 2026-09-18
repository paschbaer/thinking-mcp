# Research: Experience Memory Server (EMMS)

**Feature**: 001-experience-memory-server | **Date**: 2026-09-17
**Predecessor**: Spec review findings (memory-bank/remaining-work-plan.md) — D1–D5 resolve them.

## D1: Actor/Identity Model

**Decision**: Actor is `{actor_type: "agent" | "human" | "system", actor_id: string}`. The MVP has exactly one implicit tenant (`"local"`). `actor_id` is taken from the request's `client_context.agent_id`, defaulting to `"local-agent"`. Human actors appear only in audit records of privileged operations (invalidate, delete, policy change), where the operation must be issued through an authorized admin path.

**Rationale**: Satisfies FR-030 provenance and FR-027 boundaries without introducing authentication infrastructure for a local single-user MVP; the shape extends unchanged to tenant/identity-provider integration in the team phase.

**Alternatives considered**: Full identity provider from day one (rejected: MVP operates locally, no auth service exists); anonymous actor (rejected: breaks provenance FR-032 and audit FR-030).

## D2: Revision Semantics & Conflict Handling

**Decision**: Every workflow owns a monotonically increasing integer `revision`, starting at 1 and incremented by each accepted mutation. Mutating requests MUST include `expected_revision`; on mismatch the server returns recoverable error `STALE_REVISION` carrying `current_revision`, the conflicting field set, and a corrected `recommended_next_request`. Episode-scoped entities (attempts, observations, hypotheses) are addressed via `workflow_id` + `expected_revision`; there is no locking — last-writer-wins is impossible because stale writers are rejected.

**Rationale**: Optimistic concurrency per FR-029 with the smallest possible client burden; matches the guidance pattern (clients always receive the current revision in every response, FR-010).

**Alternatives considered**: UUID-based change tokens (harder to order/debug); pessimistic locks (stateful, blocks resumption after interruption, violates FR-009 durability-across-sessions goal).

## D3: Evaluation Corpus

**Decision**: Minimum 30 reproducible tasks, structured as JSON fixtures in `servers/server-experiencememory/tests/fixtures/`. Mandatory composition per the source SDD: repeats, near-matches with environmental differences, misleading semantic matches, obsolete solutions, poisoned/low-quality entries, conflicting episodes, novel failures, security-sensitive cases. At least 3 golden end-to-end paths must be executable from `quickstart.md`:

- **G1** capture → validate → finalize → search → retrieve (verified fix)
- **G2** incompatible-environment demotion with mismatch reporting
- **G3** known-bad-attempt avoidance with reuse feedback

**Rationale**: Makes SC-001/SC-002/SC-006/SC-009 measurable without a live agent harness; fixtures double as contract-test inputs (Constitution gate III).

**Alternatives considered**: Live-agent benchmark first (deferred to production-evaluation phase — cost, non-determinism); ad-hoc manual checks (not repeatable, violates SC verifiability).

## D4: Guidance Object Schema

**Decision**: A zod-validated `GuidanceEnvelope` attached to EVERY successful or recoverable tool response:

```
GuidanceEnvelope {
  workflow_id: string
  experience_id?: string
  workflow_state: enum(episode states)
  revision: integer
  objective?: string
  missing_information: [{field, reason, required, safe_collection_hint?}]
  warnings: [{code, severity: low|medium|high, message}]
  allowed_next_tools: string[]
  recommended_next_request: {tool, reason, arguments_template}
  alternative_next_requests: {…}[]
  stop_conditions: string[]
  human_approval: {required, reason?}
}
```

`arguments_template` may contain the reserved placeholder strings `<collect value>` and `<attach artifact>`; no other unknown values. Schema validity of the recommended request against the advertised tool schema is contract-tested (FR-011).

**Rationale**: Single canonical shape prevents divergent interpretation (the review's pragmatic-lens "breaks first" item); placeholders implement the no-fabrication rule directly.

**Alternatives considered**: Free-form prose guidance (rejected: untestable, injection-susceptible); per-tool bespoke guidance shapes (rejected: fragmentation, no uniform contract).

## D5: FR-021 Detection Thresholds

**Decision**:
- **Duplicate**: identical normalized failure-signature hash AND goal-text similarity ≥ 0.8 (token-set Jaccard over lemmatized tokens). Detection point: episode finalize (`DUPLICATE_CANDIDATE` outcome; propose-merge flow) and search time (flag on results).
- **Contradiction**: identical normalized failure-signature hash AND opposing attempt classifications (`successful` vs `harmful`/`ineffective`) where each side references at least one evidence artifact. Surfaced as `contradiction` flag on search results and a `CONTRADICTION` warning in guidance; resolution experiment is recommended, never automatic in the MVP.

**Rationale**: Deterministic, testable, no ML dependency in MVP; both thresholds become unit-test fixtures.

**Alternatives considered**: Embedding-based similarity thresholds (blocked until semantic arm exists); manual-only review (doesn't scale past ~100 episodes).

## Additional Research

- **SQLite access**: `better-sqlite3` (synchronous, transactional, WAL mode for concurrent readers; enables read-after-write consistency required by FR-009/FR-029). Alternative `node:sqlite` still marked experimental; `sql.js` lacks durability.
- **StorageAdapter interface**: methods for episodes, events (append-only), artifacts metadata, idempotency keys, audit records — one interface, SQLite now, Postgres later; retrieval features (signature index, FTS5) re-implemented per adapter without changing tool behavior (per Clarifications).
- **Failure normalization**: MVP normalizes line endings, strips timestamps/volatile IDs, replaces home paths, extracts exit codes, preserves exact rare tokens; normalized hash = SHA-256 of canonical JSON.
- **Full-text**: SQLite FTS5 over episode summary + failure excerpt; signature index: exact hash column + normalized hash column.

## D6: Ranking Defaults & Applicability Formula (resolves analysis finding U3)

**Decision**: Default ranking weights (configurable via `src/config.ts`):
semantic_similarity 0.24, failure_signature 0.20, environment_compatibility
0.15, version_compatibility 0.10, validation_strength 0.10,
repository_proximity 0.06, exact_token 0.05, reuse_success 0.04, recency
0.03, evidence_completeness 0.03; penalties: incompatibility −0.50 (hard
exclusion also forces `recommended_use: reference_only`), contradiction −0.30,
staleness −0.15, harmful feedback −0.40.

**Applicability score** (0..1) = matched_required_dimensions /
total_required_dimensions, where dimensions are: os family, architecture,
runtime major.minor, package manager, dependency-manifest compatibility.
Missing (unknown) dimensions count as 0.5 credit; hard exclusions zero the
score. In MVP (no semantic arm) the semantic weight is redistributed
proportionally to the remaining arms.

**Rationale**: Deterministic, testable, mirrors the source SDD §14.4 reference
weights; unknown-tolerant credit prevents unknowns from silently nuking rank.

**Alternatives considered**: learned weights (deferred to production-evaluation
phase); uniform weights (violates applicability-before-similarity emphasis).
