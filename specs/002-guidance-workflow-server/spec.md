# Feature Specification: Guidance — Configurable MCP Workflow Orchestrator with Spec-Kit Integration

**Feature Branch**: `002-guidance-workflow-server`

**Created**: 2026-09-22 (v1) · extended 2026-09-22 (v2 orchestration) · extended 2026-09-22 (v2.1 Spec-Kit Integration Profile)

**Status**: Draft

**Input**: User description: "Neuer MCP-Server. Sourceverzeichnis: ./servers/server-guidance." (v1) · v2 orchestrator extension (`SDD/guidance-mcp-specification-v2.md`) · v2.1 Spec-Kit Integration Profile (`SDD/guidance-spec-kit-integration-specification.md`)

## Clarifications

### Session 2026-09-22 (v1 baseline)

- Q: Which configuration file format should Guidance use? → A: JSON (user-specified; supersedes the YAML examples in both the v1 and v2 reference specifications).
- Q: Which MCP transports must the server support in the first version? → A: stdio and HTTP (stdio for per-project use; HTTP so multiple agents can attach to the same sessions via a shared instance).
- Q: How is a blocked session resumed once the obstacle is resolved? → A: A dedicated `resume_workflow` tool re-enters the preserved previous phase; the blocker resolution is supplied as payload and recorded in the audit history.
- Q: How long should finished session records and their histories be retained? → A: Configurable retention period (default 90 days) for finished sessions (`completed`, `cancelled`), then archive or delete automatically; active sessions are never pruned.
- Q: Are extra/unknown fields in phase submissions rejected or tolerated? → A: Strict validation — submissions must exactly match their schema; unknown fields are rejected.

### Session 2026-09-22 (v2 extension)

- Q: How should the v2 extension treat the v1 workflow-control requirements? → A: All v1 requirements (FR-001–FR-030) remain in force; v2 adds a downstream MCP orchestration layer on top. Where the v2 reference document shows YAML configuration examples, the canonical format remains JSON per the earlier decision.
- Q: Are sampling and elicitation operations part of this feature iteration? → A: Both in scope — bounded sampling and structured elicitation operations are included (v2 milestone 7 coverage).
- Q: How should the mandatory repository-analysis operation resolve when the configured MCP capability is unavailable? → A: Explicitly configured fallback chain — MCP tool first, local command as declared fallback; the downgrade is auditable and must be declared per project.
- Q: Which downstream MCP servers must be supported and pre-configured out of the box? → A: GitNexus, Insight (project insights), and Memory (project memory) — all three v2 example integrations.
- Q: Who must authenticate to Guidance's own HTTP endpoint before calling its workflow tools? → A: No bearer authentication in this iteration — the HTTP endpoint MUST be bound to localhost only (network exposure forbidden); bearer-token authentication is a tracked follow-up for a later iteration.
- Q: What happens to a session and its running downstream operations on `cancel_workflow`? → A: Graceful cancellation — running operations are aborted (where cancellation is supported) or awaited up to their configured timeouts, results are recorded, supervised downstream processes are shut down cleanly, and only then is the terminal `cancelled` state persisted.
- Q: Which MCP protocol versions must the downstream client be compatible with? → A: Any revision the chosen SDK supports, negotiated automatically per connection; capability contracts are pinned per discovered revision regardless of version.
- Q: What operational observability must Guidance expose beyond the audit history? → A: Structured, leveled, secret-redacted operational logs plus health/summary data via the existing status tools; a separate metrics surface (counts/durations/error rates) is a tracked follow-up for a later iteration.
- Q: What latency budget applies to Guidance's own orchestration overhead? → A: Under 1 second (p95) of Guidance-added time per phase transition, excluding operation run time, verified with stub downstream servers.

### Session 2026-09-22 (v2.1 Spec-Kit Integration Profile)

- Q: How is the Spec-Kit Integration Profile (SDD/guidance-spec-kit-integration-specification.md v2.1) integrated into this feature? → A: As an opt-in workflow profile of the same Guidance server (profile `spec-kit`); all prior v1/v2 requirements and decisions remain in force. Profile configuration uses JSON (canonical format decision carried over); its file-based adapter mode is the required initial integration mode; the optional Spec-Kit MCP provider (profile milestone 10) is out of scope for the first iteration and recorded as a future extension.
- Q: Which `tasks.md` structures must the task parser recognize? → A: The full current Spec-Kit marker set — checkbox items with `T###` identifiers, `[P]` parallel markers, bold (`**`) section headings as grouping (`sourceSection`), dependency references, and prose as description; unrecognized markers become non-blocking warnings.
- Q: How are links between tasks and requirements/acceptance criteria established? → A: Merged with source attribution — explicit references parsed from artifacts plus agent-declared links from plan-review/implementation submissions; Guidance validates every declared identifier against normalized entities and records whether each link was parsed or asserted.
- Q: When does Guidance check whether the imported artifact snapshot is stale? → A: Size/mtime pre-check on every state-changing operation with full re-hash on mismatch, plus a full content re-hash at completion validation.
- Q: Which workflow profile applies when a project's configuration does not name one? → A: The plain workflow by default; profile `spec-kit` is implied when the configuration enables Spec-Kit integration or configures a feature root, otherwise only via explicit profile configuration.
- Q: Through which channel does required user approval for a major plan change reach Guidance? → A: The existing elicitation path (FR-054): structured request via upstream elicitation when supported, otherwise structured blocker plus `resume_workflow` — one approval mechanism shared with operation inputs.
- Q: Is the plan-change trigger list closed, and how are changes classified minor vs major? → A: Closed list (the FR-072 triggers are exhaustive; configuration may add triggers but not remove them); classification is deterministic — minor = purely additive and non-breaking (no change to acceptance criteria, public API, dependencies, or architecture), any other change is major.
- Q: Which task states satisfy a dependency by default? → A: Fixed set — `completed` or `verified` both satisfy a dependency; this mapping is not configurable.
- Q: What happens when a second session is started for a Spec-Kit feature that already has an active session? → A: Exclusive feature lock — the second start is rejected with a recoverable `feature_in_use` error naming the holding session; released again only after the holder reaches a terminal state or is cancelled.
- Q: Who may waive an acceptance criterion, and how is the waiver recorded? → A: Explicit user approval only (elicitation/blocker channel per FR-054), with a mandatory reason, a dedicated audit event, and inclusion in the completion report; Guidance and the agent can never waive unilaterally.
- Q: What state results if the process dies during the apply step of a reconciliation? → A: Atomic swap — the reconciled result is prepared fully, then persisted as one atomic state write; a crash before the write leaves the previous snapshot fully authoritative with the operation marked for retry; a partially applied reconciliation is impossible by construction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic workflow session (Priority: P1)

