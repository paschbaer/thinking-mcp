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

- [KA-4] LOW (2026-10-02) — **GELÖST (2026-10-02, Option 1 + 4)** | `gitnexus analyze` brach mit Storage-Status `foreign` ab — Root Cause: Case-Mismatch, Storage registriert als `/mnt/d/repos/thinking-mcp` (lowercase), Shell-Cwd war `/mnt/d/repos/Thinking-MCP`. Fix: Reindex mit exakt kleingeschriebenem Cwd — erfolgreich (8.988 Nodes / 21.534 Edges, 177 s). detect-changes: "No changes detected"; die `foreign`-Warning bei read-only Checks ist kosmetisch (Storage-Pfad wird vom CLI ohnehin kanonisiert). Regel in AGENTS.md dokumentiert (Backup `AGENTS.md.bak`): künftig jeden Reindex mit `cd /mnt/d/repos/thinking-mcp` ausführen.

- [KA-1] LOW (2026-10-02, Review feature/mcp-keep-alive-timeout, APPROVED 0 HIGH/CRIT) | server-stochasticthinking SIGTERM/SIGINT-Handler haben keinen `setTimeout(process.exit, 5000).unref()`-Fallback (Asymmetrie zu clear-thought/insight). Empirisch harmlos: Node ≥19 `server.close()` schließt idle Keep-Alive-Sockets selbst (Repro: 1 ms). **Trigger:** nächste Änderung am Shutdown-Pfad von server-stochasticthinking. Accepted observation.

- [KA-2] LOW (2026-10-02, Review feature/mcp-keep-alive-timeout) | `Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65000` frisst absichtliche `0`-Werte (""/"0" → Fallback 65000). Kein gültiger Use-Case für einen Server; bewusst so gewählt. **Trigger:** falls ein bewusster Opt-out (`KEEP_ALIVE_TIMEOUT_MS=0`) benötigt wird → explizites `!== undefined`-Handling. Accepted with rationale.

- [KA-3] LOW (2026-10-02, ops) — **GELÖST (2026-10-02)** | Container neu gebaut + neu gestartet; Live-Verifikation: Port 3000 (clear-thought), 3002 (insight), 3003 (guidance) alle `Keep-Alive: timeout=65` ✓. Port 3001 (stochastic) nicht deployed — **Server ist deprecated**, kein Rebuild/Re-Deploy nötig (Fix bleibt im Source für den Fall einer Reaktivierung).

- [CT-ARGS-2] INFO (2026-10-02, re-review affa7f0, APPROVED) — zwei nicht-blockierende Beobachtungen aus dem unabhängigen Re-Review: (1) `callDownstream` prüft `outcome.structuredContent` per Truthiness statt `!== undefined/null` (strukturierter Content `0`/`""`/`false` würde verworfen — per MCP-Protokoll immer Objekt, praktisch irrelevant); (2) kein dedizierter cancel_workflow-während-callDownstream-Test (Code-Pfad spiegelt runOperation). **Trigger:** nächste Änderung an WorkflowEngine.callDownstream. Accepted observation.

- [CT-ARGS-1] MEDIUM (2026-10-02) — **GELÖST (feature/ct-args-passthrough, 2026-10-02)** | `call_downstream`-Passthrough + `run_operation`-Arguments-Parameter implementiert: (1) `WorkflowEngine.callDownstream(sessionId, serverId, toolName, args)` — session-routed, gleicher Single-Flight/Workspace-Lock wie runOperation, durchläuft die geteilte `agentInvoker`-Closure (WC-1 Allowlist, WC-1-B Wildcard-Rejection, FR-053 Egress, Capability-Pin, Container-Route-Fallback read_only), GDS-5 raw Exposure, Audit `operation_invoked/denied` via `call_downstream`; (2) `run_operation(…, arguments?)` — Deep-Merge Agent-Keys > fixed/template-resolved Args (mcpTool only; process/composite ignorieren mit `argument_overrides_ignored`-Warning, kein argv-Injection), neues `argumentsLocked`-Flag rejected Overrides fail-closed (Review-F2 gegen Template-Pin-Spoofing); (3) Metrics-Wrapper reichen den 5. Parameter durch. Tests: `tests/contract/call-downstream.test.ts` (9, real HTTP-MCP-Stub in-process) + http-transport Tool-Count 22→23. Full-Suite 513 passed / 9 skipped, tsc clean. Args werden NICHT schema-validiert (Input-Validierung bleibt beim Downstream-Tool, dokumentiert im README).

- [CHAIN-1] MEDIUM — **GELÖST (US1 implementiert a40f485/04a2b4c/b09f74b auf develop; Rest-Scopes GDS-6 + CHAIN-Replay durch feature/gds6-chain-replay-hardening)** | Rebind-Semantik AC-13..17 in getWorkflowState (R2: completed überlebt, active/blocked Rebind + Re-Validierung, session_rebound-Audit, AC-15 fail-closed), registry_register (R1=B), Successor-born-invalid via Probe-Routing-Delegation (AC-16) — Regressionsschutz registry-rebind.test.ts (12 Tests). Mid-Session-Config-Änderungen invalidieren Sessions nicht mehr (Rebind); Chained Workflows wieder voll nutzbar.

- [REV-1] LOW (Session-Review 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-28) |
  FR-035-Timeout-Fallback für GitNexus: gitnexus hatte keine Container-Route
  → GEFIXT: `containerRoute` für gitnexus definiert (live
  .guidance/downstream-servers.json + Template + buildDownstream-Generator;
  Endpoint `:4747/api/mcp`, per Initialize-Probe verifiziert; Egress-
  Allowlist :4747 war bereits vorhanden; Live-Config im Container per
  loadConfig validiert; Regressionstest für beide Transports; Suite 430/430).
  Commit ff3dc1d. Regeltext-Klärung (report_blocker vs. CLI-Fallback nach 2. Timeout) verbleibt als akzeptierte Anmerkung in REV-1-Historie — der
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
  exposeed nur experience__/lesson__/workflow__/validation__), downstream-
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
  Frische-Indikator (Inkremental-Analyze aktualisiert nur branches/_).
  Rest: gitnexus-native Staleness-API bleibt Nice-to-have (Skript macht sie
  überflüssig, solange branches/_ zuverlässig gepflegt wird). | — | resolved
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
> Branch feature/low-residue-closure. Suite 314/314 + tsc + build grün (Container).

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
- [WC-1-B] LOW (deferred) — **GELÖST 2026-09-30 (feature/wc1b-wildcard-unconfigured-approval, e5408c1, Guidance-Session session-b470f696; Strategie Option B per Nutzerentscheid)** | Restlücke: ein TRUSTED Wildcard-Server konnte destructive Tools ohne operations.json-Eintrag hosten (opForEgress undefined → FR-053-Gate feuerte nie) — insbesondere über die Child-/Downstream-Engine-Verdrahtung, die den Eltern-Closure mit Eltern-Operations-Bestand nutzt. Fix: PolicyEngine.assertUnconfiguredWildcard — unkonfiguriertes Tool auf Wildcard-Server → recoverable authorization_required (Server + Tool benannt, Auflösungshinweis 'add an operation entry'); konfigurierte Tools byte-identisch; assertAllowed- und WC-1-Kopplung unverändert; Container-Route-Fallback (read_only-only) unberührt. 4 PolicyEngine-Unit-Tests; Suite 483/483 grün; README-Wildcard-Abschnitt ergänzt.
- [WC1B-F3] LOW | Integrationstest-Lücke (aus WC-1-B-Review, Sub-Agent 028b2135): kein End-to-End-Fall 'Wildcard-Server + unkonfiguriertes Tool über run_operation/Closure' — die Verdrahtung in buildInvokerClosure ist aktuell nur über den Unit-Test der PolicyEngine-Methode + konfigurierte Pfade (tools-run-operation 19✓) abgesichert. | Trigger: nächste Berührung von tools-run-operation.test.ts ODER buildInvokerClosure. | Action required: einen Integrationstest ergänzen (Wildcard-Config + Operation auf anderem Server → Closure-Aufruf des unkonfigurierten Tools → authorization_required) als Regressionsschutz gegen Verdrahtungs-Drift.

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

## Getrackte Follow-ups (2026-09-30, Registry-Hot-Reload — Nutzeranfrage)

- [HR-1] LOW — **SDD ABGESCHLOSSEN 2026-09-30 (specs/015-registry-hot-reload-deps, feature/015-sdd-registry-hot-reload-deps, Guidance-Session session-7980b278)** | spec.md/plan.md/tasks.md im Draft-Status erstellt: US1 Registry-Hot-Reload mit BEIDEN Konzeptalternativen (config-watch + atomarer Swap vs. registry-register-Tool) als offene Design-Entscheidung (R1 in plan.md, Empfehlung: B zuerst), AC-1…AC-6 inkl. Fail-closed-Reuse, Audit-Events, configurationVersion-Semantik (R2-Matrix als Blocking-Open-Point) und WC-1/WC-1-B-Kopplung. specs/008-Spannung als explizites Verwerfungs-Kriterium verankert. Umsetzung ausstehend (Phase-1-Task T001/T002: R1/R2 mit Nutzer schließen).

## Getrackte Follow-ups (2026-09-30, Dependency-Bootstrap Node-Repos — Nutzeranfrage)

- [DB-1] MEDIUM — **SDD ABGESCHLOSSEN 2026-09-30 (specs/015-registry-hot-reload-deps US2, feature/015-sdd-registry-hot-reload-deps, Guidance-Session session-7980b278)** | Offener Rest (deps-install/deps-reinstall) ist now specifiziert: spec.md US2 (AC-7…AC-12: npm ci Clean-Semantik + Lockfile-Fallback mit Audit-Vermerk, deps-reinstall workspace-scoped, reaktive Erkennung über Gate-Fehlermuster + optionale proaktive Sonde, riskClass workspace_write + Approval, Container-Installation); plan.md Technical Approach + Test-Strategie; tasks.md Phase 3 (T007…T010). Umsetzung ausstehend — löst danach auch GATE-1 (Container-Gates werden verlässlich).

## Getrackte Follow-ups (2026-09-30, CT-1 Constructor-Guard — Guidance-Session session-1070c546)

- [CT-1] LOW — **GELÖST 2026-09-30 (feature/ct1-constructor-guard, 8f588c6, Guidance-Session session-1070c546)** | Nackter TypeError im WorkflowEngine-Konstruktor bei schema-validem guidance.json mit operations.file aber ohne workflow.file (registryOnly=false). Fix: fail-closed-Guard mit configuration_invalid, Strukturcheck workflow.id/initialPhase (truthy-leeres workflow-Objekt hätte sonst durchgegriffen — von Testfall workflow={} abgedeckt; dort greift zusätzlich loadConfig mit ConfigurationError). 4 Regressionstests (tests/workflow/ct1-constructor-guard.test.ts), Suite 479/479 grün, unabhängiger Review APPROVED 0 HIGH/CRIT, README-Hinweis ergänzt.
- [TYPE-1] LOW | Pre-existing typecheck-Fehler tests/contract/shipped-configs.test.ts(125) TS2532 (CONFIG_SETS[1] unter noUncheckedIndexedAccess). Datei unmodified, nicht durch CT-1 verursacht. | Trigger: nächste Änderung an shipped-configs.test.ts oder tsconfig (noUncheckedIndexedAccess). | Action required: `CONFIG_SETS[1]!.dir` oder destrukturierenden Zugriff nutzen + checken, warum der Fehler am Baseline-HEAD (ea582f8) reproduzierbar ist, obwohl frühere Läufe typecheck-grün meldeten (TS-Version-Drift? tsc-Version via nvm prüfen).
- [GATE-1] OBSERVATION | Verify-Gates lint (prettier --check) und test (root npm test --workspaces) schlagen im Guidance-Container fail-closed fehl (keine Linux-nativen node_modules — DB-1-Rest-Kontext); beide required:false, Phase advanced trotzdem. Autoritative Verifikationsroute bleibt WSL (npm test in servers/server-guidance, prettier lokal). | Trigger: wenn die Container-Gates auf required:true gezogen werden ODER DB-1-Rest (deps-install) umgesetzt wird. | Action required: Container-node_modules nativ installieren (Convergence-Pfad aus operations.json), dann Gates verschärfen — nicht vorher.
- [CHAIN-1] LOW | Chain-Fortsetzung über die automatisch erzeugte Folgesession scheitert an AC-5: Nach Completion von session-1070c546 meldete die Nachfolger-Session (session-ec74b6ba) `configuration_invalid: bound to e192bb…, current configuration 39e5a3…` — die Folgesession war bei Kettenstart an die DAMALIGE configurationVersion gebunden, und der Hash hat sich bis zur Aktivierung geändert (Ursache ungeklärt: Repo-.guidance ist byte-identisch zu develop, keine gehashten Inputs erkennbar geändert; Verdacht: Instanz-/Registry-Seite im Container oder Kontext der Hash-Ermittlung — workspaces[]-Serialisierung, ENV-abhängige Defaults). Zusätzlich zeigte die Kette für die Folgesession denselben CT-1-Request (Schritt-Index nicht advanced?). | Trigger: nächster Chained-Guidance-Workflow ODER Änderung an chain activation/getWorkflowState AC-5-Check. | Action required: Root-Cause für den Hash-Drift zwischen Kettenstart und Folgesession-Aktivierung klären (LoadConfig-Hash-Inputs deterministisch gegen Instanz-Registry prüfen; ggf. Folgesession erst bei Aktivierung an aktuelle Konfiguration binden oder Rebind mit Re-Validierung). Bis dahin: Chained Workflows pro Schritt-Gruppe mit frischer start_workflow-Kette fahren (bewährtes Muster aus früheren Ketten).

