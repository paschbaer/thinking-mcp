# Tasks: 010-documentation-drift-gate

## P1 — Gate-Skript

- [x] T1 `check-docs-drift.mjs`: Tool-Parität (Quelle: SPEC_KIT_TOOL_NAMES +
  WORKFLOW_TOOL_NAMES ↔ README-Tool-Tabelle) — FR-951.1
  (Evidence: beide Richtungen implementiert (Forward: Tool-Zeile je registriertem Tool;
  Reverse: README-Tool-Zeile ohne src-Registrierung); Regression: tests/scripts/check-docs-drift.test.ts.
  Final-Review-Fund "Check 1 No-op" (HIGH) gefixt; dadurch echter Rest-Drift gefunden und saniert:
  README-Zeilen für run_operation, get_metrics, approve_plan_change, apply_plan_change ergänzt)
- [x] T2 `check-docs-drift.mjs`: Frage-Katalog-Parität (QUESTIONS-IDs ⊆
  README) + ERROR_CODES-Tabelle-Parität — FR-951.2/3
- [x] T3 `check-docs-drift.mjs`: Spec-Status-Hygiene (dateibasiert, Draft +
  alle-Checkboxen-[x] ⇒ Meldung; Override-Kommentar) — FR-951.4
- [x] T4 Negative-Fälle: fehlende README, kein specs-Verzeichnis, kein `.git`,
  `.bak`-Ausnahme — AC / N-AC-1..4

## P2 — Verdrahtung

- [x] T5 `docs-drift`-Op in `.guidance/operations.json` (read_only, timeout 60)
  + workflow.json `complete.beforeExit` VOR `final-review-gate` — FR-952
  (Evidence: JSON-Parität OK, Gate-Lauf Exit 0; 2026-09-27)

## P3 — Lifecycle docsImpact

- [x] T6 `docsImpact` in submit_task_implementation-Evidence (Pflicht bei
  Muster-Treffer, `submission_invalid` sonst); Contract-Doku — FR-954
  (Evidence: SpecKitEngine.ts DOCS_RELEVANT_PATTERNS + Validierung; Contract specs/002 aktualisiert)
- [x] T7 lifecycle-Tests: docsImpact fehlt/`none`/`updated:` (AC-5)
  (Evidence: tests/speckit/lifecycle.test.ts, 4 Tests, speckit-Suite 53/53 grün; Review: Segment-Matching + Bare-'none'-Fall ergänzt)

## P4 — Docs & Sanierung

- [x] T8 README: „Error codes"-Tabelle (alle ERROR_CODES) + Tool-Tabelle
  Sanierung — Q3 (Evidence: Gate Exit 0 — 35 tools, 6 questions, 80 error codes;
  Assistenten-Kapitel configSource fresh/adopt durch Vorgängersession abgedeckt, verifiziert)
- [x] T9 Q3-Sanierung: 006/007-Checkboxen, Spec-Status 005/006/007 → Implemented
  (bereits erledigt 2026-09-27, verifizieren) (Evidence: grep-Verifikation —
  005/006/007 Implemented, 006/007 tasks.md 0 offene Checkboxen; 001/002 Draft intentional, Gate grün)

## P5 — Abschluss

- [x] T10 AC-1..AC-4 + N-AC-1..4 als Tests; Vollsuite + tsc + build;
  Memory-Bank-Update (Evidence: tests/scripts/check-docs-drift.test.ts 12 Tests
  (AC-1..4 inkl. Override/Kapitel-Scoping/Freitext-Ausschluss, N-AC-1/2/4);
  Vollsuite 56 Dateien/357 Tests grün, tsc exit 0, build exit 0, Gate Exit 0)
- Batch 1 (T1-T4) completed 2026-09-27: Gate live, Exit 0 (35 tools, 6 questions, 80 error codes). Negative-Fälle per Design abgedeckt (fehlende README fail-closed, leerer specs-Baum still, kein .git dateibasiert, .bak-Ausnahme).
- Batch 2 (T5-T10) completed 2026-09-27: Verdrahtung live (docs-drift VOR final-review-gate), docsImpact im Lifecycle erzwungen, Vollsuite grün. Batch-/Task-Lifecycle per dokumentiertem State-Injection-Workaround gesetzt (Client ohne release_batch/verify_task).
