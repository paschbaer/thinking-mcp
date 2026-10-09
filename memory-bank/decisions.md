# Decisions

> Chosen option of every `decision_framework` run (Clear Thought project convention).

## merge-servers-2026-09-15 — Merging clear-thought + stochasticthinking?

- **Chosen:** **B — status quo (two servers)**, merge tied to explicit triggers.
- **Question:** Does merging into a single MCP server provide a benefit, so that both
  can be used together (recipes)?
- **Tool chain:** `issue_tree` → `swot_analysis` (weighted) → `value_of_information`
  (score 2.03; top uncertainty: real user preference, expected impact 2.5; second:
  toolset switchability 2.4 — immediately resolved via a code check: toolsets collapse
  per family into ONE tool with an `operation` discriminator) → `decisionframework`
  (options A merge-as-toolset / B status quo / C hybrid) → stochastic
  **MDP** (γ=0.9, converged after 145 iterations: policy **early→separate,
  mature→merge**, V(early)=25.77, V(mature)=35.0; rewards = priors, not measurements)
  → `metacognitive_monitoring` (confidence 0.72).
- **Core arguments:**
  1. Recipes are the right use case, but NOT a merge argument: `recipe_runner`
     only navigates, the tools are invoked by the client — cross-server chains
     (clear-thought + stochastic) already work today (recipe 2 in the combined
     guide; verified live in the same agent session).
  2. Real merge benefits: maintenance (duplicated scripts/Dockerfile/agents_guide),
     one install/release path, shared session (bandit-runId ↔ WorkflowStore).
  3. Real merge costs: migration + deprecation of two live-published packages
     (npm 0.3.0 / 0.1.1, Smithery 100/100 + 96/100, ghcr, automated double
     pipelines already exist) — benefit unclear, because it is unknown how many
     users install both servers together.
  4. The toolset architecture makes a later merge cheap (~1–3 new tools,
     no schema bloat) — so there is no time pressure for the merge.
- **Merge triggers (re-evaluate the decision when they occur):**
  1. Stochastic recipes in `recipe_runner` → cross-family session state becomes
     a hard requirement.
  2. User feedback: setup friction from two config entries.
  3. Visibly rising duplication/maintenance costs → then evaluate hybrid
     (option C, shared-infra package) instead of a full merge.

## merge-servers-2026-09-15 / Update 1 — Execution decision: merge (option A)

- **Trigger:** User decision (2026-09-15): the merge will be implemented —
  integrate the stochastic tools into clear-thought, extend `recipe_runner`
  (trigger 1 thus applies proactively; this update deliberately contradicts
  the original recommendation of "status quo").
- **Implementation plan:** `memory-bank/plans/merge-stochastic-into-clear-thought.md`
  (chain: `sequential_thinking` ×4 → `issue_tree` → `creative_thinking` →
  `metacognitive_monitoring`, confidence 0.82).
- **Design core:** Dual registration — individual tool `stochasticalgorithm` with
  unchanged names/signatures (call-site-compatible migration) + new toolset
  `stochastic` (`operation`: mdp/mcts/bandit/bayesian/hmm); `BanditRunStore` as a
  SessionState domain (cleanup-integrated); guide consolidation via merge mode;
  recipe extension data-driven (architecture-decision + new recipe
  `decision-under-uncertainty` + 7th workflow prompt); release 1.1.0 additive,
  then deprecation of the stochastic package (order fixed).

## merge-servers-2026-09-15 / Update 2 — Release version 2.0.0 (instead of 1.1.0)

- **Trigger:** User decision (2026-09-16): set the version number for the merge
  release directly to **2.0.0** (the plan called for an additive 1.1.0).
  Rationale: the merge plus the upcoming deprecation of a live-published
  package is the bigger event for users — the major bump signals that.
- **Implementation:** package.json + factory ServerInfo to 2.0.0 (branch
  `feature/release-2-0-0`, typecheck green). The session-export envelope
  version deliberately stays 1.0.0 (data format version, schema unchanged).
  Root `package.json` (0.0.1, private/unpublished) and the stochastic
  `package.json` (0.1.1, to be deprecated after release; the version guard
  skips it) remain unchanged.

## 2026-10-04 — DEC-SKM-1: Spec-Kit mode as a workflow variant with artifact binding (W5+W1, with phase split)