## Getrackte Follow-ups (2026-09-30, CT-2 Legacy-Monolith-E2E — Guidance-Session session-9e23340f)

- [CT-2] LOW — **GELÖST 2026-09-30 (feature/ct2-legacy-monolith-e2e, 96b0a67, Guidance-Session session-9e23340f)** | Test-Gap Legacy-Monolith-E2E geschlossen: registry-composition.test.ts um describe 'legacy monolith child composition (CT-2)' ergänzt — Voll-Config am Pool-Root (workspaces[]-Registry) + Extra-Workspace mit eigener voller .guidance → startWorkflow({workspace:'zed'}) komponiert aus dem Workspace-Root: Persistierte Session-configurationVersion === Workspace-Config-Hash (aus zed/.guidance/state/sessions/<id>.json) UND ≠ Pool-Instance-Hash; keine Config-Copies in den Workspace. 15/15 registry-composition, Suite 480/480 grün, prettier grün. Kein Produktionscode nötig — Workspace-Routing im Monolith-Modus korrekt (Plan-Restrisiko entkräftet).

## Getrackte Follow-ups (2026-09-30, WW-1 Extra-Root-Default-Dedupe — Guidance-Session session-58b4d57f)

- [WW-1] LOW — **GELÖST 2026-09-30 (feature/ww1-extraroot-default-dedupe, 6029007, Guidance-Session session-58b4d57f)** | parseExtraWorkspaces(value, defaultRoot?): seenRoots wird mit resolve(defaultRoot) geseedet — ein Extra-Root, der zum Default-workspaceRoot resolvieren würde, failt jetzt schon bei Generation-Zeit mit configuration_invalid ('duplicate root', Pseudo-Name 'default (workspaceRoot)') statt erst beim Container-Load. generateFiles übergibt den getrimmten workspaceRoot. 2 Regressionstests (exakte Kollision + resolve-normalisierte Kollision über Trailing-Separator); 70/70 Config-Assistent-Tests, Suite 480/480 grün, prettier grün. Realpath-/Case-Kollaps bleibt bewusst load-time (WorkspaceRegistry.build) — WW-1-Scope war der Follow-up-Wortlaut (Default-Root-Dublette).

## Getrackte Follow-ups (2026-09-30, WW-2 workspaceRoot-isAbsolute — Guidance-Session session-c4d8dba2)

- [WW-2] LOW — **GELÖST 2026-09-30 (feature/ww2-workspaceroot-isabsolute, 5c06639, Guidance-Session session-c4d8dba2)** | isAbsolute-Fail-fast für den Default-workspaceRoot in generateFiles (registry-edit): nach dem Empty-Check wirft ein relativer Pfad jetzt configuration_invalid ('must be an absolute path: …', analog zur Extras-Prüfung) statt erst bei loadConfig zu failen. 1 Regressionstest; fokussiert 71/71; Vollauf effektiv 481/481 (2 Timeout-Flakes metrics/engine auf Re-Run grün — bekannte WSL-Last-Flakiness, nicht Diff-bedingt); prettier grün. Konsistente Fail-fast-Semantik für Default-Root UND Extras auf Generation-Ebene; Existenz-/Realpath-Checks bleiben load-time by design.

## Getrackte Follow-ups (2026-09-30, WW-3 Boundary-Tests — Guidance-Session session-46674965)

- [WW-3] LOW — **GELÖST 2026-09-30 (feature/ww3-extraworkspaces-boundary-tests, 101306c, Guidance-Session session-46674965)** | Beide getrackten Boundary-Cases regressionsgesichert in tests/setup/config-assistant.test.ts: (1) Root mit '='-Zeichen ('zed=/w/zed=path=mit=gleichheitszeichen') — indexOf-Trennung nimmt das erste '=', Rest landet vollständig im Registry-Eintrag; (2) whitespace-only-Antworten (' ; ') ≡ weggelassen — nur der default-Eintrag. Assertions E2E über generiertes guidance.json (Vorlage AC-6-Test). Kein Produktionscode nötig — Verhalten war korrekt, nur ungetestet. Suite 482/482 grün, prettier grün.

## Getrackte Follow-ups (2026-09-30, specs/015 R1/R2-Entscheidungen — Nutzer)

- [SPEC015-A] LOW | Alternative A (config-watch + atomarer Registry-Swap) wurde als US1-Design zugunsten von Alternative B (registry-register-Tool) zurückgestellt (Nutzerentscheid 2026-09-30, specs/015-registry-hot-reload-deps/plan.md R1). | Trigger: nach Umsetzung und Stabilisierung von US1/B, falls Datei-Edit-Workflows dominieren (Operator-Feedback) oder auf explizite Nutzeranfrage. | Action required: US1-Alt-A als eigene Spec-Erweiterung planen (Watcher-Lebenszyklus, Rennen, geordnete Session-Invalidierung gem. R2-Entscheidung).
- [NIYAMA-REG] OBSERVATION | Niyama-Workspace-Eintrag wurde aus .guidance/guidance.json entfernt (Repo auf neuer Maschine nicht vorhanden; Nutzer clont es hier und führt weiter). | Trigger: sobald D:\repos\Niyama existiert. | Action required: workspaces[]-Eintrag { name: niyama, root: /workspaces/Niyama, projectName: Niyama } wieder ergänzen; GATE-1-Kontext (Container-Gates) bleibt bis DB-1 (specs/015 US2) umweltbedingt.

**R1/R2-Status (2026-09-30):** R1 = Alternative B (registry-register-Tool), A getrackt als SPEC015-A. R2 = Weiterführung mit Re-Validierung (completed überlebt; active/blocked mit Rebind + Re-Validierung, sonst fail-closed). specs/015-Umsetzung damit entblockt — eigene Chain nach Abschluss der Cleanup-Chain session-77a51a32.

## Getrackte Follow-ups (2026-09-30, TYPE-1-Auflösung — session-77a51a32)

- [TYPE-1] LOW — **GELÖST 2026-09-30 (feature/type1-ts2532)** | TS2532 in shipped-configs.test.ts(125) via `CONFIG_SETS[1]!.dir` gefixt; File auf LF normalisiert. Root-Cause: CRLF + unchecked access seit WC-4-Commit 235e9e6 (frühere grüne Läufe predaten dem Commit bzw. prüften tests/ nicht). typecheck/prettier/fokussiert 7/7/Vollauf 474+9 skip grün. | Follow-up-Observation: CR-Inventory weiterer Testdateien (strings/fixtures, prettier-grün) — nur handanlegen, falls prettier dort künftig failt.

## 2026-10-01: CHAIN-1 Root-Cause EVIDENZIERT (Live-Reproduktion in session-77a51a32)

- [CHAIN-1] MEDIUM — **ROOT-CAUSE KLÄRT DEN MECHANISMUS (Live-Reproduktion 2026-10-01)** | session-77a51a32 (TYPE-1, Kettenschritt 1/4) lief bis Phase complete (alle Submission-Phasen accepted, lokale Gates grün). Der nötige Mid-Session-Config-Change (operations.json `gitnexus-check`-Entry als WC-1-B-Remedy, Commit 8e7ac24) + Container-Restart (Config-Snapshot, kein Hot-Reload) führte zu `configuration_invalid: session bound to sha256:2141c4a9… != current sha256:8cf5be36… (registry/config changed; specs/008 AC-5)` — Session gecancelt, TYPE-1 außerhalb der Guidance-Ceremonie abgeschlossen (alle Verifikationsartefakte existieren). | **Wurzel:** AC-5 bindet die Session fail-closed an den Konfig-Hash BEI SESSION-START; jede Config-Änderung während der Session (Registry ODER operations.json) invalidiert sie. Bei Chains trifft dasselbe die auto-erzeugte Folgesession (gebunden an Hash bei Kettenstart). | **Fix = R2-Entscheidung (specs/015 US1):** Weiterführung mit Re-Validierung (Rebind an aktuelle Config bei Aktivierung/State-Read + Re-Validierung, completed überlebt). Bis dahin Workaround: KEINE Config-Änderungen zwischen start_workflow und complete_workflow; frische Ketten pro Schritt-Gruppe. | Trigger für Rest: specs/015-US1-Umsetzung (R1=B entschieden). | Action required: US1-Implementierung schließt CHAIN-1; Regressionstest: Mid-Session-Registry-Änderung → active Session re-validiert statt configuration_invalid.
- [TYPE-1] — **ABSCHLUSS OK AUSSERHALB GUIDANCE:** 58faa7e+8e7ac24 auf feature/type1-ts2532; tsc/prettier/fokussiert 7/7/Vollauf 474+9skip grün; unabhängiger Review APPROVED 0 HIGH/CRIT (Sub-Agent 3c0327e2); final-review.json + final-review-gate grün (HEAD 8e7ac24); gitnexus analyze --no-stats @HEAD; docs-drift grün. Nur der serverseitige Completion-Stempel fehlt (s.o.).

## Getrackte Follow-ups (2026-10-01, WC1B-F3-Auflösung — session-293a251f)

- [WC1B-F3] LOW — **GELÖST 2026-10-01 (feature/wc1b-f3-integration-test)** | Integrationstest "WC-1-B (WC1B-F3)" in tools-run-operation.test.ts: Wildcard-Server + unkonfiguriertes Tool über Composite-mcpTool-Step → Closure liefert recoverable authorization_required ohne Downstream-Contact. Regressionsschutz gegen Verdrahtungs-Drift in buildInvokerClosure. Fokussiert 20/20, Vollauf 475+9skip grün.

## Review-Quality (2026-10-01, WC1B-F3-Review c31e517c)

- MEDIUM "Commit-Scope + AGENTS.md.bak im Repo": behoben — Branch lokal rewritet; Scope-Commit 5f124f1 (Test + memory-bank) getrennt von 2ee..b2ee2db (Skill-Docs/Meta-Blöcke); AGENTS.md.bak gelöscht (Backup-Inhalt via git-historie reproduzierbar). Reviewer-Verdict vorher CHANGES REQUESTED (0 HIGH/CRIT, 1 MEDIUM) → nach Fix APPROVED-fähig; Fix im selben Scope, Test unverändert (5f124f1 = 588eef7-Inhalt, bereinigt).

## Getrackte Follow-ups (2026-10-01, Guidance Finalisierung nach Retry — session-293a251f)

