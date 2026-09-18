# Feature Specification: Experience Memory Server for Coding Agents (EMMS)

**Feature Branch**: `001-experience-memory-server`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Experience Memory MCP Server (EMMS) — a vendor-neutral, evidence-backed long-term memory layer for coding agents. Full specification: SDD/experience-memory-mcp-server-specification.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent avoids repeating known failures (Priority: P1)

A coding agent encounters a failure it (or another agent) has seen before. The agent searches the experience memory before attempting costly or risky fixes, and receives the most applicable prior experiences — including exact environmental matches, known bad attempts that must be avoided, and validated solutions. The agent resolves the problem using prior knowledge instead of repeating avoidable work.

**Why this priority**: This is the core value proposition — measurable reduction of repeated diagnosis and repeated execution of known-bad commands. Without this, nothing else matters.

**Independent Test**: Seed the memory with a verified episode; present an agent a matching failure; confirm retrieval returns the applicable experience with clear applicability reasons and the previously failed strategy is flagged as harmful.

**Acceptance Scenarios**:

1. **Given** the memory contains a locally verified episode with the same exact error signature and a compatible environment, **When** an agent searches with that error and its environment, **Then** the verified episode is returned as the top result with explicit match reasons.
2. **Given** the memory records a previously failed strategy for a matching environment, **When** an agent searches the same failure, **Then** the failed strategy is visibly identified as harmful/ineffective so the agent can avoid it.
3. **Given** a retrieved experience was produced in an incompatible environment (different platform or incompatible required version), **When** the agent searches, **Then** that experience is ranked below compatible ones and its mismatches are explained, or marked reference-only.
4. **Given** no applicable prior experience exists, **When** an agent searches, **Then** it receives an honest empty/near-empty result without fabricated matches.

---

### User Story 2 - Agent captures a verified fix end-to-end (Priority: P1)

While debugging, an agent records its goal, observations, hypotheses, attempts, and outcomes into a structured experience episode. After applying a solution, the agent records validation runs tied to the original acceptance criteria and regression checks. Only when objective evidence satisfies the plan does the episode reach a verified state; otherwise it is finalized as unresolved or partially verified — honestly.

**Why this priority**: Verified capture creates the corpus that Story 1 depends on. Capture quality (evidence, provenance, negative attempts) determines whether memory is trustworthy.

**Independent Test**: Drive a complete capture workflow (goal → observation → attempt → outcome → hypothesis → solution → validation runs → finalize) and confirm the final state reflects only what the evidence supports, and that unsupported assertions cannot produce a verified status.

**Acceptance Scenarios**:

1. **Given** an agent starts an episode and records observations, attempts, and outcomes, **When** each record is made, **Then** intent, fact, observation, and interpretation remain distinct and every claim carries provenance.
2. **Given** a solution with a validation plan (original failure criterion plus regression checks), **When** all required validation runs pass with recorded evidence, **Then** the episode may reach locally-verified status.
3. **Given** validation evidence is missing or inconclusive, **When** finalization is attempted, **Then** the episode is finalized as unresolved or partially verified — never verified.
4. **Given** an agent's unsupported assertion about a root cause, **When** the episode is assessed, **Then** that assertion alone cannot raise the episode to verified status.
5. **Given** the capture process is interrupted at any point, **When** the agent resumes, **Then** all previously captured records are intact and the workflow continues from its last durable state.

---

### User Story 3 - Server guides the agent's next step (Priority: P2)

With every response, the server tells the agent what information is missing, which operations are permitted, and one recommended next request — with a reason and placeholders for unknown values. The agent can follow the recommendation or explicitly decline it.

**Why this priority**: Guidance makes the memory layer usable by any agent without bespoke integration, and prevents premature or speculative diagnosis. It builds on Stories 1–2.

**Independent Test**: Start a workflow and verify every response includes a guidance object with workflow state, missing required information, allowed next operations, and a schema-valid recommended request with a stated reason.

**Acceptance Scenarios**:

1. **Given** an active workflow with missing required environment facts, **When** the agent requests status, **Then** the guidance lists each missing item, why it is required, and a safe collection hint.
2. **Given** any successful or recoverable response, **When** the agent inspects the guidance, **Then** the recommended next request is valid against the advertised input schema and never fabricates unknown values (placeholders are explicit).
3. **Given** the agent submits a request invalid for the current state, **When** the server responds, **Then** it returns a recoverable error including the current state and a corrected recommended request.
4. **Given** the agent declines a recommendation with a stated reason, **When** the next request arrives, **Then** the server recalculates its recommendation path without penalizing honesty.

---

### User Story 4 - Memory stays trustworthy over time (Priority: P2)

Retrieved knowledge is version-aware and time-aware. Experiences carry applicability envelopes; stale content is penalized; contradictions between episodes are surfaced rather than hidden; a regression against a previously verified solution immediately lowers its recommendation priority and triggers re-evaluation; and lessons are only promoted with independent verification. Humans can review, correct, invalidate, and merge without destroying history.

**Why this priority**: Trustworthiness determines whether the memory improves or degrades agent behavior over months. High value, but only meaningful once content exists (Stories 1–2).

**Independent Test**: Seed contradictory and stale episodes; verify ranking demotes stale/contradicted content with visible warnings; record a regression and verify priority reduction and re-evaluation triggering; verify a lesson requires multiple independent verified episodes before promotion.

**Acceptance Scenarios**:

1. **Given** two episodes assert conflicting outcomes for the same failure in different environments, **When** an agent retrieves them, **Then** both are shown with the contradiction flagged and the differing applicability explained.
2. **Given** a previously verified solution fails in a new environment, **When** a regression is recorded, **Then** that solution's recommendation priority immediately drops, a warning is attached, and the failing episode is linked.
3. **Given** an experience has not been re-verified within its freshness threshold, **When** it is retrieved, **Then** a staleness indicator is visible and its ranking is penalized relative to fresher equivalents.
4. **Given** one verified episode exists for a repeating problem, **When** lesson promotion is proposed, **Then** the lesson remains a candidate (not published as broadly verified) until independent episodes in separate scopes confirm it.
5. **Given** an administrator invalidates an experience, **When** any agent searches, **Then** the invalidated content is excluded by default and prior references remain auditable.

---

### User Story 5 - Knowledge is shared safely across boundaries (Priority: P3)

Multiple agents, repositories, and users share the memory under explicit visibility boundaries. Private repository content never crosses its boundary; sensitive content is redacted before persistence; every privileged action is auditable; and untrusted content is never treated as instruction.

**Why this priority**: Required before team/organization use, but not needed for the single-developer MVP.

**Independent Test**: Configure two isolated scopes; verify content in one scope is invisible to the other even through search; inject content containing secret-like strings and prompts resembling instructions; verify redaction and instruction-flagging before persistence.

**Acceptance Scenarios**:

1. **Given** content stored with repository visibility, **When** an agent from a different repository searches, **Then** no trace of that content (including its existence) is returned.
2. **Given** an artifact containing credential-like strings or instruction-like text, **When** it is attached to an episode, **Then** secrets are redacted before persistence and instruction-like strings are flagged as data, never executed or treated as directives.
3. **Given** any privileged action (invalidation, scope widening, deletion), **When** it is performed, **Then** an audit record captures who, what, when, why, and the policy version — without copying sensitive content.
4. **Given** a duplicated submission (same idempotency key), **When** it is replayed, **Then** no duplicate records are created and the original result is returned.

---

### Edge Cases

