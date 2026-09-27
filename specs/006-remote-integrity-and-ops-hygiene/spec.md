# Specification: Remote Integrity & Operations Hygiene

**Feature ID:** `006-remote-integrity-and-ops-hygiene`
**Namespace:** FR-501+, SC-501+ (Fortlaufende Blöcke, siehe systemPatterns-Konvention)
**Closes tracks:** L305d (Spec) · F7 · R-008a · R-006-Residual · F8 · Phase-3/7a-Reste (Teil) · Tracking-NS-Rest · L253 (Reklassifizierung)
**Status:** Draft
**Date:** 2026-09-26

## Overview

Bundle aus sieben Rest-Tracks: Downstream-Support im Remote-Mode wird
nachspezifiziert (Design, keine Implementierung), die Client-Report-
Integrität aus Feature 005 wird gegen das Crash-Fenster gehärtet, der
Workspace-Lock wird auf workspaceRoot-scoped umgestellt, die Kill-Eskalation
wird testbar, die Scaffold-Erkennung verschärft, die specs/002-Reste
inventarisiert (mit Quick-Wins) und L253 reklassifiziert.

## User Stories

### US1: Remote-Downstream-Support-Spezifikation (L305d, P1)

**As an** operator, **I want** a design specification for executing
downstream MCP operations in remote sessions, **so that** the current
`awaiting_client` v1 limitation has a concrete, reviewable path forward.

**Acceptance:** `amendments/004-remote-downstream-support.md` (DRAFT) mit
Problemstellung, Designoptionen (A: serverseitige Ausführung via
ClientManager mit Egress-Policy, B: Proxy-Tool an den Client, C: Delegation
an einen Second-Agent), Empfehlung A, FR-Entwürfen FR-601…605 (eigener
Kreis im 006-Namespace) und offenen Entscheidungen. Keine Implementierung.

### US2: Report-Integrität härtet Crash-Fenster (F7, P1)

**As an** operator, **I want** the report-binding to be robust against the
burn-before-persist crash window and replays, **so that** an accepted report
cannot be replayed even after a crash.

**Acceptance:** Binding-Prüfung und Burn getrennt: `checkReportBinding`
(ohne Burn) vor `record`, Burn erst **nach** erfolgreichem Persist; Replay
eines bereits gemeldeten Tokens → `client_report_invalid` („already
reported"); Token im OpReport für Audit persists.

### US3: Workspace-scoped Locks (R-008a, P2)

**As an** operator with several workspaces, **I want** the workspace lock
to be scoped per `workspaceRoot` (hash-suffixed lock files), **so that**
read-only operations of different workspaces no longer over-serialize.

**Acceptance:** Lock-Datei `workspace-ops.<hash16>.lock` je Workspace
(SHA-256 des aufgelösten Pfads, 16 hex); Orphan-Sweep deckt alle
`workspace-ops.*.lock`; TTL-Invariante unverändert; bestehende
Contention/Steal-Tests laufen mit den neuen Pfaden.

### US4: Kill-Eskalation beobachtbar (R-006-Residual, P2)

**As a** maintainer, **I want** tests that observe the SIGTERM→SIGKILL
escalation and child liveness, **so that** SC-201 no longer relies on
SIGTERM-settle only.

**Acceptance:** (a) ein SIGTERM-ignorierender Child (`process.on('SIGTERM',
…)` + Interval) wird nach der 5-s-Grace beendet — Execution endet
`timed_out` innerhalb < 15 s; (b) nach Cancel ist der Child-Prozess
nicht mehr in der Prozessliste (Marker-Argument-basierter `ps`-Check;
skip auf win32).

### US5: specs/002 Phase-3/7a-Reste (P2)

**As a** maintainer, **I want** an evidence-based inventory of the Phase-3/
7a/7b leftovers with quick wins implemented, **so that** the old backlog is
either closed or consciously carried.

**Acceptance:** Inventory-Tabelle je Rest-Item (noch gültig / erledigt /
verworfen mit Begründung) in `specs/002-guidance-workflow-server/
checklists/phase3-7a-inventory.md`; Quick-Wins umgesetzt: (a) requestId-
Replay-Test für `complete_workflow`, (b) Entfernung von totalem
Parser-Export (nur bei grep-belegter Unnutzung).

### US6: Scaffold-Erkennung verschärft (F8, P3)

**As a** maintainer of a JS monorepo with a stray `pyproject.toml`,
**I want** the scaffold to treat the workspace as Python only when the file
contains a `[project]`-section, **so that** tooling-only pyprojects don't
flip the op set.

**Acceptance:** detection requires `[project]` in the file content; tests
cover stray-tooling-pyproject (→ npm set) and real project (→ uv set).

### US7: L253/Tracking-NS-Rest (P3)

**Acceptance:** L253 reklassifiziert (fremde Repos in dieser Umgebung nicht
verfügbar — blocked mit Begründung im Plan); Tracking-NS-Rest verifiziert
und geschlossen (Konventionsnotiz existiert in systemPatterns.md).

## Functional Requirements

- **FR-501** Report-Binding-Reihenfolge: `checkReportBinding` (kein Burn)
  → `record` (mit Token im OpReport) → Persist → `burn`; Replay-Erkennung
  über gespeicherten Token (gleicher Token auf vorhandenem Report →
  `client_report_invalid` „already reported").
- **FR-502** Workspace-scoped Locks: Lock-Datei je `workspaceRoot`
  (`workspace-ops.<sha256-16hex>.lock` im stateDir); Steal/TTL/Sweep-
  Semantik unverändert; Sweep-Prefix `workspace-ops.`.
- **FR-503** Kill-Eskalations-Observability: Tests beobachten die
  SIGKILL-Eskalation (SIGTERM-ignorierender Child) und die Child-Liveness
  nach Cancel (`ps`-Marker-Check, skipIf win32).
- **FR-504** Scaffold-Detection: `pyproject.toml` zählt nur mit
  `[project]`-Sektion als Python-Signal.
- **FR-505** Inventar + Quick-Wins specs/002-Reste (US5).
- **FR-506** Amendment 004 (L305d-Design) als DRAFT dokumentiert.
- **FR-507** L253 → geschlossen (2026-09-26 obsolet per User-Entscheid:
  Verteilung über Paket/Smithery, keine Kopien nötig); Tracking-NS-Rest
  geschlossen (Konventionsnotiz in systemPatterns.md verifiziert).

## Success Criteria

- **SC-501**: Cancel eines SIGTERM-ignorierenden Childs: Execution endet
  nach Eskalation, Prozess via `ps` nicht mehr auffindbar.
- **SC-502**: Replay nach simuliertem Crash (Report vorhanden, Token
  restored) → `client_report_invalid` („already reported").
- **SC-503**: Zwei Sessions mit verschiedenen workspaceRoots können
  gleichzeitig je eine Operation ausführen (keine Cross-Workspace-
  Serialisierung mehr für Read-only-Ops).
- **SC-504**: Stray-pyproject (ohne `[project]`) → npm-Op-Set.
- **SC-505**: Volle Suite grün (≥ 304 + neue), typecheck + build clean.

## Out of Scope

- Implementierung des Remote-Downstream-Supports (nur Spec, US1).
- HMAC-Report-Token (weiterhin vertagt, siehe Feature 005 F5).
- L253-Umsetzung (fremde Repos).
