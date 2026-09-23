# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

**Last updated:** 2026-09-16

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
