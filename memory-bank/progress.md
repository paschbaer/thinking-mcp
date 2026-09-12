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
- `server-stochasticthinking`: rebuilt to the clear-thought HTTP architecture
  (merged to `main`) — session factory + zod config, Streamable HTTP server
  (port 3001, `/health`, graceful shutdown), stdio dev entry, `agents_guide`
  tool (full/merge), vitest suite (24 tests incl. agents_guide), live
  funktionstest (6 checks), Docker image built and runtime-verified (RB-4
  closed: healthy container, full MCP round-trip on mapped port 3002).

## What's Left

- Optional follow-up: migrate stochastic low-level `Server` to high-level
  `McpServer` (out of scope for the HTTP rebuild, see
  `plans/stochastic-http-mcp.md`).
- Optional RB candidate: shared workspace HTTP scaffold for both servers
  (decisionframework option C, deferred).
- RB-5: stale `@waldzellai` Smithery scope references in the stochastic README
  (verify publish scope first).
- Periodic refresh of the GitNexus index after larger refactors
  (`gitnexus analyze --no-stats`).

## Current State

Stochastic HTTP-MCP is merged, pushed, deployed and docker-verified: the live
server on port 3001 serves `stochasticalgorithm` + `agents_guide` (verified
2026-09-12), and the Docker image passed build + runtime checks (RB-4).
Remaining tracked items: RB-5 only.
