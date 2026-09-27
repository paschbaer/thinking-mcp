# Specification: Multi-Workspace Support (mehrere Repos pro Guidance-Instanz)

**Feature ID:** `008-multi-workspace`
**Closes tracks:** MR-1 (MEDIUM, Architektur) · MR-2 (LOW, Docs)
**Namespace:** neue FRs ab FR-801 (keine Kollision mit FR-001…705)
**Status:** Implemented (2026-09-27)
**Date:** 2026-09-27

## Overview

Guidance ist aktuell **single-repo verdrahtet**: Ein Serverprozess bindet
genau einen `workspaceRoot` (`src/index.ts:15-16`,
`composeApplication(workspaceRoot, …)`). Client-seitige `workspaceRoot`-
Angaben werden gegen diesen EINEN Root validiert
(`assertWorkspaceInside`, `src/mcp-server/register-tools.ts:82-98` —
„workspaceRoot escapes the configured workspace") und Spec-Kit-Features
gegen `spec_kit_feature_outside_workspace` abgelehnt
(`SpecKitEngine.ts:116-120`). Config (`.guidance/`) und State (`state/`)
liegen zwingend unter diesem einen Root; das Deployment-Modell ist
„1 Container = 1 Repo" (`docker-compose.override.yml` Mount +
`GUIDANCE_WORKSPACE_ROOT`).

Konsequenz (Niyama-Beispiel): Ein zweites Repo ist nur per Workaround
nutzbar (zusätzlicher Mount + Sub-Pfad als workspaceRoot) oder durch
eine zweite Container-Instanz (N Ports, N Deployments, getrennte
Health-Checks). Damit ist guidance für Multi-Repo-Betrieb nicht
produktionsreif.

**Ziel:** Eine Guidance-Instanz verwaltet mehrere registrierte
Workspaces (Repos) mit strikt isolierter Config, State, Locks und
Gate-Verdrahtung — bei unverändertem Sicherheitsmodell (kein
Pfad-Escape, nur Registry-Mitgliedschaft).

## User Stories

### US1: Workspace-Registry + namensbasierte Sessions (P1)

**As an** agent, **I want** `start_workflow` mit einem registrierten
Workspace-Namen (z. B. `workspace: "niyama"`) statt einem freien Pfad,
**so that** ich mehrere Repos betreuen kann, ohne Pfad-Validierung zu
umgehen.

**Acceptance:** Ein Workspace-Set ist serverseitig konfiguriert;
Sessions binden an einen Workspace (Name → Root, Projektname);
unbekannte Namen und Pfade außerhalb registrierter Roots werden
abgelehnt (Fehlerklasse wie heute, fail-closed).

### US2: Per-Workspace Config- und State-Isolation (P1)

**As an** operator, **I want** jedes Workspace sein eigenes
`.guidance/` (Config, State, Snapshots, Capability-Pins) zu behalten,
**so that** Sessions, Audit und Backups beim Repo bleiben und keine
State-Kollision zwischen parallelen Sessions über Repos entsteht.

**Acceptance:** Zwei Workspaces laufen parallel ohne gemeinsamen State;
`configurationVersion`-Hash wird je Workspace gebildet (FR-019-Semantik
pro Workspace).

### US3: Lock-Scoping pro Workspace (P2)

**As an** agent, **I want** `WorkspaceOpLock` pro Workspace zu greifen,
**so that** parallele Sessions in verschiedenen Repos sich nicht
gegenseitig ausbremsen (und innerhalb eines Repos die bestehende
Invarianten bleiben: nie Doppel-Halt, TTL-stale ⇒ toter Halter).

**Acceptance:** Lock-Key ist workspace-scoped (realpath-basiert,
L-5-Cap bleibt); Cross-Workspace-Lock-Wettbewerb ist ausgeschlossen
(Regressionstest: 2 Repos, 2 parallele Ops, beide fortschrittsfähig).

### US4: Gate-Verdrahtung + Docs (P2)

**As an** operator, **I want** Completion-Gates (`index-freshness`,
`check-final-review`, `repository-analysis`) je Workspace gegen den
richtigen GitNexus-Index/Commit laufen zu lassen, **so that** Gates nicht
fälschlich gegen das falsche Repo prüfen. MR-2: Die Produktionsbeschränkung
bzw. deren Aufhebung ist in README/docker-compose dokumentiert.

**Acceptance:** Gates erhalten den Workspace-Kontext; Gate-Op-Ergebnisse
referenzieren den Workspace; Docs aktualisiert.

## Functional Requirements

- **FR-801** Registry (Q2): `workspaces[]` in `guidance.json` mit
  Einträgen `{ name, root, projectName? }`; fail-closed Validierung
  (Name-Format, Root existiert, Root eindeutig). Registry-Änderung
  invalidiert laufende Sessions (Bindung an `configurationVersion`,
  konsistent zu FR-019).
- **FR-802** Namensbasierte Session-Bindung (Q3): `start_workflow` und
  alle Tools, die heute `workspaceRoot` akzeptieren, nehmen einen
  Workspace-Namen; `assertWorkspaceInside` wird zu
  „Root muss zu einem registrierten Workspace gehören" verallgemeinert.
  Membership-Check NUR nach `realpathSync` auf BEIDEN Seiten (Registry-
  Root und Kandidat; Symlinks, Windows-Case, Container-Pfad-Mapping).
  KEINE Laufzeit-Registrations-Tools (konsistent mit
  `allowAgentDefinedServers: false`). Kein freier Pfad-Zugriff mehr
  (Security-Parität: strikter als heute).