- **Context:** The "Spec-Kit mode" was never real (session-62689b13: metadata `specKitMode` was ineffective; boot composition is hard-standard-development; Spec-Kit = passive 16-tool set). Brainstorming produced three ontologies (workflow / policy / driver); user decision: W5 binding + W1 selection, BUT with a phase split (making it effectively a workflow-variant file).
- **Decision:**
  1. W1: workflow registry `.guidance/workflows/*.json`, selection via `start_workflow {workflowId}` at session creation (engine: per-session definition instead of boot definition; standard-development remains the default; backward compatible).
  2. Workflow variant `spec-kit-development` (derivative of the standard workflow, shared phase definitions against drift): understand → specify+clarify; plan → speckit-plan; NEW checklist → speckit-checklist; NEW tasks → speckit-tasks; review_and_adjust_plan → speckit-analyze; implement → speckit-implement (+ task-tools micro loop); review_and_fix_implementation deliberately unbound; verify → speckit.converge; complete unbound.
  3. Binding = instruction layer (phase guidance names the commands) + ENFORCEABLE artifact gate (exit only if the artifact exists and imports cleanly; fail-closed, retry_operation as recovery).
  4. Mode is ATTENDED: clarify questions via report_blocker (requiresUserDecision); the phase pauses until the user answers.
  5. General skip rule: if the exit artifact of a bound phase already exists (and imports cleanly), skip via transition reason `artifacts_present`, logged in the session → yields idempotent workflow resume.
- **Explicitly NOT:** W8 transition automation (task events as phase drivers) — agent judgment + severity gates remain.
- **Open micro-decisions (to resolve in Spec 017):** clarify exit signal; convergence-report artifact name for the verify gate; review-loop targets after the phase split (minor→tasks, major→plan as a proposal); feature numbering via discovery.
- **Status:** decision made in brainstorming (2026-10-04); Spec 017 pending.

### DEC-SKM-1 Refinements (2026-10-04, after brainstorming concluded; held until ADOPT-completion, now retroactively recorded)

- **Converge loop (verify ↔ speckit.converge):** "Converged" → exit after complete; gaps (tasks are appended to tasks.md) → verification_failed pattern back to implement. Loop order: convergence report (evidence, path in the submit_verification payload) → refresh_spec_kit_artifacts (re-import, no stale task snapshot) → implement. Max-pass counter per session (analogous to maxChainDepth); exceeding it → report_blocker (requiresUserDecision).
- **Strict batch review cadence (option B, HARD):** implement → review_and_fix_implementation runs PER BATCH. Three review outcomes: implementation_changes_required (fix, resubmit), batch_approved_more_pending (new, back to implement for the next batch), submission_valid (only when ALL batches have an approved review pass — gate via task-review status). Batch-scoped submit_implementation payload (batch task IDs). Max-round counter per batch with blocker escalation. Appended converge tasks go through the same cadence. Not configurable (deliberate user decision).
- **Specification status:** specs/017-spec-kit-mode/spec.md (draft) — 9 US, 9 FR, 7 AC, OQ-1..3 (converge-report convention, include syntax, feature numbering).
- **DEC-SKM-1 addendum 2 (2026-10-04): OQ-1..3 resolved** (from .github/skills/speckit-* + .specify/scripts): DQ-1 converge outcome is hash-based on tasks.md (byte-identical = converged; a new "## Phase N: Convergence" section = tasks_appended; no report file; evidence in the submit_verification payload). DQ-2 include syntax = per-key $include, fail-closed (sparse full-inheritance rejected because of silent drift). DQ-3 feature numbering = highest NNN in specs/ + 1, identical to create-new-feature.sh (FR-10 in the spec). DQ-4 clarify exit = agent submission after attended Q&A (answers are encoded in spec.md). Spec 017 updated (FR-3/FR-7/FR-10, US5, DQ section, AC5).

## DEC-GBEA-M0 (2026-10-07) — specs/018 Milestone-0 decisions: GBEA adapter implementation

