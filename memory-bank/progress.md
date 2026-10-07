# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-10-02

## What Works

- **MCP HTTP Keep-Alive-Timeout 65 s (2026-10-02, feature/mcp-keep-alive-timeout):** Root Cause aller "Connection stallt/brecht ab"-Symptome — Node ≥19-Default `keepAliveTimeout=5000 ms` → `Keep-Alive: timeout=5` in allen vier MCP-HTTP-Servern. Fix: `server.keepAliveTimeout=65000` (env `KEEP_ALIVE_TIMEOUT_MS`) + `headersTimeout=+5s` in clear-thought/guidance/insight/stochasticthinking. Unabhängiger Review (Sub-Agent, frischer Kontext): APPROVED 0 HIGH/CRIT (Node-24-Header-Repro + Shutdown-Repro + tsc je Server). Fast-Forward-Merge nach develop (1677a9d), Branch gelöscht. Folgen-ups KA-1/2/3/4 in remaining-work-plan getrackt.
- **Offen:** Push develop (Nutzerentscheid, ahead 6); Container-Rebuild (`docker compose up -d --build`) + Live-Gegenprobe `curl -sI .../health` → `timeout=65`; KA-4: `gitnexus analyze` bricht mit Storage-Status `foreign` ab (Index-Auffrischung blockiert, Ownership klären).
- **registry_register Default-ON + Profil-Bindung entfernt (2026-10-02, feature/registry-register-default-on):** FR-1207-Gate jetzt Opt-out (`registryRegister.enabled: false`), `registry_register` profilunabhängig (Registrierung = Instanz-Concern, Workflow-Typ = pro Session); beide Templates emitieren `enabled: true`; README aktualisiert; Review APPROVED 0 HIGH/CRIT. Fast-Forward-Merge nach develop (283fc74..39a0be2, 5 Commits), Branch gelöscht. LOW-Follow-ups REV-RRDO-1/2 (Coverage) in 9f7bc5f geschlossen, FR-FINAL-2 (AGENTS/CLAUDE-CLI-Tabellen) committet; Guidance-Session session-1bb0632b completed (alle Gates grün). Vollauf 537/537.
- **Offen:** Push develop (Nutzerentscheid, ahead 5); Container-Rebuild, bis `registry_register` in der laufenden Instanz sichtbar ist.

- **Guidance-Container-Deployment (2026-09-30)**: Start-Crash (EACCES
  mkdir '/workspaces/.guidance') behoben — veralteter Container mit falschem
  Mount (`/mnt` statt `D:\repos`) wurde per `docker compose up -d
  --force-recreate` aus `servers/server-guidance` ersetzt; `/health` grün
  (`configured:true, reachable:true`), Alt-Container + Relikt-Volume via
  `docker rm -v` entfernt. Start-Discipline-Regel in AGENTS.md
  (Guidance-Sektion) dokumentiert, Lesson in lessonsLearned.md (2026-09-30).

- **Config-Assistant generische Patterns (2026-09-28, Guidance-Session
  session-2c0c15fe, Branch feature/config-assistant-generic-patterns,
  UNcommitted)**: Niyama-Wurzelursache behoben — der FRESH-Generator
  hardcodete den Thinking-MCP-Prettier-Glob als Lint-Op; jetzt `npm run lint`
  (non-blocking). Adopt-Klassifikation: Preset-Ops werden IMMER aus dem
  Target-Fresh-Template regeneriert (divergente Ref-Args → laute
  REGENERATED-Note), nur Non-Preset-Ops werden mit `[adopted]`-Marker
  kopiert; Builtin-Sync-Test gepinnt. README genericity rule dokumentiert.
  Validierung: 57/57 targeted, tsc clean, Guidance-Suite 429/429; build-Gate
  grün; lint/test-Gate-Fails als prä-existierend (Prettier-Drift TMPL-1)
  bzw. umgebungsbedingt (better-sqlite3/musl, TMPL-2) klassifiziert.
  Independent Review: 0 HIGH/CRITICAL.
- **Niyama-Blocker dokumentiert (2026-09-28, NIY-CFG-1/2/3)**:
  session-46a43aeb als infrastructure-blocked gecancelt; Container-Fixes
  (Lint-Glob in Verification-Config, pnpm/musl-Store) getrackt.

- **Kleinkitems L256/L257/L253 (2026-09-26, Guidance-Chain session-3b7f96a5,
  committet als `60b2eddf` auf develop)**: L256 FTS-Coverage —
  observations_fts (Insert-Trigger + Count-Guard-Backfill, 500-Zeichen-Cap),
  searchFullText matcht beide Indizes mit Dedupe (7 Regressionstests);
  L257 Postgres-FTS-Parität — to_tsquery über goal_summary +
  Observations-Auszüge, LEFT JOIN signatures, GIN-Expression-Indexe
  (5 SQL-Contract-Tests; Live-Smoke-Test getrackt); L253 obsolet geschlossen
  (User-Entscheid). 118/118 Tests + tsc + build grün; 2 Independent Reviews
  APPROVED 0 HIGH/CRIT; 2 Lessons geseedet; tracked follow-ups F1/F2/F4–F6
  + index-freshness-Race bei Parallel-Work im remaining-work-plan.

- **CHN-Serie komplett (2026-09-26, 4 Guidance-Workflows + Gesamtreview,
  develop @ `7cb55be`)**: CHN-1 activating-Recovery via retry_operation
  (`17cdf15`), CHN-2 Dogfooding chain.enabled + Image-Lockstep (`49a18bc`),
  CHN-3 Mixed-Manifeste Spec v1.1 §12/FR-119 inkl. HIGH-1-Fix (`52538c3`),
  CHN-4/5/6 chain_end-Audit + Crash-Cache + frische Start-Guidance
  (`bb37f6c`), CHN-R2-2-Testlücke (`7cb55be`). 251/251 Tests, Build grün;
  Final Review: 0 HIGH/CRITICAL, merge-reif. Develop ahead 6 (Push durch
  Nutzer). Getrackt offen: CHN-R2-1/3/4 (akzeptiert), CHN-7.
- **Workflow-Chaining-Spec APPROVED (2026-09-25)**:
- **Workflow-Chaining implementiert (2026-09-25, `feature/workflow-chaining`,
  Guidance-Session `session-802f2c91…` → completed)**: Amendment 002
  (Form A explizite Steps + Form B `spec_kit_tasks`) gemäß FR-110…FR-118 —
  chain-Schema in `start_workflow`, lazy Successor-Creation in
  `completeWorkflowLocked` (Q2 Kopf-Kopie), `activating`-Fail-Closed gegen
  das Crash-Fenster (Plan-Review F1), `specKitTasks`-EngineDeps-Brücke,
  chainTaskScope-Guidance (FR-118), chain.*-Templates fail-closed (Q1).
  243/243 Tests (10 neue Chain-Tests, Spec §10.1–10.11), Build grün,
  detect_changes scope-clean, Index frisch. Docs: README-Section
  „Workflow Chaining“ (plain- + spec-kit-Beispiel). Follow-ups: CHN-1…CHN-3
  (remaining-work-plan). Verify-Gates lint/test schlugen mit prä-existierenden
  Container-Caveats fehl (required:false; native Suite grün).
- **Workflow-Chaining-Spec APPROVED (2026-09-25)**:
  `specs/002-guidance-workflow-server/amendments/002-workflow-chaining.md`
  (Layer 1: `chain`-Manifest, lazy Successor-Creation, `nextSessionId`-
  Response, FR-110…FR-118; Q1–Q3 locked, Q3 revidiert: Form B im
  spec-kit-Profil). Implementierung siehe oben.
- **Guidance-Working-Sample dokumentiert (2026-09-25, `842cd3c` + `b91054a`)**:
  Erster Versuch im Root-README revertet (falscher Ort + deutscher Text);
  final in `servers/server-guidance/README.md` (englisch): Workspace-Pfad-
  Caveat (`workspaceRoot: "/workspace"` bei Docker), Zed-`context_servers`-
  Snippet, Config-File-Map, ** Schritt-für-Schritt-Walkthrough aller 7 Phasen**
  (Instruction, Submission-Schema, Transitions, Gates), Betriebshinweise und
  Beispiel-Prompts.
- **Erster produktiver Guidance-Workflow-Lauf end-to-end grün (2026-09-25)**:
  Session `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` → **completed**.
  Alle Phasen (understand → plan → review → implement → review-fix →
  verify → complete) durchlaufen; `build`-Gate grün (nach Container-Deps-
  Install), `repository-analysis`-Gate grün (GUID-1 geschlossen). Scope:
  README Quick-Start-Verbesserung (docs-only). Erkannte Bugs: ESM-`require`
  (gefixt `5316c88`), Template-Platzhalter (Workaround aktiv, GUID-3 offen).
- **Guidance-Zed-Setup (2026-09-24, `feature/guidance-workflow-setup`)**:
  `.guidance/` im Repo-Root (plain, Standard-Flow), Compose-Override mit
  Repo-Mount + isoliertem node_modules-Volume, Gates konfiguriert (lint/test/
  repository-analysis `required:false` mit dokumentierten Container-Caveats).
  Container-Verifizierung: `/health` configured:true, `/mcp` 200.

- **Root-README user-first (2026-09-16, `6ddba51` + `dd2e00d`)**: Quick Start,
  Toolset-Übersicht, Agent-Guide/Skill-Generator-Doku, Docker-MCP-HTTP-Config
  (`/mcp`-Endpunkt im Code verifiziert); Dev-/Maintainer-Doku via Verweis auf
  die Server-README. Einsteigspunkt enthält jetzt alle Nutzer-Infos.
- **Release 2.0.0 vorbereitet (2026-09-16)**: Server-Merge implementiert und auf
  develop (`1bed87e` + `039c7e3` + Review-Fixes `df0a84a`); Version-Bump auf
  **2.0.0** (package.json + Factory-ServerInfo, branch `feature/release-2-0-0`,
  Typcheck grün). Offen: PR `develop → main` + Publish (User), danach MG-1
  (Deprecation stochastic + Pipeline-Cleanup); GitNexus-Re-Index nach Repo-Umzug
  ausstehend (Index unter altem Pfad registriert).
- **Eval Run 5 (2026-09-15, Hard Set + EV-8-Gegenmittel)**: **98,8 % vs. 74,4 %** —
  3 von 4 Tasks perfekt (Fault-Tree 40/40 Δ+16, Bandit 40/40 Δ+22, Fermi 40/40 Δ0,
  Game 38/40 Δ+1). Die EV-8-Fixes haben beide Run-4-Fehlerklassen eliminiert: kein
  Schema-Flailing mehr (3 Runden statt 6), fermi_estimate korrekt genutzt. Bandit-Actor
  korrigierte sich selbst (falsches epsilon-greedy → thompson 80+60, regret 16.140 ✓).
  Ergebnisreihe Run 3→4→5 (Server-%, gewichtet nachberechnet): 92,5 → 86,9 → 98,8 — Run 4 war der Schema-Flailing-Einbruch, EV-8 hat ihn geschlossen. Rig-Entwicklung abgeschlossen;
  Ergebnisreihe dokumentiert tool-valueThese: Compute-Gap bestimmt Tool-Wert.
- **Eval Run 4 (2026-09-15, Hard Set, gehärtetes Rig: Operator-Prompt/Tool-Call-Log/gewichtetes Scoring)**:
  Aggregat 86,9 % vs. 80,0 %. **Bandit 18→40/40 (Δ +22) und Fault-Tree 36→40/40 (Δ +4)** —
  dort, wo Tools exakt rechnen, was das Modell nicht kann, volle Punktzahl. Game-Matrix −6
  und Fermi −9: Tool-Call-Log zeigt zwei neue Fehlerklassen — (a) Schema-Flailing (4×
  payoff_matrix als Strings statt {row,col}-Objekten, Budget verbrannt), danach Über-
  vertrauen auf den Full-Game-Dominanz-Output statt 2×2-Subgame; (b) falsche Tool-Wahl
  (fermi_estimate übersprungen, VoI mit Sensitivitätsdaten gefüttert, Monats- als
  Jahressumme präsentiert). **These validiert: Tool-Wert = f(Compute-Gap)** — groß bei
  Seeded-State/Enumeration, negativ wo das Modell Solo schon stark ist und Transkription
  neuen Fehleroberflächen schafft.
- **Eval Run 3 (2026-09-15, HARD SET, glm-5.3-flash Actor [thinking:disabled] ↔ glm-5.3 Judge)**:
  erster vollständiger Hard-Set-Lauf — **Bandit-Task Δ +11 (5→16/16, voll)**: Baseline kann
  seeded kumulative Zahlen strukturell nicht faken, Actor machte runId-Fortsetzung exakt
  (regret 16.140). Fault-Tree Δ +2 (14→16/16: Tool liefert Basic-Event-Beiträge exakt).
  Game-Matrix Δ −4 (16→12): Actor verhieb einen Payoff beim Tool-Call-Transcribing
  (col 5 statt 2) → Dominanz-Kriterium 0. Fermi/VoI Δ 0 (beide 16/16, Ceiling).
  Aggregate: Server 60/64 vs. Baseline 51/64 (raw 16er-Skala). Infra-Lektionen:
  Streaming-Reassembly + thinking-Steuerung je Rolle (Actor disabled — Reasoning-Loop
  >6 min/2.8 MB; Judge enabled), attempt-skalierte Timeouts, .env-Loader.
- **RELEASE 1.0.0 (2026-09-15)**: PR `develop → main` gemerged (Branch-Protection),
  Pipelines grün — **npm 1.0.0 via OIDC Trusted Publishing** (tokenlos, Provenance),
  ghcr-Images 1.0.0, Smithery-Re-Publish mit snake_case-Namen. Inhalt: Snake-Case-Rename
  (BREAKING, 12 Tools), Recipe-Runner-Briefings mit example_arguments + result_guidance,
  LLM-Task-Evals (E3 Tier 2), Tier-1-Contract-Evals, Risk-Familie (B1), B2–B5,
  D1–D3, Real Computing. 129/129 Tests. npx-Smoke verifiziert (45 Tools neue Namen,
  recipe_runner-Briefing, prompts).
