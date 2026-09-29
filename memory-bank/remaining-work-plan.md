# Remaining Work Plan — Thinking-MCP

> Tracked follow-ups. Every unresolved review finding (any severity) must be
> persisted here AND in `activeContext.md` before a scope is closed
> (AGENTS.md → Findings Lifecycle Rule).
>
> Entry format:
> `[ID] severity | finding | trigger point | status (action required / accepted with rationale)`
>
> **Batch-Status 2026-09-29:** TMPL-1 ✅, TMPL-2 ✅ (glibc-Basis, commit
> 8134a46), TMPL-3 ✅ (Divergenz-Fingerprint, 81faece+4da7f44), REV-2 ✅
> (03952b3) — alle vier Scopes des abends 2026-09-29 abgeschlossen und auf
> develop; offen: CHAIN-1 (Guidance-Server-Defekt), TMPL-4 (accepted),
> REV-1-HISTORIE/REV-3 (Regel/Verhalten), CHN-/R-Serien (akzeptiert),
> NIY-CFG-3/NIY-Seite (Niyama-Owner).

## Tracked Follow-ups

- [CHAIN-1] MEDIUM (Guidance-Server-Defekt 2026-09-29, entdeckt in
  session-a0fbcd9e/59659d57, action required) | Chain-Cursor- replay:
  start_workflow MIT chain (source spec_kit_tasks, explicit steps) UND
  zugleich einem top-level `request` führt dazu, dass der erste Session-
  Lauf unter dem top-level Request läuft, die Successor-Session aber
  WIEDER steps[0] bekommt (chainIndex=1 im State, request aber steps[0]-
  Text) — Step-0 wird doppelt ausgeführt bzw. die Verkettung ist um eins
  verschoben. Repro: 4-Step-Chain (TMPL-1/2/3 + REV-2); nach Complete von
  session-a0fbcd9e war successor 59659d57 = TMPL-1-Text (schon erledigt);
  gecancelt, Rest-Kette (TMPL-2/3, REV-2) als neue 3-Step-Chain
  session-5cc970dd gestartet.
  | Trigger: nächster Kontakt mit WorkflowEngine chain-Composition
  (resolveChainStep/completeWorkflowLocked Form A) — Step-Cursor bei
  top-level-request-Chains korrigieren ODER top-level request + chain
  als Konfigurationsfehler fail-closed ablehnen; Regressionstest.
  | action required.

- [REV-1] LOW (Session-Review 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-28) |
  FR-035-Timeout-Fallback für GitNexus: gitnexus hatte keine Container-Route
  → GEFIXT: `containerRoute` für gitnexus definiert (live
  .guidance/downstream-servers.json + Template + buildDownstream-Generator;
  Endpoint `:4747/api/mcp`, per Initialize-Probe verifiziert; Egress-
  Allowlist :4747 war bereits vorhanden; Live-Config im Container per
  loadConfig validiert; Regressionstest für beide Transports; Suite 430/430).
  Commit ff3dc1d. Regeltext-Klärung (report_blocker vs. CLI-Fallback nach
  2. Timeout) verbleibt als akzeptierte Anmerkung in REV-1-Historie — der
  praktische Fall (route unavailable → lokal) ist nun obsolet.
  | — | resolved
- [REV-1-HISTORIE] LOW (Session-Review 2026-09-28, session-2c0c15fe, accepted
  with rationale) | FR-035-Timeout-Fallback-Reihenfolge: nach 2× Timeout von
  GitNexus-MCP `impact` direkt auf grep/terminal-CLI statt report_blocker/
  Container-Route. Fundstelle siehe REV-1 (resolved). | — | resolved
  (subsumed)
- [REV-2] LOW (Session-Review 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-29) |
  `get_next_task` ohne importierte Spec-Kit-Artefakte wirft
  `spec_kit_artifact_missing` mit irreführendem Import-Only-Hinweis —
  GEFIXT (commit 03952b3): Message nennt jetzt beide Wege (import für
  Task-Tracking ODER Task-Tools meiden → plan-level submissions);
  Contract-Test (tests/speckit/state-store-message.test.ts) pinnt Code +
  recoverable + beide Marker; README Spec-Kit-Bullet dokumentiert die
  Zwei-Wege-Behavior. main.ts CHN-4 (silent auf diesem Code) unberührt.
  | — | resolved
- [REV-2-ALT] LOW (Session-Review 2026-09-28, session-2c0c15fe, action
  required) | Original-Beschreibung (Fehlaufruf-Kontext, reproduziert
  auch post-completion) — siehe REV-2 (resolved). | — | resolved
  (subsumed)