- What happens when a workflow is abandoned mid-capture? Captured evidence is retained per policy and the episode finalizes as unresolved with useful negative knowledge.
- What happens when two agents mutate the same episode concurrently? The later request is rejected with a stale-revision error and a corrected next request; no silent overwrite.
- What happens when a search result is semantically near-identical but environmentally incompatible? It is demoted below compatible results and its mismatches are explained — similarity never overrides applicability.
- What happens when an agent submits malformed or oversized payloads? The server responds with a recoverable error identifying the failing fields; no partial persistence.
- What happens when retrieval produces too many candidates? Results are bounded; the response explains truncation and how to narrow.
- What happens when retrieved memory turns out to be misleading or harmful? The agent records negative reuse feedback, which lowers the content's future ranking and can trigger re-evaluation.
- What happens when a lesson's counterexample arrives? The lesson's scope narrows or it is marked contested — it is never silently deleted.

## Requirements *(mandatory)*

### Functional Requirements

**Capture & Workflow**

- **FR-001**: System MUST let an agent create a structured experience episode recording goal, problem summary, acceptance criteria, environment facts, and scope. Each episode is bound to exactly one workflow; mutation attempts on an episode through a different workflow MUST be rejected.
- **FR-002**: System MUST let an agent record observations (failure output, command output, test results, environment facts, agent reflections) with provenance and optional attached evidence.
- **FR-003**: System MUST keep action intent, action fact, observation, interpretation, claim, evidence, and decision as distinct record types throughout the episode lifecycle.
- **FR-004**: System MUST let an agent record attempts with intended strategy, risk classification, rationale, and prior knowledge used — and separately record the actual outcome, side effects, and affected artifacts.
- **FR-005**: System MUST let an agent record hypotheses with supporting and conflicting evidence references, and refine, supersede, support, or reject them without deleting history.
- **FR-006**: System MUST retain failed, ineffective, and harmful attempts as first-class records — negative knowledge is never silently discarded.
- **FR-007**: System MUST let an agent define a validation plan tied to the original acceptance criteria, record validation runs, and finalize an episode only in a state consistent with the recorded evidence. Credible baseline evidence for the original failure is defined as: a recorded observation of kind `failure_output` (or an attached artifact showing the failure) whose exit code/tokens match the episode's failure signature, captured before the solution is applied.
- **FR-008**: System MUST require objective evidence (test result, exit status with output, or independent reproduction) for verified status; unsupported agent assertions MUST NOT independently produce verified status. An "unresolved critical side effect" is defined as: any attempt in the episode classified `harmful`, or any `partially_successful` attempt whose recorded side effects touch an artifact named in the acceptance criteria, without a later attempt or validation run whose recorded outcome resolves it.
- **FR-009**: System MUST persist all workflow and episode state durably so any session interruption allows seamless resumption without data loss.

**Guidance**

- **FR-010**: System MUST include, with every successful or recoverable response, a guidance object stating workflow state, revision, missing required information, permitted next operations, and one recommended next request with a reason.
- **FR-011**: Recommended requests MUST be valid against the advertised input schema, MUST NOT fabricate unknown values, and MUST use explicit placeholders for values the agent must collect.
- **FR-012**: System MUST allow agents to decline guidance with a reason and recalculate the path accordingly.
- **FR-013**: System MUST define workflow turn/budget limits and recommend escalation (evidence collection or human input) when budgets are exhausted without a verified solution.

**Retrieval**

- **FR-014**: System MUST retrieve experiences using hybrid matching: exact failure-signature lookup, normalized signature matching, full-text search, and technology/version filtering — combined with configurable ranking weights (defaults pinned in research.md D6). A semantic-similarity arm MUST be part of the retrieval interface and is added once an embedding source (local or external) is available; while absent, search MUST report that semantic matching is unavailable instead of silently skipping it.
- **FR-015**: Environmental applicability MUST influence ranking such that a semantically similar but incompatible experience ranks below a less similar compatible experience, and mismatches MUST be explicitly reported.
- **FR-016**: Search results MUST expose, per result: relevance, applicability score with reasons, matches, mismatches, unknowns, validation tier, last-verified date, known failed attempts, and contradiction flags — as separate dimensions, not one opaque score.
- **FR-017**: Search responses MUST return concise result cards by default, with progressive disclosure of timelines and evidence on request.
- **FR-018**: System MUST exclude invalidated content from default search results while keeping it auditable.