- **Eval Run 2 (2026-09-15, glm-5.3 als Actor+Judge, korrigierte Rubrik)**: alle Tasks
  Δ = 0 — Baseline holt stark auf (42/120 vs. 25/120 in Run 1), Tools korrekt genutzt
  (recipe_runner-Navigation über Stages, fermi_estimate, value_of_information) aber
  kein Score-Gewinn bei starkem Modell. Methodik-Erkenntnis: Tool-Wert hängt von
  Actor-Stärke und Task-Schwierigkeit ab; härtere Tasks + statefulle Flows (Bandit-
  runId) + evtl. schwächerer Actor für differenzierende Messungen nötig. Judge-Gleich-
  Modell-Bias bleibt Konfounder.
- **Naming-Rename + 1.0.0 (2026-09-15, branch `feature/track-b2-b5`→develop)**: alle 12
  kompakten Tool-Namen auf snake_case vereinheitlicht (`sequential_thinking`,
  `mental_model`, …) — Breaking, Version 1.0.0. ~200 Referenzen über src/tests/Guides/
  READMEs ersetzt; Sync-Kette regeneriert; Smithery-Naming-Score-Effekt beim nächsten
  Rescan verifizieren (Richtung war uneindeutig — Revert via git möglich).
- **Roadmap-Track E3 Tier 2 — LLM-Task-Evals (2026-09-15, branch `feature/llm-evals`)**:
  `evals/run.mjs` (OpenAI-kompatibel, env-gesteuert) läuft je Task **mit/ohne** Server
  (MCP-Stdio-Client + Tool-Loop) und bewertet beide Antworten per LLM-Judge gegen
  gewichtete Rubriken; Report als JSON+Markdown in `evals/results/`. 3 Beispiel-Tasks
  (Risk-Analyse, Postmortem-Reasoning, Guided Decision). Läuft nur manuell
  (`npm run eval:llm`), nie in CI. Noch kein Live-Lauf (API-Key beim Nutzer).
- **RELEASE 0.3.0 (2026-09-14)**: `develop → main` via PR (Branch-Protection aktiv),
  GitHub-Actions-Release-Pipelines grün: **npmjs.com — `@paschbaer/clear-thought@0.3.0`
  via OIDC Trusted Publishing** (tokenlos, Provenance-Badge, Sigstore-Transparenzlog) —
  nach dem 3-Ringe-Debug (Account-2FA-Modus → Package-Access-Option → TP-Stage-Permission,
  siehe lessonsLearned); **ghcr.io-Images** `clear-thought` + `stochasticthinking` mit
  latest/0.3.0/sha-Tags. Registry-verifiziert (`npm view`, npx-Smoke folgt).
  0.3.0-Inhalt: Risk-Familie (B1), Argument-Map/Kausal/Fermi/Game-Matrix (B2–B5),
  Recipe Runner + workflow-Toolset (C), Session-Resources + Prompts + Persistence (D1–D3),
  session_export-Bugfix, Factory-Config-Parse-Fix. 129/129 Tests.
- **Roadmap-Track D (2026-09-14, branch `feature/track-d`, 0.3.0)**: D1 Session-Resources
  (`clear-thought://session/{stats,export,thoughts,workflows}` via `registerResource`),
  D2 Workflow-Prompts (6 Rezept-Prompts via `registerPrompt`, je eine User-Message mit
  recipe_runner-Anweisung), D3 File-Persistence (`session_save`/`session_load` im Session-
  Toolset, `dataDir`-Config, Pfad-Sanitizing). **Fand dabei einen latenten Factory-Bug**:
  unparsed Config → `sessionTimeout` undefined → sofortiger Cleanup-Timer leerte den Store
  zwischen Tool-Calls — Factory parst jetzt defensiv (`ServerConfigSchema.parse`).
  129/129 Tests (8 neue Track-D-Tests).
- **Roadmap-Track B2–B5 (2026-09-14, branch `feature/track-b2-b5`, 0.3.0)**: vier neue
  statelose Analyse-Tools im `reasoning`-Toolset — `argument_map` (Toulmin-Vollständigkeit
  mit Leitfragen, 6 Elemente), `causal_graph` (dual-mode: Intervention/Counterfactual-Fragen,
  Confounder- + Root-Kandidaten, Zyklen/Unknown-Refs-Validierung), `fermi_estimate`
  (Multiplikations-/Summenkette + Sensitivitätsranking, deterministisch), `game_matrix`
  (strikte Dominanz, beste Antworten, Pure-Nash, gemischte 2×2 geschlossen). 10 neue
  Hand-verifizierte Tests (PD-Nash, Stag-Hunt 2×Nash + Mixed 0.5, Fermi-Sensitivität
  ±20 % > ±10 %); 121/121 Tests, Audit 43/43 sauber.
- **Roadmap-Track B1 — Risiko-Familie (2026-09-14, branch `feature/risk-family`, 0.2.0)**:
  drei neue dual-mode Tools — `premortem` (Failure-Cause-Ranking + Mitigation-Coverage),
  `fmea` (RPN = S×O×D mit Threshold-Flagging), `fault_tree` (exakte AND/OR-Auswertung +
  Contribution-Ranking der Basic Events) — plus neues `risk`-Toolset (5. Toolset).
  Registry-Metadaten für alle 37 Einträge; 103/103 Tests. Hand-verifizierte Werte:
  FMEA-RPN 120/40/24, Fault-Tree P_top 0.314 mit B3-Dominanz.
- **Roadmap-Track C — Recipe Runner (2026-09-14, branch `feature/recipe-runner`, 0.3.0)**:
  alle 6 Guide-Rezepte als Daten (`src/recipes/index.ts`), `recipe_runner` mit
  per-session Fortschritt im neuen `WorkflowStore` (start/status/advance/reset/list,
  Auto-Start), `workflow`-Toolset (6. Toolset). Guide + Root-AGENTS.md dreifach
  synchron; 111/111 Tests (8 neue Workflow-Tests), Audit 39/39 sauber.
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
- **npm publish (2026-09-14, E-Plan Phase 2)**: `@paschbaer/clear-thought` (aktuell
  **0.2.0** inkl. Risiko-Familie, manuell published nach 2FA-Modus-Umstellung) +
  `@paschbaer/stochasticthinking@0.1.1` live on npmjs.org (registry-verified,
  npx-ready; bin-guard fix `0c6daca` — 0.1.0 was a silent no-op via npx
  because bins run through .bin symlinks). READMEs document npx-based MCP
  client configs; npm-12/GAT-deprecation auth strategy recorded in the plan.
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

- Extension roadmap (`plans/extension-roadmap.md`): **A ✅ B1–B5 ✅ C ✅ D1–D3 ✅
  E1–E3 ✅ — Roadmap vollständig abgearbeitet (Release 1.0.0, 2026-09-15).**
  Verbleibende optionale Punkte: D4 (Sampling), orchestrierter Recipe Runner
  (in geänderter Form, bewusst zurückgestellt — Anleitungs-Form ist drin).
  Naming: 4.44pt trotz Rename (Hypothese falsifiziert) — akzeptiert, kein
  weiterer Breaking-Rename.
- Optional (done, pending rescan): tool-name de-snake-casing executed in 1.0.0
  to close the Smithery Naming gap (~4pt, see RB-9-history) — the breaking
  major version.
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

- 2026-09-15 (Server-Merge, nachgetragen via Terminal-Append): Merge
  stochastic → clear-thought auf `feature/merge-stochastic-into-clear-thought`
  implementiert (Phasen 0-5 des Plans) — Algorithmen als Toolset `stochastic`
  bei unverändertem Tool-Namen `stochasticalgorithm`, BanditRunStore in
  SessionState, Rezept 7 `decision-under-uncertainty` + stochastic-Stage in
  `architecture-decision`, 7. Prompt, konsolidierter Guide (Root-AGENTS.md via
  echtem Handler regeneriert), READMEs migriert. Gezielte Tests 30/30 + 18/18
  grün; Typecheck grün; Full-Suite lokal unter drvfs unter Worker-Timeouts
  (CI autoritativ). Offen: Phase 6 (Release 1.1.0 + Deprecation, MG-1).

## 2026-09-18: EMMS MVP (server-experiencememory)
**What works:** Vollstaendiger Capture->Validate->Finalize-Zyklus; Hybrid-Retrieval (exact/normalized hash, FTS5, env-Applicability mit D6-Penalties); Guidance-Envelope auf jeder Antwort; Redaction + content-addressed Artefakte; Visibility-Isolation; Optimistic Concurrency; Idempotenz; Audit; SC-001 Baseline-Harness mit 30-Task-Korpus. 58/58 Tests gruen.
**What's left:** T045 detect_changes + Commit (wartet auf Freigabe); golden-results.md manuelle Durchlaeufe; lessonsLearned-Eintraege.
**Current State:** MVP funktional komplett auf Branch 001-experience-memory-server.

UPDATE 2026-09-18 (2): T045 gitnexus analyze --no-stats ausgefuehrt (2425 Nodes/5562 Edges). T046: Suite 58/58 + Typecheck OK; offen nur noch reviewer-manuelle Teile (quickstart G1-G3 live, spec-quality Checker-Marken, Freigabe).

UPDATE 2026-09-18 (3): T046 ABGESCHLOSSEN. Golden-Paths G1-G3 + Zusatzszenarien automatisiert (tests/fixtures/golden-g1-g3.test.ts), 21/21 PASS, Gesamt-Suite 59/59. Service-Verbesserung: environment_fact-JSON befuellt jetzt Env-Dimensionen fuer Applicability-Ranking. Commits: 78c1170 (MVP), c6f9048 (golden paths). 48/48 Tasks erledigt. Branch 001-experience-memory-server fertig; Merge nach Strategy (squash zu main / rebase zu develop) Rebase auf develop abgeschlossen (fast-forward).

UPDATE 2026-09-18 (4): SEMANTIC RETRIEVAL ARM AKTIV. @xenova/transformers (all-MiniLM-L6-v2, quantized, 384 dims, lokal/offline) per lazy load; Embeddings pro Episode gecacht; D6-Gewicht 0.24; graceful degradation ohne Provider. 63/63 Tests (4 neue Contract-Tests: Vektor-Eigenschaften, Paraphrase-Retrieval, Degradierung). Commit 6c290ad auf develop (via ff-merge feature/emms-semantic-retrieval).

UPDATE 2026-09-18 (5): DOCKER-DEPLOYMENT (analog server-clear-thought). Dockerfile (node:22-alpine, non-root, Healthcheck :3002, native better-sqlite3-Rebuild im Image), docker-compose mit persistentem emms-data-Volume, .dockerignore, EMMS_STORAGE_PATH-Env-Fallback in resolveConfig. Build + Live-Smoke via HTTP (StreamableHTTPClientTransport): 16 Tools, workflow.start mit Guidance. Fix waehrend des Tests: Default-Store in Volume verlagert (node-User konnte root-owned Pfad nicht oeffnen). Commits: ec25fa7, 8859a3e, aa11a2c.

UPDATE 2026-09-18 (7): POSTGRESQL+PGVECTOR ADAPTER (D, Team-Phase). Entscheid (clear-thought decision_framework, 3 Iterationen): Option A — lazy dynamic import, pg als Runtime-Dep (nur bei Backend-Postgres geladen), SQLite bleibt Default. PostgresAdapter implementiert vollen StorageAdapter-Contract (Schema-Paritaet, Embeddings als vector(384) via pgvector). Backend-Auswahl via EMMS_STORAGE_BACKEND=postgres + EMMS_PG_CONNECTION_STRING. Migrationspfad: migrate-to-postgres.ts (One-Shot-CLI, alle Tabellen + Env-Dims + Vektor-Embeddings, rawUpsert-Helper). 66/66 Tests, Typecheck gruen. Commit 6b3e539, gemerged auf develop.

UPDATE 2026-09-18 (8): LEVEL-2 AUTOMATISIERUNG AKTIV. Trigger-Domaenen-Tabelle (7 Domaenen -> Suchkeywords) in AGENTS.md + CLAUDE.md eingepflegt; experience_search mit scope thinking-mcp-lessons bei Task-Start in Trigger-Domaenen; Treffer folgen + reuse_feedback; neue Traps via seed-lessons.mjs. Commit 8176b5f. Push pending.

UPDATE 2026-09-18 (9): CAPTURE-HOOK (Variante 1b) UMGESETZT. .github/prompts/capture-lessons.prompt.md — /capture-lessons: Session-Analyse -> lessons JSON -> seed-lessons.mjs (idempotent) -> experience_search-Roundtrip -> lessonsLearned.md-Eintrag. README dokumentiert die Hook-Varianten (Prompt-File implementiert; Git-Post-Commit-Hook und VS-Code-Extension dokumentiert mit Trade-offs). Commit 0043ead.

UPDATE 2026-09-18 (10): SETUP_EXPERIENCE_MEMORY MCP-TOOL (analog agents_guide). Marker-basierter idempotenter Merge in AGENTS/CLAUDE (emms:lookup-rules:start/end), Capture-Prompt (skip bei non-empty), Gitignore (nur fehlende Zeilen appenden), custom_triggers fuer repo-spezifische Domaenen. 8 Contract-Tests. 74/74 gruen. Commit 75915f5. Nutzen: Server reist mit dem Tool — kein Prompt-File-Copy in Ziel-Repos noetig.

UPDATE 2026-09-18 (11): LESSON-CONSOLIDATION (B, FR-022). LessonService wired; 3 MCP-Tools: lesson_propose (mit NO_SUPPORTING_EVIDENCE-Guidance bei 0 verifizierten Episoden), lesson_search, lesson_get. Promotion-Thresholds D5: 1=candidate, 2=provisional, >=3=verified; harmful Attempt mit gleicher Signatur = contested (FR-021: contradicting outcome). 8 Contract-Tests. 81/81 gruen. Commit 42b65c0.

UPDATE 2026-09-18 (12): CROSS-PROJECT LESSON VISIBILITY. Visibility-Level 'public' (Spec §18.3): public Episoden in Suchergebnissen unabhaengig vom Aufrufer-Scope. lesson_publish/lesson_unpublish MCP-Tools (auditiert). Bug-Fix: saveEpisode hatte visibility nicht im UPDATE — vom Cross-Scope-Contract-Test gefunden. 3 Tests; 85/85 gruen. Commit aa60983.

UPDATE 2026-09-18 (13): PUBLISHING SETUP. smithery.yaml, scripts/build-mcpb.mjs (analog clear-thought), pg als optionaler peerDep (lazy import). build:mcpb + deploy Scripts. Bereit fuer npm publish + Smithery deploy (Maintainer). 85/85 gruen. Commit 5b2ae9b.

