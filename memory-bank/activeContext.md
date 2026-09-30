# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

## 2026-09-28: Config-Assistant generic patterns (session-2c0c15fe, MERGED: develop @ 42e37bf)
- **Root cause (Niyama-Folge):** der FRESH-Generator selbst war nicht generisch — `buildOperations` (ConfigAssistant.ts) hardcodete den Lint-Op als `npx prettier --check servers/*/src/**/*.{ts,tsx}` (Thinking-MCP-Glob) → exit 2 in jedem Repo ohne `servers/`-Layout. Zweitbefund: Adopt-Klassifikation prüfte Genericität nur über Op-NAMEN (+ kryptische `includes('"repo"')`-Heuristik) — repo-spezifische Args unter generischem Name entkamen dem `[adopted]`-Marker.
- **Umgesetzt:** (1) Lint-Op → `npm run lint` (required:false, aligned mit examples/default-guidance); (2) strukturelle Genericitätsregel (nach Review-Verfeinerung): Preset-Ops werden IMMER aus dem Target-Fresh-Template regeneriert — divergente Ref-Args erzeugen eine laute `REGENERATED … reference args discarded`-Note statt Kopie; nur Non-Preset-Ops werden mit `[adopted — review args/paths]`-Marker kopiert (deckt beide Fehlerichtungen: Glob-Leak UND Scope-Kontamination); (3) Tests: Fresh-Args frei von Repo-Globs + Lint-Shape gepinnt; Niyama-Klasse (mutierter Lint-Args → regeneriert + Note), Builtin-Konvergenz + Builtin-Sync-Pin, Preset-Op ohne Fresh-Entsprechung → nonGeneric; (4) README: Genericity-Rule + npm/npx/sh-Konventionsannahme dokumentiert.
- **Validierung:** ConfigAssistant-Suiten 57/57 grün, tsc --noEmit clean; Guidance-Suite 429/429 grün; Verify-Gates: build (required) GRÜN, lint-Fail = prä-existierender Prettier-Drift in 5 fremden Dateien (TMPL-1), test-Fail = better-sqlite3-musl-dlopen im Container (TMPL-2) — beide required:false, nicht durch diesen Diff verursacht. Independent Review (Sub-Agent): 0 HIGH/CRITICAL; GitNexus-MCP-Timeouts (2×) → grep-Fallback je FR-035.
- **Status:** merged (rebase/fast-forward) in develop @ `42e37bf`, Feature-Branch gelöscht, Index frisch; Niyama-Container-Reparatur bleibt bei NIY-CFG-1/2, Prettier-Drift bei TMPL-1 (remaining-work-plan).
- **Session-Review-Befunde (3, mit Evidence getrackt in remaining-work-plan):** REV-1 FR-035-Fallback-Reihenfolge bei GitNexus-Timeouts (Container-Route für gitnexus nicht konfiguriert — nur clearthought; Klärung Regeltext/Route offen); REV-2 `get_next_task` ohne Spec-Kit-Import wirft `spec_kit_artifact_missing` (reproduziert, auch post-completion); REV-3 `git diff` ohne `--no-pager` → Terminal-Hang (AGENTS.md-Regelverstoß, Lesson ergänzt).

## 2026-09-28: Niyama Guidance-Session session-46a43aeb-6a87-4730-ac64-c73e613ae8d9 abgebrochen (Infrastruktur-Blocker)
- **Kontext:** Session erreichte Phase `complete` nach Task 1 (gesamter C0+C1-Scope); verpflichtende Verification-Ops schlugen umgebungsbedingt fehl. Eigene Änderung (Standalone-.mjs + Markdown) kann build/lint/test nicht beeinflussen.
- **Befunde:** (1) lint exit 2 — Pattern `servers/*/src/**/*.{ts,tsx}` existiert im Repo nicht (Verification-Config aus fremdem Repo-Layout kopiert, vermutlich Thinking-MCP `servers/`-Monorepo); (2) test exit 1 — `Cannot find module @rollup/rollup-linux-x64-musl` (Guidance-Container `/workspaces/Niyama`, pnpm-Store unvollständig/musl-inkompatibel). Keine der beiden Ops ist agent-invocable → nicht nachführbar.
- **Entscheidung:** `report_blocker` (Kategorie infrastructure) gesetzt, dann `cancel_workflow` (status: cancelled) statt `complete_workflow` — Completion wäre unehrlich; betroffene Tasks NICHT als verified markiert.
- **Follow-ups:** vor nächster Batch-Session (1) Lint-Glob in der Verification-Config des Guidance-Containers korrigieren, (2) pnpm-Store/Container-Mount reparieren, (3) komplette Verification-Config auf weitere fremde Repo-Pfade/Mounts auditieren. Danach frische Session pro Task-Batch; verbleibende C0-Tasks laufen dort (nicht in der abgeschlossenen Session — Lifecycle-Gates wären umgangen).

## 2026-09-28: Independent Review RID-1 (develop fbd5bdc) — CHANGES REQUIRED
- Scope: `git show fbd5bdc` (RID-1 requestId-Replay-Hardening), Amendment 006. Snapshot verifiziert: develop @ fbd5bdc, Review-Basis = Commit-Diff (unstaged: nur memory-bank/SDD-Doku).
- Verifiziert gegen Source: Replay-Marker + Clone (Cached-Original nie mutiert, Regressionstest), Replay-Check vor Phasen-/Schema-Checks in submitLocked UND completeWorkflowLocked (korrekt: Reuse erzeugt nie eine Submission), withLock-Serialisierung + MEDIUM-3-Successor-Race unbeeinträchtigt (Clone erhält nextSessionId), omitted-config-Defaults (submission absent → warn; requestPayloadHashes absent → Replay ohne Mismatch-Evaluation), fail-closed Policy-Validierung, Metric genau 1×/Replay. Tests: requestid-replay.test.ts 8/8 grün (lokal nachgeführt), tsc --noEmit grün.
- Befunde: RID-2 MEDIUM (Hash-Poisoning bei fehlgeschlagenem Completion — First-Seen-Hash vor Outcome gespeichert, nie überschrieben → falsche payloadMismatch/fälschlicher Reject legaler Retries), RID-3 LOW (Metric nach Throw — payloadMismatches unter reject-mismatch immer 0), RID-4 LOW (Replays unauditiert), RID-5 INFO (undefined-Kollision in stablePayloadHash, wire-seitig unerreichbar), RID-6 INFO (fehlender Completion-Replay-Test als akzeptierte Abweichung bestätigt). Details + Trigger in remaining-work-plan.md.
- Open HIGH/CRITICAL: 0. Verdict: CHANGES REQUIRED (RID-2 fixen, dann re-review).

## 2026-09-28: RID-1 requestId-Replay-Hardening implementiert (session-dcd3ddc5, develop fbd5bdc)
- **Umgesetzt:** (1) Replay-Marker (replayed/duplicateOf/warning auf geklontem Result, Original nie mutiert — Amendment-002-Successor-Race sicher); (2) Payload-Hash (SHA-256 über sortiertes JSON, session.requestPayloadHashes) + Policy policies.submission.requestIdReuse warn|reject-mismatch (fail-closed Validierung, neuer ErrorCode requestId_reuse_payload_mismatch); (3) Metric requestIdReplays {total,payloadMismatches} in get_metrics; (4) 8 Contract-Tests + Error-Code-Snapshot; (5) Doku: README submit_* + specs/002/amendments/006.
- **Validierung:** Worktree-Suite 228/233 grün (5 = bekannte final-review-gate-Worktree-Artefakte), Haupt-Checkout nach Merge Vollsuite grün (233/233 reale Tests), tsc clean.
- **Vorfall:** Fremder Agent setzte während der Implementierung WorkflowEngine.ts im Haupt-Checkout auf HEAD zurück (RID-1-Edits verloren) und modifizierte SDD/guidance-mcp-specification-v2.md (fremde Änderung, unberührt gelassen). Arbeit in Worktree worktrees/rid1 isoliert neu aufgebaut und von dort gemerged — Parallel-Work-Lesson erneut bestätigt.
- **Grenzen (Amendment 006 §4):** Pre-RID-1-Sessions ohne Hash durchlaufen warn ohne payloadMismatch-Bewertung; Completion-Replay-Test im Harness nicht erreichbar (repository-analysis required:true).

## 2026-09-28: FR-035-Container-Route — Review-Runde 1 gefixt (worktree fr035-fix, 34b029c)
- Independent Review (Sub-Agent, CHANGES REQUIRED, 1 HIGH): F1 SSRF-Bypass (stdio + containerRoute übersprang Allowlist) → behoben (Block vor Transport-Typ-continue, 2 Regressionstests); F4 Timeout-Guard, F5 recordConnection im Fallback-Pfad → behoben; F2 → FR-611 auf Wisdom-Baseline re-gescope't (Follow-up CR-1 in remaining-work-plan); F3 Engine-Test-Debt → getrackt (CR-2, GDS4-Konfliktvermeidung). Zielgerichtet 110/110 grün, tsc clean; Full-Suite im Worktree: 7 Umgebungsartefakte (final-review-gate vs. Windows-.git-File im Container; im Haupt-Checkout grün).
- **Prozess-Anmerkung:** GDS4-Agent arbeitet parallel im Haupt-Checkout (HEAD auf feature/gds4-expose-op-content, uncommittete WorkflowEngine-Änderungen) — Review-Fixes bewusst im separaten Worktree committet; Merge/Rebase nach GDS4-Abschluss.

## 2026-09-28: FR-035-Amendment „Container-Route vor lokalem Fallback“ (session-1afb793f, feature/fr035-container-route)
- **Scope (Nutzerentscheid):** Textregel + maschinell; FR-035 amendiert (Amendment 005 in specs/002); RID-1 folgt separat.
- **Umgesetzt:** (1) FR-035-Text in responses-wisdom.json + live .guidance/responses.json auf Reihenfolge retry → Container-Route → lokal → report_blocker (7 Phasen je Datei); (2) `containerRoute`-Feld in downstream-servers.json (fail-closed Validierung + SSRF-Allowlist + ${ENV}-Header in config.ts), Template + Live-Config für clearthought befüllt; (3) Engine-Fallback: EIN automatischer Versuch über containerRoute bei read_only-Timeout (ClientManager.invokeOnTransientHttpRoute + Gate in WorkflowEngine.buildInvokerClosure), Metric containerRouteFallbacks in get_metrics; (4) Tests tests/contract/container-route-fallback.test.ts (11) — Suite 221/221 grün, tsc clean; (5) Doku: README downstream-Attributtabelle + specs/002/amendments/005.
- **Live bestätigt:** reasoning-pass über Container-Route erfolgreich, während direct-MCP gestern 2× timeoutete — die neue Regel ist genau der bewährte Workaround.
- **Offen (nächster Schritt):** RID-1-Session nach Merge dieses Scopes starten; Refresh der Workspace-Configs (Niyama) auf den neuen Template-Stand.

## 2026-09-28: requestId-Reuse-Stall (Niyama session-46a43aeb) — Diagnose + Prävention
- **Befund:** `WorkflowEngine.submitLocked` (~L1617) replays still das gecachte Result bei bereits registrierter requestId — 3× `accepted: true` ohne Phase-Advance in review_and_adjust_plan. Fix: Resubmission mit frischer requestId (`req-plan-review-adjusted-c0c1`) → sofort `implement`.
- **Umgesetzt:** Lesson in memory-bank/lessonsLearned.md (Avoid-These-Mistakes + datierter Eintrag); Hardening-Plan RID-1 in memory-bank/remaining-work-plan.md; Regel-Satz „Submission idempotency …“ in beide Config-Assistant-Templates (examples/default-guidance/responses-wisdom.json + responses.json, alle 6 Submission-Phasen, JSON-Validierung grün).
- **Offen:** Live-.guidance/responses.json bestehender Workspaces (u. a. Niyama /workspaces/Niyama/.guidance) enthalten die Regel noch nicht → bei nächster Gelegenheit via setup_guidance_generate neu generieren oder hand-nachziehen; Server-Hardening (RID-1) umsetzen, siehe remaining-work-plan.

