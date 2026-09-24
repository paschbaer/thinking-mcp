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
6. Fabricated-Evidence-Mitigation — RESOLVED 2026-09-18: als FR-008a in der Spec verankert (MVP-Grenze: Artefakt-Hash-Verifikation bei finalize; kryptografische Attestierung explizit Team-Phase). Akzeptanzkriterium: geloeschtes/modifiziertes Artefakt zwischen record_run und finalize MUSS finalize fehlschlagen lassen (ARTIFACT_HASH_MISMATCH / MISSING_REQUIRED_EVIDENCE). Implementierung: finalize(verified) liest jetzt JEDES Evidence-Artefakt via EvidenceStore.read (Hash-Verifikation); Tamper-Artefakt zwischen record_run und finalize blockt mit ARTIFACT_HASH_MISMATCH. Contract-Test in capture.test.ts. Commit 1027a21. GESCHLOSSEN.
7. Export-Format fuer Episoden (portable, zukunftsfaehig) | accepted observation, rationale: Nice-to-have, nicht MVP-blockierend

## 2026-09-19 — Verifizieren: Addendum-Revision-Konflikt bei episode-extend
- **Befund** (Niyama-Bericht): Ein Addendum an Episode `exp_160d2db7-4d8` (niyama-lessons, Docker-Store) sollte an der aktuellen Episode-Revision (Rev 6) anhängen, landete aber als Rev 3 auf dem älteren Workflow der selben Episode. Inhalte sind serverseitig persistent, aber der Revisionsbezug ist vermutlich falsch verdrahtet.
- **Trigger-Point**: Nächste Scope-Arbeit an Episode-Extend/Addendum-Fluss (`record_observation` gegen bestehende Episode / finalize-Addendum-Pfad in `src/service.ts`).
- **Aktion erforderlich**: ~~offen~~ **GELÖST 2026-09-19 (Commit siehe git log: fix(emms) replay revision)**: Root Cause war der Idempotenz-Replay von `workflow_start` (FR-028) — er lieferte das ORIGINAL-Ergebnis mit der damaligen Revision zurück; Addendum-Läufe rechneten ab Rev 1 und crashten mit STALE_REVISION. Fix: Replay patcht auf die aktuelle Workflow-Revision + `replayed: true`-Flag; Regressionstest `tests/contracts/replay-revision.test.ts`, Suite 95/95.

