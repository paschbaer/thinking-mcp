# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-09-14

## What Works

- **Roadmap-Track B1 — Risiko-Familie (2026-09-14, branch `feature/risk-family`, 0.2.0)**:
  drei neue dual-mode Tools — `premortem` (Failure-Cause-Ranking + Mitigation-Coverage),
  `fmea` (RPN = S×O×D mit Threshold-Flagging), `fault_tree` (exakte AND/OR-Auswertung +
  Contribution-Ranking der Basic Events) — plus neues `risk`-Toolset (5. Toolset).
  Registry-Metadaten für alle 36 Tools; 103/103 Tests. Hand-verifizierte Werte:
  FMEA-RPN 120/40/24, Fault-Tree P_top 0.314 mit B3-Dominanz.
- **CI/CD-Release-Flow (2026-09-14, branch `develop`)**: GitFlow-light — `develop` ist der
  Entwicklungs-Branch (Test-Action läuft dort + auf PRs), Releases mergen `develop` → `main`;
  auf `main` publizieren `publish-npm.yml` (npmjs.com, version-guarded, --provenance) und
  `publish-containers.yml` (ghcr.io, latest+version+sha Tags, HTTP-Server-Images Port 3000).
- **E-Plan Phase 3, Tier 1 (2026-09-14, branch `feature/eval-harness`)**: contract evals in
  `tests/contracts.test.ts` — dual-mode sweep (concept_map/fishbone_diagram/issue_tree, die zuvor
  ungetestet waren), Toolset-Parität (individual ≡ toolset über reasoning/visualization/utility/
  session) und Session-Akkumulation. **Fand direkt einen shipped Bug**: session_export mit
  advertised outputSchema warf `-32602` (structuredContent fehlte für Array-/Markdown-Payloads) —
  gefixt in 0.1.2 (explizites structuredContent im Handler). 96/96 Tests.
- **npm publish (2026-09-14, E-Plan Phase 2)**: `@paschbaer/clear-thought@0.1.1` +
  `@paschbaer/stochasticthinking@0.1.1` live on npmjs.org (registry-verified,
  npx-ready; bin-guard fix `0c6daca` — 0.1.0 was a silent no-op via npx
  because bins run through .bin symlinks). READMEs document npx-based MCP
  client configs; npm-12/GAT-deprecation auth strategy recorded in the plan.
  ⚠️ clear-thought 0.1.1 enthält den session_export-Bug — 0.1.2 nach Merge publishen.
- **Shipping round 2026-09-14**: `main` pushed (head `94be80c`) — CI
  `test.yml` ran GREEN in Actions (RB-7 residual resolved). Clear-thought
  re-published to Smithery AFTER the RB-10 metadata merge: registry-driven
  titles/typed output schemas/honest hints now live in the registry release
  (rescan score pending). RB-10 code gap closed on main: TOOL_METADATA
  registry (33/33), central loop parametrized, 84/84 tests incl. 6 new
  metadata tests + audit script.
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

- Extension roadmap (`plans/extension-roadmap.md`, detail plan
  `plans/quality-distribution.md`): E1 RB-10 CLOSED (rescan 96/100) + E2 npm
  publish DONE (0.1.1 both, 2026-09-14); next E3 eval harness; then roadmap
  tracks C (recipe runner), B (tool families), D (resources/prompts).
- Optional (breaking, deferred): tool-name de-snake-casing to close the
  Smithery Naming gap (~4pt, see RB-9-history) — needs a major version.
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
download-only via API, 1 connection exists, 2026-09-12). **`main` pushed
2026-09-14 (head `94be80c`) — CI `test.yml` green (RB-7 residual resolved);
clear-thought re-published with the RB-10 metadata registry — rescan
96/100 (2026-09-14): RB-10 CLOSED.** Resolved: RB-4, RB-5, RB-6, RB-7, RB-8,
RB-9, RB-10, RB-11. Real Computing merged (`80be3d1`). **E-Plan Phase 2
done: both servers live on npm at 0.1.1** (Phase-2 branch
`feature/npm-publish` pending review/merge). Next: E-plan Phase 3 (eval
harness) per `plans/quality-distribution.md`.
