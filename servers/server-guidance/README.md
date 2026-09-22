# Guidance MCP Server (@paschbaer/guidance)

Configurable MCP workflow orchestrator with an optional Spec-Kit integration
profile. Dual-role: MCP server (toward coding agents) and MCP client
(toward configured downstream servers — GitNexus, Insight, Memory).

Defined by `specs/002-guidance-workflow-server/spec.md`
(v1 workflow control, v2 downstream orchestration, v2.1 Spec-Kit profile).

## Implemented capabilities

- Seven-phase workflow (understand → plan → review → implement → review-fix →
  verify → complete) driven entirely by project configuration in `.guidance/`
  (JSON only). Strict JSON-Schema submission validation.
- Immutable artifact snapshots with hash-based staleness detection; import
  validation (unique task IDs, dependency graph, cycles, workspace boundary).
- Persistent Spec-Kit task entities with a Guidance-owned state machine;
  dependency-aware batch scheduling; evidence-gated task completion
  (checkboxes are hints, never proof).
- Deterministic downstream orchestration: Guidance invokes and validates
  workflow-critical operations itself. Completion invariant: the configured
  GitNexus repository-analysis operation (with explicit local fallback) must
  succeed before `completed`.
- Data-egress policies, capability allowlists, risk-class approval gates,
  secret redaction, prompt-injection-resistant result exposure.
- Idempotent state changes (requestId ledger), crash recovery, graceful
  cancellation, append-only audit history, configurable retention (90 days).
- Plan-change proposals with deterministic minor/major classification;
  artifact refresh with atomic reconciliation.

## Transports

- `npm start` — stdio
- `npm run start:http` — HTTP, bound to 127.0.0.1 only (bearer auth is a
  tracked follow-up; see memory-bank/remaining-work-plan.md)

## Build & test

```bash
npm install
npm run build
npm test        # 118 tests
npm run typecheck
```

## Configuration

`.guidance/` JSON files per
`specs/002-guidance-workflow-server/contracts/downstream-config-contract.md`;
example set in `examples/default-guidance/`. Profile `spec-kit` is implied
when Spec-Kit integration keys are present (FR-060).
