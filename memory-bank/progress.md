# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-09-16

## What Works

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
