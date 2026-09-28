# Specification: Wisdom-Baseline (gerenderte Adopt-Responses für Ziel-Repos)

**Feature ID:** `013-wisdom-baseline`
**Basis:** Niyama-Regeneration 2026-09-28 (Anschlussbefund zu 012): Das
Builtin-Template-`responses.json` ist veraltet (stale ggü. `buildResponses()`)
und generisch — Adopt-Ziele bekamen weder das aktuelle Generikum noch das
gesammelte Prozess-Wissen. Nutzerentscheidung 2026-09-28: ZWEI Baselines —
Fresh = generische Baseline, Adopt = **Wisdom-Baseline**, die der
Config-Assistent auf das Ziel-Repo rendert.
**Namespace:** FR-991+
**Status:** Draft
**Date:** 2026-09-28
**Vorgänger:** 009/011/012 (Adopt-Infrastruktur, Builtin-Template,
Responses-Adoption)

## Overview

Das Builtin-Template erhält zwei Responses-Dateien: `responses.json` (die
generische Baseline, identisch zum Fresh-Generator-Output) und
`responses-wisdom.json` (die kuratierte Wisdom-Baseline mit Platzhaltern und
server-konditionalen Absätzen). Der Config-Assistent rendert im Adopt-Mode
die Wisdom-Baseline auf das Ziel-Repo: transportabhängige URLs, Shell-Slot,
serverkonditionale Absätze je nach konfigurierten Downstream-Servern.
Gemountete Referenzen ohne Wisdom-Datei verhalten sich wie in 012 (deren
`responses.json` wird kopiert).

## Functional Requirements

- **FR-991 Fresh-Baseline-Sync:** `examples/default-guidance/responses.json`
  wird neu erzeugt als exakter Output von `buildResponses("")`. Ein
  Contract-Test (Drift-Guard) assertions: Template-Datei ≡
  `buildResponses("")` (byte-identisch nach Newline-Normalisierung); der Test
  schlägt fehl, sobald der Generator sich ändert, ohne das Template zu
  synchronisieren.
- **FR-992 Wisdom-Baseline-Datei:** Neu
  `examples/default-guidance/responses-wisdom.json` — kuratiert aus der
  Thinking-MCP-Referenz (`.guidance/responses.json`), deployment-neutral
  gemacht: keine harten Host-/Pfad-Angaben (stattdessen Platzhalter), kein
  repo-spezifischer Shell-Bezug (stattdessen Platzhalter), keine
  Ziel-Repo-Pfade. Platzhalter-Konvention: `{{CLEARTHOUGHT_URL}}`,
  `{{INSIGHT_URL}}`, `{{GITNEXUS_URL}}`, `{{PROJECT_NAME}}`; server-
  konditionale Absätze als `{{#server:NAME}}…{{/server:NAME}}`.
- **FR-993 Renderer:** `renderAdoptedResponses(wisdom, target)` im
  ConfigAssistant ersetzt Platzhalter (transportabhängige URLs analog
  `insightUrl`/`gitnexusUrl`/`clearthoughtUrl`, Projektname), rendert
  Bedingungsblöcke nur bei aktivem Downstream-Server und setzt
  `instructions.global` auf die Shell-Antwort des Ziels (Slot entfernt bei
  leerer Antwort — FR-981-Semantik). Fresh-Modus rendert NICHT.
- **FR-994 Adopt-Pfad:** Builtin-Adopt rendert `responses-wisdom.json` (bei
  Fehlen fail-closed `adopt source: missing/unreadable file
  responses-wisdom.json`); gemountete Referenzen ohne `responses-wisdom.json`
  verwenden deren `responses.json` wie in 012 (FR-981 unverändert).
  `validateAdoptReference` validiert die Datei, die tatsächlich verwendet
  wird (Phasen-Deckung, Parsebarkeit).
- **FR-995 Anti-Drift Wisdom-Baseline:** Contract-Tests sichern: (a) die
  Wisdom-Baseline deckt alle Workflow-Phasen ab, (b) sie unterscheidet sich
  messbar von der generischen Baseline (kein stilles Verwassen), (c) sie
  referenziert nur definierte Platzhalter/Server-Namen.

## Acceptance Criteria

- **AC-1** Template-`responses.json` ≡ `buildResponses("")` (Drift-Guard
  grün; nach Sync).
- **AC-2** Builtin-Adopt: generiertes `responses.json` enthält die gerenderte
  Wisdom-Baseline — Wisdom-Marker aus `responses-wisdom.json` sind vorhanden,
  URLs entsprechen dem Transport (`stdio` → `localhost`, `http-docker` →
  `host.docker.internal`), `{{…}}`-Reste sind abwesend.
- **AC-3** Server-konditionale Absätze: bei `insight=false` fehlt der
  Insight-Absatz im Output (und umgekehrt); Shell-Slot nach FR-981.
- **AC-4** Mounted-Referenz ohne `responses-wisdom.json`: deren
  `responses.json` wird unverändert adoptiert (012-Verhalten, inkl.
  Wisdom-Marker-Test).
- **AC-5** Fresh-Modus byte-identisch zum 012-Stand (Golden).
- **AC-6** Builtin-Adopt-e2e (generate → composeApplication → startWorkflow)
  inkl. Self-Containment-Scan grün; gerenderte Responses enthalten keine
  `{{…}}`-Platzhalter-Reste.

## Out of Scope

- Sprachspezifische Templates (specs/009 FR-907)
- Automatische Übersetzung/Natural-Language-Anpassung der Wisdom-Inhalte
- Änderungen am docsImpact-Verhalten oder Spec-Kit-Lifecycle