- [GDS-6] MEDIUM — **GELÖST (feature/gds6-chain-replay-hardening)** | retryOperations finalisiert nach Hook-Fail → Retry-Success jetzt vollständig: pendingCompletion {report, requestId} wird beim Hook-Fail an der Session persistiert; Retry-Success in Phase complete setzt status=completed + completedAt, auditiert workflow_completed (finalizedBy=retry_operation), erzeugt den Chain-Successor aus dem Retained-Report (extrahierte createChainSuccessorLocked/activateSuccessor-Helper, von completeWorkflow geteilt) und cached das Ergebnis unter requestIds. Defensiver Pfad ohne pendingCompletion finalisiert ohne Successor (Audit sichtbar). Regressionstests tests/workflow/retry-finalize.test.ts (4 Tests: plain finalize + Replay, chained finalize + requestId-Replay).
- [GDS-7] LOW — **DOKUMENTIERT (feature/f0531-gds7-cleanup)** | Deterministisches Dual-Index-Prozedere in servers/server-guidance/README.md verankert: Refresh des Gate-relevanten repo-lokalen Index via WSL aus der exakten (kleingeschriebenen) Pfad-Identität mit --skip-skills; --force bei 'Already up to date'; gitnexus-server-Container refresh nur eigenen /data-Storage; AGENTS.md-Noise-Muster. Keine compose-Änderung nötig (kein GITNEXUS_* env vorhanden; Container-Storage aus Image-Defaults).

## 2026-10-01: CHAIN-1 — Source-Verifikation + R2-ACs verankert (feature/chain1-ac5-evidence)

- Root-Cause gegen Source verifiziert: WorkflowEngine.ts:639-648 (fail-closed,
  recoverable:false, bei JEDEM Session-Zugriff mit Hash-Divergenz).
- R2-Entscheidung als AC-13…AC-17 (Rebind mit Re-Validierung; completed
  überlebt; Chain-Successor-Rebind; Audit-Event session_rebound) in
  specs/015 spec.md Addendum verankert. Umsetzung = US1 (R1=B).
- CHAIN-1 bleibt getrackt bis US1-Implementierung (AC-16-Regressionstest
  ist das Abschluss-Kriterium); Symptom-Mechanismus ist damit vollständig
  erklärt und spezifiziert.

## 2026-10-01: CHAIN-1-Verfeinerung — Successor born-invalid (Defekt-Hypothese präzisiert)

- [CHAIN-1] Ergänzung: Per start_workflow erzeugte Sessions binden korrekt (drei Sessions liefen komplett durch: 293a251f, a0577447, 7e69dcdd — configurationVersion cacb2274 konistent). Serverseitig ERZEUGTE Chain-Successors binden denselben cacb2274-Hash, aber get_workflow_state vergleicht gegen 8cf5be36 → Successor born-invalid (betroffen: 78cad869, b0ae5c2a; cancelled). | Hypothese: Successor-Erzeugung komponiert die Config über den DEFAULT-Workspace-Root (/workspaces) statt über den Repo-Root (/workspaces/Thinking-MCP) → andere Registry-/Hash-Inputs als der Start-Pfad. | Trigger: specs/015-US1-Implementierung (AC-16-Rebind + Successor-Binding) — Regressionstest muss beide Pfade (start vs. successor) mit identischem Hash abdecken. | Bis dahin: pro Schritt frische start_workflow-Session (bewährtes Muster), Successor canceln.

## Getrackte Follow-ups (2026-10-01, Re-Review 04a2b4c — session 5c4f1e44 Folge-Review)

- [REV-04a2b4c-1] HIGH — **GELÖST (await-Fix: b09f74b; Tool-Level-Test: feature/rev04a2b4c1-registry-await-test)** | Der Handler serialisierte das un-awaitete registerWorkspace()-Promise als "{}". await-Fix + F1/F2-Regressionstests bereits in b09f74b (develop); fehlender Tool-Level-Response-Shape-Test nachgereicht: registry-rebind.test.ts 'review F-handler' — stub MCP server fängt registry_register-Handler ab, echte WorkflowTools über Pool-Engine; asserted configurationVersion + registry im serialisierten Body (nicht "{}") und fail-closed-Rejection (/root does not exist/) statt un-awaited Body. SDK-zod-Layer bewusst out of scope (Stub). Fokussiert 12/12, typecheck + prettier grün.
- [REV-04a2b4c-2] MEDIUM — **GELÖST b09f74b** | Fingerprint-Drift-Probe als Live-Engine-Test nachgereicht (registry-rebind.test.ts 'review F2': engine1 nach touchConfig() befragt, session_rebound auditiert).
- [REV-04a2b4c-3] MEDIUM — **GELÖST b09f74b** | F1-Purge-Regressionstest nachgereicht (registry-rebind.test.ts 'review F1': Session routen → registerWorkspace remove → getWorkflowState fail-closed statt stale Route).

## Getrackte Follow-ups (2026-10-01, specs/015 US2 Review — session 28f04594, Commit e5780fc)

- [REV-US2-F1] MEDIUM — **GELÖST — REWORK c371f7e (feature/approval-policy-config, Nutzer-Design-Korrektur: Unattended-Betrieb)** | Ursprünglich Scope-A (interaktive Grants pro Ausführung) kollidierte mit der Unattended-Philosophie. Jetzt: Trust-Act in der Konfiguration — policies.json → policies.approvals (riskClass → allow|require, fail-closed validiert; Defaults: destructive/credential_sensitive → require (Zeremonie bleibt), workspace_write/external_write/read_only → allow (unattended)). validatePolicies-Bugfix: Approvals-Validierung übersprungen früher den Early-Return bei fehlender submission-Sektion (durch Fail-closed-Test gedeckt, der unter Alt-Code scheitert). Zeremonie/assert/consume/all-or-nothing unverändert für require-Klassen; Gate an allen 8 Pfaden; configVersion-Hash erfasst approvals (Änderung revalued Sessions). Vollauf 534/534. Siehe auch REV-APPCFG-1/-2.
- [REV-US2-F2] MEDIUM — **GELÖST (feature/rev-us2-f2f3f4)** | Beschreibungen in allen drei Katalogen + README-Zeile zu deps-install auf die echten firstAvailable-Semantiken umgestellt (Fallback bei JEDEM npm-ci-Fehler; node_modules-Lösch-Caveat). Entscheidung: Doku-Alignment statt condition-Feld (Engine hat keine per-Step-Conditions; wäre neues Feature).
- [REV-US2-F3] LOW — **GELÖST (feature/rev-us2-f2f3f4)** | Composite-Failure-Merge führt jetzt die Step-Warnings mit (node_deps_hint überlebt); Test 'REV-US2-F3: a failing composite gate keeps its step warnings'. Hint-on-every-process-fail bleibt akzeptiertes Rauschen.
- [REV-US2-F4] LOW — **GELÖST (feature/rev-us2f2f3f4)** | Drei Kataloge field-identisch für deps-install/deps-reinstall (canonical: protocolRequestMustSucceed + summary_and_errors + unified description inkl. 'Runs in the workspace root'); neuer Drift-Guard-Test 'REV-US2-F4: the three deps-op catalogs are field-identical'.
- [REV-US2-F5] LOW — **GELÖST (feature/fr053-approval-gate)** | Plattform-Constraint in deps-reinstall-Beschreibung (alle 3 Kataloge, drift-guard-getrackt) + README dokumentiert.
- [REV-US2-F6] LOW — **TEILWEISE GELÖST (feature/fr053-approval-gate)** | require("node:fs") → Import umgestellt. Lockfile-Flakiness-Restrisiko bleibt getrackt (Trigger: npm-Major-Update ODER Flakiness auftritt).
- [DEPLOY-015] OBSERVATION | ~~Instanz-.guidance/operations.json enthält die deps-Ops bewusst NICHT~~ **ERLEDIGT 2026-10-01 (Commit 0837069):** deps-install/deps-reinstall in der Instanz-Config, `test`-Gate auf required:true gezogen, GATE-1-Disclaimer entfernt; Container gehealt (npm ci + install-scripts-Approvals), lint/test im Container grün. | **[DEPLOY-015b] ~~MEDIUM~~ ERLEDIGT 2026-10-01 (feature/015-deploy-015b-image-tools):** make + g++ in die apt-Layer von servers/server-guidance/Dockerfile aufgenommen (node-gyp-Toolchain komplett: python3/make/g++/gcc/libc6-dev); zusätzlich der duplizierte unbedingte dotnet-Install-Block entfernt (INSTALL_CSHARP=false war wirkungslos, .NET SDK wurde immer installiert — Image-Bloat). Verifiziert: `docker compose build guidance` grün; Throwaway-Probe auf dem neuen Image: make/g++/python3 vorhanden, dotnet absent. Roll-out (`up -d --force-recreate`) nach Session-Completion — danach ist deps-reinstall in einem frischen Container ohne manuelle apt-Nacharbeit funktionsfähig. Die npm-≥11.19-Allowlist (`allowScripts` in package.json, Commit 0837069) bleibt als zweite Hälfte des Fixes bestehen. |

## Getrackte Follow-ups (2026-10-01, Independent Review eedb7bb — feature/gds6-chain-replay-hardening)

- [REV-eedb7bb-1] LOW — **GELÖST (Follow-up-Commit auf feature/gds6-chain-replay-hardening)** | retryOperations propagiert pending.requestId jetzt an activateSuccessor → Cache wird post-activation mit finaler chain[0].status refresh (Mirror des Complete-Pfads).
- [REV-eedb7bb-2] INFO | Pre-upgrade retry-wedged sessions (status=active, currentPhase='completed', no pendingCompletion) remain unrecoverable: retry_operation hits the terminal phase (no beforeExit ops, no transition), complete_workflow fails invalid_active_phase. Pre-upgrade hook-failure wedges (still at phase 'complete') ARE recovered by the new finalize path. No migration provided. | Trigger: any operator report of a session stuck active/completed from before eedb7bb. | Accepted observation: cancel_workflow + fresh start is the documented recovery.
- [REV-eedb7bb-3] INFO | pendingCompletion persists the FULL completion report in the session JSON (new retention that did not exist before — failure/success paths never stored the report). Size/sensitivity bounded by report content; survives resume/reportBlocker paths until finalize or cancellation. | Trigger: next touch on session persistence/retention or sensitive-data policy. | Action required: consider clearing pendingCompletion on cancel_workflow and documenting retention in README.
- [REV-eedb7bb-4] INFO | Concurrency paths (concurrent retry+complete, double retry) are untested; analysis shows they are safe via session-lock serialization (second complete → workflow_already_completed; second retry → non-mutating workflow_blocked). Retry success in phase 'complete' WITHOUT prior complete_workflow call is also untested (skips report schema validation; finalize without successor if pendingCompletion absent). | Trigger: next touch on retryOperations. | Action required: add a double-retry and a no-pendingCompletion retry-finalize test.
- [REV-eedb7bb-5] INFO | Fail-closed duplicate check rejects manifests where the head intentionally re-states step 0 scope (trimmed equality). Recoverable configuration_invalid with remediation hint; README documents the rule. | Accepted observation (intentional fail-closed design per remaining-work-plan L19-34).
- [REV-eedb7bb-6] LOW — **GELÖST (Follow-up-Commit)** | Verwaister doppelter Doc-Comment-Block über wsGuidance() entfernt.

## Getrackte Follow-ups (2026-10-02, Independent Review 7edef62 — feature/rev-us2-f2f3f4, REVIEW APPROVED, 0 HIGH/CRIT)

- [REV-F2F3F4-1] LOW — **GELÖST (feature/fr053-approval-gate)** | applyExposure summary_and_errors lässt Warnings jetzt durch (content/data weiter suppress; status_only/summary/none unverändert) — node_deps_hint erreicht den Agenten; PolicyEngine-Test + Composite-End-to-End in approval-gate.test.ts.
- [REV-F2F3F4-2] LOW — **GELÖST (feature/f0531-gds7-cleanup)** | Beschreibung in allen drei Katalogen präzisiert: via-Label '(audit note; visible in run history)' — drift-guard-getrackt.
- [REV-F2F3F4-3] INFO | Unkommentierter Kosmetik-Change im Commit: Composite-Failure-Summary-Join von `errors.join("; ")` auf `errors.join(";")` geändert (OperationEngine.ts:204) — kein Test pinnt das Format, kein Consumer-Impact. | Trigger: keiner. | Akzeptiert.

