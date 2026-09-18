# Tool Contracts: Experience Memory Server (EMMS)

**Feature**: 001-experience-memory-server | **Date**: 2026-09-17

MCP tool surface for the MVP. All tool names are kebab-safe namespace forms;
every response (success or recoverable error) includes `guidance`
(GuidanceEnvelope, see [guidance.md](./guidance.md)). Common request fields on
all mutating tools: `workflow_id`, `expected_revision`, `idempotency_key`,
`client_context {agent_id?, trace_id?}` (D1/D2).

## workflow.discover
- **In**: `{}`
- **Out**: `capabilities {schema_version, tool_names[], observation_kinds[], evidence_limits, placeholder_tokens[]}`

## workflow.start
- **In**: `goal`, `scope_id`, `scope_fingerprint?`, `problem_summary?`, `idempotency_key`
- **Out**: `workflow_id`, `revision: 1`, `experience_id` (episode created in DRAFT)
- **Errors**: `INVALID_REQUEST`

## workflow.status
- **In**: `workflow_id`
- **Out**: `state`, `revision`, `missing_information[]`, `recent_transitions[]`

## workflow.abandon
- **In**: `workflow_id`, `expected_revision`, `reason`
- **Out**: `final_state` (episode finalizes UNRESOLVED; captured evidence retained per FR-034), `new_revision`
- **Rules**: captured evidence is retained; no data is deleted; guidance `stop_conditions` notes the abandonment

## experience.search
- **In**: `query`, `failure_signature? {exact_tokens[], exit_code?, normalized_hash?}`, `environment?`, `scope_id`, `limit? (default 5, max 20)`, `include_unverified?`, `include_negative?`
- **Out**: `results[] {experience_id, summary, relevance, applicability {score, matches[], mismatches[], unknowns[], hard_exclusions[]}, validation {tier, last_verified_at?}, known_bad_attempts[], flags {contradiction?, duplicate?, stale?}}`, `retrieval_notes {semantic_available: false}` (D4/research)
- **Rules**: applicability precedes similarity (FR-015); concise cards only (FR-017); visibility filter always applied (FR-027)

## experience.record_observation
- **In**: common + `observation {kind, content, exit_code?, evidence_artifact_id?}`
- **Out**: `observation_id`, `new_revision`
- **Errors**: `STALE_REVISION`, `ARTIFACT_NOT_FOUND`

## experience.record_attempt / experience.complete_attempt
- **In**: common + intent fields / outcome fields (see data-model Attempt)
- **Out**: `attempt_id`, `new_revision`

## experience.propose_hypothesis / experience.update_hypothesis
- **In**: common + `statement`, `evidence_refs[]` / `action: support|reject|supersede`, `target_hypothesis_id`
- **Out**: `hypothesis_id`, `new_revision`

## experience.propose_solution
- **In**: common + `strategy`, `mechanism`, `prerequisites[]`, `rollback[]`, `validation_checks[]`
- **Out**: `solution_id`, `validation_plan_id`, `new_revision`

## artifact.attach
- **In**: `workflow_id`, `expected_revision`, `content_b64 | content_ref`, `kind`, `media_type`
- **Out**: `artifact_id`, `content_hash`, `redaction {status, findings_count}`
- **Limits**: max artifact size 1 MiB after base64 decode; accepted media types: `text/plain`, `application/json`, `text/x-diff`, `application/x-ndjson`; oversize or unlisted type → `ARTIFACT_REJECTED`. Writes are atomic (temp file + rename): a failed or interrupted upload leaves NO artifact record and is safe to retry.
- **Errors**: `ARTIFACT_REJECTED {reasons[]}` (size/type/redaction), `MISSING_REQUIRED_EVIDENCE`, `ARTIFACT_HASH_MISMATCH` (stored content no longer matches hash on read — integrity failure)

## validation.plan
- **In**: common + `checks[] {criterion, test_type, expected_result, regression_coverage, timeout, evidence_requirement}` (≥1 check tied to original failure criterion, FR-007)
- **Out**: `validation_plan_id`, `new_revision`

## validation.record_run
- **In**: common + `check_ref`, `status`, `exit_code?`, `evidence_artifact_id` (required when check declares evidence requirement)
- **Out**: `run_id`, `new_revision`

## experience.finalize
- **In**: common + `requested_outcome: verified | partially_verified | unresolved`
- **Out**: `final_state` — may differ from requested: server assesses evidence (FR-008); possible outcomes include `DUPLICATE_CANDIDATE`, `NEEDS_MORE_EVIDENCE`, `NEEDS_HUMAN_REVIEW`
- **Rules**: `verified` requires: original-failure check passed + regression checks passed + each has evidence artifact + no unresolved critical side effect

## experience.record_reuse_feedback
- **In**: `experience_id`, `verdict: applicable | useful | misleading | harmful`, `changed_plan?`, `outcome?`
- **Out**: `feedback_id`

## Error contract (all tools)

```
{ error: { code, message, retryable, details }, guidance: GuidanceEnvelope }
```

Codes: `INVALID_REQUEST`, `STALE_REVISION` (details.current_revision),
`INVALID_TRANSITION`, `MISSING_REQUIRED_EVIDENCE`, `ARTIFACT_REJECTED`,
`DUPLICATE_IDEMPOTENCY` (returns original result, retryable=false),
`RATE_LIMITED`, `INTERNAL_ERROR`.
