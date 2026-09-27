# Specification: Config-Assistant Extensions (Default-Config-Adoption, Shell-Promotion, Template-Hook)

**Feature ID:** `009-config-assistant-extensions`
**Basis:** Nutzer-Anfrage 2026-09-27 (Shell-Prompt, Default-Config-Adoption, Template-Idee)
**Namespace:** FR-901+ (keine Kollision: 008 nutzt FR-801…808)
**Status:** Draft — Q1–Q3 entschieden (2026-09-27); bereit für Plan-Phase
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
- **FR-903 Adopt-Subset (konkretisiert):** Beim Adopt werden nur prozesstragende Dateien
  übernommen (`workflow`, `operations`, `policies`, `responses`,
  `downstream-servers`, `schemas/`); NICHT: `state/`, `workspaces[]`,
  projekt-spezifische Gate-Skript-Argumente (werden auf den neuen
  `project.name`/Pfade umgeschrieben oder als Anpassungs-Hinweis geliefert).
- **FR-904 Shell-Promotion (Q3, entschieden):** Neuer optionaler globaler
  Instruction-Slot `instructions.global` in `workflow.json` (schema-validiert).
  Der Shell-Satz wird dort abgelegt und von `WorkflowEngine.guidanceForPublic`
  **server-seitig vor jede agent-facing Phase-Instruction gesetzt** — Garantie
  durch Konstruktion: Phasen-Definitionen enthalten den Text nie und können
  ihn nicht vergessen oder entfernen (kein Opt-out-Feld). Absicherung:
  Config-Load-Validierung des Slots + Contract-Test über ALLE Phasen.
  Der bisherige understand-only Einbettungspfad entfällt.
- **FR-905 Template-Hook (reserviert, nicht implementiert):**
  `generateFiles` erhält einen optionalen Template-Parameter; Sprach-Erkennung
  (Lockfiles/`pyproject.toml`/`*.csproj`) + Template-Auswahl ist Out of Scope
  und wird als Follow-up getrackt.

## Decisions (User, 2026-09-27)

- **Q1/Q2:** Sinnvolles Subset beim Adopt — siehe FR-903-Tabelle; repo-spezifische
  Ops werden nicht übernommen, sondern als Anpassungsliste in `notes` geliefert.
- **Q3:** Globaler Instruction-Slot `instructions.global` + server-seitige
  Injektion in `guidanceForPublic` (Garantie durch Konstruktion) statt
  Duplikation in jeder Phase.

## Superseded Open Questions (historisch, entschieden)

- **Q1 Adopt-Mechanik:** Kopiert der Assistent die Referenzdateien direkt aus
  einem Pfad (FR-902), oder werden die Referenzdateien als eingebettete
  Templates im Assistenten gepflegt (Duplikationsrisiko)?
- **Q2 Projekt-spezifische Reste:** Die Thinking-MCP-Config enthält
  repo-spezifische Gates/Argumente (z. B. `check-final-review.mjs`-Pfade,
  Smithery-Ops). Adopt = 1:1-Kopie mit Anpassungs-Hinweisen, oder Teil-Subset
  (nur workflow/policies, gates nur bei expliziter Zustimmung)?
- ~~Q3 Shell-Kanal~~ → entschieden: globaler Slot + Injektion (siehe Decisions).

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