## 2026-09-26: Kleinkitems L256/L257/L253 (Guidance-Chain session-3b7f96a5)
- **L256 FTS-Coverage (GELÖST):** `observations_fts` (FTS5, 500-Zeichen-Cap) + Insert-Trigger + Count-Guard-Backfill in `SqliteAdapter.init()`; `searchFullText` matcht beide Indizes (Dedupe bei Dual-Match). Tests `tests/contracts/fts-observation-coverage.test.ts` (7).
- **L257 Postgres-FTS-Parität (GELÖST, Contract-Level):** `searchFullText` → sanitisierte AND-`tsquery` über goal_summary + Observations-Auszüge, INNER→**LEFT** JOIN signatures (2026-09-22-Bugklasse im zweiten Backend behoben), GIN-Expression-Indexe; SQL-Contract gepinnt in `tests/contracts/postgres-fts-parity.test.ts` (5). Offen: Live-Smoke-Test bei erster `EMMS_STORAGE_BACKEND=postgres`-Aktivierung.
- **L253 Prompt-Sync (OBSOLET geschlossen, User-Entscheid Option 3):** keine Ziel-Repos mit Kopien/Referenzen vorhanden; Verteilung über Paket/Smithery.
- Verifikation: 118/118 Tests, tsc, build grün. Independent Review (Sub-Agent): APPROVED, 0 HIGH/CRIT; MED (Backfill-Kosten) + 2 LOWs im Review behoben; F3–F6 als tracked follow-ups. GitNexus-Index frisch (analyze --no-stats). Lessons geseedet (`.guidance/state/session-lessons.json`): pg-search-fulltext-ilike-inner-join-parity-trap, sqlite-fts-backfill-per-init-quadratic-cost.
- **Final Review (Fresh Sub-Agent dd5ee20f, nach Parallel-Agent-Abschluss):** APPROVED, **0 HIGH/CRITICAL**, 12/12 Fokus-Tests; Session-Code inzwischen committet (HEAD 60b2eddf); neues F1-LOW (Orphan-Observation → Count-Divergenz) zusammen mit F2/F4–F6 als tracked follow-ups persistiert. Index-freshness-Race bei Parallel-Work als Prozess-Follow-up getrackt.
- **Prozessregel verankert (2026-09-26):** "Completion-Gate vs. Parallel-Work" in AGENTS.md (Guidance-Sektion) ergänzt — Backup `AGENTS.md.bak`; Clear-Thought-Konsistenzprüfung versuchte 3× (Server-Timeouts) → manuelle Prüfung dokumentiert (komplementär zu GitNexus/Branch-/Memory-Bank-Regeln, rein restriktiv). Tracked follow-up geschlossen.
- Kontext: Session auf `feature/production-hardening` — die dirty-Dateien unter `servers/server-guidance` gehören zu einem PARALLELLEN Work-Stream und wurden nicht angefasst.

**Last updated:** 2026-09-26

## 2026-09-26: Final-Review Feature 003 (develop @ ec924f6, kompletter Session-Diff 16c6f1e..ec924f6)

- Snapshot: develop @ ec924f6, clean (bis auf diese Review-Notiz); Diff
  4 Commits gelesen (77fa854/a457329/b6edcee/ec924f6) + current source.
- Verifikation: Suite 268/268 (RUN_PY_E2E=1) ✓, tsc clean ✓, build OK ✓.
- Fix-Commit b6edcee geprüft: R-004-Stale-Lock-Recovery vorhanden, aber mit
  neuem MEDIUM R-011 (Steal-TOCTOU, nicht-atomares unlink+recreate) und LOW
  R-012 (TTL-vs-Timeout, EACCES-Code, Testlücken des neuen Codes) — getrackt
  in remaining-work-plan.md. R-005 (Denial-Audit) korrekt, SC-002 erfüllt;
  R-009 README konsistent mit PolicyEngine; R-007/R-007-Fix (Merge +
  memory-bank) erledigt.
- Offen: 0 CRITICAL, 0 HIGH, 1 MEDIUM (R-011), 3 LOW (R-012a-c). Kein reviewed
  Code geändert.

## 2026-09-26: Post-Commit-Review 77fa854+a457329 (independent, spec 003)

- Snapshot: feature/guidance-toolchain-bootstrap @ a457329, clean; Review-Basis
  git show beider Commits + current source. Suite 267/267 im
  guidance-bootstrap-test-Image bestätigt; RUN_PY_E2E=1 4/4; tsc clean,
  build OK; manueller uv-sync-0.12.19-Repro OK.
