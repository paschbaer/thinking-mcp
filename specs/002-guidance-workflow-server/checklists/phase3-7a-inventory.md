# Phase-3/7a/7b-Reste — Inventar (spec 006 US5, FR-505)

Stand: 2026-09-26, geprüft gegen develop @ 60b2edd (grep + Testbestand).
Quelle der Items: memory-bank/remaining-work-plan.md (Phase-3/7a/7b-
Review-Zeilen L537/L543/L545/L547/L549).

## Phase 3 (Review 2026-09-22)

| Item | Status | Evidence |
|---|---|---|
| F1 requestId-Ledger-Check über Status-Checks | **ERLEDIGT** | Test `idempotency-completion.test.ts` „duplicate requestId replays the recorded result…" besteht (Replay nach Completion liefert Record) |
| F2 audit/accept-persist ordering on op failure | Offen (LOW) | getrackt in remaining-work-plan; kein bekannter Defekt-Fall |
| F3 stale-copy reassignment in submitLocked | Offen (LOW) | Rest-Verifikation bei nächstem submitLocked-Touch |
| F4 structured-response shim für GuidanceErrors | **ERLEDIGT (beobachtet)** | GuidanceErrors erscheinen als isError-Content (E2E remote-report-token: rawError-Pfad); kein Crash |
| F6 in-process-only mutex | **OBsolet** | Remote-Mode ergänzt File-Locks (spec 003 FR-309/workspace-lock.ts); Multi-Prozess-Session-Mutex bleibt dezidiert out-of-scope |
| F7 requestId-Replay-Test | **ERLEDIGT** | Test existiert (siehe F1) |

## Phase 7a (Review 2026-09-22)

| Item | Status | Evidence |
|---|---|---|
| Snapshot-Chaining (previousSnapshotId) | **ERLEDIGT** | Feature 003 Cluster 2a: importArtifacts verkettet, SpecKitEngine.ts („2a: pass the previous state") |
| Staleness-Machinery (Hashes selbst rechnen) | **ERLEDIGT** | isSnapshotStale liest Artefakte + sha256-Vergleich |
| SpecKitState-Persistence über Restarts | **ERLEDIGT** | SpecKitStateStore (store.save/load) |
| PlanChange approve/apply | **ERLEDIGT** | Tools approve_plan_change/apply_plan_change (Cluster 2b) |
| applyReconciliation | **ERLEDIGT** | buildReconciledState verdrahtet (2b, „refresh wendet buildReconciledState an") |
| Parser-Dead-Code (TASK_LINE/ID_TOKEN/hasSection/requireFs) | **ERLEDIGT** | grep: 0 Treffer in parser.ts/src |
| Criteria-Parser nur bold-SC-Lines | Bewusst so | specs 003/005 nutzen bold-SC-Format; konsistent |
| Batch cap/phaseGroup edges | Offen (LOW) | bei nächster Batch-Änderung |
| maxEntities/maxExcerptBytes/requireUniqueMatch unused | Offen (LOW) | Konfig-Schlüssel ohne Nutzen — bei nächster Config-Änderung implementieren oder entfernen |

## Phase 7b/8/9 (Review 2026-09-22)

| Item | Status | Evidence |
|---|---|---|
| M1 absolute relativePath | **ERLEDIGT** | M1-Fix: relative Pfade („2a/2b" Kommentare) |
| M2 glob relativePath trap | **ERLEDIGT** | gleiche Fixes |
| M3 removed-task reconciliation | **ERLEDIGT** | Cluster 2b (M3 cancelled+Audit) |
| F4 previousSnapshotOverride dead field | Offen (LOW) | totet Feld — bei nächster Snapshot-Änderung entfernen |
| F5 waiver audit event | **ERLEDIGT** | spec_kit_criterion_waived (Cluster 2b) |
| F6 Plan-Change-Lifecycle-Guards | **ERLEDIGT** | approve/reject terminal, apply-Gating (2b) |
| F7 dead conjunct coverageSummary | Offen (LOW) | nächster SpecKit-Touch |
| F8 Test-Gaps | Teilweise | Contracts-Artefakt/removed-task-Tests vorhanden (2b); terminality/waiver-audit-Felder weiterhin Lücke |

## Fazit

Die Mehrheit der Phase-3/7a/7b-Reste ist durch Features 003–005 faktisch
erledigt. Verbleibend bewusst getrackt (alle LOW): F2/F3 (Phase 3),
Batch-Edges, unused Config-Keys, F4/F7 (7b), F8-Rest. Kein
Produktionsblocker; kein eigener Scope erforderlich — Abarbeitung bei den
jeweiligen Triggern.
