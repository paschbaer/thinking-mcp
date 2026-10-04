# Spec 016 — Async Phase Transitions & Progress Notifications (all MCP servers)

**Status:** Proposed
**Scope:** All HTTP-transport MCP servers in this repository: `server-guidance`, `server-insight`, `server-clear-thought`.
**Out of scope:** `server-stochasticthinking` (deprecated). Changes to gate semantics, workflow state machines, or task lifecycle.

---

## 1. Problem

Tool calls that trigger long-running work (workflow phase transitions executing
verification gates such as lint/build/final-review; batch task releases; downstream
invocations) answer **synchronously**: the HTTP request stays open until the work
completes. Observed effect (session evidence, 2026-10-04): MCP clients hit their
request timeout ("Context server request timeout") while the server side finishes
correctly. Recovery today is a documented workaround ("never retry the original
call — poll `get_workflow_state` instead"), which is fragile and invisible to
clients that do not read the workaround prose.

Root causes:

1. **Synchronous acceptance:** the result of a minutes-long operation is coupled to
   a single HTTP request/response cycle.
2. **No progress channel:** clients receive zero intermediate feedback; they cannot
   distinguish "working" from "hung".

## 2. Goals

- **G1:** Long-running operations are *accepted* immediately; their result is
  retrieved via a status query (Stufe 2 / async acceptance).
- **G2:** Clients that support it receive live progress during long-running
  operations, per MCP progress-notification semantics, over Streamable-HTTP SSE
  with keepalives (Stufe 3).
- **G3:** Plain-JSON MCP clients (no SSE support) keep working unchanged — both
  stages are additive.

## 3. User Stories

### US1 — Client submits a long-running call without timing out (Stufe 2)

> As a coding agent, when I submit a workflow phase transition that runs
> verification gates, I receive an immediate acceptance response and fetch the
> outcome via the existing status interface, instead of blocking until timeout.

**FR-1:** Tools whose handler may run longer than a short interactive budget
(configurable per server; guidance: phase submissions `submit_*`, `complete_workflow`,
`run_operation`; equivalent gate-executing calls in insight/clear-thought) MUST be
executable in an **async mode**: the call returns promptly with the acceptance
state (accepted, operation id / session reference) while execution continues
server-side.

**FR-2:** While an async operation is in flight, a **retry of the same request
MUST be idempotent**: it returns the current in-flight/terminal state instead of
starting a second execution. The existing single-flight lock MUST be reused, not
duplicated.

**FR-3:** The outcome (success, failure, gate results, error details) MUST be
 retrievable through the server's existing status interface
(`get_workflow_state`/equivalent) once execution finishes — including failures.
Failures MUST NOT be swallowed: the status response MUST carry the operation
outcome with enough detail to react (which gate failed, why).

**FR-4:** Acceptance mode MUST be opt-in per request or per server configuration,
with synchronous execution as the default so existing clients are unaffected.

### US2 — Client receives live progress (Stufe 3)

> As an MCP client with SSE support, when I request progress for a long-running
> call, I receive MCP progress notifications and keepalives over the Streamable-
> HTTP response stream, so I can show live state and never mistake silence for a
> hang.

**FR-5:** When the incoming request carries `Accept: text/event-stream`, the
server SHOULD upgrade the response to an SSE stream (per Streamable-HTTP) for
long-running operations, and MAY do so always.

**FR-6:** When the request carries an MCP `progressToken` (`_meta.progressToken`),
the server MUST emit `notifications/progress` events for each major execution
step (e.g. per gate: started/succeeded/failed; phase transition started/completed)
with monotonically increasing `progress` and, where known, `total` and a human-
readable `message`.

**FR-7:** During periods without progress events, the server MUST emit SSE
keepalives (comment lines or `ping` events) at an interval shorter than typical
intermediary idle timeouts (recommendation: ≤ 15 s).

**FR-8:** Progress/keepalive channels MUST NOT carry secrets or credential
material (consistent with FR-045 redaction rules).

### US3 — Compatibility

> As an existing plain-JSON client, my behavior is unchanged.

**FR-9:** Without `Accept: text/event-stream` and without `progressToken`, all
tools respond exactly as today (single JSON response). No client is forced to
adopt the new mechanisms.

**FR-10:** The async acceptance of FR-1 MUST be request-selectable (e.g. `_meta`
flag or server config default) so that clients that rely on synchronous responses
keep receiving them.

## 4. Acceptance Criteria

- **AC1 (FR-1/FR-3):** A contract test submits a phase transition whose gate
  takes ≥ N seconds (fixture slow gate); the submit response returns in < 1 s
  with an acceptance state; the status interface later reports the terminal
  outcome including gate results.
- **AC2 (FR-2):** A second identical submit while the transition is in flight
  does not start a second execution (single-flight) and returns the current
  state; the completed-at timestamp/gate execution count proves single execution.
- **AC3 (FR-5–FR-7):** An SSE client (Accept header + progressToken) receives:
  ≥ 1 `notifications/progress` event per gate, terminal result event, and
  keepalives during a simulated idle gap; the stream carries no credential
  material.
- **AC4 (FR-9/FR-10):** All existing test suites and contract tests pass
  unchanged with default (synchronous, JSON) mode.
- **AC5:** Each server documents the feature and its configuration defaults in
  its README (behavior, not task history).

## 5. Non-Goals

- No change to what the gates check, in which order, or their fail-closed
  semantics.
- No client implementation in this repo (agents/clients consume the mechanism).
- No persistence of progress events beyond the operation lifetime.
- `server-stochasticthinking`: deprecated, no changes.

## 6. Adoption Order

1. **`server-guidance` first** — reference implementation; it has the observed
   pain case (phase transitions + gates) and already owns the single-flight lock
   and a status interface to build on.
2. **`server-insight` / `server-clear-thought`** follow, reusing the shared
   pattern extracted from guidance (transport helper for SSE + progress +
   keepalive; async acceptance wrapper for gate-executing handlers).
