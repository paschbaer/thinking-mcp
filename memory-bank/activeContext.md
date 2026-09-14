# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

**Last updated:** 2026-09-14

## Current Focus

- **Real Computing implemented on `feature/real-computing-stochastic`**
  (2026-09-13, commit 0d33ead): all five stochastic algorithms compute real,
  measured results — mdp value iteration, mcts UCT gridworld, bandit with
  per-session run state (runId continuation, measurable regret), hmm
  Viterbi/forward-backward, bayesian GP-RBF + Expected Improvement. Honesty
  note replaced by "Reading the results" semantics (template ↔ constant ↔
  root AGENTS.md via real handler ↔ README). 41/41 tests, typecheck/build
  green. Roadmap: track A of `plans/extension-roadmap.md`.
- State 2026-09-14: Real Computing merged (`80be3d1`) + RB-10 registry merged
  (`94be80c`); `main` pushed, CI `test.yml` GREEN (RB-7 residual resolved);
  clear-thought re-published — **rescan 96/100: RB-10 CLOSED** (output
  schemas + annotations now score 33/33; residual ~4pt = Naming, deferred
  breaking rename).
- State 2026-09-14 (III): **Phase 3 Tier 1 implementiert** (branch
  `feature/eval-harness`): contract evals + session_export-Bugfix (0.1.2) —
  pending review/merge + npm republish.
- Next: merge `feature/eval-harness`, clear-thought 0.1.2 auf npm publishen
  (User-Terminal, Web-2FA); danach Tier 2 (LLM-Task-Evals, optional) oder
  Roadmap-Tracks C/B/D.
- Stochastic server fully shipped: merged, pushed, deployed, docker-verified,
  **published on the Smithery registry** (`paschbaer/stochasticthinking`,
  stdio bundle — download/install distribution; run.tools hosting is
  remote-only, RB-8 resolved with evidence). (2026-09-14: all `main` commits
  pushed; RB-7 residual resolved via green CI run.)

## Recent Changes

- 2026-09-14 (III): GitFlow-light CI — `develop`-Branch angelegt (Test-Action dort),
  `publish-npm.yml` (npmjs.com, version-guarded, provenance) +
  `publish-containers.yml` (ghcr.io) für Release-Merges nach `main`;
  Root-README Publishing-Abschnitt erweitert.
- 2026-09-14 (II): npm publish round (E-Plan Phase 2, branch
  `feature/npm-publish`): package hygiene + dry-run audits; first publish
  0.1.0 (stochastic silently failed); bin-guard bug found via npx
  verification (0.1.0 was a silent no-op through .bin symlinks) and fixed
  (`0c6daca`) → **0.1.1 both live on npm**; READMEs switched to npm-first
  (npx configs); npm-12/GAT-deprecation auth strategy recorded in the plan.
- 2026-09-14: Shipping round — RB-10 branch reviewed + squash-merged
  (`94be80c`: TOOL_METADATA registry 33/33, central loop parametrized, 84/84
  tests incl. metadata suite + audit script); `main` pushed (3 commits) with
  CI `test.yml` GREEN → RB-7 residual resolved; clear-thought re-published
  to Smithery with registry metadata; rescan 96/100 (2026-09-14) → RB-10
  CLOSED.
- 2026-09-13: Real Computing round (feature branch `feature/real-computing-stochastic`,
  commit 0d33ead): new `src/algorithms/*` modules (rng/mdp/mcts/bandit/hmm/
  bayesopt + dispatcher), handler rewired (details payload, per-algorithm zod
  validation, honest annotations idempotentHint=false), bandit run store per
  session (runId continuation, measurable regret); guide chain regenerated
  (AGENTS.template.md ↔ template constant ↔ root AGENTS.md via real tool
  handler ↔ README), funktionstest on real params + run continuation.
  41/41 tests. Lesson: direct module calls bypass zod defaults (see
  lessonsLearned).
- 2026-09-13: Docs commit fe181f2 on main: extension roadmap (tracks A–E,
  `plans/extension-roadmap.md`) + detailed E-plan
  (`plans/quality-distribution.md`; RB-10 registry → npm publish → eval
  harness).
