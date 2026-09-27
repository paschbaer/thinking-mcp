# Specification: Config-Assistant Extensions (Default-Config-Adoption, Shell-Promotion, Template-Hook)

**Feature ID:** `009-config-assistant-extensions`
**Basis:** Nutzer-Anfrage 2026-09-27; Spec-Review (fresh subagent, 2026-09-27 — F-1…F-10 eingearbeitet)
**Namespace:** FR-901+ (kollisionsfrei: 008 nutzt FR-801…808)
**Status:** Draft — review-bereinigt (0 HIGH/CRIT offen); bereit für Plan-Phase
**Date:** 2026-09-27

## Overview

Der Config-Assistent (`setup_guidance_*`, `src/setup/ConfigAssistant.ts`)
scaffoldet `.guidance/` per Frage-Katalog. Drei Erweiterungen:

1. **Default-Config-Adoption:** Nutzer wird gefragt, ob die erprobte
   Thinking-MCP-Konfiguration übernommen oder alles neu erstellt werden soll.
2. **Shell-Promotion:** Die `shell`-Antwort wird über einen globalen
   Instruction-Slot in ALLE Phase-Instructions injiziert (statt nur understand).
3. **Template-Hook (reserviert):** Sprachspezifische Config-Templates
   (TypeScript/Python/C#) — Struktur wird vorbereitet, Umsetzung out of scope.

## Leitprinzip (Nutzer-Klarstellung, 2026-09-27)

Die Thinking-MCP-Konfiguration dient als Basis — aber **nur für
generalisierbare Anteile** (Prozess, Phasen, Policies, generische Ops,
Schemas). **Repo-spezifische Werte werden grundsätzlich nie vererbt**: Pfade,
Shell/Terminal, `project.name`, `workspaceRoot`-Bezüge und
`workspaces[]` werden ausschließlich aus den Antworten des jeweiligen
Nutzers/der Ziel-Umgebung gesetzt bzw. neu generiert. Der Adopt-Flow ist an
dieses Prinzip gebunden (Testpflicht).

## Functional Requirements

- **FR-901 Config-Quelle:** Neue Frage `configSource` (`fresh` | `adopt`).
  **Fresh:** Verhalten exakt wie heute (AC-3). **Adopt:** Es werden übernommen:
  `workflow.json`, `policies.json`, `schemas/` aus der Referenz (Datei-Liste
  gem. FR-903); `responses.json` wird **regeneriert** (FR-904); `operations.json`
  wird **regeneriert** (F-1-Entscheidung, siehe FR-903); `guidance.json` wird
  **immer regeneriert** (neue Identity + Adoption-Provenance, FR-906).
- **FR-902 Referenz-Pfad + Komplett-Validierung:** Die Referenzkonfiguration
  ist eine Setup-Frage (Default: deploymentspezifisch, Container:
  `/workspace/.guidance/`; bei Nicht-Existenz fail-closed mit Hinweis auf die
  manuelle Pfadangabe). Validierung umfasst ALLE zu übernehmenden Dateien
  (existieren + ladbar), nicht nur `guidance.json`: `workflow.json`,
  `policies.json`, `schemas/`, `operations.json` (als Regenerations-Basis für
  den Op-Umfang) — fehlt oder invalide ⇒ fail-closed mit definierter Meldung.
- **FR-903 Adopt-Regeln (F-1-Entscheidung: Regeneration statt Kopie bei
  `operations.json`):**
  - **Kopiert:** `workflow.json`, `policies.json`, `schemas/`.
  - **Regeneriert:** `operations.json` via bestehendem `buildOperations` aus
    den neuen Answers (Gate-Preset-Frage) — eliminiert das Erkennungsproblem
    repo-spezifischer Anteile vollständig. Nicht-generische Ops der Referenz
    werden maschinell erkannt (Ops mit `repo:`-Argument, Ops deren Name nicht
    im generischen Preset-Set liegt) und als **Anpassungsliste** in `notes`
    + Adoption-Block (FR-906) geliefert.
  - **Immer neu generiert:** `guidance.json`, `responses.json`.
  - **Nie:** `state/`, `workspaces[]` der Referenz, Quell-`project.name`.
- **FR-904 Shell-Promotion (Q3):** Neuer optionaler globaler
  Instruction-Slot `instructions.global` in `workflow.json`. Ablage der
  `shell`-Antwort dort; `WorkflowEngine.guidanceForPublic` injiziert den Slot
  **server-seitig vor jede agent-facing Phase-Instruction** (Garantie durch
  Konstruktion, kein Opt-out-Feld). Der alte understand-only Einbettungspfad
  entfällt. Bei Adopt wird ein ggf. vorhandener alter Shell-Satz der
  Referenz-Instructions nicht übernommen (F-4): die frische `shell`-Antwort
  geht ausschließlich in den Slot — Shell ist repo-spezifisch und wird nie
  aus der Referenz vererbt (Leitprinzip).
- **FR-905 Slot-Validierung (F-5):** `loadConfig` validiert
  `workflow.json.instructions.global` (optional; String, maxLength 512)
  fail-closed — analog `validateOperations`. Workflow-Dateien ohne Slot laden
  unverändert (Rückwärtskompatibilität, Teil von AC-7).
- **FR-906 Adoption-Provenance (F-10):** Die regenerierte `guidance.json`
  erhält einen persistenten `adoption`-Block: `{ source: "<pfad>", date,
  strategy: "adopt", nonGenericOps: [...], shellSource: "answer" }` — Teil
  der gehashten Config, damit die Herkunft dauerhaft prüfbar ist.
- **FR-907 Template-Hook (reserviert, F-8):** Reiner Platzhalter — eine
  künftige Spec führt den Template-Parameter für `generateFiles` ein. Keine
  Anforderung an diese Spec.
- **FR-908 Profil-Kompatibilität (F-2):** Adopt erfordert Referenz-Profil ==
  Ziel-Profil. Die Setup-Frage `profile` wird im Adopt-Fall aus der
  Referenz übernommen und ist gesperrt (mit Hinweis); Abweichung ⇒ der
  Nutzer wählt `fresh`. Begründung: `workflow.json`/`operations.json` einer
  spec-kit-Referenz enthalten Spec-Kit-Gates, die im plain-Ziel fehlbinden
  (und umgekehrt) — eine Konversion ist nicht Teil dieses Specs.

## Acceptance Criteria

- **AC-1** Adopt-Flow erzeugt eine vollständige, valide `.guidance/`-Menge für
  ein fremdes Repo (Config-Load + Workflow-Boot erfolgreich).
- **AC-2** `guidanceForPublic` liefert für JEDE Phase eine Instruction, die
  mit dem `instructions.global`-Text beginnt; Phasen-Definitionen enthalten
  den Shell-Satz nicht.
- **AC-3** Fresh-Flow erzeugt bei identischen Answers byte-identische Dateien
  wie der heutige Fresh-Output (kein Verhaltenwechsel; die neue
  `configSource`-Frage ändert nur die Frage-Katalog-Länge, nicht den Output).
- **AC-4** Adoption-Herkunft ist dauerhaft in der `adoption`-Block der
  regenerierten `guidance.json` prüfbar (und geht in den Hash ein).
- **AC-5** `state/` und `workspaces[]` der Referenz werden beim Adopt nie
  übernommen.
- **AC-6** Ungültige/fehlernde Referenz (FR-902) → fail-closed mit der
  definierten Meldung (fehlende Datei wird benannt).
- **AC-7** `workflow.json` ohne `instructions.global` lädt unverändert;
  Slot-Verletzung (nicht-String/>512) → `configuration_invalid`.

## Decisions (User, 2026-09-27)

- **Q1/Q2:** Sinnvolles Subset beim Adopt — F-1-Entscheidung: `operations.json`
  wird REGENERIERT (nicht kopiert); repo-spezifische Referenz-Ops werden
  erkannt und als Anpassungsliste geliefert.
- **Q3:** Globaler Instruction-Slot `instructions.global` + server-seitige
  Injektion in `guidanceForPublic` (Garantie durch Konstruktion).

## Review-Vermerk

Fresh-Subagent-Review 2026-09-27: 2 HIGH (F-1 nicht operationalisierbarer
Adopt, F-2 Profil-Kompatibilität), 4 MEDIUM (F-3 Dateilisten-Drift, F-4
Shell-Duplikat bei Adopt, F-5 Slot-Validierung, F-10 Provenance), 2 LOW, 2 INFO —
alle eingearbeitet (FR-901/903/904/905/906/907/908, AC-2/3/4/6/7). Re-Review
der überarbeiteten Fassung vor Plan-Freigabe empfohlen.

## Out of Scope

- Sprach-Templates (reserviert via FR-907)
- Laufzeit-Registrierung von Workspaces (bleibt statisch, specs/008 Q3-Entscheid)
- Remote-Mode-Interaktion mit dem Assistenten
- Profil-Konversion bei Adopt (FR-908: gesperrte Übernahme statt Konversion)
