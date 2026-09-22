# Guidance v2: Spec-Kit Integration Profile

## Technical Specification for Spec-Driven Workflow Orchestration

**Status:** Draft  
**Version:** 2.1.0  
**Project:** Guidance  
**Profile ID:** `spec-kit`  
**Document language:** English  

---

## 1. Overview

The Guidance Spec-Kit Integration Profile defines how Guidance operates as a workflow orchestrator over development artifacts produced by Spec-Kit.

Spec-Kit remains responsible for specification-driven development artifacts, including the feature specification, implementation plan, and task decomposition. Guidance imports, validates, normalizes, and executes those artifacts through a deterministic development workflow.

The responsibility boundary is:

```text
Spec-Kit
    |
    | Defines development intent
    v
Specification, plan, tasks, supporting artifacts
    |
    | Imported and validated by Guidance
    v
Guidance
    |
    | Controls execution, review, verification, and completion
    v
Coding agent and downstream MCP services
```

Guidance does not replace Spec-Kit and does not silently create a competing implementation plan. It treats the selected Spec-Kit feature artifacts as the authoritative source of development intent.

The coding agent remains responsible for reasoning and source-code changes. Guidance remains responsible for:

- discovering the active Spec-Kit feature
- loading and validating its artifacts
- normalizing requirements, acceptance criteria, plan elements, and tasks
- determining which task or task batch may be executed next
- preventing tasks from starting before their dependencies are satisfied
- enforcing implementation, review, and verification steps
- controlling changes to the imported plan
- maintaining traceability from requirements to verification evidence
- invoking local hooks and downstream MCP operations
- preventing completion while required work remains unresolved

---

## 2. Relationship to Guidance v2

This document extends the Guidance v2 specification. All Guidance v2 requirements remain applicable unless this profile explicitly replaces or specializes them.

Guidance v2 provides:

- the upstream MCP server interface
- the deterministic workflow engine
- downstream MCP client orchestration
- local process execution
- configuration loading
- policy enforcement
- session persistence
- audit logging
- idempotency and recovery

This profile adds:

- a Spec-Kit artifact adapter
- feature discovery and selection
- artifact parsing and normalization
- a task-level state machine
- dependency-aware task scheduling
- specification-to-verification traceability
- controlled plan-change handling
- Spec-Kit-specific completion invariants
- Spec-Kit-specific Guidance tools

The resulting architecture is:

```text
Upstream MCP host and coding agent
                |
                v
       Guidance MCP server
                |
                v
       Guidance workflow engine
          |             |
          |             +-------------------------+
          v                                       v
Spec-Kit artifact adapter                MCP orchestration engine
          |                                       |
          v                              downstream MCP servers
specification, plan, tasks               GitNexus, Insight, others
```

---

## 3. Goals

### 3.1 Preserve responsibility boundaries

Spec-Kit MUST remain the authoritative source for:

- feature requirements
- acceptance criteria
- implementation planning artifacts
- task decomposition

Guidance MUST remain authoritative for:

- workflow state
- task execution state
- transition eligibility
- lifecycle operations
- verification evidence
- completion eligibility

### 3.2 Reuse existing Spec-Kit artifacts

Guidance MUST consume the files already produced by Spec-Kit without requiring Spec-Kit to be modified or run as an MCP server.

### 3.3 Prevent competing plans

When the Spec-Kit profile is active, the coding agent MUST NOT replace the imported plan with an unrelated plan through a normal phase submission.

Changes to the plan MUST follow the plan-change procedure defined by this specification.

### 3.4 Make tasks executable workflow entities

Imported Spec-Kit tasks MUST become persistent Guidance entities with explicit states, dependencies, evidence, and audit history.

### 3.5 Enforce dependency-aware execution

Guidance MUST release only tasks whose required dependencies are satisfied, unless an explicit policy allows another behavior.

### 3.6 Maintain end-to-end traceability

Guidance SHOULD trace:

```text
requirement
    -> acceptance criterion
    -> plan element
    -> task
    -> changed file
    -> test or check
    -> verification result
```

### 3.7 Support controlled evolution

The integration MUST allow legitimate specification or plan changes without allowing silent drift between Spec-Kit artifacts and the implementation.

### 3.8 Preserve deterministic completion

A feature MUST NOT reach `completed` while required Spec-Kit tasks, acceptance criteria, verification operations, plan changes, or completion operations remain unresolved.

---

## 4. Non-Goals

The initial Spec-Kit profile is not intended to:

- reimplement Spec-Kit commands
- generate a specification without Spec-Kit
- infer missing requirements and silently add them
- rewrite Spec-Kit artifacts without an explicit workflow action
- treat Markdown checkboxes alone as reliable implementation evidence
- semantically prove that every requirement is correct
- expose unrestricted file modification through the artifact adapter
- require Spec-Kit to provide an MCP server
- automatically commit or push repository changes
- allow a coding agent to skip required tasks by editing task status text
- use an LLM as the sole validator of artifact completeness

---

## 5. Normative Terms

The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** express requirement strength within this specification.

---

## 6. Terminology

### Feature

A unit of development represented by one Spec-Kit feature directory and its associated artifacts.

### Feature root

The repository directory under which Spec-Kit feature directories are stored.

### Artifact

A file or directory created or maintained as part of a Spec-Kit feature, such as `spec.md`, `plan.md`, or `tasks.md`.

### Artifact adapter

The Guidance component that discovers, loads, validates, and normalizes Spec-Kit artifacts.

### Imported snapshot

The exact artifact set and content hashes imported into a Guidance session at a particular time.

### Task

A normalized work item imported from a Spec-Kit task artifact.

### Required task

A task that must reach the configured terminal success state before feature completion.

### Deferred task

A task deliberately excluded from the current execution after an approved plan change.

### Task batch

A set of ready tasks released for implementation together.

### Traceability link

A recorded relationship among requirements, acceptance criteria, tasks, files, tests, and verification results.

### Plan deviation

A difference between approved Spec-Kit artifacts and the actual implementation approach or scope.

### Artifact refresh

Re-reading the selected feature artifacts and reconciling them with the session state.

---

## 7. Responsibility Model

