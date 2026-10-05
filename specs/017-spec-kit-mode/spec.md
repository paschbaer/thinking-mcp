# Spec 017 — First-Class Spec-Kit Mode (Workflow Selection + Artifact-Bound Phases)

**Status:** Draft (design decision DEC-SKM-1, memory-bank/decisions.md)
**Scope:** `servers/server-guidance` (workflow engine + config + spec-kit integration)
**Out of scope:** `server-insight`, `server-clear-thought` (async/SSE adoption is specs/016 follow-up); `server-stochasticthinking` (deprecated); changes to gate semantics of `standard-development`; transition automation driven by task events (rejected — agent judgment and severity gates remain the transition triggers).

---

## 1. Problem

Spec-kit integration today is a passive 16-tool task-tracking toolset. A session cannot
declare "this work follows SDD": every session runs the boot-composed
`standard-development` workflow regardless of intent (observed 2026-10-04: a
`specKitMode` metadata flag was silently ignored). Artifacts produced by spec-kit
commands are not enforced — a phase can be exited without the artifacts it claims to
produce. There is no machine-checkable notion of "spec-kit session".

Root causes:

1. **No workflow selection at session start:** `workflowId` on `start_workflow` only
   names chain successors; the session definition always comes from the boot
   composition (`workflow.json` → `standard-development`).
2. **No artifact binding:** phases have no declarative link to the artifacts their
   spec-kit commands produce; enforcement would have to be improvised per session.

## 2. Goals

- **G1:** A session can opt into a `spec-kit-development` workflow variant at
  `start_workflow` time; `standard-development` remains the default and is untouched.
- **G2:** In that variant, phases are **bound** to spec-kit commands: guidance
  instructions announce the command (visibility), and a fail-closed artifact gate
  enforces the command's outcome (enforcement).
- **G3:** The mode is **attended**: human-in-the-loop interactions (clarify) pause the
  workflow with a structured blocker instead of stalling or improvising.
- **G4:** Existing artifacts are never re-produced: a phase whose exit artifact already
  exists and imports cleanly is **skipped** (this also yields crash-resume for free).

## 3. User Stories

### US1 — Workflow selection (W1)

> As a user, I can start a session with `start_workflow { workflowId:
> "spec-kit-development" }` and the session runs the spec-kit phase model, while any
> session without `workflowId` keeps `standard-development` unchanged.

### US2 — Artifact-bound phases (W5 + phase split)

> As an agent in a spec-kit session, each phase's guidance names the spec-kit command
> to run, and I cannot exit the phase until the command's artifact exists and imports
> cleanly.

**Phase model** (derivative of `standard-development`; shared phase definitions where
identical, to prevent drift):

| Phase | Binding (command) | Exit gate (artifact) |
|---|---|---|
| `understand` | `/speckit-specify` + `/speckit-clarify` | `spec.md` importable |
| `plan` | `/speckit-plan` | `plan.md` importable |
| `checklist` *(new)* | `/speckit-checklist` | `checklists/**` present |
| `tasks` *(new)* | `/speckit-tasks` | `tasks.md` importable |
| `review_and_adjust_plan` | `/speckit-analyze` | review submission (as today) |
| `implement` | `/speckit-implement` (+ task tools micro-loop, strict batch review cadence, see US4) | submission (as today) |
| `review_and_fix_implementation` | **unbound by design** (agent-driven fix loop) | as today |
| `verify` | `speckit.converge` | convergence report stating "Converged" (see US5) |
| `complete` | unbound | as today |

The unbound status of `review_and_fix_implementation` and `complete` is an explicit
design decision (agent-driven loops), not an omission.

### US3 — Attended clarify

> As a human at the client, clarify questions reach me: when `/speckit-clarify`
> produces open questions, the agent surfaces them via `report_blocker` with
> `requiresUserDecision: true`; the workflow pauses (status `blocked`) until the
> human's answers arrive via `resume_workflow`. The agent MUST NOT answer clarify
> questions on the human's behalf.

