# Implement Spec 016 for server-guidance (reference implementation)

Copy-paste this as the starting prompt for a Guidance workflow on workspace
`thinking-mcp`.

---

Implement specs/016-async-transitions-and-progress/spec.md for
`servers/server-guidance` — this is the REFERENCE IMPLEMENTATION; the other two
HTTP servers (insight, clear-thought) will adopt the extracted pattern in a
follow-up scope and are explicitly out of scope here.

Context: Today, phase-transition tool calls (submit_*, complete_workflow,
run_operation) execute verification gates (lint, build, final-review,
index-freshness) synchronously inside one HTTP request. MCP clients time out on
long gates even though the server completes correctly (observed 2026-10-04);
recovery is a documented workaround ("never retry — poll get_workflow_state").
Spec 016 turns this into a first-class mechanism:

1. Stufe 2 — async acceptance (FR-1..FR-4, AC1, AC2, AC5): phase submissions
   return promptly with an acceptance state (opt-in per request via _meta and/or
   per server config; synchronous stays the DEFAULT per FR-4/FR-10). Execution
   continues server-side under the existing single-flight lock — a retry of the
   same submit while in flight must be idempotent (no second execution).
   Outcome (success/failure incl. per-gate results) must become retrievable via
   get_workflow_state, failures included.
2. Stufe 3 — SSE progress (FR-5..FR-8, AC3): on Accept: text/event-stream,
   upgrade the response to SSE for long-running calls; emit MCP
   notifications/progress per gate (started/succeeded/failed, monotonic
   progress, total, message) when the request carries _meta.progressToken; emit
   SSE keepalives (comment/ping) at least every 15 s during silence; never put
   secrets/credential material into progress events.

Hard requirements:
- Backward compatibility is absolute: without SSE Accept header and without
  progressToken, every tool responds exactly as today (FR-9/AC4) — all
  existing suites must pass unchanged.
- Do NOT change gate semantics, gate order, or fail-closed behavior.
- Follow AGENTS.md: feature branch off develop, Clear-Thought reasoning passes
  per phase, impact analysis before edits, findings lifecycle in memory-bank,
  independent reviewer for non-trivial scopes, gitnexus analyze --no-stats
  before complete_workflow.
- Contract tests first where practical (slow-gate fixture for AC1/AC2; SSE
  client test for AC3; full regression for AC4).
- Update README (behavior description, no internal task IDs) and memory-bank.

Known implementation hints (verify, don't trust): the single-flight lock lives
in the workflow engine's transition path; the HTTP layer is in
servers/server-guidance/src/server.ts (currently plain JSON responses, no SSE);
get_workflow_state is the existing status tool to extend with operation
outcomes.

Out of scope: adopting the mechanism in insight/clear-thought (follow-up),
stochasticthinking (deprecated), any gate semantic changes.
