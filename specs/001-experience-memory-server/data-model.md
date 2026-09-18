# Data Model: Experience Memory Server (EMMS)

**Feature**: 001-experience-memory-server | **Date**: 2026-09-17

Entity definitions are storage-agnostic; the SQLite adapter maps them to
tables/views per the StorageAdapter interface (research.md).

## Entities

### Workflow
- `workflow_id` (opaque ID, PK)
- `goal`, `scope_id` (agent-declared repository scope, FR-033), `scope_fingerprint?`
- `workflow_state` (episode state machine below)
- `revision: integer` (monotonic, starts 1 — D2)
- `profile` (turn/budget limits), `created_at`, `updated_at`

### ExperienceEpisode
- `experience_id` (opaque ID, PK), `workflow_id` (FK), `tenant_id` (= "local")
- `visibility` enum: session | workflow | repository (MVP set, FR-027)
- `goal {summary, acceptance_criteria[]}`, `problem {summary}`
- `state` — see State Machine
- `quality {confidence, evidence_strength}` (derived)
- `last_verified_at?`, `created_at`

### Observation
- `observation_id`, `episode_id` (FK)
- `kind` enum: failure_output | command_output | test_result | environment_fact | file_state | dependency_graph_fact | user_feedback | performance_measurement | security_measurement | external_service_result | agent_reflection
- `content` (redacted), `evidence_artifact_id?` (FK)
- `provenance` — see Provenance

### Attempt
- `attempt_id`, `episode_id` (FK)
- `intent` (what agent planned), `fact` (what was invoked) — kept distinct (FR-003)
- `risk_classification`, `rationale`, `prior_knowledge_used?`
- `outcome?`, `side_effects?`, `affected_artifacts?`
- `classification` enum: successful | partially_successful | ineffective | harmful | inconclusive | not_applicable

### Hypothesis
- `hypothesis_id`, `episode_id`
- `statement`, `status` enum: proposed | supported | rejected | superseded
- `supporting_evidence[]`, `conflicting_evidence[]` (artifact refs)

### Solution
- `solution_id`, `episode_id`
- `strategy`, `mechanism`, `prerequisites[]`, `rollback[]`
- `validation_plan` → ValidationPlan

### ValidationPlan / ValidationRun
- Plan: `checks[] {criterion, test_type, expected_result, regression_coverage, timeout, evidence_requirement}` tied to acceptance criteria (FR-007)
- Run: `run_id`, `check_ref`, `status`, `exit_code?`, `evidence_artifact_id` (required for verified status, FR-008)

### EvidenceArtifact
- `artifact_id`, `content_hash` (SHA-256, = disk filename), `kind`, `media_type`, `byte_size`
- `redaction {status, findings_count}` (FR-025)
- `trust` label (FR-026), `created_at`
- Body stored as content-addressed file, never inlined (FR-031)

### FailureSignature
- `signature_id`, `episode_id`
- `kind`, `exact_tokens[]`, `exit_code?`
- `normalized_hash` (SHA-256 of canonical normalized form) — indexed

### EnvironmentSnapshot
- `env_id`, `episode_id`, `collection_level`: minimal | standard
- Dimensions per spec §Key Entities; never contains raw secret values

### Contradiction / DuplicateLink (D5)
- `same_normalized_hash` + opposing classifications with ≥1 evidence artifact each (contradiction)
- `same_normalized_hash` + goal similarity ≥ 0.8 (duplicate candidate)
- Append-only; resolution is human/tool-driven, never automatic in MVP

### ReuseFeedback
- `feedback_id`, `episode_id` (retrieved), `verdict` enum: applicable | useful | misleading | harmful
- `changed_plan?`, `outcome?` (FR-024)

### AuditEvent (FR-030)
- `event_id`, `actor {actor_type, actor_id}` (D1), `action`, `target`
- `before_revision`, `after_revision`, `timestamp`, `policy_version`, `reason`
- No sensitive content copied

### IdempotencyRecord (FR-028)
- `key`, `actor_id`, `tool`, `original_request_id`, `result_ref`

### Lesson (schema-reserved, consolidation phase)
- Fields per spec; no tools registered in MVP

## State Machine (Episode)

```
DRAFT → OBSERVED → DIAGNOSING → SOLUTION_PROPOSED → VALIDATING
      → LOCALLY_VERIFIED → REPRODUCED → CROSS_PROJECT_VERIFIED
Any active state → UNRESOLVED | PARTIALLY_VERIFIED | NEEDS_REVIEW
                 | CONTRADICTED | INVALIDATED | DEPRECATED | SUPERSEDED
```

Transition requirements per spec FR-019; every transition emits an append-only
event (FR-020). Invalid transitions → recoverable error `INVALID_TRANSITION`.

## Validation Rules (selection)

- Verified states require ≥1 ValidationRun with evidence artifact per check (FR-008)
- `normalized_hash` computed from redacted content only (FR-025 ordering)
- `expected_revision` must equal workflow `revision` on all mutations (D2)
- Visibility filter applied at every read path (FR-027)
- Placeholder strings restricted to `<collect value>` / `<attach artifact>` (D4)