### 7.1 Spec-Kit responsibilities

Spec-Kit is responsible for producing and maintaining development-intent artifacts, including:

- feature specification
- user scenarios
- functional requirements
- acceptance criteria
- implementation plan
- technical context
- work breakdown
- task identifiers
- task dependencies where represented
- supporting research and contracts

### 7.2 Guidance responsibilities

Guidance is responsible for:

- selecting the feature used by a workflow session
- validating mandatory artifacts
- recording immutable imported snapshots
- normalizing artifact content
- orchestrating task execution
- maintaining task states independently of Markdown checkboxes
- controlling plan changes
- invoking deterministic checks
- invoking configured downstream MCP operations
- calculating completion eligibility
- recording auditable evidence

### 7.3 Coding agent responsibilities

The coding agent is responsible for:

- understanding the imported feature
- identifying ambiguities and blockers
- reviewing the imported plan
- implementing released tasks
- reviewing and fixing the implementation
- interpreting failed checks
- updating code, tests, and documentation
- proposing necessary plan changes
- producing structured reports to Guidance

### 7.4 Downstream MCP server responsibilities

Downstream MCP servers provide specialized operations, such as:

- repository analysis
- code intelligence
- project memory
- security checks
- architectural analysis
- issue or documentation lookup

A downstream MCP server MUST NOT directly mutate Guidance workflow state.

---

## 8. Integration Modes

Guidance SHOULD support two integration modes.

### 8.1 File-based integration

This is the REQUIRED initial integration mode.

```text
Spec-Kit writes artifacts
        |
        v
Guidance reads and normalizes artifacts
```

Advantages:

- no changes to Spec-Kit are required
- artifacts remain human-readable
- repository history remains authoritative
- integration works with existing Spec-Kit projects
- the adapter can be tested independently

### 8.2 MCP-backed Spec-Kit integration

A future optional integration MAY use a Spec-Kit MCP provider.

This mode MAY support operations such as:

- requesting artifact generation
- requesting artifact validation
- proposing a plan update
- regenerating tasks
- resolving specification ambiguities

The file artifacts SHOULD remain the durable source of truth even when an MCP provider is used.

---

## 9. Feature Discovery

Guidance MUST select exactly one active Spec-Kit feature for a feature workflow session.

Supported selection strategies SHOULD include:

```text
explicit
currentBranch
mostRecentlyModified
singleCandidate
configuredDefault
```

### 9.1 Explicit selection

The upstream caller supplies a feature identifier or feature directory.

This is the safest and RECOMMENDED strategy.

### 9.2 Branch-based selection

Guidance derives a feature candidate from the current Git branch using configured matching rules.

The derived value MUST be validated against actual feature directories.

### 9.3 Automatic selection

Automatic selection is allowed only when the result is unambiguous.

If multiple candidates remain, Guidance MUST block the workflow and request a selection.

### 9.4 Example configuration

```yaml
integrations:
  specKit:
    enabled: true

    discovery:
      featureRoot: specs
      strategy: explicit
      allowFallbackStrategies:
        - currentBranch
        - singleCandidate

      branchMapping:
        stripPrefixes:
          - feature/
          - feat/

      requireUniqueMatch: true
```

### 9.5 Workspace boundary

The resolved feature directory MUST remain inside the configured workspace root after canonical path resolution.

Symbolic links MUST NOT be permitted to escape the workspace boundary.

---

## 10. Artifact Model

Guidance MUST use logical artifact types rather than hardcoded paths throughout the workflow engine.

Recommended logical types:

```text
specification
plan
tasks
research
dataModel
quickstart
contracts
checklists
constitution
```

### 10.1 Default artifact mappings

```yaml
integrations:
  specKit:
    artifacts:
      specification:
        required: true
        patterns:
          - spec.md

      plan:
        required: true
        patterns:
          - plan.md

      tasks:
        required: true
        patterns:
          - tasks.md

      research:
        required: false
        patterns:
          - research.md

      dataModel:
        required: false
        patterns:
          - data-model.md

      quickstart:
        required: false
        patterns:
          - quickstart.md

      contracts:
        required: false
        patterns:
          - contracts/**

      checklists:
        required: false
        patterns:
          - checklists/**
```

### 10.2 Artifact identity

Every imported artifact MUST have:

- logical type
- relative path
- canonical path
- content hash
- byte size
- last-modified timestamp
- parser version
- import timestamp

Example:

```json
{
  "type": "tasks",
  "relativePath": "specs/001-retry/tasks.md",
  "contentHash": "sha256:...",
  "sizeBytes": 8421,
  "modifiedAt": "2026-09-22T12:00:00Z",
  "parserVersion": "1.0.0",
  "importedAt": "2026-09-22T12:05:00Z"
}
```

---

## 11. Artifact Import Pipeline

The import pipeline MUST perform these steps:

```text
resolve feature
    -> discover artifacts
    -> enforce workspace boundary
    -> read files
    -> calculate hashes
    -> parse supported structures
    -> validate artifacts
    -> normalize entities
    -> validate cross-references
    -> build dependency graph
    -> build traceability baseline
    -> persist imported snapshot
```

The pipeline MUST be deterministic for identical configuration and artifact content.

---

## 12. Artifact Validation

Validation MUST distinguish structural checks from semantic review.

### 12.1 Deterministic structural validation

Guidance MUST be able to check:

- required artifacts exist
- required artifacts are readable
- artifacts are not empty
- supported encoding is used
- required headings or sections exist when configured
- task identifiers are present
- task identifiers are unique
- dependency references point to known tasks
- dependency graphs contain no prohibited cycles
- referenced paths remain within the workspace
- requirement identifiers are unique when present
- acceptance criterion identifiers are unique when present

### 12.2 Semantic review

The coding agent MAY be instructed to review:

- clarity of requirements
- completeness of acceptance criteria
- feasibility of the plan
- missing tasks
- architectural risks
- test coverage gaps
- contradictions among artifacts

Semantic review results MUST be recorded separately from deterministic validation errors.

### 12.3 Validation severity

Validation findings SHOULD use:

```text
info
warning
error
blocking
```

Only configured blocking severities prevent phase progression.

