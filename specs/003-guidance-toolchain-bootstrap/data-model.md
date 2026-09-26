# Data Model: Guidance Toolchain-Bootstrap

**Feature:** specs/003-guidance-toolchain-bootstrap · **Date:** 2026-09-24

## OperationConfig (extended)

```ts
interface OperationConfig {
  // ... existing fields unchanged ...
  /** FR-302: opt-in marker — the operation may be invoked on demand by the
   *  agent via run_operation. Default false (fail-closed). */
  invocableByAgent?: boolean;
}
```

Validation: optional boolean; strict schema (`additionalProperties: false`)
in `src/config.ts` gains exactly this property. Existing configs remain
valid (flag absent = `false`).

## New MCP Tool

```
run_operation
  input:  { sessionId: string, operationId: string }
  output: { id: string, status: "succeeded"|"failed", summary: string }
  errors: agent_invocation_denied (recoverable)
        | operation_in_progress   (recoverable)
        | operation_not_configured
        | session_not_found
```

## Error Codes

| Code | Meaning | Recoverable |
|---|---|---|
| `agent_invocation_denied` | Operation exists but is not marked `invocableByAgent` | yes |
| `operation_in_progress` | An op is already running for this session (FR-307), or a venv-mutating op holds the workspace lock for another session (FR-309) | yes |

(`operation_not_configured`, `session_not_found` reuse existing codes.)

(`operation_not_configured`, `session_not_found` reuse existing codes.)

## Audit Events

Append-only JSONL via existing `AuditRepository` (redaction hook applies).

| eventType | when | data |
|---|---|---|
| `operation_invoked` | execution attempted via run_operation | `{ operationId, status, durationMs, via: "run_operation" }` (status: succeeded/failed/cancelled) |
| `operation_invocation_denied` | guard rejection before execution (FR-302/107/109, inactive session) | `{ operationId, reason }` — no execution event is written for denied calls |

## Pilot Operation Set (examples/python-guidance/operations.json)

| operationId | type | executable | args | riskClass | required | invocableByAgent |
|---|---|---|---|---|---|---|
| `toolchain-sync` | process | `uv` | `["sync","--locked"]` | workspace_write | false | true |
| `lint` | process | `uv` | `["run","--locked","ruff","check","."]` | read_only | true | true |
| `test` | process | `uv` | `["run","--locked","pytest","-q"]` | read_only | true | true |
| `check` | process | `uv` | `["run","--locked","mypy","."]` | read_only | true | true |

All process ops: `validation.exitCodeMustBeZero = true`,
`timeoutSeconds` 300 (verify) / 900 (sync),
`output.returnToAgent = "summary_and_errors"`.

`--locked` semantics: fail-closed on a missing OR stale lockfile
(empirically verified: `--frozen` installs a stale lock silently).
Verification ops are invocable (H1a decision) — their on-demand results
are advisory; the authoritative verdict remains the verify-phase gate.
`read_only` caveat: with a bootstrapped venv, verification touches
nothing outside it; on a missing/empty venv `uv run --locked` installs
from the lockfile (incl. network) — the bootstrap path is owned by
`toolchain-sync`. stderr of failing operations is secret-redacted before
agent-facing use (SC-304, feature 004).

## Locking (FR-307/109/110)

| Scope | Mechanism | Contention result |
|---|---|---|
| Per session | existing per-session mutex | `operation_in_progress` |
| Cross session | workspace-level lock file around venv-mutating ops (atomic link-acquire, rename-based steal with verify+restore — see `src/workflow/workspace-lock.ts`) | `operation_in_progress` |
| Interruption | **hard kill** since feature 004: cancel/timeout aborts the child (SIGTERM → SIGKILL after 5 s grace) and releases locks | next `uv run --locked` self-heals the venv |

Residual limitation (accepted, LOW): the inspect→rename window of the steal
path can move a freshly swapped lock into quarantine; the verify step then
restores or defers — worst case a transient spurious contention plus an
orphan quarantine file, never a double-hold.