## Tracked follow-ups (2026-09-22)
- [x] Golden-Test-Flake: GEFIXT (2026-09-22) — Ursache war der vitest threads-Pool (napi-Instabilität mit better-sqlite3, auch als stilles FTS-Versagen) plus zu knappes 5s-Timeout. Fix: `pool: 'forks'` + `testTimeout: 30_000` in `servers/server-insight/vitest.config.ts`. Suite: 99/99. Action done.
- [ ] Prompt-Kopien von `.github/prompts/capture-lessons.prompt.md` in anderen Repos aus dem Master syncen. Trigger: sobald der Docker-Container mit `experience_seed_lessons` deployed ist. Action required.
- [x] Docker-Image neu bauen + deployen (VERIFIZIERT 2026-09-24: HTTP-Server läuft auf :3002, experience_seed_lessons per HTTP erfolgreich genutzt — Werkzeug vorhanden). Action done.
- [x] FTS-Retrieval wirkungslos (2026-09-22 entdeckt, direkt gefixt): fehlender `episodes_fts`-Writer (Trigger + Backfill in `sqlite.ts` init), INNER JOIN auf `signatures` in `searchFullText` → LEFT JOIN, FTS-Treffer-Bonus (+0.30) im Relevance-Scoring. Live verifiziert: Slug-Suche liefert Ziel-Episode auf Platz 1 (rel 0.55). Action done.
- [ ] FTS-Index deckt nur `goal_summary` ab („Persist lesson: <slug>") — Observation-/Fix-Inhalte sind nicht durchsuchbar; Queries müssen Slug-/Goal-Wortlaute verwenden. Kandidat: Observation-Inhalte (oder Auszüge) in den FTS-Index bzw. das Ranking aufnehmen. Trigger: nächste Retrieval-Qualitäts-Runde oder sobald Slug-basierte Suche in der Praxis zu grob wird. Action required (Enhancement, kein Defekt).
- [ ] Postgres-Adapter: FTS-Parität zu SQLite fehlt (keine Trigger/Backfill/Relevance-Boost) — Header in `src/storage/postgres.ts` weist darauf hin. Trigger: Aktivierung von `EMMS_STORAGE_BACKEND=postgres`. Action required.
- [x] Global `testTimeout: 30_000` (vitest.config.ts) kann Performance-Regressionen maskieren: AKZEPTIERT als Risiko (2026-09-22, Basis-Review). Trigger für Re-Evaluation: nächste Suite-Tuning-Runde (per-Test-Timeouts für Load/Golden, Global Richtung 10s). Accepted observation.
- [x] Guidance (specs/002): Bearer-Token-AuthN RESOLVIERT (2026-09-24-Inventur): GUIDANCE_AUTH_TOKEN + timing-safe authHeader-Middleware implementiert (server.ts, getestet in http-transport.test.ts; siehe L280-Eintrag). Trigger entfällt.
- [ ] Guidance (specs/002): Administratives Metrics-Tool implementieren (Operation-Counts/Durations/Error-Rates, Connection-Health über Zeit) — FR-059 scope-Team-Entscheid: nur Logs+Status-Tools in dieser Iteration. Trigger: erste Produktions-Nutzung von Guidance oder Betrieb-Monitoring-Runde. Action required. Quelle: /speckit-clarify 2026-09-22 (User: "B, but track C for later").

- [ ] Guidance (specs/002) Phase 3 review follow-ups (APPROVE, 0 HIGH/CRIT): F1 completeWorkflow requestId ledger check must move ABOVE status checks (replay-after-completion should return recorded result, not workflow_already_completed) — trigger: next engine-touching scope or Phase 5 wiring. F2 submission_received audit/accept-persist ordering on op failure — same trigger. F3 stale-copy reassignment pattern in submitLocked (partially fixed via targeted mutation) — audit remaining sites next scope. F4 GuidanceErrors thrown past public methods need structured-response shim at MCP dispatch — trigger: Phase 5 tool registration. F6 in-process-only mutex — trigger: any multi-process/CLI scope. F7 requestId replay test still to add — trigger: next engine-touching scope. Action required. Quelle: Phase 3 review 2026-09-22.

- [ ] Guidance (specs/002) Phase 5 review follow-ups (needs-changes → fixed in commit; remaining LOW/INFO): persist pinned capability hashes across engine restart (in-memory only today — drift silently accepted post-restart); sanitization/quarantine seam for downstream text before LLM-facing consumption (injection passes verbatim into NormalizedResult.content); redaction multi-line value coverage. Action required (next orchestration scope). Quelle: Phase 5 review 2026-09-22.

- [ ] Guidance (specs/002) Phase 6 review follow-ups (F4/F5, MEDIUM): restricted-server egress checks validate structure not content (source-code/path leakage possible) — add content-level checks or secret-ref pattern rejection; raw/normalized exposure modes return protocolMetadata unredacted — route persistence-only paths through redaction before any agent-facing use. Trigger: next orchestration/policy scope. Action required. Quelle: Phase 6 review 2026-09-22.

- [ ] Guidance (specs/002) Phase 7a review follow-ups (NOT APPROVED → H1 fixed; remaining MEDIUM deferred to Phase 7b): snapshot chaining (previousSnapshotId hardwired null, no refresh API); staleness machinery (evaluateCompletionInvariants takes caller-supplied snapshotCurrent — must recompute hashes); SpecKitState persistence of task lifecycle across restarts; PlanChange approve/apply methods (hasPendingPlanChanges currently blocks on permanently-pending changes); applyReconciliation unimplemented (pure diff only); parser dead code (TASK_LINE/ID_TOKEN/hasSection usage, requireFs in ESM); criteria parser only matches bold SC lines; batch cap/phaseGroup edges; maxEntities/maxExcerptBytes/requireUniqueMatch unused. Action required (Phase 7b). Quelle: Phase 7a review 2026-09-22.

- [ ] Guidance (specs/002) Phase 7b/8/9 review follow-ups (APPROVED, 0 HIGH/CRIT): M1 contracts artifacts store absolute relativePath (relocation breaks staleness falsely conservative); M2 glob relativePath trap; M3 removed-task reconciliation lacks superseded marker/audit + dead `superseded` binding, buildReconciledState has no src caller yet; F4 previousSnapshotOverride dead field (chain not consumed at persist); F5 waiver audit uses plan_change_approved event instead of dedicated spec_kit_criterion_waived; F6 plan-change lifecycle unguarded (approve/reject terminality, markPlanChangeApplied unknown-id TypeError); F7 dead conjunct in coverageSummary; F8 test gaps (contracts artifact, removed-task, terminality, waiver audit fields). Trigger: Phase 7c/next SpecKitEngine maintenance. Action required. Quelle: Phase 7b/8/9 review 2026-09-22.

- [ ] Guidance (specs/002) Full-codebase review follow-ups: F1 composition root FIXED (8eeba9c), F2 audit redaction FIXED (e0b911d), F3 exposure FIXED (e217ddf), F4 beforeEnter/afterExit FIXED (2054691 + a8a5082 incl. review MEDIUMs: requiredFailed over afterEnter-only, start-path downstream state, status field). Remaining from F4 review (LOW): blocked-start session continues afterEnter ops (asymmetric vs submit early-return — decide: break loop + skip afterEnter, or document); operation_not_configured thrown mid-submit leaves partial state (afterExit variant transitions first, hook never runs); test 1 lacks ordering assertion; test 4 lacks hook_failed-audit + start.operations assertions. Trigger: next lifecycle/engine maintenance scope. Action required (or accepted-observation with rationale). Quelle: F4 review 2026-09-22.

- [ ] Guidance (specs/002) M2/M3 review follow-ups (both APPROVED, 0 HIGH/CRIT): M2 fixed in 7efaa16 + 2b7bbb2 (requestTimeoutSeconds enforced as transport failure; unhandled-rejection guard; validation finite>0; stub timeout mode + unref). Remaining LOWs: (a) downstream request NOT cancelled on timeout (MCP callTool has no AbortSignal) — retry after timeout may duplicate side effects on non-idempotent tools; revisit if SDK adds signal support; (b) invalid trustLevel fails open to "trusted" without warning log — add warn on unknown values; (c) timeout validation after clientFor: unknown server + invalid timeout reports connection error (cosmetic); (d) requestTimeoutSeconds not yet covered by schema-validator (validate there too). M3 fixed in 6cdc842 (all `as never` removed; toTrustLevel normalizer — eliminates silent no-op egress mode for invalid trustLevel). Trigger: next MCP-SDK upgrade / policy maintenance scope. Quelle: M2/M3 reviews 2026-09-23.

- [x] Guidance (specs/002) Finding 7 (Option C) follow-ups RESOLVIERT (2026-09-24-Inventur, Code-Verifikation): (a) withState läuft unter Per-Session-Mutex `withLock` (register-spec-kit-tools.ts L123-148, Lost-Update-Schutz auch für async Handler); (b) Registrierungstest mit exakter Surface-Equality inkl. Duplikat-Erkennung vorhanden (L278, Commits ab985b9/5c34f3d).

- [x] Guidance (specs/002) Remaining LOW findings RESOLVED (commits ab985b9 + 5c34f3d, review APPROVED 0 HIGH/CRIT): trustLevel warn-once per (serverId,value); requestTimeoutSeconds validated at config load (validateDownstreamServers) + invokeTool-before-clientFor; startWorkflow fail-fast (break + skip afterEnter when blocked, symmetric to submit); Spec-Kit withState under per-session mutex; test 1 audit-ordering assertion; test 4 hook_failed-audit + start.operations assertions; registration test exact-surface equality incl. duplicate detection; withState payload regression test (caught the missing-await '{}' HIGH immediately). Accepted observations (no action): operation_not_configured mid-submit partial state (pre-existing consistent pattern, error contract unchanged); AbortSignal non-cancellation (SDK limit); sessionLocks map entries per session (negligible). Quelle: LOW-fix round 2026-09-23.

- [x] Guidance (specs/002) HTTP-Betrieb implementiert (c5495b2 + Review-Fix e0b4d6d, APPROVED): streamable HTTP stateless at POST /mcp, GET/DELETE 405; GUIDANCE_AUTH_TOKEN bearer (timing-safe, 401); GUIDANCE_BIND_HOST explicit opt-in für Container (FR-027-Default loopback fail-closed bleibt); GUIDANCE_WORKSPACE_ROOT; Dockerfile/compose nach clear-thought/insight-Muster (node:22-alpine, healthcheck, non-root, /workspace-Volume, 3003). Review-HIGHs sofort geschlossen: (1) client-workspaceRoot-Containment (resolve+prefix, Regressionstest + Container-Verifikation), (2) Komposition gehoistet (SessionRepository-Locks intakt). Rest-LOWs akzeptiert/getrackt: npm-install-ohne-lockfile im Dockerfile (Workspaces hoisten Lockfile ins Repo-Root — Supply-Chain-Hinweis), /health offen (bewusst, keine sensiblen Daten), Bind-Host-Test nur Unit-Ebene. Trigger: HTTP-/Deployment-Maintenance. Quelle: HTTP review 2026-09-23.

- [x] Insight (EMMS) Dockerfile LOW (npm-install-ohne-lockfile, Supply-Chain) RESOLVED: server-lokales package-lock.json committed (force-add, Root-.gitignore ignoriert package-lock.json global — Precedent server-clear-thought), Dockerfile auf npm ci umgestellt; Docker-Build + Container-Health verifiziert (dd065b4).
- [x] HTTP-Transport-Migration clear-thought+insight (bc5326c, dd065b4, 1caa690) Review-HIGHs RESOLVED: (1) Root-docker-compose.yml setzt jetzt CLEAR_THOUGHT_BIND_HOST/EMMS_BIND_HOST=0.0.0.0, (2) Idle-Session-Reaper (TTL 60min, Sweep 5min, unref'd) + MAX_SESSIONS=500 LRU-Eviction begrenzt Session-Wachstum. Tests 152+99 grün, Container-E2E re-verifiziert.
- [ ] Akzeptierte Beobachtungen aus Review 1caa690: (a) GELÖST (Batch B: malformed JSON → 400/-32700), (b) GELÖST (Batch B: CB-3 Early-Reject, c416bba), (c) Smithery-Reste: build:smithery/deploy-Scripts + smithery.yaml in VIER Servern (inkl. guidance!) — Cluster 3 des Bestandsplans, Trigger: Smithery-Decision + Discovery-Check (Build-Pfad ohne @smithery/sdk). (INFO).
- [x] Guidance (EMMS-Vorlage) Dockerfile LOW (npm-install-ohne-lockfile) RESOLVED (632b31e): server-lokales package-lock.json force-added, Dockerfile auf npm ci + COPY package*.json umgestellt; Docker-Build + Health + MCP-Initialize(200) gegen gemountetes Example-Workspace verifiziert. Damit sind alle drei Server deterministisch.

## Getrackte Follow-ups (2026-09-23, setup_clearthought)
- [x] ERL. (develop 024ddf4) Marker-Paar-Einzigartigkeit im Compact-Output testen
      (doc.split(START).length-1 === 1). Trigger: jede kuenftige
      Template-Aenderung an setup-clearthought-templates.ts. [Review a5c5c98 #2]
- [x] ERL. (develop 024ddf4) Eskalation (isError) ueber Utility-Toolset-Dispatcher testen.
      Trigger: naechste Aenderung an toolsets/registry.ts oder Loop-Guard.
      [Review 44063c6 #4]
- [x] Akzeptierte Beobachtung: section:'recipes' ohne Guard (statisch,
      ~2-3KB) - nur bei beobachtetem Spam Rate-Limit ergaenzen.

## Post-Implementation-Review Trigger: Remote-Mode (Amendment 001)
Findings liegen in specs/002-guidance-workflow-server/amendments/
001-remote-mode-review-findings.md (2 MEDIUM, 6 LOW). Implementierung läuft
parallel in separatem Chat. Trigger: sobald die Remote-Mode-Implementierung
merged/committet wird, MUSS der Post-Implementation-Review jede Zeile der
Findings-Datei gegen den Code prüfen ([x] + Code-Referenz), bevor der Scope
geschlossen wird. Insbesondere M1 (init_session-Idempotenz vs. Multi-Session)
und M2 (401 vs. session_not_found Kanaltrennung) sind Merge-Blocker-Kandidaten.
- [ ] Guidance Remote-Mode (spec amendment 001) — implementiert auf feature/remote-mode-session-binding (7327349 + Review-Fixes 877d89e, 2 CRITICAL + 2 HIGH behoben, ClientOpEngine-Wiring, TTL, list_sessions-Restriktion, Pfadschutz). Getrackte Rest-Follow-ups: (a) M2-Restart-Persistenz — Idempotenz/Per-Key-Limit/workflowToRemote sind Cache-only, nach Container-Restart dupliziert init_session und Workflow-Sids verlieren ihr Binding (Meta.json sollte canonical + key→sessions-Index führen); (b) M3 — Per-Key-Limit zählt nur Cache und hat Off-by-one (Prüfung vor Insert), anonymous-Sharing kann globales Budget erschöpfen; Fehlercode sollte quota-domain sein; (c) M4 — init_session Rate-Limit 20/min (Q4-Entscheidung) noch NICHT implementiert; (d) MCP-Downstream-Ops im Remote-Modus laufen als awaiting_client (dokumentierte v1-Einschränkung — Downstream-Support nachspezifizieren); (e) Client-Reports = Vertrauensanker (FR-104.5) — keine Integritätsprüfung möglich. Tests: 155 grün inkl. FR-104-Gate-Flow-E2E. Trigger: Remote-Mode-Produktivsetzung. Quelle: Remote-Mode-Review 2026-09-23.
- [x] Remote-Mode-Hardening umgesetzt (feature/remote-mode-hardening, fb0a350 + a69b699 + c22585a, Review APPROVED 0 HIGH/CRIT): M2-Restart-Persistenz (canonicalHash in meta.json, Index-Rebuild), M3 (Disk-Count, >=-Grenze, quota_exceeded), M4 (Rate-Limit 20/min pro IP, 429), N1 (Quota-Rollback bei invalid config + Orphan-Cleanup), dbg-Logs entfernt. 160/160 Tests. Merge nach develop erfolgt (FF).
- [x] Fix-Review 877d89e (2. Runde, APPROVED, 0 HIGH/CRIT): C1/C2/H1/H2 genuin verifiziert. Neue Findings F1-F3 sofort gefixt (9aa944e): F1 Retry-Phase aus result.currentPhase abgeleitet (harter Review-Phasen-Mismatch); F2 Pfadschutz wirklich separator-bewusst; F3 gcg-dbg entfernt. F4 (lastAttempt auch bei submission_invalid gesetzt — harmlos) dokumentiert. Merge nach develop freigegeben (Rest-Follow-ups oben bleiben getrackt).

## Getrackte Follow-ups (2026-09-24, Full-Codebase-Review develop 2d580fa)
Quelle: Review-Evidence-Protocol-Durchlauf; Snapshot develop@2d580fa (clean, ahead 4). Tests in der Session nicht ausführbar (Node-Toolchain fehlt) — CI autoritativ. 0 HIGH/CRITICAL offen. CB-1 pre-existing (identisch in origin/develop), CB-2-Lücke wurde erst mit c22585a-Rollback relevant.

- [ ] CB-1 MEDIUM Guidance: `remote-session-manager.ts` `resolve()` (~L256) ruft `this.touch(sessionId)` mit roher (ggf. Workflow-)Sid statt `effectiveId` — TTL-Prüfung umgangen bzw. `lastAccessAt` im Cache-Pfad nie aktualisiert. Trigger: nächste Änderung an remote-session-manager.ts oder Remote-Mode-Produktivsetzung. Action required: `touch(effectiveId)`.
- [ ] CB-2 MEDIUM Guidance: `initSession` configFiles-Validierung (~L161) wirft AUSSERHALB des N1-Rollback-try — Quota-Slot + Orphan-Dir lecken bis Restart (Rollback aus c22585a unvollständig, Commitmsg beansprucht volle Abdeckung). Trigger: nächste Änderung an remote-session-manager.ts. Action required: Validierung in den try ziehen oder Slot-Freigabe im catch.
- [x] CB-3 MEDIUM (Re-Evaluation des akzeptierten LOW aus L284b, GELÖST c416bba): insight + clear-thought POST /mcp early-reject — ohne bekannte Session-Id nur noch echte initialize-Requests erzeugen Server+Transport; garbage/batch/non-initialize → 400/-32600. Zusätzlich 1caa690(a) mitgeschlossen: malformed JSON → 400/-32700 statt 500. Tests: http-transport.test.ts je Server (4 Tests).
- [x] CB-4 MEDIUM Deployment (GELÖST a17be38, Option B): Root-Compose bindet 3000+3002 auf 127.0.0.1 — kein LAN-Zugriff mehr auf die unauthentifizierten Endpunkte. Option A (Auth) bleibt Future-Work für Fernzugriff.
- [x] CB-5 LOW (GELÖST b2aa1bc): stochastic `app.listen(PORT, HOST)` mit `STOCHASTIC_BIND_HOST`-Pattern (loopback-Default wie die anderen Server); Dockerfile setzt ENV 0.0.0.0 für Port-Mapping. npm deprecate laut User-Entscheid NEIN.
- [x] CB-6 LOW (GELÖST 04c6b13): `publish:insight`/`npm:publish:insight` zeigen jetzt auf `servers/server-insight`.
- [x] CB-7 LOW (GELÖST 10d0c3f): `emms-store.db-wal` aus dem Index entfernt (Datei bleibt lokal); `.gitignore`-Eintrag greift ab jetzt.
- [x] CB-8 LOW (GELÖST 66d3d8a): Guidance-POST-Handler rejected Batch/Array-Bodies mit 400/-32600 VOR den Pre-Checks (Defense-in-Depth; SDK verwirft Batches weiterhin vor dem Dispatch).
- [ ] CB-9 LOW `[dbg]`-Log remote-session-manager.ts L132 noch vorhanden — widerspricht c22585a („dbg-Logs entfernt") und memory-bank L306; zusätzlich `[dbg]`-console.logs in remote-mode.test.ts. Trigger: nächster Datei-Touch. Action required: entfernen.
- [x] CB-10 LOW (GELÖST 66d3d8a): initSession schreibt meta.json EINMAL inklusive canonicalHash — Crash-Fenster ohne M2-Rebuild-Key geschlossen.
- [x] CB-11 LOW (GELÖST c416bba): `pathFor()` validiert `^[a-f0-9]{64}$` vor `join()`; `read()` resolved den Pfad VOR dem Read-Miss-Catch, damit der Malformed-Error nicht verschluckt wird. Test: traversal/malformed/non-hex-64 → ARTIFACT_REJECTED „Malformed artifact hash".
- [x] CB-12 LOW (GELÖST c416bba): verifiziert UND gefixt — Bare-Operatoren (NOT/AND/OR/NEAR) überlebten die Sanitization und warfen rohe FTS5-Syntaxfehler. Fix: Tokens werden als FTS5-Stringliterale gequotet (nach Sanitization nur noch \w-Zeichen → eindeutig). Test: searchFullText('NOT'|'AND OR NEAR'|'install not dependencies') → [].
- [x] CB-13 LOW (GELÖST 04c6b13): README-Duplikat entfernt; Root-`engines.node` auf `>=20` angehoben (Align mit Servern + README; yarn-Immutable-Check grün).
- [x] L305(a) Restart-Persistenz (GELÖST 7dbfa92): workflowToRemote-Bindings + ClientOpLedger + lastAttempt überleben Restarts via state.json je Session (formatVersion 2, geschrieben bei Registrierung/Reports/Submits, Rebuild beim Boot neben canonicalIndex). v1-Sessions ohne state.json migrieren tolerant. Tests: Restart-zwischen-start_workflow-und-Folgetool + v1-Toleranz (164/164, tsc, yarn build grün). REST: L305(d) awaiting_client-Downstream-Spec (optional für Produktivsetzung) + FR-104.5 (akzeptiert).
- [ ] R-1..R-3 LOW (Post-Commit-Review 7dbfa92, APPROVED 0 HIGH/CRIT — akzeptierte Beobachtungen mit Option): (R-1) registerWorkflowSession persistiert nur bei gecachter Session — impliziter Kontrakt „immer nach resolve"; hart machen (minimal-state auch uncached ODER Throw) beim nächsten Touch der Datei. (R-2) Crash-Fenster ≤1 Event zwischen In-Memory-Mutation und persistSessionState (gleiches Risiko like bestehende meta-Writes — dokumentiert akzeptiert). (R-3) ledgerReports unbeschränkt + Full-Rewrite pro Persist (O(n)) — Cap oder inkrementelles Append bei beobachtetem Wachstum. Trigger: nächste Änderung an remote-session-manager.ts / remote-tools.ts. Accepted observations mit rationale.

## Inventur Bestands-Follow-ups (2026-09-24, Phase 0.1)
Code-Verifikation aller offenen Zeilen. Ergebnisse:
- GESCHLOSSEN (faktisch erledigt, oben [x] nachgetragen): Bearer-AuthN (L259),
  Docker-Deploy (L254), Finding-7-LOWs (L276 a+b), 1caa690 (a)+(b) (L284),
  L274 (b)+(d) (trustLevel-warn + Timeout-Validierung, wie L278 gemeldet).
- BESTÄTIGT OFFEN: L305(a) workflowToRemote/Ledger cache-only (Cluster 1a,
  Produktivsetzungs-Blocker; importArtifacts setzt previousSnapshotId hart auf
  null — Snapshot-Chaining offen); L305(d) awaiting_client (Spec nötig);
  Phase 6 Egress-Checks prüfen nur Struktur, nicht Inhalte (PolicyEngine
  evaluateEgress) → L266 offen; Phase 5/7a/7b-Items (L264/L268/L270) unverändert
  offen; Metrics-Tool (L260); FTS-Coverage (L256); Postgres-Parität (L257);
  Smithery-Reste jetzt in VIER Servern (L284c → Cluster 3).
- L253 (Prompt-Kopien-Sync): nur Master-Repo hier verfügbar — bleibt offen,
  Sync bei Zugriff auf die anderen Repos.
- Phase-3-Zeile (L262) als STALE markiert: mehrere Items durch L272/278
  abgedeckt — Restverifikation in Paket 2b (State-Machines).
Sequenz bestätigt: 2d→2e→2c→2a→2b trigger-frei; Cluster 1a nach
Produktivsetzungs-Entscheidung; Cluster 3 nach Smithery-Discovery.

## Cluster 2a (GELÖST 27df359, 2026-09-24; Review APPROVED 0 HIGH/CRIT)
- [ ] R-11..R-14 LOW/INFO (Post-Commit-Review 27df359 — akzeptierte Beobachtungen): (R-11) Snapshot-Chain wächst unbeschränkt (Refresh ohne Drift erzeugt trotzdem Snapshot + Dir) — Retention-Cap (z.B. max 20) oder Skip-wenn-!stale beim nächsten Touch. (R-12) Blocking-Refresh behält aktive Batches/PlanChanges des alten Stands bei invalid-Markierung (bewusst — Arbeit bewahren; Invarianten greifen). (R-13) Tool-Schema ohne snapshotCurrent: alte Clients kompatibel (Zod strippt). (R-14) 2b MUSS beim Wiring von buildReconciledState importArtifacts(feature, previous) verwenden, sonst chain-lose States. Trigger: nächste Spec-Kit-Engine-Änderung bzw. 2b.
- [x] Snapshot-Chaining (Phase 7a M4): importArtifacts(feature, previous?)
  verkettet Snapshots (previousSnapshotId) und erhält die History; der
  Blocking-Fail-Pfad eines Refreshs überschreibt die Kette nicht mehr
  (vorher: History-Wipe), sondern markiert nur invalid. refresh_spec_kit
  reicht den previous State durch.
- [x] Staleness-Maschinerie (Phase 7a M4): evaluateCompletionInvariants
  berechnet snapshotCurrent intern (Hash-Vergleich via isSnapshotStale)
  statt dem Caller-Supplied-Flag zu trauen; Tool-Schema (snapshotCurrent
  entfernt) + Tests angepasst.
- [x] previousSnapshotOverride dead field entfernt — Chaining wird jetzt
  am Import konsumiert. 5 neue Tests (snapshot-chain.test.ts).
  181/181 + tsc + build grün.

## Cluster 2c (GELÖST 9bcc6c6, 2026-09-24; Review APPROVED 0 HIGH/CRIT)
- [ ] R-6..R-8 LOW/INFO (Post-Commit-Review 9bcc6c6 — akzeptierte Beobachtungen): (R-6) Downstream-Error-Message-Pfade (tool_reported/transport) tragen messages unverratzt durch errors[] — redact beim nächsten Touch der OperationEngine. (R-7) Secret-Value-Patterns ohne Word-Boundary → mögliche False-Positive-Blocks im restricted-Modus (fail-closed, akzeptiert); Boundary-Verfeinerung optional. (R-8) redactUnknown setzt azyklische (JSON-derived) Strukturen voraus — im Docstring dokumentieren. Trigger: nächste Änderung an OperationEngine/redaction.ts. Accepted observations mit rationale.
- [x] Egress Content-Checks (Phase 6 MEDIUM): evaluateEgress (restricted/
  validated_inputs_only) verwirft Scalar-Args mit High-Confidence-Credential-
  Werten (Private-Keys, AKIA/ghp_/github_pat_/sk-/JWT/xox-Pattern) via
  data_egress_denied. Trusted/privileged bleiben strukturell (dokumentiert).
- [x] protocolMetadata-Rotung (Phase 6 MEDIUM): mcpTool-Ergebnisse laufen
  durch redactUnknown — Content UND structuredContent werden vor der
  agent-facing Rückgabe redigiert (zuvor verbatim).
- [x] Multi-line-Redaction (Phase 5 LOW): Value-Alternation matcht jetzt
  mehrzeilige Quoted-Values ([\\s\\S]*?, non-greedy).
- [x] Sanitization-Seam: redactUnknown (Deep-Walk + Key-Based-Redaction) in
  redaction.ts als dokumentierter Extension-Point; 7 neue Tests
  (tests/policy/redaction-seams.test.ts). 176/176 + tsc + build grün.
  Bekannte Restschwäche: Default-Patterns matchen snake_case-Keys
  (api_token) nicht (\\b-Grenze) — Enhancement-Kandidat.

## Cluster 2b (GELÖST 29b22c2 + Review-Fixes f8d91b6, 2026-09-24; Review APPROVED 0 HIGH/CRIT)
- [x] R-15 MEDIUM (im Review gefunden + SOFORT gefixt f8d91b6): superseded
  Tasks behalten required=false (blockten required_tasks_incomplete für
  immer); Test: Violation-Set identisch mit/ohne superseded Task.
- [x] R-16 LOW (gefixt f8d91b6): buildReconciledState merged
  previous.planChanges — offene Changes überleben den Refresh.
- [x] R-17 LOW (dokumentiert + Test): Re-Entscheidung vor Apply
  (approved→rejected) ist intendiert; ab Apply terminal (F6-Guard).
- [x] R-18 INFO: remote approve/apply unterliegt dem FR-104.5-
  Session-Vertrauensmodell (konsistent mit allen Tools).
- [x] R-19 INFO: Migration — unter altem Code im Status
  artifact_update_required festhängende Changes brauchen nach dem Upgrade
  ein Re-Approve (setzt "approved"), dann Apply.
- [x] F6: Plan-Change-Lifecycle guarded — approve/reject terminal, apply nur
  nach Approval, unbekannte Ids werfen GuidanceError; approved Changes
  führen jetzt den Status "approved" (statt artifact_update_required zu
  wiederverwenden). refresh-Test auf korrigierten Flow angepasst.
- [x] F5: waiveCriterion emittiert spec_kit_criterion_waived.
- [x] M3: entfernte unfertige Tasks werden als cancelled retained +
  spec_kit_task_superseded-Audit; toter superseded-Debris entfernt.
- [x] M1: Contracts-Artefakte speichern relative Pfade (Relocation bricht
  Staleness nicht mehr — Test: Umzug in neues Root → nicht stale).
- [x] 7a M applyReconciliation: refresh_spec_kit_artifacts wendet
  buildReconciledState an — Task-Fortschritt überlebt Refresh.
- [x] 2 neue Tools: approve_plan_change + apply_plan_change (waren
  Engine-only, remote nie erreichbar — permanent-pending-Gap geschlossen);
  SPEC_KIT_TOOL_NAMES + Registrationstest aktualisiert.
- [x] Inventur-Befund: "SpecKitState-Persistence über Restarts" (7a) war
  bereits realisiert (SpecKitStateStore, disk-backed, atomic tmp+rename) —
  stale Eintrag, keine Action.
  189/189 Tests + tsc + yarn build grün. Offen im Bestand: nur noch
  Cluster 3 (Smithery-Decision + Discovery), 1b (Downstream-Spec),
  CB-4-Option-A, L253/256/257 (Kleinkitems) + INFO-Positionen.

## Cluster 2e (GELÖST ffdf393, 2026-09-24)
- [x] Capability-Hashes über Restarts: capability-hashes.json im stateDir
  (merge-on-save, tolerant load); Drift nach Restart wird jetzt ERKANNT
  (downstream_capability_changed) statt stillschweigend neu gepinnt —
  Verhaltensänderung mit Absicht.
- [x] F8-Waiver-Audit: Audit-Entry führt jetzt approvedBy + at (dedizierter
  Event-Typ spec_kit_criterion_waived bleibt F5/2b).
- [x] F8-Testlücken geschlossen (f8-gaps.test.ts, 4 Tests): Contracts-
  Artifacts (Hash, Content wird bewusst nicht im State behalten — in
  importArtifacts dokumentiert), Removed-Task-Reconciliation (removed
  geflaggt, completed retained), Plan-Change-Terminality-Flow,
  Waiver-Audit-Felder. 169/169 + tsc + build grün.

## Cluster 2d (GELÖST 18b27cf, 2026-09-24)
- [x] Parser-Dead-Code: TASK_LINE/ID_TOKEN entfernt; hasSection (Export ohne
  einen einzigen Aufruf) entfernt; toter Doppel-Import readdirSync +
  readdirRecursive2-Debris am Dateiende entfernt.
- [x] Latenter ESM-Crash: readdirSyncSafe nutzte require("node:fs") —
  ReferenceError sobald Kandidaten-Discovery (mostRecentlyModified/
  singleCandidate-Strategien) läuft. Jetzt statischer readdirSync-Import.
- [x] Criteria-Parsing bold-only (parseTasks UND parseCriteria): jetzt auch
  Plain-Listenform (- AC-002: …), gespiegelt vom Requirement-Muster.
  Regressionstest in parser.test.ts.
- [x] F7: toter `&& state.tasks`-Conjunct in coverageSummary entfernt.
- [x] requireUniqueMatch/maxEntities/maxExcerptBytes: als „reserved" im
  Interface dokumentiert (Enforcement wäre silentes Droppen von Criteria =
  Coverage-Korruption — gehört mit Validation-Warnings zusammen in 2c/2a);
  previousSnapshotOverride als „reserved für 2a Snapshot-Chaining"
  dokumentiert (nicht entfernt — 2a konsumiert es).
- INFO (akzeptiert, keine Action): Root-tsconfig deckt nur 2/4 Server; gemischte Package-Manager (yarn@4 root + server-lokale npm-Lockfiles) ist beabsichtigt (Docker/Publish-Determinismus); ClientOpLedger nur per operationId (v1-Doku, FR-104.5-Vertrauensmodell); cache-only workflowToRemote/ledger/lastAttempt bereits getrackt im Remote-Mode-Follow-up (a) bei L305.
- [x] CB-14 HIGH-Kandidat (entdeckt 2026-09-24, GELÖST 3fb48ba): yarn.lock auf Yarn-Berry-Format (v8) mit yarn 4.6.0 regeneriert (+ package.json-Normalisierung der Server committed). CI-Parität verifiziert: `yarn install --immutable` (exit 0, keine Änderungen), `yarn build` + `yarn test` über alle 4 Workspaces grün (166+162+105[4 skipped=Embeddings]+43).
- [x] CB-15 LOW (entdeckt 2026-09-24, GELÖST 373ade5): `develop` zu den push-Branches in test.yml hinzugefügt — develop-Pushes triggern CI jetzt direkt.