### 12.4 Example policy

```yaml
integrations:
  specKit:
    validation:
      requireSpecification: true
      requirePlan: true
      requireTasks: true
      requireAcceptanceCriteria: true
      requireUniqueTaskIds: true
      rejectUnknownDependencies: true
      rejectDependencyCycles: true
      rejectEmptyArtifacts: true

      requiredSections:
        specification:
          - User Scenarios & Testing
          - Requirements
          - Success Criteria

        plan:
          - Technical Context
          - Project Structure
```

---

## 13. Normalized Requirement Model

Guidance SHOULD normalize identifiable requirements.

```json
{
  "requirementId": "FR-001",
  "type": "functional",
  "text": "The retry count must be configurable.",
  "required": true,
  "source": {
    "artifact": "specification",
    "path": "specs/001-retry/spec.md",
    "lineStart": 42,
    "lineEnd": 42
  },
  "acceptanceCriteria": [
    "AC-001"
  ],
  "taskIds": [
    "T001",
    "T003"
  ]
}
```

If the source artifact does not provide identifiers, Guidance MAY generate stable snapshot-local identifiers.

Generated identifiers MUST NOT be written back silently to the artifacts.

---

## 14. Normalized Acceptance Criterion Model

```json
{
  "criterionId": "AC-001",
  "text": "A valid retry count changes the maximum number of attempts.",
  "required": true,
  "source": {
    "artifact": "specification",
    "lineStart": 18,
    "lineEnd": 18
  },
  "linkedRequirements": [
    "FR-001"
  ],
  "linkedTasks": [
    "T001",
    "T003"
  ],
  "verificationEvidence": []
}
```

---

## 15. Normalized Task Model

Every imported task MUST become a persistent Guidance task entity.

```json
{
  "taskId": "T001",
  "title": "Create the retry configuration model",
  "description": "Add retry configuration properties and validation.",
  "required": true,
  "parallelizable": false,
  "status": "pending",
  "dependencies": [],
  "affectedFiles": [
    "src/config.ts"
  ],
  "linkedRequirements": [
    "FR-001"
  ],
  "linkedAcceptanceCriteria": [
    "AC-001"
  ],
  "source": {
    "artifact": "tasks",
    "path": "specs/001-retry/tasks.md",
    "lineStart": 21,
    "lineEnd": 21,
    "contentHash": "sha256:..."
  },
  "implementation": null,
  "review": null,
  "verification": null,
  "history": []
}
```

### 15.1 Markdown checkbox status

A checkbox in `tasks.md` is source metadata, not sufficient workflow evidence.

```text
- [x] T001 ...
```

Guidance MUST NOT automatically treat the task as verified solely because the checkbox is selected.

The import policy MAY use a selected checkbox as one of:

```text
ignore
hint
implemented claim
completed only with imported evidence
```

The default SHOULD be `hint`.

---

## 16. Feature-Level Workflow

The default Spec-Kit profile retains the Guidance phase identifiers for compatibility:

```text
understand
plan
review_and_adjust_plan
implement
review_and_fix_implementation
verify
complete
completed
```

Their specialized meanings are:

### Understand

Understand the selected specification, requirements, acceptance criteria, constraints, and supporting artifacts.

### Plan

Import and normalize the Spec-Kit plan and tasks. This phase does not ask the agent to create an unrelated replacement plan.

### Review and Adjust Plan

Review the imported plan and tasks for completeness and feasibility. Necessary changes must use the controlled plan-change process.

### Implement

Release eligible tasks or task batches and collect implementation evidence.

### Review and Fix Implementation

Review implemented tasks, record findings, and return affected tasks for correction when necessary.

### Verify

Execute configured verification operations and associate their results with tasks and acceptance criteria.

### Complete

Validate traceability and completion invariants, run completion operations, and generate the final report.

---

## 17. Task-Level State Machine

Each task MUST have exactly one current state.

Recommended states:

```text
pending
ready
in_progress
implemented
review_required
fix_required
verification_required
verified
completed
blocked
deferred
cancelled
```

### 17.1 Default transitions

```text
pending -> ready
ready -> in_progress
in_progress -> implemented
implemented -> review_required
review_required -> fix_required
review_required -> verification_required
fix_required -> in_progress
verification_required -> verified
verified -> completed
```

Exceptional transitions:

```text
any nonterminal state -> blocked
blocked -> previous state
pending -> deferred
ready -> deferred
any nonterminal state -> cancelled
```

### 17.2 Transition authority

The coding agent reports outcomes. Guidance performs task state transitions after validating the report and applicable operations.

### 17.3 Task readiness

A task becomes `ready` only when:

- every required dependency is in a configured success state
- the task is not blocked
- the task is not deferred or cancelled
- required feature-level reviews are complete
- no applicable policy prevents execution

---

## 18. Dependency Graph

Guidance MUST build a directed dependency graph from normalized tasks.

It MUST detect:

- unknown dependencies
- self-dependencies
- duplicate dependencies
- prohibited cycles
- tasks permanently blocked by deferred dependencies

The graph SHOULD support topological scheduling.

A dependency cycle MUST block execution unless an explicit policy defines how the grouped tasks are handled.

---

## 19. Task Scheduling Modes

The Spec-Kit profile SHOULD support these scheduling modes.

### 19.1 Single

Release one ready task at a time.

```yaml
taskExecution:
  mode: single
```

### 19.2 Batch

Release bounded groups of ready tasks.

```yaml
taskExecution:
  mode: batch
  batch:
    maximumTasks: 3
    maximumEstimatedScope: medium
    respectDependencies: true
    groupParallelTasks: true
```

### 19.3 All Ready

Release all currently ready tasks.

```yaml
taskExecution:
  mode: allReady
```

### 19.4 Phase Group

Release tasks grouped by a phase, user story, or configured source section.

```yaml
taskExecution:
  mode: phaseGroup
  groupingField: sourceSection
```

The default SHOULD be `batch` with a small maximum batch size.

---

## 20. Task Release

A released task or batch MUST include:

- task identifiers
- descriptions
- dependencies
- linked requirements
- linked acceptance criteria
- expected files where known
- relevant artifact excerpts or references
- task-specific instructions
- required implementation report schema
- operations that will follow implementation