A coding agent starts a workflow session for a development task. The server creates a persistent session, enters the initial phase (`understand`), and returns phase-specific instructions. The agent works through the seven standard phases (`understand`, `plan`, `review_and_adjust_plan`, `implement`, `review_and_fix_implementation`, `verify`, `complete`) by submitting structured reports; the server validates each submission, executes configured lifecycle operations, and only permits transitions defined in configuration. The workflow ends in the terminal `completed` state only after all mandatory completion operations have succeeded.

**Why this priority**: This is the core value of Guidance: separating nondeterministic agent reasoning from deterministic process enforcement.

**Independent Test**: Can be fully tested by starting a session against a temporary workspace and walking it phase-by-phase with valid/invalid submissions, verifying that only allowed transitions occur and that `completed` is unreachable while a mandatory operation fails.

**Acceptance Scenarios**:

1. **Given** no active session, **When** the agent starts a workflow, **Then** a session is created and persisted, the active phase is `understand`, and the configured `understand` instruction is returned.
2. **Given** the active phase is `plan`, **When** the agent submits an implementation report, **Then** the submission is rejected with reason `invalid_active_phase` and the session state is unchanged.
3. **Given** the agent wants to skip from `understand` directly to `implement`, **When** it attempts any tool call, **Then** no transition to `implement` is possible because `review_and_adjust_plan` was not executed.
4. **Given** a valid submission for the active phase, **When** the agent submits it, **Then** the submission is validated, persisted, the transition executes per configuration, and the next phase instruction is returned.
5. **Given** all phases completed and a valid completion report submitted, **When** all mandatory completion operations succeed, **Then** the session enters the terminal `completed` state and a final report including operation results is returned.
6. **Given** a valid completion report but a failing mandatory completion operation, **When** completion is requested, **Then** the session remains in `complete`, the failure output is returned, and retry is offered.

---

### User Story 2 - Configuration-driven customization (Priority: P2)

A project maintains a configuration directory (`.guidance/`) that defines phase instructions, submission schemas, transitions, lifecycle operations, downstream servers, and policies. Two different projects can enforce different processes without code changes.

**Why this priority**: Configuration-driven behavior is a core design principle; it enables reuse across projects but depends on the working workflow engine from US1.

**Independent Test**: Can be tested by pointing the server at two different configuration directories and verifying that returned instructions, accepted transitions, executed operations, and downstream bindings differ accordingly.

**Acceptance Scenarios**:

1. **Given** a project with custom phase instructions, **When** the agent requests guidance for a phase, **Then** the configured (not hardcoded) instruction text is returned.
2. **Given** a configuration that binds `lint`, `test`, and `build` operations to the `verify` exit lifecycle, **When** the workflow transitions out of `verify`, **Then** all three operations execute and their results are recorded.
3. **Given** an invalid or missing configuration, **When** a session is started, **Then** the server fails closed with a stable error code and no session is created.

---

### User Story 3 - Recoverable and auditable execution (Priority: P3)

When something goes wrong — an operation times out, a server restart occurs, the chat context is compacted — the agent can always query the persisted session state, retry a failed operation without resubmitting unchanged payloads, and inspect the full audit history.

**Why this priority**: Recoverability and auditability are required for production use but build on a functioning engine.

**Independent Test**: Can be tested by interrupting a session (simulated restart), resuming from persisted state, triggering an operation failure, retrying it, and verifying the append-only history reflects every event exactly once.

**Acceptance Scenarios**:

1. **Given** an operation failure with retry allowed, **When** the agent retries it, **Then** the operation runs again without requiring a new phase submission and the result is recorded.
2. **Given** a session persisted to disk, **When** the server process restarts, **Then** the session can be resumed at the same phase with the same configuration and orchestration state.
3. **Given** any completed operation, **When** the history is inspected, **Then** events (submissions, transitions, operation executions, blockers) are recorded append-only with timestamps.
4. **Given** two concurrent state-changing requests for the same session, **When** they arrive simultaneously, **Then** exactly one executes and the other receives a recoverable `session_locked` error.

---

### User Story 4 - Deterministic downstream MCP orchestration (Priority: P1 — v2)

Guidance itself — not the coding agent — invokes workflow-critical capabilities of configured downstream MCP servers. For the standard completion flow, Guidance connects to the configured repository-analysis MCP server, invokes its analysis capability directly, validates the result, and only then permits the transition to `completed`. The coding agent cannot bypass this by claiming the analysis already ran, reporting a self-made success, or invoking some other tool.

**Why this priority**: This is the central v2 value: instructions to a model ("use tool X") are not guarantees; only self-executed, self-validated invocations are. The completion invariant is the flagship requirement.

**Independent Test**: Can be tested by completing a workflow against a stub downstream MCP server that succeeds, fails, times out, or disappears — verifying each case blocks or permits completion exactly per configuration, and that zero downstream invocations were delegated to the coding agent.

**Acceptance Scenarios**:

1. **Given** a required completion operation mapped to a downstream analysis tool, **When** the agent requests completion, **Then** Guidance itself connects, invokes the tool, and validates the result — without the agent invoking any downstream tool.
2. **Given** the downstream tool reports an error or the result fails validation, **When** completion is requested, **Then** the session remains in `complete` with an actionable, normalized failure report and the terminal state is not reached.
3. **Given** a successful, validated downstream result, **When** completion is requested, **Then** the normalized result is persisted as evidence and the workflow enters `completed`.
4. **Given** a downstream server that is unreachable, **When** a required operation bound to it should run, **Then** the transition is rejected with a stable error code and the failure is isolated to that server's connection.
5. **Given** an upstream request duplicated (same request identifier), **When** completion operations already ran, **Then** the downstream operation is NOT invoked a second time.
6. **Given** the downstream server changes its tool contract (capability drift), **When** a pinned required operation runs, **Then** the operation is rejected or re-discovered per configuration and the drift is recorded in the audit history.

---

### User Story 5 - Governed downstream access (Priority: P2 — v2)

Only explicitly configured downstream servers and explicitly allowlisted capabilities are reachable through Guidance. The coding agent cannot register servers, expand allowlists, or invoke non-allowlisted capabilities. Downstream content (tool descriptions, prompts, results) is treated as untrusted data and can never override workflow policy. Sensitive values are referenced indirectly and never appear in agent responses, workflow state, or audit logs.

**Why this priority**: The downstream role is a significant new attack surface; least authority and injection resistance are prerequisites for trusting v2 results.

**Independent Test**: Can be tested by attempting forbidden actions through the tool surface (register a server, invoke an unlisted capability, feed policy-overriding text through a stub downstream result) and verifying each attempt is rejected and audited.

**Acceptance Scenarios**:

1. **Given** a downstream capability that exists on the server but is not allowlisted, **When** an operation references it, **Then** the operation is rejected with `capability_not_allowed`.
2. **Given** a downstream result containing instruction-like text, **When** the result is processed, **Then** it is treated as data: it neither changes workflow policy nor triggers transitions, and it is surfaced to the agent only per the configured exposure mode.
3. **Given** an operation classified as destructive or credential-sensitive, **When** it is configured without explicit authorization, **Then** it cannot run.
4. **Given** any downstream execution, **When** state or audit records are inspected, **Then** no secrets or credential values are present.

---

### User Story 6 - Structured human input when a decision is required (Priority: P3 — v2)

When a workflow-critical operation requires input that cannot be derived safely (e.g., an architecture choice), Guidance requests structured user input through the upstream client when supported, or otherwise returns a structured, recoverable blocked question to the coding agent. Sensitive credentials are never collected this way.

**Why this priority**: Enables human-in-the-loop gates without breaking the deterministic model; sampling stays non-authoritative (it can inform, never decide, transitions). Clarified 2026-09-22: both sampling and elicitation are in scope for this iteration.

**Independent Test**: Can be tested with a stub operation declaring an input requirement: with elicitation available the request is issued; without it, a blocked structured question is returned and the session remains resumable.

**Acceptance Scenarios**:

1. **Given** an operation requiring input and upstream elicitation supported, **When** the operation runs, **Then** a structured input request is issued and the session waits in a recoverable state.
2. **Given** an operation requiring input and elicitation unavailable, **When** the operation runs, **Then** the workflow returns a structured blocker and the input can later be supplied via a dedicated tool, validated against the stored request schema.
3. **Given** an input request whose fields include sensitive credentials, **When** the request is prepared, **Then** those fields are denied by configuration.

---

### User Story 7 - Artifact-driven task orchestration (Priority: P1 — Spec-Kit profile)

With the `spec-kit` profile active, Guidance discovers the selected Spec-Kit feature directory, imports its artifacts (specification, plan, tasks), validates them structurally (identifiers, dependencies, required sections), and persists an immutable artifact snapshot. Imported tasks become persistent Guidance entities with an explicit state machine; Guidance releases only dependency-satisfied task batches, accepts structured implementation evidence, and completes a task only with real evidence — a checked Markdown checkbox in `tasks.md` is treated as a hint, never as proof of completion.

**Why this priority**: This is the core value of the profile: Spec-Kit artifacts become enforceable work (dependencies, evidence, auditability) instead of an honor-system checklist, while Spec-Kit stays the authoritative source of development intent.

**Independent Test**: Can be tested against fixture feature directories (valid, missing artifacts, duplicate task IDs, unknown dependencies, dependency cycles, tampered checkboxes), verifying import/validation outcomes, task release ordering, and evidence-gated task completion.

**Acceptance Scenarios**:

1. **Given** a session with profile `spec-kit` and an explicit feature ID, **When** the session starts, **Then** Guidance discovers exactly that feature, imports the required artifacts, hashes them, persists an immutable snapshot, and reports feature status.
2. **Given** a required artifact is missing, empty, or has duplicate task IDs or unknown dependencies or a dependency cycle, **When** import runs, **Then** progression is blocked with the corresponding stable error code.
3. **Given** tasks T001→T002→T003 with linear dependencies, **When** the agent requests work, **Then** only T001 is released; T002/T003 cannot be started until their dependencies complete.
4. **Given** a task checkbox marked `[x]` in `tasks.md` but no recorded evidence, **When** Guidance evaluates the task, **Then** it is NOT completed (checkbox policy `hint`).
5. **Given** implementation evidence submitted for a released batch, **When** review passes and task-level verification succeeds, **Then** the task reaches its terminal success state; without evidence, `complete_task` is rejected.
6. **Given** ambiguous automatic feature selection (multiple candidates), **When** no explicit feature is supplied, **Then** the workflow blocks and requests a selection.

---

### User Story 8 - Requirements-to-verification traceability (Priority: P2 — Spec-Kit profile)

Guidance maintains a traceability graph linking requirements → acceptance criteria → tasks → changed files → tests → verification results, with per-requirement coverage statuses. The agent and users can request a traceability report that exposes uncovered required criteria at any time.

**Why this priority**: Traceability is what turns task completion into a defensible completion claim; it feeds the completion invariants but depends on the task machinery from US7.

