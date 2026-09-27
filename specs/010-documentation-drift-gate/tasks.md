# Tasks: 010-documentation-drift-gate

## P1 — Gate-Skript

- [x] T1 `check-docs-drift.mjs`: Tool-Parität (Quelle: SPEC_KIT_TOOL_NAMES +
  WORKFLOW_TOOL_NAMES ↔ README-Tool-Tabelle) — FR-951.1
- [x] T2 `check-docs-drift.mjs`: Frage-Katalog-Parität (QUESTIONS-IDs ⊆
  README) + ERROR_CODES-Tabelle-Parität — FR-951.2/3
- [x] T3 `check-docs-drift.mjs`: Spec-Status-Hygiene (dateibasiert, Draft +
  alle-Checkboxen-[x] ⇒ Meldung; Override-Kommentar) — FR-951.4
- [x] T4 Negative-Fälle: fehlende README, kein specs-Verzeichnis, kein `.git`,
  `.bak`-Ausnahme — AC / N-AC-1..4

## P2 — Verdrahtung

- [ ] T5 `docs-drift`-Op in `.guidance/operations.json` (read_only, timeout 60)
  + workflow.json `complete.beforeExit` VOR `final-review-gate` — FR-952

## P3 — Lifecycle docsImpact

- [ ] T6 `docsImpact` in submit_task_implementation-Evidence (Pflicht bei
  Muster-Treffer, `submission_invalid` sonst); Contract-Doku — FR-954
- [ ] T7 lifecycle-Tests: docsImpact fehlt/`none`/`updated:` (AC-5)

## P4 — Docs & Sanierung

- [ ] T8 README: „Error codes"-Tabelle (alle ERROR_CODES) + Tool-Tabelle
  Sanierung — Q3
- [ ] T9 Q3-Sanierung: 006/007-Checkboxen, Spec-Status 005/006/007 → Implemented
  (bereits erledigt 2026-09-27, verifizieren)

## P5 — Abschluss

- [ ] T10 AC-1..AC-4 + N-AC-1..4 als Tests; Vollsuite + tsc + build;
  Memory-Bank-Update
- Batch 1 (T1-T4) completed 2026-09-27: Gate live, Exit 0 (35 tools, 6 questions, 80 error codes). Negative-Fälle per Design abgedeckt (fehlende README fail-closed, leerer specs-Baum still, kein .git dateibasiert, .bak-Ausnahme).