- **Trigger:** Phase 0 of specs/018 (tasks T001–T005) per RFC GBEA-SPEC-001 v0.6.1-draft §28 (ADR 1–8) + §11.5 proof-signing + §23 config default. User approved ALL proposals unchanged (2026-10-07).
- **Full rationale (PROPOSED→ACCEPTED):** `specs/018-guidance-beads-execution-adapter/m0-adr-proposals.md`, `m0-implementation-contract.md` (22 MCP methods), `m0-beads-v1.3-baseline.md`.
- **Decisions:**
  1. **ADR-1 Transport:** CLI only for v1 (`bd` argument-array, no shell); port stays transport-agnostic — later MCP/API transport behind the same `WorkExecutionAdapter` without touching mapping v1. Grounds: RFC §23 config sample is CLI-shaped; §20.2–20.10 controls points are process-spawn semantics; Beads 1.3 has no verified stable MCP/HTTP surface.
  2. **ADR-2 Metadata limits:** normative 32,768-byte `guidance`-metadata guard as constant; additional client-side caps ONLY where the pinned Beads v1.3 baseline documents hard limits (same per-item `PROJECTION_FAILED` + diagnostic pattern); no speculative limits.
  3. **ADR-3 Persistence:** better-sqlite3 (WAL mode), one Guidance-side store file beside guidance data (not in repo content), prepared statements for the §21.1 query paths. Chosen over JSON-file store (transactional fencing/sequence allocation §11.4/§21.1 unmanageable) and Postgres (new infra). Deployment constraint: multi-instance split-brain support is co-located (same machine, shared store file) only; cross-machine active-active out of scope v1.
  4. **ADR-4 Lease recovery:** orphaned-claim detection synchronously at store open (before serving claims, §11.3) + on every reconciliation pass at `synchronization.pollIntervalSeconds`; expired-lease lookup is a prepared indexed query; NO new config keys (config surface stays strictly RFC §23).
  5. **ADR-5 Status sync:** polling-only v1 (poll + incremental recon + 24 h full recon per §23); re-evaluate only on a stable Beads push mechanism.
  6. **ADR-6 Canonical JSON:** own profile `guidance.canonical-json/v1` — UTF-8, keys sorted by Unicode code point, ECMAScript minimal escaping, no insignificant whitespace, **non-integer numbers forbidden** in canonicalized content (removes JCS float nondeterminism); identifier recorded in `ProvenanceRecord.canonicalizationAlgorithm` and receipts (§15.4).
  7. **ADR-7 Retention:** NO online pruning in v1 (hot store keeps full history); append-only enforcement at data-access layer (no UPDATE/DELETE on event/receipt tables) + nightly digest export (JSONL + chain digest) as WORM-adjacent archive; `retentionEpoch` = 1 from day one; external anchoring (§18.2 SHOULD) documented as optional deployment step.
  8. **ADR-8 Upgrade policy:** ship `>=1.3.0 <2.0.0`; in-range minor upgrades auto-accepted after probe; widening requires baseline update + golden/contract tiers green + explicit config change + audited re-negotiation (§19); Beads MAJOR schema/status change triggers mapping-v2 evaluation (§9.6/§9.7).
  9. **Proof signing (T003):** Ed25519 via `node:crypto`; keypair generated on first start, persisted 0600 beside the execution store (optional `signingKeyPath` override); rotation = new pair + audit event (proofs short-lived); nonce store = SQLite UNIQUE table consumed atomically (replay → `OPERATION_NOT_AUTHORIZED`); signature format `ed25519:<base64url>` over canonical JSON (ADR-6 profile).
  10. **Config default (T005):** shipped default `executionBackends.beads` absent → functionally disabled (RFC §4.1 / AC-A1); config keys strictly RFC §23; config assistant offers Beads enablement only at rollout stage R5.
- **Binding effect:** M0 exit reached (T001–T005 done); ⏳ADR-gated tasks T013 (ADR-6), T024 (ADR-3), T066 (ADR-7) are unblocked; WP-01 (Phase 1) may start. m0-implementation-contract.md is binding for AC-A3 contract tests (WP-05/06/07); m0-beads-v1.3-baseline.md is binding for mapping v1 and golden fixtures (T038).
- **Environment note:** `bd` not installed on dev host (verified 2026-10-07) — real-backend tests need pinned Beads 1.3.x install; all other tiers run against the fake backend (T015).

## DEC-CHFIX-1 (2026-10-08) — Form-B chain fix: checkbox→completed at import (deviates from specs/017 SC-011)

- **Context:** Long unattended Form-B chains re-ran already-completed tasks because `import_spec_kit_artifacts` hardcoded `status:"pending"` for every task; specs/017 FR-066/SC-011 pinned the opposite ("checkbox alone never completes a task" — tamper protection with evidence-gated `complete_task`).
- **Decision (user-approved):** tasks.md checkboxes are the cross-session progress interface — a checked box marks work completed (with evidence) in a PREVIOUS session, so import maps `checkboxChecked` → `status:"completed"`. `checkboxAtImport` keeps the audit trail; `complete_task` itself stays evidence-gated (in-session tamper protection unchanged). Complementary mechanics: spec-kit state inheritance to chain successors, child-engine bridge wiring, start-time depth pre-check with non-blocking `warnings[]` + per-manifest `maxChainDepthOverride` (1..512, config cap raised 64→512).
- **Consequences:** specs/017 text is now partially stale (tracked CHFIX-1); user-decision gates intentionally stop unattended chains; specs/018 (74 tasks, 65 unchecked) fits within the raised cap.
