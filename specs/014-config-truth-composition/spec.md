# Specification: Config Truth & Composition v2 (zwei Modi, Registry-only-Instanz)

**Feature ID:** `014-config-truth-composition`
**Closes tracks:** MC-1 (HIGH, Truth-Dokumentation) · MC-2 (HIGH, Dormancy/cpSync) · MC-3 (MEDIUM, Wizard deployment-aware) · MC-4 (HIGH, Pfad-Domain, Teil 1: Registry-Pfade) · Folge aus Audit session f955a76e (2026-09-29)
**Namespace:** neue FRs ab FR-1101 (keine Kollision mit FR-001…995)
**Status:** Draft (2026-09-29)
**Date:** 2026-09-29

## Overview

Heute mischt eine einzige `.guidance/`-Directory drei Belange mit
unterschiedlichen Owners: **Process-Definition** (workflow, operations,
responses, schemas — repo-spezifisch, versioniert mit dem Repo),
**Deployment** (`workspaces[]`-Registry, downstream-URLs, Egress —
operator-/instanz-spezifisch) und **State**. Die „Truth“-Frage — welche
`.guidance/` gilt, wenn repo-lokale, pool-level und geservte Kopien
koexistieren — ist nirgends beantwortet (Audit F1), und der Server
kopiert Boot-Config stumm in Workspaces ohne eigene `.guidance/`
(`cpSync`, `WorkflowEngine.ts:537-549` — Audit F2). Das erzeugt
Divergenz by design.

**Entscheidung (Nutzer, 2026-09-29): Zwei Modi, kein Layering.**

| | **Workspace-Mode** (`GUIDANCE_REMOTE_MODE=0`) | **Remote-Mode** (`GUIDANCE_REMOTE_MODE=1`, bereits implementiert) |
|---|---|---|
| Instanz-`.guidance/` (unter `${GUIDANCE_WORKSPACE_ROOT}`) | **Registry only** (`workspaces[]` in `guidance.json`) — sonst nichts | unverändert: Registry sitzt im Container; Sessions entstehen per `init_session` |
| Process-Config (workflow/operations/responses/schemas/policies) | **repo-level, wie bisher** (im registrierten Root) | wird pro Session hochgeladen |
| Neue Scopes | manuell (Editor) **oder** Config-Assistant (prompts den Agent, die Registry-Datei zu editieren) | manuell **oder** Config-Assistant (prompts den Agent, `init_session` zu callen) |

Der Config-Assistant ist mode-aware und handelt entsprechend.

**Ziel:** Eindeutige Config-Truth pro Modus, keine Config-Kopien, keine
stumme Divergenz — bei minimalem Mechanismus (keine Override-Layer, kein
neues Override-Schema).

## User Stories

### US1: Registry-only-Instanz im Workspace-Mode (P1)

**As an** operator, **I want** die Instanz-`.guidance/` nur die
`workspaces[]`-Registry zu enthalten, **so that** Config-Truth
eindeutig ist: Process-Config gehört zum Repo, die Registry zur
Instanz.

**Acceptance Criteria:**

- AC-1: `start_workflow { workspace: "zed" }` komponiert die Session aus
  Registry (Instanz) + Process-Config (`<registered-root>/.guidance/`)
  — gelesen (read-through), **nie kopiert**.
- AC-2: Fehlt die Process-Config im registrierten Root, wird
  fail-closed abgelehnt mit Fehlermeldung, die auf den Config-Assistant
  verweist (kein `cpSync`, keine stille Erzeugung).
- AC-3: Die Instanz-`guidance.json` mit ausschließlich `workspaces[]`
  (+ `project`, `state`) lädt fehlerfrei; fehlende File-Referenzen
  (workflow/operations/…) sind im Registry-only-Fall kein Fehler.

### US2: Legacy-Erkennung statt Bruch (P1)

**As an** operator mit bestehender Voll-Config am Workspace-Root
(„Legacy-Monolith“, z. B. Thinking-MCP heute), **I want** dass diese
weiter wie bisher geservt wird, **so that** Migration ohne
Zwangsumstellung erfolgt.

**Acceptance Criteria:**

- AC-4: Enthält die Instanz-`.guidance/` Process-Config-Dateien, wird
  der Legacy-Modus wie heute bedient (Voll-Config als Process-Config
  für den Default-Workspace) und beim Boot **gewarnt**
  (`[guidance] legacy monolith config detected — migrate to
  registry-only + repo-level configs, see specs/014`) — kein Bruch.
- AC-5: Die Warnung nennt die erkannten Dateien und den Dokumentationsort.

### US3: Mode-aware Config-Assistant (P1)

**As an** agent, **I want** den Config-Assistant im richtigen Modus zu
bedienen, **so that** erzeugte Konfigurationen genau dorthin gehen, wo
sie geservt werden.

**Acceptance Criteria:**

