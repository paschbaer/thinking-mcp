# Guidance

## Technical Specification for a Configurable MCP Workflow Server

**Status:** Draft  
**Version:** 0.1.0  
**Project name:** Guidance  
**Document**anguage:** English  

---

## 1. Overview

Guidance is a configurable Model Context Protocol server that guides coding agents through a deterministic software development workflow.

The server does not generate code and does not replace the coding agent. Instead, it controls the development process by:

- maintaining the current workflow state
- providing phase-specific instructions
- validating agent responses
- enforcing allowed phase transitions
- executing configured commands automatically
- recording workflow history
- preventing completion until mandatory checks have succeeded

Guidance separates the nondeterministic work of a coding agent from the deterministic enforcement of a development process.

```text
Coding agent:
- understands requirements
- creates plans
- reviews plans
- implements changes
- reviews code
- fixes problems
- interprets verification results

Guidance:
- determines the current phase
- supplies phase instructions
- validates required responses
- executes configured hooks
- controls state transitions
- records execution results
- enforces completion criteria
```

The initial workflow consists of the following phases:

```text
understand
plan
review_and_adjust_plan
implement
review_and_fix_implementation
verify
complete
```

---

## 2. Goals

Guidance has the following primary goals.

### 2.1 Deterministic workflow control

The server must control which phase is currently active and which transitions are permitted.

The coding agent must not be able to skip required phases merely by claiming that the work is complete.

### 2.2 Configurable agent guidance

The response returned by Guidance for each phase must be defined in configuration files.

Projects must be able to customize:

- phase instructions
- expected response structure
- validation requirements
- transition rules
- automatic hooks
- failure behavior
- retry behavior
- completion requirements

### 2.3 Automatic command execution

Guidance must be able to execute predefined commands before entering a phase, after entering a phase, before leaving a phase, or after leaving a phase.

For example, Guidance must be able to guarantee that the following command is executed automatically during workflow completion:

```bash
gitnexus analyze --no-stats
```

The workflow must not be marked as completed until all mandatory completion hooks have succeeded.

### 2.4 Persistent workflow state

Workflow state must exist independently of the language model context.

A workflow must remain recoverable when:

- the chat context is compressed
- the client is restarted
- a new conversation is started
- another compatible coding agent continues the work
- the language model forgets earlier instructions

### 2.5 Agent independence

Guidance should work with any MCP-compatible coding agent that can call its tools and follow structured instructions.

The workflow logic must not depend on a specific language model, IDE, or coding assistant.

### 2.6 Auditability

Every phase submission, state transition, hook execution, validation result, failure, and user decision should be recorded.

The resulting history should make it possible to determine:

- what the agent submitted
- what Guidance validated
- which commands were executed
- what their results were
- why a transition was accepted or rejected
- when the workflow reached completion

---

## 3. Non-Goals

The initial version of Guidance is not intended to:

- generate source code
- replace the coding agent
- make architectural decisions autonomously
- semantically prove that a plan is correct
- semantically prove that an implementation is correct
- execute arbitrary commands supplied by the coding agent
- act as a general-purpose shell server
- manage source control branches automatically
- replace CI/CD pipelines
- require its own language model
- perform unrestricted autonomous remediation

Guidance controls and validates the process. The coding agent remains responsible for reasoning and implementation.

---

## 4. Core Design Principles

### 4.1 One active phase

A workflow session has exactly one active phase at any given time.

### 4.2 Explicit transitions

A phase transition must be explicitly requested and approved by Guidance.

### 4.3 Configuration-driven instructions

Phase instructions must not be hardcoded into the MCP tool implementation.

### 4.4 Server-controlled hooks

Commands executed as workflow hooks must come from trusted configuration, not from arbitrary agent input.

### 4.5 Fail closed

If configuration cannot be loaded, a required hook cannot be executed, or workflow state is inconsistent, Guidance must reject the transition.

### 4.6 No unverified completion

A workflow must not enter the final completed state while mandatory verification or completion hooks are missing or unsuccessful.

### 4.7 Structured responses

Agent submissions should use structured data wherever possible.

### 4.8 Recoverable failures

A failed hook must not destroy the session. The workflow should remain in a recoverable state and provide a clear next action.

### 4.9 Idempotent workflow operations

Repeated requests should not accidentally execute destructive actions or duplicate completed transitions.

### 4.10 Separation of responsibilities

Configuration, workflow execution, process state, command execution, and audit logging should be separate components.

---

## 5. Terminology

### Workflow

A named sequence of development phases, transitions, validations, and hooks.

### Session

A concrete execution of a workflow for a specific development task.

### Phase

A defined stage of the workflow, such as `plan` or `verify`.

### Instruction

The configurable response returned to the coding agent for the active phase.

### Submission

Structured information sent by the coding agent to Guidance.

### Transition

A state change from one phase to another.

### Hook

A configured command executed automatically at a defined lifecycle point.

### Validator

A deterministic check applied to a submission, workflow state, hook result, or repository state.

### Blocking failure

A failure that prevents the workflow from continuing.

### Warning

A non-blocking issue that is returned to the agent and recorded in the history.

### Workflow state

The complete persisted state of a workflow session.

---

## 6. Default Workflow

The standard Guidance workflow is:

```text
understand
    |
    v
plan
    |
    v
review_and_adjust_plan
    |
    v
implement
    |
    v
review_and_fix_implementation
    |
    v
verify
    |
    v
complete
    |
    v
completed
```

