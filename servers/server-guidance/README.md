# Guidance MCP Server (`@paschbaer/guidance`)

Configurable MCP **workflow orchestrator** with an optional Spec-Kit integration
profile. Guidance turns the free-form "how agents work" into **project-owned
configuration**: phases, transitions, phase instructions, validation schemas,
downstream operations and security policies all live in `.guidance/` inside your
repository — the server is a dumb, strict executor.

Dual-role:

- **MCP server** toward your coding agent (17 workflow tools + 12 Spec-Kit tools)
- **MCP client** toward configured downstream servers (GitNexus, Insight, …)
  for workflow-critical operations (lint/test/build gates, insight storage, …)

Defined by `specs/002-guidance-workflow-server/spec.md`
(v1 workflow control, v2 downstream orchestration, v2.1 Spec-Kit profile).

## Features

- **Configuration-driven workflow**: understand → plan → review → implement →
  review-fix → verify → complete — every phase, transition and instruction
  comes from `.guidance/`, never from hardcoded logic.
- **Strict submission validation**: JSON-Schema per phase; invalid submissions
  are rejected with actionable errors.
- **Lifecycle hooks**: `beforeEnter` / `afterExit` / `beforeExit` operations per
  phase; required failures block transitions (or block a new session at start).
- **Deterministic downstream orchestration**: Guidance invokes and validates
  workflow-critical operations itself (e.g. lint/test/build gates before
  completion) — with timeout enforcement, retries, drift detection and
  capability allowlists.
- **Security**: data-egress policies per trust level, risk-class approval
  gates, secret redaction (configurable patterns), injection-resistant result
  exposure (`returnToAgent` modes).
- **Robustness**: idempotent state changes (requestId ledger), crash recovery
  (running → unknown reconcile), graceful cancellation, append-only audit
  history with redaction, blocked-session semantics with blocker records.
- **Spec-Kit profile** (optional): discover/import Spec-Kit artifacts
  (spec.md, plan.md, tasks.md), dependency-aware task batches, evidence-gated
  task completion (checkboxes are hints, never proof), plan-change
  classification, traceability report, completion invariants.

## Installation

Requires Node ≥ 18.

```bash
git clone https://github.com/paschbaer/thinking-mcp
cd thinking-mcp/servers/server-guidance
npm install
npm run build
```

### Run: stdio (local agent)

```bash
npm start            # or: node dist/index.js
```

The workspace is `process.cwd()`; configuration is read from `./.guidance/`.

### Run: HTTP (Docker)

```bash
mkdir -p workspace/.guidance && sudo chown 1000:1000 workspace
# put your .guidance/ files into workspace/.guidance/
docker compose up -d
# MCP endpoint: http://localhost:3003/mcp  ·  Health: http://localhost:3003/health
```