UPDATE 2026-09-18 (14): LEVEL 3 AUTO-CAPTURE HOOKS. finalize(verified) auto-propose Lesson aus Episode-Signatur (non-blocking, auto_lesson im Response). Git post-commit Hook (auto-capture-hook.mjs): Error-Pattern-Detection in Diff, EMMS_AUTO_CAPTURE=0 zum Deaktivieren. npm Scripts: capture + auto-capture. 85/85 gruen. Commit d31b921.

UPDATE 2026-09-18 (15): CONSOLIDATION WORKER (Phase 3). ConsolidationWorker: Timer-basierte Hintergrund-Tasks (Stale-Scan, Auto-Dedup, Lesson-Promotion), 5-Min-Intervall (unref). StorageAdapter erweitert um listScopes() + findAllEpisodes() (beide Adapter). Wired in tools/index.ts. 5 Contract-Tests; 91/91 gruen. Commit 5cc6512.

## 2026-09-22 — experience_seed_lessons tool (feature/seed-lessons-tool)
- **What works:** New MCP tool `experience_seed_lessons` (server-side batch lesson seeding, idempotent per slug, per-lesson result reporting). `scripts/seed-lessons.mjs` reduced to a thin MCP client (HTTP default, stdio fallback). Master prompt `.github/prompts/capture-lessons.prompt.md` calls the tool directly — works in any repo without a Thinking-MCP checkout. Migration script `scripts/migrate-stdio-store.mjs` (stdio store → HTTP store) added earlier on this branch.
- **What's left:** Sync prompt copies in other repos; rebuild/redeploy the Docker image so HTTP clients get the new tool; sync prompt copies after merge.
- **Current state:** 4 new contract tests green; full suite 98/99 (golden-g1-g3 timeout flake under full-suite load only — passes isolated).

## 2026-09-23: Works / Left / State
- **What works:** clear-thought + insight laufen ohne Smithery auf direktem SDK-Streamable-HTTP (stateful Sessions); Dockerfiles ohne Sed-Patch; insight deterministisches npm ci mit eigenem Lockfile; Root-Compose mit Bind-Host-Vars; Session-Reaper (60min TTL, 500er Cap); alle Unit-Tests (152+99) grün; Container-E2E per SDK-Client verifiziert (47/20 Tools, Tool-Calls OK).
- **What's left:** Merge von feature/sdk-streamable-transport-migration nach develop (Rebase) steht aus; akzeptierte Review-Beobachtungen (400/-32700-Parse-Error, nicht registrierte Wegwerf-Sessions, Smithery-Reste) getrackt im remaining-work-plan; Smithery-Deploy-Strategie (Scripts + smithery.yaml) zu entscheiden.
- **Current State:** Feature-Branch 1caa690, Review-HIGHs geschlossen, bereit für Merge nach develop.

### 2026-09-23 — setup_clearthought Retry-Loop-Serie (abgeschlossen)
**What works:** Endless-Retry-Loop vollstaendig behoben, in 5 Stufen:
(1) status-first Serialization + one_shot-Note, (2) serverseitiger Loop-Guard
(short loop_detected ab 3. Full-Call), (3) Pagination (~4.5KB/Part, part-N-Abruf,
guard-exempt), (4) Eskalation auf isError:true (refused_do_not_retry) nach
3 geblockten Versuchen, (5) Compact-Guide als Default (~7KB, 1-2 Parts statt 5)
mit detail:'full' Legacy-Modus und section:'recipes' On-Demand-Abruf.
157->160 Tests gruen; root AGENTS.md-Regen auf detail:'full' gepinnt.
**What's left:** 3 getrackte Follow-ups (siehe remaining-work-plan.md); Push der
neueren Commits (a5c5c98) + Docker-Rebuild ausstehend (SSH-Agent je Terminal).
**Current state:** develop = origin/develop + a5c5c98 (lokaler Commit);
alle Server-Commits reviewed, 0 HIGH/CRITICAL.


### 2026-09-24 — Bestandsplan-Abarbeitung (1a + 2d + 2e + 2c + 2a + 2b, abgeschlossen)
**What works:** Sämtliche Code-Pakete des Bestandsplans umgesetzt, je eigene
Feature-Branches mit Tests + tsc + build + Review-Protocol:
- 1a (7dbfa92): Remote-Restart-Persistenz — workflowToRemote-Bindings,
  ClientOpLedger, lastAttempt in state.json je Session (formatVersion 2),
  Rebuild beim Boot; v1-Sessions tolerant. Review APPROVED (R-1..R-3 getrackt).
- 2d (18b27cf): Spec-Kit-Hygiene — Parser-Dead-Code, hasSection, Debris-Import;
  require-in-ESM-Crash in readdirSyncSafe behoben; criteria bold-only gefixt;
  F7 toter Conjunct; Caps als reserved dokumentiert.
- 2e (ffdf393): Capability-Hash-Pins persistent (capability-hashes.json,
  merge-on-save) — Drift nach Restart wird erkannt statt neu gepinnt; F8-
  Testlücken (contracts/removed-task/terminality/waiver-fields).
- 2c (9bcc6c6): Egress-Content-Checks (restricted blockt Credential-Werte),
  Downstream-Redaction-Seam (content + structuredContent via redactUnknown),
  Multi-line-Redaction. Review APPROVED (R-6..R-8 getrackt).
- 2a (27df359): Snapshot-Chaining (importArtifacts mit previous, History-
  Erhalt, Blocking-Refresh wipet Kette nicht mehr) + interne Staleness-
  Berechnung (Hash statt Caller-Flag). Review APPROVED (R-11..R-14 getrackt).
- 2b (29b22c2): F6 Lifecycle-Guards (approve/reject terminal, apply nur nach
  Approval, GuidanceError bei unbekannter Id, Status "approved"); F5
  spec_kit_criterion_waived; M3 cancelled+Audit für entfernte unfertige
  Tasks; M1 relative Contracts-Pfade (Relocation-safe); refresh wendet
  buildReconciledState an (Task-Fortschritt überlebt); 2 neue Tools
  approve_plan_change/apply_plan_change. Inventur: SpecKitState-Persistence
  war bereits realisiert (stale Eintrag).
**What's left:** Push (29b22c2 + Docs); docker compose up --build (CB-4-Binding);
Smithery-Decision + CB-22; CB-21 Spec-Amendment; Kleinkitems L253/256/257.
**Current state:** develop@29b22c2 — Bestandsplan Code-Pakete vollständig
abgeschlossen (189/189, tsc, build).

### 2026-09-24 — Smithery Option A + CB-20 insight-Auth (abgeschlossen)
**What works:** Cluster 3 Entscheidung A (d566d94): stdio-yamls für
clear-thought/insight modernisiert, tote deploy/build:smithery-Scripts
entfernt, stochastic unverändert; Review APPROVED (R-20/R-21 → CB-22).
CB-20 (3c4f36f): EMMS_AUTH_TOKEN (timing-safe Bearer an /mcp POST/GET/DELETE,
unset = offen, compose-Passthrough + README) — insight remote-fähig.
106/106 + tsc + build grün.
**What's left:** Push; docker compose up --build; CB-21 Spec-Amendment
(Downstream-Support); CB-22 Publish + Rescan beim nächsten Release;
L253/256/257.
**Current state:** develop@3c4f36f — alle Code-Pakete + Smithery-Decision +
Auth abgeschlossen; offen nur CB-21 (Spec) + CB-22 + Kleinkitems.

### 2026-09-24 — Guidance Security-/Policy-Verifikation + Rest-Fixes
**What works:** Phase 5/6-Security-Fixes verifiziert (Egress-Inhaltsprüfung,
redactUnknown-Seam inkl. protocolMetadata, Multi-Line-Redaction,
Pin-Persistenz über Restarts); Rest-Fixes umgesetzt (atomarer Pin-Write,
Persistenz-Regressionstest). 197/197 Tests + tsc grün (Container-Verifikation).
Memory-bank gesynct (L264/L266/CB-1/CB-2/CB-9 → [x] mit Evidence).
**What's left:** Metrics-Tool (L260); awaiting_client-Downstream-Spec
(L305d); Push der neuen Commits; danach Guidance produktivsetzbar.
**Current state:** Security-/Policy-Lücken geschlossen — Guidance aus
Sicherheits­sicht produktionsreif; Rest = Ops/Monitoring + Remote-Downstream-Spec.

### 2026-09-26 — Feature 003 Toolchain-Bootstrap (Chained Workflow abgeschlossen)
**What works:** run_operation-Tool (fail-closed invocableByAgent),
FR-107/109/110-Locking (inkl. Stale-Lock-Recovery), Dockerfile python3+uv
0.12.19, Python-Beispielprofil (uv sync --locked fail-closed), E2E
SC-001..004. 268/268 + tsc + build grün. Unabhängiger Review: HIGH gefixt,
Rest getrackt. Commits 77fa854 + Review-Fix auf
feature/guidance-toolchain-bootstrap; Merge nach develop erfolgt.
**What's left:** R-006 (E2E-Lücken, braucht async-Op-Engine), R-008a
(globaler Lock), R-010 (ERROR_CODES-Test), Scaffold-Spracherkennung,
Named-Volume-Venv, FR-110-Hard-Kill — alle in remaining-work-plan getrackt.
**Current state:** Feature 003 funktional komplett und gerettet; develop
aktualisiert, Feature-Branch gelöscht (nach Merge).

### 2026-09-25 — Guidance HTTP-Downstream (gitnexus/insight via HTTP/Docker)
**What works:** `transport.type "http"` für downstream-servers.json (URL +
Header mit `${ENV_VAR}`, fail-closed beim Config-Load); Egress-Host-Allowlist
`policies.egress.httpHostAllowlist` (Pflicht bei http, exakter Match);
ClientManager `DownstreamTransportConfig` + StreamableHTTPClientTransport;
WorkflowEngine-Durchreichung; README-Doku (Config-Beispiel insight via
host.docker.internal). 206/206 Guidance-Tests + tsc grün.
**What's left:** HD-1 (Reconnect, MEDIUM — bleibt getrackt, vom Merge
unberührt), HD-3-Rest (stateful-Session als automatisierter Test); Merge nach
develop (Rebase). GitNexus: Docker-MCP sieht D:\repos nicht (HD-4-Rest,
akzeptiert).
**Current state:** HTTP-Downstream committed (e601515); HD-2 verdrahtet
(per-Server-Handshake-Timeout, Config-Validierung, Tests) — 209/209 + tsc
grün, detect-changes risk MEDIUM (nur erwartete Symbole).

### 2026-09-25 — HD-1 Reconnect implementiert
**What works:** `connection.reconnect` {enabled, maximumAttempts,
delayMilliseconds} verdrahtet: ClientManager speichert pro Server die
Verbindungsparameter, verwirft nach transport failure den toten Client und
wiederholt Handshake+Call bis maximumAttempts; Config-Errors werden nie
retryt; Validierung fail-closed; 5 neue Tests. 214/214 + tsc grün;
detect-changes MEDIUM (erwartete Symbole).
**What's left:** Push von develop (2 Commits ahead); HD-3-Rest (stateful
automatisierter Test); Backoff exponentiell/Jitter bewusst offen.
**Current state:** Alle reconnect-Funktionstests grün — Downstream-Restarts
(insight/gitnexus) überlebt guidance nun ohne Neustart.


## 2026-09-27: Spec-Kit-Entwurf specs/008-multi-workspace
- Draft spec.md angelegt (FR-801…807, US1–US4, AC-1…5, Out of Scope). Nummer 006/007 waren vergeben → 008.
- Blockiert auf Nutzer-Entscheidungen Q1 (Topologie), Q2 (Config-Quelle), Q3 (Tool-Surface), Q4 (State-Lage), Q5 (Lock-Scope) — je mit Empfehlung.
- Clearthought-Server war während der Planung nicht erreichbar (3x Timeout); Planung manuell strukturiert dokumentiert.


## 2026-09-27: specs/008-multi-workspace — Entscheidungen gefasst, Plan/Tasks nachgezogen
- User-Entscheidungen: Q1 1-Container-Registry; Q2-Q5 = Empfehlungen (guidance.json workspaces[], statisch, State im Repo, per-Workspace-Lock).
- spec.md: Open Questions → Decisions-Sektion; FR-801..805 konkretisiert (keine Varianten-Sprache mehr). plan.md (P1-P7 + Risiken) und tasks.md (T1-T16) angelegt.
- Naechster Schritt: Implementierung im Feature-Branch (feature/multi-workspace), Batch-Modus max 3 Tasks.


## 2026-09-27: Clearthought-Review specs/008 (3-Personen-Kritik, 8 Findings)
- Server wieder erreichbar (collaborative_reasoning, Kritik+Integration). Findings eingearbeitet:
  FR-802 realpathSync beidseitig; FR-807 gitignore-Pflicht .guidance/state + Deployment-Validierung (nicht gemounteter Root = klare Meldung); FR-808 NEU Observability (/health Registry-Exposure, get_metrics Workspace-Dimension); AC-2 Traversal/Case/Symlink-Testmatrix; AC-5 globale Invalidierung bewusst festgeschrieben (workspace-scoped = Out of Scope).
- plan.md P3 als groesster Posten markiert (Komponenten-Parametrisierung statt N Instanzen); tasks.md T5/T7/T14 erweitert, T17 neu.


## 2026-09-27: Spec-Kit-Prompt fuer Feature 008 erstellt
- .github/prompts/spec-008-multi-workspace.implement.prompt.md (Konvention wie capture-lessons.prompt.md: Front-matter + Procedure).
- Inhalt: Kontext (Artefakte + Schlüsselstellen index.ts/register-tools.ts/SpecKitEngine/workspace-lock), AGENTS.md-Regeln (Feature-Branch, GitNexus impact/detect_changes, Clearthought, Review Evidence Protocol), Phasen P1-P7 mit Task-Referenzen, Evidence-gebundene Checkbox-Pflege, Acceptance AC-1..AC-5.