**Independent Test**: Can be tested by importing a fixture feature with known requirements/criteria/tasks, executing stub verification operations, and comparing the generated report against the expected graph and coverage statuses.

**Acceptance Scenarios**:

1. **Given** an imported feature with identified requirements and acceptance criteria, **When** tasks are implemented and verified, **Then** the traceability report links each criterion to its tasks, changed files, tests, and verification executions.
2. **Given** a required acceptance criterion with no linked task or no verification evidence, **When** the report is requested with `onlyUncovered`, **Then** that criterion appears with status `unmapped`/`implemented` (not `verified`).
3. **Given** identifiers absent in the source artifact, **When** import normalizes entities, **Then** stable snapshot-local identifiers are generated and never silently written back to the artifacts.

---

### User Story 9 - Controlled plan changes without silent drift (Priority: P2 — Spec-Kit profile)

When implementation reveals that the imported plan must change (new task, changed acceptance criterion, architecture change, dependency change), the agent submits a structured plan-change proposal. Guidance classifies it, applies the approval policy, and requires the Spec-Kit artifacts to be updated explicitly before a refresh re-imports and reconciles them — preserving prior execution evidence and blocking affected work until reconciliation completes. Silent scope drift is impossible.

**Why this priority**: Legitimate plan evolution must remain possible without corrupting the enforceability gained in US7/US8.

**Independent Test**: Can be tested by proposing changes against a fixture session (add task, remove completed task, change criterion), verifying classification, approval requirements, reconciliation previews, and evidence preservation.

**Acceptance Scenarios**:

1. **Given** a material deviation (e.g., a needed new task), **When** the agent submits a plan-change proposal, **Then** Guidance records it, classifies it, and returns `artifact_update_required` with instructions instead of allowing the deviation silently.
2. **Given** a pending plan change, **When** completion is requested, **Then** completion is blocked until the change is resolved and artifacts are refreshed.
3. **Given** approved artifact updates, **When** refresh runs, **Then** a new immutable snapshot is created, a reconciliation preview identifies added/removed/changed tasks, unchanged tasks keep their evidence, changed completed tasks are flagged for impact review, and audit events record the reconciliation.

---

### Edge Cases

- What happens when a required operation times out? The downstream work is cancelled where supported, status `timed_out` is recorded, and the transition is blocked.
- What happens when a duplicate request (same request identifier) arrives after completion operations ran? The previously recorded result is returned; downstream operations are NOT invoked a second time.
- What happens when final state persistence fails after operations succeeded? The workflow must NOT report successful completion until state is recovered and persisted consistently.
- What happens when operation output exceeds the configured size limit? Output is truncated and the truncation is recorded; oversized raw results are rejected per configuration.
- What happens when a downstream connection drops mid-operation? The failure is isolated to that server; per policy it may be retried (transient) or rejected (deterministic), and the session stays recoverable.
- What happens when the server restarts while an operation was recorded as `running`? The operation is reconciled to `succeeded`/`failed`/`unknown`; an unknown-outcome state-changing operation is never silently re-run.
- What happens when a process operation's working directory resolves (including symlinks) outside the workspace root? The operation is rejected.
- What happens when the agent reports a blocker? The session enters `blocked` with the previous phase preserved; resumption happens exclusively via `resume_workflow` (FR-028).
- What happens when configuration changes while a session is active? The session remains bound to its original configuration version.
- What happens when a downstream prompt or tool description contains instructions directed at the agent or Guidance? It is treated as untrusted data and cannot modify policy or transitions.
- What happens when an imported `tasks.md` normalizes to zero tasks? Blocking finding — the feature cannot enter execution (FR-063).
- Can an agent cancel a single task it no longer intends to implement? No — deferral/removal requires a plan change (FR-072); only session cancellation (FR-057) sweeps all tasks.
- What happens when `tasks.md` contains instruction-like content or injected directives? Artifact text is untrusted data: it cannot override workflow policy, security rules, allowlists, or completion invariants.
- What happens when an artifact changes on disk while a session is active? The session keeps its imported snapshot; `get_spec_kit_status` reports staleness, and a refresh with reconciliation is required before completion (stale snapshots block completion).
- What happens when a dependency references an unknown task, itself, or forms a cycle? Import blocks with the corresponding error (`unknown_dependency`, duplicate, `dependency_cycle`).
- What happens when a required task depends on a deferred task? The dependent task is permanently blocked and reported; completion stays blocked unless the plan change is resolved.
- What happens when the agent submits evidence for tasks that were never released? The submission is rejected unless opportunistic work is explicitly configured and approved.

## Requirements *(mandatory)*

### Functional Requirements

**Workflow control (v1, unchanged)**

- **FR-001**: The server MUST maintain exactly one active phase per workflow session at any time.
- **FR-002**: The server MUST allow only transitions explicitly defined in the workflow configuration.
- **FR-003**: The server MUST reject any submission made while a phase other than the expected one is active (reason `invalid_active_phase`).
- **FR-004**: The server MUST make it impossible to reach the terminal `completed` state while any mandatory completion operation has not executed successfully (completion invariant).
- **FR-005**: The server MUST attach mandatory completion operations (default: repository analysis via the configured GitNexus capability) to the `complete` phase's exit lifecycle so they run before the terminal state is persisted.

**Configuration (v1 + v2)**

