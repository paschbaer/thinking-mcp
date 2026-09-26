# Plan: Async Operation Execution & Hard Cancellation

**Feature:** specs/004-async-operation-execution · **Spec:** [spec.md](./spec.md) · **Date:** 2026-09-26

## Architecture Summary

Single seam: the process-execution core of `OperationEngine`.

1. **`src/orchestration/OperationEngine.ts`**: extract process execution
   into a private `executeProcessAsync(config, ctx, timeoutMs, signal)`
   returning a promise that resolves with the same result shape the sync
   path produced. `spawnSync` → `spawn` with `AbortSignal`; kill escalation
   SIGTERM → SIGKILL after 5 s; stdout/stderr accumulated with `maxBuffer`
   truncation semantics; exit-code/protocol validation reused.
2. **Cancellation registry** (`src/workflow/WorkflowEngine.ts`):
   `Map<sessionId, Set<AbortController>>`; `runOperation` creates a
   controller, removes it in `finally`; `cancelWorkflow` aborts all
   controllers of the session before flipping session state. Aborted
   executions resolve as `cancelled` → existing discard path (FR-110).
3. **Timeout escalation** replaces the sync timeout parameter: the engine
   owns the timer, sends SIGTERM on `timeoutSeconds`, SIGKILL 5 s later.

No changes to validation, redaction, exposure, audit, or policy paths.

## Data Model Changes

None public. New error code: `operation_aborted`? No — cancelled
executions keep the existing discard path; no new codes except none.
(Kept deliberately: cancelled results surface as failed+summary.)

## Testing Strategy

- Unit/contract: async execution parity (exit codes, timeout escalation
  with a real `sleep`-child, env/shell), cancellation mid-run (child gone,
  lock released), real-process cross-session contention.
- E2E (python profile): denial (unmarked op injected into workspace config),
  contention, secret redaction, cancel-kill.
- Regression: full suite ≥ 279 + new; typecheck; build.

## Risks

| Risk | Mitigation |
|---|---|
| Subtle parity drift (stderr ordering, buffer truncation) | contract tests assert the same result shapes; suite is the arbiter |
| Zombie children on SIGKILL race | escalation timer + `close` event awaited; lock released in `finally` regardless |
| Cancellation vs. audit ordering | existing discard path (result audited as cancelled) unchanged |
