# Specification: Documentation-Drift-Gate (README ↔ Realität)

**Feature ID:** `010-documentation-drift-gate`
**Basis:** Prozess-Befund 2026-09-27 — wiederkehrende Doku-Drift (README-Fragenkatalog
7→9, README-Tool-Tabelle, Spec-Status stale, Checkboxen stale) trotz bestehender
Docs-Pflicht. Spec-Review Runde 1: F-1…F-11 eingearbeitet (2026-09-27).
**Namespace:** FR-951+ (kollisionsfrei verifiziert)
**Status:** Draft — Review-F-1…F-11 eingearbeitet; bereit für Plan-Phase
**Date:** 2026-09-27

## Problem

Docs-Änderungen haben kein mechanisches Gate: Veraltete README-/Spec-Inhalte
brechen nichts und sammeln sich. Bekannte Vorfälle: README-Fragenkatalog 7→9,
README-Tool-Tabelle ohne `release_batch`/`verify_task`, Spec-Status „Draft"
nach Merge (005/006/007), stale tasks.md-Checkboxen (006: 8, 007: 6),
`remaining-work-plan`-Einträge trotz Erledigung offen.

## Pfadbasis und Matching-Semantik (F-1, gilt für alle Muster)

- Alle Pfade sind **repo-root-relativ** (wie git sie liefert).
- Ein Muster matcht ein `changedFile`, wenn der Pfad **pfadsegmentbasiert auf
  das Muster endet** (Suffix-Match über Pfadsegmente; `servers/server-guidance/src/config.ts`
  matcht Muster `src/config.ts` — auch fürAufrufe aus Unterstrukturen).
- Doku-relevante Muster (konstant, erweiterbar):
  `src/mcp-server/`, `src/setup/`, `src/config.ts`, `src/types/errors.ts`,
  `specs/`, `README.md` (jeweils unterhalb `servers/server-guidance/` bzw.
  repo-root für `specs/` + `README.md`).

## Functional Requirements

- **FR-951 Drift-Skript:** `scripts/check-docs-drift.mjs` (Muster:
  `check-final-review.mjs`/`check-index-freshness.mjs`; rein lesend, kein
  Netz, kein Git-Binary zwingend) prüft deterministisch:
  1. **Tool-Parität:** Jede ID aus `SPEC_KIT_TOOL_NAMES` + `WORKFLOW_TOOL_NAMES`
     hat eine Zeile in der README-Tool-Tabelle (Match: Tool-ID am Zeilenanfang
     einer Tabellenzeile); umgekehrt keine README-Tool-Zeile ohne Quelle.
     Erster Lauf wird driftig sein (16 IDs vs. 12 Zeilen) — Sanierung gem.
     Q3 inklusive README-Tool-Tabelle.
  2. **Frage-Katalog-Parität:** Jede `QUESTIONS`-ID aus ConfigAssistant ist im
     README-Assistenten-Kapitel als ID-Substring genannt.
  3. **ERROR_CODES-Tabelle:** README erhält eine neue Tabelle „Error codes"
     (Code + Bedeutung); Prüfung = jeder registrierte Code hat eine Zeile mit
     dem Code am Zeilenanfang. Freie-Text-Matches zählen nicht.
  4. **Spec-Status-Hygiene (F-5, präzisiert):** Geprüft wird NUR: Enthält
     `specs/<id>/tasks.md` keine offene `- [ ]`-Checkbox UND ist der
     `Status:`-Header des `specs/<id>/spec.md` `Draft` ⇒ Meldung „status not
     updated". Kein Git-Log-Heuristik-Mehr (rebase/squash-sicher, da rein
     dateibasiert). Ausnahme-Override: Zeile `<!-- docs-drift: status ok -->`
     im spec.md unterdrückt die Meldung (dokumentierter Ausstieg).
- **FR-952 Gate-Verdrahtung (blocking):** Vollständige Op-Definition in
  `.guidance/operations.json` (`node scripts/check-docs-drift.mjs .`,
  timeout 60, riskClass `read_only`, validation analog `final-review-gate`)
  **plus** Einfügeposition: `phases.complete.lifecycle.beforeExit` **vor**
  `final-review-gate` — ein Doc-Fix-Commit nach dem Review darf nicht das
  `headCommit` des final-review-gates invalidieren (Reihenfolge ist Semantik).