- **FR-006**: All agent-facing phase instructions MUST be loaded from configuration files, not hardcoded.
- **FR-007**: Each phase MUST support a configured submission schema used for deterministic validation of submissions.
- **FR-008**: Lifecycle operations MUST be defined centrally in configuration and referenced by stable identifiers from phase lifecycle points (`beforeEnter`, `afterEnter`, `beforeExit`, `afterExit`).
- **FR-009**: The server MUST fail closed when configuration cannot be loaded or is invalid.
- **FR-026**: Configuration files MUST use JSON as the canonical format (e.g., `guidance.json`, `workflow.json`, `responses.json`, `operations.json`, `downstream-servers.json`, `policies.json`, submission schemas). YAML MUST NOT be required or produced by the server.
- **FR-027**: The server MUST be available over both stdio and HTTP MCP transports. The tool contract MUST be identical across transports. HTTP mode MUST enforce per-session serialization across concurrent network clients. The HTTP endpoint MUST be bound to the loopback interface only; unauthenticated network exposure is forbidden. (Tracked follow-up: bearer-token authentication for HTTP mode in a later iteration.)
- **FR-028**: The server MUST provide a `resume_workflow` tool as the only way to leave the `blocked` state. It MUST re-enter the preserved previous phase, accept the blocker resolution as payload, and record it in the audit history.
- **FR-029**: The server MUST support a configurable retention period for finished sessions (default 90 days); finished sessions older than the period MUST be archived or deleted, with the action recorded. Active sessions MUST never be pruned.
- **FR-030**: Submission validation MUST be strict: schemas MUST disallow additional properties; unknown or extra fields are rejected with `submission_invalid`.

**Downstream orchestration (v2)**

- **FR-031**: Guidance MUST be able to act simultaneously as an MCP server (toward the coding agent) and as an MCP client (toward configured downstream MCP servers), with both surfaces strictly separated.
- **FR-032**: Guidance MUST invoke workflow-critical downstream operations itself; it MUST NOT rely on the coding agent's tool selection for any operation that gates a transition.
- **FR-033**: Downstream servers MUST be connectable via stdio (Guidance supervises the process) and via remote HTTP transports, each with configured startup/request timeouts and reconnection policy.
- **FR-034**: Guidance MUST discover the capabilities of each configured downstream server on connection and verify that every required operation can be mapped to an allowed capability before the workflow depends on it.
- **FR-035**: Workflow definitions MUST reference stable logical operation identifiers; the mapping from a logical operation to a concrete downstream server/capability MUST live in configuration so downstream renames do not change workflow definitions.
- **FR-036**: A successful protocol response alone MUST NOT satisfy a required operation: each required operation MUST define an explicit validation policy (protocol success, tool-level error indicators, required content, structured-content rules, warning thresholds), and only a validated result may satisfy a transition condition. Partial or incomplete results MUST follow the validation policy — an incomplete result is treated as `input_required` or a validation failure, never as silent success.
- **FR-037**: Every operation execution MUST produce a normalized result (status, timing, attempt count, error/tool-error distinction, warnings, summary, exposure-filtered content) that is persisted and distinguishable from raw protocol data.
- **FR-038**: Orchestrated operations MUST participate in the same phase lifecycle as local process operations; local executable hooks remain available (v1 compatibility) as `process`-type operations.
- **FR-039**: The supported operation types MUST include local process, downstream MCP tool invocation, downstream MCP resource read, downstream MCP prompt retrieval, composite operations (configured sequences with sequential/parallel/first-available strategies), bounded sampling operations (model requests through the upstream client, with explicit purpose, prompt/token limits, retry limits, approval policy, and fallback), and elicitation operations (structured user input through the upstream client, with a structured-blocker fallback when the upstream client does not support elicitation).
- **FR-040**: A required operation failure MUST block the corresponding transition and leave the session recoverable, with manual retry permitted when policy allows; optional operation failures MUST produce warnings without corrupting workflow state.
- **FR-041**: All operations MUST enforce configured limits: timeout, retry attempts (distinguishing transient from deterministic failures), response size, concurrency, and nested-request depth.
- **FR-042**: Guidance MUST detect capability drift for pinned required operations (schema/capability changes on a downstream server) and react per configuration (reject, re-discover, or accept compatible changes only), recording every drift event.
- **FR-043**: Duplicate state-changing requests MUST NOT cause duplicate downstream invocations; every operation execution carries a unique execution identifier and idempotency status, and state-changing operations that were interrupted with unknown outcome MUST NOT be automatically re-run.
- **FR-044**: Workflow state MUST include downstream orchestration state (per-server connection/health status, capability snapshot reference, per-operation latest execution and attempts), persisted after every state change.
- **FR-045**: The audit history MUST record every downstream connection event, capability discovery/change, operation preparation/rejection/start/result/retry, sampling/elicitation request, user approval, and fallback selection — with secrets redacted.
- **FR-046**: Guidance MUST expose upstream tools for orchestration visibility and recovery: orchestration status for the active phase, configured (safe) operation listing, filtered operation-result retrieval, operation retry, operation-input resolution, and downstream server health — without revealing secrets, credentials, or unrestricted server configuration.

**Downstream governance & security (v2)**

- **FR-047**: The coding agent MUST NOT be able to add or modify downstream servers, transport commands or URLs, credentials, capability allowlists, validators, or operation risk classifications through any agent-facing surface.
- **FR-048**: Guidance MUST invoke only capabilities explicitly allowlisted in trusted configuration; discovery does not imply permission.
- **FR-049**: All downstream content (tool descriptions, prompts, results, resource contents) MUST be treated as untrusted data; it MUST NOT override workflow policy, transition requirements, workspace restrictions, or approval rules, and downstream prompts MUST NOT automatically override Guidance instructions.
- **FR-050**: Credentials MUST be referenced indirectly (secret references) and MUST NOT appear in workflow state, agent-facing responses, operation templates, audit logs, or raw error messages.
- **FR-051**: Workspace boundaries MUST be enforced by Guidance itself using canonical, symlink-resolved paths validated against trusted configuration — not by relying on informational workspace hints from the client.
- **FR-052**: Before sending data to a downstream server, Guidance MUST evaluate a data-egress policy (which fields, source-code content, sensitive data, required approvals) based on the server's configured trust level and the operation's risk class.
- **FR-053**: Operations classified as destructive or credential-sensitive MUST require explicit authorization through configuration or an approval gate before execution.
- **FR-054**: When a downstream operation requires additional input, Guidance MUST NOT fabricate it: it MUST apply a configured strategy (use a validated session value, request structured user input, return a structured blocker, or reject), and any supplied input MUST be validated against the stored request schema; sensitive credential fields MUST be denied.
- **FR-057**: `cancel_workflow` MUST cancel gracefully: running operations are aborted where the downstream capability supports cancellation, otherwise awaited up to their configured timeouts; all operation results are recorded, supervised downstream processes are shut down cleanly, and the terminal `cancelled` state is persisted only after draining completes. `cancelled` MUST never be persisted while operations are still running.
- **FR-058**: Downstream connections MUST negotiate the MCP protocol revision automatically within the range the implementation supports; a downstream server MUST NOT be rejected at handshake solely for using an older supported revision. Capability contracts MUST be pinned against the revision actually discovered on that connection.
- **FR-059**: Guidance MUST emit structured, leveled operational logs (secret-redacted under the same policy as the audit history) covering connection lifecycle, operation execution, and configuration errors; health and summary information MUST be available through the existing status tools. A dedicated metrics surface is explicitly out of scope for this iteration. (Tracked follow-up: administrative metrics tool — operation counts/durations/error rates, connection health.)
- **FR-055**: The mandatory repository-analysis operation MUST support an explicitly configured fallback chain (default: downstream MCP tool first, local repository-analysis command as declared fallback). Fallback execution MUST be explicit in configuration, MUST be recorded in the audit history (including which alternative was selected), and MUST NOT silently substitute an MCP operation with a local command unless configuration permits it.

