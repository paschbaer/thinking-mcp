# Guidance Toolchain-Bootstrap

## Design Sketch — On-demand, server-side verification toolchains

**Status:** Draft
**Version:** 1.0.0
**Project:** Guidance (`servers/server-guidance`)
**Full spec:** `specs/003-guidance-toolchain-bootstrap/` (spec-kit style, chained-workflow input)
**Document language:** English

---

## 1. Problem

The Guidance container ships a Node toolchain (`node:22-alpine`); verification
operations (`lint`, `test`, `build`) are `npm`-based `process` operations.
Projects in other languages (pilot: Python) cannot be verified inside the
container. Two extreme fixes exist — bake every toolchain into the image
(image bloat, maintenance) or let the agent run tools in its own shell
(breaks the trust model: the agent becomes the source of exit codes, the
fabricated-evidence hole documented in the EMMS spec review).

## 2. Decision — the pragmatic middle

The **container gets bootstrap tools, not project toolchains**:

```text
Base image (pinned):     node + python3 + uv binary     (no project deps)
Workspace (mounted):     pyproject.toml + uv.lock       (source of truth)
Server-side install:     toolchain-sync  →  uv sync --locked    (into /workspace/.venv)
Server-side verification: lint/test/check →  uv run --locked ruff/pytest/mypy
Evaluation + evidence:   Guidance OperationEngine (exit code, exposure, audit)
```

The trust boundary is unchanged: **installation is lazy, execution and
verdict stay server-side.** The agent may *request* a bootstrap, never
*fabricate* its result.

## 3. Mechanism

### 3.1 New MCP tool: `run_operation` (on-demand)

- Executes a configured operation outside lifecycle hooks.
- **Fail-closed allowlist**: an operation is agent-invocable only when it
  declares `invocableByAgent: true` (new optional flag; default `false`).
  Unknown/unmarked operations → `agent_invocation_denied`.
  **Decision (H1a):** the pilot verification ops (`lint`/`test`/`check`)
  are invocable too — their results are advisory for the agent; the
  authoritative verdict remains the lifecycle execution in the verify
  phase, which gates completion.
- Reuses the existing execution pipeline unchanged: policy/egress
  evaluation, validation (`exitCodeMustBeZero`, …), exposure
  (`returnToAgent`), redaction (`redactUnknown`), audit logging.
- Input: `{ sessionId, operationId }` (session-bound for audit + workspace
  resolution). Response: `{ id, status, summary }` (same shape as lifecycle
  op results).

### 3.2 Pilot operation: `toolchain-sync`

```json
"toolchain-sync": {
  "description": "Install the pinned Python toolchain (network: PyPI).",
  "type": "process", "executable": "uv", "args": ["sync", "--locked"],
  "required": false, "timeoutSeconds": 900,
  "riskClass": "workspace_write", "invocableByAgent": true,
  "validation": { "exitCodeMustBeZero": true },
  "output": { "returnToAgent": "summary_and_errors" }
}
```

- `--locked` is **fail-closed**: a missing **or stale** `uv.lock`
  (pyproject changed after lock) fails the sync instead of installing
  anything. Verified empirically: with a stale lock, `uv sync --frozen`
  succeeds silently while `uv sync --locked` fails.
- venv lives in `/workspace/.venv` (option A). Documented tradeoff: the
  venv contains Linux binaries and is unusable on a Windows host bind mount;
  `uv` detects and rebuilds a mismatched/corrupt venv on the next sync.
- `uv run --locked <tool>` (used by the verification ops) never mutates the
  lockfile and fails on a stale lock. Caveat (M2b): on a missing/empty
  venv it still installs packages from the lockfile (incl. network) —
  the explicit, approval-capable bootstrap step remains `toolchain-sync`;
  run it first. With a bootstrapped venv, verification touches nothing
  outside it.
- **Cross-session safety (FR-109/FR-110):** toolchain operations serialize
  across sessions via a workspace-level lock file; cancellation/timeout
  kills the child process and releases the lock. A venv left inconsistent
  by an interrupted sync self-heals on the next `uv run --locked`.

### 3.3 Language-agnostic shape

No engine changes per language. A new language = (1) bootstrap tools in the
base image, (2) `process` operations in `.guidance/operations.json`, (3)
optionally an example profile. Rust (`cargo`), Node variants etc. follow the
identical pattern.

## 4. Changes required

| Area | Change | Type |
|---|---|---|
| `Dockerfile` | `apk add python3` + install `uv` binary | config |
| `src/types`, `src/config.ts` | `invocableByAgent` flag in OperationConfig + strict schema | code (small) |
| `src/mcp-server` | `run_operation` tool registration + handler | code (small) |
| `examples/python-guidance/` | full profile: workflow, ops (`toolchain-sync`, `lint`, `test`, `check` via `uv run`) | config |
| README | "Other languages" section + venv caveat | docs |

Out of scope (tracked follow-ups): scaffold language detection
(`pyproject.toml` → Python default config), named-volume venv persistence
(option C), remote-mode `awaiting_client` downstream spec.

## 5. Security notes

- `toolchain-sync` performs **network egress + supply-chain exposure**
  (installs code from PyPI). Classified `workspace_write`; approval can be
  forced per deployment via `policies.json` risk-class approval.
- **Stale-lock bypass**: mitigated by `--locked` semantics (fail-closed on
  missing/stale lockfile; empirically verified — see §3.2).
- `invocableByAgent` is opt-in per operation: the agent can never invoke
  arbitrary configured operations (e.g. not the downstream MCP ops).
- Verification outputs pass the existing redaction seam before any
  agent-facing use — language-independent.