- [DEPLOY-015c] MEDIUM (NEU 2026-10-01): Die Container-Testsuite crasht beim vitest-Worker-Teardown: `node::RemoveEnvironmentCleanupHook`-Assert (`env != nullptr`), 2–5 Worker pro Lauf, deterministisch (forks/threads, mit/ohne File-Parallelismus jeweils betroffen; Tests selbst 108–113/118 grün). Verdacht: node 24.21-Container-Binary × native Addon (better-sqlite3/sharp)-Teardown. Folge: `test`-Gate wieder auf required:false zurückgestellt, WSL-Suite bleibt autoritativ. | Trigger: nächster Container-/node-Upgrade-Zyklus ODER Debug-Session für die Teardown-Crashes. | Action required: Ursache eingrenzen (welches Addon den Cleanup-Hook registriert; node-Version-Bisect; ggf. Vitest-Pool-Config im Repo) und dann test wieder auf required:true ziehen. |

## Getrackte Follow-ups (2026-10-02, Independent Review 5d782c9 — feature/fr053-approval-gate, APPROVED, 0 HIGH/CRIT)

- [REV-F053-1] LOW — **GELÖST (feature/f0531-gds7-cleanup)** | Die vier op-by-op-Lifecycle-Loops (activateSession beforeEnter, runAfterEnter, beforeEnterIds, afterExitIds) validieren jetzt die GESAMTE Liste vor der ersten Ausführung (all-or-nothing); Konsum bleibt erfolgsbasiert pro Op. Regressionstests: Pre-Loop-Denial nennt das spätere gated Op, kein Op läuft, frühere Grants bleiben erhalten.
- [REV-F053-1b-1] INFO (Independent Review 588fa62 — feature/f0531-gds7-cleanup, APPROVED, 0 HIGH/CRIT) | Kosmetik: Kommentartext der REV-F053-1-Markierung im afterExit-Loop falsch eingerückt (WorkflowEngine.ts:2622 — 8 Spaces statt 4, eingeführt im Fix-Commit). Rein optisch, kein Verhaltens- oder Lint-Impact. | Trigger: nächste Berührung am afterExit-Block in WorkflowEngine.ts. | Action required: Einrückung auf 4 Spaces korrigieren.
- [REV-F053-2] LOW — ACCEPTED (observation) | Das Gate vertraut dem deklarierten riskClass der Operation-Config: Ein Profil-Autor kann workspace-schreibende Composite-Steps als read_only deklarieren und umgeht damit die Zeremonie. Config-Authoring ist die etablierte Trust-Boundary (dieselbe Annahme wie invocableByAgent/required). | Trigger: nächste Änderung am Composite-Schema oder an der Gate-Logik. | Action required (optional): Composite-Steps auf deklarative Step-riskClass prüfen (max über Steps) statt nur die Op-Ebene.
- [REV-F053-3] INFO | consumeApprovals schreibt approvedOperations aus dem beim Call-Start geladenen Array zurück (update lädt frisch, ersetzt aber das Feld). Ein paralleler approval_granted während eines laufenden Runs wäre lost-update — praktisch unerreichbar, da Grants status=blocked erfordern und Ops status=active (runningOps-Lock). | Trigger: falls der Status-Check in resumeWorkflow je gelockert wird. | Accepted observation.

## Getrackte Follow-ups (2026-10-02, Independent Review c371f7e — feature/approval-policy-config, APPROVED, 0 HIGH/CRIT)

- [REV-APPCFG-1] LOW — ACCEPTED (re-scheduled) | REV-F053-2-Trigger ist mit c371f7e FEUER GEFANGEN (dieser Commit ändert die Gate-Logik: requiresApproval resolves aus policies.approvals), aber die optionale Action (Composite-Steps auf deklarative Step-riskClass prüfen — max über Steps statt nur Op-Ebene) wurde NICHT umgesetzt. Das Gate vertraut weiterhin nur der Op-Ebenen-riskClass; unter Default-'allow' für workspace_write erhöht sich der Impact einer falsch deklarierten Composite-Step-riskClass nicht zusätzlich (der Profil-Autor konnte die Op-Ebene schon vorher deklarieren — Config-Authoring bleibt die Trust-Boundary). | Trigger: nächste Änderung am Composite-Schema, an der Gate-Logik ODER wenn ein 'require'-Default für workspace_write wieder eingeführt wird. | Action required (optional): max(Step-riskClasses) als effektive Op-riskClass ableiten oder explizit mit Begründung endgültig akzeptieren.
- [REV-APPCFG-2] INFO | Workflow-Level-Zeremonie-Coverage pinnt den 'require'-Pfad nur über das riskClass workspace_write-Require-Fixture; destructive/credential_sensitive sind auf Workflow-Ebene nicht durch eine require-Node-Fixture abgedeckt (nur Unit-Level via policy-engine.test.ts Defaults + Fallback-Assertions). Da assertApprovals klassenagnostisch über die aufgelöste approvals-Map läuft, ist die Abdeckung ausreichend. | Trigger: nächste Änderung an assertApprovals/Zeremonie. | Accepted observation.

## Getrackte Follow-ups (2026-10-02, Independent Review 283fc74 — feature/registry-register-default-on, APPROVED, 0 HIGH/CRIT)

