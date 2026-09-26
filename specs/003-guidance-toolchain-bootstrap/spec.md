# Specification: Guidance Toolchain-Bootstrap

**Feature ID:** `003-guidance-toolchain-bootstrap`
**Parent:** specs/002-guidance-workflow-server (Guidance MCP server)
**Design sketch:** SDD/guidance-toolchain-bootstrap-specification.md
**Status:** Draft
**Date:** 2026-09-24

## Overview

Guidance currently verifies TypeScript workspaces: the container image ships
`node`/`npm`, and the default operations run `npm run lint|test|build`. This
spec introduces a **generic toolchain-bootstrap mechanism** so that projects
in other languages can be verified server-side inside the container — with
**Python/uv as the pilot implementation**.

The design keeps the trust boundary intact: the container receives
*bootstrap tooling* (language runtime + package manager binary), while
*project dependencies* are installed lazily, server-side, from the
workspace's lockfile. The coding agent may request a bootstrap and receives
its result; it can never execute verification itself nor fabricate the
verdict.

## User Stories

### US1: On-demand operation invocation (P1)

**As an** agent working in a Guidance session,
**I want** to invoke explicitly whitelisted configured operations on demand
via a `run_operation` tool,
**so that** preparatory steps (e.g. toolchain installation) can run at the
right moment through the server's trusted execution path instead of my own
shell.

**Acceptance:**
- `run_operation({ sessionId, operationId })` executes the configured
  operation through the same pipeline as lifecycle operations (policy,
  egress, validation, exposure, redaction, audit).
- Operations without `invocableByAgent: true` are rejected with
  `agent_invocation_denied` (fail-closed default).
- The result shape matches lifecycle operation results
  (`{ id, status, summary }`); failures are structured, never thrown.

### US2: Python toolchain bootstrap (P1, pilot)

**As an** agent working on a Python project in the Guidance container,
**I want** a `toolchain-sync` operation that installs the pinned toolchain
from `uv.lock` into `/workspace/.venv` and verification operations
(`lint`, `test`, `check`) that run via `uv run`,
**so that** Python verification is executed and judged by Guidance with
deterministic, lockfile-pinned tools.

**Acceptance:**
- Base image contains `python3` and a pinned `uv` binary; no project
  dependencies are baked into the image.
- `toolchain-sync` runs `uv sync --locked` (fail-closed on missing/stale
  lockfile) and is classified `riskClass: "workspace_write"`,
  `required: false`, `invocableByAgent: true`; its network use (PyPI) is
  documented in the operation description.
- `lint`/`test`/`check` run `uv run --locked ruff check .` /
  `uv run --locked pytest -q` / `uv run --locked mypy .` with
  `riskClass: "read_only"` and `invocableByAgent: true` (results are
  advisory; the authoritative verdict remains the verify-phase gate).
- A fresh container with only `pyproject.toml` + `uv.lock` in the workspace
  can be bootstrapped and verified end-to-end.

### US3: Language-agnostic extension (P2)

**As a** project maintainer,
**I want** the bootstrap mechanism to be defined generically,
**so that** additional languages (Rust, Node variants) require only image
tooling plus configuration — no engine changes.

**Acceptance:**
- The engine executes any `process` operation identically regardless of
  language; the spec documents the pattern (bootstrap op + verification ops).
- No server code changes are needed to support a new language beyond what
  US1 already delivers.

## Functional Requirements

- **FR-301** `run_operation` MCP tool: input `{ sessionId, operationId }`;
  session-bound execution; unknown session → existing session error
  contract; operation executed via `OperationEngine` with the operation's
  configured `workspaceRoot` context.
- **FR-302** Agent-invocation allowlist: `invocableByAgent` (optional
  boolean, default `false`) on operation configs; enforced fail-closed in
  the tool handler; rejection code `agent_invocation_denied` (recoverable).
- **FR-303** Identical pipeline: policy/egress evaluation, validation rules
  (`exitCodeMustBeZero`, `protocolRequestMustSucceed`, …), exposure modes,
  `redactUnknown()` seam, and audit events apply unchanged to
  `run_operation` executions; audit event `operation_invoked` records
  sessionId, operationId, outcome.