Example response:

```json
{
  "sessionId": "session-123",
  "currentPhase": "implement",
  "taskBatch": {
    "batchId": "batch-004",
    "tasks": [
      {
        "taskId": "T003",
        "title": "Add retry behavior tests",
        "dependencies": [
          "T001",
          "T002"
        ],
        "linkedAcceptanceCriteria": [
          "AC-001",
          "AC-002"
        ]
      }
    ]
  },
  "instruction": "Implement only the released task batch and report all changed files and deviations."
}
```

---

## 21. Task Implementation Submission

The agent MUST submit structured implementation evidence.

```json
{
  "sessionId": "session-123",
  "batchId": "batch-004",
  "tasks": [
    {
      "taskId": "T003",
      "summary": "Added retry behavior tests.",
      "changedFiles": [
        "tests/retry.test.ts"
      ],
      "createdFiles": [],
      "deletedFiles": [],
      "testsAddedOrUpdated": [
        "tests/retry.test.ts"
      ],
      "commandsExecutedByAgent": [],
      "deviations": [],
      "unresolvedIssues": []
    }
  ]
}
```

Guidance MUST reject submissions containing tasks that were not part of the active release, unless the configuration explicitly permits opportunistic work and the deviations are approved.

---

## 22. Task Review

Implemented tasks MUST pass the configured review policy.

Review MAY occur:

```text
per task
per batch
per feature implementation phase
hybrid
```

A review report SHOULD contain:

```json
{
  "batchId": "batch-004",
  "findings": [
    {
      "findingId": "IF-007",
      "taskIds": [
        "T003"
      ],
      "severity": "medium",
      "category": "coverage",
      "description": "The zero-retry case is not covered.",
      "fixRequired": true,
      "fixApplied": false
    }
  ],
  "unresolvedFindings": [
    "IF-007"
  ]
}
```

Tasks with unresolved blocking findings MUST enter `fix_required`.

---

## 23. Verification Model

Verification MUST use real evidence where deterministic operations are available.

Evidence sources MAY include:

- local process operations
- downstream MCP tool results
- downstream MCP resource content
- test reports
- build output
- linter output
- type-check output
- repository analysis
- approved manual checks

A task MUST NOT be marked `verified` solely because the coding agent states that it works.

### 23.1 Verification scopes

Operations MAY have one of these scopes:

```text
task
batch
feature
repository
```

### 23.2 Example operation mapping

```yaml
verification:
  operations:
    - id: unit-tests
      scope: batch
      required: true

    - id: build
      scope: feature
      required: true

    - id: repository-analysis
      scope: repository
      lifecycle: complete.beforeExit
      required: true
```

---

## 24. Traceability Model

Guidance SHOULD maintain a traceability graph.

Recommended node types:

```text
requirement
acceptanceCriterion
planElement
task
file
test
operationExecution
finding
planChange
```

Recommended edge types:

```text
defines
satisfies
implements
changes
verifies
dependsOn
finds
resolves
supersedes
```

### 24.1 Traceability record

```json
{
  "requirementId": "FR-001",
  "acceptanceCriteria": [
    "AC-001"
  ],
  "tasks": [
    "T001",
    "T003"
  ],
  "changedFiles": [
    "src/config.ts",
    "src/client.ts",
    "tests/retry.test.ts"
  ],
  "tests": [
    "tests/retry.test.ts"
  ],
  "verificationExecutions": [
    "operation-01K5..."
  ],
  "status": "verified"
}
```

### 24.2 Coverage statuses

```text
unmapped
planned
implemented
partially_verified
verified
waived
blocked
```

### 24.3 Completion use

Required requirements and acceptance criteria MUST achieve an allowed completion status before the feature can complete.

---

## 25. Controlled Plan Changes

Guidance MUST prevent silent drift from imported Spec-Kit artifacts.

### 25.1 Plan-change triggers

A plan-change proposal SHOULD be required for:

- adding a task
- removing a required task
- deferring a task
- changing a requirement
- changing an acceptance criterion
- changing architecture
- adding a production dependency
- changing a public API
- changing persisted data or schemas
- adding a migration
- materially changing verification strategy
- implementing outside the selected feature scope

### 25.2 Plan-change process

```text
agent detects required change
    -> agent submits proposal
    -> Guidance validates proposal
    -> approval policy is evaluated
    -> Spec-Kit artifacts are updated explicitly
    -> Guidance refreshes artifacts
    -> old and new snapshots are compared
    -> task and traceability state is reconciled
    -> affected work is rescheduled
```

### 25.3 Plan-change proposal

```json
{
  "sessionId": "session-123",
  "changeType": "add_task",
  "reason": "An integration test is required to validate retry behavior.",
  "affectedArtifacts": [
    "plan",
    "tasks"
  ],
  "affectedTasks": [
    "T003"
  ],
  "proposedChanges": {
    "newTask": {
      "title": "Add an HTTP integration test",
      "dependencies": [
        "T002"
      ]
    }
  },
  "impact": {
    "publicApi": false,
    "dependencies": false,
    "acceptanceCriteria": true
  }
}
```

### 25.4 Approval

Approval policies MAY be:

```text
automatic for configured minor changes
user approval
external approval
always blocked until artifacts are updated
```

Major changes SHOULD require user approval.

### 25.5 Artifact update authority

By default, Guidance MUST NOT modify Spec-Kit artifacts automatically.

Instead, it SHOULD instruct the coding agent to update them and then call `refresh_spec_kit_artifacts`.

An optional trusted artifact-writer component MAY be configured separately.

---

## 26. Artifact Refresh and Reconciliation

Artifact refresh MUST compare the new artifact snapshot with the imported snapshot.

The comparison MUST identify:

- added artifacts
- removed artifacts
- changed artifacts
- added tasks
- removed tasks
- changed task descriptions
- changed dependencies
- changed requirements
- changed acceptance criteria
- changed plan constraints

### 26.1 Reconciliation rules

Guidance MUST NOT discard execution evidence silently.

Recommended behavior:

- unchanged task: preserve state and evidence
- changed pending task: replace normalized definition
- changed active task: block and require review
- changed completed task: mark evidence stale and require impact review
- removed pending task: require approved removal
- removed completed task: retain audit history and mark superseded
- added task: initialize as `pending`
- changed dependency: recalculate readiness

### 26.2 Snapshot history

Every accepted refresh MUST create a new immutable snapshot and link it to the previous snapshot.

---

## 27. Workflow Profile Configuration

Example `.guidance/profiles/spec-kit.yaml`:

```yaml
version: 2

profile:
  id: spec-kit
  displayName: Spec-Kit Orchestrated Development

integrations:
  specKit:
    enabled: true

    discovery:
      featureRoot: specs
      strategy: explicit
      requireUniqueMatch: true

    artifacts:
      specification:
        required: true
        patterns:
          - spec.md

      plan:
        required: true
        patterns:
          - plan.md

      tasks:
        required: true
        patterns:
          - tasks.md

      research:
        required: false
        patterns:
          - research.md

      dataModel:
        required: false
        patterns:
          - data-model.md

      contracts:
        required: false
        patterns:
          - contracts/**

    validation:
      requireAcceptanceCriteria: true
      requireUniqueTaskIds: true
      rejectUnknownDependencies: true
      rejectDependencyCycles: true
      rejectEmptyArtifacts: true

    taskExecution:
      mode: batch
      batch:
        maximumTasks: 3
        respectDependencies: true
        groupParallelTasks: true

    markdownCheckboxPolicy: hint

    changes:
      allowAutomaticMinorAdjustments: false
      requireArtifactUpdateFor:
        - added_task
        - removed_task
        - changed_acceptance_criterion
        - architecture_change
        - public_api_change
        - dependency_change

    completion:
      requireAllRequiredTasksCompleted: true
      requireAcceptanceCriteriaCoverage: true
      requireNoUnresolvedPlanChanges: true
      requireCurrentArtifactSnapshot: true
```

---

## 28. Workflow Configuration

```yaml
version: 2

workflow:
  id: spec-kit-development
  profile: spec-kit
  initialPhase: understand

phases:
  understand:
    response: spec-kit-understand

    lifecycle:
      afterEnter:
        operations:
          - discover-spec-kit-feature
          - import-spec-kit-artifacts

    transitions:
      - to: plan
        when:
          all:
            - artifacts_valid
            - understanding_submission_valid

  plan:
    response: spec-kit-import-plan

    lifecycle:
      afterEnter:
        operations:
          - normalize-spec-kit-tasks
          - build-task-dependency-graph
          - build-traceability-baseline

    transitions:
      - to: review_and_adjust_plan
        when: imported_plan_valid

  review_and_adjust_plan:
    response: spec-kit-review-plan

    transitions:
      - to: plan
        reason: artifact_update_required

      - to: implement
        when:
          all:
            - plan_review_valid
            - no_blocking_plan_findings
            - no_pending_plan_changes

  implement:
    response: spec-kit-implement

    transitions:
      - to: review_and_fix_implementation
        when: no_implementable_tasks_remain

      - to: implement
        reason: next_task_batch_available

  review_and_fix_implementation:
    response: spec-kit-review-implementation

    transitions:
      - to: implement
        reason: task_fixes_required

      - to: verify
        when: all_required_tasks_reviewed

  verify:
    response: spec-kit-verify

    lifecycle:
      beforeExit:
        operations:
          - lint
          - test
          - build

    transitions:
      - to: review_and_fix_implementation
        reason: verification_failed

      - to: complete
        when:
          all:
            - required_verification_succeeded
            - required_tasks_verified

  complete:
    response: spec-kit-complete

    lifecycle:
      beforeExit:
        operations:
          - validate-spec-kit-completion
          - repository-analysis
          - store-completion-insight

    transitions:
      - to: completed
        when:
          all:
            - spec_kit_completion_invariants_satisfied
            - required_operations_succeeded

states:
  completed:
    terminal: true

  blocked:
    system: true

  cancelled:
    terminal: true
```

---

## 29. Configurable Phase Responses

Example response definitions:

```yaml
responses:
  spec-kit-understand:
    title: Understand the Spec-Kit Feature
    instruction: |
      Review the selected Spec-Kit specification and supporting artifacts.

      Identify:
      - the intended user outcome
      - functional requirements
      - acceptance criteria
      - constraints and non-goals
      - ambiguities or contradictions
      - risks that may affect implementation

      Do not create a replacement implementation plan.
      Distinguish artifact facts from your own assumptions.

  spec-kit-import-plan:
    title: Import the Spec-Kit Plan and Tasks
    instruction: |
      Guidance has imported the Spec-Kit plan and task list.

      Review the normalized plan, task dependencies, and baseline
      traceability. Do not begin implementation and do not replace the
      imported plan with an unrelated plan.

  spec-kit-review-plan:
    title: Review the Spec-Kit Execution Plan
    instruction: |
      Review the imported plan and tasks for completeness, feasibility,
      maintainability, testability, security, and compatibility.

      Report missing or problematic work. If the plan must change, submit
      a structured plan-change proposal. Do not silently alter scope.

  spec-kit-implement:
    title: Implement the Released Spec-Kit Tasks
    instruction: |
      Implement only the task or task batch released by Guidance.

      Follow the imported plan and report:
      - changed, created, and deleted files
      - tests added or updated
      - deviations from the plan
      - unresolved issues
      - discovered need for plan changes

  spec-kit-review-implementation:
    title: Review and Fix the Task Implementation
    instruction: |
      Review the implemented tasks and their changes for correctness,
      edge cases, error handling, maintainability, security, performance,
      compatibility, test coverage, and conformity with the Spec-Kit plan.

      Apply required fixes and report every finding with its affected task.

  spec-kit-verify:
    title: Verify the Spec-Kit Feature
    instruction: |
      Guidance will execute the configured verification operations.

      Analyze any failed result and return to implementation review when a
      code change is required. Do not claim success while a required
      operation or acceptance criterion remains unresolved.

  spec-kit-complete:
    title: Complete the Spec-Kit Feature
    instruction: |
      Produce the final completion report based on the imported Spec-Kit
      artifacts and recorded execution evidence.

      Include:
      - completed tasks
      - changed files
      - acceptance-criterion coverage
      - verification results
      - approved plan changes
      - known limitations
      - deferred work
      - remaining risks

      Guidance will validate traceability and execute all mandatory
      completion operations before entering the completed state.
```