- [REV-RRDO-1] LOW — GELÖST (9f7bc5f) | Kein Test asserted, dass `tools/list` `registry_register` EXKLUDIERT, wenn `registryRegister.enabled: false` — die Tool-List-Gate-Branch (register-tools.ts, isRegistryRegisterEnabled) ist nur indirekt über die Engine-Ebene abgedeckt; durch den Default-Flip ist die negative Branch jetzt die nicht-defaultige. | Trigger: nächste Änderung an register-tools.ts / ToolHandlers.ts. | Action required (optional): Opt-out-Tool-Listen-Assertion in tools-registration.test.ts ergänzen.
- [REV-RRDO-2] LOW — GELÖST (9f7bc5f) | Kein Test asserted, dass Scaffold (scaffold.ts) und Config-Assistant registry-edit (ConfigAssistant.ts) `registryRegister: { enabled: true }` emittieren; shipped-configs-Tests prüfen nur Loadability. | Trigger: nächste Änderung an scaffold.ts / ConfigAssistant.ts. | Action required (optional): Emissions-Assertion ergänzen (Regression würde aktuell nur über Tool-Surface-Tests indirekt auffallen).
- [REV-RRDO-3] INFO | HTTP-Exposure von registry_register ist jetzt Default auf allen Instanzen (loopback, ohne Auth) — absichtlich, gebunden an isChild/Flag/build-Validierung; lokales Threat-Model unverändert (direkter guidance.json-Edit gleichwertig). | Trigger: falls Loopback-Endpoints künftig Auth-frei über den Container hinaus exponiert werden. | Accepted observation.
- [REV-RRDO-4] INFO | Opt-out-Test (tools-registration.test.ts) schließt optOutServer im finally nicht (nur den Client) — muster-konsistent mit dem ungeschlossenen modularen beforeEach-Server; In-Memory-Transport, kein Cross-Test-State beobachtet. | Trigger: falls Vitest-Teardown-Crash (DEPLOY-015c-Muster) hier zuschlägt. | Accepted observation.
- [REV-RRDO-5] INFO | `not.toContain("registry_register")` im Opt-out-Test ist redundant zur exakten Gleichheits-Assertion — bewusst als Intent-Dokumentation belassen. | Trigger: n/a. | Accepted observation.
- [x] FR-FINAL-1 LOW — GELÖST (Hash-Fix-Commit, dieser) | Final-Review (Sub-Agent aa18d064, APPROVED 0 HIGH/CRIT) fand: activeContext/remaining-work-plan referenzierten den pre-amend-Hash 98cb690 statt des Vorgänger-Hashes 9f7bc5f (nur via Reflog erreichbar). Hash-Referenzen korrigiert; sachlicher Inhalt der Claims war korrekt.
- [x] FR-FINAL-2 INFO — GELÖST (committet auf Nutzeranweisung, ohne Extra-Review) | `AGENTS.md`/`CLAUDE.md` im Haupt-Checkout uncommitet modifiziert (identischer +11-Zeilen-Block „## CLI" mit GitNexus-Skill-Tabelle — vermutlich Nebenprodukt eines gitnexus/AGENTS-Guide-Merges). Außerhalb des Session-Scopes; vor dem nächsten Commit aufräumen (committen oder verwerfen). | Trigger: nächster Meta-Docs-Commit oder Nutzeranweisung. | Action required: Nutzerentscheid.
- [x] FR-FINAL-3 INFO — ACCEPTED | Prettier-Reformat-Churn in scaffold.test.ts (~80 von 109 Zeilen, rein formatierend) — konsistent mit der geltenden Prettier-Pflicht, kein Verhaltensunterschied.

## Getrackte Follow-ups (2026-10-02, session-fae2aa34 — feature/guidance-registry-hot-reload-deps-preflight)

- [x] PREFLIGHT-DEPLOY MEDIUM — GELÖST (Recreate durch Nutzer, 2026-10-02) | Der laufende guidance-Container läuft noch auf dem alten Build (dist); beide Fixes (Registry-Live-Provider, deps-Pre-Flight) greifen erst nach `docker compose build guidance && docker compose up -d`. | Trigger: vor dem nächsten Niyama-Dummy-Workflow bzw. dem nächsten Deployment-Fenster. | Action required: Rebuild + Recreate, danach Live-Check (registry_register → start_workflow ohne Neustart).
- [PREFLIGHT-SCOPE] INFO | Pre-Flight hakt nur an den beiden WorkflowEngine-Lifecycle-Gate-Sites (beforeEnter-Aktivierung, beforeExit-Submit); run_operation/agent-initiierte Ops laufen bewusst ohne Auto-Pre-Flight (der Agent sieht deps-Hints reaktiv). | Trigger: falls Gates künftig über weitere Pfade laufen (z.B. neuer ExecuteRequired-Call-Site). | Accepted observation.
- [REV-PREFLIGHT-1] MEDIUM→GELÖST (dieser Commit) | Independent Review 1eb58118: kein Fail-open-Regressionstest; composedView.workspaces in server.ts hielt weiterhin einen frozen Snapshot (lesend ungenutzt, aber tückisch). Gefixt: Live-Getter + Fail-open-Test (deps-preflight.test.ts, failing deps-install → resolves, Audit failed:true). | Trigger: n/a (gelöst). | —
- [REV-PREFLIGHT-2] LOW | preflightLocks: Serialisierung nur pro Prozess — ein stdio- und ein HTTP-Instance können theoretisch parallel npm in denselben Tree laufen lassen; kein workspace-lock.ts-Filelock integriert. | Trigger: falls Guidance je Workspace in mehreren Prozessen läuft. | Action required (optional): WorkspaceOpLock-Integration oder dokumentierte Single-Process-Zusage.
- [REV-PREFLIGHT-3] LOW | Kein Test für zwei gleichzeitige runDepsPreflight-Calls auf demselben Root (Chaining logisch verifiziert, nicht pinnt). | Trigger: nächste Änderung an runDepsPreflight/preflightLocks. | Action required (optional): Promise.all-Test mit Ausführungs-Zähler.
- [REV-PREFLIGHT-4] LOW | beforeExit markiert Gate-Ops als "running" VOR dem Pre-Flight — ein langer npm-Install zeigt Gates als laufend; Lockfile-Heuristik kennt nur package-lock.json (yarn/pnpm/bun bleiben reaktiv). | Trigger: nächste Änderung an Submit-Gate-Reihenfolge bzw. Lockfile-Unterstützung (npm-only per Scope-Entscheidung). | Accepted observation + optionale Reihenfolge-Harmonisierung.
- [REV-FINAL-PF-1] LOW | Lock-Body von runDepsPreflight prüft nodeDepsStale nicht erneut — N Gates am selben Root laufen N× deps-install sequentiell (korrekt, aber redundant). | Trigger: nächste Änderung an runDepsPreflight. | Action required (optional): Double-Checked Locking (Erneut-Check im Body).
- [REV-FINAL-PF-2] LOW | preflightLocks-Map wird nie geleert (Wachstum pro distinct Root über Prozesslebensdauer, praktisch klein). | Trigger: nächste Änderung an preflightLocks. | Action required (optional): Settle-and-delete-current Cleanup.
- [REV-FINAL-PF-3] INFO | Automatischer Pre-Flight ist Scope-Erweiterung gegenüber specs/015 US2 (dort nur Operationen + reaktive Hints); README-dokumentiert, Spec-Addendum empfohlen. | Trigger: nächste specs/015-Bearbeitung. | Action required (optional): AC-Addendum "automatic pre-flight" aufnehmen.
- [REV-FINAL-PF-4] LOW | deps_preflight-Audit-Asymmetrie: Erfolg hinterlässt nur das Start-Event (Outcome steht in recordDownstreamState), Failure zusätzlich failed:true-Event; README dokumentiert nur das Failure-Event. | Trigger: nächste Änderung am Pre-Flight-Audit bzw. README-Abschnitt "Automatic dependency pre-flight". | Action required (optional): terminales Status-Event auch bei Erfolg + README-Satz.

## Getrackte Follow-ups (2026-10-03, Independent Review fe25128 — WIZ-4 workspaceNameHint)

> Review von commit fe25128 (feature/wiz-config-assistant-rework). Verdict: APPROVED,
> 0 offene HIGH/CRITICAL. Folgende LOW/INFO-Findings als Follow-ups getrackt.

- [REV-WIZ4-1] LOW — GELÖST (Review-Fix-Commit, gleicher Branch) | Duplizierte Assertion + irreführender Kommentar im Test "injects the composed default..." entfernt; nur noch eine nextQuestion-Assertion. | — | resolved
- [REV-WIZ4-2] LOW — GELÖST (Review-Fix-Commit, gleicher Branch; Erwartungsbild empirisch geklärt) | Test ergänzt: callTool OHNE arguments-Feld → der SDK-Layer (Protokoll-Validierung, vor unserem Zod-Schema) antwortet isError:true + "MCP error" — Vorab-Verhalten, pinnt der Test jetzt. | — | resolved
- [REV-WIZ4-3] INFO | `workspaceRootDefault` trimmt nur trailing `/`, nicht `\` — ein Windows-artiger Env-Wert (z. B. `D:\repos\`) würde `D:\repos\/hint` erzeugen. Spec-konform (Container-Pfade sind POSIX, kein Plausibility-Check per Variante ii); reine Beobachtung. | Trigger: falls GUIDANCE_WORKSPACE_ROOT künftig auch Windows-Pfade tragen soll. | Accepted observation.
- [REV-WIZ4-4] INFO | `callStart` im Test schließt im finally nur den Client, nicht die Server-Seite des InMemoryTransport-Paars — in vitest harmlos, kann bei langen Läufen Handles akkumulieren. | Trigger: nächste Änderung an den Contract-Test-Helpers. | Action required (optional): `server.close()` ergänzen.

## Getrackte Follow-ups (2026-10-03, Chained WIZ-Workflow session-b1c62520/b22053ef — Workflow-Probleme, Nutzer-Anweisung)

> Kontext: WIZ-4 ist FERTIG (session-b1c62520 completed, Commits fe25128 +
> 0f829ed auf feature/wiz-config-assistant-rework). Der Successor-Cycle
> (session-b22053ef, steps[0]-Duplikat) wurde auf Nutzeranweisung abgebrochen.
> Offene Kette: steps[1..3] = WIZ-2, WIZ-1, WIZ-3 — siehe WF-6.

- [WF-1] MEDIUM (action required — Infrastruktur) — **GELÖST (2026-10-03, feature/wf-followups, Dokumentations-Fix)** | **Clear-Thought-Server antwortete mit Request-Timeouts bei Direktaufrufen:** Diagnose (2026-10-03): Container healthy (`docker ps` + `/health` → ok), Container-Logs über 24 h ohne EINEN Timeout/Error-Record — der Server beobachtet die fehlgeschlagenen Direktaufrufe nie; derselbe `sequential_thinking`-Call über die Container-Route (`call_downstream` serverId `clearthought`) antwortete sofort mit vollem structuredContent. Root Cause liegt damit in der Editor-MCP-Client-Verbindung (Zed Context-Server-Transport zu localhost:3000) — AUSSERHALB unseres Codes/Configs; unsere Downstream-Config (requestTimeoutSeconds 120, reconnect) ist korrekt und live bewiesen. Attribution an den Editor-Client ist eine INFERENZ (Server-Seite gesund bewiesen; revidieren, falls ein zukünftiger Direktaufruf nach Editor-Update klappt). Fix: Container-Route als sanktionierter Pfad dokumentiert — AGENTS.md „Clear-Thought availability (WF-1)“ (hand-geschriebene Sektion, generated Guide-Block unberührt per RB-2, Backup AGENTS.md.bak); die responses.json-Timeout-Policy (Container-Route + einmaliger curl-Fallback) war bereits vorhanden. | — | resolved (documented workaround, sanctioned path) |

- [WF-2] MEDIUM (action required — Infrastruktur/Ergonomie) — **GELÖST (2026-10-03, feature/wf-followups, Guidance-only)** | **Guidance-MCP-Calls timeouten bei langen State-Transitions:** Submit-once-then-poll-Richtlinie verankert: (1) responses.json — verify- und complete-Phase (Example default-guidance + Instanz) tragen die Regel „submit ONCE; timeout → NICHT retryen (Single-Flight-Lock), stattdessen get_workflow_state pollen“; (2) README (server-guidance) — neuer Abschnitt „Long state transitions: submit once, then poll“ mit 1-2-Schritte-Anleitung und Verweis auf die Container-Route-Fallback-Regel; (3) Engine-Semantik bewusst UNVERÄNDERT (synchron; requestId-Ledger macht Re-Submits safe) — async-Job-Pattern bleibt optionaler Follow-up, falls die Poll-Discipline produktiv nicht reicht. | Trigger: kein offener; Regel aktiv ab sofort. | resolved (guidance/ergonomics fix).

- [WF-3] HIGH — GELÖST (Environment-Reparatur in dieser Session, aber Ursache ist repo-übergreifend) | **verify-Gate build failte am Repo-Root:** `npm run build --workspaces` brach mit `tsc: not found` (Exit 127) ab — ALLE 4 Workspaces hatten kein `node_modules/.bin/tsc` (insight, stochastic, clear-thought, guidance); PRE-EXISTING, NICHT durch den WIZ-4-Diff verursacht (guidance-Workspace-Build selbst grün, 559/559 Tests). Fix: `npm install` am Root (hoisted typescript-Bins nach root node_modules/.bin, Root-Build Exit 0). | Restfolge WF-3a: `npm install` veränderte KOLLATERAL `yarn.lock` massiv (2667+/4456−) — reverted; Root nutzt npm (package-lock) UND yarn.lock koexistiert: Instabilitätsquelle. **WF-3b GELÖST (2026-10-03, Nutzerentscheid Option A):** yarn.lock bleibt Quelle der Wahrheit; Verstärkungen umgesetzt: Root-package-lock bereits gitignored (vorhanden), Regel in AGENTS.md ("Root-Installs NUR yarn install; npm nur Workspace-Ebene + npm run; yarn.lock-Diff im Feature-Branch = Review-Warnsignal") + README-Quick-Start-Hinweis. | Trigger: kein offener; Regel ab sofort aktiv. | resolved.

- [WF-4] MEDIUM (action required — Prozesslücke) — **GELÖST (2026-10-03, feature/wf-followups, Guidance-only)** | **final-review-gate mit STALE Evidenz aus Vorgänger-Session:** Die complete-Phase instruiniert den Agenten jetzt EXPLIZIT, `.guidance/state/final-review.json` FRESH je Session zu schreiben — in responses.json (Instanz + Example default-guidance, komplette Pflichtfeld-Liste + Schema-Verweis auf check-final-review.mjs + 40-hex-Anforderung an headCommit/commits + Re-Blessing-Regel nach späten Commits + Validator-Kommando) und als zusätzlicher requiredAction-Eintrag. Offene Design-Frage aus dem Eintrag (b): das Gate bleibt beim headCommit-Vergleich (sessionId-übergreifende Evidenz erlaubt, wenn headCommit == HEAD); strenge sessionId-Matches wären härter, aber der Re-Blessing-Pfad + headCommit == HEAD deckt den beobachteten Fail-Fall („commits landed after the review") deterministisch ab. | Trigger: kein offener; Regel aktiv ab sofort. | resolved (guidance/process fix).

- [WF-5] LOW (action required — Reihenfolge-Falle) — **GELÖST (2026-10-03, feature/wf-followups, Code-Fix gewählt)** | **index-freshness vs. Vitest-Artefakte:** ENTSCHEIDUNG: Test-Tooling-Artefakte werden aus der Frische-Prüfung ausgeschlossen (deterministisch, testbar — statt auf Reihenfolgen-Discipline zu setzen). Root Cause: SKIP_DIRS galt nur auf oberster Ebene (`depth === 0`), nested `servers/*/node_modules/.vite/vitest/results.json` zählte als neueste Quelle. Fix in check-index-freshness.mjs: `isSkipped` prüft JEDES Pfadsegment gegen SKIP_DIRS; der redundante depth-0-Check entfällt; Header-Kommentar aktualisiert. Verifikation: nach `touch` des results.json meldet das Skript weiterhin die echte Quelle, nicht das Artefakt. README dokumentiert die Exklusion + die Ordnungsregel (reindex nach dem letzten Testlauf, direkt vor complete_workflow) als verteidigende Zweitlinie. | — | resolved.

- [WF-6] HIGH (action required — offener Scope + Prozesslektion) — **GELÖST (2026-10-03, Closeout)** | **Chain-Head-Scope-Falle: Successor duplizierte steps[0].** Die WIZ-Kette ist KOMPLETT umgesetzt und auf develop: WIZ-4 (fe25128+0f829ed), WIZ-2 (94ee3be+a42b404), WIZ-1 (f482dc8+7b01463), WIZ-3 (05b0811+b329935) — siehe Abschnitt „WIZ-Serie UMGESETZT" unten. Die Lektion (Head-Request = eigenständiger Scope; steps[0] weglassen oder nichts aus steps unter der Head-Session implementieren) ist in memory-bank/lessonsLearned.md persistiert (Abschnitt „2026-10-03: Guidance-Chained-Workflow-Lektionen (session-b1c62520/b22053ef)", Bullet „Chain-Head-Scope-Falle (WF-6)") — verifiziert 2026-10-03. NACHTRAG (session-2f55537b, feature/wf-followups): konstruktiv gehärtet — (1) Stufe-1-Guard bereits auf develop vorhanden (CHAIN-Replay: request === steps[0].request → configuration_invalid fail-closed, Tests in retry-finalize.test.ts), verifiziert statt neu implementiert; (2) NEU: CHAIN HEAD SCOPE-Annex in guidanceFor für chained Heads (chainFrom === null + steps) sichert die Disziplin-Form der Falle guidance-seitig ab; 4 Regressionstests (8/8 grün); README-Abschnitt "Head-session scope rules". | — | resolved + hardened (fail-closed guard + guidance annex).

## Getrackte Follow-ups (2026-10-03, Config-Assistent-Rework — WIZ-Serie, Anforderungskonkretisierung offen)

> Plan für vier Assistent-Verbesserungen. Umsetzung erst nach Klärung der
> je Eintrag gelisteten offenen Fragen (Nutzer). STATUS 2026-10-03 (abend):
> WIZ-4 UMGESETZT + COMPLETED (feature/wiz-config-assistant-rework,
> fe25128 + 0f829ed, alle Gates grün). WIZ-2/1/3 OFFEN — Wiederaufnahme
> der Kette siehe WF-6 (oben). Feature-Branch, requirements geklärt.

- [WIZ-0] META | Planung/Reihenfolge + Server-Ausfall-Notiz: clear-thought-Reasoning-Server lief im Planungstermin mit Request-Timeouts (2× sequential_thinking) — strukturierte Planung daher inline erfolgt. Reihenfolge-Vorschlag: WIZ-4 + WIZ-2 (klein, autark) → WIZ-1 → WIZ-3 (größter semantischer Impact). WIZ-1 und WIZ-3 ändern beide den Frage-Katalog (`src/setup/ConfigAssistant.ts` + README + Contract-Tests) — nach Möglichkeit in einem Branch zusammenführen, um Merge-Konflikte zu vermeiden. | Trigger: Start der Umsetzung. | Action required: Nutzerentscheid Reihenfolge/Branch-Strategie.

- [WIZ-1] MEDIUM — **Anforderungen geklärt (2026-10-03, Nutzer), umsetzungsbereit** | **target-Mode zusammenführen: `target`-Frage (repo-config vs. registry-edit) entfällt.** Begründung (Nutzer): `registry-edit` alleine ist zweckfrei (erzeugt nur eine Registry-Zeile, ohne dass das Repo nutzbar wird); `repo-config` alleine lässt das Repo unregistriert (`workspace_not_registered`). Zielbild: EIN Assistenten-Durchlauf erzeugt (1) die repo-lokale `.guidance/`-Prozesskonfiguration UND (2) den Workspace-Registry-Eintrag `{ name, root, projectName }` für die Instanz. Die Frage `extraWorkspaces` entfällt ersatzlos (Registrierung passiert pro Repo im selben Lauf); die Frage `workspaceRoot` behält Sinn mit NEUER Bedeutung: Container-Pfad DIESES Repos (z. B. /workspaces/Thinking-MCP) als Registry-`root` statt des Instanz-Roots. Workspace-`name` wird aus `projectName` abgeleitet (Namens-Pattern `^[a-z][a-z0-9-]{0,63}$` muss an `projectName` validiert werden). Umsetzung berührt: `ConfigAssistant.ts` (QUESTIONS target/extraWorkspaces entfernen, workspaceRoot-Help neu, generateFiles: Repo-Dateisatz + Registry-Snippet), scaffold.ts, README ("Path 2" wird zu einem Lauf), Contract-Tests.
  | **Entscheidungen (Nutzer, 2026-10-03):** (1) Der AGENT führt den Registry-Merge aus (generiertes Snippet + Merge-Instruktion in notes[]; Server schreibt weiterhin nie Dateien). (2) Remote-Mode: Registry-Schritt dort entfallen/Hinweis (Registrierung läuft über init_session). (3) Pfad-Existenz-Prüfung ERFOLGT: der Agent muss später auf den Pfad zugreifen können, also validiert der Wizard-/Agent-Flow die Existenz vor der Ausgabe (nicht erst loadConfig). (4) Registry-Schritt optional über ja/nein-Frage — wenn kein Instanz-Root existiert: "Registry existiert nicht — Soll sie initial angelegt werden?" (bei ja: Instanz-guidance.json neu anlegen lassen statt mergen).
  | Trigger: Umsetzungsstart WIZ-1 (nach WIZ-4/WIZ-2 empfohlen). | Action required: Implementierung + Contract-Tests (Merge-Snippet-Form, Pfad-Validierungs-Hinweis, Registry-Initial-Anlage-Zweig).

- [WIZ-2] LOW — **Anforderungen geklärt (2026-10-03, Nutzer), umsetzungsbereit** | **`projectName` automatisch ermitteln und als Vorschlag vorlegen.** Entscheide (Nutzer): **Weg (b)** — serverseitig: neuer optionaler Start-Parameter bei `setup_guidance_start` (z. B. `workspaceNameHint`), den der Agent beim Start mitgibt (abgeleitet aus package.json/Cargo.toml/pyproject.toml `name`-Feld, sonst Repo-Verzeichnisname); der Server bettet ihn als strukturierten `default` ins Question-Objekt `projectName` ein. **Bestätigungspflicht (Variante i):** der Agent antwortet NIE in Vertretung — er legt den Vorschlag dem Nutzer vor; dieser bestätigt oder überschreibt den Namen ("do not answer on my behalf"-Prinzip bleibt gewahrt).
  | Zusatzanforderung (durch WIZ-1): Ableitung muss kebab-case-garantieren (`^[a-z][a-z0-9-]{0,63}$`, `default` reserviert) — Manifest-Namen wie `@paschbaer/guidance` oder `server_guidance` sind zu normalisieren, da der projectName künftig doppelt genutzt wird (project.name + Workspace-Registry-Name). Umsetzung berührt: `register-setup-tools.ts` (Start-Parameter), `ConfigAssistant.ts` (default-Injektion in QUESTIONS/catalogOverview), README-Wizard-Text (Ableitungs-/Bestätigungsregel), Contract-Tests (Hint gesetzt/leer/ungültig).
  | Trigger: Umsetzungsstart WIZ-2 (nach WIZ-4 empfohlen). | Action required: Implementierung.

- [WIZ-3] MEDIUM — **Anforderungen geklärt (2026-10-03, Nutzer), umsetzungsbereit** | **Workflow-Profil `plain`/`spec-kit` entfernen; alle Tools standardmäßig registrieren.** Zielbild: Frage `profile` entfällt aus dem Assistenten; jede Instanz registriert ab Werk den vollen Tool-Umfang (Standard-Workflow + 12 Spec-Kit-Tools, Chain Form A UND B). Die Nutzungs-Entscheidung (ob ein Workflow Spec-Kit-Artefakte verwendet) verlagert sich in den Laufzeit-Kontext des Agenten — keine Setup-Zeit-Entscheidung mehr.
  | **Entscheidungen (Nutzer, 2026-10-03):** (F6=6a) `profile`-Feld in guidance.json VOLLSTÄNDIG STREICHEN (Schema-Exit) — Alt-Dateien mit `profile:"plain"`/`"spec-kit"` müssen ohne das Feld weiter laden (additionalProperties: unknown-field-Toleranz oder explizites Zulassen + Ignorieren, um den CHN-2-Restart-Bruch zu vermeiden). (F7=7b) Chain-Verhalten: BEIDE Formen (A + B) immer zulassen, solange `chain.enabled: true` — die Form entscheidet sich je Kette über die Manifest-Form (steps vs. source), keine Profil-Kopplung mehr. (F8) 12 Spec-Kit-Tools immer im Client-Tool-Listing: akzeptiert (dokumentiert).
  | Umsetzung berührt: `ConfigAssistant.ts` (QUESTIONS profile entfernen, aus DERIVED_IN_ADOPT raus), scaffold.ts/generateFiles (guidance.json ohne profile), loadConfig-Schema (Feld-Exit + Alt-Datei-Toleranz), register-tools/tools-registration (bedingungslose Spec-Kit-Registrierung), Chain-Engine (Form-Freischaaltung von Profil entkoppeln, §12/FR-119-Tests anpassen), adopt-Pfad (Referenz-profil ignorieren statt sperren), Builtin-Template, README, Contract-Tests.
  | Trigger: Umsetzungsstart WIZ-3 (zuletzt in der Serie; größerer semantischer Impact). | Action required: Implementierung + Migrationstest (Alt-guidance.json mit profile lädt), Tool-Count-Update (http-transport-Zählasserts), Chain-Tests für beide Formen ohne Profil.

- [WIZ-4] LOW — **Anforderungen geklärt (2026-10-03, Nutzer), umsetzungsbereit** | **`workspaceRoot` automatisch als Vorschlag vorgeben.** Bedeutung nach WIZ-1: Container-Pfad DIESES Repos (Registry-`root`). Default-Zusammensetzung: `GUIDANCE_WORKSPACE_ROOT + "/" + workspaceNameHint` (z. B. /workspaces + thinking-mcp → /workspaces/thinking-mcp); Repo-Name aus derselben Quelle wie WIZ-2. **Entscheidung (Nutzer): Variante (ii) einfach** — Env gesetzt UND Name vorhanden → Default setzen; sonst keine Vorgabe. Keine zusätzliche Plausibilitätslogik: Abweichungen (Case-Mismatch à la KA-4, abweichender Mount-Name, Repo außerhalb des Pools) korrigiert der Nutzer/Agent über die Bestätigungspflicht; die Pfad-Existenzprüfung aus WIZ-1 (Entscheidung 3) fängt Fehlvorschläge vor der Registry-Aufnahme ab. Umsetzung berührt: `register-setup-tools.ts` + `ConfigAssistant.ts` (default-Injektion in catalogOverview/QUESTIONS, gemeinsam mit WIZ-2-Mechanik), Contract-Tests (Default gesetzt/Env fehlt/Name fehlt).
  | Trigger: Umsetzungsstart WIZ-4 (ERSTER Schritt der Serie, teilt die Namensableitung mit WIZ-2). | Action required: Implementierung.

## 2026-10-03 (Abend): WIZ-Serie UMGESETZT — feature/wiz-config-assistant-rework (Chain session-7876f096, 3 Sessions)

- [WIZ-4] GELÖST (fe25128+0f829ed, session-b1c62520 completed) | workspaceRoot-Default aus GUIDANCE_WORKSPACE_ROOT + workspaceNameHint (Variante ii).
- [WIZ-2] GELÖST (94ee3be+a42b404, session-7876f096 completed) | projectName-Default aus normalisiertem workspaceNameHint (normalizeProjectName: Scope-Strip/Kebab/Edge-Trim); Bestätigungspflicht README-regeln.
- [WIZ-1] GELÖST (f482dc8+7b01463, session-abe752d7 completed) | target/extraWorkspaces-Fragen entfernt; registerWorkspace (Pflicht) → workspaces[]-Merge-Snippet in notes; Existenz-Validierung vor Emission; Remote → init_session-Hinweis.
- [WIZ-3] GELÖST (05b0811+b329935, session-57412c1b completed) | Profil entfernt: Schema-Exit mit Legacy-Toleranz (`profile: true`), alle 16 Spec-Kit-Tools bedingungslos registriert (Tool-Count 24→40), chain Form B entkoppelt.
- [WF-3b] GELÖST (7a4ca41) | Option A: yarn-only Root-Installs (AGENTS.md-Regel + README).
- [REV-FINAL-F3] LOW | validateAdoptReference erzwingt weiterhin legacy profiles/<profile>.json für non-plain Legacy-Referenzen, obwohl generateFiles refGuidance.profile ignoriert — inkonsistente Toleranz. | Trigger: nächster Touch von validateAdoptReference. | Action required (optional): Toleranz anpassen + Test.
- [REV-FINAL-F4] LOW | Stale Wizard-Antwort-Keys (target/extraWorkspaces/profile) werden still ignoriert; alt Answer-Sets failen sauber auf missing registerWorkspace (getestet), aber Stale-Key-Verhalten selbst ungepinnt. | Trigger: nächste Änderung an toAnswerRecord/requireCompleted. | Action required (optional): Test.
- [REV-FINAL-F5] LOW | Legacy workflow.json mit workflow.profile toleriert (Raw-Read), aber ungepinnt. | Trigger: nächste Änderung am Workflow-Load. | Action required (optional): Test.
- [REV-WIZ1-2/3, REV-WIZ3-3, REV-WIZ3-5] LOW/INFO | Wie im Review getrackt (Pool-Namen-Coverage, boolean-Answers-Lockerheit, vestigial if-throw, Form-B-Child-Engine-Brücke PRE-EXISTING CHN-4-Familie). | Trigger: je nächster Touch. | Accepted with rationale.

**Offen:** Merge des Branch nach develop (Review freigegeben, 0 HIGH/CRITICAL); Push; Container-Rebuild für die neue Tool-Oberfläche (40 Tools); WF-1..WF-6 (s.o.) bleiben als Infrastruktur-Follow-ups stehen.

## 2026-10-03 (fault_tree top-gate fix — feature/fix-fault-tree-top-gate, session-a9c2d5b6)

- [FT-AXRAY-DE] LOW | assumption_xray supports German markers (alle, jeder/jede, immer, mindestens, höchstens, wird … müssen) as pattern additions in HEURISTICS or a language layer; note-fix (English-only disclosure) is done in this branch. | Trigger: next touch of assumption-xray.ts HEURISTICS or any i18n request for assumption_xray. | Action required (optional enhancement).
- [FT-CHAIN-DUP] GELÖST | steps[0]-Successor (session-672585e2) als Verification-Only-Zyklus abgeschlossen (0 Changes/Commits, alle Gates grün); steps[1] (Implementierung) nie gestartet — Duplikationsrisiko der Kette damit entwarnit.
- [FT-COMMIT] GELÖST | feature/fix-fault-tree-top-gate committed on the feature branch (push/merge still awaiting user approval).
- [FT-FT-F1] MEDIUM | fault_tree multi-root fallback (>1 unreferenced non-basic gate) silently resolves to the last unreferenced gate — inconsistent with the fail-closed name-ambiguity stage; either enforce uniqueness (error) or expose top_gate_candidates. Behavior is documented in code and pinned by test; no merge blocker. | Trigger: next touch of fault-tree.ts resolution logic or first real multi-root use case. | Action required (design decision, owner decides error vs transparency).

## Tracked follow-ups from feature/severity-gate-review-findings (session-4e869880)

- **REV-GATE-6 / F-05 (LOW, accepted observation)** — Severity gate detects review phases indirectly (any phase with a reason-transition whose valid payload carries findings). With a CUSTOM workflow defining multiple reason-transitions per phase or a findings-bearing non-review phase, the first reason-transition could mis-select the loop target. Unreachable with all shipped workflows (schemas are additionalProperties:false without findings). Trigger point: when a custom workflow.json with multi-reason-transition phases is introduced — then restrict gate to explicit phase ids or per-transition matching. Observation documented in reviewGateReason docstring; no action required now.
- **YARN-LOCK-TRAP (process, mitigated)** — npm ci/install in member dirs or at root drifts/prunes the yarn-managed root tree (root package-lock.json is stale). Trigger point: ANY npm invocation in this repo — check `git diff --stat yarn.lock` and root node_modules sanity (node_modules/.bin/tsc) afterwards; root installs ONLY via corepack yarn. Documented in memory-bank/lessonsLearned.md (2026-10-03).
- **Merge/push of feature/severity-gate-review-findings** — pending user approval (AGENTS.md merge rules: rebase to develop, squash on main).

## Tracked follow-up: FINAL-REVIEW-RELOOP (design gap, accepted 2026-10-03)

- **Finding:** Completion-phase fixes have no re-review cycle. The final-review gate (check-final-review.mjs, beforeExit of `complete`) blocks completion on open HIGH/CRITICAL findings, but there is no reason-transition from `complete` back to `implement` — the agent fixes inside the completion phase and no review phase re-runs over those fixes. Integrity relies solely on the gate's strictness (FR-122 HEAD coverage + recomputed openHighCritical), which invalidates stale evidence but does not review the fix code itself.
- **Trigger point:** Next scope that touches the completion phase, the workflow state machine (WorkflowEngine.selectTransition / completeWorkflowLocked), or final-review gate semantics — owner must implement or explicitly re-schedule then.
- **Proposed design (to be specced):** reason-transition `{ to: "implement", reason: "final_review_changes_required" }` from `complete` (and symmetric `plan` option for plan-level findings), driven by the same blockingSeverities evaluation as the review-phase gate (REV-GATE feature 6b5fb3b); completion then re-enters the full implement → review_and_fix_implementation → verify → complete cycle, giving the fixes a real review pass. Loop counter + audit event pattern reusable.
- **Action required:** yes (design decision documented by user 2026-10-03: the missing review of completion-phase fixes is a problem worth solving).

## Getrackte Follow-ups (2026-10-03, Spec-Kit-Pool-Modus-Wiring — SKP-1)

- **Finding SKP-1 (HIGH):** Spec-Kit-Tools sind im HTTP-Pool-Modus (Container, `GUIDANCE_WORKSPACE_ROOT=/workspaces`, `createConfiguredServer` in `servers/server-guidance/src/server.ts`) nicht funktionsfähig: `discover_spec_kit_feature` liefert `spec_kit_feature_not_found: feature root missing: specs`, weil `registerSpecKitTools` dort ohne `getSessionWorkspace` registriert wird — der Resolver fällt auf Pool-Root `/workspaces` statt Session-Root zurück (`SpecKitEngineResolver.resolve`, `register-spec-kit-tools.ts` L138-144). Der stdio-Einstieg `src/index.ts` L43-49 hat das korrekte Wiring. Live verifiziert (session-67778fe9): Workflow/Phase/`get_spec_kit_status` OK, nur Feature-Discovery bricht.
- **Trigger point:** Jeder Guidance-Workflow im Pool-Betrieb, der Spec-Kit-Discovery/Artifacts nutzt (`discover_spec_kit_feature`, `import_spec_kit_artifacts`, `refresh_spec_kit_artifacts`, `get_spec_kit_status`-Discovery-Pfade). Auch T6-Diskrepanz in `specs/008-multi-workspace/tasks.md` (als [x] markiert, nur stdio-seitig umgesetzt).
- **Resolution:** IMPLEMENTED (255bfd2, feature/speckit-pool-mode-wiring) — see activeContext.md 2026-10-03 entry. Live-verified: discover_spec_kit_feature resolves /workspaces/Thinking-MCP/specs/008-multi-workspace in pool mode. Independent review (sub-agent bd833a54, fresh context): APPROVED, 0 unresolved CRITICAL/HIGH.
- **Status:** closed (fixed). Residual follow-ups: SKP-2 (test wiring-depth gap, MEDIUM) and SKP-3 (SpecKitEngine.ts:221 Windows separator, LOW, pre-existing) below.

## Getrackte Follow-ups (2026-10-03, SKP-1 Review — Sub-Agent bd833a54, APPROVED 0 HIGH/CRIT)

- **SKP-2 (MEDIUM, test-depth gap) — RESOLVED (2026-10-03, chain head session-05e744f9):** tests/contract/speckit-pool-wiring.test.ts boots the server through the REAL HTTP entry (createConfiguredServer with a composed pool fixture), registers workspace B via the protocol, starts a workflow session and runs discover_spec_kit_feature with that sessionId — discovery resolves under the session root. Revert-detection PROVEN (SKP2-T3): with the server.ts wiring commented out the happy-path test FAILS (pool-root fallback), restored it passes. Negative case (unknown sessionId -> documented fallback) covered through the same wiring. Regression coverage complete.
- **SKP-3 (LOW, pre-existing):** SpecKitEngine.ts L221 (discoverArtifacts) `resolved.startsWith(ws + "/")` checks only forward slash, while assertInsideWorkspace (L329-341) handles both separators — a native-Windows host would wrongly reject legitimate feature dirs in importArtifacts. Harmless today (tests + container run Linux).
  - **Trigger point:** Only if the guidance server is ever run natively on Windows (not via WSL/Linux container).
  - **Action required:** Align discoverArtifacts with assertInsideWorkspace's separator handling; or accept as observation with rationale.
- **SKP-3 FINAL CLOSURE (2026-10-04, session-1bdb6fee, feature/speckit-artifact-discovery-integration):** Impact analysis + text search revealed discoverArtifacts was DEAD CODE (never wired since 33255fa) — the tracked failure mode could not occur (importArtifacts reaches its guard via assertInsideWorkspace, which already handled both separators). User decision after joint intention evaluation: **C-Full** — discoverArtifacts fully integrated into importArtifacts instead of deleting: (1) shared `isInsideWorkspace` helper (exported) replaces both duplicated guards — fixes the separator bug AND the drift pattern that caused it; (2) unified traversal replaces the inline file-pattern loop + ad-hoc contracts walk — `checklists/**` artifacts now actually import (closing the declared-but-unfulfilled DEFAULT_ARTIFACTS.checklists gap) and config-provided `dir/**` patterns become functional (previously silently skipped at the old `/**` continue); (3) `relativePath` unified to real relative paths — verified zero migration impact (top-level artifacts keep identical values; snapshots immutable; staleness recomputes only over the active snapshot); (4) dead `patternOf` helper removed. Regression coverage: tests/speckit/artifact-discovery.test.ts (15 tests: separator handling incl. native Windows shapes, checklists import, contracts regression, config dir-patterns, empty-artifact findings, required-missing regression, outside-workspace rejection, staleness round-trip, deterministic ordering). Full suite 74 files / 606 tests green.
- **Review-quality note:** Review executed on worktree HEAD cc30e14 with 255bfd2 as review basis; uncommitted lessonsLearned.md change was outside review scope (process tracking, not product code).
- **SKP-1 FINAL CLOSURE (2026-10-04, session-8a3f5bf4):** SKP-2 gap closed by tests/contract/speckit-pool-wiring.test.ts (8c41768, real HTTP entry via createConfiguredServer pool fixture + revert drill). Full suite 73 files / 591 tests green; live pool-mode discovery re-verified on freshly rebuilt container (root compose --build): /workspaces/Thinking-MCP/specs/008-multi-workspace. Fast-forward merged to develop (develop == merge-base d44fc34, 0/4); feature branch deleted. Caveat: merge safety verified against LOCAL develop ref only — no origin fetch possible from this shell (SSH key passphrase unavailable); push will surface remote drift. Only SKP-3 (LOW, pre-existing) remains tracked.

## RESOLVED: YARN-LOCK-TRAP (fixed with regression coverage, feature/yarn-lock-guard)

- **Resolution:** Mechanical guard implemented — `scripts/check-yarn-lock.sh` (POSIX sh) wired as committed pre-commit AND pre-push hook via `.githooks/` (one-time activation per clone/worktree: `git config core.hooksPath .githooks`). Blocks: staged yarn.lock in Yarn-v1 format or unrecognized (positive+negative Berry detection: v1 header OR missing `__metadata:`/generator header), staged yarn.lock deletion, pruned root tree (`node_modules/.bin/tsc` missing while `node_modules/` exists; fresh clones exempt). Regression coverage: `sh scripts/test-yarn-lock-guard.sh` — 7/7 cases green (berry-pass, v1-block, unrecognized-block, deletion-block, unchanged-skip, pruned-block, fresh-clone-skip). hooksPath verified active on the main checkout; the resolution commit itself passed through the live pre-commit hook.
- **Status:** closed (fixed). Residual discipline note stays in AGENTS.md WF-3: after ANY npm/npx contact expect the guard, or check `git --no-pager diff --stat yarn.lock` — the guard catches the COMMIT, not the working-tree drift before staging (restore with `git checkout -- yarn.lock` is still manual).

## Getrackte Follow-ups (2026-10-04, SKP-3 C-Full Review-Residuen — Sub-Agent a86c3633, APPROVED/BLESSED 0 HIGH/CRIT)

- **SKP-3a (LOW, dedupe-by-path):** importArtifacts dedupes discovered files by path only; a file matching TWO configured type patterns is attributed to the first type in declaration order (old code could emit it under both types). Unreachable with DEFAULT_ARTIFACTS (no overlaps). Trigger point: when a config defines overlapping type patterns and cross-type attribution matters — then dedupe by type+path or document first-wins. Action: required then, observation now.
- **SKP-3b (LOW, multi-pattern semantics change):** a config type listing multiple FILE patterns now imports ALL existing matches (old: first existing candidate only); `artifacts.find(type)` then picks by sorted path, not pattern priority. Unreachable with defaults (one pattern per default type). Trigger point: same as SKP-3a — when a config relies on pattern priority for multi-pattern types, restore first-wins per type or document. Action: required then, observation now.
- **SKP-3c (LOW, double finding for required-but-empty):** an empty required artifact now yields BOTH "artifact is empty" AND "required artifact missing" (old: only the empty finding). Both block validation; message slightly redundant. Trigger point: whenever findings texts are asserted exactly in tests/UI — dedupe by skipping the missing check when an empty entry was recorded. Action: optional polish, no action required now.
- **SKP-3d (LOW, cross-host snapshot portability, pre-existing):** relative() emits host separators; a snapshot taken on Windows restored to a POSIX host reports false "stale" for dir-pattern artifacts. Pre-existing (old contracts walk had the same property); same-host round-trip is correct. Trigger point: only if snapshots become portable across hosts — then normalize relativePath to POSIX separators at snapshot build. Action: required then, accepted now.

- **SKP-3e (LOW, pre-existing, final review 6d009224):** `npx tsc --noEmit` fails with TS2739 in tests/contract/speckit-pool-mode.test.ts:48 (specKitConfig fixture missing maxTasks/maxEntities/maxExcerptBytes) — introduced at base 255bfd2, NOT by this session; vitest does not typecheck, so test suites stay green while the type error persists. Verification blind spot: no typecheck over tests. Trigger point: when `tsc --noEmit` is added to CI/lint gates or the fixture is instantiated with stricter typing — then fix the fixture (add the three fields). Action: required then, accepted observation now.

## Getrackte Follow-ups (2026-10-04, specs/016 Reference-Implementierung — session-62689b13)

- **S016-ADOPT (geplant, Follow-up-Scope):** Mechanismus-Adoption in `server-insight` + `server-clear-thought` (Spec 016 §6 Schritt 2): SSE/Progress-Transport-Helper + Async-Acceptance-Wrapper aus guidance extrahieren und in beiden HTTP-Servern verdrahten. Trigger: Beginn des Adoption-Scope. Aktion erforderlich.
- **S016-RETRY-OP (Akzeptierte Beobachtung):** `retry_operation` ist bewusst NICHT in den Async-Wrapper eingeschlossen (Spec FR-1 nennt submit_*/complete_workflow/run_operation). Falls Praxis zeigt, dass Retry-Läufe ebenfalls Timeouts treffen, nachziehen. Trigger: erneuter Timeout-Bericht zu retry_operation.
- **S016-TYPECHECK (prä-existing, bereits getrackt):** speckit-pool-mode.test.ts SpecKitConfig-Fehler (Commit 7884ba4) — unverändert, nicht durch 016 verursacht.
- **S016-CHAIN-PROGRESS (getrackt, LOW):** Gate-Progress-Hooks sind in submitLocked (beforeExit/beforeEnter/afterExit) verdrahtet, nicht aber in den Chain-Aktivierungspfaden (activateSession/runAfterEnter). Trigger: Progress-Berichte zu Chain-Successor-Aktivierungen oder die S016-ADOPT-Extraktion. Aktion erforderlich im Trigger-Fall.
- **S016-RESTART-TEST (getrackt, LOW, akzeptierte Beobachtung):** F2-Fix (in_flight→interrupted nach Neustart) ist design-verifiziert + typecheckt, aber nicht durch einen automatisierten Restart-Test abgedeckt. Trigger: S016-ADOPT-Scope (dort Restart-Fixture-Test ergänzen).
- **S016-N1 (getrackt, MEDIUM, Re-Bless 2026-10-04):** operation-registry get()/allFor() rufen reconcile() außerhalb des Session-Mutex — Mikrosekunden-Fenster nach einem Re-Boot (stale save kann einen frisch begonnenen Record überschreiben). Fix: get/allFor ebenfalls über mutexFor. Trigger: S016-ADOPT-Scope oder nächster Registry-Touch. Aktion erforderlich im Trigger-Fall.
- **S016-N2 (getrackt, LOW):** mutexes-Map im OperationRegistry wächst unbeschränkt (ein Entry je Session, keine Eviction). Trigger: S016-ADOPT-Scope (Idle-Cleanup/LRU ergänzen).
- **S016-N3 (getrackt, LOW, Coverage-Lücke):** F2-Reclassification und F3-Multi-Group-Cursor haben keinen eigenen Contract-Test (Fixture hat nur ein beforeExit-Gate); Arithmetik per Code-Review verifiziert. Trigger: S016-ADOPT-Scope (Restart- + Multi-Group-Fixture-Tests).

