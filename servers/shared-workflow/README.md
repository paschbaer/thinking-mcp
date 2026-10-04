# shared-workflow — Spec 016 Async Acceptance & SSE Progress Pattern

Canonical source of truth for the async-acceptance + SSE-progress pattern
shared by the HTTP MCP servers in this repository (`server-guidance`,
`server-insight`, `server-clear-thought`).

## Modules

- `src/transition-protocol.ts` — passive progress observation types
  (`GateEvent`, `TransitionHooks`, `ProgressChannel`, `TransitionContext`),
  the `hooksFromContext` mapper (single-group monotonic progress) and
  `createCumulativeGateObserver` (cumulative-monotonic progress across
  multiple gate groups). Progress messages carry gate id/status only, never
  output or credentials.
- `src/operation-registry.ts` — persisted operation registry for
  async-accepted long-running calls. Keyed by (sessionId, tool); atomic
  `begin` under an in-process per-session mutex (`created` flag = idempotent
  retry, FR-2); argument-hash fingerprint as diagnostics only — a different
  payload in flight is flagged, not swallowed; `bootId` staleness
  reclassification (in-flight records from a previous process boot become
  `failed/operation_interrupted` on first read); atomic tmp+rename writes;
  every read that may reconcile runs under the session mutex; idle mutex
  entries are evicted.

## Vendoring (no package dependency)

The servers consume these files as **vendored copies** under
`servers/server-*/src/workflow/`, NOT as a package dependency: per-server
Docker builds run `npm ci` in an isolated server-directory context and cannot
resolve workspace dependencies; MCPB/Smithery bundles assume the same
self-containment.

- **Do not edit vendored copies directly.** Edit the canonical files here and
  run `node scripts/sync-shared-workflow.mjs` (from this directory).
- Each server carries a hash-consistency test comparing its vendored copy
  against the canonical file; a direct edit fails that test and points here.

## Tests

`npm test` (vitest, forks pool) covers: atomic begin / idempotent retry,
fingerprint semantics, outcome retention incl. failures, concurrent
begin/get/complete without torn files (reconcile-under-mutex regression),
mutex-map eviction (idle cleanup), the restart reclassification fixture
(in-flight record from a previous boot) and the multi-group
cumulative-monotonic progress fixture.