### US4 — Strict batch review cadence

> As a user, I can rely on every implementation batch being reviewed: the
> `implement` → `review_and_fix_implementation` cycle runs **per batch**. Hard rule,
> not configurable.

Mechanics:

1. `implement` is worked batch-wise (`release_batch` / `start_task`); the phase may
   only be exited by submitting the **current, fully implemented batch**
   (batch-scoped `submit_implementation` payload carrying the batch's task ids).
2. `review_and_fix_implementation` gains a third transition reason
   `batch_approved_more_pending` → back to `implement` (next batch).
3. `submission_valid` → `verify` is only permitted when **every batch has an approved
   review pass** (gate over task review status).
4. A per-batch review-round counter guards against infinite fix loops: exceeding the
   configured maximum escalates via `report_blocker` (`requiresUserDecision: true`)
   instead of looping.

### US5 — Converge loop (verify)

> As an agent, `speckit.converge` in `verify` either reports "Converged" (→
> `complete`) or finds gaps (→ new tasks appended to `tasks.md`, loop back to
> `implement`).

Mechanics:

1. The convergence report is the verification evidence; its path is declared in the
   `submit_verification` payload; the gate checks the report exists and states
   "Converged".
2. Because converge **mutates** `tasks.md` (appends gap tasks), the loop transition
   order is: convergence report → `refresh_spec_kit_artifacts` → back to
   `implement` (never loop against a stale task snapshot).
3. Appended tasks form new batches and pass through the same strict batch review
   cadence (US4).
4. A maximum convergence-pass counter per session guards against endless loops;
   exceeding it escalates via `report_blocker` (`requiresUserDecision: true`).

### US6 — Skip on existing artifacts (G4)

> As a user resuming or re-spec'ing, any bound phase whose exit artifact already
> exists in the feature directory (and imports cleanly) is skipped.

Mechanics: a defined transition reason `artifacts_present` per bound phase; the skip
decision is made by the same artifact discovery/import validation that the gates use
(single source of truth — avoids the SKP-1 class of discovery/expectation drift);
each skip is recorded in the session (visible in `get_workflow_state`). This applies
to `understand` (initial check at session start: existing `spec.md` → skip straight
to `plan`) and identically to every other bound phase (crash-resume mid-SDD-flow).

### US7 — Visibility

> As an agent in a spec-kit session, the workflow state is self-explanatory:
> `get_workflow_state` and per-phase guidance surface the current phase's bound
> command(s), batch index/review round where applicable, skips with their reason, and
> (after implementation starts) traceability coverage.

## 4. Functional Requirements

- **FR-1 (workflow registry):** The engine loads workflow definitions from
  `<configDir>/workflows/*.json`. `start_workflow` accepts `workflowId`; absent
  `workflowId` resolves to `standard-development`. Resolution happens at session
  creation (per-session definition, replacing the boot-definition reuse).
- **FR-2 (default invariance):** Sessions without `workflowId`, all existing sessions,
  chains, and the `standard-development` workflow behave byte-identically to today.
- **FR-3 (derivative definitions):** Workflow files may include shared base phase
  definitions (include/override semantics) so `spec-kit-development` cannot drift
  from `standard-development` on unbound concerns (gates, severity logic, review
  requirements).
- **FR-4 (binding format):** A workflow file may declare per-phase bindings
  `{ commands: string[], artifact: {pattern, required} }`. Bound phases render the
  commands into their phase guidance (instruction layer) and gain a fail-closed
  artifact exit gate (enforcement layer) built on the existing artifact
  discovery/import validation (`profiles/spec-kit.json` artifact declarations).
- **FR-5 (attended clarify):** Clarify questions MUST be surfaced via
  `report_blocker` (`requiresUserDecision: true`); the agent is prohibited from
  answering them itself; resume continues the phase.
- **FR-6 (strict batch cadence):** Per US4 — hard rule, three review outcomes
  (`implementation_changes_required`, `batch_approved_more_pending`, `submission_valid`
  only after all batches approved), per-batch review-round maximum with blocker
  escalation.
- **FR-7 (converge loop):** Per US5 — report-as-evidence, refresh before loop-back,
  appended tasks re-enter batch cadence, maximum convergence passes with blocker
  escalation.
- **FR-8 (skip rule):** Per US6 — `artifacts_present` transitions per bound phase,
  decided by artifact discovery/import validation, recorded in session state.
- **FR-9 (multi-workspace):** Workflow files resolve per workspace root (each
  workspace's `.guidance/` may carry its own set) — pool-compatible, no global mode
  switch; unregistered/legacy workspaces keep current behavior.

## 5. Acceptance Criteria

- **AC1 (FR-1/FR-2):** Without `workflowId`, all existing suites pass unchanged;
  with `workflowId: "spec-kit-development"`, the session enters `understand` of the
  spec-kit phase model and `get_workflow_state` reflects the variant.
- **AC2 (FR-4):** Contract test: exiting a bound phase without its artifact fails
  fail-closed with a classified, recoverable error; producing the artifact (or
  pre-existing artifact, AC4) unblocks the exit; the phase guidance contains the
  bound command.
- **AC3 (FR-6):** Contract test with a two-batch task set: exit attempt after batch 1
  goes to review (not verify); `batch_approved_more_pending` returns to `implement`;
  `submission_valid` before all batches are approved is rejected; per-batch review
  rounds are visible in session state; exceeding the review-round maximum escalates
  via blocker.
- **AC4 (FR-8):** Contract test: with a pre-existing importable `spec.md`, a session
  skips `understand` via `artifacts_present` (recorded), starting at `plan`; partial
  artifact sets skip only the phases whose artifacts exist.
- **AC5 (FR-7):** Contract test: converge report without "Converged" loops back to
  `implement` after a task refresh; report with "Converged" completes; exceeding
  maximum passes escalates.
- **AC6 (FR-5):** Clarify questions surface as `report_blocker`
  (`requiresUserDecision`); the session blocks; `resume_workflow` with answers
  continues the phase.
- **AC7 (FR-3/FR-9):** A second workspace carrying its own `workflows/` set can start
  the variant while the pool root stays on `standard-development`; unbound gate
  changes to `standard-development` are inherited by the derivative (include test).

## 6. Non-Goals

- No transition automation from task events (phase transitions remain agent
  submissions gated by severity/traceability checks).
- No changes to `standard-development`'s phase model, gate semantics, or fail-closed
  behavior.
- No adoption of the specs/016 async/SSE mechanism here (separate follow-up scope);
  the spec-kit mode is defined transport-agnostic.
- No changes to the spec-kit tool set itself (16 tools) or to
  `profiles/spec-kit.json` discovery semantics beyond reusing them as the skip/gate
  decision source.

## 7. Open Questions (to resolve before implementation, non-blocking for review)

- **OQ-1:** Convergence report convention: fixed path/shape to be agreed with the
  `speckit.converge` command output (gate validates "Converged" statement + path from
  `submit_verification` payload).
- **OQ-2:** Include/override syntax for derivative workflow files (candidates:
  `$include` per phase key, or full-file inheritance with sparse override map).
- **OQ-3:** Feature numbering: confirm discovery-based next-number selection aligns
  with `speckit-specify`'s directory creation (SKP-1-class drift prevention).

## 8. Adoption Notes

- Sequel decision record: DEC-SKM-1 (`memory-bank/decisions.md`) — ontology
  (workflow variant + binding, not policy-only), attended mode, skip rule, strict
  batch cadence, converge loop; refined with `/speckit-converge` semantics from the
  spec-kit documentation (Step 9).
- Implementation follows the AGENTS.md guidance-workflow process (clear-thought
  passes per phase, GitNexus impact analysis before edits, independent review,
  `gitnexus analyze --no-stats` before completion).