**Lifecycle & Consolidation**

- **FR-019**: System MUST enforce a state machine over episodes (draft → observed → diagnosing → solution proposed → validating → locally verified → reproduced → cross-project verified; with unresolved, partially verified, needs review, contradicted, invalidated, deprecated, superseded terminal states) and reject invalid transitions with recoverable errors.
- **FR-020**: All state changes MUST be append-only events; prior claims and states MUST remain auditable.
- **FR-021**: System MUST detect duplicates and contradictions between episodes and surface them without destructive merging — merged episodes remain individually addressable. Detection thresholds are pinned in research.md decision D5 (duplicates: identical normalized failure-signature hash AND goal-text similarity ≥ 0.8 token-set Jaccard; contradictions: identical normalized hash AND opposing attempt classifications each backed by ≥ 1 evidence artifact).
- **FR-022**: System MUST support candidate-level lesson detection in the MVP: when promotion-relevant episode patterns occur (verified episodes sharing a normalized failure signature), the episode's lesson linkage and candidate status are recorded per the promotion thresholds. Lesson proposal, review, and publication tooling is explicitly deferred to the consolidation phase and is NOT required for MVP (the lesson entity remains schema-reserved). Any credible counterexample MUST narrow a published lesson's scope or mark it contested once that phase ships.
- **FR-023**: System MUST record regressions against previously verified solutions and immediately reduce their recommendation priority, attach warnings, and trigger re-evaluation.
- **FR-024**: System MUST record reuse feedback (applicable, useful, misleading, harmful) for retrieved experiences and factor it into future ranking. Definitions: `misleading` = the experience looked applicable but its content directed the agent wrong without damage; `harmful` = following it caused a failure, damage, or a regression.

**Trust, Security & Governance**

- **FR-025**: System MUST redact credential-like and personal-data-like content before persistence using a built-in, deterministic pattern-based detector (API-key/token formats, connection strings, private keys, passwords, home-directory paths) — no external services required; detection findings MUST be countable and reported per artifact, and both redacted and normalized representations retained where applicable.
- **FR-026**: System MUST label all content with an explicit trust classification; retrieved experience content MUST never be presented as system instruction.
- **FR-027**: System MUST enforce visibility boundaries (at minimum session, workflow, repository, organization) at authentication, authorization, storage, cache, and search levels — cross-scope leakage is prohibited, including existence leaks. Behavioral definitions for the MVP set: `session` = visible only to the agent runtime session that created it; `workflow` = visible to requests presenting the owning `workflow_id`; `repository` = visible when the request's scope identifier matches (or the scope content-fingerprint matches, FR-033).
- **FR-028**: All mutating operations MUST require an idempotency key; duplicate submissions MUST return the original result without creating duplicates.
- **FR-029**: Concurrent mutations MUST be prevented via optimistic concurrency; stale-revision requests MUST be rejected with a recoverable error.
- **FR-030**: All privileged actions (invalidation, scope change, deletion, policy change, publication) MUST produce audit records containing actor, action, target, revisions, timestamp, reason, and policy version — without copying sensitive content.
- **FR-031**: System MUST accept artifacts only after size/type validation and secret/PII redaction; artifact bodies MUST be stored as content-addressed files (content hash as the address, verified on read) referenced from episode records — never inlined unbounded into the database; an object-storage location is a later, interchangeable backend. Identical content (same hash) MUST reuse the already-stored object (natural deduplication); a hash mismatch on read MUST fail the access with a recoverable integrity error.
- **FR-032**: System MUST capture provenance for every observation and claim: actor, source type, source artifact, timestamps, trace identifiers, and whether content was observed, inferred, or summarized.
- **FR-033**: Repository scope MUST be identified by an agent-declared scope identifier, optionally combined with a repository content fingerprint (e.g., hash of key manifests) so the same repository is recognized under different names; absolute local paths MUST NOT be used as scope identity.
- **FR-034**: In the MVP, stored experiences and artifacts MUST NOT be physically deleted or archived by the system; staleness MUST be handled at ranking time only, and any retention/pruning policy is deferred to the team phase (subject to FR-030 audit and explicit administrator deletion).
- **FR-035**: The system MUST NOT auto-expire, auto-close, or delete workflows in the MVP; the only non-active exit paths are explicit finalization and explicit `workflow.abandon`.
- **FR-036**: Actor permissions in the MVP: the agent role MAY use all workflow, experience, validation, artifact, and search tools; invalidation, deletion, scope widening, and policy changes are human (administrator) operations performed via an audited admin path (FR-030).
- **FR-037**: All recorded timestamps MUST be UTC from the server clock; event ordering MUST be determined by a monotonic per-store sequence number, never by timestamp comparison alone.

