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

### Bearer authentication (HTTP)

The bearer token is a **shared secret you choose yourself** — the server does
not issue tokens. It is enforced only when `GUIDANCE_AUTH_TOKEN` is set:
unset = `/mcp` is open to everyone who can reach the port. **Always set a
token when binding to a non-loopback host** (`GUIDANCE_BIND_HOST=0.0.0.0`,
as the shipped `docker-compose.yml` does for container port-mapping).

**1. Generate a strong random token:**

```bash
openssl rand -hex 32
# → 64 hex characters, e.g. 9f1c3b7e4a2d… (never reuse across deployments)
```

**2. Configure the server** (`docker-compose.yml` or your runtime environment):

```yaml
    environment:
      - PORT=3003
      - GUIDANCE_BIND_HOST=0.0.0.0
      - GUIDANCE_WORKSPACE_ROOT=/workspace
      - GUIDANCE_AUTH_TOKEN=9f1c3b7e4a2d…   # ← your generated value
```

Environment changes require a container restart (`docker compose up -d`),
not a rebuild.

**3. Configure the client** to send the same value on every MCP call:

```json
{
  "servers": {
    "guidance": {
      "type": "http",
      "url": "http://localhost:3003/mcp",
      "headers": { "Authorization": "Bearer 9f1c3b7e4a2d…" }
    }
  }
}
```

**4. Verify it is active** (the `/health` endpoint is unauthenticated by
design and does not tell you):

