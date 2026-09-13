# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-09-13

## What Works

- **Real Computing (2026-09-13, feature branch
  `feature/real-computing-stochastic`, commit 0d33ead)**: all five stochastic
  algorithms compute measured results — mdp value iteration (hand-checked
  V=[9,10] toy problem), mcts UCT gridworld (corridor → "right"), bandit
  with per-session runs via runId + measurable regret, hmm Viterbi/
  forward-backward (known weather path), bayesian GP-RBF + EI (proposes the
  quadratic maximum at x≈2.0). 41/41 tests, typecheck/build green; guide
  chain (template ↔ constant ↔ root AGENTS.md ↔ README) and funktionstest
  updated to the new semantics.
- `server-clear-thought`: ~28 reasoning tools registered individually and via
  4 toolsets (`reasoning`, `visualization`, `utility`, `session`).
- `server-clear-thought` hygiene (2026-09-12, branch
  `fix/clear-thought-hygiene`): dev.ts guard hardened (pathToFileURL;
  `npm run dev` verified — drvfs cold start can take >20 s), npm bin → stdio
  entry (`dist/dev.js`), README install path corrected (RB-6 closed); 78
  tests green.
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

- Review + merge `feature/real-computing-stochastic` (squash per AGENTS.md
  branch rules), then delete the branch; push so `test.yml` runs (covers the
  RB-7 residual check as well).
- Extension roadmap (`plans/extension-roadmap.md`, detail plan
  `plans/quality-distribution.md`): E1 RB-10 typed outputSchemas (central
  metadata registry), E2 npm publish `@paschbaer/*`, E3 eval harness; then
  roadmap tracks C (recipe runner), B (tool families), D (resources/prompts).
- Optional RB candidate: shared workspace HTTP scaffold for both servers
  (decisionframework option C, deferred).
- Periodic refresh of the GitNexus index after larger refactors
  (`gitnexus analyze --no-stats`; note: the GitNexus MCP server in the
  2026-09-13 session could not load the rebuilt index — CLI works).

(Stale entries removed 2026-09-13: stochastic McpServer migration — done via
RB-11; RB-5 — resolved; resolutions recorded in `remaining-work-plan.md`.)

## Current State

Stochastic HTTP-MCP is merged, pushed, deployed and docker-verified (live on
port 3001 with both tools). **Published to the Smithery registry with a perfect 100/100 quality score** (rescan 2026-09-13); clear-thought followed on 2026-09-13 (paschbaer/clear-thought, 33/33 tools registered, capability round shipped 2026-09-13: annotations/outputSchemas/param
  descriptions for all 33 tools; release 4b0dfb6a; rescan pending, expected
  ~96/100). Migrated to the high-level McpServer API (RB-11 resolved:
  zod single-source validation, declarative registration, 24/24 tests,
  release 381e940e)
(`paschbaer/stochasticthinking`, stdio bundle distribution — verified
download-only via API, 1 connection exists, 2026-09-12). CI: test workflow
added (RB-7 residual: verify runs after push). Resolved: RB-4, RB-5, RB-6,
RB-8, RB-9, RB-11. **Real Computing implemented on
`feature/real-computing-stochastic` (0d33ead)** — all five algorithms compute
measured results; pending review/merge. Next: merge the branch, then E-plan
Phase 1 (RB-10) per `plans/quality-distribution.md`.