---

## 30. Guidance MCP Tools for the Spec-Kit Profile

Guidance SHOULD expose these semantic tools:

```text
discover_spec_kit_feature
import_spec_kit_artifacts
get_spec_kit_status
get_next_task
start_task
submit_task_implementation
submit_task_review
complete_task
propose_plan_change
refresh_spec_kit_artifacts
get_traceability_report
validate_spec_kit_completion
```

Administrative or unrestricted artifact-writing tools SHOULD NOT be model-accessible by default.

---

## 31. Tool: `discover_spec_kit_feature`

### Purpose

Discover or validate the feature associated with a session.

### Input

```json
{
  "sessionId": "session-123",
  "featureId": "001-retry-configuration"
}
```

### Output

```json
{
  "sessionId": "session-123",
  "feature": {
    "featureId": "001-retry-configuration",
    "relativeDirectory": "specs/001-retry-configuration",
    "selectionStrategy": "explicit"
  },
  "artifactsDiscovered": [
    "specification",
    "plan",
    "tasks",
    "research"
  ]
}
```

---

## 32. Tool: `import_spec_kit_artifacts`

### Purpose

Import, validate, normalize, and snapshot the selected feature artifacts.

### Input

```json
{
  "sessionId": "session-123",
  "requestId": "request-001"
}
```

### Required behavior

Guidance MUST:

1. verify the current feature
2. discover configured artifacts
3. enforce workspace boundaries
4. calculate hashes
5. parse supported content
6. run deterministic validation
7. normalize requirements, criteria, and tasks
8. build the dependency graph
9. create the traceability baseline
10. persist the snapshot and audit events

---

## 33. Tool: `get_spec_kit_status`

### Purpose

Return the imported feature status without modifying state.

### Output

```json
{
  "featureId": "001-retry-configuration",
  "snapshotId": "snapshot-003",
  "artifactsValid": true,
  "taskSummary": {
    "total": 8,
    "pending": 3,
    "inProgress": 1,
    "completed": 4,
    "blocked": 0,
    "deferred": 0
  },
  "acceptanceCriteria": {
    "total": 5,
    "verified": 2,
    "remaining": 3
  },
  "pendingPlanChanges": 0
}
```

---

## 34. Tool: `get_next_task`

### Purpose

Return the next eligible task or batch selected by Guidance.

### Input

```json
{
  "sessionId": "session-123"
}
```

### Behavior

Guidance MUST use the configured scheduler and current dependency graph.

The coding agent MUST NOT be able to use this tool to select an arbitrary blocked task.

---

## 35. Tool: `start_task`

### Purpose

Claim a released task or batch for active implementation.

### Input

```json
{
  "sessionId": "session-123",
  "batchId": "batch-004",
  "requestId": "request-017"
}
```

### Behavior

Guidance MUST reject the request if:

- the batch was not released
- a task is no longer ready
- the session phase is not `implement`
- the batch is already active in an incompatible request
- a required dependency is no longer satisfied

---

## 36. Tool: `submit_task_implementation`

### Purpose

Submit implementation evidence for an active task batch.

The submission schema MUST include task identifiers, changed files, tests, deviations, and unresolved issues.

Guidance MUST associate evidence with the exact imported task snapshot.

---

## 37. Tool: `submit_task_review`

### Purpose

Submit findings and fixes for implemented tasks.

Guidance MUST transition affected tasks according to finding severity and resolution state.

---

## 38. Tool: `complete_task`

### Purpose

Request transition of a verified task into its terminal success state.

A task MUST NOT complete unless:

- implementation evidence exists
- required review is complete
- blocking findings are resolved
- required task-level verification succeeded
- unresolved deviations are approved

---

## 39. Tool: `propose_plan_change`

### Purpose

Record a requested change to the Spec-Kit plan, tasks, requirements, or acceptance criteria.

Guidance MUST evaluate the configured approval policy and return the required next action.

Example response:

```json
{
  "accepted": true,
  "changeId": "change-012",
  "classification": "major",
  "status": "artifact_update_required",
  "affectedTasks": [
    "T003"
  ],
  "instruction": "Update plan.md and tasks.md, then refresh the Spec-Kit artifacts."
}
```

---

## 40. Tool: `refresh_spec_kit_artifacts`

### Purpose

Import a new snapshot after approved artifact changes.

Guidance MUST produce a reconciliation preview before applying changes when active or completed task definitions are affected.

---

## 41. Tool: `get_traceability_report`

### Purpose

Return a filtered traceability report.

### Input

```json
{
  "sessionId": "session-123",
  "includeFiles": true,
  "includeVerification": true,
  "onlyUncovered": false
}
```

### Output

The result SHOULD show each requirement and acceptance criterion with linked tasks and evidence.

---

## 42. Tool: `validate_spec_kit_completion`

### Purpose

Evaluate all Spec-Kit completion invariants without transitioning the workflow.

This tool is read-only with respect to workflow state, although it MAY execute explicitly configured read-only validation operations.

---

## 43. Session State Extensions

A Spec-Kit session MUST persist:

```json
{
  "specKit": {
    "feature": {
      "featureId": "001-retry-configuration",
      "relativeDirectory": "specs/001-retry-configuration"
    },
    "activeSnapshotId": "snapshot-003",
    "snapshots": [],
    "requirements": {},
    "acceptanceCriteria": {},
    "tasks": {},
    "taskBatches": {},
    "planChanges": {},
    "traceability": {},
    "artifactValidation": {}
  }
}
```

Task state MUST be persisted independently of source Markdown checkbox state.

---

## 44. Audit Events

Additional audit events SHOULD include:

```text
spec_kit_feature_discovered
spec_kit_feature_selected
spec_kit_artifact_discovered
spec_kit_artifact_imported
spec_kit_artifact_rejected
spec_kit_snapshot_created
spec_kit_snapshot_refreshed
spec_kit_reconciliation_previewed
spec_kit_reconciliation_applied
spec_kit_task_normalized
spec_kit_task_ready
spec_kit_task_released
spec_kit_task_started
spec_kit_task_implementation_submitted
spec_kit_task_reviewed
spec_kit_task_verified
spec_kit_task_completed
spec_kit_task_blocked
spec_kit_task_deferred
spec_kit_plan_change_proposed
spec_kit_plan_change_approved
spec_kit_plan_change_rejected
spec_kit_traceability_updated
spec_kit_completion_validated
```

Every event SHOULD include the active snapshot identifier.

---

## 45. Error Model

Recommended error codes:

```text
spec_kit_not_enabled
spec_kit_feature_not_found
spec_kit_feature_ambiguous
spec_kit_feature_outside_workspace
spec_kit_artifact_missing
spec_kit_artifact_unreadable
spec_kit_artifact_empty
spec_kit_artifact_invalid
spec_kit_required_section_missing
spec_kit_task_id_missing
spec_kit_duplicate_task_id
spec_kit_unknown_dependency
spec_kit_dependency_cycle
spec_kit_snapshot_stale
spec_kit_reconciliation_required
spec_kit_task_not_found
spec_kit_task_not_ready
spec_kit_task_not_released
spec_kit_task_already_active
spec_kit_task_dependency_unsatisfied
spec_kit_task_review_required
spec_kit_task_verification_required
spec_kit_plan_change_required
spec_kit_plan_change_pending
spec_kit_traceability_incomplete
spec_kit_acceptance_criterion_unverified
spec_kit_completion_invariant_failed
```

Example:

```json
{
  "accepted": false,
  "error": {
    "code": "spec_kit_task_dependency_unsatisfied",
    "message": "Task T004 cannot start because T002 is not completed.",
    "recoverable": true
  },
  "currentPhase": "implement",
  "allowedActions": [
    "get_next_task",
    "get_spec_kit_status"
  ]
}
```

---

## 46. Concurrency and Locking

Guidance MUST serialize state-changing operations per session.

It SHOULD additionally lock:

- an active task batch during submission processing
- artifact refresh during reconciliation
- plan-change approval during artifact update
- feature completion during final validation

Independent ready tasks MAY be implemented concurrently only when configuration permits it and dependency constraints remain satisfied.

---

## 47. Idempotency

All state-changing tools SHOULD accept a `requestId`.

Repeated requests with the same identifier MUST return the recorded result rather than:

- starting the task twice
- importing duplicate snapshots
- applying reconciliation twice
- executing verification twice
- completing the same task twice
- invoking completion operations twice

---

## 48. Security Requirements

### 48.1 Trusted configuration

The coding agent MUST NOT be able to change:

- the feature root
- artifact path patterns
- workspace boundaries
- completion rules
- downstream server definitions
- operation allowlists
- validators
- approval policy

### 48.2 Path validation

All discovered and submitted paths MUST be canonicalized and checked against the workspace root.

### 48.3 Markdown as untrusted input

Spec-Kit artifacts are project input and MAY contain malicious or irrelevant instructions.

Guidance MUST treat their content as data. Artifact text MUST NOT override:

- Guidance system policy
- workflow configuration
- security rules
- tool allowlists
- credential handling
- completion invariants

### 48.4 Controlled writes

The artifact adapter SHOULD be read-only by default.

### 48.5 Output limits

Artifact size, parsed entity count, task count, dependency count, and returned excerpts MUST have configurable limits.

### 48.6 Sensitive content

Artifact excerpts and downstream results MUST pass redaction and data-egress policies before being returned or transmitted.

---

## 49. Completion Invariants

A Spec-Kit feature MUST NOT enter `completed` unless all configured invariants are satisfied.

The default REQUIRED invariants are:

```text
a feature is selected
all required artifacts exist
all required artifacts are valid
the active artifact snapshot is current
all required tasks are completed
no required task is blocked
no task is active
all required dependencies are satisfied
all blocking implementation findings are resolved
all required acceptance criteria are covered
all required acceptance criteria are verified
all required verification operations succeeded
no plan change remains pending
no undeclared material deviation remains
all required completion operations succeeded
the final traceability report was persisted
the terminal workflow state was persisted
```

If GitNexus repository analysis is configured as required, it MUST succeed before completion.

---

## 50. Example Completion Configuration

```yaml
integrations:
  specKit:
    completion:
      require:
        - artifacts_valid
        - active_snapshot_current
        - all_required_tasks_completed
        - no_blocked_required_tasks
        - no_active_tasks
        - all_acceptance_criteria_covered
        - all_acceptance_criteria_verified
        - no_pending_plan_changes
        - no_unresolved_material_deviations
        - required_verification_succeeded
        - required_completion_operations_succeeded
        - traceability_report_persisted

phases:
  complete:
    lifecycle:
      beforeExit:
        operations:
          - validate-spec-kit-completion
          - repository-analysis
          - store-completion-insight
```

---

## 51. End-to-End Example

```text
1. Agent starts Guidance with profile `spec-kit` and a feature ID.

2. Guidance discovers the feature directory.

3. Guidance imports spec.md, plan.md, tasks.md, and optional artifacts.

4. Guidance validates structure, identifiers, and dependencies.

5. Guidance creates an immutable artifact snapshot.

6. Agent reviews the specification in `understand`.

7. Guidance normalizes the imported plan and tasks in `plan`.

8. Agent reviews the plan in `review_and_adjust_plan`.

9. If a material gap exists, the agent proposes a plan change.

10. Spec-Kit artifacts are updated explicitly.

11. Guidance refreshes and reconciles the artifact snapshot.

12. Guidance selects the next ready task batch.

13. Agent implements only the released tasks.

14. Guidance records changed files and implementation evidence.

15. Agent reviews and fixes the implementation.

16. Guidance executes task-, batch-, and feature-level verification.

17. Failed verification returns affected tasks to correction.

18. Guidance repeats task release until no required tasks remain.

19. Guidance builds the final traceability report.

20. Guidance validates all Spec-Kit completion invariants.

21. Guidance invokes `repository-analysis` through GitNexus.

22. Guidance invokes configured memory or insight operations.

23. Guidance persists the completed state.
```

