# Specification: Config-Assistant Extensions (Default-Config-Adoption, Shell-Promotion, Template-Hook)

**Feature ID:** `009-config-assistant-extensions`
**Basis:** Nutzer-Anfrage 2026-09-27 (Shell-Prompt, Default-Config-Adoption, Template-Idee)
**Namespace:** FR-901+ (keine Kollision: 008 nutzt FR-801…808)
**Status:** Draft — Plan-Phase ausstehend
**Date:** 2026-09-27

## Overview

Der Config-Assistent (`setup_guidance_*`, `src/setup/ConfigAssistant.ts`)
scaffoldet `.guidance/` per Frage-Katalog. Drei Erweiterungen:

1. **Default-Config-Adoption:** Nutzer wird gefragt, ob die erprobte
   Thinking-MCP-Konfiguration übernommen oder alles neu erstellt werden soll.
2. **Shell-Promotion:** Die vorhandene `shell`-Antwort fließt heute nur in den
   Understand-Instruction ein — künftig in ALLE agent-facing Phase-Instructions
   (bzw. einen dedizierten globalen Instruction-Slot).
3. **Template-Hook (reserviert):** Sprachspezifische Config-Templates
   (TypeScript/Python/C#) — Struktur wird vorbereitet, Umsetzung out of scope.

## Ist-Zustand (verifiziert)

- Frage `shell` existiert (id `shell`, Freitext, agent-facing); Antwort wird in
  `buildResponses(shell)` als Setup-Satz **ausschließlich** in der
  Understand-Instruction eingebettet. Begründung im Code: ein `shell`-Feld in
  `guidance.json` wird von der stricten Config-Validierung abgelehnt — daher
  Umweg über die Instruction.
- `generateFiles(answers)` erzeugt ALLE `.guidance/`-Dateien neu (fresh) —
  eine Übernahme bestehender Konfigurationen existiert nicht.

## Functional Requirements

- **FR-901 Config-Quelle:** Neue Frage `configSource` (`fresh` | `adopt`).
  Bei `adopt` basieren `workflow.json`, `operations.json`, `policies.json`,
  `downstream-servers.json` und die Phase-Instructions auf einer
  Referenzkonfiguration (Default: die dieses Repos, `/workspace/.guidance/`);
  `guidance.json` wird IMMER regeneriert (neuer `project.name`, neue Pfade).
  Herkunft wird in `notes` dokumentiert (Audit).
- **FR-902 Referenz-Pfad:** Die Referenzkonfiguration ist konfigurierbar
  (Setup-Frage mit Default `/workspace/.guidance/`); Validierung: muss
  existieren und eine valide `guidance.json` enthalten, sonst fail-closed
  mit klarer Meldung.
- **FR-903 Adopt-Subset:** Beim Adopt werden nur prozesstragende Dateien
  übernommen (`workflow`, `operations`, `policies`, `responses`,
  `downstream-servers`, `schemas/`); NICHT: `state/`, `workspaces[]`,
  projekt-spezifische Gate-Skript-Argumente (werden auf den neuen
  `project.name`/Pfade umgeschrieben oder als Anpassungs-Hinweis geliefert).
- **FR-904 Shell-Promotion:** Die `shell`-Antwort wird in den Instructions
  ALLER Phasen eingebettet (statt nur understand) — oder in einen dedizierten
  globalen Instruction-Kanal, falls die Workflow-Definition einen solchen
  erhält. Encoding wie heute (Setup-Satz, Freitext).
- **FR-905 Template-Hook (reserviert, nicht implementiert):**
  `generateFiles` erhält einen optionalen Template-Parameter; Sprach-Erkennung
  (Lockfiles/`pyproject.toml`/`*.csproj`) + Template-Auswahl ist Out of Scope
  und wird als Follow-up getrackt.

## Open Questions (vor Plan-Phase zu klären)

- **Q1 Adopt-Mechanik:** Kopiert der Assistent die Referenzdateien direkt aus
  einem Pfad (FR-902), oder werden die Referenzdateien als eingebettete
  Templates im Assistenten gepflegt (Duplikationsrisiko)?
- **Q2 Projekt-spezifische Reste:** Die Thinking-MCP-Config enthält
  repo-spezifische Gates/Argumente (z. B. `check-final-review.mjs`-Pfade,
  Smithery-Ops). Adopt = 1:1-Kopie mit Anpassungs-Hinweisen, oder Teil-Subset
  (nur workflow/policies, gates nur bei expliziter Zustimmung)?
- **Q3 Shell-Kanal:** Einbettung in jede Phase-Instruction (einfach, Text-
  Duplikation) vs. neuer globaler Instruction-Slot in `workflow.json`
  (sauberer, aber Workflow-Format-Änderung)?

## Acceptance Criteria (entscheidungsunabhängig)

- **AC-1** Adopt-Flow erzeugt eine vollständige, valide `.guidance/`-Menge für
  ein fremdes Repo (Config-Load + Workflow-Boot erfolgreich).
- **AC-2** `shell`-Antwort erscheint in den Instructions aller Phasen (oder im
  gewählten globalen Kanal) und in keiner Phase mehr fehlend.
- **AC-3** Fresh-Flow verhält sich exakt wie heute (kein Verhaltenwechsel).
- **AC-4** Herkunft der generierten Dateien (fresh/adopt + Quelle) ist in
  `notes`/Audit nachvollziehbar.
- **AC-5** `state/` und `workspaces[]` werden beim Adopt nie übernommen.

## Out of Scope

- Sprach-Templates (reserviert via FR-905)
- Laufzeit-Registrierung von Workspaces (bleibt statisch, specs/008 Q3-Entscheid)
- Remote-Mode-Interaktion mit dem Assistenten
