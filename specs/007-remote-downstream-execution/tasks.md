# Tasks: Remote Downstream Execution + LOW-Rest Closure

**Feature**: specs/007-remote-downstream-execution · **Date**: 2026-09-26
**Principles**: Test-First; conventional commits; `gitnexus analyze --no-stats` vor jedem Commit.
**Paths**: `servers/server-guidance/…`.

## Dependencies

- T001→T002 sequentiell (test-first). T003 hängt an T002 (Connection-Recording im Downstream-Pfad). T004–T006 unabhängig klein. T007 zuletzt.

## Phase 1 — US1: Remote-Downstream-Routing (P1)

- [ ] T001 [US1] Write failing tests in `tests/contract/remote-downstream.test.ts`: echter zweiter MCP-HTTP-Server (SDK-Stub mit `echo`-Tool) als Downstream; Remote-Session führt `mcpTool`-Op serverseitig aus (`succeeded`, kein awaiting_client, SC-601); Egress-Verstoß (Allowlist ohne Stub-Host) → strukturiert fehlgeschlagen (SC-602); Client-Op in derselben Session bleibt token-gebunden (SC-603); `get_metrics` enthält Stub-Connection mit `lastSuccessfulRequestAt` (FR-704)
- [ ] T002 [US1] Implement: `buildDownstreamInvoker`-Fabrik (aus dem WorkflowEngine-Konstruktor extrahiert, FR-702); Remote-Komposition (remote-session-manager `initSession`/`restore`) injiziert Router-Executor — `server`-Ops → Downstream-Pfad, client-seitige Ops → ClientOpEngine (FR-701); `required` blockiert (FR-703/Q1/Q2); isolierter ClientManager je Session (Q3) — make T001 pass

## Phase 2 — US2 + US3 (P2/P3)

- [ ] T003 [US2] F3: `recordConnection` nach jedem Downstream-Invoke (Status + `lastSuccessfulRequestAt` aus ClientManager-Status); `ConnectionSnapshot.lastSuccessfulRequestAt?` erweitern — Teil von T001-Tests (FR-704)
- [x] T004 [F5] Spec-005 FR-404-Wortlaut angepasst (Opak-Token; HMAC entfällt — Transport key-authentifiziert, optionale Härtung getrackt) + F7-Plan-Closure (Verweis FR-501/SC-502) — docs-only
- [ ] T005 [L-4/L-5] `workspaceLockFile` via `realpathSync` (Fallback resolve); `workspaceLocks`-Cap 64 mit Eviction (ältester Key) — Tests: Cap-Verhalten
- [ ] T006 [L-2] ps-/Eskalations-Tests robust: Polling bis Marker sichtbar (≤ 5 s), Eskalations-Untergrenze ≥ 5,5 s (FR-706)

## Phase 3 — Abschluss

- [ ] T007 Full regression + typecheck + build (SC-605); README „Remote sessions & downstream operations" (FR-707); Memory-Bank (F3/F5/F7/L-2/L-4/L-5 closures, Amendment-004-Status DRAFT→IMPLEMENTED); final review per Protokoll (fresh sub-agent); merge to develop