## 2026-09-27: Hygiene-Sync + FR-Namespace-Bereinigung (pre-008)
- LOW-Closure-Labels FR-801..804 → LR-1..LR-4 umetikettiert (Code-Kommentare, 2 Testnamen, Prompt-Header, memory-bank) — Kollision mit specs/008 FR-801..808 bereinigt.
- 006/007 tasks.md: alle Checkboxen [x] + Evidence-Nachträge; Status 005/006/007 → Implemented (2026-09-27).
- memory-bank: F3/F5/F7 (2026-09-26-Sektion) + L2/L3 auf [x] mit Evidence; L4 INFO bleibt offen (bei Bedarf).
- detect_changes: GitNexus 2x Timeout — Ersatz via git diff (nur Kommentare/Testnamen, kein Verhalten). SUITE NICHT LOKAL GELAUFEN (kein Node auf Host); Testnamen-Renames sind string-safe.
- LESSON: sed -i auf CRLF-Dateien (specs/005,006) hat Whole-File-Rewrite erzeugt (132/132 lines) — mit git checkout wiederhergestellt und perl -pi -e (CRLF-erhaltend) verwendet. Künftig Status-Edits in CRLF-Dateien nur mit perl oder edit_file.
- specs/008-multi-workspace implementiert: 17/17 Tasks, Suite 326 passed (5 pre-existing), tsc+build clean, P2-Gate 0 HIGH/CRIT. Offen: Merges zu develop (feature/multi-workspace + feature/release-batch-tool), Push.

## 2026-09-27: Option B Deployment + Scaffold-Default-Workspace
- docker-compose.override.yml: relative Mounts ../../:/workspace + ../../../:/workspaces (Repo-Pool, D:/repos) — keine absoluten Pfade mehr; Niyama als /workspaces/Niyama registriert (workspaces[] in .guidance/guidance.json), /health zeigt beide reachable.
- Scaffold erweitert: ensureConfiguration/scaffoldIfMissing nehmen workspaceRoot und schreiben den Default-Workspace explizit in die generierte guidance.json (FR-801/806) — Registry ab Tag 1 sichtbar/editierbar.
- CRLF-Lesson erneut bestätigt (main.ts): node-Patches CRLF-safe via Regex.

## 2026-09-27: Spec-009 Delta-Re-Review (R-1…R-5)
- What works: Alle 5 R-Fixes in spec.md verifiziert (R-1 inhaltlich gelöst, R-2/R-3/R-4 gelöst, R-5 weitgehend); 0 HIGH/CRITICAL offen → Spec freigegeben.
- What's left: N-D1 (plan/tasks policies-Kopie-Restdrift, MEDIUM), N-D2/N-D3 (LOW), N-D4 (INFO) — in remaining-work-plan.md getrackt.
- Current State: Spec 009 plan-reif nach 1-Zeilen-Fix N-D1 in plan.md/tasks.md.

## 2026-09-27: specs/009 Config-Assistant-Extensions implementiert
- feature/config-assistant-extensions: 15/15 Tasks. configSource-Frage (fresh|adopt), Adopt-Generator (Regeneration downstream/policies/responses/operations, Kopie workflow/schemas, adoption-Block), instructions.global-Slot + loadConfig-Validierung + guidanceForPublic-Injektion.
- Tests: 341/341 im Container (inkl. 5 zuvor pre-existing final-review-gate — im Haupt-Checkout grün). tsc + build clean.
- Offen: Merge zu develop + Push (Entscheid Nutzer), Guidance-Session session-2900015e Lifecycle per complete_workflow abschließen.

## 2026-09-27: specs/009 merged, develop gepusht, Container mit Multi-Workspace + 009 neu gebaut
- /health zeigt niyama + thinking-mcp beide reachable (T17 live).
- Live-Validierung (Niyama-Onboarding) erfolgt durch den Nutzer mit bereitgestelltem Prompt (siehe Chat).

## 2026-09-27: Session-Handoff — specs/010 Implementierung läuft (T1-T4 done, T5-T10 offen)
- Guidance-Session session-6f80021f-6555-4c94-bb51-0fd3b4a32dba: Phase implement, Batch b1-gate-script (T1-T4) in_progress — Zustand persistiert (persistAfterEveryOperation), Wiederaufnahme per import_spec_kit_artifacts + Batch-Release via State-Injection (Workaround dokumentiert).
- DONE in dieser Session: Gate-Skript check-docs-drift.mjs (4 Checks, rein lesend), erster Gate-Lauf fand echten Drift → saniert (Exit 0). Q3-Sanierung 80 ERROR-Codes-Tabelle + Status-Hygiene. Q1/Q2 umgesetzt: docsImpact-Feld NOCH NICHT implementiert (T6/T7 offen)!
- OFFEN für nächste Session: T5 (operations.json + workflow.json beforeExit-Reihenfolge VOR final-review-gate), T6/T7 (docsImpact-Feld + lifecycle-Tests), T8 (README-Assistenten-Kapitel für 009), T9/T10 (Final-Regression + Memory-Bank).
- WICHTIG: 009-Tasks T3-T15 aus tasks.md 009 sind NICHT die 010-Tasks — 010 hat eigenes T1-T10 (siehe specs/010-documentation-drift-gate/tasks.md, Stand: T1-T4 offen als nächster Implementierungsschritt).
- Push: develop ist ahead (Stand: 3d47b53 +以下). feature/config-assistant-extensions gemerged (009-Teil 1). Restliche Feature-Branches sind Parallel-Chat-Arbeit.

