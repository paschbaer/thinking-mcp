# Specification: Documentation-Drift-Gate (README ↔ Realität)

**Feature ID:** `010-documentation-drift-gate`
**Basis:** Prozess-Befund 2026-09-27 — wiederkehrende Doku-Drift trotz bestehender
„update the documentation"-Pflicht (Implement-Phase-Instruktion). Muster trat auf
bei: Specs 006/007 (stale Checkboxen/Status), 009 (README-Katalog 7→9 Fragen,
relative Mounts, Scaffold-Verhalten), LR-Relabel, ERROR_CODES-Erweiterung.
**Namespace:** FR-951+ (keine Kollision: 009 nutzt FR-901…910)
**Status:** Draft — Q1–Q3 entschieden (2026-09-27, blocking required-Op); bereit für Review + Plan-Phase
**Date:** 2026-09-27

## Problem

Der Guidance-Workflow hat Docs-Pflichten (Implement-Phase: „update the
documentation … LAST step"), aber **keine mechanische Kontrolle**: Veraltete
Dokumentation scheitert an keinem Gate, während Code-Drift sofort tsc/vitest/
build rot macht. Konkrete Vorfälle:

- README-Fragenkatalog „7 questions" vs. real 9 (configSource, referencePath)
- README-Tool-Tabelle ohne neue Tools (`release_batch`, `verify_task`)
- Spec-Statusfelder blieben „Draft" nach Merge (005/006/007)
- tasks.md-Checkboxen stale (006: 8 offen trotz Umsetzung; 007: 6 offen)
- `remaining-work-plan.md`-Einträge blieben trotz Erledigung offen

## Functional Requirements

- **FR-951 Dokumentations-Drift-Skript:** `scripts/check-docs-drift.mjs`
  (pattern: `check-final-review.mjs` / `check-index-freshness.mjs`) prüft
  deterministisch (kein Netz, keine LLM-Aufrufe):
  1. **Tool-Parität:** Jede ID in `SPEC_KIT_TOOL_NAMES` + `WORKFLOW_TOOL_NAMES`
     hat einen README-Eintrag (Tool-Tabelle + Abschnitts-Verweis); umgekehrt
     keine README-Tools ohne Quelle.
  2. **Frage-Katalog-Parität:** Jede `QUESTIONS`-ID aus
     `src/setup/ConfigAssistant.ts` ist im README-Assistenten-Kapitel genannt.
  3. **ERROR_CODES-Dokumentation:** Jeder registrierte Code hat einen
     README-Verweis (Tabelle oder Abschnitt).
  4. **Spec-Status-Hygiene:** Kein `specs/*/spec.md` mit Status `Draft`, dessen
     Feature-Branch bereits gemerged wurde (Heuristik: Merge-Commit im Log +
     `tasks.md` ohne offene Pflicht-Checkboxen).
- **FR-952 Gate-Verdrahtung (Q1: blocking):** Das Skript wird als
  **required**-Operation `docs-drift` in `.guidance/operations.json`
  registriert (riskClass `read_only`) und läuft im Completion-Flow vor
  `complete_workflow` — analog `index-freshness`. Exit ≠ 0 **blockiert die
  Completion** mit auditierbarer Meldung (keine reine Warnung).
- **FR-953 Meldungsformat:** Funde werden zeilenweise gemeldet:
  `docs drift: <artefakt> — <erwartet> vs. <gefunden>` (maschinenlesbar,
  ein Fund je Zeile, Exit 1).
- **FR-954 Evidence-Pflicht (Lifecycle, Q2: bedingte Pflicht über
  deterministische Betroffenheits-Ermittlung):** `submit_task_implementation`
  erhält ein Feld `docsImpact`. Die **Betroffenheit wird deterministisch aus
  den `changedFiles` des Tasks ermittelt**: Schnittmenge mit der deklarierten
  Liste doku-relevanter Pfadmuster (`src/mcp-server/`, `src/setup/`,
  `src/config.ts`, `src/types/errors.ts`, `specs/`, `README.md`).
  - Treffer ⇒ `docsImpact` ist PFLICHT: `"updated: <datei>"` oder
    `"none: <begründung>"` (fehlt/leer ⇒ `submission_invalid`).
  - Kein Treffer ⇒ Feld optional (Default `none`), kein Verhaltenwechsel.
  - Die Musterliste ist eine deklarierte, erweiterbare Konstante.
  - Bekannte Grenze (dokumentiert): verhaltensrelevante Änderungen außerhalb
    der gemusterten Pfade werden nicht erkannt — abgedeckt durch den
    Review-Vermerk, nicht mechanisch.
- **FR-955 Fail-Verhalten:** Das Skript ändert KEINE Dateien (rein lesend,
  read_only), kein Auto-Fix — Korrekturen bleiben dem Agenten/Nutzer sichtbar.

## Acceptance Criteria

- **AC-10** (FR-954) Betroffenheits-Ermittlung: Task mit `changedFiles` ⊃
  `src/config.ts` ohne `docsImpact` ⇒ `submission_invalid`; Task ohne
  doku-relevante Dateien ⇒ Feld optional.

- **AC-1** `docs-drift` schlägt fehl, wenn README-Tool-Tabelle ≠ Tool-Quellen
  (getestet mit je einem künstlichen Zuviel/Wenig-Fall).
- **AC-2** `docs-drift` schlägt fehl, wenn eine QUESTIONS-ID ohne README-Verweis.
- **AC-3** `docs-drift` schlägt fehl, wenn ein ERROR_CODE ohne README-Verweis.
- **AC-4** Spec-Status-Hygiene: gemergte Features ohne Status-Update werden
  gemeldet (AC-4, Heuristik mit dokumentierten Grenzen).
- **AC-5** `submit_task_implementation` ohne `docsImpact` → `submission_invalid`
  (Test: fehlt / `none` / `updated: <datei>` je einmal).
- **AC-6** Vollsuite + tsc + build unverändert grün; das neue Gate läuft als
  required-Op im Completion-Flow und schlägt bei drift endend zu.

## Decisions (User, 2026-09-27)

- **Q1:** Blocking required-Op (keine reine Warnung).
- **Q2:** `docsImpact` nur bei nachgewiesener Doku-Betroffenheit — ermittelt
  deterministisch über Pfadmuster-Schnittmenge mit `changedFiles` (siehe
  FR-954).
- **Q3:** Alt-Drift-Sanierung (006/007-Checkboxen, Spec-Status) im ersten
  Gate-Lauf sichtbar machen und sofort fixen.

## Decisions (offen — historisch)

- **Q1 — Gate vs. Warnung:** FR-952 als blocking required-Op [Empfehlung] oder
  nur Warnzeile in der Completion-Antwort?
- **Q2 — FR-954-Umfang:** `docsImpact` als Pflichtfeld für ALLE Tasks oder nur
  für Tasks, die `.md`-Dateien/Tool-Oberflächen berühren?
- **Q3 — Bestands-Sanierung:** Sollen die bekannten Alt-Drifts (006/007
  Checkboxen, Spec-Status) als erster Lauf des Gates sichtbar werden und dann
  sofort gefixt werden — ja [Empfehlung].

## Out of Scope

- Auto-Fix der Dokumentation (nur Detect + Melden)
- Volltext-/Semantic-Checks der README-Inhalte (nur Struktur- und
  Referenz-Parität)
- Docs außerhalb `servers/server-guidance/README.md` + `specs/**` (Memory-Bank
  bleibt bewusst außerhalb des Gates — dort greift der Review-Vermerk)