The `completed` state is a terminal workflow state. It is not an agent work phase.

Possible correction loops include:

```text
review_and_adjust_plan
    |
    +----> plan

review_and_fix_implementation
    |
    +----> implement

verify
    |
    +----> review_and_fix_implementation
```

A failed completion hook may keep the session in `complete` or move it into a dedicated blocked state, depending on configuration.

---

## 7. Phase Definitions

## 7.1 Understand

### Purpose

The coding agent analyzes the original request before proposing changes.

### Expected outcomes

The agent should provide:

- a concise task summary
- assumptions
- open questions
- identified risks
- acceptance criteria
- affected functional areas
- known constraints

### Default submission structure

```json
{
  "summary": "A concise description of the requested change.",
  "assumptions": [
    "Assumption one"
  ],
  "openQuestions": [],
  "risks": [
    "Potential risk"
  ],
  "acceptanceCriteria": [
    "Observable acceptance criterion"
  ],
  "affectedAreas": [
    "Component or subsystem"
  ],
  "constraints": []
}
```

### Completion criteria

The phase may be completed when:

- all required fields are present
- no unresolved blocking question exists
- at least one acceptance criterion is defined
- the submission passes configured validation

### Default next phase

```text
plan
```

---

## 7.2 Plan

### Purpose

The coding agent creates a concrete implementation plan.

### Expected outcomes

The plan should identify:

- files expected to change
- files expected to be created
- implementation tasks
- dependencies between tasks
- tests to add or update
- validation commands
- risks and mitigation measures
- expected public API changes
- expected configuration changes
- possible documentation changes

### Recommended task identifiers

Every implementation task should receive a stable identifier.

```json
{
  "tasks": [
    {
      "id": "T1",
      "title": "Add configuration schema",
      "description": "Add the retry configuration properties.",
      "affectedFiles": [
        "src/config.ts"
      ],
      "dependsOn": [],
      "verification": [
        "Configuration validation tests pass"
      ]
    }
  ]
}
```

Stable identifiers make it possible to compare the approved plan with the implementation report.

### Completion criteria

The phase may be completed when:

- the plan contains at least one task
- every task has an identifier
- every task describes an expected outcome
- affected files are listed where known
- a test strategy is provided
- validation commands or validation methods are defined
- the submission passes configured validation

### Default next phase

```text
review_and_adjust_plan
```

---

## 7.3 Review and Adjust Plan

### Purpose

The coding agent critically reviews its own implementation plan before writing code.

This phase is intended to reveal incomplete assumptions, unnecessary complexity, architectural weaknesses, missing tests, and hidden risks.

### Review perspectives

The configured instruction may require the agent to review the plan from several perspectives:

- software architecture
- maintainability
- testability
- security
- backward compatibility
- operational impact
- performance
- documentation
- user experience

### Expected outcomes

The agent should report:

- identified weaknesses
- missing tasks
- missing tests
- architectural concerns
- unnecessary complexity
- compatibility risks
- proposed adjustments
- the final adjusted plan

### Default submission structure

```json
{
  "findings": [
    {
      "id": "PF1",
      "severity": "medium",
      "category": "testability",
      "description": "The original plan did not include an integration test.",
      "resolution": "Add task T4 for an integration test."
    }
  ],
  "adjustments": [
    {
      "type": "add_task",
      "description": "Add integration test coverage."
    }
  ],
  "approvedPlan": {
    "tasks": []
  },
  "remainingConcerns": []
}
```

### Possible outcomes

If the plan requires significant rework:

```text
review_and_adjust_plan -> plan
```

If the plan is accepted:

```text
review_and_adjust_plan -> implement
```

### Completion criteria

The phase may be completed when:

- the original plan has been reviewed
- all blocking findings have been resolved
- the adjusted plan is included
- remaining concerns are declared explicitly
- the final plan passes configured validation

---

## 7.4 Implement

### Purpose

The coding agent implements the approved plan.

The agent should not introduce unrelated changes or silently replace the approved plan with a new approach.

### Expected outcomes

The agent should report:

- implemented task identifiers
- changed files
- created files
- deleted files
- commands executed by the agent
- deviations from the approved plan
- unresolved implementation issues
- tests added or updated

### Default submission structure

```json
{
  "implementedTasks": [
    "T1",
    "T2"
  ],
  "changedFiles": [
    "src/config.ts",
    "src/client.ts"
  ],
  "createdFiles": [
    "tests/retry.test.ts"
  ],
  "deletedFiles": [],
  "testsAddedOrUpdated": [
    "tests/retry.test.ts"
  ],
  "commandsExecuted": [],
  "deviations": [],
  "unresolvedIssues": []
}
```

### Plan deviations

Every deviation from the approved plan must be explicit.

```json
{
  "deviations": [
    {
      "taskId": "T2",
      "description": "The planned helper was not introduced.",
      "reason": "The existing utility already provides the required behavior.",
      "impact": "No public API impact."
    }
  ]
}
```

Depending on configuration, a significant deviation may force a return to the planning process.

### Completion criteria

The phase may be completed when:

- all required plan tasks are implemented or explicitly deferred
- all changed files are declared
- all deviations are documented
- no unresolved blocking implementation issue remains
- the submission passes configured validation

### Default next phase