```bash
# without token → 401 unauthorized (auth is ON)
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3003/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# with token → 200
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3003/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer 9f1c3b7e4a2d…" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Status codes on `/mcp`:

| Status | Meaning |
|---|---|
| `401` | Token configured but missing/wrong (`Authorization` header must be exactly `Bearer <token>`) |
| `405` | Token OK, but method not allowed (`GET`/`DELETE` in stateless mode) |
| `406` | Missing `accept: application/json, text/event-stream` header |
| `200` | Success |

**Properties & limits:**

- There is **no expiry, refresh or rotation mechanism** — to rotate, change the
  env variable, restart the container, and update all client headers.
- The comparison is timing-safe (constant-time on SHA-256 digests), but the
  token travels in plain headers — use it behind TLS / within a trusted
  network only.
- `GET /health` is deliberately unauthenticated (no sensitive data) so that
  Docker healthchecks and load balancers work without secrets.
- stdio transport needs no token (the agent process IS the trust boundary).

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

Common conventions: every tool returns a JSON text payload. `sessionId` refers
to a started workflow session. `requestId` (optional on all mutating tools)
makes the call idempotent — repeating a call with the same `requestId` does not
apply the change twice (request ledger). Submissions are validated against the
phase's JSON-Schema; validation failures return `submission_invalid` with
details.

### Workflow tools (17)

| Tool | Parameters | Purpose |
|---|---|---|
| `start_workflow` | `workspaceRoot`, `request`, `workflowId?`, `metadata?` | Starts a session, runs initial-phase `beforeEnter` operations (a required failure starts the session `blocked`) and returns the initial phase instruction. `workspaceRoot` must be inside the server-configured workspace |
| `get_current_guidance` | `sessionId` | Read-only: title, instruction and required actions of the current phase (from `responses.json`). Call after every transition |
| `submit_understanding` | `sessionId`, `requestId?`, `summary`, `assumptions?`, `acceptanceCriteria?` | Submits the *understand* phase: request analysis, assumptions, measurable acceptance criteria |
| `submit_plan` | `sessionId`, `requestId?`, `tasks` | Submits the implementation plan: stable task IDs, dependencies, affected files, planned tests |
| `submit_plan_review` | `sessionId`, `requestId?`, `findings?`, `approvedPlan?` | Plan review; blocking findings (per policy severities) loop back to `plan`, approval advances to `implement` |
| `submit_implementation` | `sessionId`, `requestId?`, `implementedTasks`, `changedFiles` | Implementation evidence: which tasks were implemented and which files changed |
| `submit_implementation_review` | `sessionId`, `requestId?`, `findings?`, `filesChangedDuringReview?` | Code-review results; `implementation_changes_required` loops back to `implement` |
| `submit_verification` | `sessionId`, `requestId?`, `verificationSummary` | Verification report; the phase's `beforeExit` gates (lint/test/build) run on transition |
| `complete_workflow` | `sessionId`, `requestId?`, `summary` | Final report; runs required completion operations (e.g. repository analysis). Success moves the session to the terminal state |
| `get_workflow_state` | `sessionId`, `includeHistory?` | Read-only: full persisted session state (phases, downstream operation states, blockers). Reconciles stale `running` operations to `unknown` under a lock |
| `report_blocker` | `sessionId`, `category`, `description`, `requiresUserDecision?`, `options?` | Reports a blocker the agent cannot resolve; the session enters `blocked` until `resume_workflow` |
| `resume_workflow` | `sessionId`, `decision`, `notes?` | Ends `blocked` and returns the session to its previous phase with the user decision recorded |
| `cancel_workflow` | `sessionId` | Graceful cancellation (FR-057): no new operations run, state moves to the `cancelled` terminal state |
| `get_orchestration_status` | `sessionId` | Read-only: status of the operations of the active phase (running / succeeded / failed / timed_out) |
| `list_configured_operations` | — | Read-only: all operations defined in `operations.json` (no session needed) |
| `retry_operation` | `sessionId` | Re-runs failed **required** operations of the current phase (transient downstream failures) |
| `get_downstream_status` | — | Read-only: connection health of all configured downstream servers |

### Spec-Kit tools (12, profile `spec-kit` only)

All tools operate on the Spec-Kit state of the session (created by
`import_spec_kit_artifacts` and persisted per session).

| Tool | Parameters | Purpose |
|---|---|---|
| `discover_spec_kit_feature` | `sessionId`, `featureId?` | Locates the feature directory under the configured `featureRoot` (strategy-aware: explicit ID, single candidate, …). Workspace-boundary checked |
| `import_spec_kit_artifacts` | `sessionId`, `featureId?` | Imports spec.md / plan.md / tasks.md (+ optional research, data-model, contracts, checklists), validates structure (unique task IDs, dependency graph, cycles) and creates an **immutable hash-pinned snapshot** |
| `get_spec_kit_status` | `sessionId` | Read-only: feature, active snapshot, active batch, validation findings, task-status counts, open plan changes |
| `get_next_task` | `sessionId` | Read-only: tasks that are release-ready (dependencies satisfied) and the recommended next task |
| `start_task` | `sessionId`, `batchId?`, `taskIds[]` | Moves tasks into `in_progress` within a batch (batch release semantics, defaults to the active batch) |
| `submit_task_implementation` | `sessionId`, `batchId?`, `evidence[]` | Per-task evidence: summary, changed files, tests added/updated, deviations, unresolved issues. Checkboxes in tasks.md are hints — only this evidence counts |
| `submit_task_review` | `sessionId`, `batchId?`, `findings[]` | Review findings per task (`severity`, `fixRequired`, `fixApplied`); blocking severities gate completion |
| `complete_task` | `sessionId`, `taskId` | Marks a task completed — only after implementation + review evidence and satisfied dependencies; otherwise `spec_kit_task_*` errors explain what is missing |
| `propose_plan_change` | `sessionId`, `changeType`, `reason`, `affectedTasks`, `impact` | Proposes a plan deviation; deterministic `minor`/`major` classification from the change type and impact flags; major changes require artifact update + approval before completion |
| `refresh_spec_kit_artifacts` | `sessionId` | Re-imports the artifacts and activates a fresh snapshot (for approved plan changes / external edits) |
| `get_traceability_report` | `sessionId` | Read-only: acceptance criteria ↔ task coverage |
| `validate_spec_kit_completion` | `sessionId`, `snapshotCurrent`, `requiredVerificationSucceeded`, `completionOpsSucceeded` | Evaluates the completion invariants (no uncompleted tasks, no open plan changes, criteria coverage, verification) and returns violations |

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
