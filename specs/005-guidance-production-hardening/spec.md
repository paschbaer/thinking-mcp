# Specification: Guidance Production Hardening (Tracks Bundle)

**Feature ID:** `005-guidance-production-hardening`
**Namespace:** FR-401+, SC-401+ (per the numbering-collision lesson; spec 003 will move to FR-301+ in US5)
**Closes tracks:** PLAN-CLEANUP · L260/FR-059 · FR-104.5 · TRACK-Venv-C · TRACK-NS · TRACK-Scaffold
**Status:** Draft
**Date:** 2026-09-26

## Overview

Bundle of six independently tracked follow-ups that together harden Guidance
for production: memory-bank plan hygiene, the deferred metrics surface
(FR-059), integrity for remote-mode client reports (FR-104.5), relocated
toolchain venvs, FR-namespace renumbering, and scaffold language detection.

## User Stories

### US1: Memory-bank plan hygiene (PLAN-CLEANUP, P1)

**As a** maintainer, **I want** the remaining-work-plan to reflect reality —
resolved findings marked `[x]` with evidence, duplicate sections (R-011/
R-012 appear twice) merged, stale spec-003 entries (R-004/R-005/R-006/
R-010/R-013, FR-110-Harter-Kill — all fixed by features 003/004) closed —
**so that** tracked follow-ups are trustworthy.

**Acceptance:** no `[ ]` entry remains that is already fixed by commits up
to the session HEAD; duplicates merged; a hygiene-rule note added (fixes
must update the plan in the same session).

### US2: Metrics surface (L260/FR-059, P1)

**As an** operator, **I want** a `get_metrics` MCP tool reporting operation
runs/succeeded/failed/cancelled counts, duration aggregates (count/sum/max)
per operation id, and downstream connection health snapshots over time,
**so that** production operation is observable without parsing logs.

**Acceptance:** in-memory aggregates recorded on every operation execution
(via `executeRequired` and `runOperation`), connection health recorded by
the ClientManager; `get_metrics` returns the aggregate read-only; no secret
values recorded (identifiers and numbers only); optional JSONL persistence
in `stateDir/metrics.jsonl` (append per execution) so aggregates survive
restarts by replay.

### US3: Client-report integrity (FR-104.5, P2)

**As an** operator of the remote mode, **I want** `report_operation_result`
calls to be bound to the exact pending operation via a one-time token,
**so that** fabricated, replayed, or misattributed client reports are
rejected rather than trusted.

**Acceptance:** every `awaiting_client` operation gets a random opToken
(32 hex) stored in the ledger; `report_operation_result` must present the
matching token (`reportToken` field); unknown/mismatched/already-used tokens
→ `client_report_invalid` (recoverable), audited; token is single-use
(burned on acceptance); when key/token auth is configured the token is
additionally HMAC'd (key-derived) — documented trust upgrade, still not a
full substitute for trusted execution.

### US4: Relocated toolchain venv (TRACK-Venv-C, P2)

**As an** operator, **I want** documented first-class support for placing
the Python venv outside the workspace via `UV_PROJECT_ENVIRONMENT`
(compose example + README), **so that** Windows-host bind-mount
incompatibility disappears without code changes.

**Acceptance:** compose example with named volume + `UV_PROJECT_ENVIRONMENT`;
README section; E2E variant proves toolchain-sync/verify work with a
relocated venv.

### US5: FR-namespace renumbering (TRACK-NS, P2)

**As a** maintainer, **I want** spec 003 renumbered to FR-301…FR-315 /
SC-301…305 (with an alias table FR-101→FR-301 …), **so that** the FR
namespace collision with amendments 001/002 is resolved.

**Acceptance:** no `FR-101…110`/`SC-001…005`-as-spec003 identifiers remain
in specs/003 (alias table maps old→new); memory-bank references updated;
spec-003-internal code comments may keep `R-xxx` review ids.

### US6: Scaffold language detection (TRACK-Scaffold, P3)

**As an** agent starting a workflow in a Python workspace, **I want** the
scaffold to generate the uv-based default operations (spec 003 pilot set)
when `pyproject.toml` exists, **so that** Python workspaces get working
verification gates without hand-editing.

**Acceptance:** `scaffoldIfMissing` detects `pyproject.toml` in the
workspace root and generates the Python operations variant (toolchain-sync/
lint/test/check per spec 003 data-model) while keeping the gate op; a test
covers both variants.

## Functional Requirements

- **FR-401** Plan hygiene executed per US1; hygiene-rule persisted in
  memory-bank (systemPatterns).
- **FR-402** `get_metrics` tool (plain profile): returns
  `{ uptimeSeconds, operations: { [opId]: { runs, succeeded, failed,
  cancelled, timedOut, durationMs: { count, sum, max } } }, connections:
  [{ serverId, status, lastSuccessfulRequestAt }] }`.
- **FR-403** Metrics recording hooks: WorkflowEngine records per execution
  (lifecycle + runOperation); ClientManager records health snapshots on
  status change; persistence as JSONL append in `stateDir/metrics.jsonl`,
  replayed on boot; all payloads redacted via the audit redactor.
- **FR-404** Remote-mode report tokens per US3 (one-time, audited,
  `client_report_invalid` on mismatch/replay; HMAC-SHA256 with the session
  key material when key auth is configured).
- **FR-405** Venv relocation via `UV_PROJECT_ENVIRONMENT` (documentation +
  compose example + E2E variant); no engine changes.
- **FR-406** Spec 003 renumbering per US5 with alias table.
- **FR-407** Scaffold language detection per US6.
- **FR-408** Documentation updates (README metrics + venv + scaffold).

## Success Criteria

- **SC-401**: `get_metrics` counts match the operations actually executed
  in the test session (verified by executing N ops and asserting N).
- **SC-402**: Remote-mode E2E: reporting with wrong/missing/replayed token
  → `client_report_invalid`; correct token accepted exactly once.
- **SC-403**: `grep -rE "FR-(101|102|103|104|105|106|107|108|109|110)\b"
  specs/003-guidance-toolchain-bootstrap/` returns no unaliased hits (alias
  table excepted).
- **SC-404**: Scaffold in a workspace with `pyproject.toml` produces the uv
  op set; without it, the npm set (unchanged).
- **SC-405**: Full suite green (≥ 293 + new), typecheck + build clean.

## Out of Scope

- Metrics dashboards/export formats (beyond JSONL).
- Trusted-execution guarantees for client reports beyond token binding.
- Rust/other-language scaffold variants.
