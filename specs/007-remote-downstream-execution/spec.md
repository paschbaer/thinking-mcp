# Specification: Remote Downstream Execution + LOW-Rest Closure

**Feature ID:** `007-remote-downstream-execution`
**Implements:** Amendment 004 (FR-601…605, Q1–Q3 defaults locked by user 2026-09-26)
**Closes tracks:** F3 · F5 · F7 (resolved-by-design) · L-2 · L-4 · L-5
**Namespace:** neue FRs ab FR-701; Amendment-004-FRs (FR-601…605) werden hier referenziert, nicht neu definiert
**Status:** Draft
**Date:** 2026-09-26

## Overview

Der Remote-Mode führt Downstream-MCP-Operationen künftig **serverseitig**
aus (Amendment 004, Option A): Remote-Sessions erhalten einen regulären
Executor mit eigenem `ClientManager`; der `ClientOpEngine` bleibt
ausschließlich für client-seitige Ops (Token-Binding). Damit entfällt
`awaiting_client` für Downstream-Ops und der volle Trust-Stack (Policy/
Egress, Allowlist, Pins, Redaction) gilt auch remote. Zusätzlich werden
die LOW-Reste aus Feature 005 geschlossen (F3 Metrics-Connections, F5
Spec-Wortlaut, F7 Dokumentation, L-2 Test-Robustheit, L-4 realpath,
L-5 Map-Eviction).

## User Stories

### US1: Remote-Downstream-Routing (P1, implementiert FR-601…603)

**As an** agent in a remote session, **I want** operations with
`server`/`capability` to execute server-side through the regular
downstream path while client-executable operations keep the token flow,
**so that** remote workflows are no longer blocked by `awaiting_client`
for downstream operations.

**Acceptance:** Routing nach Op-Typ in der Remote-Workflow-Engine;
Downstream-Pfad nutzt den vollen Trust-Stack (Policy/Egress, Allowlist,
Pins, Redaction, Exposure, Audit); Q1 (`required` erlaubt), Q2 (Fehler
blockieren, FR-040), Q3 (isolierter ClientManager je Session) umgesetzt.

### US2: Connection-Metrics (F3, P2)

**As an** operator, **I want** downstream connection status and
`lastSuccessfulRequestAt` recorded into the metrics snapshot on every
downstream invocation, **so that** connection health is observable over
time.

**Acceptance:** `recordConnection` wird bei jedem Downstream-Invoke
gerufen; `ConnectionSnapshot` erhält optional
`lastSuccessfulRequestAt`; `get_metrics` führt Live- und Persistiertes
zusammen.

### US3: LOW-Rest closure (P2/P3)

F5: Spec-005 FR-404-Wortlaut angepasst (Opak-Token; HMAC entfällt —
Transport ist key-authentifiziert; optionale Härtung getrackt).
F7: als resolved-by-design dokumentiert (FR-501/SC-502 deckt das
Crash-Fenster). L-4: Lock-Key via `realpathSync` (Fallback `resolve`).
L-5: `workspaceLocks`-Map mit Cap (64, ältester Eintrag wird evicted).
L-2: ps-/Eskalations-Tests robust (Polling statt fixer sleeps,
Escalation-Untergrenze ≥ 5,5 s).

## Functional Requirements

- **FR-701** Remote-Routing: In Remote-Sessions werden Ops mit
  `server`/`capability` über einen regulären `OperationEngine`-Pfad mit
  session-isoliertem `ClientManager` ausgeführt (FR-601/603); alle
  client-seitigen Ops laufen unverändert über den `ClientOpEngine`
  (Token-Binding, FR-603/FR-501). Routing entscheidet der Op-Typ
  (`server`-Feld vorhanden ⇒ downstream).
- **FR-702** Trust-Stack-Parität: Der Downstream-Pfad nutzt denselben
  Invoker-Stack wie der lokale Modus (Allowlist vor Connect, Egress,
  Capability-Pins, requestTimeoutSeconds, Redaction/Exposure) —
  extrahiert aus dem `WorkflowEngine`-Konstruktor in eine wiederverwendbare
  Fabrik (`buildDownstreamInvoker`), sodass remote und lokal denselben
  Code nutzen.
- **FR-703** Blocking-Semantik (Q1/Q2): `required: true`-Downstream-Ops
  blockieren die Transition (FR-040-Pfad); Fehlschlag → Session
  `blocked`/Retry wie lokal.
- **FR-704** Connection-Metrics (F3): Nach jedem Downstream-Invoke wird
  `recordConnection(serverId, status)` mit `lastSuccessfulRequestAt`
  aufgerufen; `ConnectionSnapshot` um das Feld erweitert.
- **FR-705** Lock-Härtung: Lock-Key via `realpathSync` (Fallback
  `resolve`); `workspaceLocks`-Map auf 64 Einträge cap (ältester Eintrag
  wird entfernt).
- **FR-706** Test-Robustheit (L-2): ps-Liveness per Polling (bis 5 s),
  Eskalations-Test-Untergrenze ≥ 5,5 s.
- **FR-707** Doku: README-Abschnitt „Remote sessions & downstream
  operations“; Spec-005 FR-404-Wortlaut (F5); Plan-Closure F7 (FR-501/SC-502
  deckt das Crash-Fenster).

## Success Criteria

- **SC-601**: Remote-Session mit Downstream-Op gegen einen **echten
  zweiten MCP-Server** (HTTP-Stub): Op wird serverseitig ausgeführt
  (`succeeded`, kein `awaiting_client`), Connection erscheint in
  `get_metrics` mit `lastSuccessfulRequestAt` (SC-603-Teil).
- **SC-602**: Egress-Verstoß (Host nicht in der Allowlist) oder
  Capabilities-Verstoß schlägt die Op strukturiert fehl — Trust-Stack
  greift remote.
- **SC-603**: Client-Op in derselben Remote-Session bleibt token-gebunden
  (Report ohne Token → `client_report_invalid`).
- **SC-604**: Zwei Remote-Sessions mit verschiedenen Workspaces führen
  Downstream-Ops parallel aus (keine Cross-Workspace-Serialisierung).
- **SC-605**: Volle Suite grün (≥ 309 + neue), typecheck + build clean.

## Out of Scope

- HMAC-Report-Tokens (F5-Residual, optional später).
- Metrics-Dashboards.
- Downstream-Ausführung im Client (Option B) — abgelehnt.
