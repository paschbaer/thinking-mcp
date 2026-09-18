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
  descriptions. Quality score: first rescan 2026-09-13 = 75/100. Capability round shipped
  2026-09-13 (release 4b0dfb6a): central tool.update() enhancement adds
  annotations + passthrough outputSchema + structuredContent to all tools;
  param descriptions completed (33/33). Expected score after rescan: ~96/100. (Descriptions 33/33,
  Metadata 35/35, Config 25/25; params 15/33, outputSchemas 0/33,
  annotations 0/33 — the quantified RB-10 gap). Known gap vs 100/100:
  annotations + outputSchemas are not set on the 33 high-level tools (code
  change across ~25 register calls); 8 tools have params without
  descriptions. | trigger: next Smithery dashboard visit | action required:
  read the rescan score; decide whether to add annotations/outputSchemas to
  all tools. Detailed elaboration: `plans/quality-distribution.md` (Phase 1;
  chosen strategy: central metadata registry — decisionframework
  `rb10-schema-strategy-2026-09-13`, Option B).
  UPDATE 2026-09-14 (branch `feature/rb10-typed-output-schemas`, commit
  17c3f76): code gap CLOSED via the central metadata registry
  (`src/tools/tool-metadata.ts`, 33/33 entries — human-readable titles, typed
  output schemas with evidenced optional top-level fields + passthrough,
  honest idempotentHint=false for 16 stateful tools) applied by the central
  `tool.update()` loop. Audit script (`scripts/audit-tool-metadata.ts`):
  generic titles 33→0, passthrough outputs 33→0, undescribed params 0→0.
  Completeness/round-trip tests added; 84/84 green.
  UPDATE 2026-09-14: squash-merged to `main` (`17c3f76`) and re-published to
  Smithery (user-confirmed via scripts/publish-smithery.mjs). Remaining to
  close: dashboard rescan score → record it here.
  RESOLVED 2026-09-14: rescan score **96/100** (was 75 at the 2026-09-13
  first rescan). Capability 36/40 — Descriptions 33/33 (10.37pt), Param
  descriptions 33/33 (8.89pt), Output schemas 33/33 (10.37pt, was 0),
  Annotations 33/33 (5.93pt, was 0), Naming 4.44pt; Server Metadata 35/35;
  Config UX 25/25. Residual ~4pt = Naming (snake_case tool names, breaking
  rename deferred — tracked in RB-9-history). RB-10 CLOSED.
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
  UPDATE 2026-09-15: rename EXECUTED in 1.0.0 (all 12 compact-lowercase names
  → snake_case, branch feature/snake-case-rename merged to develop) and
  published — rescan result: **Naming STILL 4.44pt (unchanged)**. Hypothesis
  "snake_case closes the gap" FALSIFIED; scoring rule unknown. RESOLVED AS
  ACCEPTED: 96/100 is the practical ceiling without another breaking rename
  toward an unknown target — do not retry.
- [RB-2] LOW | `AGENTS.md` root file mixes hand-written project rules and the
  generated guide; regeneration via `agents_guide` merge mode must be used to
  avoid losing hand-written sections | trigger: any template change in
  `src/tools/agents-guide-template.ts` | action required: regenerate via
  merge mode, never overwrite manually.
