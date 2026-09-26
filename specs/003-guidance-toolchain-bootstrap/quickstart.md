# Quickstart: Guidance Toolchain-Bootstrap (Python pilot)

**Feature:** specs/003-guidance-toolchain-bootstrap · **Date:** 2026-09-24

## Prerequisites

- Docker (guidance image built from `servers/server-guidance/Dockerfile`
  including the new `python3` + `uv` layer)
- A Python workspace with `pyproject.toml` **and** a committed `uv.lock`
  (the sync is fail-closed on a missing **or stale** lockfile).

## 1. Start the container with your Python workspace

```bash
docker compose up -d   # mounts your project at /workspace, port 3003
curl -s http://localhost:3003/health
```

## 2. In your agent session (Guidance MCP connected)

```
start_workflow { workspaceRoot: "/workspace", request: "Implement feature X" }
→ accepted, sessionId: "…", currentPhase: "understand"
```

## 3. Bootstrap the Python toolchain (server-side, auditable)

```
run_operation { sessionId: "…", operationId: "toolchain-sync" }
→ { id: "toolchain-sync", status: "succeeded", summary: "…succeeded" }
```

- Installs exactly the pinned `uv.lock` into `/workspace/.venv`
  (`uv sync --locked` — missing or stale lockfile ⇒ structured failure,
  nothing installed; verified: `--frozen` would install a stale lock
  silently).
- Network use: PyPI. `riskClass: workspace_write`; deployers can force
  approval via `policies.json`.

## 4. Verify (real exit codes, judged by Guidance)

```
run_operation { sessionId: "…", operationId: "lint"  }   # uv run --locked ruff check .
run_operation { sessionId: "…", operationId: "test"  }   # uv run --locked pytest -q
run_operation { sessionId: "…", operationId: "check" }   # uv run --locked mypy .
```

During the `verify` phase these run as required lifecycle operations — the
workflow cannot complete unless they pass. On-demand results are advisory;
verification ops are also invocable via `run_operation` (e.g. to pre-check
before submitting the verify phase), and they run with `uv run --locked`,
so they never mutate the lockfile.

## Chained-Workflow note

When driving this feature through the Spec-Kit chained workflow, set the
explicit feature id — implicit discovery is ambiguous once multiple
features exist under `specs/`:

```
start_workflow { …, chain: { source: "spec_kit_tasks", featureId:
  "003-guidance-toolchain-bootstrap", … } }
```

## Notes

- **Host caveat:** `/workspace/.venv` contains Linux binaries; do not use it
  from the Windows host. If it was created/broken by a different platform
  (or by an interrupted sync), `uv` rebuilds it on the next
  `uv run --locked`.
- **Concurrency:** one toolchain operation at a time per session; venv-
  mutating ops serialize across sessions (workspace lock, FR-109); a
cancelled/timed-out sync kills the child process and releases the lock
(FR-110).
- **Adding another language** = (1) bootstrap tooling in the image,
  (2) `process` operations in `.guidance/operations.json`, (3) mark the
  bootstrap op `invocableByAgent: true`. No engine changes.
- **Not invocable:** every operation without `invocableByAgent: true`
  (including downstream MCP ops) rejects `run_operation` with
  `agent_invocation_denied`.
