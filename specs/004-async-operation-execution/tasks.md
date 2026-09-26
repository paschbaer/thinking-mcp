# Tasks: Async Operation Execution & Hard Cancellation

**Feature**: specs/004-async-operation-execution · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-26
**Principles**: Test-First (constitution III); server isolation; conventional commits; `gitnexus analyze --no-stats` + `detect_changes()` before **every commit**.
**Paths**: `servers/server-guidance/…` — `src/…` = `src/…`, `tests/…` = `tests/…`.

## Dependencies

- T002 depends on T001 (test-first). T003 depends on T002. T004 depends on T003. T005 depends on T003 + python example from feature 003. T006 is last.

## Phase 1 — US1: Async process execution (P1)

- [ ] T001 [US1] Write failing contract tests in `tests/orchestration/operation-engine-async.test.ts`: async execution of a real child process (exit-code validation pass/fail), timeout escalation (short-timeout child is killed SIGTERM→SIGKILL, execution fails as timed out), non-blocking behavior (a slow execution does not prevent another `execute` promise from resolving), env/shell parity (SC-parity per FR-201)
- [ ] T002 [US1] Implement async process execution in `src/orchestration/OperationEngine.ts` (`spawn` + promise, SIGTERM→SIGKILL escalation, abort-signal parameter, buffer capture with `maxBuffer`) and route the `process` type plus composite process steps through it — make T001 pass

## Phase 2 — US2: Hard cancellation (P1)

- [ ] T003 [US2] Write failing tests in `tests/contract/tools-run-operation.test.ts`: cancel_workflow mid-run of a real slow process op → child killed (pid gone), workspace lock released, subsequent run_operation in another session succeeds, result discarded/audited as cancelled (SC-201, FR-202); then implement the AbortController registry + abort wiring in `cancel_workflow`/timeout in `src/workflow/WorkflowEngine.ts` and `src/mcp-server` passthroughs — make T003 pass

## Phase 3 — US3: Real-concurrency coverage (P1)

- [ ] T004 [US3] Add real-process contention tests (R-006/FR-203): session A runs a slow invocable op, session B → `operation_in_progress` while A runs (replaces deferred-fake-only coverage) — extend `tests/contract/tools-run-operation.test.ts`
- [ ] T005 [US3] Extend `tests/integration/python-toolchain.e2e.test.ts` (R-006/FR-204): (a) FR-109 real contention E2E, (b) SC-002 denial via an unmarked op injected into the workspace config, (c) SC-004 secret printed by pytest is redacted in the agent-facing result, (d) cancel-kill mid-run E2E (SC-201)
- [ ] T006 [US3] Full regression + typecheck + build (SC-205); update README (FR-110: hard-kill supersedes the cooperative limitation), specs/003 data-model note, memory-bank (R-006, FR-110 follow-ups resolved); final review per protocol; commits + merge to develop