- [RB-3] MED | GitNexus-generated "Index stale?" hint inside the
  `<!-- gitnexus:start/end -->` block of AGENTS.md/CLAUDE.md recommends
  `node .gitnexus/run.cjs analyze` WITHOUT `--no-stats`; an agent following it
  verbatim reintroduces volatile counts (post-commit review 328ca16,
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
- [RB-7] LOW (residual) | CI: `test.yml` added 2026-09-12 (node 20, immutable
  install, build + test across workspaces). The `smithery.yml` deploy workflow
  was REMOVED 2026-09-13 (revert `ci/retire-smithery-deploy` to restore): the
  v4 CLI has no `deploy` command, `auth login` is a browser-interactive flow
  (CI log: auth_url + Session expired) and the SMITHERY_TOKEN secret is unset
  — the job could never succeed. Publishing happens via
  scripts/publish-smithery.mjs against the documented API. Remaining: verify
  `test.yml` runs green in the Actions tab after the next push. | trigger:
  next `git push` | action required: check the Actions tab for test.yml and
  the Smithery deploy run.
  UPDATE 2026-09-14: RESOLVED — `main` pushed (head `17c3f76`); user
  confirmed `test.yml` GREEN in the Actions tab.

## Resolved / Reclassified

- [RB-11] RESOLVED 2026-09-13 | stochastic migrated to the high-level
  McpServer API (squash 0fae6d4): zod shapes as single source of truth
  (validation/JSON schema/typed args), registerTool with annotations +
  outputSchema + structuredContent, declarative agents-guide registration,
  scripts capture tool metadata at runtime; tests updated to the SDK
  validation-error convention (isError results, not rejections); release
  381e940e republished (SUCCESS). Verified: typecheck, build, 24/24 tests.
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

- [EV-1] MEDIUM | Eval Run 2 (easy tasks, glm-5.3 Actor+Judge): alle Tasks
  Δ = 0 — Selbst-Bias-Konfounder + zu leichte Tasks | trigger: nächste
  Eval-Messung | action required: Run 3 mit `evals/tasks-hard.json`
  (Ground-Truth-Rubrics) und unabhängigem Judge (`EVAL_JUDGE_MODEL` +
  `EVAL_JUDGE_BASE_URL`/`EVAL_JUDGE_API_KEY` auf anderen Provider); rig ist
  gebaut (Branch `feature/harder-evals-actor-judge-split`), needs API keys + Go.

- [EV-2] FIXED 2026-09-15 (review finding, was MEDIUM) | Bandit-Rubrik-Konstanten
  (regret 16.14, pulls 31/13/96, mean 0.271) waren seed-locked ohne Regressionsschutz
  — RNG-Änderung würde Rubrik still invalidieren | **Behoben mit Pinning-Test**
  `tests/algorithms.test.ts` (thompson/seed 7, 80+60 via createBanditRun/runBanditCall,
  exakte Assertions; 17/17 grün). Trigger falls er rot wird: Rubrik-Ground-Truth in
  tasks-hard.json per echten Tool-Läufen regenerieren, bevor ein Eval-Lauf gewertet wird.
- [EV-3] FIXED 2026-09-15 (review findings, LOW) | Runner-Argument-Guards
  (`--max-tasks` NaN → exit 2 statt still „alle Tasks"; `--tasks` ohne Wert → exit 2
  statt TypeError), Judge-Antwort-Cap 6000→12000 Zeichen, stdio-Transport-Cleanup bei
  fehlgeschlagenem connect, Game-Matrix-Rubrik: `chaotic` wird auch von `aggressive`
  dominiert (beide Begründungen jetzt als korrekt akzeptiert).
- [EV-4] ACCEPTED with rationale (review NIT) | Self-Bias-Warnung vergleicht volle
  URLs — gleiches Modell hinter URL-Alias/Proxy wird nicht erkannt; dokumentiertes
  Heuristik-Verhalten. `chat()` gibt bei attempts<=0 undefined zurück — mit aktuellen
  Call-Sites (3/1) unerreichbar, latenter Kontrakt-Wartezustand. | trigger: falls
  Proxy-basierte Judge-Setups genutzt werden, Heuristik auf Hostnormalisierung ausbauen.
- [EV-5] ACCEPTED with rationale (infra, pre-existing) | `bin-invocation.test.ts`
  (npx-Symlink-Startup-Probe) ist lastempfindlich auf drvfs: isoliert grün
  (58,5 s Testzeit — Probe-Fenster knapp), in Full-Suite unter Parallel-Last 2× rot.
  Nicht durch diesen Diff verursacht (kein src/dist-Change). | trigger: falls in CI
  (natives Linux, kein drvfs) rot → echt untersuchen; lokal: fokussiert nachlaufen
  lassen, bevor ein Regression angenommen wird.

- [EV-1] RESOLVED 2026-09-15 | Run 3 mit tasks-hard.json + unabhängigem Judge
  (glm-5.3-flash Actor [thinking off] ↔ glm-5.3 Judge) ausgeführt: Δ +11 Bandit /
  +2 Fault-Tree / 0 Fermi / −4 Game (Transcribe-Slip). Hard Set differenziert wie
  konzipiert — der statefulle Bandit-Task ist der saubeste Tool-Wert-Nachweis.
- [EV-6] MEDIUM (neu, Run 3) | Scoring-Anzeige-Bug: Judge-Rohsumme (max 16 bei
  4 Kriterien) wird gegen gewichtetes rubricMax (40) ins Report geschrieben —
  Prozentangaben deflationiert, Deltas unverändert valide | trigger: vor Run 4 |
  action required: total = Σ score×weight im Runner rechnen; Kompatibilität zu
  alten Reports in README vermerken.
- [EV-7] MEDIUM (freigegeben) | Run-4-Härtung: verbatim-parameter System-Prompt
  für den Server-Modus (Fixt Game-Matrix-Transcribe-Fehler-Klasse), EVAL_MAX_TOOL_
  ROUNDS (Default 8), Tool-Call-Log (Args + Result-Preview) in report.json,
  Rundungstoleranz/Äquivalenz in H1-Rubrik | trigger: nach EV-6, dann Run 4.

- [EV-6] RESOLVED 2026-09-15 | gewichtetes Scoring im Runner (total = Σ
  score×weight, clamp 0-4), Report-Skala jetzt konsistent (40er) — alte
  Reports (Rohsummen) nicht vergleichbar, README-Doku dazu.
- [EV-7] RESOLVED 2026-09-15 | Operator-Prompt (verbatim params, runId reuse,
  full precision), EVAL_MAX_TOOL_ROUNDS (8), Tool-Call-Log in report.json,
  Judge-Äquivalenzregel, H1-Rundungstoleranz. Bewirkt: Bandit/Fault-Tree 40/40.
- [EV-8] OBSERVATION (Run 4, kein sofortiger Handlungsbedarf) | Tool-Schema-
  Flailing: flash-no-think schickte 4× payoff_matrix als String-Arrays statt
  {row,col}-Objekten (Erstaufruf-Formatfehler, Budgetverlust), übernahm danach
  den Full-Game-Dominanz-Output ungefiltert statt nextSteps zu folgen
  ("aggregating strategies to reach a 2×2 form"). | trigger: falls game_matrix-
  Fehlaufrufe wieder auftreten | action: payoff_matrix-Beispiel-JSON in die
  Tool-Beschreibung; nextSteps-Prominenz prüfen. Fermi-Task: fermi_estimate
  wurde übersprungen (VoI zweimal falsch parametrisiert) — Operator-Prompt-
  Variante "compute every requested number WITH the matching tool" denkbar.

- [EV-8] RESOLVED 2026-09-15 | payoff_matrix-Beispiel in game_matrix-Schema-
  Beschreibung (Commit 9bd6812, dist neu gebaut) + Operator-Prompt „matching
  tool / real JSON objects". Run 5: beide Run-4-Fehlerklassen verschwunden
  (Game 38/40 mit sauberen Calls, Fermi 40/40 mit fermi_estimate-Nutzung).
  Kein weiterer Handlungsbedarf; Rig-Freeze auf Run-5-Stand empfohlen.

## Tracked Follow-ups (appended 2026-09-15, Merge-Implementierung)

- [MG-1] RESOLVED 2026-09-16 | Merge Phase 6: stochastic-Jobs aus `publish-npm.yml`,
  `publish-containers.yml`, `publish-smithery.yml` entfernt (Commit `42010d1`,
  gepusht) + `npm deprecate @paschbaer/stochasticthinking` ausgeführt und per
  `npm view` verifiziert (deprecated-Meldung live, Verweis auf
  `@paschbaer/clear-thought@>=2.0.0`, Version 0.1.1 bleibt installierbar).
  Ursprung: Merge Phase 6 pending …
  UPDATE 2026-09-16: Release-Version vom User auf 2.0.0 gesetzt (decisions.md
  Update 2); Merge-Branch-Inhalte sind bereits auf develop — Release-Trigger ist
  jetzt der PR `develop → main`. Version-Bump auf `feature/release-2-0-0`.
  UPDATE 2026-09-16 (II): Trigger ERREICHT — User hat develop → main gemergt und
  Publish angestoßen (2.0.0). Action jetzt fällig: 2.0.0 auf npm/ghcr/Smithery
  verifizieren, dann `npm deprecate @paschbaer/stochasticthinking` (Verweis auf
  `@paschbaer/clear-thought@>=2.0.0`) + stochastic-Jobs aus `publish-npm.yml`,
  `publish-containers.yml`, `publish-smithery.yml` entfernen.
- [MG-2] LOW | `servers/server-stochasticthinking/` bleibt bis auf Weiteres im Repo
  (CI `test.yml` baut beide Workspaces); Ordner später archivieren und aus der
  CI-Matrix nehmen | trigger: nach MG-1 + einer Deprecations-Periode | accepted
  with rationale: README dient als Parameter-Referenz.
- [MG-3] LOW | `scripts/funktionstest.mjs` (clear-thought) nutzt für die
  Legacy-Tools noch die prä-1.0.0 kompakten Namen — Live-Checks gegen einen
  aktuellen Server schlagen dafür fehl; die neuen stochastic-Checks (2026-09-15)
  nutzen die aktuellen Namen | trigger: nächste Wartungsrunde | action required:
  Namen heben und gegen einen laufenden Server verifizieren.
- [MG-4] LOW | `evals/run.mjs` (clear-thought) attached bei LLM-Evals weiterhin
  den deprecated sibling `../server-stochasticthinking/dist/dev.js` (falls
  vorhanden) | evidence: run.mjs Zeile ~291, `existsSync`-guarded, "first server
  wins"-Routing macht den Attach redundant (merged Server ist erster Client) |
  trigger: MG-2 (Ordner-Archivierung) oder nächste Eval-Harness-Wartung |
  accepted with rationale: harmlos — Routing geht an den merged Server; nach
  Archivierung greift der existsSync-Fallback still.
  UPDATE 2026-09-16: RESOLVED — attach block + Doku-Stellen entfernt
  (Review-Fix F3, branch feature/skill-generator-docs); Eintrag obsolet.

## EMMS Spec Follow-ups (Review 2026-09-17, spec 001-experience-memory-server)
Trigger: /speckit-plan fuer 001-experience-memory-server
1. Actor/Identity-Modell definieren (was ist ein Actor im Local-MVP?) | required
2. Revision-Semantik + Conflict-Response festlegen (FR-029 konkretisieren) | required
3. Eval-Korpus fuer SC-001/SC-006/SC-009 definieren (Mindestumfang, golden paths) | required
4. Guidance-Objekt-Schema skizzieren (FR-010/011 vor Umsetzung) | required
5. Messbare Schwellen fuer FR-021 (Duplikat-/Kontradiktionserkennung) festlegen | required
6. Fabricated-Evidence-Mitigation als Akzeptanzkriterium verengen (Attestierung MVP: nur Artefakt-Hash) | accepted observation, rationale: vollstaendige Attestierung ist Team-Phase
7. Export-Format fuer Episoden (portable, zukunftsfaehig) | accepted observation, rationale: Nice-to-have, nicht MVP-blockierend
