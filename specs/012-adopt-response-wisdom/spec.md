# Specification: Adopt-Response-Wisdom (Responses-Adoption + Docs-Drift im Default-Profil)

**Feature ID:** `012-adopt-response-wisdom`
**Basis:** Niyama-Regenerations-Findings 2026-09-28: (1) Adopt regeneriert
`responses.json` generisch — gesammeltes Prozess-Wissen aus der Referenz wird
verworfen, obwohl genau das der Sinn des Adopt-Modus ist; (2) das
Docs-Drift-Gate (specs/010) fehlt im Builtin-Template komplett; (3) drei
offene LOW-Findings aus dem 011-Final-Re-Review (F-02/F-03/F-07).
**Namespace:** FR-981+
**Status:** Draft
**Date:** 2026-09-28
**Vorgänger:** 009 (Adopt-Infrastruktur), 010 (Docs-Drift-Gate),
011 (Builtin-Template, Self-Containment)

## Overview

Adopt kopiert heute `workflow.json` (Shell-Slot getauscht), regeneriert aber
`responses.json` komplett generisch — die in vielen Durchläufen verfeinerten
Phasen-Instructions der Referenz werden verworfen. Zusätzlich hält das
Builtin-Template den Stand vor specs/010: kein Docs-Drift-Gate. Diese Spec
macht den Adopt-Modus zu dem, was sein Name verspricht: gewonnenes Wissen
weiterverwenden — bei gleichzeitigem Erhalt der Container-Only-Self-
Containment-Regel (specs/011).

## Functional Requirements

- **FR-981 Responses-Adoption:** In Adopt-Mode wird `responses.json` aus der
  Referenz **kopiert** (analog `workflow.json`), nicht generiert. Der
  `instructions.global`-Slot wird gegen die Shell-Antwort des Ziels getauscht
  (gleicher Mechanismus wie bei `workflow.json`; leere Shell-Antwort ⇒ Slot
  wird entfernt). Nicht-Adopt (fresh) bleibt unverändert byte-identisch.
- **FR-982 Responses-Validierung:** `validateAdoptReference` validiert
  zusätzlich, dass die Referenz-`responses.json` existiert, parsebar ist und
  alle Phasen-Responses des kopierten `workflow.json` enthält (fail-closed mit
  `adopt source: missing/unreadable file responses.json` bzw.
  `adopt source: responses missing phase <id>`).
- **FR-983 Spec-Drift im Default-Profil:** Das Builtin-Template
  (`examples/default-guidance/`) erhält einen `docs-drift`-Prozess-Op
  (`node .guidance/scripts/check-spec-drift.mjs .`) und führt ihn in
  `workflow.json` in `complete.beforeExit` **vor** `final-review-gate` aus.
- **FR-984 Generischer Spec-Drift-Check (Re-Scope 2026-09-28, Entscheidung (a)):** Das
  repo-spezifische `check-docs-drift.mjs` (parst register-tools.ts, README-
  Tool-Table, ERROR_CODES) ist nicht generalisierbar und geht NICHT ins
  Template. Stattdessen erhält das Builtin-Template ein neues,
  dependency-freies Embedded-Skript `.guidance/scripts/check-spec-drift.mjs`
  mit generischer Spec-Status-Hygiene: für jede `specs/*/spec.md` muss gelten
  — Status != Draft sobald keine offenen Checkboxen mehr existieren;
  Escape-Hatch via Override-Kommentar in der spec.md (Konzept FR-951.4).
- **FR-985 Hardening (011-Rest-Findings):** (a) `referencePath`-Antwort wird
  wie die Env-Var getrimmt — konsistentes Fail-closed-Verhalten bei
  Whitespace; (b) Testlücken geschlossen: whitespace-env-Fall, env-Override
  e2e durch `generateFiles`, Byte-Diff-Golden-Test für mounted-Adopt
  (AC-4-Härtung).

## Acceptance Criteria

- **AC-1** Adopt-Referenz mit nicht-generischem Instruction-Inhalt (z. B.
  Marker-Satz „REFERENCE WISDOM MARKER" in einer Phase): der Satz erscheint
  im generierten `responses.json` — Wissen wird übernommen.
- **AC-2** `instructions.global` im generierten `responses.json` ist
  ausschließlich die Shell-Antwort des Ziels (Referenz-Shell-Satz ist weg;
  ohne Shell-Antwort ist der Slot abwesend).
- **AC-3** Fresh-Generierung ist zum Verhalten vor dieser Spec byte-identisch
  (Golden-File-Regression).
- **AC-4** Gemounteter Adopt: Byte-Diff-Golden-Test gegen 011-Stand, nur die
  vorgesehenen Deltas (responses-Adoption) allowed; `adoption.resolvedPath`
  nur bei builtin (Bestand aus 011).
- **AC-5** Builtin-Adopt: `docs-drift`-Op existiert, ist in
  `complete.beforeExit` vor `final-review-gate` verdrahtet, Skript liegt
  unter `.guidance/scripts/check-spec-drift.mjs` und ist dependency-frei
  (kein `@modelcontextprotocol`, keine Paket-Pfad-Referenzen).
- **AC-6** Builtin-Adopt e2e: generate → auf Disk schreiben →
  `composeApplication` → `startWorkflow` bootet; Self-Containment-Scan
  (specs/011-Contract) bleibt grün.
- **AC-7** Whitespace-`referencePath` und whitespace-env verhalten sich
  konsistent (getrimmt bzw. Default) und sind getestet.

## Out of Scope

- Sprachspezifische Templates (specs/009 FR-907)
- Änderungen am Spec-Kit-Task-Lifecycle oder an der docsImpact-Serverlogik
- Migration bestehender Zielsysteme (Regenerate-Prompt deckt das ab)