```text
review_and_fix_implementation
```

---

## 7.5 Review and Fix Implementation

### Purpose

The coding agent reviews the implementation critically and applies necessary corrections before formal verification.

### Review areas

The default review should inspect:

- correctness
- error handling
- edge cases
- code duplication
- dead code
- code clarity
- maintainability
- security
- performance
- test coverage
- backward compatibility
- API consistency
- project conventions
- documentation accuracy
- compliance with the approved plan

### Expected outcomes

The agent should report:

- review findings
- severity of each finding
- corrections applied
- unresolved findings
- files changed during review
- tests added or updated during review

### Default submission structure

```json
{
  "findings": [
    {
      "id": "IF1",
      "severity": "high",
      "category": "correctness",
      "description": "The retry counter is not reset after a successful request.",
      "fixApplied": true,
      "changedFiles": [
        "src/client.ts"
      ]
    }
  ],
  "filesChangedDuringReview": [
    "src/client.ts"
  ],
  "testsAddedOrUpdated": [
    "tests/retry.test.ts"
  ],
  "unresolvedFindings": []
}
```

### Possible outcomes

If corrections require further implementation work:

```text
review_and_fix_implementation -> implement
```

If the implementation is ready for deterministic verification:

```text
review_and_fix_implementation -> verify
```

### Completion criteria

The phase may be completed when:

- the implementation has been reviewed
- all blocking findings are fixed
- unresolved findings are declared
- the review submission passes configured validation

---

## 7.6 Verify

### Purpose

Guidance and the coding agent verify that the implementation satisfies the configured technical requirements.

This phase should rely on actual command output rather than unsupported statements from the coding agent.

### Typical verification hooks

```text
lint
type check
unit tests
integration tests
build
project-specific validation
```

### Example commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Expected agent outcomes

The agent may be asked to:

- interpret failed checks
- fix implementation problems
- explain intentionally skipped checks
- correlate failures with changed files
- confirm acceptance criteria

### Possible outcomes

If verification fails:

```text
verify -> review_and_fix_implementation
```

If all required verification succeeds:

```text
verify -> complete
```

### Completion criteria

The phase may be completed when:

- all mandatory verification hooks have run
- all mandatory hooks have succeeded
- no blocking validation failure remains
- skipped checks have been explicitly permitted
- configured acceptance criteria have been addressed

---

## 7.7 Complete

### Purpose

The coding agent produces the final completion report, and Guidance executes all mandatory completion hooks.

The session must not be marked as completed merely because the agent submitted a final report.

### Expected agent outcomes

The completion report should include:

- implementation summary
- changed files
- tests and checks performed
- known limitations
- remaining risks
- deviations from the approved plan
- deferred work
- recommended next steps

### Default submission structure

```json
{
  "summary": "Description of the completed implementation.",
  "changedFiles": [],
  "verificationSummary": [],
  "knownLimitations": [],
  "remainingRisks": [],
  "deviations": [],
  "deferredWork": [],
  "nextSteps": []
}
```

### Mandatory GitNexus hook

The default workflow must execute:

```bash
gitnexus analyze --no-stats
```

This command must be configured as a mandatory completion hook.

The workflow must not enter the terminal `completed` state unless:

- the completion submission is valid
- the GitNexus hook was started successfully
- the GitNexus process terminated
- the exit code satisfies the configured success policy
- all other mandatory completion hooks succeeded

### Default next state

```text
completed
```

---

## 8. Phase Lifecycle

Every phase can expose hooks at defined lifecycle points.

The recommended lifecycle is:

```text
transition requested
        |
        v
validate current phase submission
        |
        v
run current phase before-exit hooks
        |
        v
run current phase after-exit hooks
        |
        v
change active phase
        |
        v
run next phase before-enter hooks
        |
        v
run next phase after-enter hooks
        |
        v
return next phase instruction
```

For simpler configurations, Guidance may support these aliases:

```text
entryHooks
exitHooks
```

A clear normalized lifecycle should still be used internally.

### Recommended normalized hook points

```text
beforeEnter
afterEnter
beforeExit
afterExit
```

### Complete-phase behavior

Because `completed` is a terminal state rather than an agent phase, mandatory completion commands should normally be attached to `complete.beforeExit`.

```text
complete submission
        |
        v
submission validation
        |
        v
complete.beforeExit hooks
        |
        v
all mandatory hooks successful?
        |
   +----+----+
   |         |
  no        yes
   |         |
   v         v
remain     completed
in complete
```

This guarantees that finalization hooks run before the terminal state is persisted.

---

## 9. Configuration Model

A Guidance project should use a dedicated configuration directory.

```text
.guidance/
├── guidance.yaml
├── workflow.yaml
├── responses.yaml
├── hooks.yaml
├── schemas/
│   ├── understand.schema.json
│   ├── plan.schema.json
│   ├── review-plan.schema.json
│   ├── implement.schema.json
│   ├── review-implementation.schema.json
│   ├── verify.schema.json
│   └── complete.schema.json
└── state/
    ├── sessions/
    └── history/
```

Runtime state may optionally be stored outside the repository. The location should be configurable.

---

## 10. Main Configuration

Example `.guidance/guidance.yaml`:

```yaml
version: 1

project:
  name: example-project

workflow:
  file: workflow.yaml

responses:
  file: responses.yaml

hooks:
  file: hooks.yaml

state:
  directory: state
  persistAfterEveryOperation: true

security:
  allowAgentProvidedCommands: false
  restrictWorkingDirectory: true
  inheritEnvironment: false
  killProcessTreeOnTimeout: true

logging:
  level: info
  recordHookOutput: true
  redactEnvironmentVariables: true
```

---

## 11. Workflow Configuration

Example `.guidance/workflow.yaml`:

```yaml
version: 1

workflow:
  id: standard-development
  name: Standard Development Workflow
  initialPhase: understand
  terminalStates:
    - completed
    - cancelled

phases:
  understand:
    response: understand
    submissionSchema: schemas/understand.schema.json
    transitions:
      - to: plan
        when: submission_valid

  plan:
    response: plan
    submissionSchema: schemas/plan.schema.json
    transitions:
      - to: review_and_adjust_plan
        when: submission_valid

  review_and_adjust_plan:
    response: review_and_adjust_plan
    submissionSchema: schemas/review-plan.schema.json
    transitions:
      - to: plan
        reason: major_plan_revision_required
      - to: implement
        when: submission_valid

  implement:
    response: implement
    submissionSchema: schemas/implement.schema.json
    transitions:
      - to: review_and_fix_implementation
        when: submission_valid
      - to: plan
        reason: significant_plan_deviation

  review_and_fix_implementation:
    response: review_and_fix_implementation
    submissionSchema: schemas/review-implementation.schema.json
    transitions:
      - to: implement
        reason: implementation_changes_required
      - to: verify
        when: submission_valid

  verify:
    response: verify
    submissionSchema: schemas/verify.schema.json
    hooks:
      beforeExit:
        - lint
        - test
        - build
    transitions:
      - to: review_and_fix_implementation
        reason: verification_failed
      - to: complete
        when: required_hooks_succeeded

  complete:
    response: complete
    submissionSchema: schemas/complete.schema.json
    hooks:
      beforeExit:
        - gitnexus-analysis
    transitions:
      - to: completed
        when: required_hooks_succeeded

states:
  completed:
    terminal: true

  blocked:
    system: true

  cancelled:
    terminal: true
```

---

## 12. Configurable MCP Responses

All agent-facing phase instructions must be configurable.

Example `.guidance/responses.yaml`:

```yaml
version: 1

responses:
  understand:
    title: Understand the Request
    instruction: |
      Analyze the development request before proposing an implementation.

      Provide:
      - a concise summary of the requested outcome
      - all assumptions
      - all unresolved questions
      - relevant constraints
      - technical and operational risks
      - measurable acceptance criteria
      - affected components or functional areas

      Do not create an implementation plan yet.

    requiredActions:
      - Inspect the relevant repository context.
      - Distinguish confirmed facts from assumptions.
      - Identify blocking questions explicitly.

  plan:
    title: Create the Implementation Plan
    instruction: |
      Create a concrete implementation plan based on the accepted
      understanding of the request.

      Assign a stable identifier to every task.

      For each task, include:
      - the intended outcome
      - affected or newly created files
      - dependencies on other tasks
      - planned tests
      - planned verification

      Also identify:
      - public API changes
      - configuration changes
      - dependency changes
      - documentation changes
      - compatibility risks

      Do not start implementation yet.

  review_and_adjust_plan:
    title: Review and Adjust the Plan
    instruction: |
      Review the proposed implementation plan critically.

      Evaluate it from the following perspectives:
      - architecture
      - correctness
      - maintainability
      - testability
      - security
      - backward compatibility
      - performance
      - operational impact

      Identify missing work, unnecessary complexity, weak assumptions,
      and incomplete verification.

      Apply the required adjustments and submit the complete adjusted
      plan. Do not submit only a list of differences.

  implement:
    title: Implement the Approved Plan
    instruction: |
      Implement the approved plan.

      Follow the approved task identifiers and avoid unrelated changes.

      If the implementation must deviate from the plan:
      - describe the deviation
      - provide the reason
      - explain its impact
      - identify whether the plan should be reviewed again

      Report all changed, created, and deleted files.

  review_and_fix_implementation:
    title: Review and Fix the Implementation
    instruction: |
      Perform a critical review of the implementation before verification.

      Inspect:
      - correctness
      - edge cases
      - error handling
      - security
      - maintainability
      - code duplication
      - dead code
      - performance
      - compatibility
      - test coverage
      - compliance with project conventions
      - compliance with the approved plan

      Apply all necessary fixes before submitting the review result.

      Report each finding, its severity, and whether it was fixed.

  verify:
    title: Verify the Implementation
    instruction: |
      Prepare the implementation for deterministic verification.

      Guidance will execute the configured verification hooks.

      If a hook fails:
      - analyze the actual command output
      - identify the probable cause
      - return to implementation review when a code change is required
      - do not claim success while a mandatory hook is failing

  complete:
    title: Complete the Workflow
    instruction: |
      Produce the final completion report.

      Include:
      - implementation summary
      - changed files
      - verification results
      - known limitations
      - remaining risks
      - deviations from the approved plan
      - deferred work
      - recommended next steps

      Guidance will execute all mandatory completion hooks before the
      workflow can enter the completed state.
```

---

## 13. Hook Configuration

Hooks should be defined centrally and referenced by stable identifiers.

Example `.guidance/hooks.yaml`:

```yaml
version: 1

hooks:
  lint:
    description: Run the configured linter.
    command:
      executable: npm
      args:
        - run
        - lint
    workingDirectory: "${workspaceRoot}"
    timeoutSeconds: 300
    required: true
    successExitCodes:
      - 0
    output:
      captureStdout: true
      captureStderr: true
      maxBytes: 1048576

  test:
    description: Run the automated test suite.
    command:
      executable: npm
      args:
        - test
    workingDirectory: "${workspaceRoot}"
    timeoutSeconds: 900
    required: true
    successExitCodes:
      - 0
    output:
      captureStdout: true
      captureStderr: true
      maxBytes: 5242880

  build:
    description: Build the project.
    command:
      executable: npm
      args:
        - run
        - build
    workingDirectory: "${workspaceRoot}"
    timeoutSeconds: 600
    required: true
    successExitCodes:
      - 0
    output:
      captureStdout: true
      captureStderr: true
      maxBytes: 5242880

  gitnexus-analysis:
    description: Update the GitNexus repository analysis.
    command:
      executable: gitnexus
      args:
        - analyze
        - --no-stats
    workingDirectory: "${workspaceRoot}"
    timeoutSeconds: 900
    required: true
    successExitCodes:
      - 0
    output:
      captureStdout: true
      captureStderr: true
      maxBytes: 5242880
    failure:
      remainInPhase: complete
      allowRetry: true
      returnOutputToAgent: true
```

### Structured commands

Commands should be represented as an executable and an argument list.

Preferred:

```yaml
command:
  executable: gitnexus
  args:
    - analyze
    - --no-stats
```

Avoid a shell command string when possible:

```yaml
command: "gitnexus analyze --no-stats"
```

Structured commands reduce ambiguity and avoid unnecessary shell interpretation.

---

## 14. Hook Execution Result

Every hook execution should produce a structured result.

```json
{
  "hookId": "gitnexus-analysis",
  "executionId": "hook-01K5G7M8",
  "status": "succeeded",
  "required": true,
  "command": {
    "executable": "gitnexus",
    "args": [
      "analyze",
      "--no-stats"
    ]
  },
  "workingDirectory": "/workspace/example-project",
  "startedAt": "2026-09-22T14:00:00Z",
  "finishedAt": "2026-09-22T14:00:08Z",
  "durationMs": 8000,
  "exitCode": 0,
  "timedOut": false,
  "stdout": "...",
  "stderr": ""
}
```

### Hook statuses

Supported statuses should include:

```text
pending
running
succeeded
failed
timed_out
cancelled
skipped
configuration_error
execution_error
```

### Required hook success

A required hook is successful only when:

- the process was started
- it did not time out
- it was not cancelled
- it returned an allowed exit code
- no configured output validator failed

---

## 15. Hook Failure Behavior

A hook failure must produce an actionable response.

Example response:

```json
{
  "accepted": false,
  "sessionId": "session-123",
  "currentPhase": "complete",
  "workflowStatus": "active",
  "reason": "required_hook_failed",
  "failedHook": {
    "id": "gitnexus-analysis",
    "status": "failed",
    "exitCode": 1,
    "stderr": "GitNexus analysis failed."
  },
  "allowedActions": [
    "retry_hook",
    "inspect_state",
    "report_blocker"
  ],
  "instruction": "The workflow cannot be completed until the required GitNexus analysis succeeds."
}
```

The workflow must remain recoverable.

A failed command must not automatically cause the entire session to be deleted or irreversibly terminated.

---

## 16. MCP Tool Interface

The initial MCP interface should use semantic tools rather than one highly generic tool.

Recommended tools:

```text
start_workflow
get_current_guidance
submit_understanding
submit_plan
submit_plan_review
submit_implementation
submit_implementation_review
submit_verification
complete_workflow
get_workflow_state
retry_hook
report_blocker
cancel_workflow
```

Each submission tool corresponds to a meaningful workflow action.

---

## 17. Tool: `start_workflow`

### Purpose

Create a new workflow session.

### Input

```json
{
  "workspaceRoot": "/workspace/example-project",
  "request": "Add configurable retry behavior to the HTTP client.",
  "workflowId": "standard-development",
  "metadata": {
    "issueId": "ISSUE-123"
  }
}
```

### Behavior

Guidance must:

1. validate the workspace location
2. load the configuration
3. create a session identifier
4. persist the initial state
5. enter the configured initial phase
6. execute configured initial phase entry hooks
7. return the initial phase response

### Output

```json
{
  "sessionId": "session-123",
  "workflowId": "standard-development",
  "currentPhase": "understand",
  "status": "active",
  "guidance": {
    "title": "Understand the Request",
    "instruction": "Analyze the development request before proposing an implementation.",
    "requiredActions": []
  }
}
```

---

## 18. Tool: `get_current_guidance`

### Purpose

Return the instructions for the active phase without changing state.

### Input

```json
{
  "sessionId": "session-123"
}
```

### Output

```json
{
  "sessionId": "session-123",
  "currentPhase": "plan",
  "status": "active",
  "guidance": {
    "title": "Create the Implementation Plan",
    "instruction": "...",
    "requiredActions": []
  }
}
```

This tool should be read-only and idempotent.

---

## 19. Phase Submission Tools

Each phase-specific submission tool should:

1. verify the session
2. verify that the expected phase is active
3. reject submissions for any other phase
4. validate the payload
5. persist the submission
6. determine the requested or automatic transition
7. execute applicable hooks
8. persist all hook results
9. change the state only when all requirements are satisfied
10. return the next phase instruction

Example tools:

```text
submit_understanding
submit_plan
submit_plan_review
submit_implementation
submit_implementation_review
submit_verification
```

### Invalid-phase response

```json
{
  "accepted": false,
  "reason": "invalid_active_phase",
  "expectedPhase": "plan",
  "submittedPhase": "implement",
  "currentPhase": "plan",
  "instruction": "Submit an implementation plan before beginning implementation."
}
```

---

## 20. Tool: `complete_workflow`

### Purpose

Submit the completion report and request transition from `complete` to `completed`.

### Input

```json
{
  "sessionId": "session-123",
  "completionReport": {
    "summary": "Configurable retry behavior was implemented.",
    "changedFiles": [
      "src/config.ts",
      "src/client.ts",
      "tests/retry.test.ts"
    ],
    "verificationSummary": [
      "Lint passed",
      "Tests passed",
      "Build passed"
    ],
    "knownLimitations": [],
    "remainingRisks": [],
    "deviations": [],
    "deferredWork": [],
    "nextSteps": []
  }
}
```

### Required behavior

Guidance must:

1. verify that `complete` is the active phase
2. validate the completion report
3. persist the report
4. execute all `complete.beforeExit` hooks
5. execute `gitnexus analyze --no-stats` when configured
6. record command output and exit status
7. reject completion if any required hook fails
8. transition to `completed` only after all mandatory hooks succeed
9. persist the final state
10. return the final workflow report

### Successful output

```json
{
  "accepted": true,
  "sessionId": "session-123",
  "previousPhase": "complete",
  "currentState": "completed",
  "status": "completed",
  "hooks": [
    {
      "id": "gitnexus-analysis",
      "status": "succeeded",
      "exitCode": 0
    }
  ],
  "message": "The workflow completed successfully."
}
```

---

## 21. Tool: `get_workflow_state`

### Purpose

Return the persisted state of a session.

### Input

```json
{
  "sessionId": "session-123",
  "includeHistory": false,
  "includeHookOutput": false
}
```

### Output

```json
{
  "sessionId": "session-123",
  "workflowId": "standard-development",
  "status": "active",
  "currentPhase": "implement",
  "workspaceRoot": "/workspace/example-project",
  "createdAt": "2026-09-22T12:00:00Z",
  "updatedAt": "2026-09-22T12:30:00Z",
  "completedPhases": [
    "understand",
    "plan",
    "review_and_adjust_plan"
  ],
  "pendingRequiredHooks": []
}
```

---

## 22. Tool: `retry_hook`

### Purpose

Retry a failed hook without requiring the agent to resubmit an unchanged phase payload.

### Input

```json
{
  "sessionId": "session-123",
  "hookId": "gitnexus-analysis"
}
```

### Conditions

A retry must be permitted only when:

- the hook previously failed
- the hook configuration allows retries
- the session remains in the corresponding phase
- no incompatible state transition has occurred

### Output

The output should contain the new hook execution result and the resulting workflow state.

---

## 23. Tool: `report_blocker`

### Purpose

Allow the coding agent to record a blocker that prevents meaningful progress.

### Input

```json
{
  "sessionId": "session-123",
  "category": "missing_information",
  "description": "The expected API compatibility behavior is not defined.",
  "requiresUserDecision": true,
  "options": [
    "Preserve the existing API",
    "Allow a breaking API change"
  ]
}
```

### Behavior

The workflow may enter a dedicated `blocked` state or remain in the current phase with a blocker flag.

The previous active phase must be preserved so that the workflow can resume correctly.

---

## 24. State Persistence

Workflow state must be persisted after every state-changing operation.

A session record should include:

```json
{
  "sessionId": "session-123",
  "workflowId": "standard-development",
  "configurationVersion": "config-hash-or-version",
  "workspaceRoot": "/workspace/example-project",
  "status": "active",
  "currentPhase": "implement",
  "previousPhase": "review_and_adjust_plan",
  "request": "...",
  "submissions": {},
  "hookExecutions": [],
  "blockers": [],
  "history": [],
  "createdAt": "...",
  "updatedAt": "...",
  "completedAt": null
}
```

### Atomic persistence

State writes should be atomic.

A recommended file-based strategy is:

1. write new state to a temporary file
2. flush the file
3. rename the temporary file over the previous state file

This reduces the risk of corrupting a session after a process interruption.

---

## 25. Audit History

History should be append-only.

Example JSON Lines entry:

```json
{
  "timestamp": "2026-09-22T14:00:08Z",
  "sessionId": "session-123",
  "eventType": "hook_completed",
  "phase": "complete",
  "data": {
    "hookId": "gitnexus-analysis",
    "status": "succeeded",
    "exitCode": 0
  }
}
```

Recommended event types include:

```text
session_started
phase_entered
submission_received
submission_rejected
submission_accepted
transition_requested
transition_rejected
phase_exited
hook_started
hook_completed
hook_failed
hook_retried
blocker_reported
blocker_resolved
workflow_completed
workflow_cancelled
configuration_error
```

---

## 26. Configuration Reloading

The server must define how configuration changes affect active sessions.

The recommended approach is:

