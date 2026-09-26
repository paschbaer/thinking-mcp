# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

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

## 2026-09-24: Security-/Policy-Verifikation (Phase 5/6-Fixes) + Rest-Fixes
- User-Anderungen verifiziert (Code + Container-Tests, node:22-alpine): Phase 6 Egress-Inhaltsprüfung (`containsSecretPattern` für restricted), `redactUnknown()`-Seam auf content + protocolMetadata.structuredContent, Multi-Line-Redaction, Capability-Pin-Persistenz über Restarts. 192/192 grün + tsc clean.
- Rest-Fixes umgesetzt: saveCapabilityPins atomar (tmp+rename), Pin-Helfer exportiert, Regressionstest tests/workflow/capability-pins.test.ts (5 Tests: Roundtrip/Merge/Drift/Korrupt/Atomarität). Suite 197/197 grün, tsc clean.
- remaining-work-plan.md gesynct: L264/L266 (Phase 5/6) + CB-1/CB-2/CB-9 auf [x] mit Evidence; neue Sektion „Security-/Policy-Verifikation". Verbleibende Guidance-Offenpunkte: Metrics-Tool (L260), awaiting_client-Spec (L305d), Rest-LOWs aus R-1..R-3 (akzeptiert).
- Testumgebung-Lesson: kein Node auf Host-PATH; Container-Run braucht Repo-COPY (Mount-EACCES bei npm install) + @rollup/rollup-linux-x64-musl nachinstallieren (bekannte native-Bindings-Falle).