**Target integrations**

- **FR-056**: The default configuration MUST ship support for three downstream MCP servers: GitNexus (repository analysis — completion invariant), Insight (project insight query/store operations usable in phase lifecycles), and Memory (project memory operations). Each ships with a logical operation mapping (e.g., `repository-analysis`, `query-project-insights`, `store-completion-insight`), capability allowlist, and trust level; any of them may be disabled per project without code changes.

**Spec-Kit Integration Profile (v2.1, opt-in)**

- **FR-060**: The server MUST support the `spec-kit` workflow profile as an opt-in configuration; workflows without the profile MUST continue to operate unchanged (no Spec-Kit artifacts required). The file-based adapter is the required initial integration mode; Spec-Kit is never required to run as an MCP server. Profile resolution: the plain workflow is the default when no profile is configured; profile `spec-kit` is implied when the configuration enables Spec-Kit integration or configures a feature root, and otherwise requires explicit profile selection.
- **FR-061**: Feature discovery MUST select exactly one active Spec-Kit feature per session, supporting explicit selection (recommended), branch-derived selection (validated against actual feature directories), and automatic selection only when unambiguous; ambiguous selection MUST block the workflow and request a choice. The resolved feature directory MUST remain inside the workspace root after canonical, symlink-resolved path validation. A feature directory MUST be exclusively locked by its active session: starting another session for the same feature is rejected with a recoverable `feature_in_use` error identifying the holding session, and the lock is released only when the holding session reaches a terminal state or is cancelled.
- **FR-062**: Artifacts MUST be addressed by logical type (specification, plan, tasks, research, data model, quickstart, contracts, checklists) with configurable path patterns; specification, plan, and tasks MUST be required by default. Every imported artifact MUST record logical type, relative/canonical path, content hash, size, modification time, parser version, and import timestamp.
- **FR-063**: The import pipeline MUST be deterministic (identical config + artifact content ⇒ identical result) and MUST enforce structural validation: required artifacts present, non-empty, readable; required sections present when configured; task identifiers present and unique; dependency references resolvable; no self-, duplicate, or cyclic dependencies; referenced paths inside the workspace; at least one normalized task present (a zero-task feature is a blocking finding). The task parser MUST recognize the full current Spec-Kit marker set: checkbox items with `T###` identifiers, `[P]` parallel markers, bold section headings as grouping (imported as `sourceSection`), dependency references, and item prose as the task description; unrecognized markers MUST produce non-blocking warnings. Semantic review by the coding agent MUST be recorded separately from deterministic validation findings, with severities (`info`/`warning`/`error`/`blocking`) where only configured blocking severities stop progression.
- **FR-064**: Each accepted import MUST persist an immutable artifact snapshot linked to its predecessor; active sessions with stale snapshots MUST be flagged and MUST NOT complete until refreshed. Staleness checking: size+mtime of imported artifacts is compared against snapshot metadata on every state-changing operation; any mismatch triggers a full content re-hash, marks the snapshot stale, and flags affected operations; a full content re-hash of all imported artifacts MUST additionally be performed at completion validation.
- **FR-065**: Import MUST normalize identifiable requirements, acceptance criteria, and tasks into persistent Guidance entities with source locations and cross-links; where source identifiers are missing, stable snapshot-local identifiers MAY be generated but MUST NOT be silently written back to the artifacts.
- **FR-066**: Every task MUST hold exactly one state from the task state machine (`pending` … `implemented`, `review_required`, `fix_required`, `verification_required`, `verified`, `completed`, plus `blocked`/`deferred`/`cancelled`). Guidance performs transitions only after validating agent reports; a Markdown checkbox in `tasks.md` MUST be treated per the configured policy (default `hint`) and MUST NEVER by itself mark a task verified or completed. Agents have NO single-task cancellation capability: an `in_progress` task leaves that state only through its normal machine transitions, an approved plan change (defer, FR-072), or session cancellation (FR-057).
- **FR-067**: Guidance MUST build a dependency graph and compute task readiness (all required dependencies in a configured success state, no blocking findings, no policy holds); only ready tasks may be released, and the agent MUST NOT be able to release or start blocked or unreleased tasks. The dependency-satisfying state set is fixed: a dependency is satisfied when the dependency task is `completed` or `verified` (no per-edge or per-project reconfiguration of this mapping).
- **FR-068**: The profile MUST support the scheduling modes `single`, `batch` (default, bounded size), `allReady`, and `phaseGroup`, respecting dependencies in all modes.
- **FR-069**: Task release MUST include identifiers, descriptions, dependencies, linked criteria, expected files, instructions, and the required report schema. Implementation submissions MUST be accepted only for the active release (unless opportunistic work is explicitly configured and approved) and MUST record changed/created/deleted files, tests, deviations, and unresolved issues. `complete_task` MUST require implementation evidence, completed review, no blocking findings, required task-level verification success, and approved deviations. Released and active batch state MUST persist and be restored on session restart; a restored batch remains claimed by its session.
- **FR-070**: Verification MUST use recorded evidence from real operations (local processes, downstream MCP results, test/build/lint/type-check output, approved manual checks) with configurable scopes (`task`, `batch`, `feature`, `repository`); an agent statement alone MUST NEVER mark a task verified. Failed verification MUST return affected tasks to correction.
- **FR-071**: Guidance MUST maintain a traceability graph (requirement → acceptance criterion → plan element → task → file → test → operation execution → finding → plan change) with coverage statuses (`unmapped` … `verified`, `waived`, `blocked`) and MUST expose a traceability report, including uncovered required criteria; report content MUST pass the same exposure and redaction policies as operation results. Links between tasks and requirements/criteria are acquired from two sources, merged: explicit references parsed from artifacts, and agent-declared links submitted during plan review or implementation — every declared identifier MUST be validated against the normalized entities (invalid references rejected), and every link MUST record its source (`parsed` vs `asserted`). The `waived` status MUST require explicit user approval via the FR-054 channel, a mandatory recorded reason, a dedicated audit event, and MUST be listed in the completion report; neither the agent nor Guidance can set it unilaterally.
- **FR-072**: Material plan deviations (adding/removing/deferring tasks, changing requirements, acceptance criteria, architecture, public API, dependencies, migrations, or verification strategy) MUST require a structured plan-change proposal; this trigger list is CLOSED — configuration may add triggers but never remove them. Classification MUST be deterministic: minor = purely additive and non-breaking (no change to acceptance criteria, public API, dependencies, or architecture); every other change is major. Guidance MUST apply the configured approval policy (major changes require user approval by default) and require explicit Spec-Kit artifact updates before refresh. Major-change approval MUST reuse the elicitation path of FR-054: a structured request via upstream elicitation when supported, otherwise a structured blocker resolved through `resume_workflow`; no separate approval mechanism is introduced. The artifact adapter MUST be read-only by default.
- **FR-073**: Artifact refresh MUST create a new immutable snapshot and reconcile against the previous one: unchanged tasks keep state and evidence; changed pending tasks are re-normalized; changed active tasks block pending review; changed completed tasks are flagged for impact review; removed completed tasks are superseded with audit history retained; added tasks start `pending`; readiness is recalculated. Evidence MUST NOT be silently discarded. Reconciliation apply MUST be atomic: the full reconciled result is prepared before a single atomic state write; a crash before that write leaves the previous snapshot authoritative with the reconciliation marked for retry — partially applied reconciliation states MUST be impossible.
- **FR-074**: A feature MUST NOT reach `completed` unless all configured Spec-Kit completion invariants hold: feature selected, required artifacts valid, active snapshot current, all required tasks completed with none blocked or active, dependencies satisfied, blocking findings resolved, all required acceptance criteria covered and verified (or explicitly waived per FR-071), required verification succeeded, no pending plan changes, no undeclared material deviations, required completion operations succeeded (including the GitNexus repository-analysis invariant), and the final traceability report persisted. The final completion report MUST list deferred tasks and all granted waivers.
- **FR-075**: The profile MUST expose its semantic tools (feature discovery, artifact import, status, next-task release, task start, implementation/review submission, task completion, plan-change proposal, artifact refresh, traceability report, read-only completion validation) and stable error codes; all state-changing calls MUST honor request-idempotency and per-session serialization. Artifact content MUST be treated as untrusted data (never policy), with configurable size/entity/excerpt limits and redaction before any return or transmission.