- **FR-304** Pilot operations (example profile `python-guidance`):
  `toolchain-sync` (`uv sync --locked`), `lint` (`uv run --locked ruff
  check .`), `test` (`uv run --locked pytest -q`), `check` (`uv run
  --locked mypy .`); venv location `/workspace/.venv`; `--locked`
  guarantees fail-closed behavior on missing AND stale `uv.lock`
  (empirically verified: `--frozen` installs a stale lock silently,
  `--locked` fails).
- **FR-305** Base image: `python3` + a **version-pinned** `uv` binary in
  the guidance image; no project dependencies baked; non-root user
  unchanged.
- **FR-306** Example profile `examples/python-guidance/`: full
  `.guidance/` set (workflow, responses, operations, policies) wiring the
  pilot operations into the default 7-phase workflow.
- **FR-307** Concurrency (per session): at most one `run_operation`
  execution per session at a time (per-session mutex, reuse existing lock
  infrastructure); concurrent invocation returns `operation_in_progress`
  (recoverable).
- **FR-308** Documentation: README section "Verification in other
  languages" covering the bootstrap pattern, the `invocableByAgent` flag,
  and the venv/host-incompatibility caveat (Linux binaries on a Windows
  host bind mount; `uv` rebuilds on next sync).
- **FR-309** Concurrency (cross-session): toolchain operations that mutate
  the shared venv (`toolchain-sync`, and any `uv run --locked` op with
  sync side effects) serialize across sessions via a workspace-level lock
  file; invocation from a second session while the lock is held returns
  `operation_in_progress` (recoverable).
- **FR-310** Interruption: when a session is cancelled or an operation
  times out, the server kills the child process and releases the
  workspace lock (no orphaned lock). A venv left inconsistent by an
  interrupted sync self-heals on the next `uv run --locked` (uv rebuilds
  the environment from the lockfile).

## Success Criteria

- **SC-301**: Fresh container, workspace containing only
  `pyproject.toml` + `uv.lock` + source: `run_operation(toolchain-sync)` →
  succeeded; `run_operation(test)` → executed pytest with real exit-code
  verdict; no `npm` invocation involved.
- **SC-302**: `run_operation` on an operation without `invocableByAgent`
  (including all downstream MCP ops) → `agent_invocation_denied`, no
  execution, audit event recorded.
- **SC-303**: `toolchain-sync` without `uv.lock`, or with a **stale**
  `uv.lock` (pyproject changed after lock) → operation failed with a clear
  message; nothing installed (fail-closed; `--locked` semantics).
- **SC-304**: A secret appearing in pytest/ruff output (e.g. in a fixture)
  is redacted before the agent sees it (redaction seam, language-independent).
- **SC-305**: Full existing suite stays green (regression: lifecycle ops,
  policy, exposure unchanged).

## Assumptions

- `uv` manages venv creation/repair itself; container has network access to
  PyPI when `toolchain-sync` runs (deployment concern, documented).
- Windows-host bind-mount incompatibility of `.venv` is accepted (option A
  decision); a named-volume variant is future work.
- Scaffold language detection (auto-generating Python default config when
  `pyproject.toml` exists) is out of scope — tracked follow-up.

## Out of Scope

- Scaffold/profile auto-detection per language.
- Persisting venvs outside the workspace (named volumes).
- Remote-mode `awaiting_client` downstream execution (separate spec, L305d).
- Baking project toolchains into the image.

## Identifier Alias Table (TRACK-NS, spec 005)

The FR/SC numbers of this spec were renumbered (spec 005, TRACK-NS) to
resolve the collision with amendments 001/002 of spec 002:

| Alt | Neu | | Alt | Neu |
|---|---|---|---|---|
| FR-101 | FR-301 | | SC-001 | SC-301 |
| FR-102 | FR-302 | | SC-002 | SC-302 |
| FR-103 | FR-303 | | SC-003 | SC-303 |
| FR-104 | FR-304 | | SC-004 | SC-304 |
| FR-105 | FR-305 | | SC-005 | SC-305 |
| FR-106 | FR-306 | | | |
| FR-107 | FR-307 | | | |
| FR-108 | FR-308 | | | |
| FR-109 | FR-309 | | | |
| FR-110 | FR-310 | | | |

Historical references in memory-bank and code comments keep the old ids.
