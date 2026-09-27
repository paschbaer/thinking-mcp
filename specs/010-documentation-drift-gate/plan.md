# Plan: 010-documentation-drift-gate

**Basis:** spec.md (Review F-1…F-11 eingearbeitet; Q1–Q3 entschieden)
**Risiko:** LOW/MEDIUM — Gate ist blocking, daher False-Positive-Vermeidung
prioritär (präzise Anker statt Heuristiken).

## Architektur-Skizze

```
scripts/check-docs-drift.mjs (neu, rein lesend)
  ├─ 1 Tool-Parität: SPEC_KIT_TOOL_NAMES + WORKFLOW_TOOL_NAMES
  │    ↔ README-Tool-Tabelle (Tool-ID am Zeilenanfang)
  ├─ 2 Frage-Parität: QUESTIONS-IDs ⊆ README-Assistenten-Kapitel (Substring)
  ├─ 3 ERROR_CODES-Tabelle: README „Error codes"-Tabelle (Code am Zeilenanfang)
  ├─ 4 Spec-Status-Hygiene: tasks.md ohne offene Checkbox + Status Draft
  │    ⇒ Meldung; Override: <!-- docs-drift: status ok --> im spec.md
  └─ Findings → stderr (docs drift: …), Exit 1 bei ≥ 1 Finding
Verdrahtung (FR-952)
  ├─ operations.json: docs-drift (node, args ["."], read_only, timeout 60)
  └─ workflow.json: complete.lifecycle.beforeExit VOR final-review-gate
Lifecycle (FR-954)
  └─ submit_task_implementation: docsImpact-Pflicht bei Muster-Treffer
     (DOCS_RELEVANT_PATTERNS), sonst optional; Contract-Doku + lifecycle
     Tests aktualisieren
```

## Phasen

### P1 — Gate-Skript (FR-951/953, AC-1..AC-4, N-AC-1..4)
1. `scripts/check-docs-drift.mjs`: rein lesend; Checks 1–4 gem. spec; Findings
   zeilenweise auf stderr (`docs drift: …`); Exit 0/1.
2. Negative-Fälle: fehlende README, fehlendes specs-Verzeichnis, kein `.git`,
   `.bak`-Dateien vom Parsing ausgenommen (N-AC-1..4).

### P2 — Gate-Verdrahtung (FR-952)
3. `operations.json`: `docs-drift`-Op (node, args `["."]`, read_only, timeout
   60, required) — **vor** `final-review-gate` in `complete.beforeExit`.
4. `README.md`: neue Abschnitte „Error codes"-Tabelle + Tool-Tabelle
   Sanierung (Q3: 16 Tool-IDs + fehlende ERROR_CODES-Tabelle beim ersten Lauf
   expected-grün machen).

### P3 — Lifecycle docsImpact (FR-954, AC-5/AC-10)
5. `submit_task_implementation`: `docsImpact`-Feld; Betroffenheit =
   Schnittmenge `changedFiles` ↔ `DOCS_RELEVANT_PATTERNS`; Treffer ohne
   gültiges Feld ⇒ `submission_invalid`; Zod-Schema unverändert
   (`z.record(z.unknown())`), Contract-Doku (`specs/002/contracts/…`) +
   lifecycle-Tests aktualisieren.

### P4 — Abschluss
6. Q3-Sanierung finalisieren (006/007-Checkboxen, Spec-Status, README-Tabellen);
   Vollsuite + tsc + build; Memory-Bank.

## Testfälle (je mit erwartetem Ergebnis)

- Gate: Zuviel-/Zuwenig-Tool, fehlende Frage-ID, fehlender ERROR-Code,
  Status-Hygiene-Fall, Override-Fall, fehlende README, kein `.git`, `.bak`
- Lifecycle: `docsImpact` fehlt/`none`/`updated:` je einmal
- Regression: Bestandssuite unverändert grün
