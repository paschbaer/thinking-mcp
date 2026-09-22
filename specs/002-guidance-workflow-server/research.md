# Phase 0 Research: Guidance — Orchestrator with Spec-Kit Integration

Feature: specs/002-guidance-workflow-server · Date: 2026-09-22

All spec ambiguities were resolved via `/speckit-clarify` (20 recorded decisions in spec.md `## Clarifications`). This document records the resulting technical decisions.

## R1–R10 (carried over from the prior plan round, unchanged)

R1 TypeScript 5.3/Node ≥18/ESM/strict/vitest, package `@paschbaer/guidance` · R2 MCP SDK dual role (`McpServer` upstream, `Client` per downstream server, SDK protocol negotiation + hash-pinned capability contracts) · R3 Ajv for JSON Schema (draft 2020-12, strict additionalProperties), zod only at tool-input boundary · R4 atomic file persistence + JSONL audit + per-session in-process async mutex · R5 SDK-based stub downstream servers for fault injection · R6 closed-namespace `${namespace.path}` templates, fail-closed on unknown vars · R7 sampling/elicitation with graceful degradation · R8 AbortController per operation, SIGTERM→SIGKILL child supervision, graceful cancel drain · R9 loopback-only HTTP, fail on non-loopback bind · R10 pinned dependencies.

## R11. `tasks.md` parsing strategy (NEW)

- **Decision**: hand-written, line-oriented deterministic parser (regex + line state machine) — no markdown AST library. Recognizes: `- [ ]`/`- [x]` checkbox items with `T###` IDs, `[P]` parallel markers, `**bold**` section headings (→ `sourceSection`), inline dependency references (e.g., "depends on T001"), item prose as description. Unrecognized markers → non-blocking warnings (FR-063).
- **Rationale**: tasks.md is line-structured; an AST adds a dependency and nondeterminism between library versions. The parser version is recorded per snapshot (`parserVersion`), so the parser must be version-stable and fully controllable. Deterministic output is a spec requirement (FR-063).
- **Alternatives**: remark/unified AST (heavier, version-sensitive, over-general); regex-only without state machine (cannot track section grouping).

## R12. Snapshot store & reconciliation (NEW)

- **Decision**: snapshot = manifest JSON (per artifact: relative path, sha256, size, mtime at import, parserVersion, configVersion) + copied normalized entities under `state/snapshots/<snapshotId>/`; snapshots form a linked list (`previousSnapshotId`). Staleness: stat (size+mtime) comparison on every state-changing operation; full sha256 re-hash on mismatch and always at completion validation (FR-064). Reconciliation is a pure diff function over old/new normalized task sets implementing the FR-073 rules table, producing a preview object before apply; apply is a separate, audited step.
- **Rationale**: pure-diff reconciliation is unit-testable without I/O; the linked snapshot history satisfies immutability and audit (FR-064, FR-073) with plain files.
- **Alternatives**: content-addressed blob store (overkill); re-import in place (violates immutability).

## R13. Dependency graph & scheduler (NEW)

- **Decision**: adjacency graph built at import/refresh, validated (unknown/self/duplicate/cycle ⇒ import errors, FR-063); topological order cached. Dependency satisfaction uses the FIXED set {`completed`, `verified`} — not configurable (clarified 2026-09-22). Readiness is a pure predicate over task states + graph + policy holds. Scheduling modes (`single`, `batch` [default, max 3], `allReady`, `phaseGroup`) are strategies selecting from the ready set; the released batch is persisted in the session (`activeBatch`) and locked during submission processing (profile §46). Parallel task implementation defaults to sequential execution (concurrency 1) unless configured.
- **Rationale**: fixed satisfaction set removes a configuration dimension and makes readiness deterministic and trivially testable.
- **Alternatives**: configurable per-edge satisfaction mapping (rejected — clarification Q2 = B).
- **Rationale**: keeps ordering correctness in one tested component; strategies stay trivial.
- **Alternatives**: on-demand graph queries (repeated cycle-check cost, harder to test).

## R14. Traceability graph (NEW)

