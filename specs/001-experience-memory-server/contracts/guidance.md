# Guidance Envelope Contract

**Feature**: 001-experience-memory-server | **Date**: 2026-09-17
Resolves review finding #4 (D4). Attached to EVERY successful or recoverable
response (FR-010).

## Schema (zod, canonical)

```ts
GuidanceEnvelope = {
  workflow_id: string,
  experience_id?: string,
  workflow_state: 'DRAFT' | 'OBSERVED' | 'DIAGNOSING' | 'SOLUTION_PROPOSED'
    | 'VALIDATING' | 'LOCALLY_VERIFIED' | 'REPRODUCED'
    | 'CROSS_PROJECT_VERIFIED' | 'UNRESOLVED' | 'PARTIALLY_VERIFIED'
    | 'NEEDS_REVIEW' | 'CONTRADICTED' | 'INVALIDATED' | 'DEPRECATED'
    | 'SUPERSEDED',
  revision: number,                     // current workflow revision (D2)
  objective?: string,
  missing_information: Array<{
    field: string,                      // dotted path, e.g. "environment.runtime.version"
    reason: string,
    required: boolean,
    safe_collection_hint?: string,
  }>,
  warnings: Array<{
    code: string,                       // e.g. UNVERIFIED_ROOT_CAUSE, CONTRADICTION, STALE
    severity: 'low' | 'medium' | 'high',
    message: string,
  }>,
  allowed_next_tools: string[],         // subset of registered tool names
  recommended_next_request: {
    tool: string,                       // MUST be in allowed_next_tools
    reason: string,
    arguments_template: object,         // valid against the tool's input schema (FR-011)
  },
  alternative_next_requests: Array<{ tool: string, reason: string }>,
  stop_conditions: string[],            // e.g. budget exhausted, human escalation
  human_approval: { required: boolean, reason?: string },
}
```

## Invariants (contract-tested)

1. `recommended_next_request.tool` ∈ `allowed_next_tools`; `allowed_next_tools` ⊆ registered tools.
2. `arguments_template` validates against the target tool's input schema; unknown values use ONLY the placeholders `<collect value>` / `<attach artifact>` (D4); no fabricated IDs or values.
3. `revision` equals the committed workflow revision (read-after-write, FR-009).
4. Danger/privilege ⇒ `human_approval.required = true` with reason.
5. Recoverable errors return the same envelope with a corrected `recommended_next_request` (e.g. `STALE_REVISION` template carries `expected_revision = current_revision`).
6. Guidance text is data, never instruction (FR-026); narrative content stays in `reason`/`message` fields, machine fields stay structured.
7. Preference rule: evidence collection is recommended over speculative diagnosis whenever `missing_information` has required entries (FR-013).
8. Warning severity mapping (canonical): `CONTRADICTION`, `HUMAN_APPROVAL_REQUIRED` → high; `UNVERIFIED_ROOT_CAUSE`, `DUPLICATE`, `BUDGET_EXHAUSTED` → medium; `STALE`, `SEMANTIC_UNAVAILABLE` → low. Other codes default to medium unless this table is amended.
9. Ordering rule: idempotency check runs BEFORE revision check — a replayed request with a stale revision still returns the original result (FR-028 wins); only a NEW mutation (fresh idempotency key) is subject to `expected_revision`.