- 2026-09-13: clear-thought published to Smithery (paschbaer/clear-thought,
  created + released + record patched; 33/33 tools registered). Tooling:
  scripts/build-mcpb.mjs (runtime metadata capture) + publish-smithery.mjs.
  RB-10 tracks the pending score rescan and the annotations/outputSchema
  gap on high-level tools.
- 2026-09-12: First Smithery publish of `paschbaer/stochasticthinking`
  succeeded via the v4 API (correct StdioDeployPayload: type/runtime/
  configSchema + bundle upload; deployment SUCCESS, deploymentId
  `b6e38872-…`). The legacy CLI `deploy` path no longer exists in Smithery
  CLI v4 — workflow deploy job is dead code. Hosted run.tools endpoint 404
  in verification window → RB-8 (dashboard check pending).
- 2026-09-12: Hygiene round (`fix/clear-thought-hygiene`): clear-thought dev
  guard hardened (pathToFileURL; `npm run dev` verified — drvfs cold start
  can take >20 s), npm bin → `dist/dev.js`, README install references
  corrected (RB-6 closed), stochastic package version aligned to 0.1.0.
- 2026-09-12: RB-4 closed: stochastic Docker image built via Docker Desktop
  (WSL integration enabled for the Debian distro); container healthy on
  3002→3000, `/health` + both MCP tools green over the mapped port; container
  cleaned up.
- 2026-09-11: agents_guide parity implemented in the stochastic server (low
  level `Server`): embedded `AGENTS_TEMPLATE` (auto-generated from
  `AGENTS.template.md`, sync-tested), `agents_guide` tool with full/merge
  mode touching only `stochastic-thinking` markers, 24/24 tests; root
  `AGENTS.md` stochastic block regenerated through the real tool handler.
- 2026-09-11: Created `AGENTS.md` via `agents_guide` tool (Thinking-MCP
  context), customized project-specific conventions section.
- 2026-09-11: Created `memory-bank/` with the 8 base files.
- 2026-09-11: Agent-guide parity for stochastic: `AGENTS.template.md` shipped
  (package.json files), README expanded (client config, Agent Guide section),
  root `AGENTS.md` gained an initialized stochastic guide block between
  `stochastic-thinking:agents-guide:start/end` markers (regeneration-safe).
- 2026-09-11: Feature review of `feature/stochastic-http-mcp`: 1 HIGH + 3 MED
  findings fixed (`.dockerignore` ported; dev/server direct-execution guards
  via `pathToFileURL` + `.catch`; smithery `startCommand` → `dist/dev.js` with
  debug configSchema; `app` export + guarded listen enables HTTP unit test —
  16/16 tests green).
- 2026-09-11: Stochastic HTTP-MCP rebuild (phases 0–5) on
  `feature/stochastic-http-mcp`: SDK 1.30 spike, clear-thought parity deps/
  tsconfig/scripts, session factory + config, HTTP server (/health, port 3001,
  graceful shutdown), vitest 15/15 + live funktionstest 6/6, Dockerfile ported
  (docker verify pending, RB-4), READMEs + root docker script updated.
- 2026-09-11: Removed volatile GitNexus stats from AGENTS.md/CLAUDE.md via
  `gitnexus analyze --no-stats`; `--no-stats` is now the mandatory repo command
  (documented in Architecture Map, techContext, lessonsLearned).

## Next Steps

1. Run docker build/run verification for the stochastic image when a docker
   daemon is available (RB-4 in `remaining-work-plan.md`).
2. Review `feature/stochastic-http-mcp` and merge (squash per AGENTS.md
   branch rules), then delete the branch.
3. Wire memory-bank workflow into daily use: read all files before tasks,
   update `activeContext.md` + `progress.md` + `lessonsLearned.md` at session end.
4. Review open follow-ups in `remaining-work-plan.md` when starting new scopes.
5. Candidate work items: see `progress.md` → "What's left".

## Open Questions

- MCTS "Agent-as-Environment" contract vs. built-in environments only
  (roadmap open question #2).
- Smithery rescan score for the stochastic server after the guide updates.