- Ergebnis: 0 CRITICAL, 1 HIGH (R-004 Stale-Workspace-Lock ohne Recovery),
  3 MEDIUM (R-005 SC-002-Denial-Audit, R-006 E2E-Abdeckung vs T008,
  R-007 T013-Checkbox premature), 2 LOW (R-008, R-009) — Details + Trigger
  in remaining-work-plan.md ("Getrackte Follow-ups 2026-09-26, Post-Commit-
  Review 77fa854+a457329"). Kein Code geändert.

## 2026-09-26: Workflow-Konfiguration — Final-Review-Pflicht in complete-Phase

- `.guidance/responses.json` (complete): pflichtiger abschließender Review
  über ALLE Tasks der Session in einem frischen, authorship-excluded
  Subagenten (Evidenz-Table je Finding, explizite HIGH/CRITICAL-Zählung,
  Fokus Cross-Task/Speckonformanz/Fail-Closed/Boundary/Coverage).
  HIGH/CRITICAL → fixen vor Completion; Rest → Findings-Lifecycle-
  Persistierung; Outcome im Completion-Report referenzieren. Backup:
  `responses.json.bak`. Container neu gestartet (/health ok). Clear-Thought-
  Server timeouts — Verträglichkeitscheck manuell dokumentiert (Deviation).

## 2026-09-26: Final Comprehensive Review CHN-1..6 (bb37f6c) — APPROVED, 0 HIGH/CRIT

- Authorship-excluded Review über eb99873..bb37f6c (4 Commits, develop).
  Snapshot: develop @ bb37f6c, ahead 5, working tree clean bis auf
  intentionales `.guidance/responses.json.bak` (Backup-Protokoll).
- Verifikation: 251/251 Tests grün (inkl. chain.test.ts 18/18, WSL/nvm);
  CHN-1..6-Fixes einzeln gegen den Quellcode verifiziert; Spec v1.1
  FR-110..FR-119 + §12 end-to-end geprüft; Fail-Closed-Invarianten intakt
  (`getSession` wirft chain_activation_incomplete; Recovery nur via
  retry_operation mit vollständiger Aktivierung — kein Gate-Bypass).
- Cross-Task-Interaktionen geprüft: CHN-1 × CHN-5 (beide Pfade hängen am
  Successor-Lock + status==='activating'-Recheck ⇒ keine Doppel-Aktivierung);
  CHN-3 Cursor-Semantik (upNext=steps.length) konsistent; CHN-4 chain_end
  Audit nur beim stillen Form-B-Ende, keine Überschneidung mit chain_failed.
- 0 HIGH/CRITICAL offen. 4 neue Akzeptanzen/NITs getrackt: CHN-R2-1 (LOW,
  Replay-Staleness 'activating'-Entry), CHN-R2-2 (LOW, Testlücke Mixed in
  plain), CHN-R2-3 (NIT, Recovery ohne FR-043-Reconciliation), CHN-R2-4
  (NIT, memory-bank-Hygiene) → remaining-work-plan.md.
- Merge-Empfehlung: develop bereit; für main später Squash + Container-
  Image-Rebuild im Lockstep mit guidance.json (CHN-2-Lektion) wiederholen.
- CHN-R2-2 SOFORT geschlossen (Commit `7cb55be`): Test „mixed manifest in
  plain profile rejected entirely“ (chain.test.ts 19/19). CHN-R2-1/3/4
  bleiben akzeptiert getrackt. Serien-Fazit: 4 Guidance-Workflows
  (CHN-1, CHN-2, CHN-3, CHN-4/5/6) alle completed, gemerged, Branches
  gelöscht; develop ahead 6.

## 2026-09-26: Independent Review CHN-3 (Mixed-Manifeste) — 1 HIGH offen

- Authorship-excluded Review-Pass über den uncommitteten Diff (Scope:
  register-tools.ts chainManifest, WorkflowEngine.ts validateChainManifest /
  resolveChainStep / completeWorkflowLocked, Spec §12/FR-119, README,
  chain.test.ts). Snapshot: feature/chn-3-mixed-chains, HEAD == develop
  49a18bc, Branch hat NULL Commits — alles uncommitted.
- **1× HIGH (CHN-3-R1):** Form-B-Schritt setzt den Form-A-Cursor zurück
  (`upNext: 0` → `chainUpNext = 1`): bei `steps.length >= 2` + `source`
  wird `steps[1]` nach jedem Task erneut ausgeführt bis
  `chain_depth_exceeded`. Reproduziert (temporärer Vitest, danach
  entfernt); bestehender Mixed-Test nutzt nur 1 Step ⇒ Bug unsichtbar.
  Details + Fix-Richtung: remaining-work-plan.md [CHN-3-R1].
- **1× MEDIUM (CHN-3-R2):** Review-Scope-Abweichung — 25 weitere Dateien
  mit substanziellen uncommitteten Änderungen außerhalb des deklarierten
  Scopes (u. a. SpecKitEngine.ts +755). Getrackt in remaining-work-plan.md.
- LOW (beobachtet, nicht getrackt als Blocker): Engine akzeptiert
  `steps: []` (stillschweigend als reines Form B), während das Zod-Schema
  via `.min(1)` ablehnt — nur per Engine-Direktaufruf erreichbar;
  README-Guardrail-Zeile maxStepsPerManifest nennt nur Form A.
- Verifikation: chain.test.ts 16/16 grün; Gesamtsuite 249 passed
  (250 mit Review-Repro) — 249/249-Claim bestätigt; `npm run build` grün.

## 2026-09-25: Pre-Merge-Review Workflow-Chaining (0 HIGH/CRITICAL offen)

- Frischer Review-Agent über den semantischen Diff: 3×MEDIUM, 3×LOW, 1×NIT;
  **0 HIGH/CRITICAL**. Verifiziert gegen Source, vier behoben (mit
  Regressionstests, chain.test.ts jetzt 12 Tests / 245 gesamt grün):
  MEDIUM-1 (Form-B featureId aus Taskliste verworfen), MEDIUM-3
  (Concurrent-Replay doppelt Aktivierung → Successor-Lock + In-Lock-Recheck),
  LOW-4 (Depth-Gate vor Erschöpfung → falsches chain_depth_exceeded),
  LOW-5 (Zod max(16) hardcodet → Engine-Gate autoritativ).
- Akzeptiert + getrackt (remaining-work-plan): CHN-4 (stille Form-B-Brücke),
  CHN-5 (Replay-Cache ohne chain-Entry im Crash-Fenster), CHN-6
  (Pre-Aktivierungs-Guidance-Snapshot).

## 2026-09-25: GUID-3/4/5-Workflow (erster Lauf mit Feature-Branch-Policy, completed)

- Erster Workflow-Lauf mit der neuen implement-Regel: Branch-Check +
  Feature-Branch `feature/guid-345-template-env-shell` (ohne Worktree),
  Commits je Task, Merge ff nach develop, Branch gelöscht — Commit-Policy
  erstmals produktiv.
- GUID-3 CLOSED: Template-Resolution in OperationEngine (`ctxFor` →
  templateVars session.request/project.name, tiefe ${token}-Resolution,
  fail-fast bei unbekannten Tokens; mode:fixed literal; Behavior-Change in
  README dokumentiert).
- GUID-5 CLOSED: env + shell für Prozess-Operationen (spawnSync, Validierung
  in config.ts); eigene operations.json auf env umgestellt (sh -c entfällt).
- GUID-4 CLOSED: Schema-Load-Regression über public API + Source-Scan gegen
  bare-require (2 neue Testdateien). Verifikation: 230/230 + 9 neue = grün,
  detect_changes critical klassifiziert (Startup-Pfade).
- GUID-7 NEU: umschaltbares workspaceRoot (Worktree-Gates) getrackt.
- Live-Erkenntnis: Image-Rebuild nötig nach Engine-Änderungen — alter Image
  ignorierte env-Felder (capture-Gate localhost-Fail), nach Rebuild grün.

## 2026-09-25: Workflow-Chaining-Spec (Amendment 002, APPROVED)

- Design-Session „Chaining ohne Nutzerinput" abgeschlossen: Analyse ergab,
  dass Phasen-Ketten im plain-Profil heute schon autark laufen, aber
  Workflow-zu-Workflow-Ketten fehlen.
- Entwurf als
  `specs/002-guidance-workflow-server/amendments/002-workflow-chaining.md`
  persistiert (Status APPROVED, FR-110…FR-116, Q1–Q3 durch Nutzer
  entschieden).
- Kern: `chain`-Manifest bei `start_workflow`, lazy Successor-Creation in
  `completeWorkflowLocked`, Response-Felder `nextSessionId`/`chain`;
  Kopf-Kopie der Restkette (Q2); Template-Fehler ⇒ keine Successor-Creation,
  Vorgänger bleibt completed (Q1-Präzisierung).
- **Q3 revidiert (Nutzer):** `spec-kit` lehnt `chain` NICHT ab — neue Form B
  `chain.source: "spec_kit_tasks"` (FR-117/FR-118, §11): abhängigkeits-
  geordnete Taskliste aus `speckit.tasks` als Chain-Quelle, ein voller
  Workflow (mit Verify-Gates) pro Task; State-Brücke via optionaler
  `specKitTasks`-EngineDeps-Callback.
- Implementierung noch NICHT begonnen; Touchpoints in Spec §8 (WorkflowEngine,
  types, config, template-resolver, register-tools, tests, Docs).

## 2026-09-25: Nachfragen-Kultur (3. Guidance-Workflow, completed — volle Duty-Compliance)

- Session `session-58872e83…` → **completed**; erster Lauf mit ALLEN vier
  Clear-Thought-Duties envelope-pflichtig und erfüllt (sequential_thinking,
  issue_tree + decision_framework, assumption_xray + Probing,
  metacognitive_monitoring 0.85).
- responses.json: Kern-Satz (Chat-Fragen vor Absenden + Feld-Referenz +
  Blocker-Faustregel) in allen 6 Nicht-verify-Instructions; Feld-Mapping:
  understand/plan→openQuestions, review_plan→remainingConcerns,
  implement→unresolvedIssues+deviations, review_impl→unresolvedFindings,
  complete→deferredWork/nextSteps. verify bewusst ausgenommen.
- plan.schema.json: openQuestions ergänzt. README: Operating-Note 'Asking
  questions' (Commit 0b3fd42).
- Neue EMMS-Episoden (via Capture-Gate geseedet):
  gitnexus-detect-changes-misses-fresh-edits (detect_changes-Anomalie
  beobachtet, kompensiert), guidance-schema-validator-caches-per-session.

## 2026-09-25: Capture-lessons-Integration (2. Guidance-Workflow, completed)

- Session `session-1bb1d9c2…` → **completed**; `repository-analysis`-Gate
  zum zweiten Mal produktiv grün.
- `store-completion-insight` entfernt (GUID-2 → subsumed); neu:
  **`capture-session-lessons`** (blocking Prozess-Gate, sh -c +
  seed-lessons.mjs gegen Insight, idempotent) — Lessons-File-Vertrag:
  Agent schreibt `.guidance/state/session-lessons.json` VOR complete_workflow
  (leeres Array = No-Op; Redaction beim Agent).
- Plan-Abweichung dokumentiert: OperationEngine spawnSync hat keine env-
  Option → sh -c-Inline-ENV; als GUID-5 getrackt (env-Feld + Test).
- Verifiziert: Live-Seed 2/2 + Idempotenz (2 duplicate, 1 seeded, exit 0),
  experience_search-Round-Trip, 4× JSON-Validierung, build-Gate grün
  (lint/test optional-failing aus bekannten Ursachen).
- Commits: `2e72c9a` (Config + README). Neue EMMS-Episoden:
  guidance-config-snapshot-per-session, guidance-template-placeholders-
  unresolved, guidance-process-operations-no-env-support.

## 2026-09-25: GUID-1-Lauf — Gates produktiv, 2 echte Bugs aufgedeckt

- Erster echter Workflow-Lauf (Zed-Agent, Docs-Change): **build-Gate grün**
  nach Container-Deps-Install (`npm install --include=dev --ignore-scripts
  --script-shell=/bin/true` im isolierten Volume; corepack-yarn crasht auf
  alpine, NODE_ENV=production skippte devDeps, prepare-Scripts laufen trotz
  ignore-scripts). lint/test (optional) failen bekannt/toleriert (prettier
  pre-existing; @rollup/rollup-linux-x64-musl optional-deps-Bug).
- **Bug 1 (gefixt, `5316c88`)**: bare `require` in `createRequireShim()`
  (ESM) — ReferenceError bei jedem submit_*; statischer createRequire-Import;
  215/215 Tests; Lesson rezidivierend dokumentiert; Regression-Coverage
  offen → GUID-4.
- **Bug 2 (getrackt, GUID-3)**: Template-Platzhalter (`${project.name}` u.a.)
  werden nie aufgelöst — Gate lief mit literalem Repo-Namen. Workaround:
  hartcodiert in operations.json (Backup .bak), wirkt erst nach Container-
  Restart (Config-Snapshot im Session-State). Restart erfolgt.
## 2026-09-25: WORKFLOW COMPLETED — GUID-1 geschlossen

- Finaler grüner complete-Lauf: `repository-analysis` **succeeded**
  (check `{repo:"thinking-mcp"}` nach GUID-3-Workaround + Container-Restart).
  Session `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` → **completed**.
- Scope: README.md Quick-Start-Abschnitt verbessert (docs-only, Zeilen 17–45).
- `store-completion-insight` failed (nicht-required, toleriert) — siehe GUID-2.
- Offen: GUID-3 (Template-Engine-Fix), GUID-4 (Regression-Test), GUID-2
  (store-completion-insight-Args).

## 2026-09-25: GUID-1-Vorbereitung — GitNexus-Docker (:4747) an repo angebunden

- `C:\Users\AlexanderPaschold\source\repos\GitNexus\docker-compose.override.yaml`
  angelegt: Repo RO unter `/thinking-mcp`, nur `.gitnexus/` RW (geteilter Store
  mit WSL-CLI, beide 1.6.8). Fallstricke: `/workspace`-Base-Mount ist RO →
  kein Unter-Mount möglich; MCP-HTTP-Server expose't **kein analyze-Tool**
  (nur Query-Tools); Indexierung läuft per CLI im Container
  (`gitnexus analyze --no-stats`, einmalig + bei Bedarf host-seitig).
- Erst-Indexierung erfolgreich: 4.506 Nodes / 10.117 Edges / 199 clusters.
  `check {repo:"thinking-mcp"}` über HTTP verifiziert (Nebenbefund: 1
  Import-Zyklus lesson-service.ts ↔ adapter.ts in server-insight, pre-existing).
- Gate `repository-analysis` umgestellt: composite firstAvailable —
  (1) mcpTool `check` {repo:${project.name}} (HTTP), (2) Prozess-Fallback
  `gitnexus analyze --no-stats` (stdio-Deployments); riskClass jetzt
  read_only; Allowlist auf existierende Tools gekürzt. Commit `5f8b2eb`.
- **Verbleibend für GUID-1:** Nutzer startet echten Workflow-Lauf im Zed-Agent
  (context_servers-Eintrag + kleine Aufgabe); Agent führt die Phasen,
  `complete` feuert das Gate erstmals produktiv.

## 2026-09-25: Merge beider Guidance-Feature-Branches nach develop + Review

- Fast-Forward-Merge `7b8e5d5 → 5ced680` (deckt `feature/guidance-workflow-setup`
  und `feature/guidance-http-downstream` ab, lineare History); develop ahead 3
  gegenüber origin/develop.
- Post-Merge-Review von `e601515` (einziger Code-Touch) gegen aktuellen Stand:
  Config-Validierung (stdio/http-Union, URL-Check), fail-closed Allowlist
  (Pflicht sobald ein enabled http-Server existiert), `${ENV}`-Resolution **nach**
  configVersion-Hashing (Secrets im Hash-freien Bereich), Legacy-stdio ohne
  `type` bleibt kompatibel, WorkflowEngine-Transportauswahl korrekt.
- Tests (WSL, nvm node): guidance typecheck grün + **206/206**; Full Suite
  **521/521** (clear-thought 166, guidance 206, insight 106, stochastic 43).
- Branches gelöscht (beide gemerged). Push auf origin/develop erfolgt
  (2026-09-25). GUID-1/GUID-2 bleiben getrackt.

## 2026-09-24: Guidance für Zed-Agent eingerichtet (feature/guidance-workflow-setup)

- `.guidance/` im Repo-Root angelegt (aus `servers/server-guidance/examples/default-guidance/`,
  Version 2, Profil `plain`, Standard-Flow understand → … → complete).
- Anpassungen: `project.name=thinking-mcp`; Gates `lint` (prettier --check) und
  `test` (npm test) auf `required:false` (Container/Windows-Caveats, siehe ops-Beschreibungen);
  `repository-analysis` auf `required:false` — Downstream-MCP ist **stdio-only**
  (ClientManager.ts), im Docker-Container sind gitnexus/insight nicht erreichbar;
  Downstream-Server gitnexus/insight daher `enabled:false` dokumentiert.
- `servers/server-guidance/docker-compose.override.yml`: Repo als `/workspace`
  gemountet, isoliertes Volume `guidance_node_modules` schützt die Windows-
  node_modules; kein Bearer-Token (loopback, Nutzer-Entscheid).
- `.gitignore`: `/.guidance/state/` ergänzt.
- Verifiziert: `docker compose up -d --build` → `/health` `configured:true`,
  `/mcp` POST → 200, Startlog clean.
- **Nachtrag — HTTP-Downstream aktiviert** (nach Retrofit von
  `transport.type:"http"` im ClientManager): gitnexus (host.docker.internal:4747/api/mcp)
  und insight (:3002/mcp) enabled, `policies.egress.httpHostAllowlist` gesetzt
  (fail-closed-Pflicht), `repository-analysis` wieder `required:true` (AGENTS.md-Gate),
  Insight-Ops auf echte Tool-Namen (`experience_search` + `scope_id`-Template /
  `experience_record_observation`) umgestellt. Image-**Rebuild** war nötig (altes
  Image kannte den http-Zweig nicht → „not connected“). End-to-End verifiziert:
  `start_workflow` → `query-project-insights: succeeded`. Offen: erst echter
  `complete`-Durchlauf exerziert `repository-analysis` (gitnexus); automatisierter
  Regressionstest für stateful-Downstream-Sessions bleibt Follow-up (CI kann
  Live-System nicht adressieren). **Getrackt:** GUID-1 (erster echter
  `complete`-Lauf exerziert das gitnexus-Gate) und GUID-2
  (`store-completion-insight`-Arg-Vollständigkeit) in
  `memory-bank/remaining-work-plan.md`.
- Ausstehend: Zed `context_servers`-Eintrag durch Nutzer setzen (siehe Chat);
  in-container test env optional (`yarn install` im Container); Downstream-Aktivierung
  nur im stdio-Modus möglich (Limitation dokumentiert).

## Current Focus

- **RELEASE 0.3.0 SHIPPED (2026-09-14)** — alle Roadmap-Haupt-Tracks abgeschlossen
  (A, B1–B5, C, D1–D3, E1–E3). Erster erfolgreicher **OIDC-Trusted-Publishing**-Lauf
  (tokenlos, Provenance-Badge) nach dem 3-Ringe-Debug (Account-2FA-Modus →
  Package-Access-Option → TP-Stage-Permission, siehe lessonsLearned). ghcr-Images
  0.3.0 gepusht. Registry-verifiziert (`npm view` → latest 0.3.0).
- Next: ghcr-Packages auf public stellen (falls noch nicht geschehen); Smithery-Re-Publish
  (neue Tools sichtbar machen); optionale Punkte: D4 (Sampling), Tier 2 (LLM-Evals),
  orchestrierter Recipe Runner, Naming-Rename (Breaking, ~4 pt).
- Stochastic server fully shipped: merged, pushed, deployed, docker-verified,
  **published on the Smithery registry** (`paschbaer/stochasticthinking`,
  stdio bundle — download/install distribution; run.tools hosting is
  remote-only, RB-8 resolved with evidence). (2026-09-14: all `main` commits
  pushed; RB-7 residual resolved via green CI run.)

## Recent Changes

### 2026-09-29 — Wildcard Container-Route (feature/wildcard-container-route, Guidance-Session session-45abc996)
- Container-Route jetzt tool-name-agnostik-öffentlich: `capabilities.allow.tools:
  ["*"]` (Wildcard, nur alleinig — gemischte Listen → configuration_invalid)
  für gitnexus/clearthought/insight in `.guidance/` UND
  `examples/default-guidance/`; insight erstmals mit `containerRoute`
  (`host.docker.internal:3002/mcp` bzw. `localhost:3002/mcp` in examples).
  Enforcement: `ClientManager.assertAllowed` respektiert "*"; Auto-Fallback
  bleibt read_only-beschränkt (unverändert). Egress-Allowlist in examples-
  policies.json ergänzt (localhost:3000/3002/4747). Tests: Wildcard-Validierung
  + Enforcement + Full-Suite 437/437 grün. Hinweis: laufender Docker-Container
  braucht Image-Rebuild, um "*" zu akzeptieren.

### 2026-09-25 — Guidance HTTP-Downstream-Transport (feature/guidance-http-downstream)
- Plan reviewt (Clear-Thought-Server down ⇒ dokumentierter manueller Fallback
  mit Findings-Tabelle), Plan v2 um Egress-Host-Allowlist + Load-Time-Secret-
  Resolution + HTTP-Stub-E2E ergänzt.
- Implementiert: `transport.type "http"` in downstream-servers.json
  (`http.url` + `http.headers` mit `${ENV_VAR}`-Auflösung, fail-closed);
  `policies.egress.httpHostAllowlist` (Pflicht, sobald ein enabled Server http
  nutzt — exakter Host-Match); `validateDownstreamServers` validiert beide
  Transport-Typen; Auflösung NACH configVersion-Hashing (Secrets nie im Hash);
  ClientManager: `DownstreamTransportConfig`-Union +
  `StreamableHTTPClientTransport`; WorkflowEngine reicht http/stdio korrekt
  durch. Disabled Server werden komplett übersprungen.
- Tests: 33/33 fokussiert, 206/206 volle Guidance-Suite, tsc grün. E2E: echter
  Streamable-HTTP-Handshake gegen guidance-HTTP-App als Downstream.
- insights/clear-thought sprechen stateful streamable HTTP (sessionIdGenerator)
  — SDK-Client-Transport verwaltet `mcp-session-id` selbst; Reconnect = HD-1.
- Node läuft in WSL via nvm, aber NICHT auf PATH in `bash -c`; Windows-seitiges
  sh interpoliert `$VAR` vor wsl.exe (\$-Escaping nötig).

## Recent Changes

- 2026-09-16: **MG-1 RESOLVED** — stochastic-Jobs aus allen drei Publish-
  Pipelines entfernt (`42010d1`) und `@paschbaer/stochasticthinking` deprecatet
  (npm-Registry verifiziert: Meldung live, Verweis auf clear-thought@>=2.0.0).
  SSH-Setup im WSL repariert (Key kopiert + .bashrc-Guard gegen blockierende
  ssh-add-Prompts in nicht-interaktiven Shells); Push develop = `42010d1`.
- 2026-09-16: **Release 2.0.0 pushed + gemerged + published (User-Meldung)** —
  Branch `feature/release-2-0-0` (4 Commits: `0fd8410` Version-Bump +
  Pfad-Fixes, `6ddba51` README user-first, `dd2e00d` Docker/HTTP-Config,
  `92bde28` Memory-Bank) ist auf `develop` (`92bde28`, = origin/develop)
  und wurde vom User nach `main` gemergt + Publish angestoßen.
  Lokal nicht verifizierbar: `git fetch` schlägt fehl (Permission denied
  publickey — Credentials nur im User-Terminal); origin/main-Ref lokal stale
  (8897280, Stand 0.3.0). **Registry-Check: npm `latest` = 2.0.0 ✓ live.**
  **MG-1-Trigger ist damit erreicht**: Deprecation
  `@paschbaer/stochasticthinking` + stochastic-Jobs aus den drei
  Publish-Pipelines entfernen (Reihenfolge: erst 2.0.0 live bestätigen).
- 2026-09-16: Root-README user-first umgebaut (Commits `6ddba51` + `dd2e00d`,
  branch `feature/release-2-0-0`): neue Abschnitte Quick Start (npx-Config),
  What you get (7-Toolset-Tabelle, individuelle ≡ Toolset-Aufrufe),
  Using it with your coding agent (Agent-Guide + Skill-Generator-Doku:
  `npm run sync:skill`/`sync:all`), Docker/MCP-HTTP-Client-Config
  (`http://localhost:3000/mcp`, Endpunkt laut server.ts verifiziert) +
  ghcr-Image-Hinweis. Development/Publishing auf Verweise an die
  Server-README verdichtet.
- 2026-09-16: Release 2.0.0 vorbereitet (branch `feature/release-2-0-0`): Version-Bump
  `@paschbaer/clear-thought` 1.0.0 → **2.0.0** (package.json + Factory-ServerInfo;
  User-Entscheidung statt geplanter 1.1.0 — siehe decisions.md Update 2).
  Session-Export-Envelope-Version in SessionState.ts bleibt bewusst 1.0.0
  (Datenformat-Version, Schema unverändert — Bandit-Runs sind nicht Teil des Exports).
  Typcheck grün. Phase 6 freigegeben: User mergt nach main und stößt Publish an;
  danach MG-1 (Deprecation + Pipeline-Cleanup).
- 2026-09-16: Repo von `/mnt/c` nach `/mnt/d/repos/Thinking-MCP` umgezogen; Pfade
  korrigiert (`scripts/regen-root-agents.ts` + AGENTS.md-Guide-Block via
  Regenerierung + handgeschriebene Domain-context-Zeile; Backup `AGENTS.md.bak`).
  Merge-Status verifiziert: Implementierung `1bed87e` + Nachtrag `039c7e3` bereits
  auf develop (HEAD `df0a84a`). GitNexus-Index nach Umzug nicht erreichbar
  (Re-Index `node .gitnexus/run.cjs analyze --no-stats` ausstehend).
- 2026-09-15: Smithery-CI-Fix (erster Pipeline-Lauf crashte mit ENOENT: das Skript las die
  lokale settings.json bedingungslos, bevor es den Env-Token prüfte) — settings.json ist
  jetzt OPTIONAL; SMITHERY_API_KEY allein reicht. Nebeneffekt des lokalen Probe-Laufs:
  **clear-thought 0.3.0 auf Smithery republished** (45 Tools erfasst, Release 202/SUCCESS).
- 2026-09-14 (VIII): `publish-smithery.yml` (Release-Pipelines vervollständigt): beide
  Server werden bei Release-Merges automatisch republished (version-guarded via
  registry.smithery.ai-Record); beide publish-smithery.mjs akzeptieren jetzt
  SMITHERY_API_KEY-Env (Secret) zusätzlich zur lokalen Settings-Datei.
- 2026-09-14 (VII): Roadmap-Track D (branch `feature/track-d`, noch 0.3.0): D1 Session-
  Resources (4 URIs), D2 Workflow-Prompts (6), D3 Persistence (session_save/load + dataDir);
  Factory-Bug behoben (unparsed Config → sofortiger Cleanup-Timer); 129/129 Tests.
- 2026-09-14 (VI): Roadmap-Track B2–B5 (branch `feature/track-b2-b5`, noch 0.3.0):
  `argument_map`, `causal_graph`, `fermi_estimate`, `game_matrix` im reasoning-Toolset;
  fermi-Feld `operation`→`combine` (reservierter Toolset-Diskriminator); Mixed-Formel
  für den Spalten-Spieler korrigiert ((h−g)/denom); 121/121 Tests.
- 2026-09-14 (V): Roadmap-Track C (branch `feature/recipe-runner`, 0.3.0): `recipe_runner`
  + `workflow`-Toolset — 6 Guide-Rezepte als Daten, per-session Fortschritt im neuen
  `WorkflowStore`, Auto-Start/advance/reset; Guide (Routing + Rezept-Intro) und
  Root-AGENTS.md regeneriert; 111/111 Tests.
- 2026-09-14 (V): Release 0.2.0 über PR `develop → main` (Branch-Protection aktiv);
  GitHub-Actions: ghcr-Images gepusht, npm-Publish durch Account-2FA-Modus
  (auth-and-writes) blockiert → 0.2.0 manuell published; Modus auf „authorization only“
  umgestellt (Trusted-Publisher-Einträge für beide Packages vorhanden) — OIDC-Test
  fällt beim nächsten Release an.
- 2026-09-14 (IV): Roadmap-Track B1 (branch `feature/risk-family`, 0.2.0): Risiko-Familie
  `premortem`/`fmea`/`fault_tree` als dual-mode Tools über neues `risk`-Toolset;
  Registry-Metadaten für 37 Einträge; 103/103 Tests. Öffentlicher Punkt: Guide-Erweiterung
  (AGENTS.template.md) für die neue Familie erledigt (Routing-Tabelle + Dual-Mode-Liste).
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

## 2026-09-15: Architektur-Abwägung Server-Zusammenlegung

- User-Frage: Merge clear-thought + stochasticthinking zu einem Server für gemeinsame
  Recipe-Nutzung? Entscheidung `merge-servers-2026-09-15` (Full-Chain incl. MDP):
  **Status quo (B)**, Merge an Trigger gekoppelt (stochastic-Rezepte im recipe_runner /
  Cross-Familie-Session-State, Setup-Friction-Feedback, Wartungsdruck → dann Hybrid
  statt Full-Merge). Details in `memory-bank/decisions.md`. Kein Code-Change.


## 2026-09-15: Eval-Rig Upgrade (Actor/Judge-Split + harte Tasks)

- Branch `feature/harder-evals-actor-judge-split`: `evals/run.mjs` behandelt
  Actor und Judge als getrennte Endpoints (`EVAL_ACTOR_MODEL/BASE_URL/API_KEY`,
  `EVAL_JUDGE_*`); Legacy-Vars bleiben Actor-Default, Judge erbt. Self-Bias-
  Warnung bei gleichem Modell+Endpoint; `config.json` Snapshot im Report-Ordner.
- `evals/tasks-hard.json` (4 Tasks, Ground-Truth via echte Tool-Läufe): fault_tree
  exakt 0.04148 + Beitrags-Ranking; game_matrix iterierte Dominanz (exit→hold,
  chaotic→stable) + 2×2-Mix (expand/hold 0.50/0.50, aggressive/stable 0.75/0.25,
  Payoffs 3.75/3.0); fermi 993,600 € + Sensitivität + VoI 63,000 €; Bandit
  (thompson, seed 7) runId-Fortsetzung 80+60 pulls → regret 16.14, pulls 31/13/96.
- Runner attached `server-stochasticthinking/dist/dev.js` automatisch (statefulle
  Tools, runId über Calls). SDK-Falle: Constructor-Option heißt
  `defaultRequestTimeoutMsec`, `timeout` wirkt nur pro Request (drvfs-Kaltstart!).
- Offen: Run 3 mit hartem Set + unabhängigem Judge (braucht API-Keys + User-Go).

## 2026-09-15: Post-Commit-Review Eval-Rig (abgeschlossen)

- Review-Subagent über 37cc9a6..HEAD: **APPROVE, 0 HIGH/CRITICAL**, 1 MEDIUM,
  5 LOW, 3 NIT. Alle Ground-Truth-Zahlen der harten Tasks unabhängig handverifiziert
  (inkl. Pseudo-Regret-Formel 0.46·140 − Σpᵢ·pullsᵢ = 16.14).
- Fixes committet: MEDIUM → Pinning-Test (stochastic, 17/17); LOWs → Arg-Guards,
  Judge-Cap 12000, Transport-Cleanup, Rubrik-Dual-Dominator. NITs/Flake als
  EV-4/EV-5 accepted dokumentiert. bin-invocation-Fehler in Full-Suite = drvfs-
  Last-Flake (isoliert grün), nicht diff-bedingt.

## 2026-09-15: Run 3 durchgeführt (Hard Set, Split Actor/Judge)

- Ergebnisse (s. progress.md): Bandit +11 / Fault-Tree +2 / Fermi 0 / Game −4.
  Rig-Fixes unterwegs: Streaming-SSE-Reassembly, attempt-skalierte Timeouts,
  thinking je Rolle (Actor disabled fixt Reasoning-Loop), .env-Loader,
  eval:llm:hard-Script, Final-Answer-Nudge, Judge-Anker.
- Offen für Run 4 (User freigegeben): verbatim-parameter System-Prompt für den
  Actor-Modus, EVAL_MAX_TOOL_ROUNDS, Tool-Call-Log im report.json (hätte den
  Game-Matrix-Transcribe-Fehler sofort gezeigt), Rundungstoleranz H1-Rubrik.
- NEU entdeckt: Scoring-Anzeige-Bug — Judge summiert raw 0-4 je Kriterium
  (max 16), report zeigt aber gewichtetes max (40). Deltas valide, Prozent-
  angaben deflationiert. Fix: total = Σ score×weight im Runner.

## 2026-09-15: Run 4 (gehärtetes Rig) — Tool-Wert-These validiert

- 40/40-Bandit (Δ+22), 40/40-Fault-Tree (Δ+4); Game −6 / Fermi −9. Tool-Call-Log
  beweist: String-instead-of-Object-Schema-Flailing (4 calls) + skipped
  fermi_estimate. Deltas/kumulierte Zahlen exakt (16.140 ✓ Pinning-Test-Werte).
- EV-6 (gewichtetes Scoring) + EV-7 (Operator-Prompt/Log/Runden) RESOLVED,
  committet `2db88c9`. Run-4-Report: evals/results/2026-09-15T15-10-16/.

## 2026-09-15: Run 5 — Abschluss der Eval-Härtung (98,8 %)

- Feature-Branch `feature/harder-evals-actor-judge-split` per fast-forward nach
  develop gemergt (9bd6812) und gelöscht; Parallelsession-WIP (decisions.md,
  merge-plan) via Stash erhalten.
- Run 5 (Report evals/results/2026-09-15T15-47-23/): Server 158/160. EV-8
  RESOLVED — beide Run-4-Fehlerklassen (Schema-Flailing, skipped fermi_estimate)
  treten nicht mehr auf. Verbleibender 2-Punkt-Verlust Game-Matrix: Detail,∉
  blocking. Eval-Track damit abgeschlossen; Rest: git push develop (User).
- **MERGE IMPLEMENTIERT (2026-09-15, Branch `feature/merge-stochastic-into-clear-thought`)**:
  Phasen 0-5 des Umsetzungsplans (`plans/merge-stochastic-into-clear-thought.md`)
  ausgefuehrt. Port: `src/algorithms/*` (7 Module), `BanditRunStore` in SessionState
  (cleanup-integriert), Dual-Registration (`stochasticalgorithm` Name/Signatur
  unveraendert + Toolset `stochastic`, operation mdp/mcts/bandit/bayesian/hmm),
  2 TOOL_METADATA-Eintraege (stateful:true), Tests portiert (`algorithms.test.ts`)
  + neue Merge-Contracts (`stochastic-merge.test.ts`: Paritaet, Bandit-runId ueber
  beide Call-Pfade, Fehlerkontrakte). Orchestrator: Rezept 7
  `decision-under-uncertainty` + stochastic-Stage in `architecture-decision`
  (STAGE_GUIDANCE reindiziert), 7. Workflow-Prompt. Guide: Template erweitert,
  Konstante via neuem `sync:guide`-Skript regeneriert; Root-AGENTS.md ueber echten
  Handler (`scripts/regen-root-agents.ts`) regeneriert — verwaister
  stochastic-thinking-Markerblock entfernt (verifiziert: 0 Marker, Rezept 7 sichtbar).
  Docs: Root-README Single-Server + Migrations-Abschnitt; stochastic-README
  Deprecation-Banner; MG-1/2/3 in remaining-work-plan getrackt. Gezielte Tests
  30/30 gruen; Typecheck gruen. Offen: Full-Suite-Auswertung + Phase 6 (Release
  1.1.0 + Deprecation, wartet auf Freigabe). Stale-Buffer-Trap dokumentiert
  (lessonsLearned).

## 2026-09-17: Spec-Review EMMS (specs/001-experience-memory-server)
- Review mit clear-thought (structured_argumentation, argument_map 83% completeness, seven-seekers 7 Lenses). Ergebnis: spec plan-ready, Confidence 0.85.
- 5 Findings (plan-level, nicht spec-invalidierend), getrackt in remaining-work-plan.md: Actor-Modell fehlt; Revision/Conflict-Semantik unbestimmt; Eval-Korpus nicht definiert; Guidance-Objekt ohne konkrete Struktur; Detektionsschwellen (Duplikate/Kontradiktionen FR-021) ohne Metrik.
- Zusatz-Beobachtungen: Fabricated-Evidence-Risiko (Agent kann Exit Codes erfinden; nur Artefakt-Evidenz mildert) und fehlende Feedback-Schleife fuer gescheiterte Guidance-Pfade — als Akzeptanzkriterien in der Planung verengen.
- Server-Scaffold: servers/server-experiencememory/ auf Branch 001-experience-memory-server angelegt (Abweichung von feature/-Namenskonvention dokumentiert).

## 2026-09-17: Analyze-Remediation EMMS (C1/C2/U1-U5/E1-E4/A1)
- Alle 12 Findings aus /speckit-analyze per clear-thought-Entscheidung (Conf 0.88) aufgeloest: spec FR-008/022/SC-001/005/009 praezisiert; contracts um workflow.abandon + Artifact-Limits (1 MiB, 4 Media-Types) erweitert; research D6 (Ranking-Defaults + Applicability-Formel); tasks T007/T012/T022/T040 geschaerft, T047 (abandon, US2) + T048 (Baseline-Harness, Polish) neu -> 48 Tasks.

## 2026-09-18: EMMS Implementierung (T001-T048 abgeschlossen)
- 58/58 Tests gruen, Typecheck sauber. Alle Phasen (Setup, Foundational, US1-US5, Polish) implementiert.
- Neue Dateien: src/domain/{types,state-machine,revision,errors,normalize}.ts, src/storage/{adapter,sqlite,migrations}.ts, src/evidence/{store,redact}.ts, src/guidance/{envelope,engine,limits}.ts, src/service.ts, src/tools/{register,index}.ts, 13 Test-Dateien (contract+unit+fixtures).
- Wichtige Design-Entscheidungen beim Implementieren: finalize-Assessment ist read-only (keine State-Mutation bei abgelehntem 'verified'); recordValidationRun transitioniert automatisch SOLUTION_PROPOSED->VALIDATING; harmful-Attempt gilt nur als 'unresolved critical side effect' wenn kein spaeterer 'successful'-Attempt existiert; Idempotenz-Check VOR Revisions-Check; Schema-Validierung geschieht auf SDK-Protokollebene (isError), Fachlichkeiten auf Service-Ebene.
- Offen: T045 (gitnexus detect_changes), Commit-Freigabe, Full-quickstart-Durchlauf manuell.


- 2026-09-18: `agents_guide` tool renamed to `setup_clearthought` (naming
  alignment with experience-memory's `setup_experience_memory`). Historical
  references above remain unchanged (log entries). Files renamed:
  setup-clearthought.ts / -template.ts / test. 142/142 tests green.


## 2026-09-22 — Guidance server Phase 1 (feature/guidance-v2-orchestration)
- Phase 1 scaffold of servers/server-guidance committed (aa80a94) + review-fix commit (8dae32a). T001-T005 [x] in specs/002-guidance-workflow-server/tasks.md; next: Phase 2 foundational (T006-T016).
- Code review (Review Agent) returned 7 findings; F1 (npm test failing) DISPUTED and dismissed with terminal evidence (passWithNoTests present, exit 0); F2-F7 fixed in 8dae32a. Reviewer could not run commands — snapshot verification done by main agent per Review Evidence Protocol.
- Open: orchestration.md checklist 34/34 marked reviewed (user-directed); implementation continues Phase 2 on user go-ahead.

## 2026-09-22 — Guidance Phase 2 complete + reviewed
- Phase 2 foundational (T006-T016) committed (4bdefbe) + review-fix commits (1b54853, 1970d8d). 39/39 tests, typecheck/build clean.
- Phase 2 review (Review Agent): 2 HIGH (spec_kit_feature_in_use missing from ERROR_CODES; non-atomic lock persistence) + useful MEDIUMs (canonical hashing, createRequire order, validator memoization) — ALL FIXED. Verdict was needs-changes; fixes verified on disk via terminal grep after /mnt/d silent-patch no-ops (edit-tool reported success twice but changes absent — always re-verify with grep, patch via terminal python).
- Next: Phase 3 / US1 workflow engine (T017-T028) on user go-ahead.

## 2026-09-22 — Guidance Phase 3 complete (US1 workflow engine)
- Phase 3 (T017-T028) committed (cb38202). WorkflowEngine + WorkflowTools + OperationEngine (process + composite firstAvailable). 52/52 tests.
- Schema example files made realistic (full field sets); transition selection fixed: reason-only transitions only on operation failure; test workspaces get a minimal package.json so verify ops succeed.
- Known limitation: successful `completed` path requires Phase 5 downstream client (or gitnexus CLI present in workspace).
- Next: Phase 4 US2 (T029-T033) then Phase 5 US4 (T034-T049) per tasks.md.

## 2026-09-22 — Guidance Phase 3 review APPROVED
- cb38202 reviewed: APPROVE, 0 HIGH/CRITICAL. F1-F5 persisted as tracked follow-ups in remaining-work-plan.md; F5 (ledger-into-transition) and F7 (missing await) fixed immediately in follow-up commit. Idempotency replay test deferred to next engine scope.

## 2026-09-22 — Guidance Phase 7b/8/9 review APPROVED
- 8658697 reviewed: APPROVED with tracked follow-ups (0 HIGH/CRITICAL; 3 MEDIUM + 5 LOW recorded in remaining-work-plan.md).

## 2026-09-22 — Guidance implementation COMPLETE (all 92 tasks)
- Phases 1-12 implemented on feature/guidance-v2-orchestration; 118/118 tests, typecheck/build clean. Final commit: Phase 10-12 review fix (getSession pure read; locked reconcile in getWorkflowState — MEDIUM resolved).
- Reviews: P1 fixed/approved, P2 fixed, P3 approve, P4 fixed, P5 fixed, P6 fixed, P7a H1 fixed + 7b scope recorded, P7b/8/9 approved w/ follow-ups, P10-12 approved w/ follow-up (write-on-read fixed immediately; ::1 test + Host-header validation recorded).
- Remaining tracked follow-ups in remaining-work-plan.md: Phase 7c SpecKitEngine hardening, Phase 5/6 policy wiring depth, Phase 10-12 LOWs (IPv6 test, DNS-rebinding Host-header validation, perf percentile method), MCP streamable-HTTP adapter mount, bearer-token authN.
- Next: merge flow per constitution (rebase → develop, squash → main) on user approval; /capture_lessons executed for Phases 4-6, 7a, 10-12 lessons (6 lessons seeded).
- 2026-09-22 — Full-codebase review fix round: F1-F4 fixed (commits 8eeba9c, e0b911d, e217ddf, 2054691, a8a5082). F4 tests debugged: second submit on terminal phase returns required_hook_failed (transition_rejected alias), not transition success — assertions must target the transition-carrying submit. Next: findings M2 (requestTimeoutSeconds enforcement), M3 (stale `as never` casts), Spec-Kit 12-tool MCP registration (needs SpecKitEngine wiring design decision).
- 2026-09-23 — M2/M3/F7 abgeschlossen (commits 7efaa16, 2b7bbb2, 6cdc842, e3bded6, d1cd01b): requestTimeoutSeconds erzwungen, alle `as never` entfernt, Spec-Kit 12 Tools profil-gated registriert (Option C, lazy Engine-Cache je sessionId + atomic StateStore). Review-HIGH (sessionId-Pfad-Traversal im StateStore) sofort geschlossen. Suite: 136/136. Offen: getrackte LOWs in remaining-work-plan.md; Merge-Flow (rebase→develop, squash→main) wartet auf User-Freigabe.
- 2026-09-23 — Alle getrackten LOW-Findings behoben (ab985b9, 5c34f3d): Review-HIGH (fehlendes await → '{}'-Payloads bei 5 Mutation-Tools) vom Reviewer gefunden und sofort mit Regressions-Test geschlossen. Suite 137/137. Merge-Flow wartet weiter auf User-Freigabe.
- 2026-09-23 — HTTP-Betrieb implementiert und in Container verifiziert: POST /mcp (streamable, stateless), Bearer-Auth optional, GUIDANCE_BIND_HOST-Opt-in, Dockerfile+Compose (Port 3003, /workspace-Volume). Suite 142/142. Server jetzt auch über HTTP einsatzbereit; develop um 2 Commits ahead of origin (push via User).
- 2026-09-23 — Doku: server-guidance/README.md neu (Installation, .guidance/-Konfigurationsreferenz mit Beispielen, Agent-Loop mit Tool-Beispielen, Spec-Kit-Beispiel, Env-Variablen); Root-README um Guidance-Zeile + Kurzabschnitt erweitert (b4869af).

## 2026-09-23: SDK-Streamable-Transport-Migration (feature/sdk-streamable-transport-migration)
- clear-thought + insight: @smithery/sdk-Wrapper entfernt, direkter StreamableHTTPServerTransport (stateful Sessions, mcp-session-id, enableJsonResponse). Keine neue Abhängigkeit, Sed-Patch aus beiden Dockerfiles gefallen.
- Container-Härtung: clear-thought npm ci + compose modernisiert + CLEAR_THOUGHT_BIND_HOST; insight Label-Pfad gefixt, server-lokales Lockfile + npm ci (LOW resolved).
- Root-Cause-Trap beim Migrationstest: fehlendes await server.connect(transport) — Transport annahm Sessions, Server antwortete nie. Nur per offiziellem SDK-Client-E2E gegen dist/Container auffindbar (curl-SSE-Artefakte irreführend).
- Review (Review-Agent): 2 HIGHs (Root-Compose-Bind-Hosts, ungebremstes Session-Wachstum) — beide gefixt in 1caa690; 3 akzeptierte LOW/INFO-Beobachtungen getrackt im remaining-work-plan.
- Stand: 3 Commits auf Feature-Branch (bc5326c, dd065b4, 1caa690), Baum sauber; Merge nach develop noch offen.
- 2026-09-23 — Option D implementiert (scaffold-on-first-start, init-CLI, configured-aware /health; 4683720). Review-HIGH (scaffolded workflow referenzierte undefiniertes repository-analysis-Op → operation_not_configured an complete) sofort gefixt + E2E-Regressions test (scaffold-e2e). TOCTOU via wx-Flag. Config-Doku: Abhängigkeitsgraph + Attribut-Referenz + Best-Practice-Reihenfolge (ec14fe6). Suite 149/149.
- 2026-09-23 — Store-Abgleich: STDIO-Store (~/.insight, 76 Episoden, Stand 22.09.) war disjunkt vom Docker-Store (37, heutige Lessons). migrate-stdio-store.mjs (Container gestoppt, vorher Dry-Run) → DOCKER-Store jetzt 113 Episoden, FTS 113/113, Container healthy, Suche via HTTP verifiziert (alte STDIO-Episoden + heutige Lessons beide auffindbar). STDIO-Store unangetastet als Backup.

## 2026-09-23: setup_clearthought Loop-Defense-Serie abgeschlossen
- Feature-Zweige gemerged (develop): Loop-Guard (d9d6759), F4-Härtung (184a7ec),
  Pagination (53f7714/582a9b9), Eskalation (44063c6), Compact-Guide + Recipes-
  on-Demand (a5c5c98). Reviews: jeweils 0 HIGH/CRITICAL, approved.
- Getrackte Follow-ups (Reviews, trigger = naechste Template-/Tool-Aenderung):
  1. Test fehlt: Compact-Output muss GENAU EIN Marker-Paar enthalten
     (Regression waere doppelte Marker -> Merge-Fallback). [R: a5c5c98 Review #2]
  2. Eskalationstest ueber den Utility-Toolset-Dispatcher (isError-Propagation
     via toolsets/registry.ts untested). [R: 44063c6 Review #4]
  3. Beobachtung akzeptiert: section:'recipes' ist unguarded (statischer
     ~2-3KB-Payload); Rate-Limit nur falls Spam beobachtet wird.

## 2026-09-23: Spec-Review Amendment 001-remote-mode (v3)
- Review durchgeführt: 0 Blocker, 2 MEDIUM (M1 Idempotenz-vs-MultiSession,
  M2 401-vs-session_not_found), 6 LOW. Findings persistiert in
  specs/002-guidance-workflow-server/amendments/001-remote-mode-review-findings.md
- Implementierung läuft PARALLEL in separatem Chat (bereits src/main.ts
  composeApplication-Optionen). Post-Implementation-Review nach Merge Pflicht
  (Trigger in remaining-work-plan.md eingetragen).
- 2026-09-23 — Remote-Mode (spec amendment 001) implementiert: init_session-Config-Upload, Pair-Auth (optional, anonymer Fallback), sessiongebundene Tools, ClientOpEngine (1a), report_operation_result mit Auto-Retry, TTL 30d, configured-aware /health. Review: 2 CRITICAL (ClientOpEngine nie verdrahtet — Patch-Verlust; lastAttempt nur bei accepted) + 2 HIGH behoben. 155/155 Tests. Branch feature/remote-mode-session-binding, Merge nach develop offen.

## 2026-09-24: Full-Codebase-Review (develop @ 2d580fa)
- Basis: Snapshot develop@2d580fa, clean, ahead 4 (fb0a350..2d580fa = Remote-Mode-Hardening + memory-bank). Merge nach develop ERFOLGT — „Merge nach develop offen" oben ist stale.
- Ergebnis: 0 HIGH/CRITICAL offen; 4 MEDIUM (CB-1 guidance touch()-TTL-Bug; CB-2 guidance Quota-Rollback-Lücke configFiles; CB-3 Session-Orphan-Pattern insight+clear-thought — Re-Evaluation der akzeptierten LOW aus Review 1caa690; CB-4 Compose-Exposure 0.0.0.0 ohne insight-Auth); 9 LOW + 4 INFO — alle persistiert unter „Getrackte Follow-ups (2026-09-24...)" in remaining-work-plan.md.
- Positiv verifiziert: insight FTS5-Sanitization + Prepared Statements + atomare tmp+rename-Writes + Read-Hash-Verifikation; guidance SESSION_ID_PATTERN, separator-bewusster Pfadschutz, timing-safe Pair-Auth, 401/404-Kanaltrennung, Loopback-fail-closed-Binding; Reaper+MAX_SESSIONS in beiden HTTP-Servern.
- Tests NICHT ausgeführt (keine Node-Toolchain in der Session; drei Shells geprüft) — CI test.yml autoritativ.
- Review-Qualität: c22585a-Commitmsg „dbg-Logs entfernt" traf nicht zu (1 [dbg] in src L132 verblieben) → als CB-9 getrackt.

## 2026-09-26: Feature 003 Toolchain-Bootstrap implementiert (Chained Workflow)
- Spec (16c6f1e auf develop) via Guidance-Chained-Workflow umgesetzt (Session session-1dcd604f, Profil spec-kit in .guidance/guidance.json aktiviert, chain depth 16). Branch feature/guidance-toolchain-bootstrap: 77fa854 (Implementierung) + Review-Fix-Commit.
- Kern: run_operation-Tool (nur invocableByAgent:true, fail-closed), FR-107 Per-Session-Mutex, FR-109 Cross-Session-Workspace-Lock mit Stale-Recovery (dead-PID/TTL-Steal), FR-110 kooperativ (spawnSync-Constraint dokumentiert), Dockerfile python3 + uv 0.12.19 gepinnt, examples/python-guidance (uv sync --locked fail-closed), E2E SC-001..004. Suite 268/268 + tsc + build grün (Container guidance-bootstrap-test).
- Unabhängiger Review (Subagent): 1 HIGH (Stale-Lock) + MEDIUMs/LOWs — HIGH + Denial-Audit + EACCES + README sofort gefixt; Rest (R-006 E2E-Lücken, R-008a globaler Lock, R-010 ERROR_CODES-Test) in remaining-work-plan getrackt.
- Testumgebung: kein Node auf Host — Suite im Container (Repo-Copy + @rollup/rollup-linux-x64-musl; für E2E das Guidance-Image selbst: node+uv vereint).

## 2026-09-26: Amendment 003 Final-Review Evidence Gate implementiert
- Anlass: verpasster frischer Gesamt-Review beim Feature-003-Completion (weicher Instruktionstext) → Gate machbar gemacht. Draft ff4fe31, Umsetzung 2983be3 (Q1–Q3-Defaults vom Nutzer gebilligt).
- check-final-review.mjs (strict Schema, HEAD-Match ohne git-Binary, computed HIGH/CRITICAL), Gate-Op required in scaffold/examples/root-Workspace (complete.beforeExit), 6 Contract-Tests. 274/274 + tsc + build grün.
- Getrackt: FR-Nummern-Kollision specs/003 vs Amendments 001/002; Amendment-Status-Update DRAFT→APPROVED bei Nutzerbilligung.

## 2026-09-26: Feature 004 Async Operation Execution (Chained Workflow, feature/async-operation-execution)
- Session session-85c8e497. Async Executor (spawn, SIGTERM→SIGKILL, AbortSignal) ersetzt spawnSync; AbortController-Registry in WorkflowEngine; cancel_workflow = Hard-Kill (FR-202/110 erledigt); R-006-E2Es geschlossen. stderr-Redaction für failing ops nachgerüstet (neu gefundene Lücke). 290/290 + tsc + build grün.

## 2026-09-26: Lock-Hardening (R-011/R-012/R-010, feature/guidance-lock-hardening → develop 61d7399)
- WorkspaceOpLock (src/workflow/workspace-lock.ts): Acquire via link() (atomar, Doppel-Halt konstruktiv ausgeschlossen), Steal via rename-in-Quarantäne mit Verify+Restore. TTL = max(120s, 2× max Op-Timeout) ⇒ TTL-stale impliziert toten Halter (R-012a-Invariante). Neuer ErrorCode workspace_lock_unavailable (R-012b).
- Tests: 6-Prozess-Race (exakt 1 Halter), Live-Owner-nicht-stehlen, ERROR_CODES-Exact-Snapshot (R-010). 279/279 + tsc grün. Residuales Mikro-Fenster (inspect→rename) dokumentiert: nie Doppel-Halt, schlimmstenfalls transiente Contention + Quarantäne-Orphan.

## 2026-09-24: Security-/Policy-Verifikation (Phase 5/6-Fixes) + Rest-Fixes
- User-Anderungen verifiziert (Code + Container-Tests, node:22-alpine): Phase 6 Egress-Inhaltsprüfung (`containsSecretPattern` für restricted), `redactUnknown()`-Seam auf content + protocolMetadata.structuredContent, Multi-Line-Redaction, Capability-Pin-Persistenz über Restarts. 192/192 grün + tsc clean.
- Rest-Fixes umgesetzt: saveCapabilityPins atomar (tmp+rename), Pin-Helfer exportiert, Regressionstest tests/workflow/capability-pins.test.ts (5 Tests: Roundtrip/Merge/Drift/Korrupt/Atomarität). Suite 197/197 grün, tsc clean.
- remaining-work-plan.md gesynct: L264/L266 (Phase 5/6) + CB-1/CB-2/CB-9 auf [x] mit Evidence; neue Sektion „Security-/Policy-Verifikation". Verbleibende Guidance-Offenpunkte: Metrics-Tool (L260), awaiting_client-Spec (L305d), Rest-LOWs aus R-1..R-3 (akzeptiert).
- Testumgebung-Lesson: kein Node auf Host-PATH; Container-Run braucht Repo-COPY (Mount-EACCES bei npm install) + @rollup/rollup-linux-x64-musl nachinstallieren (bekannte native-Bindings-Falle).


## 2026-09-27: Multi-Repo-Fähigkeits-Befund (Guidance, Niyama-Beispiel)
- Nutzer-Befund verifiziert: guidance ist single-repo verdrahtet — ein Workspace-Root (src/index.ts:15-16), assertWorkspaceInside + spec_kit_feature_outside_workspace lehnen Fremd-Repos ab, .guidance/-Config+State bound an das eine Root, Deployment 1 Container = 1 Repo (docker-compose.override.yml).
- Konsequenz: Für ein zweites Repo (Niyama) sind heute nur Workarounds möglich (zusätzlicher Mount + Sub-Pfad als workspaceRoot, oder zweite Container-Instanz). Produktionsreif = Workspace-Registry-Konzept nötig.
- Getrackt als MR-1 (MEDIUM, Architektur) + MR-2 (LOW, Docs) in remaining-work-plan.md.

## 2026-09-27: MCP-Timeout-Diagnose (clearthought/gitnexus) — Ursache clientseitig
- Wiederkehrende `Context server request timeout`-Fehler verifiziert: Container healthy, Logs 24h ohne error/timeout/warn, direkter curl-MCP-Roundtrip gegen :3000/mcp = ~160 ms. Server-Seite exkulpiert → Ursache ist der Zed-MCP-Client/HTTP-Transport (eigener, kürzerer Request-Timeout; abgebrochener SSE-Stream kaskadiert).
- Workarounds: schwere GitNexus-Ops via CLI statt MCP; nach Timeout MCP-Session im Editor neu starten. Lesson in lessonsLearned.md (Avoid These Mistakes, 2026-09-27) dokumentiert. Befund :4747 = Web-UI, kein /mcp-Endpunkt.

## 2026-09-27: Spec-009 Delta-Re-Review R-1…R-5 (Commit 7f9065f, spec-only)
- R-1 gelöst in spec.md (FR-901/903: Kopierliste = workflow.json + schemas/, policies via FR-910 regeneriert) — ABER plan.md (L18, L46-47) und tasks.md (T7) nennen policies.json weiterhin als „kopiert" (widerspricht FR-910/T13). → N-D1 (MEDIUM) getrackt.
- R-2 gelöst (FR-902: Referenz-guidance.json lesbar + profile-Feld auswertbar), R-3 gelöst (AC-3 differenzierter Golden-File-Vergleich, testbar via T5), R-4 gelöst (Muster „adopt coherence: workflow references unknown op <name>", AC-9), R-5 weitgehend gelöst (Ziel-.guidance-Ausschluss + Symlink-Regel für schemas/); Restvektor: Check nicht als realpath/resolve-basiert spezifiziert → N-D2 (LOW).
- Weitere: N-D3 (LOW) FR-909 referenziert aber nicht definiert; N-D4 (INFO) FR-902 Satzbruch durch R-5-Einschub, plan.md-Typo „und宵".
- Urteil: 0 HIGH/CRITICAL offen → Spec FREIGEGEBEN; Plan/Tasks brauchen 1-Zeilen-Fix (N-D1) vor/vor Implementation.

## 2026-09-27: Clear-Thought-Re-Routing über Guidance-Container (live verifiziert)
- clearthought als Downstream-Server in .guidance konfiguriert (downstream-servers.json: host.docker.internal:3000/mcp, trusted, HD-1-Reconnect; policies.json: Egress-Allowlist; operations.json: reasoning-pass mcpTool, invocableByAgent:true). Teilweise vom parallelen Spec-009-Agenten committed (109d3df/5406875); invocableByAgent-Flag: d2b394a auf feature/clearthought-agent-invocable-pass.
- Live-Test: run_operation(reasoning-pass) = succeeded, 177 ms serverseitig (get_metrics), clearthought-Status ready — vs. Timeout auf derselben Editor-Route. Guidance-Container-Neustart nötig nach Config-Änderung.
- Ziel-Verwendung: workflow-verpflichtende Reasoning-Pässe orchestriert laufen lassen; Ad-hoc-Calls bleiben auf der Editor-Route (dort gilt die neue Timeout-Policy in responses.json).

## 2026-09-27: Spec-010 Review (independent spec review, Commit 76801a2, develop, tree clean)
- Review-Objekt: specs/010-documentation-drift-gate/spec.md (Draft, Q1–Q3 entschieden). Review auf Spec-Qualität, keine Implementierung existiert.
- Snapshot: branch develop, HEAD 76801a2 = Review-Commit, unstaged/staged diff leer zum Review-Zeitpunkt. Kontexte verifiziert: check-final-review.mjs, check-index-freshness.mjs, .guidance/operations.json + workflow.json (lifecycle.beforeExit), ConfigAssistant QUESTIONS (9 IDs), register-tools.ts (16 SPEC_KIT + 19 WORKFLOW Tool-Namen), errors.ts ERROR_CODES (~80), spec 009 (FR-901–910).
- Urteil: NICHT FREIGEGEBEN — 1 HIGH (F-1: FR-954 Pfadmuster-Semantik/Basis undefiniert, `src/config.ts` etc. existieren nicht als Repo-Root-Pfade → Gate tot oder arbiträr), 5 MEDIUM (F-2 Verdrahtungspunkt workflow.json beforeExit fehlt + Gate-Reihenfolge, F-3 Check-1 „Abschnitts-Verweis" unpräzise + README-Tool-Tabelle bereits 12 vs 16 driftig, F-4 ERROR_CODES-Anker existiert in README gar nicht, F-5 Check-4 Heuristik „Merge-Commit" für dieses Repo (Rebase/Squash) ungeeignet/undefiniert + Blocking ohne Ausstiegsregel), 3 LOW, 2 INFO. Details: remaining-work-plan.md Abschnitt Spec-010.

## 2026-09-27: specs/010 Implementation abgeschlossen (T5-T10)
- Snapshot: branch develop, HEAD d89bb25 + uncommittete Änderungen (operations.json, workflow.json, SpecKitEngine.ts, lifecycle.test.ts, Contract-Doku, tasks.md 010). Alles im Container verifiziert (344 Tests/tsc/build/Gate je Exit 0).
- docsImpact-Semantik implementiert: Substring-Match gegen DOCS_RELEVANT_PATTERNS mit Backslash-Normalisierung (Windows-Pfade); löst S10-F1 praktisch (Muster als definierte Konstante mit definierter Basis repo-root-relative changedFiles).
- S10-F2/F6 gelöst (beforeExit vor final-review-gate; Contract specs/002 dokumentiert docsImpact inkl. submission_invalid-Verhalten).
- Offen: Push + index-freshness beim complete_workflow; AD-1/AD-2 (Adopt) unberührt.

## 2026-09-27: specs/010 Completion-Phase
- Review-Fixes (3191d05): Segment-Matching + AC-5-Testlücken. Final-Review durch frischen Sub-Agent: 0 HIGH/CRITICAL unresolved. lint/test-Ops rot = pre-existing non-blocking (Doku in remaining-work-plan). final-review.json + session-lessons.json geschrieben; Index-Refresh nach letztem Commit.

## 2026-09-27: specs/010 Final-Review Runde 2 — 2 HIGH behoben
- Unabhängiger Final-Review fand: Check-1-Tool-Parität war nie implementiert (No-op) + fehlende Gate-Tests. Beide HIGH gefixt (Segment: check-docs-drift.mjs vollständig umgebaut, tests/scripts/check-docs-drift.test.ts 12 Regressionstests). MEDIUMs (Freitext-Match, Override-Datei, Kapitel-Scoping) + LOWs (.bak-Dirs, Ziffern-Codes, done>0-Guard) ebenfalls gefixt. Gate Exit 0 (35 tools beidseitig), Vollsuite 357/357, tsc grün.

## 2026-09-27: Rest-Findings-Batch implementiert (session-4e4471f2)
- Branch feature/rest-findings-batch. AD-1-Semantik: Kopie statt Verwerfen — nicht-generische Referenz-Ops landen mit Marker in operations.json; Notes-Text + Test AC-9 angepasst (legacy-custom-op jetzt erwartet).
- Achtung: Prettier --write reformatiert server-guidance/src (ConfigAssistant/SpecKitEngine) — Bulk-Diff in diesem Commit enthalten (Format-only).

## 2026-09-27: AD-1/AD-1a/AD-2 geschlossen (parallel implementiert, live verifiziert) + Guidance-Workflow-Restart-Falle
- AD-1/AD-1a/AD-2 wurden vom parallelen Agenten implementiert (36e6233: non-generische Ops werden mit [adopted]-Marker kopiert statt verworfen; realistic-reference Regressionstest; referencePath-Help+README dokumentieren builtin-Referenz; 798e545: Shape-Validation kopierter Ops; 4bd2556: [x]-Close-out mit Independent Final Review 0 HIGH/CRITICAL, Suite 360/360).
- Unabhängige Live-Verifikation: Guidance-Image neu gebaut, Original-Repro setup_guidance_generate {referencePath:/examples/default-guidance} jetzt GRÜN (9-Dateien-Payload, final-review-gate/store-completion-insight kopiert mit Review-Hinweis, Kohärenzprüfung grün).
- Workflow session-d57a0bc7 wurde nach Container-Restart nicht fortsetzbar: (1) Restart mit falschem Compose-File (servers/server-guidance/docker-compose.yml allein — docker compose -f lädt das override.yml NICHT automatisch → falsches /workspace-Mount, Sessions "verschwunden"); korrekt: -f docker-compose.yml -f docker-compose.override.yml. (2) Danach Config-Drift: Session an alte configurationVersion gebunden (specs/008 AC-5, fail-closed) — Restarts nach Config-Änderung invalidieren laufende Sessions grundsätzlich.

## 2026-09-27: specs/011-adopt-templates implementiert (session-f66c3f62, feature/011-adopt-templates)
- T1–T6 komplett: resolveBuiltinReferencePath() (env GUIDANCE_BUILTIN_TEMPLATE_DIR, Default PKG_ROOT/examples/default-guidance); validateAdoptReference akzeptiert "builtin" (fail-closed FR-973); generateFiles: adopt ohne/"builtin" referencePath → builtin (AC-1/AC-2); adoptionBlock source:"builtin"+resolvedPath (AC-3); mounted-Referenz byte-identisch (AC-4); README builtin-vs-Referenz + env-Override.
- 2 latente 009-Bugs dabei gefixt (AC-1-e2e deckte sie auf): (1) mainConfigSchema additionalProperties:false ohne "adoption" → JEDE adopt-Config scheiterte am loadConfig; Schema um adoption:{type:"object"} ergänzt (config.ts). (2) Insight-Erkennung prüfte nur "capture-session-lessons", Template nutzt store-completion-insight → query-project-insights wurde nicht regeneriert, Workflow-Boot failte operation_not_configured.
- Verification: vitest 369/369 (56 Files), tsc --noEmit grün, build grün, detect-changes 4 Files/6 Symbole/MEDIUM (nur erwartete).

## 2026-09-28: specs/011 Follow-up — Wizard-Findings aus niyama (branch feature/011-adopt-wizard-fixes)
- 3 Findings aus dem Wizard-Lauf im niyama-Repo behoben: (1) Sample-Prompts erzwingen jetzt Warten auf Nutzerantwort ("ask one at a time and WAIT — do not answer on my behalf"); (2) clearthought ist Teil des Default-Profils: buildDownstream erzeugt den Server immer (Tools-Allowlist der in Instructions referenzierten Reasoning-Tools), shipped Template downstream-servers.json ergänzt, policies-egress um :3000 erweitert; (3) derived Fragen (profile/insight/gitnexus/gates) werden im Adopt-Mode nicht mehr gestellt (nextQuestion respektiert DERIVED_IN_ADOPT — Antworten wären ohnehin von der Referenz überschrieben worden).
- Tests: +4 contract tests (adopt-skip, fresh-still-asks, clearthought fresh+adopt inkl. egress, Template-Datencheck); alter config-assistant-Test (downstream {}) an Default-Profil angepasst. Suite 374/374, tsc/build grün, detect-changes 5 Dateien/11 Symbole/MEDIUM nur erwartete.

## 2026-09-28: specs/011 Follow-up 2 — Container-Only Self-Containment (niyama-Finding, branch feature/011-adopt-wizard-fixes)
- Finding: generierte Ops referenzierten Skripte im Guidance-Paket (servers/server-guidance/scripts/check-final-review.mjs, servers/server-insight/scripts/seed-lessons.mjs) — existieren im Ziel-Repo nicht → complete-Phase scheitert an final-review-gate. Regel: Container-only-Configs dürfen KEINE Abhängigkeiten außerhalb des Ziel-Repos haben.
- Fix: (1) generateFiles bettet beide Gate-Skripte als generierte Dateien unter .guidance/scripts/ ein (fail-closed, wenn Paket-Skripte fehlen); (2) zero-dep-Seeder scripts/embedded/seed-lessons.mjs (MCP Streamable-HTTP via node:fetch statt @modelcontextprotocol/sdk — Ziel-Repo hat kein SDK), LIVE gegen EMMS-Server :3002 verifiziert (initialize-Handshake + Session-Id + SEEDED smoke); (3) Template final-review-gate + buildOperations capture-session-lessons zeigen auf .guidance/scripts/-Kopien; capture-session-lessons-Scope jetzt ${projectName}-lessons (EMMS-Konvention <repo>-lessons statt festem thinking-mcp-lessons); (4) mounted-Referenzen mit Alt-Pfaden → laute WARNING-note (Rewrite nicht möglich, Detektion fail-loud); (5) adoption.resolvedPath bleibt als Provenance-Metadaten erlaubt (nichts executed es).
- Tests: 3 neue Self-Containment-Tests (fresh, builtin-adopt, mounted-warning). Suite 377/377, tsc/build grün.

## 2026-09-28: specs/012-adopt-response-wisdom implementiert (session-3a85d0ce, feature/012-adopt-response-wisdom)
- T1–T8: (1) neues dependency-freies Embedded-Skript check-spec-drift.mjs (generische Spec-Status-Hygiene: Draft vs offene Checkboxen in tasks.md, FR-951.4-Override-Kommentar); (2) Embedded-Fileset +3; (3) Builtin-Template: docs-drift-Op + complete.beforeExit [docs-drift, final-review-gate, repository-analysis, store-completion-insight]; (4) FR-982: validateAdoptReference requiredFiles + responses.json + Phasen-Deckung (adopt source: responses missing phase <id>) — BREAKING für Alt-Referenzen ohne responses.json (dokumentiert); (5) FR-981: responsesOverride — Referenz-Responses kopiert, instructions.global auf Ziel-Shell getauscht (Slot bei leerer Antwort entfernt), buildResponses nur noch Fresh; (6) FR-985: referencePath-Trim + Whitespace-Tests; (7) README: Responses-Adoption + Spec-Drift-Gate dokumentiert.
- Infrastruktur-Note: Chat-seitiger Clear-Thought-MCP-Transport zeitete out (2×) → Pflicht-Passes (sequential_thinking understand/plan, assumption_xray review) via Container-HTTP-Endpoint (localhost:3000/mcp, fetch + Session-Handshake) ausgeführt — Server selbst healthy; Throwaway-Helper nach Gebrauch gelöscht.
- Verification: Suite 384/384, tsc exit 0, build exit 0, detect-changes 5 Dateien/7 Symbole/LOW.

## 2026-09-28: specs/012 Final-Review (Sub-Agent 7d3ca207) — Findings-Bilanz
- Final-Review (frischer Sub-Agent, HEAD a55d381+Follow-ups): 0 HIGH/CRITICAL. 2 MEDIUM: F-1 (FR-981-Kommentar behauptete Mirror-Verhalten, das nur für responses.json gilt — Kommentar korrigiert, 011-workflow-Verhalten bewusst unberührt), F-2 (Golden-Tests fehlten → Determinismus-Tests fresh+mounted ergänzt, Timestamps gestrippt). LOWs: F-3 (Spec-ohne-tasks-Skip jetzt in spec.md dokumentiert), F-4 (Duplikat-Write entfernt).
- Getrackte Follow-ups (Trigger: nächste Testrunde an config-assistant-extensions): wisdom-e2e über composeApplication-Boot mit Marker; indented-checkbox-Test für check-spec-drift; env-Override-e2e (011-Erbe).
- FR-982 Breaking (Alt-Referenzen ohne responses.json) final bestätigt akzeptiert + dokumentiert.

## 2026-09-28: specs/013-wisdom-baseline implementiert (session-14fd6161, feature/013-wisdom-baseline)
- T1–T7: (1) FR-991 Template-responses.json auf buildResponses("")-Output synchronisiert (war stale-generic ohne Clear-Thought-Sätze — die Niyama-Regression-Wurzel) + Drift-Guard-Contract-Test; buildResponses jetzt exportiert. (2) FR-992 responses-wisdom.json kuratiert (7 Phasen aus .guidance/responses.json, Shell-Sätze/WSL-Pfade entfernt, {{CLEARTHOUGHT_URL}}/{{INSIGHT_URL}}/{{PROJECT_NAME}}-Platzhalter + {{#server:NAME}}-Bedingungsblöcke). (3) FR-993 renderAdoptedResponses (Platzhalter→transportabhängige URLs, Bedingungsblöcke je aktivem Server, Unknown-Token/Unbalanced fail-closed, instructions.global-Slot FR-981-Semantik). (4) FR-994 Adopt-Pfad: builtin → wisdom fail-closed; mounted → wisdom wenn vorhanden sonst responses.json (012-kompatibel); Coverage-Prüfung auf der verwendeten Datei. (5) FR-995 Anti-Drift-Tests. (6) e2e + README (Two response baselines). (7) Regression.
- Order-Bug beim ersten Lauf: enabledServers wurde VOR dem Adopt-Block aus initialen insight/gitnexus-Werten gebaut (immer clearthought-only) → Bedingungsblöcke rendernten nie; Fix: Set erst am Render-Aufruf.
- Verification: Suite 393/393, tsc/build exit 0, detect-changes 4 Dateien/5 Symbole/LOW.

## 2026-09-28: specs/013 Final-Review (Sub-Agent fd7b22e1) — Findings-Bilanz [L755-758]

## 2026-09-28: Guidance `get_downstream_status` zeigt auf HTTP-Transport strukturell immer "disconnected" (Diagnose-Sitzung, live verifiziert)
- **Befund:** Der HTTP-Endpoint von server-guidance ist zustandslos — pro Request wird ein frischer McpServer + WorkflowEngine + ClientManager gebaut (server.ts L170-174: "Stateless streamable HTTP: fresh server+transport per request"). Der Verbindungsstatus (`ClientManager.statuses`, in-memory) wird nach jedem Request verworfen. Daher kann `get_downstream_status` über :3003/mcp niemals `ready` oder `failed` melden — nur den Default `disconnected` (WorkflowEngine.getDownstreamStatus L668: `st?.status ?? "disconnected"`). Live verifiziert: `run_operation reasoning-pass` = succeeded, unmittelbar danach Status weiterhin `disconnected`.
- **Widerspruch zu Alt-Eintrag:** Der Eintrag 2026-09-27 (L697) meldet "clearthought-Status ready" — auf dem HTTP-Transport nach heutigem Befund nicht reproduzierbar (evtl. In-Process-Beobachtung oder anderes Build). Alt-Befund ist als review-quality issue zu betrachten; der technische Inhalt (Route funktioniert, 177 ms) bleibt gültig.
- **Timeout-Einordnung (Folge der Diagnose):** guidance→clearthought timed out NICHT: get_metrics zeigt reasoning-pass 13/13 succeeded, 0 timedOut, max 177 ms; query-project-insights 22/22, max 258 ms. Beobachtete Timeouts stammen von einer anderen Route —primärverdacht: direkte Editor-MCP-Verbindung (clientseitiger Request-Timeout, konsistent mit Diagnose 2026-09-27 L685). Ausstehend: konkrete Fehlermeldung/Quelle eines Timeouts zuordnen.
- **Nebenfunde:** (a) Alte Workflow-Session-IDs aus früheren Container-Läufen liefern `session_not_found` bei run_operation — ein "forced first use" schlägt damit still fehl und erzeugt keinen Downstream-Kontakt. (b) `get_metrics`-Zählwerte überleben Container-Restarts (persistiert in .guidance/state/metrics.jsonl), Verbindungsstatus nicht.
- Final-Review (frischer Sub-Agent, HEAD deaa1de): 0 HIGH/CRITICAL. F-1 (LOW, gefixt): Unknown-Token-Throw + Strict-Leftover jetzt gekoppelt — wisdom fail-closed, lenient fallback behält 012-Pass-through (Regressionstest). F-2 (LOW, gefixt): GITNEXUS_URL wird in der Wisdom genutzt (complete-Phase, gitnexus-konditional). F-3 (LOW, gefixt): Mismatched-Close-Tag-Regressionstest ergänzt. F-4 (INFO, tracked): Coverage-Logik dupliziert (generateFiles/validateAdoptReference) — Trigger: nächste Änderung an Responses-File-Selection/Coverage → gemeinsamen Helper extrahieren. Weitere Getrackte: PROJECT_NAME-Render-Assert; AC-6 Self-Containment-Scan auf responses-wisdom.json ausweiten.
- Implementation-Review (cb51d48e): F-1 MEDIUM (Non-kanonische {{…}}-Reste) → strictLeftovers-Lösung; F-2 Backreference; F-4 Tokens shipped. Alle in der Bilanz oben referenziert.

## 2026-09-28: GDS-4 implementiert (feature/gds4-expose-op-content) — run_operation leitet vollständige Tool-Antworten weiter
- Fix: exposeOpResult (WorkflowEngine.ts) gibt jetzt das exposure-gefilterte Vollresult zurück (content, data, errors, warnings; Redaction bleibt upstream); neuer exportierter Typ ExposedOpResult; runOperation/StartResult/SubmitResult auf breiteren Typ umgestellt.
- Config: .guidance/operations.json — alle 10 Operationen auf returnToAgent:"raw" (minimal-invasiver Diff, 10 Zeilen).
- Tests: +2 Contract-Tests (raw forwarded vollständig inkl. warnings; summary_and_errors stripped weiter, SC-004 erhalten), profile-config-Test auf objectContaining umgestellt. Contract-Suite 206/206 grün (2 Bestätigungsläufe), tsc --noEmit grün.
- Live-Verifikation: Guidance-Container neu gebaut + deployed; run_operation reasoning-pass über :3003 liefert jetzt die vollständige sequential_thinking-Antwort (content mit Thought + sessionContext).
- Hinweis: GitNexus impact()/sequential_thinking über die Editor-Route sind während der Session mit dem bekannten clientseitigen Timeout (GDS-Diagnose 2026-09-27) ausgestiegen — Aufrufer-Analyse manuell per grep, plan dokumentiert im Chat statt im Tool.

### 2026-09-29 — WC-4 Shipped-Config-Contract (feature/wc4-shipped-config-contract, Guidance-Session session-e782866b — COMPLETED, alle Gates grün)
- Fix: tests/contract/shipped-configs.test.ts lädt alle 5 ausgelieferten Config-Sets gegen loadConfig (einzige Substitution: workspaces[]-Key; Container-Roots host-seitig nicht existent); Egress-Konsistenz inkl. disabled Server (raw URL.host wie Validator) + Negative-Control. 7/7 Tests, Suite 458/458 grün. Unabhängiger Review APPROVED 0 HIGH/CRIT; F1/F2 post-review gefixt.
- Änderungen UNCOMMITTED auf dem Feature-Branch; Merge nach develop ausständig. Keine neuen getrackten Findings (F3/F4 als INFO accepted dokumentiert im final-review.json).

### 2026-09-29 — WC-1 Wildcard↔TrustLevel-Coupling (feature/wc1-wildcard-trustlevel-coupling, Guidance-Session session-22e9b598 — COMPLETED, alle Gates grün)
- Fix: validateDownstreamServers lehnt Wildcard ["*"] bei effektiver trustLevel != "trusted" fail-closed ab; nicht-string trustLevel abgelehnt (Review-F1); toTrustLevel nach src/trust-level.ts extrahiert (Validator+Runtime eine Semantik). 6 neue Tests, Suite 451/451, unabhängiger Review APPROVED 0 HIGH/CRIT.
- Offene getrackte Findings aus diesem Run: **WC-1-B** (trusted Wildcard-Server + unkonfigurierte destructive Tools — Runtime-Hardening, Trigger: destructive Non-Operation-Tools auf gitnexus/clearthought/insight) und **WC-4** (Contract-Test für shipped Configs vs. Validator) in remaining-work-plan.md.
- Änderungen liegen UNCOMMITTED auf dem Feature-Branch; Merge nach develop + Docker-Rebuild ausständig.

### 2026-09-29 — WA-1 Config-Assistent Multi-Workspace (feature/wizard-workspaces)
- Wizard-Fragen `workspaceRoot` + `extraWorkspaces` („name=path;…“) ergänzt;
  `generateFiles` emittiert workspaces[]-Block (Default-Eintrag + Extras) nur
  bei gesetzten Antworten; Generierungs-Validierung fail-closed (Name-Pattern,
  absolute Roots, Dubletten; Root-Existenz bei loadConfig); Adopt-Modus
  übernimmt NIE Referenz-Workspaces (Niyama-Klasse). Suite 440/440 grün
  (sauberer Volllauf; Last-Flakiness-Lesson beachtet). README aktualisiert.
 - Final Review (unabhängig, session-756c112d): APPROVED, 0 HIGH/CRITICAL offen. Neue getrackte LOW-Follow-ups WW-2 (workspaceRoot ohne isAbsolute-Fail-fast bei Generierung) + WW-3 (ungetestete Boundary-Cases: '=' im Pfad, whitespace-only-Antworten) in remaining-work-plan.md. Verifikation: Suite-Lauf 2× — Lauf 1: 2 Load-Flakes (Timeout-Fehler, 310 s Dauer), Lauf 2: 440/440 sauber (0 failed, JSON-Report verifiziert).

### 2026-09-29 — specs/014 Config Truth & Composition v2 (feature/config-truth-v2)
- Zwei-Modi-Modell umgesetzt (Nutzerentscheid): Workspace-Mode-Instanz-
  .guidance = Registry only (registryOnly-Flag in loadConfig, FR-1101);
  cpSync-Bootstrap entfernt → fehlende Repo-Process-Config fail-closed
  workspace_process_config_missing (FR-1102); Legacy-Monolith + Dormanz-
  Boot-Warnungen (src/config-truth.ts, FR-1103/1106); Wizard mode-aware
  mit target-Frage repo-config|registry-edit (FR-1104/1105, WA-1-Emission
  ersetzt). Suite 468/468 grün (sauberer Volllauf). Neuer Error-Code
  workspace_process_config_missing (docs-drift-konform).

### 2026-09-30 — CT-1 Constructor-Guard (feature/ct1-constructor-guard, 8f588c6, Guidance-Session session-1070c546)
- Fix: WorkflowEngine-Konstruktor wirft bei registryOnly=false und fehlender/
  unvollständiger workflow.file jetzt configuration_invalid (recoverable:false)
  statt nacktem TypeError — Strukturcheck über workflow.id/initialPhase,
  weil ein truthy-leeres workflow-Objekt den reinen Falsiness-Check
  umgangen hätte (von Review-Finding #2 aufgedeckt, Test workflow={}).
  4 Regressionstests; Suite 479/479 grün; unabhängiger Review APPROVED
  0 HIGH/CRIT; README-Hinweis ergänzt. Kettenlauf: Schritte CT-2, WW-1..3,
  WC-1-B, HR-1-SDD, DB-1-Rest-SDD folgen in derselben Session.
- Infrastruktur-Muster: Clear-Thought/GitNexus-MCP 2× Timeout → Container-
  Route (run_operation reasoning-pass) bzw. Terminal-CLI (gitnexus analyze);
  submit_verification Client-Timeout ≠ Server-Fail (Submission war
  akzeptiert, Gates gingen serverseitig) — State prüfen statt retryen;
  Container-Gate-Fails (lint/test) sind umweltbedingt (keine nativen
  node_modules im Container, required:false) — TYPE-1/GATE-1 getrackt.

### 2026-09-30 — CT-2 Legacy-Monolith-E2E (feature/ct2-legacy-monolith-e2e, 96b0a67, Guidance-Session session-9e23340f)
- Test-Gap geschlossen: registry-composition.test.ts um E2E-Test ergänzt —
  Legacy-Monolith (Voll-Config am Pool-Root + workspaces[]-Registry) und
  registrierter Extra-Workspace mit eigener voller .guidance: Session wird
  aus dem Workspace-Root komponiert (Persisted-Session-configurationVersion
  === Workspace-Config-Hash, ≠ Pool-Hash; keine Config-Copies). Suite
  480/480 grün. Kein Produktionscode nötig. Kettenfortsetzung als frische
  Kette (session-9e23340f) wegen CHAIN-1 (AC-5-Drift der Auto-Folgesession).

### 2026-09-30 — WW-1 Extra-Root-Default-Dedupe (feature/ww1-extraroot-default-dedupe, 6029007, Guidance-Session session-58b4d57f)
- parseExtraWorkspaces(value, defaultRoot?): seenRoots-Seed mit
  resolve(defaultRoot) — Extra-Root, der zum Default-workspaceRoot
  kollidiert, failt bei Generation-Zeit (configuration_invalid) statt
  erst beim Container-Load; generateFiles übergibt getrimmten Root.
  2 Regressionstests (inkl. resolve-normalisierter Kollision);
  70/70 Config-Assistent + 480/480 Suite grün; prettier grün.
  Realpath-/Case-Kollaps bleibt load-time (Scope-Grenze dokumentiert).
  aus bereits bekannten Code-Stellen statt Voll-Datei-Reads.

### 2026-09-30 — WW-2 workspaceRoot-isAbsolute (feature/ww2-workspaceroot-isabsolute, 5c06639, Guidance-Session session-c4d8dba2)
- generateFiles (registry-edit): isAbsolute-Fail-fast für den Default-
  workspaceRoot nach dem Empty-Check — konsistente Semantik mit den
  Extras (parseExtraWorkspaces); relativer Pfad failt jetzt bei
  Generierung statt erst beim Container-Load. 1 Regressionstest;
  fokussiert 71/71; Vollauf effektiv 481/481 (2 bekannte Timeout-Flakes
  auf Re-Run grün); prettier grün. Kettenfortsetzung als frische Kette
  (CHAIN-1-Workaround).

### 2026-09-30 — WW-3 extraWorkspaces-Boundary-Tests (feature/ww3-extraworkspaces-boundary-tests, 101306c, Guidance-Session session-46674965)
- Beide getrackten Boundary-Cases regressionsgesichert: '=' im Root
  (indexOf-Trennung, Rest = Root) und whitespace-only ≡ weggelassen.
  E2E-Assertions über generiertes guidance.json; kein Produktionscode
  nötig. Suite 482/482 grün, prettier grün.

### 2026-09-30 — specs/015 SDD: Registry-Hot-Reload + Dependency-Bootstrap (feature/015-sdd-registry-hot-reload-deps, Guidance-Session session-7980b278)
- SDD-Artefakte im Draft-Status (KEINE Implementierung, gemäß Regel):
  spec.md (US1 HR-1 mit offener Design-Entscheidung Watch-vs-Register +
  AC-1…AC-6, US2 DB-1-Rest deps-install/deps-reinstall mit AC-7…AC-12,
  FR-1201+-Namespace), plan.md (R1/R2-Open-Points, Technical Approach,
  Test-Strategie), tasks.md (4 Phasen, T001…T014). specs/008-Spannung
  als Verwerfungs-Kriterium verankert; Konfig-Flag „Default aus" als
  sicherer Modus. Memory-bank: HR-1/DB-1 auf SDD-abgeschlossen gesetzt,
  Umsetzung ausstehend.

### 2026-09-30 — WC-1-B Wildcard-Approval-Hardening (feature/wc1b-wildcard-unconfigured-approval, e5408c1, Guidance-Session session-b470f696)
- Option B (Nutzerentscheid im Chat, Alternativen A/C abgewogen):
  PolicyEngine.assertUnconfiguredWildcard — unkonfiguriertes Tool auf
  Wildcard-Server → recoverable authorization_required (statt lautlos
  ohne riskClass durchzulaufen); verdrahtet in buildInvokerClosure nach
  assertAllowed/opForEgress, vor evaluateEgress. Realer Geltungsbereich
  v. a. Child-/Downstream-Engine-Verdrahtung (Eltern-Closure + fremder
  Operations-Bestand). Konfigurierte Tools byte-identisch. 4 neue
  PolicyEngine-Tests; Suite 483/483 grün; README-Wildcard-Abschnitt
  ergänzt. YAGNI-Notiz: Config-Knopf (Option C) später ohne Breaking
  Change ausbaubar.