### Key Entities *(include if feature involves data)*

- **Experience Episode**: The primary unit — goal, acceptance criteria, problem and failure signatures, environment snapshot, timeline, hypotheses, attempts, solutions, validation results, applicability envelope, quality state, and confidence dimensions.
- **Observation**: A provenance-carrying fact of a defined kind (failure output, command output, test result, environment fact, agent reflection, …).
- **Attempt**: A strategy tried within an episode, with intent, fact, outcome, side effects, and classification (successful … harmful, not applicable).
- **Hypothesis / Root-cause claim**: A proposed explanation with lifecycle state and evidence links; distinct from evidence itself.
- **Solution**: A remediation strategy with mechanism, prerequisites, rollback, and a validation plan.
- **Validation Plan / Validation Run**: Acceptance-criteria-linked checks and their executed, evidence-backed results.
- **Evidence Artifact**: An immutable, content-addressed, redacted, trust-labeled attachment.
- **Environment Snapshot**: Structured, partially hashed execution context (platform, runtimes, versions, dependencies, scope, commit state) at defined collection levels.
- **Lesson**: A generalized rule with applicability envelope, exclusions, validation recipe, supporting episodes, counterexamples, confidence dimensions, and revision history.
- **Contradiction**: A identified conflict between claims, the environments involved, evidence strength on each side, and required resolution experiment.
- **Reuse Feedback**: Later-agent assessment of whether retrieved memory was applicable, useful, misleading, or harmful.
- **Workflow**: The durable, resumable interaction state binding an agent to an episode with revision tracking.
- **Scope / Visibility boundary**: The tenancy and visibility container controlling who can see and act on content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents working on a previously-solved failure resolve it using retrieved prior experience in measurably fewer steps than without memory (target: at least 40% reduction in repeated failed attempts on a held-out evaluation set). Measurement procedure: run the same 30-task fixture corpus twice — baseline mode (retrieval disabled) and memory mode (retrieval enabled) — and compare the counts of attempts classified `ineffective` or `harmful` per task; the reduction is relative to the baseline run.
- **SC-002**: For recurring failures, at least 80% of exact-match searches return the applicable verified experience in the top 3 results, under the D6 ranking defaults in force (SC-002 applies when at least one compatible verified candidate exists; if none exists, top results are `reference_only`, ranked by applicability first).
- **SC-003**: 100% of verified-status episodes in evaluation have recorded objective evidence artifacts; zero episodes reach verified status through unsupported assertions alone.
- **SC-004**: A complete capture workflow (goal → observation → attempt → outcome → validation → finalize) can be completed without any manual data fixes, and survives a session interruption at any point with zero data loss.
- **SC-005**: Search responses are returned fast enough for interactive agent use (search under ~1.5 seconds and ordinary mutations under ~1 second at target corpus size, measured as wall-clock in the golden-path scenarios) and never flood the agent's context with raw logs by default (each result card bounded to summary plus at most one excerpt of ≤ 2,000 characters; raw content only via progressive disclosure).
- **SC-006**: In evaluation sets containing near-miss semantic matches with incompatible environments, incompatible results appear below compatible ones in at least 90% of cases, with mismatches explicitly reported. (Applies once the semantic arm is active; before that, the same set is evaluated using signature and full-text arms only, with semantic unavailability reported.)
- **SC-007**: Zero cross-boundary content or existence leaks in isolation testing across the default visibility levels. Concrete assertions (tested in T040/T041): a cross-scope search returns an empty result set with total count 0; no error message, count, identifier, or timing difference distinguishes "no content" from "content withheld"; cache and event logs contain no foreign-scope rows.
- **SC-008**: 100% of privileged actions produce complete audit records; replaying any mutation with the same idempotency key creates no duplicates.
- **SC-009**: Agents record reuse feedback after applying prior experience; misleading/harmful content is measurably demoted in subsequent rankings (observable: after a `harmful` verdict is recorded, that episode's rank position for the same query drops by at least 3 positions or out of the default result window entirely).
- **SC-010**: Users (developers operating agents) report reduced repeated debugging effort and trust the memory's verification labels (qualitative review at MVP exit).

## Clarifications

### Session 2026-09-17

- Q: Where should the experience memory be persisted for the first deliverable? → A: Pluggable storage interface; embedded default uses SQLite; adapter for an external client-server database (PostgreSQL + vector extension) comes later for team phases.
- Q: How should the evidence artifacts (logs, diffs, test reports) be stored? → A: Content-addressed files on disk (hash as filename) next to the embedded store; object-storage adapter in the team phase.
- Q: How is a repository scope identified so visibility boundaries and proximity ranking work? → A: Agent-declared scope identifier, optionally combined with a repository content fingerprint (e.g., hash of key manifests) to recognize the same repository under a different name; never derived from absolute local paths.
- Q: Where does the semantic-similarity matching come from in the MVP? → A: MVP ships with exact/normalized signature plus full-text retrieval only; the semantic arm is added behind the same retrieval interface once an embedding source (local or external) is available, and its absence is reported in search results.
- Q: What retention and pruning policy applies to stored experiences in the MVP? → A: No physical deletion in the MVP; staleness is handled at ranking time only; a retention/pruning policy is deferred to the team phase.
- Q: How thorough must secret/PII redaction be in the MVP? → A: Deterministic pattern-based detection built into the server (credential/token formats, connection strings, private keys, home-directory paths); no external services.

## Assumptions

- The initial target users are coding agents (via agent hosts/IDEs) and the developers operating them; team and organization sharing are later phases of the same feature, in scope for the specification but delivered progressively.
- The MVP operates locally for a single developer; visibility enforcement requirements still apply at repository level from the start so later team phases do not require re-architecture.
- Exact performance numbers in the source specification (e.g., search under 1.5 s P95) are treated as acceptance targets, not architectural constraints.
- Embedding/semantic search capabilities are assumed available; the specification is agnostic to the specific model or store.
- Autonomous consolidation, cross-organization federation, and preventive/proactive guidance (source chapters 30.4+) are explicitly out of scope for this feature's first phases; the data model must not preclude them.

## Dependencies

- An agent host that executes the coding agent and mediates all external actions (the server recommends; it never executes).
- A durable storage layer for episodes, evidence, and workflow state: a pluggable storage interface with an embedded default (SQLite) for the local MVP and an adapter for an external client-server database (PostgreSQL plus a vector extension) introduced with the team phase; retrieval features (full-text, signatures, semantic) MUST be implementable on both backends without changing tool behavior.
- Availability of failure signature extraction and environment fingerprint collection at capture time (agent-supplied or host-collected).

---

## Review & Acceptance Checklist

*Gate: FLW — how is this feature verified at the specification level?*

### Specification Quality

- [x] User scenarios are independently testable and prioritized
- [x] All functional requirements use MUST/SHOULD and are testable
- [x] Success criteria are measurable and technology-agnostic
- [x] Edge cases cover interruption, concurrency, contradictions, and oversupply
- [x] Out-of-scope evolution stages explicitly bounded