### Key Entities *(include if feature involves data)*

- **Workflow / Session / Phase / Instruction / Submission / Transition / Blocker**: as in v1 — a named phase sequence; a persisted session execution; a workflow stage; the configurable phase response; a schema-validated agent payload; an explicit gated state change; a recorded obstacle.
- **Downstream server**: A configured external MCP server (identity, transport, trust level, capability allowlist, connection/health status, discovered-capability snapshot).
- **Operation**: A stable logical unit bound to a lifecycle point — typed (`process`, `mcpTool`, `mcpResource`, `mcpPrompt`, composite; conditionally `sampling`, `elicitation`), with arguments (from approved sources/templates), requirement level, limits, retry policy, validation policy, output-exposure policy, risk class, and failure behavior.
- **Operation execution**: One concrete run — execution id, attempt number, status (including tool-reported error vs. transport failure vs. validation failure), timing, normalized result, retained raw evidence per policy.
- **Capability snapshot**: The discovered, hash-pinned capability contract of a downstream server at binding time, used for drift detection.
- **Policy**: Trusted rules governing what may run, what data may be sent where, what requires approval, and what output may be returned to the agent.
- **Imported snapshot**: The immutable, hash-recorded artifact set imported into a session; snapshots form a linked history and are the basis for staleness detection and reconciliation.
- **Task**: A normalized Spec-Kit work item with an explicit Guidance-owned state machine, dependencies, linked requirements/criteria, source location + hash, and recorded implementation/review/verification evidence.
- **Task batch**: A bounded set of ready tasks released together under the configured scheduling mode.
- **Traceability link / coverage status**: The recorded relationship between requirements, criteria, tasks, files, tests, and verification results; per-requirement completion status used by the completion invariants.
- **Plan change**: A recorded, classified, approval-gated proposal to modify the imported plan; resolved only via explicit artifact updates plus refresh/reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A coding agent can complete the full seven-phase workflow from start to `completed` with every next step dictated by server responses (100% of transitions server-controlled).
- **SC-002**: 0% of workflow sessions reach `completed` while any mandatory completion operation has not been executed and validated successfully (verified by fault injection: server down, tool error, invalid result, timeout).
- **SC-003**: The agent cannot execute an out-of-phase submission, invoke a non-allowlisted downstream capability, or register a downstream server — 100% of such attempts are rejected with a stable error code and audited.
- **SC-004**: A session interrupted at any point (simulated restart between every state change, including mid-operation) can be resumed correctly in 100% of test cases, with unknown-outcome state-changing operations never silently re-run.
- **SC-005**: Duplicate completion requests cause downstream completion operations to execute exactly once (verified by invocation-count assertions against the downstream stub).
- **SC-006**: Two projects with different `.guidance/` configurations run different processes (instructions, operations, transitions, downstream bindings) from the same server binary without code changes.
- **SC-007**: 100% of executed operations have recorded results (status, error classification, timing) inspectable via the workflow/orchestration tools, with 0 secret occurrences in any agent-facing or audit output (verified by pattern scan).
- **SC-008**: A downstream server that fails, times out, or returns invalid data never corrupts another server's connection or the workflow state (verified by fault isolation tests across at least two configured downstream servers).
- **SC-009**: Downstream content containing policy-overriding instructions never changes a transition outcome (verified by injection-test stubs).
- **SC-010**: Guidance's own orchestration adds less than 1 second (p95) of overhead per phase transition, excluding downstream operation run time (measured with stub downstream servers in acceptance tests).
- **SC-011**: 0% of Spec-Kit profile tasks reach a completed state without recorded implementation and verification evidence (verified against fixture sessions with tampered checkboxes).
- **SC-012**: 0% of task releases include tasks whose dependencies are unsatisfied, and 0% of start attempts for unreleased/blocked tasks succeed (verified by fixture dependency graphs incl. cycles and unknown references).
- **SC-013**: 0% of sessions reach `completed` while any required task is incomplete, any required acceptance criterion is uncovered/unverified, any plan change is pending, or the artifact snapshot is stale (fault-injection fixtures for each invariant).
- **SC-014**: Artifact refresh preserves prior execution evidence for 100% of unchanged tasks and flags 100% of changed completed tasks for impact review (reconciliation fixtures).
- **SC-015**: Every import, task transition, review, verification, and plan change is visible in the audit history with the active snapshot identifier (100% coverage by event assertions).

