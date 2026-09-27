# Tasks: LOW-Residue Closure

**Feature**: specs/008-low-residue-closure · **Date**: 2026-09-27
**Principles**: Test-First; conventional commits; `gitnexus analyze --no-stats` vor jedem Commit.

## Phase 1 — LOW-Reste (P3)

- [x] T001 [FR-801] Stream-Semantik dokumentieren + test pinnen: alternierende out/err-Ausgaben eines Childs werden getrennt erfasst; Failing-stderr erreicht den Fehlerpfad redigiert — `tests/orchestration/operation-engine-async.test.ts` + Code-Kommentar in `runProcessAsync` (keine Cross-Stream-Ordering-Garantie, bewusst)
- [x] T002 [FR-802] Router-Proxy: `WorkflowEngine`-Router als Proxy mit Get-Forwarding unbekannter Properties an die Downstream-Engine (funktionsgebunden); `execute`/`executeRequired` Routing unverändert; Test: unbekannter Member-Zugriff liefert funktionsfähige Downstream-Funktion
- [x] T003 [FR-803] specs/007 FR-705-Wortlaut korrigieren (soft cap; held nie evicted; temporäres Überschreiten unter Contention möglich) + memory-bank L-2-Rest synchronisieren

## Phase 2 — L253-Ersatz (P3)

- [x] T004 [FR-804] Prompt-Auslieferung: `prompts/capture-lessons.prompt.md` im Paket (Kopie des Masters mit Header-Verweis), `files`-Eintrag in package.json, README-Abschnitt „Capture-lessons prompt from other repos"

## Phase 3 — Abschluss

- [x] T005 Full regression + typecheck + build (SC-805); Memory-Bank-Closures (L-2/L-4/L-5/Interleaving final); final review per Protokoll (fresh sub-agent); merge to develop
