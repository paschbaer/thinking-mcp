# Specification: Async Operation Execution & Hard Cancellation

**Feature ID:** `004-async-operation-execution`
**Parent follow-ups:** specs/003-guidance-toolchain-bootstrap — R-006 (E2E coverage gaps), FR-110 (hard-kill)
**Namespace note:** FR/SC numbering starts at FR-201/SC-201 (lesson from the FR-101 collision between spec 003 and amendments 001/002)
**Status:** Draft
**Date:** 2026-09-26

## Overview

The `OperationEngine` executes `process` operations with `spawnSync` — the
Node event loop blocks for the entire run. Consequences: (a) cancellation of
a running operation is impossible mid-flight (FR-110 had to be specified as
"cooperative"), (b) real concurrency — and therefore real tests of FR-107/
FR-109 contention and of cancellation — is unobservable, which left R-006
E2E coverage gaps. This spec replaces the blocking process execution with an
async spawn and wires true hard cancellation into the engine.

## User Stories

### US1: Async process execution (P1)

**As an** operator of the guidance server,
**I want** `process` operations to run on a non-blocking async spawn with
identical semantics (exit-code validation, timeout SIGTERM→SIGKILL, env,
shell, cwd, maxBuffer),
**so that** the server stays responsive during long operations and
concurrency becomes real.

**Acceptance:** behavior parity with the current implementation for all
validation/redaction/exposure paths; a long-running operation no longer
blocks other engine work; timeouts still terminate children (escalating
SIGTERM → SIGKILL after a 5 s grace).

### US2: Hard cancellation (P1, supersedes the cooperative FR-110 limitation)

**As an** agent or user cancelling a session while an operation runs,
**I want** the child process to be killed (SIGTERM, escalating to SIGKILL),
the workspace lock released, and the result discarded,
**so that** a cancelled session leaves no running children, no held lock,
and no stale results.

**Acceptance:** `cancel_workflow` (and operation timeout) aborts all active
executions of the session; a subsequent `run_operation` in another session
succeeds immediately; the discarded result is audited as cancelled.

### US3: Real-concurrency coverage (P1, closes R-006)

**As a** maintainer,
**I want** the previously unit-only guarantees proven end-to-end with real
processes: FR-109 cross-session contention (`operation_in_progress`),
SC-002 `invocableByAgent` denial, SC-004 secret redaction in pytest output.

**Acceptance:** the python-toolchain E2E exercises all four (plus cancel-
kill); no remaining "unit-level only" caveat for FR-107/109/110 in spec 003.

## Functional Requirements

- **FR-201** `OperationEngine` executes `process` operations via async
  `spawn` (promise-based), with a 5 s SIGTERM→SIGKILL escalation on timeout;
  stdout/stderr capture, `maxBuffer`, per-op `env`, `shell`, `cwd`,
  `timeoutSeconds` semantics unchanged. Composite/mcp/sampling paths reuse
  the same executor for their process steps.
- **FR-202** Cancellation contract: the engine accepts an abort signal per
  execution; on abort the child receives SIGTERM, then SIGKILL after a 5 s
  grace; the execution resolves as cancelled (not succeeded/failed) and the
  caller decides discarding. `WorkflowEngine.runOperation` registers an
  AbortController per session; `cancel_workflow` aborts all active
  controllers of that session; the workspace lock is released in `finally`
  (already) and the result is discarded as before (FR-110 semantics
  upgraded from cooperative to hard-kill).
- **FR-203** Concurrency semantics unchanged: per-session mutex (FR-107)
  and cross-session workspace lock (FR-109) apply; with async execution,
  contention is now observable and testable with real process operations.
- **FR-204** E2E completion (R-006): the python-toolchain E2E covers
  (a) FR-109 real contention (session B gets `operation_in_progress` while
  session A runs a slow operation), (b) SC-002 denial through
  `run_operation` on an unmarked operation present in the workspace config,
  (c) SC-004 secret redaction visible in real pytest output, (d) FR-110/
  FR-202 cancel-kill mid-run.
- **FR-205** Parity/regression: lifecycle paths (beforeEnter/beforeExit/
  afterEnter/afterExit, start, retry) use the async executor; the full
  existing suite passes unchanged (279 tests + new ones).

## Success Criteria

- **SC-201**: A `sleep`-style process operation cancelled mid-run: child
  process is gone within the SIGKILL grace, workspace lock released,
  subsequent acquire in another session succeeds.
- **SC-202**: E2E: session B's `run_operation` during session A's slow
  operation → `operation_in_progress` (FR-109 with real processes).
- **SC-203**: E2E: `run_operation` on an unmarked op →
  `agent_invocation_denied`, no execution.
- **SC-204**: E2E: a secret printed by pytest is redacted before the
  agent-facing result (SC-004 at E2E level).
- **SC-205**: Full suite green (≥ 279 + new), typecheck + build clean.

## Out of Scope

- Parallel execution of multiple operations per session (mutex stays).
- Multi-operation heartbeat/progress reporting.
- Changes to downstream MCP operation execution.

## Assumptions

- Node's `spawn` with `signal` (AbortSignal) provides SIGTERM on abort;
  escalation to SIGKILL is implemented engine-side with a grace timer.
- Windows hosts (dev only, not the container runtime) may lack SIGKILL
  semantics — the container is the authoritative runtime (documented).