- **Decision**: graph persisted inside session JSON: nodes (requirement, criterion, planElement, task, file, test, operationExecution, finding, planChange), typed edges; every task↔requirement/criterion link carries `source: parsed | asserted`. Parsed links come from `FR-###`/`AC-###` references in artifacts (R11 parser captures them); asserted links come from plan-review/implementation submissions and are validated against normalized IDs. Coverage status derived per FR-071; completion validator consumes the graph.
- **Rationale**: one graph, no extra store; source attribution makes coverage claims auditable.
- **Alternatives**: separate link store file (more atomicity complexity, no benefit at this scale).

## R15. Profile resolution (NEW)

- **Decision**: config loader resolves profile as: explicit `profile` key → that profile; else if `integrations.spec-kit.enabled` or a feature root is configured → `spec-kit` (implied); else plain workflow (FR-060). Resolution result is hashed into `configurationVersion`.
- **Rationale**: implements clarified default without surprising projects that never configured Spec-Kit.

## R16. Plan-change approval channel (NEW)

- **Decision**: PlanChangeService reuses the ElicitationService from FR-054: structured approval request via upstream elicitation when the host supports it, otherwise a structured blocker resolved via `resume_workflow`. Approval decisions are recorded with the change record and audit event `spec_kit_plan_change_approved/rejected`.
- **Rationale**: clarified (Q5 = A); one approval stack, one degradation path.

## R17. Profile tools registration

- **Decision**: the 12 Spec-Kit tools are registered only when the resolved profile is `spec-kit` (or `list_configured_operations`-style discovery is explicitly requested); plain-profile sessions never see them. Tool input validation remains zod.
- **Rationale**: least surprise for agents; smaller surface per FR-075/§30.

## R18. Test fixtures for the adapter

- **Decision**: fixture feature directories under `tests/fixtures/`: `valid-minimal`, `valid-full` (markers: `[P]`, sections, deps), `missing-tasks`, `empty-spec`, `duplicate-task-ids`, `unknown-dependency`, `dependency-cycle`, `checkbox-tampered`, `injected-instructions`, `stale-snapshot` variants. Fixtures double as parser golden tests (deterministic output assertions).
- **Rationale**: FR-063 determinism + SC-011/012/013 fault-injection coverage.
- **Alternatives**: generated fixtures at runtime (hides formatting regressions).

## R19–R23 (post-checklist-clarify amendments, 2026-09-22)

- **R19. Feature lock registry (FR-061)**: `state/` maintains a lock file per canonical feature directory (same atomic tmp+rename mechanism as sessions). Second `start_workflow` for a locked feature ⇒ recoverable `feature_in_use` error naming the holder; lock released on terminal state or cancellation; stale locks (holder session dead) are reclaimed during startup sweep.
- **R20. Deterministic plan-change classifier (FR-072)**: pure function over (changeType, impact flags): minor ⇔ purely additive ∧ non-breaking (no criterion/API/dependency/architecture change); trigger list is closed, configuration may only add triggers.
- **R21. Waiver flow (FR-071)**: waiver request routes through the shared ElicitationService (FR-054 channel); approval record {decision, reason, channel, timestamp} stored on the criterion + dedicated audit event + listing in the completion report.
- **R22. Atomic reconciliation apply (FR-073)**: ReconciliationEngine builds the complete new session state in memory (preview derives from it), then persists via the standard atomic session write; crash before the write ⇒ old snapshot authoritative, reconciliation marked retry-eligible. No journal needed.
- **R23. Checklist-derived defaults**: concurrency 1; post-completed feature start ⇒ `workflow_already_completed`; excerpt ≤ 64 KiB, artifact excerpt cap 1 MB, ≤ 500 tasks / 2,000 entities per feature; parser-version bump ⇒ snapshots stale + refresh required; snapshots retained/archived with session per FR-029; severity `blocking` = {high, critical}; finding disputes only via structured proposal; UTF-8 required (CRLF normalized); required downstream unavailability follows FR-040 — all recorded in spec Assumptions and mapped into the default configuration file.
