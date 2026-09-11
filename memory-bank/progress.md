# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-09-11

## What Works

- `server-clear-thought`: ~28 reasoning tools registered individually and via
  4 toolsets (`reasoning`, `visualization`, `utility`, `session`).
- Session state with per-domain stores; `session_info` / `session_export` /
  `session_import` for persistence.
- vitest test suites in `servers/server-clear-thought/tests/` (incl.
  `agents-guide` template-sync test).
- `agents_guide` tool generates project `AGENTS.md` (full + merge modes,
  marker-based in-place updates).
- Docker + Smithery packaging for clear-thought; yarn/npm workspaces build.
- GitNexus code index (`thinking-mcp`), analyzed with `--no-stats` convention.
- Root `AGENTS.md` + `memory-bank/` governance structure.
- `server-stochasticthinking` (branch `feature/stochastic-http-mcp`): rebuilt
  to the clear-thought HTTP architecture — session factory + zod config,
  Streamable HTTP server (port 3001, `/health`, graceful shutdown), stdio dev
  entry, vitest suite (15 tests), live HTTP funktionstest (6 checks), Docker
  recipe ported (build pending daemon, RB-4).

## What's Left

- RB-4: Docker build/run verification for the stochastic HTTP image
  (needs a running docker daemon in WSL).
- Optional follow-up: migrate stochastic low-level `Server` to high-level
  `McpServer` (out of scope for the HTTP rebuild, see
  `plans/stochastic-http-mcp.md`).
- Optional RB candidate: shared workspace HTTP scaffold for both servers
  (decisionframework option C, deferred).
- Periodic refresh of the GitNexus index after larger refactors
  (`gitnexus analyze --no-stats`).

## Current State

Stochastic HTTP-MCP rebuild (Option B) implemented on
`feature/stochastic-http-mcp` (phases 0–5), all verification green except the
Docker daemon check (RB-4). Awaiting review + merge to `main`.