- load configuration when a session starts
- calculate a configuration version or content hash
- store that version in the session
- keep the session bound to its original configuration
- use new configuration only for new sessions

This prevents an active workflow from changing unexpectedly.

A future version may support explicit configuration migration.

---

## 27. Security Requirements

Command execution is the highest-risk Guidance capability and must be restricted carefully.

### 27.1 No arbitrary agent commands

The coding agent must not be allowed to provide raw commands for Guidance to execute.

Disallowed pattern:

```json
{
  "command": "some agent-generated shell command"
}
```

Only commands referenced by configured hook identifiers may be executed.

### 27.2 Workspace restriction

The hook working directory must be inside the configured workspace root unless explicitly permitted by trusted server configuration.

Guidance must reject directory traversal and path escaping.

### 27.3 Prefer direct process execution

Guidance should execute an executable with an explicit argument list.

Preferred conceptual execution:

```text
executable: gitnexus
arguments:
- analyze
- --no-stats
```

A shell should only be used when a hook explicitly opts into shell execution.

### 27.4 Timeouts

Every hook must have a timeout.

If the timeout is exceeded, Guidance must terminate the process and, where supported, its child process tree.

### 27.5 Environment control

By default, hooks should receive a minimal environment.

Secrets and unrelated environment variables should not be exposed automatically.

### 27.6 Output limits

Standard output and standard error must have configurable size limits.

If output exceeds the limit, Guidance should truncate stored output and record that truncation occurred.

### 27.7 Sensitive output

Logs should support redaction rules for:

- access tokens
- API keys
- passwords
- connection strings
- private keys
- configured secret patterns

### 27.8 Executable allowlisting

A deployment may restrict executables to an allowlist.

Example:

```yaml
security:
  allowedExecutables:
    - git
    - gitnexus
    - npm
    - node
```

### 27.9 Symbolic links

Workspace boundary checks must resolve symbolic links before validating paths.

### 27.10 Concurrent execution

Guidance should prevent two state-changing operations from running concurrently for the same session.

A per-session lock is recommended.

---

## 28. Error Model

Guidance should return stable machine-readable error codes.

Recommended error codes:

```text
configuration_not_found
configuration_invalid
workflow_not_found
session_not_found
session_locked
invalid_active_phase
invalid_transition
submission_invalid
required_field_missing
required_hook_failed
hook_not_found
hook_retry_not_allowed
hook_timed_out
command_not_found
working_directory_invalid
workspace_boundary_violation
state_persistence_failed
workflow_already_completed
workflow_cancelled
internal_error
```

Example:

```json
{
  "accepted": false,
  "error": {
    "code": "required_hook_failed",
    "message": "The mandatory GitNexus analysis failed.",
    "recoverable": true
  },
  "currentPhase": "complete",
  "allowedActions": [
    "retry_hook",
    "get_workflow_state",
    "report_blocker"
  ]
}
```

---

## 29. Idempotency

State-changing tool calls should accept an optional request identifier.

```json
{
  "sessionId": "session-123",
  "requestId": "request-456"
}
```

If the same request identifier is received again, Guidance should return the previously recorded result rather than executing hooks a second time.

This is especially important for:

- completion hooks
- build commands
- deployment-like commands
- commands that modify generated repository data

---

## 30. Concurrency Control

Guidance must serialize state-changing operations per session.

A session lock should cover:

- submission validation
- hook execution
- state transition
- state persistence

Read-only operations may run concurrently when they use a consistent persisted snapshot.

If a second state-changing request arrives while a session is locked, Guidance should return a recoverable `session_locked` error.

---

## 31. Completion Invariant

The most important invariant for the default workflow is:

> A Guidance session must never enter the `completed` state unless every mandatory completion hook has executed successfully.

For the standard configuration, this includes:

```bash
gitnexus analyze --no-stats
```

Therefore, all of the following must be true:

```text
active phase is complete
completion submission is valid
gitnexus-analysis hook exists
gitnexus-analysis was executed
gitnexus-analysis did not time out
gitnexus-analysis returned an allowed exit code
all other required completion hooks succeeded
final state was persisted successfully
```

If final persistence fails after the hook succeeds, Guidance must not report successful workflow completion until the state can be recovered and persisted consistently.

---

## 32. Example End-to-End Flow

### Step 1: Start

```text
Agent -> start_workflow
Guidance -> understand instruction
```

### Step 2: Submit understanding

```text
Agent -> submit_understanding
Guidance -> validates submission
Guidance -> enters plan
Guidance -> returns plan instruction
```

### Step 3: Submit plan

```text
Agent -> submit_plan
Guidance -> validates plan
Guidance -> enters review_and_adjust_plan
Guidance -> returns plan review instruction
```

### Step 4: Review plan

```text
Agent -> submit_plan_review
Guidance -> validates adjusted plan
Guidance -> enters implement
Guidance -> returns implementation instruction
```

### Step 5: Implement

```text
Agent -> changes repository files
Agent -> submit_implementation
Guidance -> validates implementation report
Guidance -> enters review_and_fix_implementation
```

### Step 6: Review implementation

```text
Agent -> reviews and fixes code
Agent -> submit_implementation_review
Guidance -> validates review report
Guidance -> enters verify
```

### Step 7: Verify

```text
Agent -> submit_verification
Guidance -> runs lint
Guidance -> runs tests
Guidance -> runs build
```

