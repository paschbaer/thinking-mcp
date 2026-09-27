# Tasks: Remote Integrity & Operations Hygiene

**Feature**: specs/006-remote-integrity-and-ops-hygiene · **Date**: 2026-09-26
**Principles**: Test-First; conventional commits; `gitnexus analyze --no-stats` vor jedem Commit.
**Paths**: `servers/server-guidance/…` sofern nicht anders angegeben.

## Dependencies

- T002→T003 sequentiell (Ledger-Änderung). T004/T005/T006/T007/T008 unabhängig. T009 zuletzt.

## Phase 1 — US2 + US3: Lock/Report-Kern (P1)

- [x] T002 [US2] F7: Ledger `checkReportBinding`/`burn` trennen, Token in OpReport, Replay-Erkennung; Handler-Reihenfolge record→persist→burn; failing tests zuerst in `tests/contract/remote-report-token.test.ts` (Crash-Fenster-Simulation: Report vorhanden + Token restored → Replay rejected, SC-502)
- [x] T003 [US3] R-008a: WorkspaceOpLock-Einsatz je workspaceRoot (sha256-16hex-Suffix, FR-502); Engine mappt Sessions auf Locks; Bestehende Lock-Tests auf gehashte Pfade umgestellt + neuer Test „zwei Workspaces parallel" (SC-503)

## Phase 2 — Observability + Detection (P2)

- [x] T004 [US4] R-006-Residual: Kill-Eskalations-Tests (SIGTERM-ignorierender Child → timed_out nach Eskalation; Cancel → ps-Marker-Check, skipIf win32) in `tests/orchestration/operation-engine-async.test.ts` bzw. `tests/contract/tools-run-operation.test.ts` (FR-503/SC-501)
- [x] T005 [US6] F8: Scaffold-Detection erfordert `[project]`-Sektion (FR-504/SC-504); Tests: stray-pyproject → npm-Set

## Phase 3 — Spec + Inventar (P1/P2)

- [x] T006 [US1] L305d: `specs/002-guidance-workflow-server/amendments/004-remote-downstream-support.md` (DRAFT-Design, FR-501-Notiz: nummeriert im 006-Namespace als FR-601…605 um Kollision zu vermeiden) (FR-506)
- [x] T007 [US5] Phase-3/7a-Inventar: `specs/002-guidance-workflow-server/checklists/phase3-7a-inventory.md` (je Item: gültig/erledigt/verworfen + Evidence); Quick-Wins: requestId-Replay-Test für complete_workflow; Parser-Dead-Code-Entfernung bei grep-belegter Unnutzung (FR-505)
- [x] T008 [US7] PLAN: L253 → blocked (fremde Repos nicht verfügbar); Tracking-NS-Rest geschlossen (Konventionsnotiz verifiziert) (FR-507)

## Phase 4 — Abschluss

- [x] T009 Full regression + typecheck + build (SC-505); README/Memory-Bank-Updates; final review per Protokoll (fresh sub-agent); merge to develop

## Evidence-Nachtrag (Hygiene-Sync 2026-09-27)

- T002 F7: FR-501 (check/burn getrennt + persistierter Token, `client_report_invalid` bei Replay) + SC-502 — Commit 8eff254.
- T003 R-008a: WorkspaceOpLock je workspaceRoot (sha256-16hex-Suffix), SC-503-Parallelitätstest — 8eff254; realpathSync-Härtung folgte als L-4 (Feature 007).
- T004 R-006-Residual: SIGTERM-deaf → SIGKILL-Eskalation (timed_out <15s) + ps-Marker-Liveness (SC-501) — siehe remaining-work-plan Z. 647.
- T005 F8: `[project]`-Sektion-Pflicht für Scaffold-Detection — 1608bc0.
- T006 L305d: Amendment 004 (specs/002/amendments/004-remote-downstream-support.md) existiert; FR-601…605 im 006-Namespace.
- T007: checklists/phase3-7a-inventory.md existiert; requestId-Replay-Test für complete_workflow.
- T008 L253: bewusst blocked (fremde Repos nicht verfügbar); Ersatz via LR-4 (Prompt-Packaging) GELÖST.
- T009: Suite grün, gemerged nach develop (8eff254 ff.), Final-Review 0 HIGH/CRIT.