## Getrackte Follow-ups (2026-10-04, S016-ADOPT — session-7e49befd)

- **S016-ADOPT (Resolution):** Adoption in insight + clear-thought umgesetzt (feature/016-adopt-async-sse): shared-workflow als canonical Source of Truth + Vendored Copies mit Hash-Drift-Guard (kein workspace-Package — Docker/npm-ci-Kontext-Constraint, siehe activeContext 2026-10-04). Guidance konsumiert die geteilten Module verhaltensidentisch (615/615). CLOSED (fixed).
- **S016-N1 (CLOSED, fixed):** get()/allFor() reconcilen jetzt UNTER dem Session-Mutex (async); Regression: shared-workflow tests/operation-registry.test.ts (Reboot-Race-Test + Concurrency-Test). Guidance-Call-Site ToolHandlers.ts auf await umgestellt.
- **S016-N2 (CLOSED, fixed):** Mutex-Map-Eviction im Idle-Fall (Identitäts-Check gegen Map-Wert); Regression: Mutex-Eviction-Test (Map leer nach 25 Sessions).
- **S016-RESTART-TEST (CLOSED, fixed):** Restart-Fixture in servers/shared-workflow/tests/transition-protocol.test.ts (in_flight mit altem bootId → failed/operation_interrupted, persistiert, Resubmit erzeugt neuen Record).
- **S016-N3 (CLOSED, fixed):** Multi-Group-Monotonie-Fixture via neuem `createCumulativeGateObserver` (kumulativer Cursor über Gate-Gruppen, nie Restart bei 0; total monoton wachsend).
- **S016-ENV-SQLITE (NEU, prä-existing, environment):** better-sqlite3-Native-Crash beim Worker-Exit in insight tests/contracts/evaluation.test.ts + mcp-surface.test.ts (Node 24/WSL, Statement-Destructor bei RemoveEnvironmentCleanupHook); seed-lessons flaky unter Volllast. Reproduziert auf unverändertem develop. `npm rebuild better-sqlite3` fixt seed-lessons, nicht die anderen zwei. Trigger: wenn insight-Suite als Gate envattet wird oder Node-Version wechselt — dann Node-LTS(22)-Verifikation oder Container-Test-Flow etablieren. Action required then, accepted observation now.
- **S016-ENV-TESTHOOK (Beobachtung, dokumentiert):** Fixture-Hooks EMMS/CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS sind bewusst env-gated (0 = keine Wirkung, mirror guidance's Slow-Gate-Fixture-Ansatz); nicht in README verzeichnet (Test-Infrastruktur, kein Produktverhalten).
- **S016-REVIEW-RESIDUEN (Independent Review 6af65578, 2026-10-04):** F1 (HIGH) Vendored-Drift/CRLF — FIXED (sync + LF, Hash-Guards grün); F2 (MEDIUM) Task-IDs im shared-workflow-README — FIXED (IDs entfernt); F3 (LOW) SSE-Testname präzisiert — FIXED; F5 (LOW) payloadMatches-Assertion in insight-AC2 ergänzt — FIXED. **F4 (LOW, accepted):** schlägt registry.complete()/fail() nach erfolgreichem Handler fehl, bleibt der Record bis zum Prozess-Ende in_flight (F2-Reconcile reklassifiziert beim Neustart); Prod-Wahrscheinlichkeit gering (lokaler File-Write). Trigger: erneuter in_flight-Latch-Bericht in Betrieb/Logs — dann Retry in complete/fail einbauen. **F6 (INFO, accepted):** insight-Registry-Singleton löst EMMS_STORAGE_PATH beim ersten Aufruf auf; spätere Env-Änderungen werden ignoriert (in Tests harmlos, Env wird in beforeAll gesetzt). Trigger: falls Tests den Storage-Pfad dynamisch wechseln müssen.
- **S016-FINAL-REVIEW (Fresh Sub-Agent 5eb3da64, 2026-10-04):** R1 (MEDIUM) insight SSE-Pfad scopete Async-Ops auf "default" statt die MCP-Session (FR-3-Lücke in der Kombi Stufe 2+3) — FIXED mit commit 8efc269ed1eba0a637c3c4aaf1821e2f4f94ab3f (AsyncLocalStorage requestSessionScope, server.ts bindet die bekannte Session-ID in den SSE-Request; Regressionstest: SSE-async-accept → Plain-JSON workflow_status-Poll gleiche Session sieht den Record). **R2 (LOW, accepted):** FR-5 ist SHOULD — SSE-Upgrade keyed bewusst auf progressToken statt Accept allein (406-Trap, FR-9); als bewusste Abweichung in beiden server.ts + READMEs dokumentiert. **R3 (LOW, tracked):** clear-thought Wrapped Set session_save/session_load ist Infrastruktur-Adoption; Stochastic-Tools (mcts/bayesian/mdp) nicht async-fähig. Trigger: erster Timeout-Bericht zu Stochastic-Tools — dann Wrapped Set erweitern. **R5 (INFO, accepted):** clear-thought Registry-Fallback ohne dataDir nutzt ein Prozess-Temp-Dir (Records pro Boot weg); konsistent mit prozesslokalen session-Tools. R4 (INFO, accepted): mapError throw-Konvention fragil, robuster wäre Return-API — bei nächster register.ts-Restrukturierung.

## Tracked follow-ups (schema-drift cleanup, 2026-10-04)
- **F1 (low, pre-existing):** specs/014 FR-1101 states the instance config should contain only version/project/workspaces[]/state, but the live pool-root guidance.json also carries chain/orchestration/security blocks (implementation derives registryOnly from the 5 file-refs only). Trigger point: next specs/014 spec amendment or guidance config-schema change. Action: optional spec amendment — accepted observation until then.
- **F8-optional (low):** pool-root guidance.json is CI-invisible; a bad edit only manifests at next restart. Trigger point: next guidance infrastructure scope. Action: consider a boot-smoke/schema-lint for the pool-root config.
- **External-edit watch (medium, cause unknown):** the niyama workspace entry silently disappeared from the pool-root registry during this session (origin not identified). Trigger point: any future guidance session showing unexpected workspace_not_registered. Action: monitor; if it recurs, investigate concurrent writers to D:\repos\.guidance\guidance.json.

## Tracked Follow-ups (added 2026-10-04, downstream status feature)
1. F2 remote/local get_downstream_status contract divergence (remote-tools.ts flat array + required sessionId vs local unwrap/envelope). Trigger: next scope touching the remote surface or remote mode enablement. Action required: unify wire contract (versioned envelope or same unwrap).
2. F5 get_downstream_status declared-state per-call loadConfig for every workspace (no cache). Trigger: pools with >5 workspaces or status polling. Accepted observation: tiny local files; add mtime cache if cost matters. Also extract duplicated workspaces[] type literal.
3. F6 PRE-EXISTING typecheck error tests/contract/speckit-pool-mode.test.ts:48 (SpecKitConfig missing maxTasks/maxEntities/maxExcerptBytes; last touched 255bfd2). Trigger: next typecheck/tooling scope. Action required: align fixture with current schema.

### Added 2026-10-05 (pm-assistant feature, session-b6820e9b)
4. PM-F4 gate-op description wording drift vs scaffold/example ('... via npm.' vs 'build the project'): cosmetic, deps sync pins do not cover gates. Trigger: next scaffold/template lockstep scope. Action optional: unify wording or extend sync-pin FIELDS to descriptions.
5. PM-NOTES accepted observations: pm detection is agent-side (statelessness); yarn target 4+ documented. No action unless users report yarn-1 repos.

### Added 2026-10-05 (adopt deps-op presets, session: chat/fix-adopt-pm)
6. REGENERATED notes for preset deps ops should include the DISCARDED reference args (custom registry flags etc.) so reviewers need not dig up the old operations.json. Trigger: next ConfigAssistant adoption-note scope (reviewer F1, MEDIUM-adjacent advisory).
7. deps-op regression coverage: deps-reinstall + yarn + type-mismatch cases — deps-reinstall now covered (cf457f2); yarn/type-mismatch verified ad hoc by reviewer, not pinned. Trigger: next touch of config-assistant-extensions.test.ts.

## 2026-10-05 — specs/017 tracked follow-ups
- [OPEN] Spec amendment note (FR-3): $include cycle protection is implemented (classified `include_cycle` error + contract test) but NOT spelled out in spec.md §4 FR-3. Trigger point: next spec.md 017 revision or spec-kit-mode follow-up scope — add one sentence to FR-3 ("include cycles fail closed"). Action: required before spec status is bumped to done.
- [OPEN] FR-10 helper currently exists as `nextFeatureNumber()` (unit-tested) but is not yet exposed through any session-facing tool (no session-created feature directories exist today). Trigger point: when a guidance flow starts creating feature directories — wire the helper there and reuse it (never re-derive the rule).
- [ACCEPTED] Review B F5/F6 (low, 2026-10-05): submission_valid approves the final batch without incrementing its review round (rounds count fix loops, not approvals); a skip across `implement` can lead to a spec_kit_batch_gate reject that the agent resolves by re-submitting implement (recoverable, documented in guidance). Trigger point: revisit if batch telemetry shows agent confusion in spec-kit sessions.