If a command fails:

```text
Guidance -> remains in verify or returns to review_and_fix_implementation
Agent -> fixes implementation
```

If all commands succeed:

```text
Guidance -> enters complete
Guidance -> returns completion instruction
```

### Step 8: Complete

```text
Agent -> complete_workflow
Guidance -> validates completion report
Guidance -> runs gitnexus analyze --no-stats
```

If GitNexus fails:

```text
Guidance -> remains in complete
Guidance -> returns actual failure output
Agent -> resolves the issue
Agent -> retry_hook
```

If GitNexus succeeds:

```text
Guidance -> persists completed state
Guidance -> returns successful completion result
```

---

## 33. Suggested Internal Architecture

The server should be separated into the following components.

```text
MCP Transport Layer
        |
        v
Tool Handlers
        |
        v
Workflow Engine
   |         |
   v         v
Validation  Hook Runner
   |         |
   +----+----+
        |
        v
State Repository
        |
        v
Audit Log
```

### MCP transport layer

Responsible for:

- MCP server initialization
- tool registration
- request parsing
- response formatting

### Tool handlers

Responsible for:

- mapping MCP calls to workflow operations
- input validation
- stable error responses

### Workflow engine

Responsible for:

- active phase checks
- transition rules
- phase lifecycle
- completion invariants

### Configuration loader

Responsible for:

- reading YAML and JSON files
- resolving references
- validating configuration
- calculating configuration versions

### Submission validator

Responsible for:

- JSON Schema validation
- required field validation
- deterministic workflow rules

### Hook runner

Responsible for:

- process creation
- argument handling
- working directory validation
- timeouts
- output capture
- process termination
- exit-code evaluation

### State repository

Responsible for:

- session persistence
- per-session locking
- atomic state updates
- session recovery

### Audit logger

Responsible for:

- append-only event records
- timestamps
- hook execution history
- redaction

---

## 34. Suggested MVP Scope

The first usable version should implement:

### Required

- one configurable workflow
- the seven standard phases
- semantic MCP tools
- YAML-based phase responses
- YAML-based hook definitions
- JSON Schema submission validation
- file-based state persistence
- append-only JSON Lines history
- direct executable invocation with argument arrays
- configurable working directory
- hook timeouts
- captured standard output and standard error
- required and optional hooks
- hook retry
- per-session locking
- mandatory GitNexus completion hook
- terminal `completed` state

### Optional for the first version

- multiple workflow profiles
- user elicitation
- database persistence
- distributed locking
- remote hook workers
- containerized hook execution
- IDE-specific user interface
- semantic analysis of submissions
- plugin-based validators
- dynamic workflow modification
- parallel hooks

---

## 35. Future Extensions

Potential future capabilities include:

### Workflow profiles

```text
standard
hotfix
legacy-maintenance
security-sensitive
greenfield
documentation-only
```

### Conditional hooks

Example conditions:

```text
run only when JavaScript files changed
run only when public APIs changed
run only when a dependency was added
run only when database migrations exist
```

### Parallel verification

Independent verification hooks could run concurrently.

### External approval gates

A phase transition could require approval from:

- a user
- a pull request reviewer
- a CI system
- a policy service

### Containerized command execution

Hooks could run inside an isolated container with explicit resource limits.

### Project rule discovery

Guidance could load additional constraints from:

```text
AGENTS.md
memory-bank/
project conventions
repository-specific Guidance profiles
```

### Multiple reviewers

Review phases could provide separate instructions for:

- architecture review
- security review
- testing review
- maintainability review

These reviewer perspectives would still be executed by the coding agent unless separate agents were deliberately introduced.

---

## 36. Acceptance Criteria for the Initial Implementation

The initial Guidance implementation is acceptable when all of the following are true:

1. A session can be started for a workspace.
2. The session begins in `understand`.
3. Every standard phase has a configurable response.
4. The agent cannot submit an implementation while `plan` is active.
5. The agent cannot skip `review_and_adjust_plan`.
6. The agent cannot skip `review_and_fix_implementation`.
7. Phase submissions can be validated with JSON Schema.
8. Allowed transitions are loaded from configuration.
9. Hooks are loaded from configuration.
10. Hooks execute with an executable and argument array.
11. Hook output and exit codes are recorded.
12. Required hook failures block the corresponding transition.
13. The session state survives a server restart.
14. Duplicate requests do not execute completion hooks twice.
15. Completion always invokes `gitnexus analyze --no-stats`.
16. A failing GitNexus command prevents the terminal state.
17. A successful GitNexus command permits the `completed` state.
18. The complete workflow history can be inspected.
19. The coding agent cannot request execution of arbitrary commands.
20. All state-changing operations for a session are serialized.

---

## 37. Summary

Guidance is a deterministic workflow server for nondeterministic coding agents.

It does not attempt to replace the agent's reasoning or implementation capabilities. Instead, it ensures that software development follows a configurable and enforceable process:

```text
understand
plan
review and adjust the plan
implement
review and fix the implementation
verify
complete
```

Every phase response is configurable. Every transition is controlled. Mandatory commands are executed by the server and evaluated using their real exit status.

The default completion process guarantees that:

```bash
gitnexus analyze --no-stats
```

is executed automatically before the workflow reaches the terminal `completed` state.

This makes Guidance a reusable process-control and quality-assurance layer for MCP-compatible coding agents.