## Assumptions

- The v2 reference specification (`SDD/guidance-mcp-specification-v2.md`) is authoritative for orchestration semantics; its YAML examples are normative defaults whose canonical format is JSON (per clarification).
- All v1 decisions (JSON config, stdio+HTTP, `resume_workflow`, 90-day retention, strict validation) carry over unchanged; v1 local hooks survive as `process`-type operations.
- The server follows this repository's server-isolation convention and lives in `./servers/server-guidance`.
- Submission payloads use structured data; semantic validation beyond schema and configured rules is out of scope.
- The MVP uses file-based persistence; database persistence, distributed locking, and containerized operation execution are future extensions.
- MCP Roots are NOT used for access control (informational only); Guidance enforces workspace boundaries itself.
- Retention of raw downstream responses is configurable; the default retains raw results for required operations as audit evidence, redacted per policy.
- Default downstream bindings: GitNexus (repository analysis), Insight (project insights), Memory (project memory) — clarified 2026-09-22; each independently disable-able per project.
- The Spec-Kit Integration Profile (`SDD/guidance-spec-kit-integration-specification.md` v2.1) is integrated as an opt-in workflow profile (clarified 2026-09-22): file-based adapter only in the first iteration, `batch` scheduling as default, Markdown checkbox policy `hint`, read-only artifact adapter, profile config in JSON. The optional Spec-Kit MCP provider (profile milestone 10) is a recorded future extension. Spec-Kit remains the authoritative source of development intent; Guidance never silently rewrites its artifacts.
- Checklist-derived defaults (2026-09-22, recorded without questions): parallel task implementation concurrency defaults to 1 (parallelizable tasks may batch, but implement sequentially) unless configured; a new session for an already-`completed` feature is rejected as `workflow_already_completed` (a fresh session requires a new/refreshed snapshot via re-import); default orchestration limits — 1 MB per artifact excerpt, 500 tasks and 2,000 entities per feature, 64 KiB per returned excerpt; sampling operation defaults — maximum 2 retries, output token cap 2,048, purpose string required, advisory-only results; a parser-version change marks existing snapshots stale and requires refresh before further task release (no silent re-normalization); snapshots are retained for the session's retention period under FR-029 and archived with the session, never silently pruned; review-finding severity → consequence mapping defaults to `blocking` = {high, critical}; an agent may dispute a finding severity only via a plan-change-style structured proposal (no informal appeal); UTF-8 is the required artifact encoding (others rejected as `spec_kit_artifact_invalid`); CRLF is normalized by the parser; downstream unavailability for non-completion scopes follows FR-040 (optional ops warn, required ops block); import and reconciliation at the stated entity limits (≤ 500 tasks / ≤ 2,000 entities) are included in the SC-010 overhead budget; downstream capability subscriptions/notifications (profile §9.4) are explicitly excluded from the first iteration (future extension).

## Dependencies

- An MCP-compatible upstream client (any coding agent) that can call tools and follow structured instructions; upstream elicitation/sampling capabilities are optional and degrade gracefully.
- Configured downstream MCP servers must be reachable in the execution environment (stdio executables installed; remote servers authorized).
- No dependency on a specific language model, IDE, or coding assistant.

## Notes

- Requirements are cumulative: v1 (FR-001–009), v2 orchestration (FR-026–059), v2.1 Spec-Kit profile (FR-060–075); SC-001–015. All clarification markers are resolved (see Clarifications).
- Identifier note: FR-010–FR-025 are intentionally unused (v1→v2 renumbering artifact); do not assign or reference them.
- FR-074 specializes the base completion invariant of FR-004/FR-005 for the Spec-Kit profile (layering, not duplication).
- The Spec-Kit profile reuses the Guidance v2 operation engine for verification/completion operations; its phase identifiers stay compatible, with profile-specialized meanings (understand/import, plan/import+normalize, implement/task release, verify/evidence, complete/invariants).