## 2026-09-27: specs/010 Documentation-Drift-Gate VOLLSTÄNDIG implementiert (T1-T10)
- What works: T5 Verdrahtung (docs-drift-Op required/read_only/60s in operations.json; workflow.json complete.beforeExit VOR final-review-gate — headCommit-Schutz); T6 docsImpact-Pflicht in submit_task_implementation-Evidence (DOCS_RELEVANT_PATTERNS: src/mcp-server/, src/setup/, src/config.ts, src/types/errors.ts, specs/, README.md; "updated: <file>"|\"none: <reason>\", sonst submission_invalid; Default none); T7 lifecycle-Tests (3 neue, fehlt/none/updated); T8 README-009-Kapitel durch Vorgängersession abgedeckt (verifiziert); T9 Q3-Sanierung verifiziert (005/006/007 Implemented, 006/007 0 offene Checkboxen); T10 Regression: 344/344 Tests, tsc, build grün; Gate Exit 0.
- What's left: Commit + Push auf develop; GitNexus-Index-Refresh vor complete_workflow (Completion-Gate index-freshness).
- Current State: specs/010 implementierungsmäßig abgeschlossen; Batch-/Task-Lifecycle per dokumentiertem State-Injection-Workaround gesetzt (Client ohne release_batch/verify_task); Inject-Skript nach Lauf gelöscht.

## 2026-09-27: Rest-Findings-Batch (Guidance-Session session-4e4471f2, feature/rest-findings-batch)
- T1 FR2-L1: docsImpact bare-prefix ("updated:"/"none:" mit leerem Rest) → submission_invalid; Tests ergänzt.
- T2 FR2-L2: Case-sensitives README-Toolzeilen-Matching per Test verankert (Contract bereits dokumentiert).
- T3 Ops-Hygiene: repo-weite Prettier-Normalisierung (149 Dateien, Format-only, git diff -w verifiziert) — lint-Op grün; operations.json lint/test-Beschreibungen mit Konvergenzpfad.
- T4 AD-1: Adopt übernimmt nicht-generische Referenz-Ops in operations.json ([adopted from reference]-Marker im description); Coherence-Check bleibt strikt; Repro-Regressionstest mit realistischer Referenz (beforeExit mit Gates) grün; alter N-2-Test angepasst (Op fehlt in Referenz → fail-closed).
- T5 AD-2: referencePath-Help + README erwähnen builtin-Referenz examples/default-guidance.
- T6 N-D1/N-D4 bereits gefixt (verifiziert); N-D3: FR-909-Block in spec.md 009 ergänzt.
- Verification: 360/360 + 24 fokussiert nach Prettier, tsc, build, docs-drift Gate, prettier --check grün.

## 2026-09-27: specs/011-adopt-templates
- What works: builtin-Adopt-Template (FR-971–974, AC-1–AC-4) komplett implementiert + getestet (20 Fokus-Tests, Suite 369/369, tsc/build grün). Env-Override GUIDANCE_BUILTIN_TEMPLATE_DIR. 2 latente Adopt-Bugs aus 009 gefixt (adoption-Schema-Slot, Insight-Op-Erkennung).
- What's left: Commit/Push, gitnexus analyze vor complete_workflow (Index-Freshness-Gate).
- Current State: Implementierung auf feature/011-adopt-templates fertig, unvercommittet.

## 2026-09-28: specs/011 gemerged (develop, fast-forward 395ae1e..2fe7338)
- Merge: feature/011-adopt-templates → develop per --ff-only (Rebase entfiel, develop war nicht weitergelaufen). Post-Merge-Suite 370/370 grün. Feature-Branch gelöscht.
- Offen: Push auf origin/develop (ahead 6) — wartet auf Nutzerentscheid.

## 2026-09-28: specs/011 Follow-ups gemerged (develop, fast-forward d809e92..47c0c9f)
- Merge: feature/011-adopt-wizard-fixes → develop per --ff-only. Pre- und Post-Merge-Suite je 377/377 grün. Feature-Branch gelöscht. Enthält: Wizard-Warte-Pflicht in Sample-Prompts, clearthought Default-Profil (downstream + policies :3000 + Template), derived-Fragen-Skip im Adopt-Mode, Container-Only-Self-Containment (eingebettete Gate-Skripte, zero-dep-Seeder, mounted-Warnung).
- Offen: Push auf origin/develop (ahead 3) — wartet auf Nutzerentscheid. niyama: Regenerate mit korrigiertem Wizard nötig (Alt-Config enthält Paket-Pfad-Referenzen).

## 2026-09-28: specs/012 gemerged (develop, fast-forward 1b5ba2f..3356d1e)
- Merge: feature/012-adopt-response-wisdom → develop per --ff-only. Pre- und Post-Merge-Suite je 386/386 grün. Feature-Branch gelöscht.
- Inhalt: Responses-Adoption (FR-981), responses.json-Pflicht + Phasen-Deckung (FR-982, breaking für Alt-Referenzen), generischer Spec-Drift-Gate im Default-Profil (FR-983/984, neues Embedded-Skript check-spec-drift.mjs), Hardening (FR-985).
- Offen: Push auf origin/develop (ahead 4) — wartet auf Nutzerentscheid. niyama: Regenerate mit neuem Wizard-Stand (ab 3356d1e) für Responses-Wisdom + Spec-Drift-Gate.

## 2026-09-28: specs/013-wisdom-baseline — Workflow abgeschlossen (session-14fd6161, feature/013-wisdom-baseline)
- Alle Completion-Ops grün (docs-drift, final-review-gate, index-freshness, repository-analysis, capture-session-lessons). HEAD nach Doku-Commits: c491ef9 (amend: spec-Status Implemented).
- What works: Zwei Responses-Baselines (fresh generisch + Drift-Guard; adopt rendert kuratierte Wisdom-Baseline mit Platzhaltern/Bedingungsblöcken), mounted-Fallback 012-kompatibel, Renderer fail-closed. 395/395 Tests, tsc/build grün, detect-changes LOW, beide Reviews 0 HIGH/CRITICAL.
- What's left: Push + Merge nach develop; niyama-Regenerate mit Stand ≥ deaa1de.

## 2026-09-28: specs/013 gemerged (develop, fast-forward fa4271a..a0266d1)
- Merge: feature/013-wisdom-baseline → develop per --ff-only. Pre- und Post-Merge-Suite je 395/395 grün. Feature-Branch gelöscht.
- Inhalt: Zwei Responses-Baselines (fresh generisch + Drift-Guard; adopt rendert responses-wisdom.json mit Platzhaltern/Bedingungsblöcken), mounted-Fallback 012-kompatibel, Renderer fail-closed (Unknown-Token/Unbalanced/Strict-Leftovers für Wisdom).
- Offen: Push auf origin/develop (ahead 5) — wartet auf Nutzerentscheid. niyama: Regenerate mit Stand ≥ a0266d1.

## 2026-09-28: Timeout-Diagnose guidance→clearthought abgeschlossen (getrackt als GDS-1..3)
- Was works: komplette Kette live verifiziert gesund — clearthought /health 200 (82 ms aus Container), MCP-Handshake 200, `run_operation reasoning-pass` succeeded; get_metrics: reasoning-pass 13/13, 0 timedOut, max 177 ms. Guidance-Route timed out NICHT; beobachtete Timeouts = clientseitig (konsistent mit Diagnose 2026-09-27).
- Was left: [GDS-1] `get_downstream_status` auf HTTP-Transport strukturell immer "disconnected" (zustandsloser Per-Request-Engine-Bau) — Fix offen. [GDS-2] Stale Session-IDs → stilles `session_not_found` bei forced first use. [GDS-3] Widersprüchlicher Alt-Eintrag 2026-09-27 ("Status ready") zu korrigieren. Details in remaining-work-plan.md.
- Current state: Diagnose-Sitzung abgeschlossen, Test-Workflow-Session (session-83429b58) sauber gecancelt; alle Befunde in activeContext.md + remaining-work-plan.md persistiert.

## 2026-09-28: requestId-Reuse-Stall diagnostizert + Prävention umgesetzt (feature/requestid-reuse-prevention)
- What works: Niyama-Stall (session-46a43aeb) auf Root Cause aufgelöst — WorkflowEngine.submitLocked replays gecachte Results bei wiederverwendeter requestId still; Phase-Advance erzwungen via frischer requestId (req-plan-review-adjusted-c0c1 → implement). Regel in beide Config-Assistant-Templates (responses.json + buildResponses-Drift-Guard, responses-wisdom.json, 6 Submission-Phasen) eingearbeitet; tests/contract+setup 210/210 grün. Commits e0b756a (Templates) + f6a39a0 (Memory-Bank).
- What's left: [RID-1] Server-Hardening (Replay-Marker, Payload-Hash-Check, Replay-Metric) — Plan in remaining-work-plan.md, noch nicht implementiert. Live-.guidance/responses.json bestehender Workspaces (u. a. Niyama) enthalten die Regel noch nicht → neu generieren. detect_changes zeichnete 2× Timeout auf (FR-035-Pfad dokumentiert).
- Current state: Feature-Branch feature/requestid-reuse-prevention bereit (develop @ 0c4ccec), Merge/Review pending Nutzerentscheid.
- 2026-09-28 (nachmittag): GDS-4 umgesetzt — run_operation forwards complete tool responses (exposeOpResult-Vollresult, alle Ops auf returnToAgent:"raw"); Contract-Suite 206/206 (2×), tsc grün, live über neu deployten Guidance-Container verifiziert. Branch: feature/gds4-expose-op-content (uncommitted). Vorfall: fremder Commit 025b682 hatte uncommittete memory-bank-Edits eingesammelt (GDS-4-Eintrag verloren, neu geschrieben); Parallel-Work-Notiz in remaining-work-plan.md.
- 2026-09-28: GDS-4 gemerged — feature/gds4-expose-op-content (377193c) per Rebase auf develop, Branch gelöscht. develop ahead 1 of origin (Push wartet auf Nutzerentscheid). Contract-Suite 206/206 vor Merge, live verifiziert.

## 2026-09-28: RID-1 requestId-Replay-Hardening (session-dcd3ddc5, develop fbd5bdc)
- What works: requestId-Replays sichtbar (replayed/duplicateOf/warning auf geklontem Result), Payload-Hash + Policy submission.requestIdReuse (warn Default / reject-mismatch → requestId_reuse_payload_mismatch), Metric requestIdReplays, 8 Contract-Tests, Doku (README + Amendment 006). Suite grün, tsc clean. Parallel-Agent-Revert von WorkflowEngine.ts durch Worktree-Isolation (worktrees/rid1) überstanden.
- What's left: Push develop (ahead 2 of origin). Fresh-Baseline FR-035-Policy [CR-1] und Engine-Gating-Test [CR-2] weiterhin getrackt.
- Current state: RID-1 umgesetzt und gemerged; Session-Completion via Container-Route (Guidance-Server lebt, Editor-MCP-Route stale).
- 2026-09-28 (Guidance-Workflow session-0cf9658d, Worktree Thinking-MCP-gds5): GDS-5 umgesetzt (feature/gds5-raw-exposure, 563f484+9b46ace) — raw default exposure (transparent proxy, original CallToolResult-Schema inkl. structuredContent), Prozess-stdout bei raw, Restriktionsmodi opt-out; Config+Templates umgestellt; Worktree-Isolations-Regel als instructions.global (aktiv+Templates) mit FR-981-Merge-Semantik; Gate-Scripts + final-review-Test worktree-fähig (.git-Pointer, Windows-Drive-Pfade, commondir packed-refs). Contract-Suite 230/230, tsc grün, Build-Gate exit 0. Workflow COMPLETED: docs-drift/final-review/index-freshness/repository-analysis/capture-lessons alle succeeded. Offen: Merge nach develop + Container-Rebuild + Live-Verifikation von GDS-5.
- 2026-09-28: GDS-5 ABGESCHLOSSEN — feature/gds5-raw-exposure nach develop gerebased (3870f7f), Branch + Worktree entfernt, Registry-Eintrag verworfen. Container neu gebaut/deployed; Live-Verifikation: run_operation reasoning-pass OHNE returnToAgent-Eintrag liefert vollständige sequential_thinking-Antwort (Default raw greift); structuredContent korrekt abwesend (Clear-Thought setzt keins). Worktree-Artefakte (analyze-AGENTS/CLAUDE-Rewrites) verworfen. Offen: GDS-1/GDS-2, RF-2 (FR-981-Doku), Push, Editor-Route-Timeouts (unbehoben), lint/test-Debt (non-blocking).
- 2026-09-28 (Abend): Drei dedizierte Guidance-Workflows abgeschlossen (sequenziell, je eigener Worktree, alle COMPLETED mit vollen Gates):
  1. GDS-1 (feature/gds1-status-probe, 0318e3a+8644daa): on-demand Probe in getDownstreamStatus (http-Server, Handshake min(5s,startup)); Live-Verifikation: alle 3 Server ready + lastSuccessfulRequestAt. Hotfix nachgereicht: ensureReady erwartet flache Transport-Config.
  2. GDS-2 (feature/gds2-session-hint, 68b9d77): session_not_found mit Recovery-Hint (hint only, keine IDs) an allen 4 Raise-Sites; Contract-Assertion ergänzt.
  3. RF-2 (docs/rf2-fr981-merge, f8c6709): FR-981-Amendment (replace->merge) in specs/012; SDD v2 geprüft (kein Update nötig); RF-2 resolved.
  Offen: Push develop->origin (10 ahead), GDS-1-Patch-Nachweise im Container (rebuild erfolgt bereits, Live-Status 'ready' verifiziert), lint/test-Debt, Editor-Route-Timeouts.

## 2026-09-29: Rust-Verifikationsprofil für Guidance (feature/rust-guidance-example, b4d5c50)
- What works: examples/rust-guidance/ (cargo fetch/clippy/fmt/test/check, alle --locked fail-closed), gepinnte Rust-Toolchain (rustup minimal) im Dockerfile, CARGO_TARGET_DIR-Volume-Option, README-Verifikationssektion als Step-by-Step (Python + Rust) neu geschrieben. JSONs validiert; kein docker build / kein Live-Test gegen echtes Rust-Projekt.
- What's left: Rebase auf develop ERFORDERLICH — Dockerfile enthält den (dort noch uncommitteten) trixie-slim Base-Switch des Parallel-Agenten dupliziert; nach dessen Commit Merge-Konflikt auflösen (Inhalte identisch gehalten). Danach: docker build + Live-Verifikation der Ops, Beispiel gegen echtes Rust-Workspace testen.
- Current state: Commit auf feature/rust-guidance-example im Worktree Thinking-MCP-rust-guidance, Merge pending Nutzerentscheid.
- 2026-09-29 (nachtrag): C#-Verifikationsprofil ergänzt (examples/csharp-guidance/, dotnet restore --locked-mode / format --verify-no-changes / build / test, gepinntes SDK via ARG DOTNET_VERSION, NUGET_PACKAGES-Volume-Option, README-C#-Step-by-Step). Gleiche Merge-Voraussetzungen wie Rust-Profil (Rebase auf develop nach trixie-slim-Commit des Parallel-Agenten, docker build + Live-Test offen).
- 2026-09-29 (rebase + smoke): feature/rust-guidance-example auf develop (18c1098, node:24-trixie-slim) gerebased; Dockerfile-Konflikt so aufgelöst, dass develop-Basis + Opt-in-Guards (INSTALL_RUST/INSTALL_CSHARP) kombiniert sind. Smoke-Verifikation: Default-Image baut, cargo/dotnet ABSENT; Voll-Image (--build-arg beide true) baut mit cargo 1.90.0 + dotnet 10.0.401. Fixes dabei: gcc/libc6-dev (cc-Linker) und libicu76 (.NET-ICU) in apt-Zeile. Offen: Live-Test der Ops gegen echte Rust-/C#-Workspaces; Merge-Entscheid beim Nutzer.
- 2026-09-29 (merge): feature/rust-guidance-example per Fast-Forward nach develop gemerged (fa00a1d, 6 Commits: Rust-/C#-Profile, Opt-in-Toolchains, README-Step-by-Steps, gcc/libc6-dev+libicu76-Fixes). Worktree Thinking-MCP-rust-guidance entfernt, Branch gelöscht, Smoke-Images (guidance-smoke-default/full) entfernt. develop ahead 7 of origin — Push wartet auf Nutzerentscheid. Offen: Live-Test der Ops gegen echte Rust-/C#-Workspaces; Container-Rebuild mit den neuen ARGs bei Bedarf.

### 2026-09-29 — Wildcard Container-Route (feature/wildcard-container-route, c72d5c8)
**What works:** Wildcard `["*"]` in capabilities.allow.tools (fail-closed-Validierung,
nur alleinig) macht die Container-Route für ALLE Tools von clearthought/insight/
gitnexus nutzbar; insight erstmals mit containerRoute; Auto-Fallback bleibt
read_only-beschränkt; Examples inkl. Egress-Allowlist konsistent; README-Doku;
437/437 Tests grün; unabhängiger Review APPROVED 0 HIGH/CRIT.
**What's left:** Guidance-Session session-45abc996 in 'blocked' (submit_verification
2× Context-server-timeout — Infrastruktur, Entscheidung via resume_workflow offen);
Chain-Schritt 2 (WA-1 Config-Assistent Multi-Workspace) noch nicht gestartet;
Docker-Image-Rebuild nötig, damit der laufende Container "*" akzeptiert;
MEDIUM WC-1 getrackt (remaining-work-plan.md).
**Current state:** Schritt 1 der Kette implementiert + committed auf
feature/wildcard-container-route (nicht gemerged); GitNexus-Index frisch
(5618 nodes / 12359 edges).

### 2026-09-29 — WA-1 Wizard Multi-Workspace (feature/wizard-workspaces)
**What works:** assistent-getriebene workspaces[]-Emission (specs/008) — zwei
neue optionale Fragen, fail-closed Parse-Validierung, Adopt-Modus respektiert
Antworten ohne Referenz-Leak; 440/440 Tests grün; README-Doku.
**What's left:** Merge beider Feature-Branches nach develop (Nutzerentscheid);
 Guidance-Session-Phasen (review/verify/complete) noch offen.
**Current state:** Beide Ketten-Schritte implementiert; Branches offen.

### 2026-09-29 — Merge: Wildcard Container-Route + WA-1 Wizard-Workspaces nach develop
**What works:** Beide Feature-Branches per Rebase nach develop gemerged
(develop 474c2bc, ahead 9 of origin; Konflikte nur in memory-bank-Dokumenten,
beide Sektionen erhalten). Post-Merge-Suite 445/445 grün. Feature-Branches
gelöscht (Branch-Cleanup per Regel).
**What's left:** Push von develop (9 Commits) wartet auf Nutzerentscheid;
Docker-Image-Rebuild (Wildcard-Config akzeptieren); Container-Mount für
zweites Repo (z.B. zed → /workspace-zed) + Wizard-Lauf, um workspaces[] zu
nutzen; getrackte LOW-Follow-ups WC-1/WC-4/WW-1/WW-2/WW-3.
**Current state:** Beide Guidance-Ketten-Schritte implementiert, gemerged,
Sessions completed (alle Gates grün).

## 2026-09-29: WC-1 Wildcard↔TrustLevel-Coupling (feature/wc1-wildcard-trustlevel-coupling, Guidance-Session session-22e9b598)
**What works:** `validateDownstreamServers` lehnt Wildcard `["*"]` für Server mit effektiver trustLevel != "trusted" fail-closed ab (configuration_invalid, Server-ID in Meldung); `toTrustLevel`/`TRUST_LEVELS` nach `src/trust-level.ts` extrahiert (Validator+Runtime eine Semantik); Review-F1 gefixt (nicht-string trustLevel → configuration_invalid). 6 neue Tests; Suite 451/451 grün. Unabhängiger Review APPROVED 0 HIGH/CRIT. README + remaining-work-plan aktualisiert; Restlücke als WC-1-B getrackt. GitNexus-Index vor Completion aktualisiert (5632 nodes).
**What's left:** WC-1-B (Runtime-Hardening trusted Wildcard-Server), WC-4, WW-1/2/3; Merge des Feature-Branch nach develop + Docker-Rebuild ausständig.
**Current state:** WC-1 gelöst auf Config-Ebene; Guidance-Session in Phase complete.

## 2026-09-29: WC-4 Shipped-Config-Contract (feature/wc4-shipped-config-contract, Guidance-Session session-e782866b)
**What works:** tests/contract/shipped-configs.test.ts lädt alle 5 ausgelieferten Config-Sets (Repo .guidance + 4 Example-Adopt-Templates) direkt gegen loadConfig; einzige Substitution ist der workspaces[]-Key (Container-Roots host-seitig nicht existent, Default-Fallback toleriert das by Design). Egress-Konsistenz (transport.http/containerRoute ⊆ Allowlist, inkl. disabled Server) + Negative-Control. 7/7 Tests, Suite 458/458 grün (erstes Auftreten: documented Load-Flake, sauberer Volllauf exit 0).
**What's left:** WC-1-B, WW-1/2/3; Merge dieses Branch nach develop ausständig.
**Current state:** WC-4 gelöst; Validator×Daten-Konsistenz regressionsgesichert.

### 2026-09-29 — Merge: specs/014 Config Truth v2 nach develop
**What works:** feature/config-truth-v2 per Fast-Forward nach develop
gemerged (7ef1fbf) und Branch gelöscht. Post-Merge-Suite 470/470 grün.
develop ahead 8 of origin (Push wartet auf Nutzerentscheid).
**What's left:** Docker-Image-Rebuild + GUIDANCE_WORKSPACE_ROOT=/workspaces-
Umschaltung für den Pool-Betrieb; zed-Praxislauf (registry-edit + repo-config
mit Cargo-Gates); getrackte LOWs CT-1/CT-2/R-3/WW-* /WC-*.
**Current state:** Konzept specs/014 implementiert, gemerged; alle
Guidance-Sessions completed.

### 2026-09-29 — README: Step-by-step Repo-Setup-Guide (specs/014)
**What works:** Neue README-Sektion „Repo setup — step by step“ (servers/
server-guidance/README.md): 4 Pfade (Workspace/Remote × manual/assistant)
mit Sample-Dateiinhalten (Registry-only guidance.json), Sample-Prompts
für den mode-aware Config-Assistant, Mode-Decision-Helper; docs-drift grün.
**What's left:** Docker-Rebuild + /workspaces-Umschaltung (Praxis), zed-
Onboarding, Push von develop (ahead ~10).
**Current state:** Doku komplett für beide Modi.

### 2026-09-29 — Assistant: registry-edit in Remote-Mode abgelehnt
**What works:** Guard in ConfigAssistant.generateFiles: target=registry-edit
+ GUIDANCE_REMOTE_MODE=1 → configuration_invalid mit Umleitung auf
repo-config + init_session; 2 neue/angepasste Tests; docs-drift grün.
**What's left:** wie zuvor (Rebuild, /workspaces-Umschaltung, zed-Lauf, Push).
**Current state:** Assistant führt in beiden Modi nur noch die richtigen Wege.

### 2026-09-30 — Guidance-Instanz auf Pool-Betrieb umgestellt (specs/014 aktiv)
**What works:** Image mit INSTALL_RUST=true gebaut (cargo 1.90.0 im Container);
override auf GUIDANCE_WORKSPACE_ROOT=/workspaces umgestellt + recreate;
/health: default(/workspaces), thinking-mcp(/workspace), zed(/workspaces/zed)
alle reachable; Smoke-Start workspace zed erfolgreich (Session erstellt und
wieder gecancelt). zed-Operations auf Cargo umgestellt (build/lint/test).
**What's left:** zed-Erstlauf (cargo build kalt = lange; ggf. CARGO_TARGET_DIR-
Volume); Push develop;zed-.gitignore prüfen (.guidance/state).
**Current state:** Zwei-Modi-Betrieb live: Registry-only Pool-Instanz serving
zed + thinking-mcp.

