# Plan: Guidance Toolchain-Bootstrap

**Feature:** specs/003-guidance-toolchain-bootstrap · **Spec:** [spec.md](./spec.md) · **Date:** 2026-09-24

## Architecture Summary

No new subsystem. Three touch points on the existing Guidance server:

1. **Config layer** (`src/types/index.ts`, `src/config.ts`): new optional
   `invocableByAgent` flag on operation configs. Strict
   (`additionalProperties: false`) schemas must be extended — config loader
   rejects unknown fields fail-closed today.
2. **MCP layer** (`src/mcp-server/register-tools.ts`, `ToolHandlers.ts`):
   new `run_operation` tool; handler resolves the session, enforces
   FR-102 (allowlist) and FR-107 (per-session mutex), delegates to the
   engine.
3. **Engine layer** (`src/workflow/WorkflowEngine.ts`): expose a public
   `runOperation(sessionId, operationId)` method that reuses the exact
   lifecycle operation path (`OperationEngine.execute` + `exposeOpResult`
   + audit), so policy/validation/redaction/exposure semantics are shared,
   not duplicated.

No changes to: `OperationEngine` execution, `PolicyEngine`, redaction,
exposure, remote-mode components.

## Pilot Toolchain (Python/uv)

- **Image**: `apk add python3` + install `uv` (pinned version) in the
  guidance Dockerfile, before `USER node`.
- **Bootstrap op**: `toolchain-sync` = `uv sync --locked` (fail-closed on
  missing AND stale lockfile by uv semantics — empirically verified:
  `--frozen` would install a stale lock silently), `riskClass:
  workspace_write`, `required: false`, `invocableByAgent: true`,
  `timeoutSeconds: 900`.
- **Verification ops**: `lint` = `uv run --locked ruff check .`, `test` =
  `uv run --locked pytest -q`, `check` = `uv run --locked mypy .` — all
  `riskClass: read_only`, `invocableByAgent: true` (advisory results; the
  phase gate stays authoritative). `--locked` guarantees the ops never
  mutate the lockfile and never install behind the audit trail once the
  venv is bootstrapped; caveat: on a missing/empty venv `uv run --locked`
  still installs from the lockfile (incl. network) — that first-install
  path is owned by `toolchain-sync`, which remains the explicit,
  auditable bootstrap step. Verification ops must not be relied upon to
  bootstrap the environment.
- **venv**: `/workspace/.venv` (in the mounted workspace). Accepted
  tradeoff: Linux binaries are unusable on a Windows host bind mount; `uv`
  detects and rebuilds a broken/mismatched venv.

## Data Model Changes

See [data-model.md](./data-model.md). In short: one new optional flag on
`OperationConfig`, one new audit event type, two new error codes
(`agent_invocation_denied`, `operation_in_progress`), plus a
workspace-level lock file for cross-session serialization (FR-109/110).

## Testing Strategy

- Contract tests (vitest, test-first per repo constitution):
  - `run_operation` allowlist (marked/unmarked/unknown op), structured
    failure shapes, audit event, per-session mutex AND cross-session
    workspace lock (FR-109), kill-on-cancel/timeout (FR-110).
  - Config loader accepts `invocableByAgent` and still rejects unknown
    fields.
- Integration (container): SC-001 end-to-end — fresh container, Python
  fixture workspace, sync + verify; SC-003 fail-closed without lockfile
  AND with a stale lockfile (pyproject changed after lock — repro:
  `uv sync --frozen` succeeds silently, `--locked` fails, verified in
  uv:latest container); SC-004 redaction on pytest output.
- Regression: full existing suite (197 tests) stays green.

## Risks

| Risk | Mitigation |
|---|---|
| PyPI outage / network restrictions in deployment | `toolchain-sync` is `required: false`; failures surface as structured op failures, workflow continues |
| Agent floods PyPI with sync calls | per-session mutex + workspace-level cross-session lock (FR-109) + timeout; rate limiting deferred (ops are session-bound) |
| Stale lockfile installs old deps silently | `--locked` everywhere (fail-closed, empirically verified); SC-003 covers the stale case |
| Interrupted sync leaves broken venv / orphaned lock | FR-110 kill-on-cancel + lock release; venv self-heals on next `uv run --locked` |
| Schema strictness breaks existing configs | flag is optional with default `false`; loader tests cover old configs unchanged |
| venv confusion on host | FR-108 documentation caveat; uv self-repair |