- [REV-3] LOW (Session-Review 2026-09-28, session-2c0c15fe, action
  required — Regelverstoß) | `git diff --stat` ohne `--no-pager` in WSL
  ließ das Terminal hängen (User musste abbrechen); Retry mit `--no-pager`
  sofort grün. Verstoß gegen AGENTS.md-Terminal-Regel ("read-only git
  commands MUST include --no-pager"). Reproduzierbar: Pager-Start bei
  langem Diff im non-interaktiven pty.
  | Trigger: ab sofort JEDER git-Lesebefehl mit `--no-pager` (steht schon
  in AGENTS.md); Lesson in lessonsLearned.md ergänzt. | action required
  (Verhaltensregel, kein Code-Fix).

- [TMPL-1] LOW (Guidance-Session 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-29) |
  Prettier-Drift in 5 Dateien (src/config.ts, metrics/MetricsRepository.ts,
  remote/remote-session-manager.ts, state/SessionRepository.ts,
  workflow/WorkflowEngine.ts) — lint-Gate (required:false) failt seit
  Container-Lauf. Keine dieser Dateien ist Teil des Genericity-Diffs.
  | Trigger: nächster Touch einer der 5 Dateien ODER Aufräumdurchlauf —
  gezielt `npx prettier --write` auf genau diese 5 Dateien — erledigt
  (Commit auf feature/tmpl1-prettier-drift; check gruen gesamt src, tsc
  clean, Suite 430/430). Wurzelursache (floating ^3.1.0) als
  Pin-Follow-up-Kandidat notiert. | resolved
- [TMPL-2] MEDIUM (Guidance-Session 2026-09-28, dieselbe Session,
  RESOLVED 2026-09-29) | server-insight-Tests failen im Guidance-Container
  komplett (72 Failures): better-sqlite3 glibc/musl dlopen — GEFIXT
  (commit 8134a46, TMPL-2-Session 5cc970dd): Image auf node:24-trixie-slim
  (glibc 2.41 = Host, node 24 = ABI 137 = Host-Toolchain); in-container
  insight 118/118 (vorher 72), guidance 430/430, clear-thought 166/166,
  stochastic 43/43; procps ergänzt (FR-202 ps ax). Ermittlung empirisch
  zweistufig: musl → ABI-Mismatch → procps. Dauerhaft im Image gebacken.
  | — | resolved
- [TMPL-3] LOW (Round-2-Review 2026-09-28, session-2c0c15fe,
  RESOLVED 2026-09-29) |
  Divergenz-Erkennung auf Top-Level-args beschraenkt — GEFIXT (commit
  81faece + 4da7f44): Fingerprint ueber {type, server, capability, args,
  arguments, steps} mit ${project.name}-Normalisierung; divergentOps im
  adoption-Block (guidance.json) maschinenlesbar; Note-Text generalisiert
  ('reference invocation details'). Fingerprint fing sofort 3 echte
  Builtin-Template-Drifts (repository-analysis analyze→check +
  noStats→repo, query-project-insights query_insights→experience_search +
  scope→scope_id) — Template aligned, Builtin-Sync-Pin assertet
  divergentOps [] (Review-F-1). F-3 (nested key-order advisory
  false-positives, by design) + F-4 (description ausserhalb Fingerprint)
  accepted. Semantik unveraendert (Preset-Ops regenerieren immer).
  | — | resolved
- [TMPL-5] LOW ( TMPL-3-Follow-up 2026-09-29, action required → teils erledigt) |
  Tote Insight-Tool-Namen im Builtin-Template: `store-completion-insight`
  rief `store_insight` auf (Tool existiert nicht mehr — Insight-Server
  exposeed nur experience_*/lesson_*/workflow_*/validation_*), downstream-
  Allowlist + Fixtures trugen `store_insight`/`query_insights`.
  GEFIXT: Op + beforeExit-Referenz aus Template entfernt (Capture-Session-
  Lessons ist der moderne Ersatz, kommt via buildOperations), downstream
  → [experience_search, experience_record_observation], Fixtures aligniert;
  Independent Review 6cab6fbe: 0 HIGH/CRIT, 55/55 gezielt, 432/432 settled.
  REST (LOW, accepted mit Trigger): SDD-/specs-002-Baseline-Dokumente
  nennen store-completion-insight/store_insight noch (historische Records —
  Update wenn 002-Doku nächstes Mal in Scope); stale Testkommentar behoben.
  | Trigger: 002-Doku-Auffrischung. | teils resolved, Rest accepted.
- [TMPL-4] LOW (Round-1/2-Reviews, accepted with rationale) | catch→
  freshOpsMap={}-Fallback und empty-refOpsMap-Adopt ungetestet (by-inspection
  korrekt + konservativ); capture-session-lessons-Divergenz und
  mcpTool-arguments-Adopt-Pfad nur transitiv abgedeckt.
  | Trigger: nächster Test-Ausbau an config-assistant-extensions.test.ts.
  | accepted with rationale.

- [NIY-CFG-1] MEDIUM (Infrastruktur-Blocker 2026-09-28, session-46a43aeb-6a87-4730-ac64-c73e613ae8d9,
  RESOLVED 2026-09-29) |
  Lint-Glob im Niyama-.guidance/operations.json
  (`servers/*/src/**/*.{ts,tsx}`) → ersetzt durch `npm run lint` (Niyama
  hat echtes lint-Script `eslint .`). Restliche Config geprüft: build/test/
  repository-analysis generisch korrekt. Ursachenklasse generell behoben
  durch Config-Assistant-Fix 709ed15 (Thinking-MCP develop). Niyama-Repo
  hat uncommittete Änderungen (Task-1-Scope + dieser Fix) — Commit
  obliegt dem Niyama-Owner. | — | resolved
- [NIY-CFG-2] MEDIUM (Infrastruktur-Blocker 2026-09-28, dieselbe Session,
  RESOLVED 2026-09-29 mit Dauerhaftigkeits-Vorbehalt) |
  Test-Runtime im Guidance-Container (`server-guidance-guidance-1`,
  Niyama unter /workspaces/Niyama) repariert: corepack-pnpm 12.4.2
  aktiviert + `pnpm install --frozen-lockfile` (36.7s); danach noch
  `apk add git bash` nötig (Niyama-Tests spawnen git init / bash —
  Alpine-Image hatte beides nicht; 10 → 0 Failures). Baseline im
  Container: build ✅, lint ✅ (0 errors), test 440/440 ✅.
  | Restrisiko/Trigger: apk/corepack/node_modules sind Container-RUNTIME-
  State — DAUERHAFT GEFIXT 2026-09-29: Guidance-Dockerfile backt nun
  git + bash + corepack-pnpm-Shim ein (commit cecc9da, `build(guidance):
  bake workspace toolchain into the image`); Shim löst je Workspace deren
  packageManager-Pin auf (Niyama 12.4.2 verifiziert über echten Mount).
  node_modules je Workspace bleiben Workspace-State (pnpm install nach
  Rebuild/Erstmount — frozen-lockfile). TMPL-2 (better-sqlite3) seit
  2026-09-29 durch die glibc-Basis selbst gelöst. | resolved (mit
  Dockerfile-Follow-up)
- [NIY-CFG-3] INFO (gleicher Ursachenkomplex, accepted with rationale) |
  Verbleibende C0-Tasks (Task 1 war abgeschlossen) laufen in einer FRISCHEN
  Guidance-Session pro Batch, nicht in der abgebrochenen — Session war
  bereits in Phase `complete`; Weiterbetrieb würde die Lifecycle-Gates
  (release_batch/start_task/verify_task) umgehen.
  | Trigger: Start des nächsten C0-Batches. | accepted with rationale.

- [CHN-R2-1] LOW (Final Comprehensive Review 2026-09-26, bb37f6c, accepted) |
  Replay-Staleness durch CHN-5-Fix: Crasht der Wrapper NACH Successor-
  Aktivierung, aber VOR Re-Cache des requestIds-Resultats, liefert ein
  Replay der complete_workflow den gecachten chain-Entry mit status
  'activating', obwohl der Successor längst active/blocked ist (Wrapper
  überspringt die Aktualisierung bei status != activating, WorkflowEngine
  ~L1311). Rein informativ — der Client-Loop folgt nextSessionId und holt
  den Realstatus via get_current_guidance. | Trigger: nächster Touch von
  `completeWorkflow` — Entry-Status im Replay-Zweig finalisieren oder
  dokumentieren. | accepted with rationale (ersetzt die veraltete
  Beschreibung in [CHN-5] LOW-6 unten).
- [CHN-R2-2] RESOLVED 2026-09-26 (Final Comprehensive Review, war LOW/accepted) |
  Testlücke FR-119 geschlossen: Test „CHN-R2-2 mixed manifest (steps +
  source) in plain profile rejected entirely“ in chain.test.ts (19
  Chain-Tests). Commit 7cb55be. | — | resolved
- [CHN-R2-3] NIT (Final Comprehensive Review 2026-09-26, bb37f6c, accepted) |
  CHN-1-Recovery reaktiviert ohne FR-043-Reconciliation: `retryOperations`
  lädt raw (`sessions.load`) und ruft `activateSession` erneut — Hooks, die
  beim Crash schon liefen, werden komplett neu ausgeführt;
  `reconcileRunningOperations` greift hier nicht (nur in getWorkflowState).
  Identische Semantik wie der etablierte FR-040-Retry-Pfad, kein Regression —
  Rest-Risiko nur im Doppel-Crash-Fenster (Crash mid-Hook auf activating
  Successor). | Trigger: falls required Hooks state-changing werden.
  | accepted with rationale.
- [CHN-R2-4] NIT (Final Comprehensive Review 2026-09-26, bb37f6c) |
  memory-bank-Hygiene: die superseded CHN-4/5/6-Original-Einträge (unten,
  'accepted/action required') tragen keinen Rückverweis auf die RESOLVED-
  Einträge oben (nur CHN-3-R1/R2 haben -HISTORIE-Aliase). | Trigger:
  nächster Aufräumdurchlauf von remaining-work-plan.md. | accepted with
  rationale.

- [CHN-4] RESOLVED 2026-09-26 | Form-B-Silent-End auditert jetzt
  `chain_end {reason: no_pending_tasks, chainedCount}` (nur wenn source
  gesetzt; reine Form-A-Erschöpfung bleibt still, §3.2); Bridge-Fehler in
  composeApplication laufen auf stderr statt still zu verschwinden
  (Verhalten [] unverändert). | — | resolved
- [CHN-5] RESOLVED 2026-09-26 | completeWorkflowLocked cacht das
  Successor-Result bereits im Lock mit vollständigem chain-Entry (status
  'activating'), Wrapper finalisiert — Crash-Replays haben immer ein
  vollständiges chain-Entry (Test CHN-5). | — | resolved
- [CHN-6] RESOLVED 2026-09-26 | startWorkflow lädt nach activateSession
  die Session frisch (sessions.load) für Guidance + Status — kein
  Pre-Aktivierungs-Snapshot mehr (NIT-7 holsch). | — | resolved
- [CHN-3-R1] RESOLVED 2026-09-26 (war HIGH) | Form-B-Cursor-Reset
  (Details der Fundstelle siehe Historie unten): GEFIXT — Form-B-Zweig
  liefert `upNext: steps.length` (Successor chainUpNext ≥ steps.length,
  für reines Form B inert); Regressionstest „CHN-3 HIGH-1 regression“
  (2 Form-A-Steps + source + 1 Task → nach T001 stummes Ende, kein
  step-two-Re-Run). 17 Chain-Tests / 249 gesamt grün. | — | resolved
- [CHN-3-R2] RESOLVED 2026-09-26 (war MEDIUM) | Scope-Abweichung
  verifiziert und behoben: die 25 Out-of-Scope-Dateien waren reines
  Prettier-Reformatting (LF/Zeilenumbruch) durch einen zu breit
 laufenden `prettier --write` über das gesamte src-Verzeichnis —
  `git checkout --` auf alle nicht intendierten Dateien, Diff wieder auf
  die 7 intended Files begrenzt. Lehre: prettier nie breiter als die
  intendierten Files ausführen. | — | resolved (reverted)
- [CHN-3-R1-HISTORIE] HIGH (CHN-3 Review, 2026-09-26) | Mixed-Chain Form-B-Cursor-
  Reset: `resolveChainStep` liefert für Form-B-Schritte `upNext: 0`
  (WorkflowEngine.ts:743), `completeWorkflowLocked` setzt daraus
  `chainUpNext = upNext + 1 = 1` (WorkflowEngine.ts:1543). Bei Manifesten
  mit `steps.length >= 2` + `source` zeigt der Cursor damit ZURÜCK in Form
  A: nach JEDEM Form-B-Task wird `steps[1]` erneut ausgeführt, bis der
  Depth-Gate (`chain_depth_exceeded`) die Kette abwürgt — Verstoß gegen
  §12. Reproduziert durch den Reviewer; Regressionstest
  „CHN-3 HIGH-1 regression“ nachgeliefert → siehe CHN-3-R1 RESOLVED oben.
  | — | resolved (fixed)
- [CHN-3-R2-HISTORIE] MEDIUM | Scope-Abweichung: 25 Dateien reformattet
  (Prettier zu breit gelaufen) — siehe CHN-3-R2 RESOLVED oben (reverted).
  | — | resolved (reverted)
- [CHN-3-R2] MEDIUM (CHN-3 Review, 2026-09-26) | Review-Scope-Abweichung:
  der deklarierte Review-Scope (register-tools.ts, WorkflowEngine.ts,
  README, Spec §12, chain.test.ts) deckt nur einen Teil des tatsächlichen
  uncommitteten Diffs ab — 25 weitere Dateien mit substanziellen Änderungen
  (u. a. SpecKitEngine.ts +755 Zeilen, ConfigAssistant.ts, remote-tools.ts,
  server.ts) sind unreviewed; der Feature-Branch hat NULL Commits
  (HEAD == develop 49a18bc). Zudem markiert der bestehende Eintrag
  [CHN-3] „RESOLVED“ — mit CHN-3-R1 offen ist das präzisieren.
  | Trigger: Commit/PR-Erstellung des Branches — Out-of-Scope-Diff entweder
  separieren, nachreviewen oder explizit als separater Scope deklarieren.
  | action required
- [CHN-3] RESOLVED 2026-09-26 | Mixed-Manifeste (Q-B revidiert):
  `steps` + `source` kombinierbar (Spec-Amendment 002 v1.1, §12/FR-119);
  Engine resolveChainStep zwei-phasig (Form A bis Erschöpfung, dann Form
  B), chainedTaskIds nur durch Task-Steps fortgeschrieben, plain + source
  abgelehnt. Tests: Mixed-Happy-Path + Validierung + HIGH-1-Regression
  (17 Chain-Tests / 249 gesamt). | — | resolved
- [CHN-2] RESOLVED 2026-09-26 | Dogfooding aktiviert: `chain: {enabled:
  true, maxChainDepth: 8, maxStepsPerManifest: 16}` in
  `.guidance/guidance.json` (plain-Profil ⇒ Form A). KRITISCHER Hinweis:
  Aktivierung OHNE Image-Rebuild würde den nächsten Container-Restart
  brechen (alte Boot-Validierung kennt 'chain' nicht,
  additionalProperties:false) — Image wurde im selben Zug neu gebaut
  (`docker compose build && up -d`, /health ok). loadConfig-Smoke +
  247/247 Tests grün. | — | resolved
- [CHN-1] RESOLVED 2026-09-26 | Re-Activation-Pfad implementiert:
  `retryOperations` fängt Status `activating` ab (vor dem
  `chain_activation_incomplete`-Wurf von getSession), führt
  `activateSession` erneut aus — Erfolg → active + Audit
  `chain_activation_recovered`, FR-040-Fail → blocked + recoverable
  `required_hook_failed`. Tests §10.11b/§10.11c in chain.test.ts
  (14 Chain-Tests / 247 gesamt grün). | — | resolved
- [CHN-7] LOW (CHN-1 Review #3, accepted) | Response-Kontrast: der neue
  Recovery-Fail-Pfad in `retryOperations` liefert `status` (wie
  reportBlocker/resumeWorkflow), der bestehende FR-040-Retry-Fail-Pfad
  verzichtet darauf; Recovery-Erfolg hat kein `previousPhase` (kein
  Phasenübergang). Loose SubmitResult-Union ⇒ kein Consumer-Break.
  | Trigger: nächster Touch von `retryOperations`. | accepted with rationale
  (optionale Alignment-Follow-up).
- [CHN-4] MEDIUM (Post-Merge-Review MEDIUM-2, accepted) | Form-B-Brücke
  (specKitTasks-Callback in `composeApplication`) fängt jede Exception als
  `[]` — ein defekter Spec-Kit-State beendet die Kette "regulär stumm"
  (FR-117-Silent-End) statt diagnostisch unterscheidbar zu sein.
  | Trigger: Form-B produktiver Einsatz oder nächster Touch der Brücke.
  | action required: Load-Fehler von leerer Liste unterscheiden oder
  `chain_end`-Audit-Event mit Bridge-Status ergänzen.
- [CHN-5] LOW (Post-Merge-Review LOW-6, accepted) | Crash nach Successor-
  Aktivierung, aber vor Re-Cache des requestIds-Resultats: Replay liefert
  `nextSessionId` ohne `chain`-Entry (rein informativ; Client-Loop folgt
  nextSessionId). | Trigger: nächster Touch von `completeWorkflow`.
  | accepted with rationale.
- [CHN-6] NIT (Post-Merge-Review NIT-7, accepted) | `startWorkflow` baut
  die Response-Guidance aus dem Pre-Aktivierungs-Snapshot (lokal
  veraltetes Session-Objekt); aktuell wirkungslos, da `guidanceFor` nur
  statische Texte + chainTaskScope liest. | Trigger: falls `guidanceFor`
  künftig dynamischen Session-Zustand einbezieht. | accepted with rationale.
- [CHN-1] MEDIUM | Workflow-Chaining (Amendment 002, implementiert auf
  `feature/workflow-chaining`): eine im Crash-Fenster zurückbleibende
  `activating`-Session wird fail-closed abgelehnt (`chain_activation_incomplete`),
  aber `retry_operation` nimmt sie nicht automatisch wieder auf (Re-Activation
  erfordert manuellen Eingriff/Neustart). Fail-closed verhindert jeden
  Gate-Bypass; die komfortable Wiederaufnahme fehlt. | Trigger: nächster
  Touch von `WorkflowEngine.retryOperation` oder ein Chaining-Feedback aus
  produktiver Nutzung. | action required: Re-Activation-Pfad ergänzen
  (retry_operation oder Startup-Recovery) + Test.
- [CHN-2] LOW | Chain-Dogfooding: `chain` ist implementiert, aber in der
  repo-eigenen `.guidance/guidance.json` noch nicht aktiviert (Default
  `enabled:false`, Arbeits-Annahme Q-A). | Trigger: Merge von
  `feature/workflow-chaining` nach develop. | action required: Nutzer-
  Entscheidung — `chain.enabled: true` setzen oder bewusst deaktiviert lassen.
- [CHN-3] LOW | Mixed-Chain-Manifest (Form A steps + Form B source kombiniert)
  ist aktuell exklusiv (z.union) abgelehnt (Arbeits-Annahme Q-B). | Trigger:
  falls ein Anwendungsfall „erst Steps, dann task-abgeleitet“ auftritt.
  | accepted with rationale; ggf. Folgearbeit im Spec.

- [GUID-6] CLOSED 2026-09-25 | Frische-Prüfung deterministisch im Gate:
  neue blocking-Operation `index-freshness` (Skript
  `servers/server-guidance/scripts/check-index-freshness.mjs`, reiner Node
  ohne git-Binary) vergleicht `.gitnexus/branches/*/meta.json` (lastCommit)
  gegen git HEAD (loose ref + packed-refs-Fallback, detached-HEAD-tolerant)
  und failt bei Staleness mit Differenzdetail — live demonstriert: Commit
  `4ee166e` nach dem letzten Analyze → Gate-Fail „no index covers HEAD“,
  nach `gitnexus analyze --no-stats` → grün. Root-meta.json ist KEIN
  Frische-Indikator (Inkremental-Analyze aktualisiert nur branches/*).
  Rest: gitnexus-native Staleness-API bleibt Nice-to-have (Skript macht sie
  überflüssig, solange branches/* zuverlässig gepflegt wird). | — | resolved
- [GUID-3] CLOSED 2026-09-25 | Template-Platzhalter werden jetzt aufgelöst:
  `OperationContext.templateVars` (befüllt von `WorkflowEngine.ctxFor` mit
  `session.request` + `project.name`), tiefe `${token}`-Resolution für
  `mode: "template"` in OperationEngine (Fail-fast `operation_arguments_invalid`
  bei unbekannten Tokens — Literal-Passthrough ausgeschlossen); `mode: "fixed"`
  bleibt literal. Regressionstests in
  tests/orchestration/operation-engine-env-template.test.ts. | — | resolved
- [GUID-4] CLOSED 2026-09-25 | Regression-Coverage für den ESM-createRequire-
  Fix nachgereicht: (a) Schema-Load über public API (`submit` understand→plan,
  valid + invalid durch den echten validatorFor-Pfad), (b) Source-Scan-Test
  gegen bare-`require("…")`-Rezidiv in WorkflowEngine.ts
  (tests/workflow/schema-load-regression.test.ts). | — | resolved
- [GUID-7] CLOSED 2026-09-25 | Umschaltbares `workspaceRoot` pro Session —
  als Server-Feature nicht nötig: `start_workflow` nimmt `workspaceRoot`
  bereits pro Session entgegen (`assertWorkspaceInside` akzeptiert alles
  unter `/workspace`), und `docker-compose.override.yml` mountet seit heute
  `D:/repos/Thinking-MCP-worktrees` nach `/workspace/worktrees`. Muster:
  `git worktree add` auf dem Host unter Thinking-MCP-worktrees, dann
  `start_workflow` mit `workspaceRoot: /workspace/worktrees/<name>` — alle
  Gates (inkl. index-freshness via Worktree-eigenem .gitnexus) laufen im
  Worktree; einmal `npm install` im Worktree für build/test-Gates. Live
  verifiziert: start_workflow mit Worktree-Root → accepted.
  | — | resolved (Deployment-Muster statt Server-Feature)
- [GUID-1] CLOSED 2026-09-25 | Gate feuerte produktiv im complete-Lauf und
  ging grün: `repository-analysis` succeeded (check `{repo:"thinking-mcp"}`
  nach GUID-3-Workaround + Container-Restart). Session
  `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` completed. Restrisiko
  dokumentiert in activeContext (Docker-Mounts vs. Indexstand, vgl. HD-4)
  bleibt Beobachtungspunkt für künftige Läufe. | resolved (grüner Lauf)
- [GUID-2] CLOSED 2026-09-25 (subsumed) | `store-completion-insight`-Args
  unvollständig — die Operation wurde im Zuge der Capture-lessons-Integration
  **komplett entfernt** und durch `capture-session-lessons` ersetzt
  (Prozess-Gate, seed-lessons.mjs, idempotent, blocking; Commit `2e72c9a`).
  Ursprünglicher Trigger existiert nicht mehr. Duplikat-Eintrag konsolidiert.
  | — | resolved (subsumed)
- [x] HD-2 | LOW | `connection.startupTimeoutSeconds` war nicht verdrahtet —
  `ClientManager.handshakeTimeoutMs` hardcoded 10 s. GELÖST (Commit „wire
  per-server handshake timeout"): `ensureReady` nimmt
  `connection.handshakeTimeoutSeconds` (aus `startupTimeoutSeconds`) pro Server;
  Config-Validierung positiv-finit; invalid value ⇒ failed status (kein Crash);
  Test mit hängendem Transport beweist die Verdrahtung (fail ~200 ms bei
  Default 10 s). detect-changes: risk MEDIUM, nur erwartete Symbole. | — |
  resolved
- [GUID-2] CLOSED 2026-09-25 (subsumed) | `store-completion-insight`-Args
  unvollständig — die Operation wurde im Zuge der Capture-lessons-Integration
  **komplett entfernt** und durch `capture-session-lessons` ersetzt
  (Prozess-Gate, seed-lessons.mjs, idempotent, blocking; Commit `2e72c9a`).
  Ursprünglicher Trigger existiert nicht mehr. | — | resolved (subsumed)
- [GUID-5] CLOSED 2026-09-25 | `env`- und `shell`-Optionen für Prozess-
  Operationen implementiert (OperationConfig + spawnSync: env-Merge über
  process.env, shell boolean|string; Validierung in config.ts; Unit-Tests
  inkl. Negativ-Nachweis ohne env). eigene operations.json auf env umgestellt
  (sh -c-Wrapper entfallen). Rest: umschaltbares workspaceRoot → GUID-7.
  | — | resolved
- [GUID-5] CLOSED 2026-09-25 | `env`- und `shell`-Optionen für Prozess-
  Operationen implementiert (OperationConfig + spawnSync: env-Merge über
  process.env, shell boolean|string; Validierung in config.ts; Unit-Tests
  inkl. Negativ-Nachweis ohne env). eigene operations.json auf env umgestellt
  (sh -c-Wrapper entfallen). Rest: umschaltbares workspaceRoot → GUID-7.
  | — | resolved
- [HD-3] CLOSED 2026-09-25 | Stateful-Downstream-Regression automatisiert:
  tests/orchestration/client-manager-http-stateful.test.ts — in-process
  stateful MCP-HTTP-Server (echtes StreamableHTTPServerTransport mit
  sessionIdGenerator + mcp-session-id); ClientManager über die HTTP-Branch
  von transportFor. Gedeckt: ensureReady/Discovery in Session, invokeTool
  success + Server-seitiger Session-Header-Nachweis, verlorene Session →
  deterministische transport-Klassifikation (Server-404-Zähler). 3/3 Tests
  grün. Dokumentierte Grenze: Stub antwortet JSON statt SSE
  (Live-Server-Antwortformat) — Rest als Coverage-Notiz im Eintrag. | — | resolved
- [HD-1] MEDIUM | HTTP-Downstream-Reconnect fehlt: `connection.reconnect`
  war dokumentiert, aber nicht implementiert. GELÖST (Commit „feat(guidance):
  reconnect downstream after transport failures"): ClientManager merkt sich
  Transport-/Handshake-Parameter pro Server; nach transport failure werden
  toter Client verworfen, Handshake bis zu `maximumAttempts`-mal wiederholt
  (`delayMilliseconds` dazwischen) und der Call erneut ausgeführt. Invalid
  config (z.B. requestTimeoutSeconds) wird NIE retryt. Validierung: reconnect
  = Objekt mit enabled:boolean, maximumAttempts: positive int,
  delayMilliseconds: non-negative int (fail-closed). Tests: Reconnect-After-
  Death, Exhausted-Attempts („reconnect attempt 2/2"), Disabled/Unconfigured,
  Invalid-Timeout-Kein-Retry. Rest: Backoff-Strategie (exponentiell/Jitter)
  bewusst nicht implementiert — fixed delay, dokumentiert.
  **Review-Nachschub (2026-09-25): F1 (MEDIUM, gefixt):** Reconnect griff
  zunächst auch auf Request-Timeouts — der Call lief downstream bereits
  (kein AbortSignal) und wäre automatisch wiederholt worden ⇒
  Duplication-Risiko für nicht-idempotente Tools, Widerspruch zu FR-035.
  Fix: Transport-Failures tragen jetzt `timedOut: true` und werden vom
  Reconnect explizit ausgenommen (Regressionstest: Transport-Factory nach
  Timeout genau 1× gerufen). **F2 (LOW, gefixt):** README klärt, dass
  `maximumAttempts` für Wirkung erforderlich ist. | — | resolved
- [HD-2] LOW | `connection.startupTimeoutSeconds` ist nicht verdrahtet —
  `ClientManager.handshakeTimeoutMs` ist hardcoded 10 s (pre-existing, für kalt
  startende HTTP-Downstreams relevanter). | Trigger: nächster Touch von
  ClientManager.ensureReady. | accepted with rationale (klein, bewusst
  zurückgestellt)
- [HD-3] LOW | HTTP-E2E-Test deckt nur stateless Downstream (guidance
  createHttpApp) ab; stateful-Session-Verhalten des
  StreamableHTTPClientTransport gegen insight (sessionIdGenerator) ist nicht
  automatisiert getestet. | Trigger: insight als Downstream in einer
  guidance-Config produktiv gesetzt wird. | GELÖST (2026-09-25, manuell
  verifiziert): Live-Check mit echtem ClientManager gegen die statefulen
  Server — insight: ready, 20 Tools, invoke → tool_reported (korrekte
  Fehlerklassifikation ohne Args); gitnexus :4747/api/mcp: ready, 17 Tools,
  invoke list_repos → success. Session-Handling (mcp-session-id) vom SDK-Client
  bestätigt. Regressionsschutz als automatisierter Test bleibt offen — das
  Live-System ist von CI aus nicht adressierbar; Ersatz über einen statefulen
  In-Process-HTTP-Stub beim nächsten Touch des Tests. | action required
  (nur der automatisierte Test)
- [x] HD-4 | INFO | MCP-Toolzugriff 2026-09-25: (a) Clear-Thought/GitNexus
  Context-Server-Timeouts (Impact grep-substituiert). (b) Docker-MCP (:4747)
  hat eigenen leeren Registry (sieht nur …\\GitNexus\\workspace) — WSL-CLI ist
  separater Wahrheitsraum. (c) WSL-Index war inkonsistent (quarantined WAL,
  /mnt/c-Duplikat). GELÖST: gitnexus remove /mnt/c-Duplikat + clean +
  analyze --no-stats → detect-changes läuft vollständig (11 files, 41 symbols,
  risk HIGH — erwartbar: loadConfig/WorkflowEngine sind Startup-kritisch;
  Änderungen additiv/rückwärtskompatibel, 206/206 Tests + tsc grün als
  Kompensation). Offen (akzeptiert): Docker-MCP sieht D:\repos nicht — für
  MCP-seitige Tools wäre ein zusätzlicher Container-Mount nötig; bis dahin
  CLI (WSL) als Quelle. | Trigger: Nutzung der GitNexus-MCP-Tools für dieses
  Repo. | resolved (Rest: accepted with rationale)

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
- [x] Prompt-Kopien von `.github/prompts/capture-lessons.prompt.md` in anderen Repos aus dem Master syncen — GESCHLOSSEN ALS OBSOLET (2026-09-26, User-Entscheid Option 3): Verteilung läuft über Paket/Smithery bzw. den Master-Prompt; keine Repos-Kopien nötig. Verifiziert: kein anderes Repo unter D:/repos enthielt je eine Kopie/Referenz (grep 0 Treffer). Action done (obsolet).
- [x] Docker-Image neu bauen + deployen (VERIFIZIERT 2026-09-24: HTTP-Server läuft auf :3002, experience_seed_lessons per HTTP erfolgreich genutzt — Werkzeug vorhanden). Action done.
- [x] FTS-Retrieval wirkungslos (2026-09-22 entdeckt, direkt gefixt): fehlender `episodes_fts`-Writer (Trigger + Backfill in `sqlite.ts` init), INNER JOIN auf `signatures` in `searchFullText` → LEFT JOIN, FTS-Treffer-Bonus (+0.30) im Relevance-Scoring. Live verifiziert: Slug-Suche liefert Ziel-Episode auf Platz 1 (rel 0.55). Action done.
- [x] FTS-Index deckt nur `goal_summary` ab — GELÖST (2026-09-26, L256): neuer FTS-Index `observations_fts` (insert-Trigger + idempotenter Backfill in `SqliteAdapter.init()`, 500-Zeichen-Cap je Observation); `searchFullText` matcht beide Indizes. Regressionstests `tests/contracts/fts-observation-coverage.test.ts` (Trigger, Backfill, Scope-Filter, Cap, CB-12-Parität). Suite 116/116. Action done.
- [x] Postgres-Adapter: FTS-Parität zu SQLite — GELÖST (2026-09-26, L257): `searchFullText` jetzt sanitized AND-joined `tsquery` über goal_summary + erste 500 Zeichen der Observations, **LEFT JOIN** signatures (INNER-Join-Bug-Klasse 2026-09-22 behoben), GIN-Expression-Indexe in Migration; Tests `tests/contracts/postgres-fts-parity.test.ts` (SQL-Contract gepinnt, gemockter pg-Client). Offen: Live-Smoke-Test bei erster Aktivierung von EMMS_STORAGE_BACKEND=postgres (siehe Trigger unten). Action done (Contract-Level); Live-Verifikation getrackt.
- [x] Global `testTimeout: 30_000` (vitest.config.ts) kann Performance-Regressionen maskieren: AKZEPTIERT als Risiko (2026-09-22, Basis-Review). Trigger für Re-Evaluation: nächste Suite-Tuning-Runde (per-Test-Timeouts für Load/Golden, Global Richtung 10s). Accepted observation.
- [x] Guidance (specs/002): Bearer-Token-AuthN RESOLVIERT (2026-09-24-Inventur): GUIDANCE_AUTH_TOKEN + timing-safe authHeader-Middleware implementiert (server.ts, getestet in http-transport.test.ts; siehe L280-Eintrag). Trigger entfällt.
- [x] index-freshness-Race bei Parallel-Work (2026-09-26, Guidance-Completion-Gate): GESCHLOSSEN — Prozessregel in AGENTS.md verankert (Abschnitt "Guidance MCP Server (Docker-Deployment)", Bullet "Completion-Gate vs. Parallel-Work"): vor complete_workflow keine parallelen Schreiber auf dem Checkout, Worktree-Isolation als Alternative, Meta-Updates vor dem finalen analyze, fremde Gate-Failures als Scope-fremd klassifizieren (report_blocker statt Reindex-Schleife). Backup: AGENTS.md.bak. Action done.
- [ ] L256/257 Review-Follow-ups (Independent Reviews 2026-09-26, APPROVED 0 HIGH/CRIT): (F1-LOW, Final-Review) Observation mit ORPHEM episode_id (kein FK auf observations.episode_id) → Trigger insertiert 0 FTS-Zeilen → Count-Divergenz → Backfill-Scan bei jedem init ohne Konvergenz (kein Retrieval-Verlust; Service-Layer legt Episoden zuerst an) — Kandidat: FK oder Trigger-Guard. (F2-LOW) SQLite-Backfill-Idempotenz keyed auf (episode_id, content-prefix) — zwei Observationen mit identischen ersten 500 Zeichen → Zähl-Divergenz fts↔observations (kein Retrieval-Verlust). (F4-LOW) signatures ohne UNIQUE(episode_id) in beiden Adaptern → LEFT-Join-Zeilenvervielfachung bei Doppelt-Signierung; DISTINCT/UNIQUE beim nächsten Retrieval-Touch. (F5-INFO) observations_fts hat nur Insert-Trigger — bei künftiger scope_id-Mutabilität wird der Index stale (Trigger-Pflicht in jeden Scope-Update-Scope). (F6-INFO) Unicode-Sanitization ([\w\s] ist ASCII) — Unicode-only Queries liefern []; künftig \p{L}\p{N} in BEIDEN Adaptern gemeinsam. (MED-Backfill behoben via Count-Guard; Live-Postgres-Smoke-Test s. Trigger oben.) Trigger: siehe jeweilige Bemerkung; F4/F6 beim nächsten Retrieval-Quality-Scope. Action required.
- [x] Guidance (specs/002): Administratives Metrics-Tool implementieren (Operation-Counts/Durations/Error-Rates, Connection-Health über Zeit) — FR-059 scope-Team-Entscheid: nur Logs+Status-Tools in dieser Iteration. Trigger: erste Produktions-Nutzung von Guidance oder Betrieb-Monitoring-Runde. Action required. Quelle: /speckit-clarify 2026-09-22 (User: "B, but track C for later").

- [ ] Guidance (specs/002) Phase 3 review follow-ups (APPROVE, 0 HIGH/CRIT): F1 completeWorkflow requestId ledger check must move ABOVE status checks (replay-after-completion should return recorded result, not workflow_already_completed) — trigger: next engine-touching scope or Phase 5 wiring. F2 submission_received audit/accept-persist ordering on op failure — same trigger. F3 stale-copy reassignment pattern in submitLocked (partially fixed via targeted mutation) — audit remaining sites next scope. F4 GuidanceErrors thrown past public methods need structured-response shim at MCP dispatch — trigger: Phase 5 tool registration. F6 in-process-only mutex — trigger: any multi-process/CLI scope. F7 requestId replay test still to add — trigger: next engine-touching scope. Action required. Quelle: Phase 3 review 2026-09-22.

- [x] Guidance (specs/002) Phase 5 review follow-ups RESOLVIERT (2026-09-24, Code+Test-Verifikation im Container, 197/197 grün): (a) Capability-Hash-Pinning persistiert jetzt über Restarts (`loadCapabilityPins`/`saveCapabilityPins` in stateDir/capability-hashes.json, Merge-on-save, korrupte Datei → Re-Pin; Regressionstest tests/workflow/capability-pins.test.ts, 5 Tests inkl. Restart-Semantik — L264-Test-Lücke geschlossen); Write ist atomar (tmp+rename). (b) Sanitization-Seam: `redactUnknown()` Deep-Walk redigiert Downstream-`content` UND `protocolMetadata.structuredContent` vor agent-facing use (OperationEngine.ts, Test redaction-seams.test.ts). (c) Redaction deckt Multi-Line-Quotes ab ([\s\S]*?-Value-Alternation, Test „previously missed"). Quelle: Phase 5 review 2026-09-22.

- [x] Guidance (specs/002) Phase 6 review follow-ups (F4/F5, MEDIUM) RESOLVIERT (2026-09-24, Code+Test-Verifikation, 197/197 grün): (F4) Egress-Inhaltsprüfung für restricted-Server — `containsSecretPattern` (SECRET_VALUE_PATTERNS: Private-Key, AWS/GH/OpenAI/Slack-Keys, JWT) blockt skalare Credential-Werte mit `data_egress_denied` (PolicyEngine.ts L44-47, Test redaction-seams.test.ts „egress content-level secret rejection"). (F5) Raw/Normalized-Exposure-Pfade: protocolMetadata.structuredContent läuft vor agent-facing use durch `redactUnknown()` (OperationEngine.ts L133-144, Test „OperationEngine sanitization seam"). Verbleibende Randnotiz (akzeptiert): Secret-Wert-Erkennung bewusst schmal gehalten (False-Positive-Balance); Egress-Inhaltscheck nur für restricted — konsistent mit FR-052. Quelle: Phase 6 review 2026-09-22.

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

- [x] CB-1 MEDIUM Guidance GELÖST (2026-09-24 verifiziert): `remote-session-manager.ts` `resolve()` ruft jetzt `this.touch(effectiveId)` (mit Kommentar „CB-1-Fix", ~L298) in beiden Pfaden (cache + restore-from-disk). TTL-Prüfung/lastAccessAt-Refresh intakt.
- [x] CB-2 MEDIUM Guidance GELÖST (2026-09-24 verifiziert): initSession führt Datei-Writes (configFiles) INNERHALB des Rollback-try (Kommentar „CB-2-Fix", ~L196) — Quota-Slot + Orphan-Verzeichnis werden bei invalid content/path escape/fs error freigegeben.
- [x] CB-3 MEDIUM (Re-Evaluation des akzeptierten LOW aus L284b, GELÖST c416bba): insight + clear-thought POST /mcp early-reject — ohne bekannte Session-Id nur noch echte initialize-Requests erzeugen Server+Transport; garbage/batch/non-initialize → 400/-32600. Zusätzlich 1caa690(a) mitgeschlossen: malformed JSON → 400/-32700 statt 500. Tests: http-transport.test.ts je Server (4 Tests).
- [x] CB-4 MEDIUM Deployment (GELÖST a17be38, Option B): Root-Compose bindet 3000+3002 auf 127.0.0.1 — kein LAN-Zugriff mehr auf die unauthentifizierten Endpunkte. Option A (Auth) bleibt Future-Work für Fernzugriff.
- [x] CB-5 LOW (GELÖST b2aa1bc): stochastic `app.listen(PORT, HOST)` mit `STOCHASTIC_BIND_HOST`-Pattern (loopback-Default wie die anderen Server); Dockerfile setzt ENV 0.0.0.0 für Port-Mapping. npm deprecate laut User-Entscheid NEIN.
- [x] CB-6 LOW (GELÖST 04c6b13): `publish:insight`/`npm:publish:insight` zeigen jetzt auf `servers/server-insight`.
- [x] CB-7 LOW (GELÖST 10d0c3f): `emms-store.db-wal` aus dem Index entfernt (Datei bleibt lokal); `.gitignore`-Eintrag greift ab jetzt.
- [x] CB-8 LOW (GELÖST 66d3d8a): Guidance-POST-Handler rejected Batch/Array-Bodies mit 400/-32600 VOR den Pre-Checks (Defense-in-Depth; SDK verwirft Batches weiterhin vor dem Dispatch).
- [x] CB-9 LOW GELÖST (2026-09-24 verifiziert): kein `[dbg]`-Vorkommen mehr in server-guidance/src (grep 0 Treffer).
- [x] CB-10 LOW (GELÖST 66d3d8a): initSession schreibt meta.json EINMAL inklusive canonicalHash — Crash-Fenster ohne M2-Rebuild-Key geschlossen.
- [x] CB-11 LOW (GELÖST c416bba): `pathFor()` validiert `^[a-f0-9]{64}$` vor `join()`; `read()` resolved den Pfad VOR dem Read-Miss-Catch, damit der Malformed-Error nicht verschluckt wird. Test: traversal/malformed/non-hex-64 → ARTIFACT_REJECTED „Malformed artifact hash".
- [x] CB-12 LOW (GELÖST c416bba): verifiziert UND gefixt — Bare-Operatoren (NOT/AND/OR/NEAR) überlebten die Sanitization und warfen rohe FTS5-Syntaxfehler. Fix: Tokens werden als FTS5-Stringliterale gequotet (nach Sanitization nur noch \w-Zeichen → eindeutig). Test: searchFullText('NOT'|'AND OR NEAR'|'install not dependencies') → [].
- [x] CB-13 LOW (GELÖST 04c6b13): README-Duplikat entfernt; Root-`engines.node` auf `>=20` angehoben (Align mit Servern + README; yarn-Immutable-Check grün).
- [x] L305(a) Restart-Persistenz (GELÖST 7dbfa92): workflowToRemote-Bindings + ClientOpLedger + lastAttempt überleben Restarts via state.json je Session (formatVersion 2, geschrieben bei Registrierung/Reports/Submits, Rebuild beim Boot neben canonicalIndex). v1-Sessions ohne state.json migrieren tolerant. Tests: Restart-zwischen-start_workflow-und-Folgetool + v1-Toleranz (164/164, tsc, yarn build grün). REST: L305(d) awaiting_client-Downstream-Spec (optional für Produktivsetzung) + FR-104.5 (akzeptiert).
- [ ] R-1..R-3 LOW (Post-Commit-Review 7dbfa92, APPROVED 0 HIGH/CRIT — akzeptierte Beobachtungen mit Option): (R-1) registerWorkflowSession persistiert nur bei gecachter Session — impliziter Kontrakt „immer nach resolve"; hart machen (minimal-state auch uncached ODER Throw) beim nächsten Touch der Datei. (R-2) Crash-Fenster ≤1 Event zwischen In-Memory-Mutation und persistSessionState (gleiches Risiko like bestehende meta-Writes — dokumentiert akzeptiert). (R-3) ledgerReports unbeschränkt + Full-Rewrite pro Persist (O(n)) — Cap oder inkrementelles Append bei beobachtetem Wachstum. Trigger: nächste Änderung an remote-session-manager.ts / remote-tools.ts. Accepted observations mit rationale.

## Getrackte Follow-ups (2026-09-26, Lock-Hardening R-011/R-012/R-010 — GELÖST)
Feature-Branch feature/guidance-lock-hardening, Suite 279/279 + tsc grün (Container).
- [x] R-011 MEDIUM (Steal-TOCTOU) GELÖST: neue Klasse WorkspaceOpLock (src/workflow/workspace-lock.ts) — Acquire per link() (atomar create-if-absent, Doppel-Halt konstruktiv ausgeschlossen), Steal per rename() in Quarantäne mit Verify+Restore (Link zurück / Deferral). Multi-Prozess-Race-Test (6 Prozesse auf Dead-Lock → exakt 1 Halter, 5 Contention, keine Residuen) tests/workflow/workspace-lock.race.test.ts.
- [x] R-012a LOW GELÖST: TTL = max(120s, 2× längste konfigurierte Op-Timeout) — ein Live-Holder kann das TTL prinzipiell nicht überschreiten (Invariante statt Annahme); PID-Liveness wird zusätzlich vor TTL geprüft.
- [x] R-012b LOW GELÖST: Nicht-EEXIST-Fehler beim Lock-Create → eigener ErrorCode workspace_lock_unavailable (recoverable), keine Contention-Verschleierung mehr.
- [x] R-012c LOW GELÖST: Testabdeckung ergänzt (Live-Owner-nicht-stehlen, Dead-PID-Steal, Multi-Process-Race); EACCES-Pfad via Code-Differenzierung abgedeckt (implizit).
- [x] R-010 LOW GELÖST: tests/contract/error-codes.test.ts mit exaktem ERROR_CODES-Snapshot (Equality), Duplikat-Check, isErrorCode-Roundtrip.

## Getrackte Follow-ups (2026-09-26, Feature 005 Production Hardening —Tracks GELÖST)
Branch feature/production-hardening. Suite 302/302 + tsc + build grün (Container).
- [x] PLAN-CLEANUP GELÖST (T001): stale Einträge [x], Duplikate identifiziert, Hygiene-Regel in systemPatterns.md.
- [x] L260/FR-059 GELÖST (T003–T005): get_metrics + MetricsRepository (JSONL stateDir/metrics.jsonl, Replay) + Hooks in WorkflowEngine/ClientManager.
- [x] FR-104.5 GELÖST (T006–T007): One-Time-opToken-Binding (client_report_invalid bei Mismatch/Replay), Burn-on-Accept, Persistenz der Pending-Tokens. Residual LOW: HMAC-Variante vertagt (Transport ist bereits key-authentifiziert) — dokumentiert.
- [x] TRACK-Venv-C GELÖST (T008): UV_PROJECT_ENVIRONMENT + Named-Volume-Example (Compose/Dockerfile-Kommentare, README) + E2E relocated venv.
- [x] TRACK-NS GELÖST (T002): specs/003 → FR-301…315/SC-301…305 + Alias-Tabelle (SC-403-grep clean).
- [x] TRACK-Scaffold GELÖST (T009): pyproject.toml-Erkennung erzeugt uv-Op-Set, Tests beide Varianten.
- [ ] R-006-Residual LOW (bleibt getrackt): SIGKILL-Eskalation wird von keinem Test direkt beobachtet (nur SIGTERM-Settle); pid-Liveness-Assertions fehlen. Trigger: nächster Executor-Touch.
- [ ] R-008a LOW (bleibt getrackt): Lock global pro stateDir statt pro workspaceRoot.
- [x] Tracking-NS-Rest ERL.: Konventionsnotiz existiert in systemPatterns.md (FR-Namespace-Konvention, Feature 005). „neue Feature-Specs nummerieren FR-4xx/5xx+ fortlaufend" in systemPatterns.md dokumentieren. Trigger: nächste neue Feature-Spec. Action required (klein).

## Getrackte Follow-ups (2026-09-26, Feature 004 Async Execution — R-006/FR-110 GELÖST)
Branch feature/async-operation-execution (0c01c01 spec, d606ee2 docs, 8a8abc0 impl). Suite 290/290 + tsc + build grün (Container).
- [x] R-006 GELÖST: OperationEngine executes process ops async (spawn, SIGTERM→SIGKILL-Eskalation, AbortSignal); echte Cross-Session-Contention-, Cancel-Kill-, Denial- und SC-004-Secret-E2Es in python-toolchain.e2e.test.ts. Zusätzlich: stderr failing-ops wird jetzt redigiert (bisherige Redaction-Lücke, SC-004-Seam).
- [x] FR-110 Hard-Kill GELÖST: cancel_workflow/Timeout bricht aktive Ausführungen ab (AbortController-Registry je Session; SIGTERM→SIGKILL nach 5s Grace), Lock released, Ergebnis verworfen/auditiert als cancelled. Kooperative Limitation damit obsolet (README/Doku aktualisiert).
- [ ] Residual LOW (dokumentiert): stdout/stderr-Interleaving kann sich sync→async minimal unterscheiden (Tests asserten Ergebnisform, nicht Byte-Reihenfolge); SIGKILL-Semantik nur im Container autoritativ (Windows-Dev ausgenommen).

## Getrackte Follow-ups (2026-09-26, Amendment 003 + Nummern-Kollision)
- [x] Amendment 003 „Final-Review Evidence Gate" IMPLEMENTIERT (2026-09-26, Draft-Q1–Q3-Defaults vom Nutzer gebilligt): scripts/check-final-review.mjs (strict Schema, HEAD-Vergleich ohne git-Binary, computed openHighCritical), Gate-Op in scaffold + examples/default + examples/python + root .guidance (complete.beforeExit, required), 6 Contract-Tests. Suite 274/274 + tsc + build grün. Offen: Amendment-Status Draft → nach Resonanz auf APPROVED setzen; Nummern-Kollision-Follow-up unten bleibt.
- [x] FR-Nummern-Kollision GELÖST (Feature 005 T002): specs/003 → FR-301…315 + Alias-Tabelle; Konvention in systemPatterns.md.
- [x] responses.json complete-Instruktion um Verweis auf Amendment-003-Gate ergänzt (2026-09-26, mit der Implementierung).
- [x] Amendment-Status-Update ERL. (2026-09-26): 003 auf APPROVED gesetzt (Nutzerbilligung; Gates produktiv verifiziert).

## Getrackte Follow-ups (2026-09-26, Finales Gesamt-Review 16c6f1e..ec924f6)
Quelle: frischer Final-Reviewer-Subagent über den vollen Session-Diff inkl. Review-Fix-Commits. Ergebnis: 0 HIGH/CRITICAL; Suite 268/268 + tsc + build im Container reproduziert. Denial-Audit (R-005) und README-Fix (R-009) als sauber geschlossen bestätigt.
- [x] R-011 MEDIUM: Stale-Lock-Steal hat TOCTOU-Fenster im Multi-Prozess-Betrieb — zwei Prozesse können gleichzeitig dasselbe stale Lock lesen, unlinken und je ein eigenes neues Lock erzeugen → beide halten den Lock (FR-109-Invariante nur für ≥2 Prozesse auf gemeinsamem stateDir verletzt; Single-Prozess durch In-Memory-Guard geschützt). Fix-Richtung: atomarer Steal via renameSync oder PID-Content-Verifikation nach Acquire. Trigger: Multi-Prozess-/Multi-Container-Betrieb auf gemeinsamem stateDir oder nächster Lock-Touch. Action required.
- [x] R-012a LOW: TTL-Steal (30 min) prüft keine PID-Liveness — ein Live-Lock mit timeoutSeconds > 1800 könnte mid-run gestohlen werden; Invariante wird nicht per Config-Validierung erzwungen. Trigger: Op-Konfigurationen mit timeoutSeconds > TTL. Action required (TTL-Check um Liveness ergänzen oder Validierung).
- [x] R-012b LOW: EACCES beim Lock-Acquire differenziert nur die Message, nicht den ErrorCode/Recoverable — Permissions-Probleme bleiben code-seitig als Contention klassifiziert. Trigger: nächster Lock-Touch (mit R-011). Action required.
- [x] R-012c LOW: Neue Steal-Logik unvollständig getestet (nur Dead-PID-Pfad); fehlend: Live-Owner-nicht-stehlen, TTL-Pfad, EACCES, Concurrent-Steal. Trigger: nächster Lock-Touch (mit R-011). Action required.
- [x] R-013 INFO: `operation_invocation_denied` fehlt als Audit-EventType in specs/003 data-model.md (nur `operation_invoked` definiert; Implementierung nutzt freiform eventType + Redaction-Hook). Trigger: nächste data-model-Änderung der Spec. Action required (Doku-Nachzug).

## Getrackte Follow-ups (2026-09-26, Post-Commit-Review Feature 003, Reviewer-Subagent)
Quelle: unabhängiger Review über 77fa854+a457329 (268/268 grün). R-004 (HIGH, Stale-Lock-Recovery), R-005 (Denial-Audit), R-008a-c (EACCES-Differenzierung, Release-Guard) SOFORT GEFIXT in Review-Fix-Commit; R-009 (README approval-Claim) korrigiert.
- [x] R-006-Residual GELÖST (Feature 006 T004): Eskalations-Test (SIGTERM-deaf → SIGKILL nach Grace, timed_out <15s) + ps-Marker-Liveness nach Cancel (SC-501).
- [x] R-008a GELÖST (Feature 006 T003): WorkspaceOpLock je workspaceRoot (sha256-16hex-Suffix, workspace-lock.ts workspaceLockFile), SC-503-Parallelitätstest; Residuum: Lock-Key ohne realpathSync (L-4 LOW, getrackt bei nächstem Lock-Touch).
- [x] R-010 LOW: ERROR_CODES-Array hat keinen exakten Equality-Test (nur behaviorale Abdeckung der neuen Codes). Trigger: nächste errors.ts-Änderung. Action required.
- [x] R-011 MEDIUM (Final-Review ec924f6, 2026-09-26): Stale-Lock-Steal-TOCTOU — unlink+recreate in acquireWorkspaceOpLock ist nicht atomar; zwei Prozesse, die gleichzeitig denselben stale Lock stealen, können sich gegenseitig den FRISCH erstellten Lock löschen → beide halten (Mutex verletzt). Auch: Prüf-Lese-PID-alt + Probe-nach-Release kann den Live-Lock eineszwischenzeitlich gestarteten Third-Party-Acquirers stehlen. Precondition: ≥2 Prozesse auf gemeinsamem stateDir (Single-Process-Deployment nicht betroffen — in-process Guard greift). Fix-Richtung: atomares rename-Steal (renameSync lock→lock.<pid>, dann wx neu) oder Lock-Verifikation nach Acquire (Content == eigene PID). Trigger: Multi-Process-/Multi-Container-Betrieb oder nächster Lock-Touch. Action required.
- [x] R-012 LOW (Final-Review ec924f6): (a) TTL-Steal (30 min) ignoriert Liveness — invocable Op mit timeoutSeconds > 1800 verliert seinen Live-Lock mid-run; keine Config-Constraint koppelt timeoutSeconds ≤ TTL (Pilot-Ops ≤ 900 konsistent, Invariante aber unerzwungen). (b) Non-EEXIST-Fehler (EACCES) tragen weiterhin Code operation_in_progress/recoverable — Message differenziert, Code nicht. (c) Testlücken des NEUEN Codes: nur Dead-PID-Steal getestet; TTL-Steal, Live-Owner-NICHT-stealen, EACCES-Pfad, Concurrent-Steal ungetestet. Trigger: wie R-011. Action required.
- [x] R-007 (T013 verfrüht [x] markiert vor Merge/Memory-Bank): mit diesem Commit-Zyklus actualisiert — Merge nach develop + activeContext/progress folgen in diesem Abschluss.

## Getrackte Follow-ups (2026-09-24, Feature 003 Toolchain-Bootstrap)
- [ ] Scaffold-Spracherkennung: `scaffold.ts` erzeugt npm-flavorierte Default-Operationen; bei `pyproject.toml` im Workspace soll künftig eine Python-Variante generiert werden. Trigger: nächste Scaffold-Änderung oder zweite Sprach-Pilotierung. Action required (Enhancement).
- [ ] Named-Volume-Venv-Persistenz (Option C): venvs außerhalb des Workspace-Mounts persistieren, um Host-Inkompatibilität (Linux-Binaries auf Windows-Mount) zu eliminieren. Trigger: beobachtete Host-Venv-Verwirrung oder Multi-Workspace-Betrieb. Action required (Enhancement).
- [x] FR-110-Harter-Kill: `run_operation` bricht kooperativ ab (Result-Discard + Timeout-SIGTERM); ein harter Kill mid-run erfordert async spawn statt spawnSync in OperationEngine. Trigger: nächste OperationEngine-Architektur-Änderung. Action required (dokumentierte Limitation, README-Abschnitt "Verification in other languages").

## Getrackte Follow-ups (2026-09-26, Post-Commit-Review 77fa854+a457329,独立 Review)
- [x] R-004 HIGH — Stale-Workspace-Lock ohne Recovery: Crash des Guidance-Prozesses während run_operation hinterlässt `stateDir/workspace-ops.lock`; `openSync(file,"wx")` schlägt danach dauerhaft fehl → alle Sessions erhalten `operation_in_progress` (fälschlich recoverable:true), manuelles Löschen nötig. Kein PID-/TTL-/Liveness-Check. Repro: Lock-File manuell anlegen → run_operation. WorkflowEngine.ts acquireWorkspaceOpLock (~L497ff). Trigger: nächste Änderung an run_operation/WorkflowEngine oder vor Produktivsetzung. Action required.
- [x] R-005 MEDIUM — SC-002-Audit bei Denial fehlt: agent_invocation_denied/operation_not_configured/operation_in_progress erzeugen kein Audit-Event (nur „kein Executions-Event" wird getestet, tools-run-operation.test.ts L89-96); SC-002 fordert „audit event recorded". Klären: Denial-Audit-Event (z. B. status "denied") oder Spec-Clarification. Trigger: nächste Audit-/run_operation-Änderung. Action required.
- [x] R-006 MEDIUM — E2E-/Task-Abdeckung gegenüber tasks.md T008 über.Markiert: FR-109-Cross-Session-Contention und SC-004 (Secret in pytest-Ausgabe) fehlen in python-toolchain.e2e.test.ts (nur Unit-Level, Node-echo statt pytest); E2E-Test "SC-002" (L121-126) prüft operation_not_configured, nicht invocableByAgent-Denial. Commit-Message "E2E covers SC-001..004" übertrieben. Trigger: nächste E2E-Erweiterung. Action required.
- [x] R-007 MEDIUM — T013-Checkbox [x] ohne Erfüllungsnachweis: Branch nicht nach develop gemerged (HEAD a457329 auf feature-Branch), memory-bank/activeContext.md + progress.md in keinem der beiden Commits aktualisiert. Trigger: Merge-Vorbereitung. Action required.
- [x] R-008 LOW (Inactive-Session-Audit + Lock-Kommentar + Global-Lock-Doku durch 8fa8125 erledigt; R-008a Global-Lock bleibt separat offen) — Inactive-Session-Pfad ohne Audit: runOperation liefert bei session.status!=='active' {status:"failed"} ohne operation_invoked-Event (Audit-Lücke); releaseWorkspaceOpLock-Kommentar zu "wx + gleichem Prozess" ist falsch (wx scheitert bei existierender Datei unabhängig vom Ersteller); Lock ist global pro stateDir, nicht pro workspaceRoot (FR-109-Wording "workspace-level"). Trigger: wie R-004. Accepted observation / bei R-004-Fix miterledigen.
- [x] R-009 LOW/INFO — README-Behauptung "toolchain-sync ... can be made approval-gated via policies.json" unverified: PolicyEngine.requiresApproval deckt nur destructive/credential_sensitive ab, nicht workspace_write; Terminal-Ausfall verhinderte abschließende Verifikation der Aufrufstellen. Trigger: nächste Policy/README-Änderung. Verifizieren und ggf. README korrigieren.

## Getrackte Follow-ups (2026-09-24, Security-/Policy-Verifikation + Rest-Fixes)
- [x] Capability-Pin-Rest-LOW (Test-Lücke + nicht-atomarer Write) BEHOBEN:
  saveCapabilityPins schreibt atomar (tmp+rename, WorkflowEngine.ts),
  Persistenz-Helfer exportiert; neuer Regressionstest
  tests/workflow/capability-pins.test.ts (Roundtrip, Merge, Drift-Overwrite,
  korrupte Datei, kein .tmp-Residu). Suite 197/197 grün, tsc clean.
  Verifikationskontext: kein Node auf Host-PATH — Tests im Container
  (node:22-alpine, Repo-Copy + @rollup/rollup-linux-x64-musl, bekannte
  docker-native-Bindings-Falle, keine Host-Änderung).

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
  offen; Metrics-Tool (L260); ~~FTS-Coverage (L256)~~ GELÖST 2026-09-26;
  ~~Postgres-Parität (L257)~~ GELÖST 2026-09-26 (Live-Smoke-Test offen);
  Smithery-Reste jetzt in VIER Servern (L284c → Cluster 3).
- L253 (Prompt-Kopien-Sync): GESCHLOSSEN ALS OBSOLET (2026-09-26, User-Entscheid — Verteilung über Paket/Smithery, keine Kopien nötig).
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


## Cluster 3 — Smithery (ENTSCHEIDUNG A getroffen, UMGESETZT d566d94, 2026-09-24)
Discovery-Befunde (vor der Entscheidung):
- clear-thought: smithery.yaml = nur `runtime: typescript` (Legacy-Auto-Build,
  kein startCommand); @smithery/sdk längst entfernt; stdio-Entry vorhanden
  (dist/dev.js, bin-invocation.test.ts); Publish historisch via
  scripts/publish-smithery.mjs (API), `deploy`-Script tot (v4-CLI, RB-7).
- insight: dito (yaml nur runtime-Zeile, kein SDK, stdio-Entry vorhanden).
- stochasticthinking: VOLLständige Smithery-Integration (yaml mit Dockerfile-
  Build + stdio startCommand, @smithery/sdk im Code, Release b6e38872 auf
  Smithery; RB-8: stdio/MCPB = install-only) — unangetastet gelassen.
- guidance: nie Smithery-published, sauber.
Umsetzung (Option A):
- [x] clear-thought/insight: smithery.yaml auf echten stdio startCommand
  modernisiert (dist/dev.js; insight mappt optional storagePath →
  EMMS_STORAGE_PATH).
- [x] Tote deploy-Scripts (v4-CLI) in allen drei Servern entfernt;
  clear-thought build:smithery mit der SDK-Entfernung mit entfernt;
  stochastic build:smithery (live) unangetastet. publish-smithery.mjs
  bleibt das Publishing-Werkzeug.
- Nächster Smithery-Publish prüft die neuen yamls in der Praxis
  (Rescan-Score gegen RB-10-Historie vergleichen).

## Entscheidungen (User, 2026-09-24) + neue Pakete
1. Smithery: NICHT „tot lassen" — aktive Pflege (Option A bereits umgesetzt).
2. CB-4 Option A: JA — insight wird remote nutzbar → EMMS_AUTH_TOKEN.
3. 1b Downstream-Spec: JA — Remote-Mode wird um Downstream-MCP-Support erweitert.

- [x] CB-20 MEDIUM (Decision 2, GELÖST 3c4f36f): EMMS_AUTH_TOKEN implementiert
  (timing-safe Bearer an /mcp POST/GET/DELETE; unset = offen, Loopback-Default
  bleibt Basis-Schutz; /health offen; compose-Passthrough + README-Doku).
  Test: 401 ohne/falsch, 200 korrekt, /health 200. 106/106 + tsc + build grün.
  Position geschlossen — insight ist remote-fähig (Token setzen + ggf.
  EMMS_BIND_HOST anpassen).
- [ ] CB-21 MEDIUM (Decision 3): Remote-Mode Downstream-Support — (1) Spec-
  Amendment zu specs/002 (Downstream-Ops statt awaiting_client; Interaktion
  mit FR-104.5/Trust klären), (2) Implementierung im OperationEngine-Stack.
  Aufwand: Spec ½ Tag, Dev separat. Trigger: nächster Remote-Mode-Scope.
- [ ] CB-22 LOW (Decision 1, aktive Pflege): beim nächsten Release Publish
  via publish-smithery.mjs (validiert die neuen stdio-yamls praktisch) +
  Rescan-Score gegen RB-10-Historie (96/100) hier dokumentieren.
  Trigger: nächster Release.

## Review d566d94 (Smithery Option A, 2026-09-24; APPROVED 0 HIGH/CRIT)
- [ ] R-20/R-21 INFO/LOW: YAML-Parser-Validierung lokal nicht möglich —
  praktische Validierung beim nächsten Publish (CB-22). R-21: clear-thought
  exponiert leere configSchema (properties: {}) — Rescan könnte Config-UX-
  Punkte (historisch 25/25) verlieren; ggf. debug-Flag als Option exponieren.
  Evaluation zusammen mit CB-22-Rescan. Trigger: nächster Release/Publish.

## Getrackte Follow-ups (2026-09-27, Feature 007 Remote Downstream Execution — LOW-Reste GELÖST)
Branch feature/remote-downstream-execution. Suite 312/312 + tsc + build grün (Container).
- [x] F3 GELÖST (FR-704): recordConnection nach jedem Downstream-Invoke (Status + lastSuccessfulRequestAt); ConnectionSnapshot erweitert; get_metrics führt Live + Persistiertes zusammen.
- [x] F5 GELÖST (Wortlaut): Spec-005 FR-404 nennt Opak-Token; HMAC entfällt (Transport key-authentifiziert) — optionale Härtung getrackt.
- [x] F7 GELÖST by design: FR-501 (check/burn getrennt + persistierter Report-Token) + SC-502-Test decken das Crash-Fenster; Plan-Eintrag verweist darauf.
- [x] L-2 GELÖST: ps-/Eskalations-Tests polling-basiert (≤5s), Eskalations-Untergrenze 5,5s.
- [x] L-4 GELÖST: Lock-Key via realpathSync (Fallback resolve).
- [x] L-5 GELÖST: workspaceLocks-Cap 64 mit Eviction des ältesten unheld Eintrags.
- [ ] Residual LOW: SIGKILL-Observation erfolgt indirekt (SIGTERM-deaf Child + Zeitfenster) — direkte pid-Assertion im Eskalationstest möglich. Trigger: nächster Executor-Touch.

## Getrackte Follow-ups (2026-09-26, Feature 005 Final-Review — Reste)
Final-Review (fresh subagent 35f63807) über f300cf9..98c4d62: 1 HIGH (F1 metrics.jsonl exponentielles Wachstum durch Replay-Re-Persist) — GEFIXT (replaying-Flag) + Replay-Größen-Regressionstest; F2 SC-401-Integrationstest nachgereicht; F6 catch-Recording; F9 defensive copies. 0 HIGH/CRITICAL offen nach Fixes (304/304 + tsc grün).
- [x] F3 GELÖST (Feature 007, d19fdc4/9434e54): recordConnection nach jedem Downstream-Invoke; ConnectionSnapshot.lastSuccessfulRequestAt + Live-Merge-Fix (L1 im 007-Final-Review).
- [x] F5 GELÖST (Feature 007 Final-Review M1, 9434e54): FR-404-Wortlaut in specs/005 angepasst (Opak-Token; optionale Härtung getrackt).
- [x] F7 GELÖST by design (siehe Feature-006-Abschnitt): FR-501/SC-502 decken das Crash-Fenster.
- [ ] F8 LOW: Scaffold-Detection false positive (pyproject.toml in JS-Monorepo). Akzeptiert spec-konform; Trigger: Feedback aus Praxis.
- [x] F4 MEDIUM: tasks.md-Checkboxen mit diesem Commit gesetzt (Hygiene-Regel).

## Getrackte Follow-ups (2026-09-27, Multi-Repo-Fähigkeit Guidance)
Anlass: Nutzer-Befund am Niyama-Beispiel — guidance ist aktuell single-repo verdrahtet und damit nicht produktionsreif für mehrere Repos.
- [ ] MR-1 MEDIUM: Workspace-Konzept ist singulär — `composeApplication(workspaceRoot, …)` bindet EIN Root (`src/index.ts:15-16`); `assertWorkspaceInside` (`src/mcp-server/register-tools.ts:82-98`) und `spec_kit_feature_outside_workspace` (`SpecKitEngine.ts:116-120`) lehnen alles außerhalb des EINEN Mounts ab; `.guidance/` (config+state) liegt zwingend im Workspace-Root. Kein Repo-Registry-/Workspace-Registry-Konzept. Trigger: specs/008-multi-workspace (spec.md + plan.md + tasks.md angelegt; Q1–Q5 durch Nutzer entschieden 2026-09-27: 1 Container + Registry, workspaces[] in guidance.json, statisch ohne Laufzeit-Tools, State im Repo, per-Workspace-Lock). Action required: Implementierung P1–P7.
- [ ] MR-2 LOW: Deployment-Annahme „1 Container = 1 Repo" (docker-compose.override.yml Mount + GUIDANCE_WORKSPACE_ROOT) ist undokumentiert als Produktionsbeschränkung. Trigger: README/Dokumentation-Update. Action required.

## Nachtrag Feature 007 Final-Review (0 HIGH/CRIT; 2 MEDIUM sofort gefixt)
- [x] M1 GELÖST: F5-Wortlaut tatsächlich angepasst (specs/005 FR-404: Opak-Token, HMAC entfällt/optional getrackt); falscher GELÖST-Claim aus d19fdc4 korrigiert.
- [x] M2 GELÖST: Remote-Metrics-Lücke executeRequired — downstreamEngine.execute wird mit Metrics-Recording gewrappt (Lifecycle/Composite zählt remote jetzt).
- [x] L1 GELÖST: getMetrics-Live-Merge erhält lastSuccessfulRequestAt (überschreibt nicht mehr mit undefined).
- [x] L2 GELÖST (LR-3, 56ecf1d): FR-705 auf Soft-Cap-Semantik präzisiert (held nie evicted, temporäres Überschreiten unter Contention dokumentiert).
- [x] L3 GELÖST (LR-2, 8afc15f): Router als Proxy statt Cast — unbekannte Member funktionsgebunden an Downstream-Engine, Regressionstest vorhanden.
- [ ] L4 INFO: SC-604 Remote-Parallelität nur lokal getestet (SC-503); Remote-Level-Parallelitätstest bei Bedarf. SIGKILL-Observation bleibt getrackt (siehe Feature 004-Rest).

## Getrackte Follow-ups (2026-09-27, Feature 008 LOW-Residue Closure — GELÖST)
> Namespace-Bereinigung (2026-09-27): Die ursprünglichen Label FR-801…804
> kollidierten mit specs/008 (FR-801…808) und wurden zu **LR-1…LR-4**
> umetikettiert (Code-Kommentare, Testnamen, Prompt-Header inklusive).
Branch feature/low-residue-closure. Suite 314/314 + tsc + build grün (Container).
- [x] Interleaving-Parität GELÖST (LR-1, Doku+Test): getrennte Stream-Erfassung dokumentiert (keine Cross-Stream-Ordering-Garantie, POSIX); pinning test (alternierender out/err-Child) in operation-engine-async.test.ts.
- [x] Router-Cast-Robustheit GELÖST (LR-2): Router als Proxy — unbekannte Member werden funktionsgebunden an die Downstream-Engine weitergeleitet; then/catch/finally + Target-Properties ausgenommen; Regressionstest in tools-run-operation.test.ts.
- [x] Lock-Cap-Wortlaut GELÖST (LR-3): specs/007 FR-705 = soft cap 64, held nie evicted, temporäres Überschreiten unter Contention möglich; memory-bank L-2-Rest synchronisiert.
- [x] L253-Ersatz GELÖST (LR-4): prompts/capture-lessons.prompt.md im Paket (files-Eintrag, Master-Header-Verweis), README-Nutzungsabschnitt. L253 bleibt obsolet-closed mit Verweis auf LR-4.

## Getrackte Follow-ups (2026-09-27, P2-Review-Gate specs/008 Phase 1 — GATE BESTANDEN, 0 HIGH/CRIT)
Frischer Reviewer-Subagent über feature/multi-workspace a5f8f26 vs develop (Snapshot-Tabelle + Evidence-Table im Gate-Report, session bb85853a).
- [ ] F1 LOW (akzeptiert): Sub-Pfad-Ablehnung = bewusste Härtung vs. alter Prefix-Check (assertWorkspaceRegistered) — dokumentiert in AC-2-Matrix (workspace-binding.test.ts). Trigger: Nutzer-Feedback aus Praxis.
- [ ] F2 LOW (akzeptiert): Impliziter Default-Eintrag toleriert fehlenden Root (Remote-Sentinel-Boot) — dokumentierte Ausnahme, explizite Entries strikt validiert. Trigger: falls Remote-Boot-Härtung gefordert wird.
- [ ] F3 LOW (akzeptiert): Session-scoped SpecKitEngines werden nicht gecacht (nur Default-Root) — reine Performance, korrekt. Trigger: Messbare Latenz bei Spec-Kit-Ops.
- [ ] F4 LOW (getrackt): release_batch/verify_task Lifecycle-Fix liegt formal außerhalb T1–T7 des Specs 008 — als eigenständiger Fix auf feature/release-batch-tool dokumentiert (b841d38, 0aad3ed); Merge zu develop noch offen. Trigger: Merge der beiden Branches.

## specs/008-multi-workspace — GELÖST (2026-09-27)
- [x] MR-1 GELÖST: Multi-Workspace implementiert (feature/multi-workspace, T1–T17 completed). WorkspaceRegistry (realpath-fail-closed), namensbasierte Session-Bindung, Per-Workspace-Compositions mit State-Isolation, Lock-Scoping verifiziert, Gates je Session-Workspace, Health/Metrics-Observability. Evidence: Commits e9c503c..73e2b42, Suite 326 passed (5 pre-existing), tsc+build clean. P2-Review-Gate: 0 HIGH/CRIT.
- [x] MR-2 GELÖST: README-Kapitel Multi-Workspace + docker-compose-Beispiel (zweiter Mount), .guidance/state-gitignore-Pflicht dokumentiert (FR-807).
- Verbleibend (aus Phase-2-Umsetzung): Observability-PerWorkspace-Detail-Test, Spec-Kit-Chaining-Bridge für Non-Default-Workspaces (dokumentierte Limitierung), Merges feature/multi-workspace + feature/release-batch-tool → develop (offen, Nutzer-Entscheid).

## Spec-009 Delta-Re-Review 2026-09-27 (7f9065f) — getrackte Findings
- [x] N-D1 (MEDIUM): plan.md L18/L46-47 + tasks.md T7 listen policies.json als „kopiert" — Widerspruch zu FR-910/T13 (regeneriert). Trigger: vor Implementierungsstart von P3/T7 fixen (Kopierliste = workflow.json + schemas/). Action required.
- [ ] N-D2 (LOW): FR-902 Pfad-Sicherheitscheck (Referenz außerhalb Ziel-.guidance) nicht als realpath-/resolve-basiert spezifiziert — symlinked Referenzpfad, der lexikalisch außerhalb, real innerhalb Ziel-.guidance liegt, bleibt theoretischer Escape. Trigger: Implementierung von FR-902 (T6) — Check über aufgelöste Pfade; optionaler Spec-Nachtrag. Action required (Implementierungsdetail) bzw. akzeptiert mit realpath-Regel.
- [x] N-D3 (LOW): FR-901 referenziert FR-909 (downstream-servers.json), FR-909 ist im Spec nicht definiert (nur plan/tasks T13). Trigger: nächste Spec-009-Berührung — FR-909-Block nachziehen oder Referenz auf N-1 ändern. Action required (editorial).
- [x] N-D4 (INFO): FR-902 Satzstellung durch R-5-Einschub broken („fail-closed Pfad-Sicherheit (R-5): … `configuration_invalid`"); plan.md L5 Typo „und宵". Trigger: nächste redaktionelle Überarbeitung. Accepted observation.

## Spec-010 Documentation-Drift-Gate — Review-Findings (2026-09-27, Commit 76801a2)
- [ ] S10-F1 (HIGH): FR-954 Pfadmuster ohne Matching-Semantik (prefix/suffix/glob) und Pfadbasis; `src/config.ts`/`src/types/errors.ts` existieren so nicht (real: `servers/server-guidance/src/...`); `README.md` mehrdeutig gg. Out-of-Scope (`servers/server-guidance/README.md`). Trigger: vor Plan-Phase Spec-010 — Muster als Glob/Suffix mit definierter Basis spezifizieren. Action required.
- [ ] S10-F2 (MEDIUM): FR-952 nennt nur operations.json; tatsächlicher Gate-Punkt ist `workflow.json` → `phases.complete.lifecycle.beforeExit` + Transition `required_operations_succeeded`. Vollständige Op-Definition (args/timeout/validation analog final-review-gate) + Position im beforeExit (vor final-review-gate — Doc-Fix-Commits invalidieren dessen headCommit) spezifizieren. Trigger: Plan-Phase Spec-010. Action required.
- [ ] S10-F3 (MEDIUM): Check-1 „README-Eintrag (Tool-Tabelle + Abschnitts-Verweis)" nicht maschinell präzise (UND/ODER?); Baseline: SPEC_KIT_TOOL_NAMES=16 vs. README-Tabelle=12 (verify_task, propose/approve/apply_plan_change fehlen). Q3-Sanierungsliste um README-Tool-Tabelle + ERROR_CODES erweitern. Trigger: erster Gate-Lauf / Plan-Phase. Action required.
- [ ] S10-F4 (MEDIUM): Check-3 Anker existiert nicht — README dokumentiert KEINE ERROR_CODES-Struktur (0 Treffer). Anker-Format definieren (z. B. Codes-Tabelle; Prüfung gegen Tabelle, nicht freien README-Substring — sonst False Positives durch Beispieltexte wie `submission_invalid`). Trigger: Plan-Phase. Action required.
- [ ] S10-F5 (MEDIUM): Check-4 „Merge-Commit im Log" für dieses Repo (Rebase/Squash-Praxis, Direkt-Commits auf develop wie 76801a2 selbst) vermutlich nie/inkorrekt feurend; „offene Pflicht-Checkboxen" maschinell nicht erkennbar. Präzisere Regel nötig (z. B. Merge via `git log --merges <ref> -- specs/<id>/` oder Ref-basiert) + Ausstiegsregel/Override, da Blocking (Q1) False Positives hart bestraft. Trigger: Plan-Phase. Action required.
- [ ] S10-F6 (MEDIUM): Evidence-Vertrag: `specs/002/contracts/upstream-mcp-tools.md` listet Evidence-Felder — Update auf `docsImpact` im Spec nicht erwähnt. Zod-Schema bleibt `z.record(z.unknown())` (keine Tool-Schema-Änderung), SpecKitEngine-Signatur ändert sich; Bestandstests (lifecycle/state-machines) übergeben kein docsImpact — mit F-1-Fix (kein Substring-Match auf `a.ts`) grün, regressionprüfen. Trigger: Implementation T-? Spec-010. Action required.
- [ ] S10-F7 (LOW): FR-953: stdout/stderr-Zuordnung (Referenzmuster: Fehler auf stderr) + Feldgrammatik (keine Newlines in Feldern) festlegen. Trigger: Plan-Phase. Action required.
- [ ] S10-F8 (LOW): AC-Nummerierung inkonsistent („AC-10" vor AC-1); „Decisions (offen — historisch)"-Sektion mit „[Empfehlung]"-Resten streichen. Trigger: redaktionelle Überarbeitung Spec-010. Action required (editorial).
- [ ] S10-F9 (LOW): Fehlende ACs: Verhalten bei fehlender README / fehlendem specs-Verzeichnis / fehlendem .git (fail-closed vs. skip) + Backupdateien (`README.md.bak`) explizit vom Parsing ausnehmen. Trigger: Plan-Phase. Action required.
- [ ] S10-F10 (INFO): adoption-Block (spec 009 FR-906) liegt in gehashter guidance.json — vom Docs-Gate unberührt, keine Wechselwirkung; `docs-drift`-Op ist repo-spezifisch → landet bei künftigen Adopts auf der FR-903-Anpassungsliste (dokumentieren). Accepted observation.
- [ ] S10-F11 (INFO): Muster `specs/` ⇒ jede tasks.md-Pflege erzwingt docsImpact (konservativ, im Fail-safe-Richtung, akzeptiert); `tests/` ist nicht gemustert → kein _tests/setup_-False-Positive-Risiko. Accepted observation.

## Adopt-Modus-Befunde (2026-09-27, empirisch via setup_guidance_generate gegen /examples/default-guidance)
- [x] AD-1 (HIGH): Adopt scheitert an FR-901-Kohärenzprüfung, wenn die Referenz-workflow.json nicht-generische Ops referenziert (z. B. final-review-gate/index-freshness in beforeExit) — genericPreset (ConfigAssistant.ts) regeneriert diese NICHT, Kohärenz-Check wirft configuration_invalid. Betrifft ALLE "proven references" inkl. mitgeliefertem examples/default-guidance und diesem Repo selbst. Repro: setup_guidance_generate {configSource:adopt, referencePath:/examples/default-guidance, transport:http-docker, projectName:x, profile:plain, gates:standard, insight:yes, gitnexus:yes}. Trigger: nächster Spec-009-Kontakt — Fix: non-generische Ops mit Kopie+Adaptions-Hinweis in operations.json übernehmen (statt zu verwerfen) ODER Kohärenz-Check über die Referenz-Ops statt nur genericPreset laufen lassen; Spec FR-901/FR-906 schärfen. Action required.
- [x] AD-2 (MEDIUM): Adopt ist im Container-only-Fall undokumentiert/unreachable: referencePath-Help nennt nur /workspace/.guidance; die im Image vorhandene Referenz (/examples/default-guidance) ist nirgends dokumentiert. Trigger: zusammen mit AD-1 — entweder builtin-Alias (referencePath "builtin:default") oder Doku um Image-Pfad ergänzen. Action required.
- [x] AD-1a (Ergänzung zu AD-1, 2026-09-27): Test-Gap-Verifikation — config-assistant-extensions.test.ts: Happy-Path-Fixture (makeReference, L140-158) schreibt dieselbe JSON in alle 5 Referenzdateien; die Referenz-workflow.json enthält KEIN phases-Objekt, die Kohärenzprüfung läuft leer durch. Der N-2-Test (L197) deckt nur vollständig fehlende Ops ab, nicht "vorhanden in Referenz-operations.json, aber nicht im genericPreset". Adopt war damit gegen kein realistisches Referenz-Setup getestet — Test-Gap ab Start, keine Regression. Trigger: mit AD-1 — Regressionstest mit realistischer Referenz (phases.complete.beforeExit inkl. final-review-gate) ergänzen.

## Spec-010 Findings — Auflösung (2026-09-27, Implementation abgeschlossen)
- [x] S10-F1 (HIGH): gelöst — DOCS_RELEVANT_PATTERNS als exportierte Konstante in SpecKitEngine.ts (definierte Semantik: Substring-Match gegen repo-root-relative, backslash-normalisierte changedFiles); docsImpact-Pflicht mit submission_invalid, Regression in tests/speckit/lifecycle.test.ts (3 Tests). Remaining nuance: README.md-Muster matcht auch servers/*/README.md (konservativ, akzeptiert).
- [x] S10-F2 (MEDIUM): gelöst — docs-drift-Op vollständig in operations.json (node, args ['.'], read_only, timeout 60, required) + workflow.json complete.beforeExit VOR final-review-gate (headCommit-Schutz).
- [x] S10-F3 (MEDIUM): gelöst in T1/T4 — Tool-Parität maschinell (Tool-ID am Tabellen-Zeilenanfang), README saniert (35 tools, Gate Exit 0).
- [x] S10-F4 (MEDIUM): gelöst in T2 — ERROR_CODES-Tabelle (80 Codes) angelegt, Prüfung gegen Tabellenzeilen (Code am Zeilenanfang).
- [x] S10-F5 (MEDIUM): gelöst in T3 — dateibasierte Status-Hygiene statt Merge-Commit-Heuristik + Override-Kommentar <!-- docs-drift: status ok --> als Ausstiegsregel.
- [x] S10-F6 (MEDIUM): gelöst — Contract specs/002/contracts/upstream-mcp-tools.md dokumentiert docsImpact (Pflicht bei Muster-Treffer, submission_invalid sonst, Default none); Bestandstests grün (344/344).
- [x] S10-F7 (LOW): gelöst — Findings zeilenweise auf stderr ("docs drift: ..."), Exit 1; stdout nur Summary (Muster der Referenz-Gates).
- [x] S10-F8 (LOW): redaktionell durch Spec/Plan-Phase der Vorgängersessions behandelt (Akzeptanz im Implementation-Kontext, Gate/Tests definieren die maßgebliche Semantik).
- [x] S10-F9 (LOW): gelöst in T4 — fehlende README fail-closed, leerer specs-Baum still übersprungen, kein .git dateibasiert, .bak ausgenommen.
- [x] S10-F10 (INFO): accepted observation (bleibt, FR-903-Anpassungsliste dokumentiert).
- [x] S10-F11 (INFO): accepted observation (konservativ fail-safe, wie im Spec entschieden).

## Spec-010 Final-Review (Completion, 2026-09-27)
- [x] S10-FR1 (MEDIUM, gefixt Commit 3191d05): Substring-Matching → Segment-Grenz-Matching (matchesDocsPattern); Regression: near-miss-Test (docs/myspecs/a.md, src/config.tsx → none).
- [x] S10-FR2 (MEDIUM, gefixt Commit 3191d05): AC-5-Lücken geschlossen — bare 'none' rejected, 'updated:' auf echtem Treffer getestet (4 docsImpact-Tests, 53/53 grün).
- [x] S10-FR3 (LOW, accepted + dokumentiert): nicht-validiertes docsImpact wird bei Nicht-Treffer unverändert persistiert; Case-Sensitivität + Segment-Semantik in specs/002-Contract dokumentiert.
- [x] S10-FR4 (INFO, verified contained): partielle Loop-Mutation bei Multi-Evidence-Throw — withState persistiert nur bei Erfolg, keine Korruption.
- [ ] lint/test-Ops non-blocking rot (pre-existing: CRLF-Format server-clear-thought; Windows-node_modules im Container) — Vollsuite manuell im Container grün (344/344). Kein Handlungsbedarf für 010; Trigger: ops.json-Datei-Tightening (test required:true nach in-container install).

## Spec-010 Final-Review Runde 2 (Completion-Gate, 2026-09-27) — 2 HIGH gefunden und gefixt
- [x] FR2-H1 (HIGH, gefixt): Check 1 Tool-Parität war ein No-op (allTools nur in Summary-Zeile) — beide Richtungen implementiert (Forward: README-Toolzeile je registriertem Tool; Reverse: README-Toolzeile ohne server.tool-Registrierung in src, gescoped auf "## Tool reference"); Regression: tests/scripts/check-docs-drift.test.ts. Gate fand dadurch echten Rest-Drift (4 fehlende README-Zeilen) → saniert.
- [x] FR2-H2 (HIGH, gefixt): T10-Evidence behauptete Tests für AC-1..4/N-AC — gab keine. Neu: tests/scripts/check-docs-drift.test.ts (12 Tests, AC-1 beidseitig, AC-2 Kapitel-Scoping, AC-3 Tabellenzeilen-Freitext-Ausschluss + Ziffern-Codes, AC-4 Draft/Override, N-AC-1/2/4; N-AC-3 = Skript ist rein dateibasiert, nie git).
- [x] FR2-M1..M3 (MEDIUM, gefixt): ERROR_CODES-Check auf Tabellenzeilenanfang statt Freitext; Override-Kommentar in spec.md statt tasks.md (Spec-Konformität); Frage-IDs auf Assistenten-Kapitel gescoped. Zusätzlich LOWs: done>0-Guard entfernt (Spec-Konform), .bak-Verzeichnisse ausgenommen, Ziffern in ERROR_CODES-Regex, leeres "updated:"-Suffix abgewiesen... (Letzteres: engine docsImpact-Validierung unverändert lässt "updated:" mit leerem Rest zu — siehe FR2-L1.)
- [x] FR2-L1 (LOW, accepted): docsImpact "updated:" mit leerem Nachlaut besteht die Prefix-Prüfung. Trigger: nächste SpecKitEngine-Berührung — Restlängen-Prüfung ergänzen. Accepted observation (Doku-Wert gleich Null, kein Funktionsrisiko).
- [ ] FR2-L2 (LOW, accepted): README-Toolzeilen-Matching case-sensitiv und an exakte Tabellen-Syntax gebunden. Trigger: falls README-Format ändert. Accepted observation.

## Rest-Findings-Batch Review (session-4e4471f2, 2026-09-27)
- [x] RV-M1 (MEDIUM): Referenz-Ops werden beim Adopt-Merge jetzt minimal shape-validiert (type: string nicht-leer, sonst configuration_invalid fail-closed).
- [x] RV-L1 (LOW): Leading-Space im Adoption-Marker behoben (separator nur bei vorhandener Beschreibung).
- [x] RV-I1 (INFO, accepted): Near-miss-Prefixe ("Updated: x", "none:updated:x") verhalten sich dokumentiert lenient — keine Änderung.

## Rest-Findings-Batch Final-Review Abschluss (session-4e4471f2, 2026-09-27)
- Final-Review (Sub-Agent 692cabd0): 0 HIGH/CRITICAL. F-4 (MEDIUM, doc-only): AD-1/AD-2/AD-1a/FR2-L1/N-D1/N-D3/N-D4-Einträge oben auf [x] gesetzt (Behandlung + Evidence in den Rest-Findings-Batch-Abschnitten). F-3 (LOW): Regressionstest für RV-M1-Shape-Validation ergänzt (reference op ohne type → configuration_invalid), 12/12 grün.
- Nächster Trigger: AD-2-Doku erwähnt builtin-Referenz — bei Nutzung von examples/default-guidance als referencePath im Container ist der Pfad /workspace/servers/server-guidance/examples/default-guidance.

## 2026-09-27: specs/011 Final-Review — akzeptierte LOW-Observations (session-f66c3f62)
- FR3 (LOW, accepted): Builtin-Template-Op store-completion-insight bekommt [adopted]-Marker + Review-Hinweis, obwohl Template 0 repo-spezifische args hat (verifiziert). Trigger: wenn der Adopt-Marker-Text angefasst wird (neue specs am ConfigAssistant) → builtin-Fall ohne Marker/Review-Hinweis ausgeben. Aktion required bei diesem Trigger.
- FR5 (LOW, accepted): Drei near-duplicate builtin-Bedingungen (generateFiles isBuiltin, Auflöse-if, validateAdoptReference-"builtin"-Check) können driften; referencePath===""-Arm am Call-Site tot (defensiv). Trigger: nächste Änderung an resolveBuiltinReferencePath/adopt-Eingangs-Gate → auf eine zentrale isBuiltinReferencePath()-Konstante konsolidieren. Aktion required bei diesem Trigger.
- FR7 (LOW, accepted): Testlücken — env-Override GUIDANCE_BUILTIN_TEMPLATE_DIR nicht e2e durch generateFiles getestet (nur Resolver-Unit-Test); kein Byte-Diff-Golden-Test für mounted-adopt. Trigger: nächste Testrunde an config-assistant-extensions.test.ts → beide Tests nachziehen. Aktion required bei diesem Trigger.
- Final-Review-Status: Gate OK (HEAD db494f2, 8 Findings, 0 open HIGH/CRITICAL). Abweichung dokumentiert: der Pflicht-Final-Review-Sub-Agent wurde vom Nutzer abgebrochen; Final-Pass als evidenzgestützte Autoren-Selbstprüfung ausgeführt (Implementation-Review blieb unabhängig via Sub-Agent cbebdfc5).

## 2026-09-28: specs/011 Re-Review (frischer Sub-Agent f8441944, Nutzeranordnung nach abgebrochenem ersten Final-Review)
- Re-Review-Ergebnis: 0 HIGH/CRITICAL. Fokus-Tests 21/21 (Sub-Agent ausgeführt), tsc exit 0. Bestätigt: FR-971..974 ✓, mounted-AC-4 unverändert, drei builtin-Bedingungen konsistent.
- F-01 (MEDIUM, gefixt): schemasDir in generateFiles hardcodete PKG_ROOT/examples/default-guidance und ignorierte GUIDANCE_BUILTIN_TEMPLATE_DIR → env-Override galt nicht für eingebettete Schemas (4ter inkonsistenter builtin-Pfad). Fix: schemasDir = join(resolveBuiltinReferencePath(), "schemas") + neuer Test (env-Override-Schemas werden eingebettet). Suite 370/370, tsc/build grün.
- F-02 (LOW, accepted): referencePath-Antwort wird nicht getrimmt (env wird getrimmt) → whitespace-Antwort fail-closed mit Roher Pfad; korrektes Ergebnis, inkonsistenter Mechanismus. Trigger: nächste Änderung an der answers-Koersion → auch referencePath trimmen + Test.
- F-03 (LOW, accepted): whitespace-env-Fall ungetestet. Trigger: nächste Testrunde → Test ergänzen.
- F-04 (LOW, accepted): adoption-Schema-Slot permissiv ({type:"object"}, keine additionalProperties:false). Bewusst: Audit-Feld, kein downstream Consumer; Konsistenz mit strengem project-Schema fehlt. Trigger: falls je ein Consumer adoption liest → Schema verschärfen.
- F-05 (INFO): Duplikat-builtin-Bedingung ( deckt FR5 ab, bleibt getriggert). F-06 (INFO): source bleibt "builtin" auch bei Override — korrekt, audit-relevant dokumentiert. F-07: README akkurat.
- Gate neu verankert: final-review.json headCommit auf neuen HEAD, 0 open HIGH/CRITICAL.

## 2026-09-28: specs/012 Final-Review (Sub-Agent 7d3ca207) — Findings-Bilanz
- Final-Review (frischer Sub-Agent, HEAD a55d381+Follow-ups): 0 HIGH/CRITICAL. 2 MEDIUM: F-1 (FR-981-Kommentar behauptete Mirror-Verhalten, das nur für responses.json gilt — Kommentar korrigiert, 011-workflow-Verhalten bewusst unberührt), F-2 (Golden-Tests fehlten → Determinismus-Tests fresh+mounted ergänzt, Timestamps gestrippt). LOWs: F-3 (Spec-ohne-tasks-Skip jetzt in spec.md dokumentiert), F-4 (Duplikat-Write entfernt).
- Getrackte Follow-ups (Trigger: nächste Testrunde an config-assistant-extensions): wisdom-e2e über composeApplication-Boot mit Marker; indented-checkbox-Test für check-spec-drift; env-Override-e2e (011-Erbe).
- FR-982 Breaking (Alt-Referenzen ohne responses.json) final bestätigt akzeptiert + dokumentiert.

## 2026-09-28: specs/013 Final-Review (Sub-Agent fd7b22e1) — Findings-Bilanz [L978-981]

## Getrackte Follow-ups (2026-09-28, FR-035-Container-Route Review-Runde 1, session-1afb793f)

- [CR-1] MEDIUM | FR-035-Timeout-Policy fehlt in der Fresh-Baseline: `buildResponses` (ConfigAssistant.ts) enthält historisch keinen FR-035-Satz — nur Wisdom-Baseline + abgeleitete Workspace-Configs tragen die amendierte Reihenfolge. Review F2: Drift-Guard AC-1 ist deshalb kein FR-611-Nachweis. | Trigger: nächstes Scope, das `buildResponses` oder `responses.json` der Fresh-Baseline berührt — FR-035-Satz (amendierte Fassung, 7 Phasen) in buildResponses aufnehmen und Template neu generieren (Drift-Guard erzwingt Byte-Gleichheit). | action required
- [CR-2] MEDIUM | Engine-Gating-Test-Debt: der FR-613-Fallback-Gate in `WorkflowEngine.buildInvokerClosure` (nur bei timedOut + riskClass read_only + konfigurierter Route, genau 1 Versuch, Metric) ist nur durch statische Einfachheit + ClientManager-Level-Tests abgesichert, nicht durch einen Engine-Level-Vertragstest (4 Fälle laut Review F3). | Trigger: nächste Berührung von `buildInvokerClosure` — Achtung: GDS4-Agent arbeitet parallel an WorkflowEngine.ts (uncommittet im Haupt-Checkout); Engine-Test erst nach GDS4-Merge auf frischer Basis ergänzen. | action required

## Getrackte Follow-ups (2026-09-28, Diagnose-Sitzung guidance→clearthought)

- [GDS-1] MEDIUM — GELÖST (2026-09-28, feature/gds1-status-probe, merged develop): getDownstreamStatus probezt enabled http-Transport-Servers on-demand (Handshake min(5s,startupTimeoutSeconds)) und meldet realen Zustand inkl. error-Feld; non-http wird nicht probezt; Regression: downstream-status.test.ts (3 Tests). Live verifiziert: alle 3 Server ready mit lastSuccessfulRequestAt. Nebeneffekt dokumentiert: Probe kostet bis zu 5s pro unerreichbarem Server.
- [GDS-2] LOW | Stale Session-IDs: `run_operation`/`get_workflow_state` mit Workflow-Session-IDs aus früheren Container-Läufen antworten `session_not_found` — ein beabsichtigter "forced first use" eines Downstream-Servers schlägt still fehl (kein ensureReady, kein Log-Eintrag), was Fehldiagnosen begünstigt (heute praktisch erlebt). | Trigger: nächstes Touch von `RemoteSessionManager.resolve`/Session-Restore — bei `session_not_found` Hinweis auf Neuanlage via start_workflow in die Fehlermeldung aufnehmen; ggf. verwaiste session-Dateien in `.guidance/state/sessions` dok-basiert kennzeichnen. | action required
- [GDS-3] LOW | Widersprüchlicher Alt-Befund: Eintrag 2026-09-27 in activeContext.md ("Clear-Thought-Re-Routing", L697) behauptet "clearthought-Status ready" — auf dem HTTP-Transport nach heutigem Nachweis nicht möglich (GDS-1). Beobachtung vermutlich In-Process oder altes Build; technischer Kern (Route funktioniert, 177 ms) bleibt gültig. | Trigger: nächste Wartung von activeContext.md — Alt-Eintrag mit Verweis auf GDS-1 korrigieren. | accepted with rationale (Korrektur über GDS-1-Dokumentation abgedeckt)
- [GDS-4] HIGH | `run_operation` verwirft den Tool-Content von Downstream-Calls: `WorkflowEngine.exposeOpResult` (WorkflowEngine.ts L1602-1641) berechnet `policyEngine.applyExposure` korrekt — für `returnToAgent: "normalized"/"raw"` bleibt `content` erhalten (PolicyEngine.ts L115-116, default-Zweig) — aber der Rückgabewert ist hart auf `{ id, status, summary }` beschränkt und übernimmt nur `exposed.summary`; `exposed.content`/`exposed.data` werden verworfen. Folge: Der orchestrierte `reasoning-pass` liefert dem Agenten keine `sequential_thinking`-Antwort — die Workflow-Anweisungen ("reference its conclusions in the submission") sind über diese Route unerfüllbar. Live verifiziert 2026-09-28: Response = `{id, status:"succeeded", summary}` ohne Content, obwohl OperationEngine.content befüllt war (OperationEngine.ts L275-285). Fix: Rückgabetyp von exposeOpResult um `content`/`data` (exposure-gefiltert) erweitern; Tests für alle returnToAgent-Modi ergänzen. | Trigger: nächstes Scope, das `exposeOpResult`, `run_operation` oder das Orchestrierungs-Result-Schema berührt — oder sobald reasoning-pass in einem echten Workflow-Lauf als Grundlage für eine Submission dienen soll. | action required
- Final-Review (frischer Sub-Agent, HEAD deaa1de): 0 HIGH/CRITICAL. F-1 (LOW, gefixt): Unknown-Token-Throw + Strict-Leftover jetzt gekoppelt — wisdom fail-closed, lenient fallback behält 012-Pass-through (Regressionstest). F-2 (LOW, gefixt): GITNEXUS_URL wird in der Wisdom genutzt (complete-Phase, gitnexus-konditional). F-3 (LOW, gefixt): Mismatched-Close-Tag-Regressionstest ergänzt. F-4 (INFO, tracked): Coverage-Logik dupliziert (generateFiles/validateAdoptReference) — Trigger: nächste Änderung an Responses-File-Selection/Coverage → gemeinsamen Helper extrahieren. Weitere Getrackte: PROJECT_NAME-Render-Assert; AC-6 Self-Containment-Scan auf responses-wisdom.json ausweiten.
- Implementation-Review (cb51d48e): F-1 MEDIUM (Non-kanonische {{…}}-Reste) → strictLeftovers-Lösung; F-2 Backreference; F-4 Tokens shipped. Alle in der Bilanz oben referenziert.

## Getrackte Follow-ups (2026-09-28, requestId-Reuse-Stall Niyama session-46a43aeb)

**GELÖST 2026-09-28 (develop fbd5bdc, session-dcd3ddc5):** Replay-Marker (replayed/duplicateOf/warning), Payload-Hash + Policy policies.submission.requestIdReuse (warn Default, reject-mismatch → requestId_reuse_payload_mismatch), Metric requestIdReplays in get_metrics, 8 Contract-Tests + Error-Code-Snapshot, Doku (README + specs/002/amendments/006). Ursprünglicher Plan-Eintrag (unterhalb) damit umgesetzt; Details + Grenzen in activeContext.md und Amendment 006.

- [RID-1] MEDIUM | `WorkflowEngine.submitLocked` (src/workflow/WorkflowEngine.ts ~L1617) und `completeWorkflowLocked` (~L1925) replays bei bereits registrierter requestId still das gecachte `SubmitResult` — kein `replayed`-Marker, kein Log, kein Metric. Ein Agent, der dieselbe requestId wiederverwendet, sieht beliebig oft `accepted: true` ohne Phase-Advance (live: 3× accepted in review_and_adjust_plan). | Trigger: nächstes Scope, das `WorkflowEngine.submit*`/`completeWorkflow*` oder `register-tools.ts`/`remote-tools.ts` Submit-Pfade berührt — Hardening-Plan unten umsetzen. | action required

### Server-seitiges Hardening (Plan, umzusetzen bei RID-1-Trigger)

1. **Replay-Marker (additiv, kein Breaking Change):** in `submitLocked`/`completeWorkflowLocked` beim Replay-Hit das Cached-Result klonen und mit `{ replayed: true, duplicateOf: requestId, warning: "requestId already used — phase unchanged; issue a fresh requestId per phase submission" }` anreichern. Additive Felder fließen unverändert durch register-tools.ts/remote-tools.ts (passthrough).
2. **Payload-Hash-Check (optional, strict):** Hash über `JSON.stringify(payload)` beim ersten Submit mit speichern; bei Replay mit abweichendem Hash stattdessen `GuidanceError("requestId_reuse_payload_mismatch")` (recoverable) — gleicher Payload = bewusster Idempotency-Retry, Marker genügt. Umschaltbar via `policies.json` (`submission.requestIdReuse: "warn" | "reject-mismatch"`), Default `warn`.
3. **Observability:** Operation-Counter `guidance_requestid_replay_total` (nach Marker-Feld/Warning-Ausgabe zählen); Echo in `get_metrics`.
4. **Template-Regel:** Konfig-Assistant-Templates (`examples/default-guidance/responses-wisdom.json` + Fallback `responses.json`) bekommen in jeder Submission-Phase-Instruktion einen Satz „Submission idempotency (FR-036): never reuse a requestId across submissions — each phase advance requires a fresh requestId; on `accepted` with unchanged phase, check `get_workflow_state` requestIds instead of retrying." (FR-Nummer beim Spec-Writer vergeben, Vorschlag FR-036/075 — nächsten freien Slot nutzen.)
5. **Tests:** (a) Replay liefert Marker + gleiche Phase; (b) neue requestId mit gleichem Payload löst Advance aus; (c) reject-mismatch-Pfad; (d) Amendment-002-Race (Successor-Aktivierung via Replay) bleibt grün — Cached-Result-Klon darf Referenz-Gleichheit nicht brechen; (e) Template-Regression: wisdom-Render fail-closed mit neuem Satz.
6. **Doku:** README Tool-Reference-Zeile zu submit_* um Replay-Verhalten ergänzen; SDD guidance-mcp-specification.md §19 (Phase Submission Tools) um FR-Eintrag erweitern.

- [RID-2] MEDIUM (Review fbd5bdc, 2026-09-28) | `completeWorkflowLocked` (WorkflowEngine.ts ~L2059): First-Seen-Hash wird VOR Phasen-/Status-/Schema-/Hook-Prüfung gespeichert und bei Retry NIE überschrieben (`requestPayloadHashes?.[requestId] === undefined`-Guard). Fehlgeschlagener Completion-Versuch 1 (z. B. invalid_active_phase / required_hook_failed) vergiftet den Hash: Versuch 2 mit korrigiertem Payload wird erfolgreich registriert, aber der gespeicherte Hash bleibt der von Versuch 1 → spätere Replays des erfolgreich akzeptierten Payloads fälschlich `payloadMismatch:true`; unter `reject-mismatch` wird der legale Retry-Replay fälschlich mit `requestId_reuse_payload_mismatch` rejected. Widerspricht auch dem Test-Kommentar "failed completions intentionally do NOT register the requestId (retry after fixing must stay legal)" — der Hash-Store verletzt genau diese Intention. Fix: Hash analog `submitLocked` an den Success-Registrierungsstellen der `successResult` speichern (oder Guard entfernen und bei jedem Nicht-Replay überschreiben) + Regressionstest (fehlgeschlagener Completion → korrigierter Completion mit gleicher requestId → Replay ohne payloadMismatch). | Trigger: nächstes Scope, das `completeWorkflowLocked`/`replaySubmitResult`/`requestPayloadHashes` berührt. | action required
- [RID-3] LOW (Review fbd5bdc) | `replaySubmitResult` (WorkflowEngine.ts ~L1700): `metrics.recordRequestIdReplay` läuft erst NACH dem Reject-Throw — unter `reject-mismatch` sind abgelehnte Mismatch-Replays unsichtbar und `payloadMismatches` ist strukturell immer 0. Fix: Metric vor dem Policy-Throw recorden (payloadMismatch=true) oder Verhalten dokumentieren. | Trigger: mit RID-2. | action required
- [RID-4] LOW (Review fbd5bdc) | Replays werden nicht auditiert (kein audit.append in `replaySubmitResult`) — der persistente Audit-Trail kann Replay-Traffic nicht vom Fehlen von Submissionen unterscheiden; der Metric-Counter ist in-memory und überlebt keinen Neustart (inkonsistent mit dem persistierten metrics.jsonl-Pfad). Fix: Audit-Event `request_replayed` (mit payloadMismatch) in `replaySubmitResult`. | Trigger: mit RID-2. | action required
- [RID-5] INFO (Review fbd5bdc) | `stablePayloadHash`: JSON.stringify verwirft Properties mit Wert `undefined` — `{a:undefined}` kollidiert mit `{}`. Über den MCP-Wire (JSON-parsed) nicht erreichbar, nur für In-Process-Aufrufer relevant; kein Handlungsbedarf, bei künftiger In-Process-Nutzung der Engine beachten. | Trigger: falls WorkflowTools/Engine intern mit undefined-haltigen Payload-Objekten aufgerufen werden. | accepted with rationale
- [RID-6] INFO (Review fbd5bdc) | Known Deviation bestätigt: kein Engine-Level-Completion-Replay-Test (Harness kann `repository-analysis required:true` nicht erfüllen). Der Complete-Replay-Pfad teilt `replaySubmitResult` (abgedeckt); Cache-Sites via Successor-Race-Suite. Klassifiziert als akzeptiert; RID-2-Regressionstest sollte den Completion-Pfad dennoch direkt abdecken (Fixture mit deaktiviertem required-Op erwägen). | Trigger: mit RID-2. | accepted with rationale

## 2026-09-28 (nachmittag): GDS-4 GELÖST — run_operation leitet vollständige Tool-Antworten weiter
- [GDS-4] HIGH (2026-09-28, vormittags getrackt; Original-Eintrag durch fremden Commit 025b682 aus dem Working Tree verloren gegangen — Parallel-Work-Vorfall, siehe Notiz unten) — GELÖST auf `feature/gds4-expose-op-content`:
  - Fix: `WorkflowEngine.exposeOpResult` gibt jetzt das exposure-gefilterte Vollresult zurück (`content`, `data`, `errors`, `warnings`); neuer exportierter Typ `ExposedOpResult`; `runOperation`/`StartResult`/`SubmitResult` auf breiteren Typ umgestellt. Redaction bleibt upstream (OperationEngine), Exposure-Semantik je `returnToAgent` unverändert.
  - Config: `.guidance/operations.json` — alle 10 Operationen auf `returnToAgent: "raw"` (User-Anforderung: komplette Tool-Antwort für alle Tools).
  - Regression-Coverage: +2 Contract-Tests (raw forwarded content/data/warnings vollständig; `summary_and_errors` stripped weiter — SC-004 erhalten); profile-config-Test auf objectContaining umgestellt. Contract-Suite 206/206 (2 Bestätigungsläufe), `tsc --noEmit` grün.
  - Live verifiziert: Guidance-Container neu gebaut/deployed; `run_operation reasoning-pass` über :3003 liefert die vollständige `sequential_thinking`-Antwort (Thought + sessionContext) im `content`-Feld.
- Parallel-Work-Vorfall (2026-09-28): Commit 025b682 (13:55, Niyama-Session auf develop) hat uncommittete memory-bank-Änderungen dieses Agenten (GDS-1..3-Nachtrag + aktiveContext/progress/lessons) eingesammelt; der später geschriebene GDS-4-Eintrag ging dabei verloren. Befund dokumentiert; deckt sich mit der Completion-Gate-Lesson (2026-09-26, session-3b7f96a5): parallele Agenten auf demselben Checkout brauchen Worktree-Isolation oder strikte Datei-Zuständigkeit. | Trigger: nächstes Parallel-Work-Scope — Datei-Zuständigkeit (memory-bank) pro Agent vereinbaren oder memory-bank-Edits sofort committen. | accepted with rationale (Vorfall dokumentiert; technische Folge GDS-4 ist durch den Neueintrag behoben)

## RF-2 — GELÖST (2026-09-28, docs/rf2-fr981-merge)

- [RF-2] LOW — GELÖST: FR-981-Semantikänderung (replace → merge für den
  `instructions.global`-Slot, GDS-5) ist dokumentiert: Amendment-Notiz in
  `specs/012-adopt-response-wisdom/spec.md` (FR-981) mit Verweis auf die
  implementierenden Stellen (`ConfigAssistant.generateFiles`,
  `renderAdoptedResponses`) und die kodierenden Contract-Tests. SDD v2
  beschreibt die Replace-Semantik nicht (geprüft, 0 Treffer) — kein
  Update nötig. Regression: Contract-Tests
  `config-assistant-extensions.test.ts` kodieren die Merge-Erwartung;
  docs-drift-Grün im Workflow-Abschluss.

## Getrackte Follow-ups (2026-09-29, Config-Assistant Multi-Workspace-Lücke)
Anlass: Nutzer wollte in frischem Repo („zed") einen Workflow starten und erhielt `workspace_not_registered` ("D:\\repos\\zed"). Ursache: Registry ist fail-closed (`src/workspace-registry.ts`); zweites Repo erfordert manuelles Editieren von `guidance.json` (workspaces[]) + Container-Mount.
- [x] WA-1 LOW — GELÖST (2026-09-29, feature/wizard-workspaces 187f93c): Config-Assistent (setup_guidance_start/answer/generate, `src/setup/ConfigAssistant.ts`) interviewt nicht für zusätzliche Workspaces — `generateFiles` emittiert keinen `workspaces[]`-Block (0 Treffer in `src/setup/`). Das Plain-Scaffold (`src/scaffold.ts` L139-149) schreibt nur den einzelnen Launch-Root als `workspaces: [{name:"default", …}]`. Damit bleibt das Hinzufügen eines weiteren Repos (specs/008-Registry) reine Manuell-Arbeit, obwohl die anfängliche Registrierung (MR-1) assistent-getrieben erfolgen sollte. Trigger: nächste specs/008-Betrachtung oder Assistent-Feature-Scope. Action required: Wizard-Frage „zusätzliche Workspaces?“ + Emission weiterer `workspaces[]`-Einträge in `generateFiles` inkl. Contract-Tests (Namens-Pattern `^[a-z][a-z0-9-]{0,63}$`, absolute existierende Roots, Duplikat-Roots).

## Getrackte Follow-ups (2026-09-29, WA-1 Wizard-Workspaces Review — session-756c112d)

- [WW-1] LOW | Generation-Zeit-Dedupe in parseExtraWorkspaces deckt Duplikate nur innerhalb der Extras ab — Dublette Extra-Root vs. workspaceRoot (Default-Eintrag) sowie realpath-/Case-Kollaps werden erst fail-closed bei loadConfig erkannt (WorkspaceRegistry.build). Korrekt, aber spät. | Trigger: nächste Änderung an parseExtraWorkspaces/generateFiles-Workspaces-Emission. | Action required: seenRoots mit resolve(workspaceRoot) seeden ODER Help-Text um Load-Zeit-Dedupe erweitern.
- [WW-2] LOW | `workspaceRoot` wird bei Generierung nur getrimmt, nicht auf Absolutheit geprüft — Extras bekommen `isAbsolute`-Fail-closed, der Default-Root erst bei loadConfig (Registry isAbsolute). Inkonsistentes Fail-fast; relativer Pfad ist sofort fixbar. | Trigger: nächste Änderung an generateFiles-Workspaces-Emission. | Action required: `isAbsolute(workspaceRoot)`-Check analog zu Extras nachziehen + Test.
- [WW-3] LOW | Testabdeckung: kein Test für `name=path=mit=gleichheitszeichen` (indexOf-Trennung korrekt, ungetestet); kein Test für whitespace-only-Antworten (" ; " ≡ weggelassen — Verhalten korrekt, ungetestet). | Trigger: nächste Berührung der WA-1-Tests. | Action required: beide Boundary-Cases in tests/setup/config-assistant.test.ts ergänzen.

## Getrackte Follow-ups (2026-09-29, Wildcard Container-Route Review — session-45abc996)

- [WC-1] MEDIUM — **GELÖST 2026-09-29 (feature/wc1-wildcard-trustlevel-coupling, Guidance-Session session-22e9b598)** | Wildcard `["*"]` + Tool NICHT konfiguriert in operations.json → `opForEgress` undefined → `riskClass` undefined → Approval-Gate kann nie feuern. Fix: `validateDownstreamServers` (config.ts) lehnt Wildcard-Allowlists für Server mit effektiver trustLevel != "trusted" ab (`configuration_invalid`, Server-ID in Meldung); `toTrustLevel` nach `src/trust-level.ts` extrahiert (Validator+Runtime teilen eine Semantik; absent/unknown → "trusted"). Regressionstests in tests/contract/config-loader.test.ts (4 Fälle); Suite 449/449 grün; README aktualisiert.
- [WC-1-B] LOW (deferred) | Restlücke: ein TRUSTED Wildcard-Server kann weiterhin destructive Tools ohne operations.json-Eintrag hosten (Approval-Gate feuert dafür nicht). | Trigger: destructive Tools auf gitnexus/clearthought/insight hinzukommen, die keine Operations sind → dann Runtime-Hardening in buildInvokerClosure (unconfigured Tool via Wildcard → fail-closed/Approval-Pflicht) oder Whitelist-Pflicht für destructive umsetzen. | action required

- [WC-4] LOW — **GELÖST 2026-09-29 (feature/wc4-shipped-config-contract, Guidance-Session session-e782866b)** | Kein Test lud die ausgelieferten Config-Dateien gegen loadConfig. Fix: tests/contract/shipped-configs.test.ts — lädt alle 5 Config-Sets (Repo .guidance + examples/{default,python,csharp,rust}-guidance) direkt; einzige Substitution: workspaces[]-Key im Tmp-Copy (Container-Roots existieren host-seitig nicht; impliziter Default-Workspace toleriert das per Design). Assertions: vollständiger loadConfig-Lauf, Egress-Konsistenz (transport.http + containerRoute Hosts ⊆ httpHostAllowlist, alle Server inkl. disabled), Negative-Control (unallowlisted Host → Fail). 7 Tests, Suite 458/458 grün.

## Getrackte Follow-ups (2026-09-29, Multi-Repo-Config-Truth Audit — session f955a76e, 4 HIGH)

- [MC-1] HIGH | Keine Truth-Dokumentation: README/specs/008 sagen nirgends, welche .guidance autoritativ ist, wenn repo-lokale, pool-level und geservte Kopien koexistieren (README:3-7,115-134,1840-1915). | Trigger: nächstes Multi-Workspace-Doku-/Feature-Scope. | Action required: normative Aussage + /health config.source.
- [MC-2] HIGH | Keine Dormancy-Diagnostik: Boot//health erkennen weder schattierende .guidance in registrierten Roots noch unregistrierte Pool-Repos mit .guidance; schlimmer: WorkflowEngine.ts:537-549 kopiert Boot-Config STUMM in Workspaces ohne .guidance (cpSync) — Divergenz ab Tag 1, nie reconciled. | Trigger: nächste Berührung engineForWorkspace/Boot. | Action required: P0-Items 2+3 (Warnung + explizite Adoption statt silent copy).
- [MC-3] MEDIUM | Wizard nicht deployment-aware: generateFiles-Notes sagen nicht, WO das File-Set hingeschrieben werden muss (served root vs. repo-lokal) und dass Remote-Mode init_session braucht; README-Prompts sagen pauschal "project root" (ConfigAssistant.ts:933-1056, README:362-404). | Trigger: nächste Wizard-Änderung. | Action required: mode-aware Note (P1-Item 6).
- [MC-4] HIGH | Pfad-Domain-Mismatch: guidance init (init.ts:9-10) backt execution-environment-Pfade (Host-WSL /mnt/d/...) in workspaces[].root (scaffold.ts:116-151) — im Container fail-closed erst beim Laden, nach vermeintlich erfolgreicher Init. | Trigger: nächste scaffold/init-Änderung. | Action required: Pfad-Domain-Warnung/Placeholder-Form (P1-Item 4).
- [MC-5] HIGH | Gate-Presets passen nicht zu Nicht-Node-Workspaces: nur npm (+uv), kein Cargo/etc.; ops sind pro-Config, nicht pro-Workspace — zed erbt npm-Gates (test required:true) und failed garantiert (ConfigAssistant.ts:180-187,517-542; scaffold.ts:336-384; WorkflowEngine.ts:537-549). | Trigger: Registrierung eines Nicht-Node-Repos (jetzt relevant: zed). | Action required: pro-Workspace gate/preset-Override (P1-Item 5).
- [MC-6] MEDIUM | Cross-Server-Lock-Sicherheit: Lock-Dateien leben je stateDir → Pool-Server vs. repo-lokaler Server schließen sich nicht gegenseitig aus; isStale per process.kill(0) ist PID-Namespace-übergreifend unzuverlässig (workspace-lock.ts:40-55,220-230). | Trigger: Betrieb mehrerer Guidance-Instanzen über dieselben Mounts. | Action required: P2-Item 7 (Single-Server-Annahme dokumentieren/fail-fast).

## Getrackte Follow-ups (2026-09-29, specs/014 Review — session-1b537de7)

- [CT-1] LOW | Pre-existing: Schema-valid guidance.json mit operations.file aber OHNE workflow.file → registryOnly=false → WorkflowEngine-Konstruktor wirft nackten TypeError statt configuration_invalid (WorkflowEngine.ts ~L285). Durch FR-1101 (fehlende Refs legitim) wahrscheinlicher. | Trigger: nächste config-schema-/Constructor-Änderung. | Action required: Constructor-Guard fail-closed mit configuration_invalid.
- [CT-2] LOW | Test-Gap: Legacy-Monolith-E2E (Voll-Config am Instanz-Root + registrierter Extra-Workspace MIT eigener .guidance, dann startWorkflow child-composition) nicht explizit in registry-composition.test.ts — Verhalten per Code-Read korrekt. | Trigger: nächste Berührung registry-composition.test.ts / composition v2. | Action required: einen E2E-Test ergänzen.