### 2026-09-30 — DB-1 slim: Node-Deps-Boot-Warnungen
**What works:** warnNodeDeps (config-truth.ts, in composeApplication
verdrahtet): je registriertem Node-Workspace Warnung bei fehlendem
node_modules bzw. nativ-inkompatiblen Addons (.node-Probe per Child-Node);
Rust-Repos unberührt. 4 neue Tests; Suite 475/475 grün (sauberer Volllauf);
README-Hinweis ergänzt. Generische deps-install/deps-reinstall-Operation
bleibt getrackt (DB-1 Rest, specs/015-Kandidat mit HR-1).
**What's left:** wie zuvor (Push, zed-Erstlauf, Rebuild-Regel bei
Dependency-Updates im Repo).
**Current state:** Slim-Variante live auf develop.

### 2026-09-30 — README-Abgleich gegen Implementierung (Review session 385ae1ae + Re-Reviews)
**What works:** Vollständiger Abgleich README ↔ Quelle durch unabhängigen
Reviewer (16 Findings: 2 HIGH, 8 MEDIUM, Rest LOW/INFO). Alle HIGH/MEDIUM
gefixt (Multi-Workspace-Paragraf auf registry-edit-Semantik, Quickstart mit
Override-Pflicht, Katalogzähler 12, profile spec-kit, downstream/wildcard/
containerRoute-Claims, start_workflow-Zeile, env-Block-Unterscheidung,
/workspace-Framings); Re-Reviews bestätigen. Residuen N-1..N-3 + R-1..R-5
gefixt/getrackt; specs/014 auf Implemented gesetzt.
**What's left:** Push develop; getrackte LOW-Follow-ups (CT-1/2, R-3, N-4,
WW-*, WC-*, HR-1, DB-1-Rest).
**Current state:** README vollständig am Implementierungsstand.

## 2026-09-30: CT-1 Constructor-Guard (feature/ct1-constructor-guard, 8f588c6, Guidance-Session session-1070c546, Kettenschritt 1/8)
**What works:** WorkflowEngine-Konstruktor lehnt schema-valide guidance.json
mit operations.file aber ohne/unvollständiger workflow.file bei
registryOnly=false fail-closed mit configuration_invalid ab (Strukturcheck
workflow.id/initialPhase statt nur Falsiness — truthy-leeres Objekt
abgedeckt). 4 Regressionstests; Suite 479/479 grün; prettier grün;
unabhängiger Review APPROVED 0 HIGH/CRIT; README-Hinweis ergänzt.
GitNexus-Index per CLI aktualisiert (5.698 nodes).
**What's left:** CT-2, WW-1/2/3, WC-1-B (Implementierung) + HR-1-SDD,
DB-1-Rest-SDD — Folge-Schritte derselben Guidance-Kette; Push develop;
getrackt neu: TYPE-1 (pre-existing TS2532 shipped-configs.test.ts),
GATE-1 (Container-Gates umweltbedingt rot, required:false — DB-1-Kontext).
**Current state:** Kettenschritt 1 (CT-1) implementiert, committed,
verifiziert; Session in Phase complete (Completion folgt nach
Memory-Bank-Update + Reindex).

## 2026-09-30: CT-2 Legacy-Monolith-E2E (feature/ct2-legacy-monolith-e2e, 96b0a67, Guidance-Session session-9e23340f, Kettenschritt 1/7)
**What works:** E2E-Test in registry-composition.test.ts: Legacy-Monolith
(Voll-Config am Pool-Root + Registry) + Extra-Workspace mit eigener
.guidance → Session aus dem Workspace-Root komponiert (configurationVersion
aus zed/.guidance/state/sessions/<id>.json === Workspace-Hash, ≠ Pool-Hash;
kein Copy). Suite 480/480 grün, prettier grün. Kein Produktionscode nötig.
**What's left:** WW-1/2/3, WC-1-B (Implementierung) + HR-1-SDD,
DB-1-Rest-SDD (Folge-Kettenschritte); Push develop; CHAIN-1 getrackt
(Auto-Folgesession scheitert an AC-5-Drift — frische Ketten als Workaround);
TYPE-1/GATE-1 unverändert getrackt.
**Current state:** Kettenschritt CT-2 implementiert, committed; Verifikation
läuft (Completion-Artefakte folgen).

## 2026-09-30: Chain-Abschluss WW-1/WW-2/WW-3/WC-1-B + specs/015 SDD (6 Guidance-Sessions, 8/8 Follow-ups)
**What works:**
- WW-1 (6029007): parseExtraWorkspaces(value, defaultRoot?) — Extra-Root-/
  Default-Root-Kollision failt bei Generierung statt erst beim Container-Load.
- WW-2 (5c06639): isAbsolute-Fail-fast für den Default-workspaceRoot in
  generateFiles — konsistente Semantik mit den Extras.
- WW-3 (101306c): Boundary-Tests extraWorkspaces ('=' im Root,
  whitespace-only ≡ weggelassen) — kein Produktionscode nötig.
- WC-1-B (e5408c1): PolicyEngine.assertUnconfiguredWildcard — unkonfiguriertes
  Tool auf Wildcard-Server → recoverable authorization_required (Option B,
  Nutzerentscheid); Single-Choke-Point buildInvokerClosure deckt Child-/
  Downstream-Verdrahtung ab; 1 LOW getrackt (WC1B-F3 Integrationstest).
- specs/015 SDD (1a34a35): Registry-Hot-Reload + deps-install/reinstall
  vollständig spezifiziert (Draft; Design-Entscheidung US1 offen, R1/R2
  Blocking-Open-Points).
Jeder Schritt: unabhängiger Review APPROVED 0 HIGH/CRIT, Vollauf
480→483→482 grün, prettier grün, alle Completion-Gates durch.
**What's left:** specs/015-Umsetzung (R1/R2-Entscheidungen mit Nutzer);
Push von develop (16 Commits, Nutzerentscheid); getrackt: TYPE-1 (TS2532
pre-existing), GATE-1 (Container-Gates umweltbedingt), CHAIN-1
(Auto-Folgesession AC-5-Drift — frische Ketten als Workaround), WC1B-F3
(Closure-Integrationstest).
**Current state:** Alle 8 Follow-ups GEMERGT: Kette per Fast-Forward nach
develop (ea582f8 → 507d2eb, 16 Commits), 7 Feature-Branches gelöscht,
post-merge-Suite 483/483 grün, Knowledge-Graph aktualisiert; develop
ahead 16 of origin (Push wartet auf Nutzerentscheid); specs/015 bereit
für Umsetzungs-Planning.

## 2026-09-30: TYPE-1 (feature/type1-ts2532, 58faa7e, Guidance-Session session-77a51a32, Kettenschritt 1/4)
**What works:** TS2532 in shipped-configs.test.ts(125) gefixt (`CONFIG_SETS[1]!.dir`), File auf LF normalisiert (CRLF-Root-Cause: WC-4-Commit 235e9e6). typecheck/prettier grün, fokussiert 7/7, Vollauf 474 passed / 9 skipped (63 Files). Neue Maschine: Node v24.21.0 via nvm in WSL installiert, Guidance-Pool-Registry um thinking-mcp ergänzt (Commits 7428bd1, bd5edd3 auf develop).
**What's left:** Kettenschritte 2/4 WC1B-F3, 3/4 GATE-1, 4/4 CHAIN-1; danach specs/015-Umsetzungs-Chain (R1=B entschieden, R2=Weiterführung mit Re-Validierung; Variante A getrackt als SPEC015-A). Merge von feature/type1-ts2532 nach develop + Rebase-Regel beachten.
**Current state:** TYPE-1 implementiert und committed; Guidance-Phasen implement/review/verification offen.

## 2026-10-01: WC1B-F3 (feature/wc1b-f3-integration-test, Guidance-Session session-293a251f, Kettenschritt 1/3)
**What works:** Integrationstest für WC-1-B-Closure-Wiring (Wildcard + unkonfiguriertes Tool → authorization_required, kein Downstream-Contact). Fokussiert 20/20, Vollauf 475 passed / 9 skipped (63 Files), prettier grün.
**What's left:** Kettenschritte 2/3 (GATE-1-Evidenz), 3/3 (CHAIN-1-Evidence/ACs); specs/015-US1-Umsetzung (schließt CHAIN-1); Push develop.
**Current state:** Step 1 implementiert; Review/Verification/Completion offen.

## 2026-10-01: Chain-Abschluss WC1B-F3/GATE-1/CHAIN-1 (3 Guidance-Sessions, 2x Live-CHAIN-1-Repro)
**What works:** WC1B-F3 Integrationstest (Wildcard + unkonfiguriertes Tool → authorization_required, 5f124f1); GATE-1 Evidenznotiz (41ebec8: nur skriptbasierte Completion-Hooks laufen im Container, lint/test bleiben umweltbedingt bis DB-1); CHAIN-1 Root-Cause source-verifiziert (WorkflowEngine.ts:641-648) + R2-ACs als AC-13…17 in specs/015-Addendum (a4cd178). Vollauf 475 passed / 9 skipped (63 Files). Alle Branches nach develop ff-gemerged, cleanup erledigt. Neu getrackt: GDS-6 (retry-finalization: complete_workflow nach Hook-Fail + retry_operation erfriert in active/completed — keine Finalisierung/Successor), GDS-7 (Dual-GITNEXUS_HOME: Container-Index via GITNEXUS_STORAGE_PATH entkoppelt).
**What's left:** Push develop (ahead 6); specs/015-US1-Umsetzung (R1=B, schließt CHAIN-1 via AC-16-Regressionstest; R2=Rebind mit Re-Validierung); GDS-6-Fix (gleicher WorkflowEngine-Bereich); DB-1-Rest (US2) löst GATE-1; niyama Re-Registrierung nach Klon.
**Current state:** Cleanup-Chain vollständig abgearbeitet; CHAIN-1 zweifach live reproduziert (Mid-Session-Config-Change UND Successor-Erbe-Hash) — Mechanismus vollständig erklärt und spezifiziert.

## 2026-10-01: specs/015 US1 (feature/015-us1-registry-register gemerged, 3 Guidance-Sessions: 7e69dcdd Phase 1 / b045ff14 US1 / successor cancelled)
**What works:** AC-16-Routing-Fix (Workspace-Sessions validieren gegen eigene Composition — CHAIN-1 born-invalid behoben im Code), Rebind AC-13..17 (session_rebound-Audit, Fingerprint-Drift-Recomposition), registry_register (FR-1201..1210, flag+profile-gated, RMW-serialisiert, atomar, Audit). 10 neue Contract-Tests; Vollauf 485 passed / 9 skipped (64 Files); 3 Review-Runden final APPROVED 0 HIGH/CRIT; specs/008-Test auf R2-Semantik re-anchored. Phase 1 (FR-Nummern, T001/T002) davor.
**What's left:** US2 (T007..T010 deps-install/reinstall — frische Chain, Workaround: alter Server-Code läuft im Container bis Rebuild), Phase 4 (T011..T014: README-Rest, Verifikation, Tasks to done), DANACH Deploy: Container rebuild (guidance+insight) + Push develop; GDS-6-Fix; niyama Re-Registrierung.
**Current state:** US1 shipped auf develop (ahead of origin); Container läuft noch auf altem Image (Hot-Reload des Codes gibt es nicht — Rebuild nach Push).

## 2026-10-01: specs/015 US2 + Phase 4 (feature/015-us2-deps-operations, Guidance-Session session-2184b012)
**What works:** deps-install/deps-reinstall im Operations-Katalog (scaffold + ConfigAssistant + Beispiel-Catalog; npm ci mit Lockfile-Fallback, via-Label als Audit-Vermerk; deps-reinstall workspace-scoped Clean+Reinstall in einem Step). Reaktive Erkennung: node_deps_hint bei "Cannot find module"/"ERR_DLOPEN_FAILED"; proaktive Sonde nodeDeps.proactiveProbe (Default OFF). 11 neue Contract-Tests (echte offline-npm-Installs mit file:-Dep); Vollauf 496 passed / 9 skipped; tsc/prettier/docs-drift grün; specs/015 auf Implemented, Tasks T001–T014 abgehakt; README-Abschnitt Dependency-Bootstrap. Review APPROVED 0 HIGH/CRIT (F1–F6 getrackt).
**What's left:** Deploy nach der Kette (Container-Rebuild guidance+insight, NUR außerhalb von Sessions) + Instanz-.guidance/operations.json um deps-Ops erweitern; Push develop (Nutzerentscheid); getrackte REV-US2-F1..F6; GDS-6/GDS-7; niyama Re-Registrierung.
**Current state:** DEPLOY-015b COMPLETED (Guidance-Session session-04832909; Commits 8cda5e5/a33cf23/1530973 nach develop gemerged, Branch gelöscht): node-gyp-Toolchain im Image, dotnet-Duplicate entfernt, Roll-out durchgeführt. DEPLOY-015c getrackt (Container-Vitest-Teardown-Crash; test-Gate required:false, test aus verify-Gates herausgenommen bis Fix). Ausstehend: Push develop (Nutzerentscheid); DEPLOY-015c-Debug; REV-US2-F1..F6; GDS-6; GDS-7; niyama Re-Registrierung.

## 2026-10-02: Independent Review 7edef62 (feature/rev-us2-f2f3f4 — REV-US2-F2/F3/F4 fixes)
**What works:** Review APPROVED, 0 HIGH/CRIT. Composite failure merge verified (warnings typed/initialized at OperationEngine.ts:170/196, success path untouched, base warnings not clobbered); three deps-op catalogs verified field-identical by direct read (10 guarded fields incl. steps/validation/output); shipped-configs.test.ts unaffected (schema validation only, no field assertions). Focused run: 3 files, 30/30 green (deps-operations, shipped-configs, scaffold).
**What's left:** None from this review; new accepted observations tracked as REV-F2F3F4-1..3 in remaining-work-plan.md (agent-invisibility of merged warnings + via label under summary_and_errors; cosmetic join change). Existing open items unchanged (REV-US2-F1/F5/F6, DEPLOY-015c, GDS-6/GDS-7, Push develop).
**Current state:** 7edef62 fixes the governing findings correctly; exposure-semantics tension documented, not blocking.

