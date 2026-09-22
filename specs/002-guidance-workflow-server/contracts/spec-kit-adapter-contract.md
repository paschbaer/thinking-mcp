# Contract: Spec-Kit Artifact Adapter (profile `spec-kit`)

Feature: specs/002-guidance-workflow-server · Read-only file adapter (FR-072 §48.4); Markdown artifacts are untrusted data (FR-075 §48.3). Deterministic: identical config + artifact content ⇒ identical normalized output (FR-063).

## Feature discovery (FR-061)

- Strategies: `explicit` (recommended; caller passes featureId/directory), `currentBranch` (strip configured prefixes, validate against real directories), `mostRecentlyModified`, `singleCandidate`, `configuredDefault`.
- Automatic strategies require a unique candidate; ambiguity ⇒ workflow blocks with `spec_kit_feature_ambiguous`.
- Resolved directory must canonicalize (symlinks resolved) inside the workspace root; escapes ⇒ `spec_kit_feature_outside_workspace`.

## Artifact discovery & identity (FR-062)

Logical types with default patterns: specification `spec.md` (required), plan `plan.md` (required), tasks `tasks.md` (required), research `research.md`, dataModel `data-model.md`, quickstart `quickstart.md`, contracts `contracts/**`, checklists `checklists/**`. Each imported artifact records: type, relative+canonical path, sha256, sizeBytes, mtime, parserVersion, importedAt.

## Parser contract (tasks.md, FR-063, research R11)

Recognized structures:

| Structure | Syntax | Normalized to |
|---|---|---|
| Task item | `- [ ] T003 Add retry tests` / `- [x] …` | Task (id `T###`, title/description from prose, `checkboxAtImport` = hint only) |
| Parallel marker | `[P]` inside item text | `parallelizable: true` |
| Section grouping | `## **Phase 3: …**` or bold heading line | `sourceSection` for subsequent items (phaseGroup scheduling) |
| Dependencies | "depends on T001, T002" / `(depends: T001)` | `dependencies[]` (validated) |
| Requirement/criterion refs | `FR-###`, `AC-###` tokens | parsed traceability links (source `parsed`) |
| Unrecognized markers | anything else | non-blocking warning (severity `warning`) |

Parser version constant incremented on any behavioral change; version recorded in every snapshot.

## Structural validation (FR-063)

Blocking checks (configurable severities; defaults blocking): required artifacts present, non-empty, readable; required spec sections present when configured; task IDs present + unique; dependency references resolvable; no self/duplicate dependencies; no cycles; referenced paths inside workspace. Unique requirement/criterion IDs validated when present. Findings carry severity `info|warning|error|blocking`; semantic review (agent) recorded separately.

## Snapshots & staleness (FR-064)

Snapshot = manifest (per-artifact type/path/sha256/size/mtime, parserVersion, configVersion, `previousSnapshotId`) + stored normalized entities. Immutable after creation; linked history. Staleness: stat(size+mtime) comparison on every state-changing operation; sha256 re-hash on mismatch; full re-hash at completion validation. Stale ⇒ `spec_kit_snapshot_stale`; completion blocked until refresh. A parser-version bump marks existing snapshots stale (refresh required before further task release; no silent re-normalization).

## Reconciliation atomicity (FR-073, clarified)

Apply is a single atomic state write of the fully prepared result; crash before the write ⇒ previous snapshot authoritative, reconciliation retry-eligible; partially applied states are impossible.

## Feature locking (FR-061, clarified)

Exclusive per-feature-directory session lock (`feature_in_use` recoverable error naming the holder); released on terminal state or cancellation; stale locks reclaimed at startup sweep.

## Reconciliation (FR-073)

Pure diff of old vs new normalized entities → preview (added/removed/changed tasks, changed deps/criteria, evidence impact) → explicit apply. Rules: unchanged keep state+evidence; changed pending re-normalize; changed active → blocked + review; changed completed → stale-evidence flag + impact review; removed pending → approved removal required; removed completed → superseded (audit retained); added → `pending`; readiness recalculated. Apply audited with `spec_kit_reconciliation_applied`.

## Plan changes (FR-072, clarified)

Trigger list is CLOSED (config may add, never remove): add/remove/defer task, change requirement/criterion, architecture, public API, dependency, migration, verification strategy, out-of-scope work. Classification is deterministic: minor ⇔ purely additive ∧ non-breaking (no criterion/API/dependency/architecture change); else major. Flow: proposal → deterministic classification → approval policy (major: user approval via elicitation or blocker+`resume_workflow`) → agent updates artifacts explicitly → `refresh_spec_kit_artifacts` → preview → apply → reschedule. Waivers of acceptance criteria follow FR-071: user approval via the same channel, mandatory reason, audit event, completion-report listing. Adapter itself never writes artifacts.

## Completion invariants (FR-074)

All of: feature selected; required artifacts valid; snapshot current; all required tasks completed; no required task blocked; no active tasks; dependencies satisfied; blocking findings resolved; required criteria covered + verified; required verification succeeded; no pending plan changes; no unresolved material deviations; required completion operations succeeded (incl. GitNexus repository analysis); traceability report persisted; terminal state persisted.

## Contract tests (write FIRST, fixtures in `tests/fixtures/`)

1. `valid-minimal` / `valid-full` import → deterministic normalized output (golden).
2. Each fault fixture (`missing-tasks`, `empty-spec`, `duplicate-task-ids`, `unknown-dependency`, `dependency-cycle`) → corresponding blocking error.
3. `checkbox-tampered`: `[x]` without evidence never completes (SC-011).
4. Dependency graph: cycle/unknown/self rejected; only ready tasks released (SC-012).
5. Reconciliation fixtures: evidence preserved for unchanged tasks; changed completed flagged (SC-014).
6. `injected-instructions`: artifact text never alters policy/transitions (SC-009).
7. Stale snapshot blocks completion until refresh; refresh creates new linked snapshot.
8. Traceability: parsed vs asserted link sources; uncovered required criteria reported.
9. Every state change emits audited `spec_kit_*` event with snapshot id (SC-015).
