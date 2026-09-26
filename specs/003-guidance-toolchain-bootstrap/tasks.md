# Tasks: Guidance Toolchain-Bootstrap

**Feature**: specs/003-guidance-toolchain-bootstrap · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-24
**Principles**: Test-First (constitution III — every story starts with failing tests); server isolation; conventional commits; `gitnexus analyze --no-stats` + `detect_changes()` before **every commit** (applies to each task's commit).
**Paths**: implementation under `servers/server-guidance/`; `src/…` = `servers/server-guidance/src/…`; `tests/…` = `servers/server-guidance/tests/…`.

## Dependencies

- Phase 2 (T002–T006) is independent of Phase 1's example profile but uses the `tests/fixtures/python-ws/` fixture from T001.
- T007 (image) blocks T008 (container E2E). T008 (E2E) is written test-first and iterates red→green with T009, which supplies the wired example profile it needs (T009 also depends on T001).
- T010–T013 are sequential; T011 and T012 can run in parallel (P markers on their task lines).

## Phase 1 — Setup

- [x] T001 Create example profile skeleton `examples/python-guidance/` (`guidance.json`, `workflow.json`, `responses.json`, `operations.json`, `policies.json`) with the pilot operation set per data-model.md (toolchain-sync/lint/test/check); fixture Python workspace under `tests/fixtures/python-ws/` (`pyproject.toml`, `uv.lock`, minimal module + test)

## Phase 2 — US1: On-demand operation invocation (P1)

**Goal**: `run_operation` tool executing whitelisted operations through the trusted pipeline.
**Independent test**: marked op executes and returns real exit-code verdict; unmarked/unknown op rejected fail-closed; audit + concurrency guard verified.

- [x] T002 [US1] Write failing config-loader tests in `tests/contract/config-loader.test.ts` (extend): `invocableByAgent` accepted on operation configs, default-absent configs still load (schema strictness unchanged), non-boolean rejected as `configuration_invalid`
- [x] T003 [US1] Implement `invocableByAgent` in `src/types/index.ts` (OperationConfig) + `src/config.ts` (strict schema) — make T002 pass
- [x] T004 [US1] Write failing contract tests in `tests/contract/tools-run-operation.test.ts`: marked process op executes via OperationEngine and returns `{id,status,summary}` (SC-301 unit level, SC-304); unmarked op → `agent_invocation_denied` without execution **(SC-302)**; unknown op → `operation_not_configured`; unknown session → existing session error contract; audit event `operation_invoked` recorded; concurrent second call in same session → `operation_in_progress` (FR-307); invocation from a second session while a venv-mutating op holds the workspace lock → `operation_in_progress` (FR-309); cancel during a running op → child process killed, workspace lock released (FR-310); op result content passes redaction (SC-304 unit level)
- [x] T005 [US1] Implement `runOperation(sessionId, operationId)` on `WorkflowEngine` (reuse lifecycle path: OperationEngine.execute + exposeOpResult + audit; per-session mutex per FR-307; workspace-level lock file for venv-mutating ops per FR-309; kill child process + release locks on session cancel/timeout per FR-310) and register the `run_operation` tool in `src/mcp-server/register-tools.ts` + handler — make T004 pass
- [x] T006 [US1] Add error codes `agent_invocation_denied`, `operation_in_progress` to `src/types/errors.ts` (recoverable) with registration-surface test update (exact-surface equality test per precedent ab985b9)

## Phase 3 — US2: Python pilot (P1)

**Goal**: fresh container verifies a Python workspace end-to-end (SC-301…SC-304).
**Independent test**: container E2E with the fixture workspace.

- [x] T007 [US2] Update `Dockerfile`: `apk add --no-cache python3` + install pinned `uv` binary before `USER node`; verify image builds and `uv --version` works as the `node` user
- [x] T008 [US2] Write failing container E2E test in `tests/integration/python-toolchain.e2e.test.ts` (skipped when Docker unavailable, mirroring http-transport test conventions): mount fixture workspace, start HTTP server, run `run_operation(toolchain-sync)` → succeeded (SC-301), `run_operation(test)` → real pytest verdict (SC-301), sync without `uv.lock` → fail-closed failure **and sync with stale lock (pyproject changed after lock) → fail-closed failure** (SC-303, `--locked` semantics), secret in pytest output redacted (SC-304), cross-session lock contention returns `operation_in_progress` (FR-309)
- [x] T009 [US2] Wire pilot operations in `examples/python-guidance/operations.json` into the example `workflow.json` (verify phase: lint/test/check required; toolchain-sync optional at understand.beforeEnter as documented alternative to on-demand) — make T008 pass
- [x] T010 [US2] Run full regression suite + typecheck + build (SC-305); fix fallout; verify no npm-path regressions in default profile (lint/test/build ops unchanged)

## Phase 4 — US3: Docs + release readiness (P2)

- [x] T011 [P] [US3] Section "Verification in other languages" in `servers/server-guidance/README.md`: bootstrap pattern, `invocableByAgent` semantics (advisory on-demand results vs authoritative phase gates), pilot Python profile usage, venv/Windows-host caveat, `--locked` fail-closed note (missing AND stale lockfile), chained-workflow note: set explicit `chain.featureId` when multiple features exist under `specs/` (FR-308, M2)
- [x] T012 [P] [US3] Add tracked follow-ups: scaffold language detection (`pyproject.toml` → Python default config) and named-volume venv persistence (option C) to `memory-bank/remaining-work-plan.md`
- [x] T013 [US3] Final review pass (Review Evidence Protocol), commit on feature branch `feature/guidance-toolchain-bootstrap`, merge to develop (rebase), update `memory-bank/activeContext.md` + `progress.md`