## 2026-10-01 — Drei Guidance-Sessions sequentiell abgeschlossen (REV-04a2b4c-1, GDS-6/CHAIN-Replay, REV-US2-F2/F3/F4)
- What works: (1) REV-04a2b4c-1 — Tool-Level-Response-Shape-Test für registry_register (9b07627); (2) GDS-6 — Retry-Success finalisiert Wedged Completions inkl. Chain-Successor (eedb7bb + ce83e1c); CHAIN-Replay — Duplicate-Step-0 fail-closed; CHAIN-1/US1 als implementiert verifiziert; (3) REV-US2-F2/F3/F4 — Composite-Warnings-Merge, deps-Op-Kataloge field-identisch + Drift-Guard, echte Fallback-Semantik dokumentiert (7edef62..8a96ff5). Alle drei Sessions mit allen Completion-Gates grün; develop ahead 6 (unpushed).
- What's left: REV-US2-F1 (FR-053/Approval, MEDIUM, getrackt); GDS-7-Dual-Index & Clear-Thought-Ausfall (Infrastruktur, getrackt); Push nur auf Nutzeranweisung; Deployment der neuen Engine-Teile (Container-Rebuild) steht aus — laufende Instanz hat Pre-Fix-Retry-Semantik.
- Current State: specs/015-Follow-up-Batch im Wesentlichen abgeschlossen; Features 00x stabil auf develop; Memory-Bank (remaining-work-plan, activeContext, progress) aktuell.

## 2026-10-02 — Rest-Backlog vollständig abgeschlossen (session-01df2607 + session-a6005ca0)
- What works: FR-053-Approval-Gate (Scope A) auf allen 8 Executions-Pfaden, Approval-Zeremonie live auf dem deployed Container validiert (authorization_required → report_blocker → resume approve → erfolgsbasierter Grant-Konsum); All-or-Nothing-Assert für op-by-op-Lifecycle-Loops (REV-F053-1); Warnings-Durchlass in summary_and_errors; Dual-Index-Prozedere dokumentiert; Python-Profil-afterEnter entfernt; via-Label-Note; Vollauf 532/532.
- What's left: nur noch Beobachtungen/Bedingte Items (NIYAMA-REG sobald Repo geklont, REV-US2-F6 Lockfile-Flakiness bei npm-Major-Update, REV-F053-1b-1-Doku, Clear-Thought-Container-Health, REV-F053-1-Alt-Tracking). develop ahead 4 (unpushed: 4adfd4a + Cleanup-Batch 3 Commits).
- Current State: sämtliche MEDIUM/LOW-Action-Follow-ups aus remaining-work-plan.md abgearbeitet; Memory Bank aktuell; nächster Wartungsanlass = Niyama-Clone bzw. npm-Major-Update.

## 2026-10-02 — Approval-Policy-Config: FR-053 auf Unattended umgestellt (session-0861a7b4)
- What works: policies.approvals (riskClass → allow|require, fail-closed validiert); Defaults: destructive/credential_sensitive → require (Zeremonie), alle anderen → allow (unattended). Gate an allen 8 Pfaden unverändert; Zeremonie-Code bleibt für require-Klassen. validatePolicies-Early-Return-Bugfix (approvals-Validierung wurde bei fehlender submission-Sektion übersprungen — Fail-closed-Test pinnt ihn). Vollauf 534/534; 2 unabhängige Reviews APPROVED 0 HIGH/CRIT.
- What's left: Push (develop ahead 3) + Container-Rebuild/Redeploy, damit die laufende Instanz unattended läuft. Getrackte Reste: REV-APPCFG-1 (Composite-RiskClass-Claim-Check, LOW), NIYAMA-REG, Lockfile-Flakiness, Clear-Thought-Container-Health.
- Current State: Unattended-Betrieb ist wieder der Normalfall; interaktive Approvals nur noch für destructive/credential_sensitive (aktuell in keinem Profil vorhanden) oder auf explizite Operator-Policy via policies.approvals.

## 2026-10-02 — Registry-Hot-Reload + Deps-Pre-Flight (session-fae2aa34)
- What works: start_workflow resolves Workspace-Namen gegen den Live-Engine-Snapshot (Provider-Refactor in register-tools/server/main); Regressionstest register→start_workflow ohne Neustart grün. Automatischer deps-install-Pre-Flight vor Gates (preFlight.enabled default ON, opt-out), pro Root serialisiert, fail-open, auditiert; Staleness-Matrix + Gate-Trigger-Tests grün. Vollauf 547/547 im Container; Reindex + detect-changes sauber.
- What's left: Container-Rebuild/Redeploy (PREFLIGHT-DEPLOY, getrackt), damit die laufende Instanz beide Fixes trägt; danach Niyama-Dummy-Workflow als Live-Verifikation. Commit/Push nur auf Nutzeranweisung.
- Current State: beide gemeldeten Blocker (workspace_not_registered nach Hot-Register; niyama ohne node_modules) im Code gelöst und getestet — Hot-Reload ohne Container-Restart, fehlende node_modules heilen automatisch vor dem ersten Gate.

## 2026-10-03 (Abend): WIZ-4 completed, Chain abgebrochen, WF-Follow-ups getrackt
- **What works:** WIZ-4 (workspaceRoot-Default aus workspaceNameHint + GUIDANCE_WORKSPACE_ROOT) vollständig umgesetzt und durch den Guidance-Workflow abgenommen (session-b1c62520, alle Completion-Gates grün); Commits fe25128 + 0f829ed auf feature/wiz-config-assistant-rework. Environment-Reparatur: Root-npm-install stellt tsc-Bins für alle Workspace-Builds wieder her.
- **What's left:** WIZ-2, WIZ-1, WIZ-3 (Spezifikation fertig, Umsetzung offen; Wiederaufnahme-Struktur = WF-6-Nutzerentscheid). Push von develop (2+ Commits vor origin) und des Feature-Branch steht aus. WF-3b-Entscheid (yarn.lock vs. npm-lock). Merge des Feature-Branch nach develop nach Review-Freigabe.
- **Current State:** Config-Assistent-Rework läuft auf feature/wiz-config-assistant-rework; Chain session-b22053ef cancelled; 6 Workflow-Probleme (WF-1..6) getrackt, Lektionen dokumentiert.

## 2026-10-03 (Nacht): WIZ-Serie komplett abgenommen
- **What works:** WIZ-4, WIZ-2, WIZ-1, WIZ-3 alle implementiert, independent-reviewed (0 HIGH/CRITICAL in 5 Reviews) und durch Guidance-Chains abgenommen (Sessions b1c62520, 7876f096, abe752d7, 57412c1b — alle completed, alle Completion-Gates grün). Wizard: 10 Fragen, Workspace-Registrierung imWizard-Lauf, keine Profile mehr, projectName/workspaceRoot-Auto-Vorschläge.
- **What's left:** Merge feature/wiz-config-assistant-rework (12 Commits, fe25128..1957ec9 + e149146) nach develop nach Nutzer-Freigabe; Push; Container-Rebuild (neue Tool-Oberfläche 40 Tools); WF-1..WF-6 Infrastruktur-Follow-ups; LOW-Findings REV-FINAL-F3/F4/F5 getrackt.
- **Current State:** Config-Assistent-Rework vollständig auf dem Feature-Branch; Knowledge-Graph frisch (Reindex nach letztem Commit); Chain beendet.

## 2026-10-03 (Spät): WF-Follow-ups WF-1/2/4/5/6 aufgelöst (feature/wf-followups, Chain session-cc9b8326)
- **What works:** WF-1: Container-Route als sanktionierter Clear-Thought-Pfad dokumentiert (Diagnose: Container healthy, Logs leer, Route instant — Ursache Editor-Client-Layer, AGENTS.md-Note + Backup). WF-2: submit-once-then-poll-Regel in responses.json (Instanz+Example) und README. WF-4: explizite final-review.json-Mandats-Anweisung (Schema, 40-hex, Re-Bless, Checker). WF-5: check-index-freshness.mjs exkludiert nested Test-Tooling-Artefakte (isSkipped prüft jedes Segment; touch-Verifikation). WF-6: Closeout — Einträge resolved, Lektion verifiziert persistiert.
- **What's left:** Merge/Push von feature/wf-followups nach develop (nach Review-Freigabe); Container-Rebuild-Angebot an den Operator (responses.json-Änderungen sind Bind-Mount-live, Rebuild optional); Reindex vor complete_workflow (in dieser Session).
- **Current State:** alle WF-Infrastruktur-Follow-ups aus dem 2026-10-03-Chained-WIZ-Report abgearbeitet; eine Regel pro Follow-up in responses.json/README/AGENTS.md aktiv.

## 2026-10-03 (Nachtrag): Chain-Head-Scope-Falle gehärtet
- **What works:** Duplicate-guard (Stufe 1) verifiziert (bereits auf develop); neuer CHAIN HEAD SCOPE-Annex engine-seitig für chained Heads + 4 Regressionstests; README-Abschnitt "Head-session scope rules".
- **What's left:** Merge von feature/wf-followups (enthält jetzt WF-Follow-ups + diese Härtung); Push; optionaler Container-Rebuild.
- **Current State:** WF-6-Falle konstruktiv abgesichert (Fail-closed gegen Request-Duplikation, Guidance-Annex gegen die Disziplin-Form).

## 2026-10-03 (Abschluss): wf-followups gemerged, gepusht, redeployed
- **What works:** feature/wf-followups (6 Commits 1826bb7..d82b7a8: WF-1/2/4/5/6 + Template-Sync + Chain-Head-Scope-Härtung) via Fast-Forward nach develop gemerged, Branch gelöscht, pushed (origin/develop == d82b7a8), Guidance-Container neu gebaut und neu gestartet (healthy, 3 Workspaces reachable).
- **What's left:** keine offenen Aktionen; getrackte LOW-Reste bleiben im remaining-work-plan (steps:[]-Manifest-Hygiene optional, REV-FINAL-F3/F4/F5, NIYAMA-REG u.a. je Trigger).
- **Current State:** develop == origin/develop == d82b7a8; Container läuft mit neuer Engine (CHAIN HEAD SCOPE-Annex) und aktualisierten Templates; GitNexus-Index frisch auf diesem Stand.

## 2026-10-03 (fault_tree top-gate fix, feature/fix-fault-tree-top-gate, session-a9c2d5b6)
- **What works:** fault_tree now resolves the top gate from top_event (id match, then unique name match, then the unique unreferenced non-basic gate; last-element only as last-resort fallback so cycle detection and legacy edge cases stay intact). A basic event resolved as top is flagged via the new optional field top_gate_type: "basic" instead of being silently reported. assumption_xray no_marker note now states marker detection is English-only. Regression tests for the three report vectors over multiple array orderings (nested 0.01099/G1, flat 0.07831, basic-as-last). Full suite 178/178, typecheck clean, GitNexus reindexed. Independent final review: approve, 0 HIGH/CRITICAL.
- **What's left:** Merge/push of feature/fix-fault-tree-top-gate after user approval; German marker support in assumption_xray tracked as follow-up (FT-AXRAY-DE); multi-root fallback transparency tracked as follow-up (FT-FT-F1); chain successors (steps[0..]) risk duplicating this head scope — decide to skip or let them run verification-only (FT-CHAIN-DUP).
- **Current State:** fix implemented, committed (33d8a04 + doc follow-up commit) and verified on feature branch; merge pending user approval.

## 2026-10-03 (Abschluss): Merge, Successor-Verification, Branch-Cleanup
- **What works:** feature/fix-fault-tree-top-gate via fast-forward nach develop gemerged (develop = abcdca6 = origin/develop, Push außerhalb dieser Session erfolgt); Chain-Successor steps[0] (session-672585e2) als Verification-Only-Zyklus abgeschlossen — alle Completion-Gates grün, 0 Changes/Commits; feature-Branch nach Merge gemäß Nutzer-Freigabe gelöscht (was abcdca6); steps[1] (Implementierung) nie gestartet (serverseitig nicht materialisiert) — FT-CHAIN-DUP damit aufgelöst.
- **What's left:** getrackte Follow-ups FT-FT-F1 (Multi-Root-Fallback-Transparenz), FT-AXRAY-DE (deutsche Marker) je Trigger; keine offenen Aktionen aus dieser Kette.
- **Current State:** develop == origin/develop == abcdca6; alle Feature-Branches der Kette gelöscht; GitNexus-Index frisch; Kette beendet (steps[1]/steps[2]-Scopes durch Head-Session abgedeckt).

## 2026-10-03 (Severity-Gate for review findings, feature/severity-gate-review-findings, session-4e869880)
- **What works:** The review reason-transitions (implementation_changes_required / major_plan_revision_required) are now reachable: evaluateReviewFindings() helper (severity in blockingSeverities AND status not in fixed/tracked/accepted = open, mirroring check-final-review.mjs) is wired into submitLocked; selectTransition accepts a gateReason; audit event review_findings_gate_triggered; per-phase loop counter surfaced as SEVERITY GATE LOOP note in guidance (Option A, no hard cap). Strict schemas (F2): review-implementation + review-plan findings require severity enum + optional status enum, mirrored in examples, test fixtures and scaffold.ts. Gate applies to BOTH review phases (F1); absent policy = gate disabled.
- **What's left:** Review phase of the guidance workflow session (session-4e869880), then verify/complete gates; merge after user approval; gitnexus reindex at completion.
- **Current State:** feature branch created off develop; focused tests + full server-guidance suite 585/585 green, typecheck clean; README severity-gate semantics section and memory-bank updated.

## 2026-10-03 (Abschluss): Severity-Gate implementiert, Workflow in Completion
- **What works:** Severity gate live: open high/critical review findings loop review_and_fix_implementation→implement and review_and_adjust_plan→plan (audit event review_findings_gate_triggered, per-phase loop counter surfaced in guidance); strict schemas enforce severity enum + optional status across default/csharp/python/rust profiles, fixtures and scaffold; gate disabled when policy absent. FR-040 verify loop and completion final-review gate unchanged. All verification green: 585/585 server-guidance tests, tsc clean, root build exit 0, prettier green, yarn.lock intact. Independent review round: 0 unresolved HIGH/CRITICAL (10 findings: 8 fixed, 2 tracked).
- **What's left:** Commit/merge of feature/severity-gate-review-findings pending user approval; tracked follow-ups REV-GATE-6 and YARN-LOCK-TRAP in memory-bank/remaining-work-plan.md.
- **Current State:** Workflow session-4e869880 in complete phase (completion gates submitted); gitnexus reindexed at feature state; final-review evidence written (.guidance/state/final-review.json, openHighCritical 0).