---

## 52. Compatibility and Migration

### 52.1 Existing Guidance workflows

Guidance workflows without the Spec-Kit profile MUST continue to operate without Spec-Kit artifacts.

### 52.2 Existing Spec-Kit repositories

The file-based adapter SHOULD require no changes to an existing valid Spec-Kit feature layout when default artifact mappings apply.

### 52.3 Guidance v1 process hooks

Existing local process operations remain valid and MAY be used for verification or completion.

### 52.4 Guidance v2 downstream MCP operations

The profile MAY invoke downstream MCP operations using the normal Guidance v2 operation engine.

The Spec-Kit adapter and downstream MCP orchestration are complementary:

```text
Spec-Kit artifacts define intent.
Guidance coordinates execution.
Downstream MCP servers provide specialized capabilities.
```

---

## 53. Suggested Implementation Components

```text
src/
├── integrations/
│   └── spec-kit/
│       ├── SpecKitAdapter
│       ├── FeatureDiscovery
│       ├── ArtifactDiscovery
│       ├── ArtifactImporter
│       ├── ArtifactParser
│       ├── ArtifactValidator
│       ├── SnapshotManager
│       ├── ReconciliationEngine
│       ├── RequirementNormalizer
│       ├── TaskNormalizer
│       ├── DependencyGraph
│       ├── TaskScheduler
│       ├── TraceabilityGraph
│       ├── CompletionValidator
│       └── types
├── workflow/
├── orchestration/
├── mcp-server/
├── mcp-client/
├── state/
└── policy/
```

---

## 54. Implementation Milestones

### Milestone 1: Read-only artifact discovery

- select a feature explicitly
- discover required artifacts
- enforce workspace boundaries
- calculate content hashes
- expose feature status

### Milestone 2: Structural validation

- validate required files
- parse task identifiers
- validate uniqueness
- parse dependencies
- detect unknown references and cycles

### Milestone 3: Snapshot persistence

- create immutable imported snapshots
- persist parser and configuration versions
- detect stale sessions
- record audit events

### Milestone 4: Task state machine

- normalize tasks
- persist task states
- calculate readiness
- release one task at a time
- accept implementation evidence

### Milestone 5: Review and verification

- attach review findings to tasks
- return tasks for fixes
- execute task and feature verification
- persist evidence

### Milestone 6: Batch scheduling

- release bounded batches
- support parallelizable tasks
- preserve dependency rules
- lock active batches

### Milestone 7: Traceability

- normalize requirements and acceptance criteria
- link tasks, files, tests, and operation results
- generate coverage and gap reports

### Milestone 8: Controlled plan changes

- submit change proposals
- apply approval policy
- refresh artifacts
- preview and apply reconciliation
- preserve historical evidence

### Milestone 9: Completion integration

- enforce Spec-Kit completion invariants
- invoke GitNexus repository analysis
- invoke optional Insight or memory operations
- persist the final traceability report

### Milestone 10: Optional Spec-Kit MCP provider

- request artifact generation or updates
- preserve files as durable artifacts
- validate provider outputs through the same adapter

---

## 55. Acceptance Criteria

The Spec-Kit Integration Profile is acceptable when:

1. Guidance can start a session with the `spec-kit` profile.
2. A feature can be selected explicitly.
3. Ambiguous automatic feature selection blocks the workflow.
4. Required artifacts are discovered from configuration.
5. Paths outside the workspace are rejected.
6. Imported artifacts receive content hashes.
7. An immutable artifact snapshot is persisted.
8. Missing required artifacts block progression.
9. Empty required artifacts block progression.
10. Task identifiers are normalized.
11. Duplicate task identifiers are rejected.
12. Unknown dependencies are rejected.
13. Dependency cycles are detected.
14. Task state is independent of Markdown checkbox state.
15. Only ready tasks can be released.
16. Only released tasks can be started.
17. The agent cannot complete a task without implementation evidence.
18. Required reviews can return tasks for correction.
19. Required verification uses recorded operation results.
20. The agent cannot replace the imported plan silently.
21. Material deviations require a plan-change proposal.
22. Artifact refresh creates a new snapshot.
23. Reconciliation preserves prior execution evidence.
24. Changed completed tasks are marked for impact review.
25. Requirements can be linked to acceptance criteria and tasks.
26. Tasks can be linked to changed files and tests.
27. Verification results can be linked to acceptance criteria.
28. A traceability report identifies uncovered required criteria.
29. Completion fails while a required task is incomplete.
30. Completion fails while a required criterion is unverified.
31. Completion fails while a plan change is pending.
32. Completion fails when the active artifact snapshot is stale.
33. Completion invokes all required Guidance operations.
34. Required GitNexus analysis blocks completion on failure.
35. Successful final validation permits the terminal state.
36. Every import, task transition, review, verification, and plan change is auditable.
37. Duplicate requests do not repeat state-changing operations.
38. Session state survives a Guidance restart.
39. Existing non-Spec-Kit Guidance profiles continue to work.
40. Existing Spec-Kit artifacts remain the authoritative development-intent source.

---

## 56. Summary

The Guidance Spec-Kit Integration Profile turns Spec-Kit artifacts into an enforceable development workflow.

The division of responsibility is:

```text
Spec-Kit
    = specification and task definition

Guidance
    = execution and governance

Coding agent
    = reasoning and implementation

Downstream MCP servers
    = specialized analysis and knowledge capabilities
```

Guidance does not merely read `tasks.md` as a checklist. It imports a versioned artifact snapshot, creates persistent task entities, enforces dependencies, releases bounded work, records implementation and review evidence, executes verification, controls plan changes, and maintains traceability through completion.

The defining completion rule is:

> A Spec-Kit feature cannot be completed until its required artifacts are valid, its required tasks are completed, its acceptance criteria are covered and verified, its plan changes are resolved, and all mandatory Guidance operations have succeeded.

This allows Guidance to act as a deterministic workflow orchestrator over Spec-Kit while preserving a clean separation between development intent, implementation work, and specialized MCP capabilities.