- **FR-803** Per-Workspace-Auflösung (Q4): `.guidance/`-Config,
  State-Dir (`<root>/.guidance/state/`), Spec-Kit-`featureRoot`,
  Downstream-Server-Config und Operationen werden pro Workspace aus
  dem jeweiligen Repo geladen/gecached (je Workspace eigener
  Config-Load + eigener `configurationVersion`-Hash).
- **FR-804** Lock-Scoping (Q5): `WorkspaceOpLock`-Key um
  Workspace-Identität erweitert (per-Workspace); bestehende Invarianten
  (Acquire via link(), Quarantäne-Steal, TTL-Formel, L-5-Cap)
  unverändert.
- **FR-805** Gate-Kontext: `repository-analysis`/`index-freshness`/
  `check-final-review` erhalten den Workspace-Kontext und prüfen den
  zugeordneten GitNexus-Index (Konvention `<root>/.gitnexus`).
- **FR-806** Rückwärtskompatibilität: Ein Einzel-Workspace ist die
  Registry mit genau einem Eintrag; bestehende Setups
  (`GUIDANCE_WORKSPACE_ROOT` + Default-Workspace) funktionieren
  unverändert (Default-Name z. B. `default`).
- **FR-807** Docs/Deployment (MR-2): README + docker-compose-Beispiel
  für Multi-Workspace-Betrieb (Mount-Konvention, Beispiel
  `D:/repos/Niyama` als zweiter Workspace). Pflicht: `.guidance/state`
  MUSS in der `.gitignore` jedes Workspace-Repos stehen (sonst dirty
  tree → check-final-review/index-freshness-Gates brechen, vgl. Lesson
  2026-09-26). Deployment-Validierung: Registry-Root, der im Container
  nicht existiert/nicht gemountet ist, führt zu einer KLAREN Fehler-
  meldung (nicht rohes ENOENT) und wird im `/health` als nicht
  erreichbar markiert.
- **FR-808** Observability: `/health` exposiert die Registry (Namen,
  Roots, Erreichbarkeit); `get_metrics` erhält eine Workspace-Dimension
  (Session-/Op-Zähler je Workspace), damit parallele Repos unterscheidbar
  bleiben.

## Acceptance Criteria (entscheidungsunabhängig)

- **AC-1** Zwei registrierte Repos (z. B. Thinking-MCP + Niyama) führen
  parallele Sessions aus: keine State-/Lock-Kollision, beide Completion-
  Pfade laufbar.
- **AC-2** Ein `workspaceRoot`/`workspace`, der keinem registrierten
  Workspace entspricht, wird mit definierter Fehlerklasse abgelehnt
  (fail-closed, kein Fallback auf Dateisystem-Realpath-Erraten).
  Test-Matrix umfasst Pfad-Traversal (`../../etc`), Case-Varianten
  (Windows), Symlink-Aliase auf Registry-Roots und
  Name/Pfad-Verwechslung.
- **AC-3** Einzel-Workspace-Setup verhält sich wie vor dem Feature
  (Regression: bestehende Testsuite unverändert grün; Default-Workspace).
- **AC-4** Gate-Ops laufen gegen den korrekten Workspace-Kontext
  (Test: index-freshness schlägt bei stale Index des EINEN Workspace
  fehl, ohne den anderen zu berühren).
- **AC-5** Registry-Änderung zur Laufzeit → laufende Sessions werden bei
  nächster Operation mit Konfigurationsfehler beendet (kein
  Schweige-Weiterlaufen auf alter Config). **Bewusste Festlegung
  (Review):** Invalidierung ist GLOBAL (alle Workspaces), konsistent
  zur heutigen `configurationVersion`-Semantik — fail-closed schlägt
  Granularität; workspace-scoped Invalidierung ist Out of Scope.

## Decisions (User, 2026-09-27)

- **Q1:** EIN Container mit Workspace-Registry (keine Instanz pro Repo).
- **Q2:** `workspaces[]` in `guidance.json`.
- **Q3:** Statische Registry, keine Laufzeit-Registrations-Tools.
- **Q4:** State je Workspace im Repo (`<root>/.guidance/state/`).
- **Q5:** Per-Workspace-Lock.

## Review-Nachtrag (Clearthought, 2026-09-27)

Drei-Personen-Kritik (Architekt/Security/Betreiber) mit 8 Findings;
eingearbeitet in FR-802 (realpath beidseitig), FR-807 (gitignore-Pflicht,
Deployment-Validierung), FR-808 (neu: Health/Metrics-Workspace-Dimension),
AC-2 (Traversal-Testmatrix), AC-5 (globale Invalidierung festgeschrieben)
sowie plan.md P3-Anmerkung und tasks.md T5/T7/T14/T17.

## Out of Scope

- Workspace-scoped Session-Invalidierung bei Registry-Änderung
  (global, siehe AC-5)
- Dynamische Repo-Erkennung (Auto-Scan von Verzeichnissen)
- Remote-Mode-Interaktion mit Multi-Workspace jenseits von FR-805
  (Follow-up, falls Q1 = (b))
- Änderungen an EMMS-Scope-Konvention (`<repo>-lessons` bleibt
  Agent-seitig)
