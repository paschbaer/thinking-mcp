# Plan & Data Model: Guidance Production Hardening

**Feature:** specs/005-guidance-production-hardening · **Date:** 2026-09-26

## Architecture Summary

Four independent work streams, one bundle spec:

1. **Docs** (US1/US5): memory-bank hygiene + spec 003 renumbering — no code.
2. **Metrics** (US2): new `src/metrics/MetricsRepository.ts` (in-memory
   aggregates + JSONL append in `stateDir/metrics.jsonl`, replay on boot).
   Recording hooks: `WorkflowEngine` after each operation execution
   (lifecycle + runOperation) and `ClientManager` on health transitions.
   New read-only tool `get_metrics` (no session required).
3. **Report tokens** (US3): remote `ClientOpLedger` entries gain a one-time
   `opToken` (32 hex, crypto-random) minted when an operation enters
   `awaiting_client`; `report_operation_result` requires `reportToken`;
   burn-on-accept; HMAC-SHA256 over (opId|attempt|token) with the session's
   key material when key auth is configured. Audit on every rejection.
4. **Venv + scaffold** (US4/US6): pure config/docs for UV_PROJECT_ENVIRONMENT;
   scaffold detection by `pyproject.toml` presence.

## Data Model

### metrics.jsonl (append-only)

```jsonc
{ "ts": "ISO", "kind": "operation", "operationId": "test",
  "outcome": "succeeded|failed|cancelled|timed_out", "durationMs": 1234 }
{ "ts": "ISO", "kind": "connection", "serverId": "gitnexus",
  "status": "connected|disconnected|error" }
```

### get_metrics response

```jsonc
{ "uptimeSeconds": 3600,
  "operations": { "test": { "runs": 12, "succeeded": 10, "failed": 1,
                            "cancelled": 1, "timedOut": 0,
                            "durationMs": { "count": 12, "sum": 8000, "max": 900 } } },
  "connections": [ { "serverId": "gitnexus", "status": "connected",
                     "lastSuccessfulRequestAt": "ISO" } ] }
```

### Remote report token (remote-mode ledger entry extension)

```jsonc
{ "opToken": "32-hex",              // one-time, minted at awaiting_client
  "tokenHmac": "hex | null" }       // set when key auth configured
```

## Testing Strategy

- metrics: unit/contract on aggregate + replay; get_metrics counts vs.
  executed ops (SC-401).
- tokens: wrong/missing/replayed/correct (SC-402) at contract level against
  the remote session tooling; HMAC variant.
- renumbering: SC-403 grep; scaffold: SC-404 both variants; venv: E2E with
  UV_PROJECT_ENVIRONMENT override.
- regression: full suite ≥ 293 + new.

## Risks

| Risk | Mitigation |
|---|---|
| Metrics JSONL growth | append per execution is low-volume; sweep left to ops (same as audit) |
| Token leakage into logs | tokens never logged; audit records only token fingerprint (first 4 hex) |
| Renumbering breaks references | alias table + grep check SC-403; memory-bank updated in same commit |