- AC-6: Neue Wizard-Frage `target` (`repo-config` | `registry-edit`):
  `repo-config` erzeugt das vollständige Repo-File-Set (wie heute,
  ohne `workspaces[]`-Emission); `registry-edit` erzeugt NUR die
  `workspaces[]`-Registry (guidance.json mit Registry + project/state)
  inkl. Note „an `${GUIDANCE_WORKSPACE_ROOT}/.guidance/guidance.json`
  anfügen/ersetzen — Agent editiert die Datei on behalf“.
- AC-7: Der Assistent kennt den aktiven Modus (Remote vs. Workspace)
  und passt die Notes an: Remote-Mode → `init_session`-Hint
  (key/Bearer, idempotent per canonicalHash); Workspace-Mode →
  „schreibe in das served Root bzw. registrierte Repo-Root“.
- AC-8: `extraWorkspaces`/`workspaceRoot`-Antworten sind nur im
  `registry-edit`-Target wirksam; im `repo-config`-Target werden sie
  mit klarer Meldung abgelehnt (Process-Config enthält keine Registry).

### US4: Dokumentierte Config-Truth (P2)

**As an** operator, **I want** eine normative Truth-Aussage in README
und specs/008, **so that** Dormanz/Divergenz nicht durch Unwissen
entsteht.

**Acceptance Criteria:**

- AC-9: README + specs/008 enthalten die Mode-Tabelle und die Aussage:
  „Process-Config-Truth = das registrierte Repo; Registry-Truth = die
  Instanz; jede weitere `.guidance/`-Kopie ist inert.“
- AC-10: Boot-Warnung, wenn ein registrierter Root `workspaces[]`
  referenziert, aber keine `.guidance/` hat (bereits fail-closed),
  UND wenn im Pool-Root Repos mit eigener `.guidance/` liegen, die
  nicht registriert sind (Dormanz-Hinweis, LOW-Severity-Log).

## Functional Requirements

- **FR-1101 (Registry-only-Instanz):** Im Workspace-Mode MUSS die
  Instanz-`.guidance/guidance.json` nur `version`, `project`,
  `workspaces[]`, `state` enthalten; fehlende
  `workflow`/`responses`/`operations`/`policies`/
  `downstreamServers`-File-Referenzen MÜSSEN akzeptiert werden.
- **FR-1102 (Composition, no-copy):** Session-Start in einem
  registrierten Workspace MUSS die Process-Config aus
  `<root>/.guidance/` laden; das stumme `cpSync` (heute
  `WorkflowEngine.ts:537-549`) MUSS entfernt werden. Fehlt sie:
  fail-closed `workspace_process_config_missing` mit
  Assistent-Verweis.
- **FR-1103 (Legacy-Monolith):** Voll-Config am Instanz-Root MUSS
  weiterhin geservt werden (Default-Workspace = Instanz-Root) mit
  Boot-Warnung (AC-4/AC-5).
- **FR-1104 (Mode-aware Assistant):** Der Config-Assistant MUSS das
  `target`-Question (AC-6) unterstützen und Notes mode-abhängig
  erzeugen (AC-7).
- **FR-1105 (Registry-Edit-Ergebnis):** `target: registry-edit` MUSS
  ein guidance.json-Payload erzeugen, das ausschließlich
  `version`, `project`, `workspaces[]`, `state` enthält und als
  Ersetzung/Anfüge-Vorlage für die Instanz-Datei dient.
- **FR-1106 (Dormanz-Hinweis):** Beim Boot MUSS geprüft werden, ob
  direkt unter dem Pool-/Workspace-Root Repos mit eigener
  `.guidance/guidance.json` liegen, die nicht in `workspaces[]`
  registriert sind → Log-Warnung (kein Fail).
- **FR-1107 (Doku):** README (Multi-Workspace-Sektion) und
  specs/008-amendment MÜSSEN die Mode-Tabelle + Truth-Aussage
  enthalten (AC-9).

## Out of Scope

- Remote-Mode-Änderungen (`init_session` bleibt wie implementiert).
- Per-Workspace-Gate-Overrides im Instanz-Config (Gates leben
  repo-level im Process-Config — zed schreibt Cargo-Gates in
  `zed/.guidance/operations.json`).
- Cross-Server-Lock-Härtung (MC-6, bleibt getrackt).
- Pfad-Domain-Placeholder (`${GUIDANCE_WORKSPACE_ROOT}`-Form, MC-4
  Rest — Registry-Pfade sind jetzt ohnehin Container-Pfade per Doku).

## Dependencies / Risiken

- Breaking: Workspaces ohne eigene `.guidance/` failen jetzt (statt
  stummer Kopie) — betroffen ist ausschließlich der frische
  Multi-Repo-Fall (noch keine Produktionsnutzer außer uns).
- Risiko: Registry-only-Instanz + Legacy-Erkennung können sich
  gegenseitig falsch klassifizieren → Contract-Tests für beide
  Boot-Pfade (AC-3 vs. AC-4).

## Offene Fragen

- Keine — Entscheidungen 1–3 durch Nutzer getroffen (2026-09-29):
  Registry-File bleibt `guidance.json`; Legacy wird nur gewarnt;
  Gates repo-level ohne Override-Mechanismus.