## 2026-10-03 (YARN-LOCK-TRAP guard, feature/yarn-lock-guard, session-22f8339b)
- **What works:** Pre-commit/pre-push yarn.lock guard (scripts/check-yarn-lock.sh + .githooks/, core.hooksPath activated on main checkout) blocks v1-format/unknown-format lockfiles, staged deletions and pruned root trees; 7/7 guard tests green; AGENTS.md WF-3 + README documented; YARN-LOCK-TRAP tracking resolved as fixed-with-coverage.
- **What's left:** Workflow review/verify/complete phases for session-22f8339b; merge after user approval.
- **Current State:** feature branch feature/yarn-lock-guard off develop @ 052a2b5; guard live on this checkout (resolution commit goes through the hook).

## 2026-10-03 (YARN-LOCK-TRAP guard, feature/yarn-lock-guard, session-22f8339b)
- **What works:** yarn.lock integrity guard live: pre-commit + pre-push hooks (scripts/check-yarn-lock.sh via .githooks/, core.hooksPath activated on main checkout) block Yarn-v1/unknown-format lockfiles (index + working tree + committed tip), staged deletions, and pruned root trees (fresh-clone exempt; fail-closed on unreadable git state). 11/11 guard tests green; independent review round (1 HIGH + 3 MEDIUM + 2 LOW) fully resolved — including the intent-to-add/commit -a bypass and the now-real push-time tip check. Live proof both directions (legit commit passed, drift commit blocked). YARN-LOCK-TRAP tracking resolved as fixed-with-coverage.
- **What's left:** Merge of feature/yarn-lock-guard (2 commits) after user approval; push of develop.
- **Current State:** feature branch off develop @ 052a2b5, HEAD b79df55; tree clean; final-review evidence written (0 open HIGH/CRITICAL).

## 2026-10-03 (Abschluss): yarn-lock-guard gemerged
- **What works:** feature/yarn-lock-guard via fast-forward nach develop gemerged (develop = e4c6874, 3 Commits ahead of origin), Feature-Branch gelöscht; guard tests 11/11 grün auf develop; core.hooksPath weiter aktiv.
- **What's left:** Push von develop (3 Commits) nach Nutzer-Freigabe.
- **Current State:** YARN-LOCK-TRAP geschlossen; Guard auf develop produktiv (dieser Commit lief durch den Pre-Commit-Hook).

## 2026-10-04: SKP-1 formal verification + merge (Guidance-Session session-8a3f5bf4)
- **What works:** Full verification evidence recorded: focused contract tests 6/6, full server-guidance suite 73 files / 591 tests green (tip 8c41768, includes the SKP-2 end-to-end wiring test with revert drill). LIVE pool-mode proof re-executed on a freshly rebuilt container (root compose, `--build`): `discover_spec_kit_feature('008-multi-workspace')` resolves `/workspaces/Thinking-MCP/specs/008-multi-workspace` — original bug (`spec_kit_feature_not_found: feature root missing: specs`) confirmed gone. develop verified identical to merge-base (d44fc34, 0 behind / 4 ahead) → fast-forward merge of feature/speckit-pool-mode-wiring into develop, feature branch deleted. Note: origin fetch not possible from this shell (SSH key passphrase unavailable) — merge safety checked against LOCAL develop ref; push will surface any remote drift.
- **What's left:** Push of develop after user approval (carries SKP-1 fix + verification commits).
- **Current State:** SKP-1 fully closed: implemented, contract-tested (revert-drill-proven), live-verified in pool mode, merged to develop. Residuals SKP-3 (LOW, pre-existing Windows separator) remain tracked.

## 2026-10-03 (Abend): SKP-1 Spec-Kit-Pool-Modus gefixt (feature/speckit-pool-mode-wiring, 255bfd2, Guidance-Session session-896320f1)
- **What works:** `createConfiguredServer` in servers/server-guidance/src/server.ts übergibt jetzt `getSessionWorkspace` (Session-Root statt Pool-Root) — Pool-Modus-Discovery funktionsfähig. Contract-Tests tests/contract/speckit-pool-mode.test.ts (4 Fälle: Session-Root-Resolution, Pool-Root-Fallback, Pre-Fix-Regression, T6-Root-Check). specs/008 T6-Notiz ergänzt. Focused tests 12/12 grün, volle Suite 589/589 grün, GitNexus-Impact LOW (exact). LIVE VERIFIZIERT: Container neu gebaut, discover_spec_kit_feature löst /workspaces/Thinking-MCP/specs/008-multi-workspace auf (vorher: "feature root missing: specs").
- **What's left:** Guidance-Workflow auf Nutzeranweisung gecancelt (Phase implement, submission fehlte summary-Feld) — Review/Completion-Phasen übersprungen; Merge nach develop + Push pending; Container läuft mit Fix (Rebuild bereits erfolgt).
- **Current State:** SKP-1 (HIGH) implementiert + live verifiziert; Finding in remaining-work-plan.md getrackt, Auflösung dort nach Merge zu schließen.

## 2026-10-04: SKP-3 C-Full abgeschlossen (feature/speckit-artifact-discovery-integration, session-1bdb6fee)
- **What works:** discoverArtifacts (vorher toter Code, nie wired seit 33255fa) voll in importArtifacts integriert: shared isInsideWorkspace-Helper (beide Separatoren — SKP-3-Bug + Drift-Muster behoben), vereinheitlichte Traversal (inline loop + ad-hoc contracts walk entfernt), checklists/** wird jetzt importiert (lücke im DEFAULT_ARTIFACTS geschlossen), Config-dir-Patterns funktional, relativePath auf echte Pfade (keine Snapshot-Migration nötig). 15 neue Tests; Suite 606/606 grün; Workflow completed (alle Gates: lint, build, final-review 0 HIGH/CRIT, index-freshness, capture-lessons).
- **What's left:** Merge nach develop + Push nach Nutzer-Freigabe (Branch feature/speckit-artifact-discovery-integration, HEAD 7884ba4, 5 Commits auf 4af45d1).
- **Current State:** SKP-3 geschlossen; Residuen SKP-3a..SKP-3e (LOW, mit Trigger-Points) getrackt.

## 2026-10-04 — specs/016 Async Transitions & Progress (session-62689b13, feature/016-async-transitions-progress)

- **What works:** Stufe 2 async acceptance (opt-in `_meta.async` / `GUIDANCE_ASYNC_ACCEPTANCE=1`, synchronous default), idempotent in-flight retry (atomic registry begin, sessionId+tool key), outcome retrieval via `get_workflow_state.asyncOperations` incl. failures + restart-reclassification; Stufe 3 SSE progress (progressToken-keyed upgrade, per-gate notifications with cumulative monotonic progress, 15s keepalives, redaction-safe). All ACs (AC1–AC5) covered by 7 new contract tests; full suite 613/613; build/lint/typecheck green (typecheck hat nur den prä-existing getrackten Fehler).
- **What's left:** Adoption in insight/clear-thought (S016-ADOPT), N1 registry reconcile-mutex, N2 mutex eviction, N3 restart/multi-group coverage tests, S016-RETRY-OP — alle getrackt in remaining-work-plan.md mit Trigger-Punkten.
- **Current State:** MERGED (2026-10-04, Nutzer-Freigabe): Fast-Forward-Merge nach develop (c544701..8ea8f80, 6 Commits), Feature-Branch gelöscht, Focused-Tests auf develop 15/15 grün. Push pending — kein SSH-Key im Shell-Kontext (bekannte Falle), develop liegt 6 Commits vor origin/develop; Push durch User mit Credentials nachziehen. Danach: S016-ADOPT (Extraction-Scope für insight/clear-thought).

## 2026-10-04 — S016-ADOPT (feature/016-adopt-async-sse, session-7e49befd)

### What works
- servers/shared-workflow: canonical spec-016 modules (transition-protocol + operation-registry) with reconcile-under-mutex (N1), mutex eviction (N2), restart fixture, multi-group monotonic progress fixture; 12/12 tests green.
- Vendoring via sync script + per-server hash-consistency guards (all 6 copies byte-identical, LF).
- server-insight: async acceptance (experience_seed_lessons/experience_finalize; _meta.async or EMMS_ASYNC_ACCEPTANCE=1, sync default), workflow_status carries asyncOperations, SSE progress keyed on _meta.progressToken; 7/7 contract tests green.
- server-clear-thought: async acceptance (session_save/session_load; _meta.async or CLEAR_THOUGHT_ASYNC_ACCEPTANCE=1), session_info carries asyncOperations, SSE transport shares SessionState; 7/7 contract tests green; full suite 187/187.
- server-guidance: consumes shared copies behavior-identically; 615/615.

### What's left
- Merge DONE: feature/016-adopt-async-sse fast-forward-merged into develop (aaffb81), pushed to origin, branch deleted. Review approved, 0 open HIGH/CRIT.
- Tracked: S016-ENV-SQLITE (pre-existing insight test crashes, Node 24/WSL), S016-REVIEW-RESIDUEN F4/F6 (accepted), S016-RETRY-OP, S016-TYPECHECK (pre-existing), S016-CHAIN-PROGRESS.

### Current state
Spec 016 adoption (§6 step 2) implemented on feature branch; independent review re-blessed fix commit ba37e83 with 0 open HIGH/CRITICAL. Guidance session session-7e49befd in completion.

## 2026-10-04 — Guidance schema-drift cleanup (feature/schema-drift-cleanup)

### What works
- Pool root `D:\repos\.guidance` reduced to registry-only `guidance.json` (no `default` entry, no legacy process files).
- Verified live: `default` rejected fail-closed (`workspace_not_registered`) after container restart; registered workspaces unaffected; server health green.
- README + memory-bank documentation updated.

### What's left
- Commit + merge of `feature/schema-drift-cleanup` into develop (after review); reindex via `gitnexus analyze --no-stats` before guidance completion.

### Current state
Runtime drift fixed and verified; documentation in sync; workflow session-d5a440cb in completion.

### 2026-10-04 (Merge): schema-drift cleanup merged to develop
Fast-forward aaffb81..452f1d4 (3 commits), feature branch deleted, develop ahead of origin/develop by 3 — push pending (user-side, known SSH-key trap). GitNexus index refreshed after merge.

## 2026-10-04
- **What works:** registry-only guidance pool starts sessions for ANY registered workspace (alphabetical-first fallback bug fixed, commit 5d1437e on fix/registry-only-default-root-guard); container redeployed and verified live (niyama + thinking-mcp).
- **Open:** branch not yet merged to develop; the Niyama agent can rerun its workflow with workspace "niyama".
- **Current state:** guidance suite 616/616 green; knowledge graph reindexed.

## 2026-10-05 — specs/017 spec-kit mode (feature/017-spec-kit-mode)

### What works
- Workflow selection at session start: `start_workflow {workflowId}` resolves the session definition from `<configDir>/workflows/<id>.json` (per workspace root, pool-compatible); absent workflowId keeps the boot definition byte-identical (FR-1/FR-2/FR-9).
- Per-key `$include` variant loading with fail-closed missing-target, cycle and unknown-phase validation (FR-3/DQ-2); include cycles throw classified `include_cycle` errors.
- `spec-kit-development` variant shipped in `.guidance/workflows/` with artifact-bound phases: commands rendered into phase guidance; fail-closed artifact exit gate reusing `checkArtifactPattern` (same discovery as import); `artifacts_present` skip recorded in session state (FR-4/FR-8).
- Strict batch cadence: batch-scoped implement submissions, `batch_approved_more_pending` loop, all-batches-approved gate for `submission_valid`, per-batch review-round max with user-decision blocker (FR-6).
- Hash-based converge loop: tasks.md snapshot at verify ENTRY, byte-diff classification (DQ-1), refresh-before-loopback guidance, convergence-pass max with blocker (FR-7).
- FR-10 helper `nextFeatureNumber()` aligned with `get_highest_from_specs`.
- Guidance suite 667/668 green (1 pre-existing failure labeled baseline: speckit-pool-mode.test.ts typecheck, commit 7884ba4); 7 new test files cover AC1–AC7.

### What's left
- Commit(s) on feature/017-spec-kit-mode, independent review, merge to develop (rebase), README already updated.

### Current state
Implementation complete on feature branch; session session-c4ddeb4d in verify/complete.

### 2026-10-07 (Verify+Review complete)
- Verify gates lint+build green; convergence converged (tasks.md hash unchanged across the pass).
- Independent reviews (A: registry/config, B: engine) executed; 1 HIGH + 4 medium/low fixed in 9be7c2e, full suite 668/668 green afterwards; 2 low findings classified accepted with trigger points.
- Commits: 1380da2 (feature), 9be7c2e (review fixes). Branch feature/017-spec-kit-mode ready for merge review.

### 2026-10-07 (Merge): specs/017 spec-kit mode merged to develop
Fast-forward 6455cc7..80069f1 (5 commits), feature branch deleted, develop ahead of origin/develop by 5 — push pending (user-side, known SSH-key trap). Guidance suite 668/668 green post-merge; GitNexus index covers new HEAD.

### 2026-10-07 (Chain complete): 017 follow-ups resolved on feature/017-final-review-mediums
- Chain session-3a03faf2 (head: baseline typecheck, RESOLVED 01071e9) -> successor Final#1 (session-012866f1, variant degradation marker, 0babcc6/68e5b1a) -> successor Final#2 (session-1c9082e9, convergence snapshot signal, 02a09cf/92718c8). All sessions completed with green gates (docs-drift, final-review, index-freshness, repository-analysis, capture-session-lessons).
- Suite 674/674 green; typecheck fully clean (baseline eliminated). Open tracked follow-ups: 2 low (Final#1 final review) + 3 low/1 info (Final#2 final review) + FR-10 wiring + include-cycle spec note — all with trigger points in remaining-work-plan.md.
- Next: merge review of feature/017-final-review-mediums into develop, push (user-side SSH).
