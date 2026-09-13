# Remaining Work Plan — Thinking-MCP

> Tracked follow-ups. Every unresolved review finding (any severity) must be
> persisted here AND in `activeContext.md` before a scope is closed
> (AGENTS.md → Findings Lifecycle Rule).
>
> Entry format:
> `[ID] severity | finding | trigger point | status (action required / accepted with rationale)`

## Tracked Follow-ups

- [RB-10] LOW (pending rescan) | clear-thought published to Smithery:
  paschbaer/clear-thought created (PUT /servers 201), release 954d7892
  (202/SUCCESS), record PATCHed; registry lists 33/33 tools with
  descriptions. Quality score: first rescan 2026-09-13 = 75/100 (Descriptions 33/33,
  Metadata 35/35, Config 25/25; params 15/33, outputSchemas 0/33,
  annotations 0/33 — the quantified RB-10 gap). Known gap vs 100/100:
  annotations + outputSchemas are not set on the 33 high-level tools (code
  change across ~25 register calls); 8 tools have params without
  descriptions. | trigger: next Smithery dashboard visit | action required:
  read the rescan score; decide whether to add annotations/outputSchemas to
  all tools.
- [RB-9] RESOLVED 2026-09-13 | Smithery quality score reached 100/100 (was
  28/100): Capability 40/40, Server Metadata 35/35, Configuration UX 25/25.
  Fix chain: full tool metadata in code + serverCard publishing + server
  record PATCH (displayName/homepage/iconUrl/license). Reusable publisher:
  scripts/publish-smithery.mjs (record PATCH included).
- [RB-9-history] LOW | Smithery capability score 68→40/40 capability achieved via
  serverCard publishing; server record metadata (displayName, homepage,
  iconUrl, license) set 2026-09-13 via PATCH /servers/{qn} (card-only fields
  did not move the metadata score). Awaiting quality rescan. Reusable
  publisher: scripts/publish-smithery.mjs. Remaining gap: Naming ~6pt
  (agents_guide snake_case, breaking rename deferred).
- [RB-2] LOW | `AGENTS.md` root file mixes hand-written project rules and the
  generated guide; regeneration via `agents_guide` merge mode must be used to
  avoid losing hand-written sections | trigger: any template change in
  `src/tools/agents-guide-template.ts` | action required: regenerate via
  merge mode, never overwrite manually.
- [RB-3] MED | GitNexus-generated "Index stale?" hint inside the
  `<!-- gitnexus:start/end -->` block of AGENTS.md/CLAUDE.md recommends
  `node .gitnexus/run.cjs analyze` WITHOUT `--no-stats`; an agent following it
  verbatim reintroduces volatile counts (post-commit review 0441c70,
  pre-existing/tool-generated). Mitigated by the Architecture Map mandate +
  lessonsLearned entry. | trigger: any future `gitnexus analyze` run or GitNexus
  CLI upgrade | accepted observation with mitigation; optional hardening:
  wrapper in `.gitnexus/run.cjs` that injects `--no-stats`, or upstream
  flag support.
- [RB-8] RESOLVED 2026-09-12 | First Smithery publish of
  `paschbaer/stochasticthinking` succeeded (API: PUT /releases, stdio/node,
  deploymentId `b6e38872-…`, status SUCCESS, mcpUrl
  `https://stochasticthinking--paschbaer.run.tools`) but the hosted endpoint
  returned 404 | verified via API: `remote: false`, `deploymentUrl: null` —
  stdio MCPB bundles are download/install-only on Smithery; the run.tools
  hosted path applies to remote/URL servers only. 1 connection already
  exists. Note: v4 CLI has no `deploy` command (dashboard/API publishing
  only); workflow smithery.yml deploy job is therefore dead code (see RB-7).
- [RB-7] LOW (residual) | CI implemented 2026-09-12: `test.yml` (node 20,
  corepack yarn 4.6.0, immutable install, build + test across workspaces;
  triggers: push to main, PRs, manual) and `smithery.yml` bumped to node 20 +
  actions v4. Remaining: verify both workflows run green in GitHub Actions
  after the next push, and confirm the Smithery deploy job succeeds (no `gh`
  CLI in the WSL session — check the Actions tab in the browser). | trigger:
  next `git push` | action required: check the Actions tab for test.yml and
  the Smithery deploy run.

## Resolved / Reclassified

- [RB-6] RESOLVED 2026-09-12 | stale npm/Smithery references in the
  clear-thought README (badge `@waldzellai/clear-thought`, npm/npx install for
  a 404 scope) | fact check like RB-5; README now documents from-source
  install + planned publishing. Related hardening in the same round:
  `src/dev.ts` guard switched to `pathToFileURL` (robust against relative
  argv paths incl. tsx; `npm run dev` verified to start — drvfs cold start
  can take >20 s) and npm bin corrected to the stdio entry (`dist/dev.js`).
- [RB-5] RESOLVED 2026-09-12 | stochastic README referenced stale npm/Smithery
  scopes | fact check: npm `@paschbaer/stochasticthinking` = 404,
  `@waldzellai/stochasticthinking` = 0.0.1 (stale upstream), Smithery has no
  server page under either scope | README reworked: dead badge, Smithery
  install command and npm/npx instructions removed; from-source install added
  as the only documented path; publishing declared as planned (npm `@paschbaer`
  scope + `npm run deploy`); stdio MCP client example switched to a local
  `node dist/dev.js` path.
- [RB-4] RESOLVED 2026-09-12 | Docker build/run of the stochastic HTTP image
  was unverified | verified via Docker Desktop after enabling WSL integration
  for the Debian distro: image build ok, container on `-p 3002:3000` healthy
  (docker HEALTHCHECK, 0 failing streaks), `/health`, initialize, session
  header, `tools/list` (both tools), `agents_guide` full mode and
  `stochasticalgorithm` round-trip green over the mapped port. Container
  cleaned up afterwards.
- [RB-1] RESOLVED 2026-09-11 | stochastic server was a skeleton (`src/index.ts`
  only, no tests, no HTTP) | fixed by the HTTP-MCP rebuild on
  `feature/stochastic-http-mcp` (phases 0–5): factory + zod config, stdio dev
  entry, Streamable HTTP server with /health, vitest suite (15 tests), live
  funktionstest (6 checks), Docker recipe ported from clear-thought.
