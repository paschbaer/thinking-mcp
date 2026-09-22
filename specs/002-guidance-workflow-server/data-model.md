# Phase 1 Data Model: Guidance — Orchestrator with Spec-Kit Integration

Feature: specs/002-guidance-workflow-server · Date: 2026-09-22 · Sources: [spec.md](./spec.md) Key Entities + FR-001–075

## Entities

### WorkflowSession (atomic file, per FR-019/044)

v1/v2 fields as before (sessionId `session-<ulid>`, workflowId, configurationVersion, workspaceRoot canonical, status `active|blocked|completed|cancelled`, currentPhase/previousPhase, request, submissions, blockers, requestIds ledger, timestamps) plus profile extension:

| Field | Type | Rules |
|---|---|---|
| profile | `plain` \| `spec-kit` | resolved per FR-060; hashed into configurationVersion |
| specKit | SpecKitSessionState \| null | present only for profile `spec-kit` (FR-043 session extension) |

### SpecKitSessionState (FR-043)

| Field | Type | Rules |
|---|---|---|
| feature | { featureId, relativeDirectory } | exactly one; inside workspace (FR-061) |
| activeSnapshotId / snapshots | string / SnapshotRef[] | linked history (FR-064) |
| requirements / acceptanceCriteria | map<id, NormalizedRequirement / NormalizedCriterion> | FR-065 |
| tasks | map<T###, Task> | Guidance-owned state (FR-066) |
| taskBatches | map<batchId, TaskBatch> | active + history; active batch locked (FR-069) |
| planChanges | map<changeId, PlanChange> | FR-072 |
| traceability | TraceabilityGraph | FR-071 |
| artifactValidation | { findings[], severities } | FR-063, separate from semantic review |

### SnapshotRef / Snapshot manifest (immutable, FR-064)

`snapshotId, previousSnapshotId, createdAt, configVersion, parserVersion, artifacts: [{ type, relativePath, sha256, sizeBytes, mtimeAtImport }]`, plus stored normalized entities copy. Immutability: files never modified after creation. Staleness: stat(size+mtime) per artifact vs manifest on each state change; sha256 re-verify on mismatch and at completion (FR-064).

### NormalizedRequirement / NormalizedCriterion (FR-065)

`id (source or snapshot-local generated — never written back), text, required, source { artifact, path, lineStart, lineEnd }, linkedTasks[], linkedCriteria[] / linkedRequirements[]`, coverage status (for criteria: `unmapped|planned|implemented|partially_verified|verified|waived|blocked`).

### Task (FR-066–069)

| Field | Type | Rules |
|---|---|---|
| taskId | `T###` | unique (FR-063) |
| title / description | string | from item prose |
| required | boolean | required tasks gate completion (FR-074) |
| parallelizable | boolean | from `[P]` marker |
| sourceSection | string \| null | from bold section heading |
| status | see state machine | Guidance-owned (FR-066) |
| dependencies | `T###[]` | validated: known, no self/dup/cycle (FR-063) |
| affectedFiles | string[] | parsed where present |
| linkedRequirements / linkedAcceptanceCriteria | id[] + link source `parsed\|asserted` | FR-071 merged acquisition |
| source | { artifact, path, lineStart, lineEnd, contentHash } | exact imported snapshot binding |
| implementation / review / verification | evidence records \| null | completion requires all required parts (FR-069) |
| checkboxAtImport | `checked\|unchecked` | hint only (FR-066) |

### Task state machine (FR-066)

`pending → ready → in_progress → implemented → review_required → {fix_required → in_progress | verification_required → verified → completed}`; exceptional: any nonterminal → `blocked` (→ previous state), pending/ready → `deferred`, any nonterminal → `cancelled`. Transitions performed by Guidance only, after validating agent reports. Readiness (FR-067): all required dependencies in the FIXED satisfying set {`completed`, `verified`} ∧ not blocked/deferred/cancelled ∧ required reviews done ∧ no policy hold.

### TaskBatch (FR-068/069)

`batchId, mode (single|batch|allReady|phaseGroup), taskIds[], releasedAt, state: released|active|submitted|closed`; only one active batch per session; submissions restricted to batch members unless opportunistic work is explicitly configured + approved.

### PlanChange (FR-072)

`changeId, changeType (closed list: add_task|remove_task|defer_task|changed_requirement|changed_criterion|architecture|public_api|dependency|migration|verification_strategy|out_of_scope), classification (minor|major — deterministic: minor ⇔ purely additive ∧ non-breaking), reason, affectedArtifacts[], affectedTasks[], proposedChanges, impact flags, status (proposed|approved|rejected|artifact_update_required|applied), approvalRecord`, resolution only via explicit artifact update + `refresh_spec_kit_artifacts`.

### Reconciliation (FR-073)

Pure diff (old vs new task sets + artifacts) → preview { addedTasks, removedTasks, changedTasks, changedDependencies, changedCriteria, evidenceImpact } → apply. Apply is ATOMIC: the full reconciled session state is built in memory, then persisted with one atomic write; a crash before the write leaves the previous snapshot authoritative with the reconciliation marked retry-eligible — partially applied states are impossible. Rules: unchanged keep evidence; changed pending re-normalize; changed active block+review; changed completed flag impact review; removed completed supersede (audit retained); added → `pending`; readiness recalculated.

### FeatureLock (FR-061)

Lock file per canonical feature directory in `state/`; records holding sessionId. Acquired at session start; released on terminal state or cancellation; stale locks reclaimed during startup sweep. Second acquisition ⇒ recoverable `feature_in_use` error naming the holder.

### TraceabilityGraph (FR-071)

Nodes: requirement, acceptanceCriterion, planElement, task, file, test, operationExecution, finding, planChange. Edges: defines, satisfies, implements, changes, verifies, dependsOn, finds, resolves, supersedes. Every task↔requirement/criterion edge records `source: parsed|asserted`. Coverage statuses per criterion as above; report tool filters (`onlyUncovered`).

### OperationExecution / AuditEvent

As in v2 (normalized result, errorKind classification, idempotency ledger, JSONL audit with snapshot identifier added to all `spec_kit_*` events per profile §44).

## State transitions (session level, unchanged + profile gating)

- `active ⇄ blocked` via `report_blocker` / `resume_workflow` only (FR-028).
- `active(complete) → completed`: v2 operations validated (FR-004/005) **and**, for profile `spec-kit`, all FR-074 invariants (artifacts valid, snapshot current, all required tasks completed, none blocked/active, criteria covered+verified, no pending plan changes, no unresolved material deviations, traceability report persisted).
- `active → cancelled`: graceful drain (FR-057).

## Identity & uniqueness

One active phase; one accepted submission per phase instance; unique executionIds; requestId ledger prevents duplicate downstream invocations; one active feature + one active snapshot per session; unique `T###` per snapshot; one active batch; unique changeIds; every audit event carries the active snapshot id.