Environment variables (HTTP):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3003` | HTTP port |
| `GUIDANCE_BIND_HOST` | `127.0.0.1` | Bind address. **Loopback by default (fail-closed, FR-027).** Set `0.0.0.0` explicitly for container port-mapping |
| `GUIDANCE_WORKSPACE_ROOT` | cwd | Workspace containing `.guidance/` |
| `GUIDANCE_AUTH_TOKEN` | *(unset)* | If set, `/mcp` requires `Authorization: Bearer <token>` (401 otherwise). `/health` stays open |

## Configuration (`.guidance/`)

All configuration is JSON, version 2. Full contract:
[`specs/002-guidance-workflow-server/contracts/downstream-config-contract.md`](../../specs/002-guidance-workflow-server/contracts/downstream-config-contract.md)
· runnable example set: [`examples/default-guidance/`](./examples/default-guidance/).

```
.guidance/
├── guidance.json            # project, profile, file references, orchestration, security
├── workflow.json            # phases, transitions, lifecycle hooks, states
├── responses.json           # per-phase agent instructions (title/instruction/requiredActions)
├── operations.json          # downstream operation definitions (type, command, validation)
├── downstream-servers.json  # downstream MCP servers: transport, capabilities, connection
├── policies.json            # trust levels, egress, validation, redaction, output defaults
└── schemas/                 # one JSON-Schema per phase submission
```

### `guidance.json` — entry point

```json
{
  "version": 2,
  "profile": "plain",
  "project": { "name": "my-project" },
  "workflow":  { "file": "workflow.json" },
  "responses": { "file": "responses.json" },
  "operations": { "file": "operations.json" },
  "downstreamServers": { "file": "downstream-servers.json" },
  "policies": { "file": "policies.json" },
  "state": { "directory": "state", "persistAfterEveryOperation": true },
  "security": {
    "allowAgentDefinedServers": false,
    "restrictWorkingDirectory": true,
    "redactSensitiveOutput": true
  }
}
```

### `workflow.json` — the state machine (excerpt)

```json
{
  "version": 2,
  "workflow": { "id": "standard-development", "initialPhase": "understand",
                "terminalStates": ["completed", "cancelled"] },
  "phases": {
    "verify": {
      "response": "verify",
      "submissionSchema": "schemas/verify.schema.json",
      "lifecycle": { "beforeExit": ["lint", "test", "build"] },
      "transitions": [
        { "to": "review_and_fix_implementation", "reason": "verification_failed" },
        { "to": "complete", "when": "required_operations_succeeded" }
      ]
    }
  }
}
```

Semantics: `when` transitions fire on success, `reason` transitions only on
failure. `lifecycle.beforeExit` gates the transition (required failures keep
the session in the phase), `lifecycle.beforeEnter` gates entering the target
phase (a required failure at session start starts the session `blocked`).

### `operations.json` — downstream gates (excerpt)

```json
{
  "version": 2,
  "operations": {
    "test": {
      "description": "run test suite",
      "type": "process",
      "executable": "npm",
      "args": ["test"],
      "required": true,
      "timeoutSeconds": 300,
      "validation": { "exitCodeMustBeZero": true },
      "output": { "returnToAgent": "summary_and_errors" }
    }
  }
}
```

### `downstream-servers.json` — MCP clients Guidance connects to (excerpt)

```json
{
  "version": 2,
  "servers": {
    "gitnexus": {
      "enabled": true, "required": true, "trustLevel": "trusted",
      "transport": { "type": "stdio", "command": { "executable": "gitnexus", "args": ["mcp"] } },
      "connection": { "requestTimeoutSeconds": 300 },
      "capabilities": { "allow": { "tools": ["analyze", "status"] } }
    }
  }
}
```

### `policies.json` — security (excerpt)

```json
{
  "version": 2,
  "trustLevels": { "restricted": { "dataEgress": "validated_inputs_only" },
                   "trusted": { "dataEgress": "project_data" } },
  "redaction": { "patterns": ["\\bapi[_-]?key\\b", "\\btoken\\b", "\\bsecret\\b"] },
  "outputDefaults": { "returnToAgent": "summary_and_errors" }
}
```

### Spec-Kit profile

Set `"profile": "spec-kit"` plus `integrations.specKit` in `guidance.json`
(or provide `.guidance/profiles/spec-kit.json`) and the 12 Spec-Kit tools are
registered in addition to the workflow tools:

```json
{
  "profile": "spec-kit",
  "integrations": {
    "specKit": { "enabled": true, "discovery": { "featureRoot": "specs", "strategy": "singleCandidate" } }
  }
}
```

## Using Guidance inside an agent (chat)

Register the server in your MCP client:

**stdio (Claude Code, VS Code, …):**

```json
{
  "mcpServers": {
    "guidance": {
      "command": "node",
      "args": ["/path/to/thinking-mcp/servers/server-guidance/dist/index.js"]
    }
  }
}
```

**HTTP (Docker):**

```json
{
  "mcpServers": {
    "guidance": {
      "type": "http",
      "url": "http://localhost:3003/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

### The agent loop

Guidance drives the agent through your configured phases. The protocol is
always: **start → read guidance → do the work → submit → repeat**.

1. **`start_workflow`** — starts a session and returns the instruction for the
   initial phase (from `responses.json`).
2. **`get_current_guidance`** — re-reads the current phase instruction at any
   time (idempotent, read-only).
3. **`submit_<phase>`** — submits the phase work; strict JSON-Schema validation;
   on acceptance you get the *next* phase instruction plus the results of any
   lifecycle operations.
4. **`report_blocker` / `resume_workflow`** — blocked sessions are paused until
   the user decides.
5. **`complete_workflow`** — final report; required completion gates run.

### Example: one full pass (plain profile)

**Agent:** `start_workflow { "workspaceRoot": "/repo", "request": "Add rate limiting to the API" }`

```json
{
  "accepted": true, "sessionId": "session-…", "currentPhase": "understand",
  "guidance": {
    "title": "Understand the Request",
    "instruction": "Analyze the development request … Do not create an implementation plan yet.",
    "requiredActions": ["Inspect the relevant repository context.", "…"]
  }
}
```

**Agent** (explores the repo, then):
`submit_understanding { "sessionId": "session-…", "summary": "…", "assumptions": ["…"], "acceptanceCriteria": ["429 responses after 100 req/min per key"] }`

```json
{ "accepted": true, "currentPhase": "plan", "guidance": { "title": "Create the Implementation Plan", … } }
```

**Agent:** `submit_plan { "sessionId": "…", "tasks": [ { "id": "T001", … }, … ] }`
→ phase `review_and_adjust_plan` → `submit_plan_review` → … → `implement` →
`submit_implementation` (changed files, tests) → review-fix loop → `verify`.

**At `verify`** the configured gates run automatically (`beforeExit`:
lint, test, build). All succeed → transition to `complete`.

**Agent:** `complete_workflow { "sessionId": "…", "summary": "…" }` — required
completion operations (e.g. the configured GitNexus repository analysis) run;
success closes the workflow, failures record blockers.

### Example: blocked session + user decision

If a required lifecycle operation fails (e.g. the test gate), the session stays
in its phase and records a blocker:

```json
{ "accepted": false, "error": { "code": "required_hook_failed",
  "message": "required lifecycle operations failed; remaining in phase" },
  "currentPhase": "verify", "operations": [ { "id": "test", "status": "failed", "summary": "…" } ] }
```

The agent reports the failure to the user, fixes the code, re-submits. For
decisions the agent cannot make (risk-class approvals, ambiguous blockers):

**Agent:** `report_blocker { "sessionId": "…", "category": "user_decision_required", "description": "…" }`
→ session `blocked` → after the user decides:
`resume_workflow { "sessionId": "…" }`.

### Example: Spec-Kit profile

With `profile: "spec-kit"` the agent orchestrates an existing feature folder:

```
discover_spec_kit_feature { "sessionId": "…" }            → { "featureId": "001-rate-limit", "directory": "…" }
import_spec_kit_artifacts { "sessionId": "…" }            → snapshot + validated task entities
get_next_task { "sessionId": "…" }                        → { "nextTaskId": "T001" }
start_task { "sessionId": "…", "taskIds": ["T001"] }      → batch state machine
submit_task_implementation { "sessionId": "…", "evidence": [ { "taskId": "T001", "summary": "…", "changedFiles": [...], "testsAddedOrUpdated": [...] } ] }
complete_task { "sessionId": "…", "taskId": "T001" }      → evidence-gated (checkbox ≠ proof)
get_traceability_report { "sessionId": "…" }              → criteria ↔ task coverage
validate_spec_kit_completion { "sessionId": "…", … }      → completion invariants
```

Plan deviations go through `propose_plan_change` (deterministic minor/major
classification, approval + artifact-update lifecycle instead of silent edits).

## Tool reference

**Workflow tools (17):** `start_workflow`, `get_current_guidance`,
`submit_understanding`, `submit_plan`, `submit_plan_review`,
`submit_implementation`, `submit_implementation_review`, `submit_verification`,
`complete_workflow`, `get_workflow_state`, `report_blocker`, `resume_workflow`,
`cancel_workflow`, `get_orchestration_status`, `list_configured_operations`,
`retry_operation`, `get_downstream_status`.

**Spec-Kit tools (12, profile `spec-kit` only):** `discover_spec_kit_feature`,
`import_spec_kit_artifacts`, `get_spec_kit_status`, `get_next_task`,
`start_task`, `submit_task_implementation`, `submit_task_review`,
`complete_task`, `propose_plan_change`, `refresh_spec_kit_artifacts`,
`get_traceability_report`, `validate_spec_kit_completion`.

## Build & test

```bash
npm install
npm run build
npm test        # 142 tests
npm run typecheck
```

## Further documentation

- Spec: [`specs/002-guidance-workflow-server/spec.md`](../../specs/002-guidance-workflow-server/spec.md)
- Contracts: [`specs/002-guidance-workflow-server/contracts/`](../../specs/002-guidance-workflow-server/contracts/)
- Example configuration: [`examples/default-guidance/`](./examples/default-guidance/)