- **FR-953 Meldungsformat:** Findings zeilenweise auf **stderr**:
  `docs drift: <artefakt> — <erwartet> vs. <gefunden>`; Feldwerte enthalten
  keine Newlines; Exit 1 bei ≥ 1 Finding, Exit 0 sonst.
- **FR-954 docsImpact (bedingte Pflicht):** `submit_task_implementation`-
  Evidence erhält `docsImpact` — Betroffenheit deterministisch über die
  Pfadmuster (siehe oben) gegen `changedFiles`:
  - Treffer ⇒ Pflicht: `"updated: <datei>"` oder `"none: <begründung>"`,
    fehlt/leer ⇒ `submission_invalid`.
  - Kein Treffer ⇒ optional, Default `none`.
  - Vertragsdokumentation (`specs/002/contracts/upstream-mcp-tools.md`,
    Evidence-Felder) wird aktualisiert (F-6); Zod-Schema bleibt
    `z.record(z.unknown())`, aber `SpecKitEngine.submitImplementation`-
    Signatur + Bestandstests (`tests/speckit/lifecycle.test.ts`) werden
    angepasst.
- **FR-955 Fail-Verhalten:** rein lesend, kein Auto-Fix.

## Acceptance Criteria

- **AC-1** Tool-Parität: künstliches Zuviel (README-Zeile ohne Quelle) und
  Zuwenig (Quell-Tool ohne README-Zeile) werden je gemeldet.
- **AC-2** Jede QUESTIONS-ID ohne README-Verweis wird gemeldet.
- **AC-3** ERROR_CODES-Tabelle: fehlende Zeile wird gemeldet; vollständige
  Tabelle läuft grün.
- **AC-4** Status-Hygiene: „Draft + alle Checkboxen [x]" wird gemeldet;
  „Draft + offene Checkboxen" NICHT (in Planung); Override-Kommentar
  unterdrückt die Meldung.
- **AC-5** `docsImpact` fehlt bei Treffer ⇒ `submission_invalid`; `none` bei
  Treffer ohne Begründung ⇒ `submission_invalid`; `updated: <datei>` grün.
- **AC-6** Vollsuite + tsc + build unverändert grün; Gate als required-Op
  verdrahtet (Reihenfolge vor `final-review-gate`).
- **AC-10** Betroffenheits-Ermittlung (FR-954): Task mit `changedFiles` ⊃
  `src/config.ts` ohne `docsImpact` ⇒ `submission_invalid`; ohne Treffer ⇒
  optional.

## Negative ACs (F-9)

- **N-AC-1** Fehlende README (Ganz-Verlust) ⇒ Gate fail-closed mit klarer
  Meldung (nicht Crash).
- **N-AC-2** Fehlendes `specs/`-Verzeichnis ⇒ Spec-Status-Prüfung skippt
  still (nichts zu prüfen), keine Meldung.
- **N-AC-3** Kein `.git` (Container-Copy-Layout) ⇒ Spec-Status-Prüfung basiert
  nur auf Dateiinhalt, kein Crash.
- **N-AC-4** `*.bak`- und Backup-Dateien werden vom Parsing ausgenommen.

## Decisions (User, 2026-09-27)

- **Q1:** Blocking required-Op (keine reine Warnung).
- **Q2:** `docsImpact` nur bei deterministisch ermittelter Doku-Betroffenheit
  (Pfadmuster-Schnittmenge, siehe oben).
- **Q3:** Alt-Drift-Sanierung im ersten Gate-Lauf — inklusive README-Tool-
  Tabelle und ERROR_CODES-Tabelle (Neuanlage).

## Out of Scope

- Auto-Fix der Dokumentation; Volltext-/Semantic-Checks
- Memory-Bank-Inhalte (bleiben außerhalb des Gates)
- Sprach-Templates für den Config-Assistenten (spec 009 FR-907)
