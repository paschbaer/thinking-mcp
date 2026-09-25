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

Why this design? See [Why Guidance?](#why-guidance).

Defined by `specs/002-guidance-workflow-server/spec.md`
(v1 workflow control, v2 downstream orchestration, v2.1 Spec-Kit profile).

## Why Guidance?

Coding agents lose long-lived behavioral rules: a large instructions file
(`AGENTS.md`, `CLAUDE.md`) is read at session start, but by step twelve of a
task the details are far outside the attention window — the agent still
*knows* rule 47 exists, it just no longer *applies* it. Guidance attacks that
problem structurally instead of with longer files:

- **Just-in-time rules.** The agent receives only the instruction and
  required actions for the phase it is currently in — rule salience stays at
  100% because nothing else competes for attention. Phases are small, so
  instructions are short by construction.
- **`AGENTS.md` shrinks and stabilizes.** Process rules move into
  `.guidance/` responses and policies; the instructions file keeps only
  general principles and deployment notes. Fewer, stable rules mean fewer
  edits — and the file stops growing with every lesson learned.
- **Gates instead of self-reporting.** Verification (`lint`/`test`/`build`),
  repository analysis and lessons capture run server-side on the transition
  out of a phase. A required failure blocks completion — "done" is not
  something the agent can merely claim (see
  [Working sample](#working-sample-this-repositorys-own-guidance)).
- **Schema-validated submissions.** Every phase has a strict JSON-Schema;
  required fields force completeness (acceptance criteria, deviations,
  unresolved issues) instead of trusting prose.
- **Persistent session state.** Sessions survive restarts; blockers, user
  decisions and operation results are recorded and auditable — a long task
  can pause and resume instead of being re-explained.
- **Experience-based refinement.** The `capture-session-lessons` gate seeds
  validated lessons into the experience-memory server, so the process gets
  better with every run (requires a reachable Insight instance). In this
  repository's first three production runs
  the gates surfaced four real bugs (an ESM crash, unresolved template
  placeholders, a missing environment contract, and an index-freshness gap).

| | Static instructions file | Guidance |
|---|---|---|
| Rule delivery | all at once, at session start | just-in-time, per phase |
| Rule adherence | fades with context distance | enforced per phase (`requiredActions`, review-checked) |
| Verification | agent self-reporting | server-enforced gates; blocking |
| Completeness | prose, easy to skip | schema-validated submissions |
| State | in the model's context | persisted, restart-safe, auditable |
| Improvement | manual file edits | automatic lesson capture (idempotent) |

Static instruction files still do valuable work — general principles, repo
conventions, tool availability — and Guidance is designed to complement
them, not replace them: keep principles in `AGENTS.md`, put process in
`.guidance/`. One honest boundary: duties that live on the agent side
(e.g. the Clear-Thought reasoning passes) are instruction-enforced and
review-checked — Guidance can only gate deterministic, observable checks.

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

## Configuration assistant

Statt `.guidance/` von Hand zusammenzustellen, führt der eingebaute
Konfigurations-Assistent Schritt für Schritt durch den Entwurf — Frage für
Frage, mit Optionen, Begründung und Config-Verweisen. Der Assistent ist
**stateless**: der Agent akkumuliert die Antworten und übergibt sie bei jedem
Aufruf erneut. Ablauf (welches Tool wann):

| Schritt | Tool | Zweck |
|---|---|---|
| 1 | `setup_guidance_start` | Liefert den Frage-Katalog (7 Fragen) und die erste Frage mit Hilfe-Text und Optionen |
| 2 | `setup_guidance_answer` `{answers}` | Nimmt die akkumulierten Antworten entgegen, validiert sie und liefert die nächste offene Frage |
| 3 | … `setup_guidance_answer` wiederholen | Bis `done: true` — dann verweist `nextTool` auf `setup_guidance_generate` |
| 4 | `setup_guidance_generate` `{answers}` | Prüft die Vollständigkeit und gibt die komplette `.guidance/`-Dateimenge als Payload zurück |
| 5 | Agent schreibt die Dateien | Der Server schreibt bewusst nichts — der Agent legt die Dateien mit seinen File-Tools im Projekt-Root ab |
| 6 | Server neu starten bzw. neue Session | Config wird pro Session gesnapshottet (`configurationVersion`) |

Frage-Katalog v1: `projectName`, `transport` (stdio / http-docker — steuert
`localhost` vs. `host.docker.internal`-URLs und die Egress-Allowlist),
`profile` (plain / spec-kit), `shell` (optional, agent-facing — landet in der
understand-Instruction, da die strikte Config-Validierung ein
`guidance.json`-Feld ablehnen würde), `insight` und `gitnexus` (je on/off —
steuern Downstream-Entries und die zugehörigen Gates) und das Gates-Preset
(`standard`: lint opt + test opt + build REQ · `minimal`: nur build REQ).
Die Generierung liefert alle sechs Config-Dateien plus die sieben
Submission-Schemas (aus `examples/default-guidance/schemas`; ist das
Verzeichnis in der Installation nicht vorhanden, erhält der Agent einen
copy-Hinweis statt eines Fehlers).

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
    },
    "insight": {
      "enabled": true, "required": false, "trustLevel": "trusted",
      "transport": {
        "type": "http",
        "http": { "url": "http://host.docker.internal:3002/mcp",
                  "headers": { "Authorization": "Bearer ${INSIGHT_AUTH_TOKEN}" } }
      },
      "connection": { "requestTimeoutSeconds": 120 },
      "capabilities": { "allow": { "tools": ["experience_search"] } }
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

## Configuration in depth

### How the files relate

`guidance.json` is the **entry point**; it references the other five files.
The loader (`loadConfig`) reads it first, then pulls in each referenced file,
validates everything and computes a deterministic `configVersion` hash over
the merged content — any change to any file changes the config version (and
thereby snapshot staleness detection).

```mermaid
flowchart TD
    G["guidance.json<br/>(entry point)"] -->|file ref| W["workflow.json<br/>state machine"]
    G -->|file ref| R["responses.json<br/>phase instructions"]
    G -->|file ref| O["operations.json<br/>operation definitions"]
    G -->|file ref| D["downstream-servers.json<br/>MCP clients"]
    G -->|file ref| P["policies.json<br/>security + validation"]
    O -->|id reference:<br/>lifecycle hooks & gates| W
    O -->|server + capability<br/>reference| D
    P -.->|trustLevel &<br/>egress policy| D
    W -->|submissionSchema path| S["schemas/*.json"]
    S -.->|validate submissions| R
    G -->|profile: spec-kit| SK["profiles/spec-kit.json<br/>(optional, deep-merged)"]
```

Roles at a glance:

| File | Role | Referenced by |
|---|---|---|
| `guidance.json` | Entry point: project identity, profile selection, file references, state, orchestration defaults, security switches | — (loaded first) |
| `workflow.json` | The state machine: phases, transitions, lifecycle hooks, terminal states | `guidance.json` |
| `responses.json` | What the agent is *told* to do in each phase (title, instruction, required actions) | `guidance.json`; phase keys must match `workflow.json` phase names |
| `operations.json` | *What* runs and *how it is validated*: process/MCP operations used by lifecycle hooks and gates | `guidance.json`; operation IDs referenced from `workflow.json` |
| `downstream-servers.json` | *Where* MCP operations run: transports, allowlists, timeouts, trust levels | `guidance.json`; `server` IDs referenced from `operations.json` |
| `policies.json` | Security and validation policy: egress per trust level, submission validation strictness, redaction, output limits | `guidance.json`; trust level names referenced from `downstream-servers.json` |
| `schemas/*.json` | Submission validation per phase | `workflow.json` (`submissionSchema` path per phase) |

> **Scaffold note:** missing `guidance.json` is scaffolded on first start
> (see below) — a minimal valid default 7-phase configuration. Existing files
> are never overwritten; invalid configuration always fails closed.
>
> **Where `.guidance/` belongs:** in the workspace of the project Guidance
> orchestrates — *not* inside the server source directory
> (`servers/server-guidance/`). That directory is server code only; its
> `.guidance/` (if present, e.g. from a test run with cwd=server dir) is
> git-ignored. For Docker use the mounted `workspace/` volume instead.

### `guidance.json` — attribute reference

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `version` | number | — (**required**) | Config format version; must be `2` |
| `profile` | `"plain"` \| `"spec-kit"` | derived | Tool surface selection. If omitted: `spec-kit` when `integrations.specKit` keys are present (FR-060), else `plain` |
| `project.name` | string | — (**required**) | Project identity, used in responses/audit |
| `workflow.file` | string | — | Path to `workflow.json` (relative to `.guidance/`) |
| `responses.file` | string | — | Path to `responses.json` |
| `operations.file` | string | — | Path to `operations.json` |
| `downstreamServers.file` | string | — | Path to `downstream-servers.json` |
| `policies.file` | string | — | Path to `policies.json` |
| `state.directory` | string | `state` | State directory (sessions, audit, snapshots) |
| `state.persistAfterEveryOperation` | boolean | — | Persist session state after each mutation (crash safety) |
| `state.retainRawMcpResponses` | boolean | — | Keep raw downstream responses on disk (audit depth vs. disk usage) |
| `orchestration.defaultTimeoutSeconds` | number | — | Default timeout for operations without own `timeoutSeconds` |
| `orchestration.defaultRetryCount` | number | — | Default retry count for transient downstream failures |
| `orchestration.maximumConcurrentOperations` | number | — | Concurrency cap for parallel operations |
| `orchestration.failClosedForRequiredOperations` | boolean | — | Required operation failure ⇒ block (true) instead of continue-with-warning |
| `security.allowAgentDefinedServers` | boolean | — | May the *agent* register new downstream servers at runtime (default: no) |
| `security.allowAgentDefinedOperations` | boolean | — | May the agent define new operations at runtime |
| `security.allowAgentProvidedCommands` | boolean | — | May the agent pass raw commands to process operations |
| `security.restrictWorkingDirectory` | boolean | — | Pin process operations to the workspace root |
| `security.redactSensitiveOutput` | boolean | — | Apply policy redaction patterns to agent-facing output |
| `integrations.specKit` | object | — | Spec-Kit integration config; presence influences profile resolution (see below) |

### `workflow.json` — attribute reference

| Attribute | Type | Meaning |
|---|---|---|
| `workflow.id` | string | Workflow identifier (appears in sessions/audit) |
| `workflow.initialPhase` | string | Phase a new session starts in |
| `workflow.terminalStates` | string[] | Names of terminal states (`completed`, `cancelled`) |
| `phases.<name>.response` | string | Key into `responses.json` for this phase's agent instruction |
| `phases.<name>.submissionSchema` | string | Path to the phase's JSON-Schema (relative to `.guidance/`) |
| `phases.<name>.transitions[]` | array | Possible transitions from this phase |
| `transitions[].to` | string | Target phase |
| `transitions[].when` | string | Success condition (`submission_valid`, `required_operations_succeeded`) — fires only on success |
| `transitions[].reason` | string | Failure condition (`verification_failed`, `major_plan_revision_required`, …) — fires only on failure |
| `phases.<name>.lifecycle.beforeEnter[]` | operation IDs | Run before entering this phase; required failure blocks the transition (at session start: session starts `blocked`) |
| `phases.<name>.lifecycle.beforeExit[]` | operation IDs | Run when leaving this phase; required failure keeps the session in the phase |
| `phases.<name>.lifecycle.afterEnter[]` | operation IDs | Run after entering; failures are non-blocking and audited |
| `phases.<name>.lifecycle.afterExit[]` | operation IDs | Run after leaving; failures are non-blocking and audited |
| `states.<name>.terminal` | boolean | Marks a terminal state |
| `states.<name>.system` | boolean | System states (`blocked`) are not directly transitionable |

### `responses.json` — attribute reference

| Attribute | Type | Meaning |
|---|---|---|
| `responses.<phaseKey>.title` | string | Short phase title shown to the agent |
| `responses.<phaseKey>.instruction` | string | The full instruction for this phase (what the agent should do / not do) |
| `responses.<phaseKey>.requiredActions` | string[] | Explicit action checklist the agent must perform in this phase |

Phase keys must match the phase names in `workflow.json`.

### `operations.json` — attribute reference

| Attribute | Type | Meaning |
|---|---|---|
| `operations.<id>.description` | string | Human-readable description |
| `operations.<id>.type` | `"process"` \| MCP types | `process` runs a local executable; MCP types call downstream servers |
| `operations.<id>.executable` / `.args` | string / string[] | Command for `type: "process"` |
| `operations.<id>.server` / `.capability` | string | For MCP operations: downstream server ID + tool name |
| `operations.<id>.required` | boolean | Required operations gate transitions (`required_hook_failed` on failure); optional failures are warnings |
| `operations.<id>.timeoutSeconds` | number | Per-operation timeout; on exceed the call fails as transport error (retried per policy) |
| `operations.<id>.validation.exitCodeMustBeZero` | boolean | `process`: exit code 0 ⇒ succeeded |
| `operations.<id>.output.returnToAgent` | string | Exposure mode: `summary_and_errors` (redacted default), `status_only`, `normalized`, `raw` — controls how much reaches the agent |
| `operations.<id>.riskClass` / `.approved` | string / boolean | Risk-class approval gate: risky operations need explicit approval |

### `downstream-servers.json` — attribute reference

| Attribute | Type | Meaning |
|---|---|---|
| `servers.<id>.displayName` | string | Human-readable name |
| `servers.<id>.enabled` | boolean | `false` = server is skipped entirely |
| `servers.<id>.required` | boolean | Required servers must become ready at startup (fail otherwise) |
| `servers.<id>.trustLevel` | string | One of `policies.trustLevels` — drives egress policy |
| `servers.<id>.transport` | object | `type: "stdio"` + `command.executable/args/cwd`, **or** `type: "http"` + `http.url` + `http.headers` |
| `servers.<id>.transport.http.headers.<NAME>` | string | HTTP request headers; `${ENV_VAR}` references are resolved at config load (unset variable ⇒ configuration error) |
| `servers.<id>.connection.startupTimeoutSeconds` | number | Handshake timeout (positive finite; overrides the 10 s default per server) |
| `servers.<id>.connection.requestTimeoutSeconds` | number | Per-request timeout (positive finite; enforced as transport failure) |
| `servers.<id>.connection.reconnect` | object | `enabled`, `maximumAttempts` (positive integer, required for effect), `delayMilliseconds` (non-negative integer). On a transport failure guidance drops the dead client and re-runs the handshake up to `maximumAttempts` times (delay between attempts), retrying the call after each successful reconnect. Never retried: config errors (invalid timeouts) and request-timeout failures — a timed-out call already ran downstream and is not automatically replayed (retry semantics stay upstream, FR-035) |
| `servers.<id>.capabilities.allow.tools` | string[] | **Allowlist**: only these tools may be invoked on this server |
| `servers.<id>.capabilities.allow.resources` / `.prompts` | string[] | Same for resources/prompts |
| `servers.<id>.environment` | object | Env for the child process (`inherit`, `variables.<NAME>.fromHost`) |

### `policies.json` — attribute reference

| Attribute | Type | Meaning |
|---|---|---|
| `trustLevels.<name>.dataEgress` | string | `none` \| `validated_inputs_only` \| `project_data` \| `project_data_with_approval` — what data may flow to a server with this trust level |
| `egress.httpHostAllowlist` | string[] | Hosts (`host` or `host:port`, exact match) that http-transport downstream servers may connect to. **Required (fail-closed)** as soon as any enabled server uses `transport.type: "http"` |
| `validation.requireAcceptanceCriteria` | boolean | Understanding submissions must contain acceptance criteria |
| `validation.requireUniqueTaskIds` | boolean | Plan task IDs must be unique |
| `validation.rejectUnknownDependencies` | boolean | Task dependencies must reference known tasks |
| `validation.rejectDependencyCycles` | boolean | Reject cycles in the task dependency graph |
| `validation.rejectEmptyArtifacts` | boolean | Reject empty Spec-Kit artifacts at import |
| `reviewFindings.blockingSeverities` | string[] | Review severities that block advancement (e.g. `high`, `critical`) |
| `redaction.patterns` | string[] | Regex patterns redacted from agent-facing operation output |
| `outputDefaults.returnToAgent` | string | Default exposure mode for operations without own setting |
| `outputDefaults.maxExcerptBytes` | number | Max excerpt size returned to the agent |
| `outputDefaults.maxArtifactBytes` | number | Max artifact size accepted at import |
| `outputDefaults.maximumTasks` / `.maximumEntities` | number | Import size limits |

### Best practice: configuration order

Configure **inside-out, dependency-first** — each step only references things
that already exist, so you can validate as you go:

```mermaid
flowchart LR
    A["1. policies.json<br/>(Trust-Level + Validierung)"] --> B["2. downstream-servers.json<br/>(Vertrauensgrad zuweisen)"]
    B --> C["3. operations.json<br/>(Server-/Capability-Referenzen)"]
    C --> D["4. schemas/*.json<br/>(Submit-Strukturen fixieren)"]
    D --> E["5. responses.json<br/>(Agent-Anweisungen je Phase)"]
    E --> F["6. workflow.json<br/>(Phasen + Referenzen verdrahten)"]
    F --> G["7. guidance.json<br/>(Entry Point zuletzt)"]
```

1. **`policies.json` first.** Decide the security posture before anything
   exists that could leak: trust levels, egress, redaction patterns, blocking
   severities, validation strictness. Everything later refers to these names.
2. **`downstream-servers.json`.** Register the servers you actually run, each
   with a trust level from step 1 and tight allowlists. Start with zero servers
   if unsure — `{"version":2,"servers":{}}` is valid.
3. **`operations.json`.** Define gates (lint/test/build) as `process`
   operations, and downstream operations against the servers from step 2
   (`server` + `capability` must exist there). Mark only what truly gates the
   transition as `required: true`.
4. **`schemas/*.json`.** Fix what each phase submission must contain. Keep
   schemas minimal (`additionalProperties: false`) — they are the contract
   that keeps agent output reviewable.
5. **`responses.json`.** Write the agent instructions per phase, keyed exactly
   by your future workflow phase names. This is where the process quality
   lives — invest here.
6. **`workflow.json`.** Now wire phases, transitions and lifecycle hooks. Only
   reference operation IDs from step 3 and schema paths from step 4 — the
   engine throws `operation_not_configured` otherwise (non-recoverable).
7. **`guidance.json` last.** It is trivial once everything exists: set project
   name, profile and the five file references.

**Working rules:**

- Validate after every step: the server either starts (config valid) or fails
  with a precise `configuration_invalid` message pointing at the offending
  attribute. `mcp-server-guidance-init` scaffolds a working baseline to start
  from instead of a blank page.
- Change one file at a time; the deterministic `configVersion` hash makes every
  change visible (and invalidates Spec-Kit snapshots deliberately).
- Keep gates honest: `required: true` means "the workflow must not pass
  without this". Optional gates (`required: false`) are signals, not fences.
- Treat `operations.<id>.output.returnToAgent: "raw"` as an exception with
  review — `summary_and_errors` + redaction is the safe default.
- In Docker: put `.guidance/` into the mounted `workspace/` volume; scaffold
  creates a default there automatically on first start.

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

## Working sample: this repository's own `.guidance/`

This repository runs on Guidance itself. The [`.guidance/`](./.guidance/)
directory at the repo root is a **tested, production-grade working sample**
(first end-to-end run completed green, including the GitNexus gate). Use it
as a blueprint: copy it to your project root and adapt the operations.

### Config file map

| File | Purpose (key settings in this sample) |
|---|---|
| `guidance.json` | Entry point: `project.name: "thinking-mcp"`, profile `plain`, `state.persistAfterEveryOperation: true`, fail-closed security (`allowAgentDefinedServers/Operations/Commands: false`, `restrictWorkingDirectory: true`, `redactSensitiveOutput: true`) |
| `workflow.json` | The state machine — see the phase walkthrough below |
| `responses.json` | Per-phase agent instruction: title, instruction, `requiredActions` |
| `operations.json` | The gates: `build` (blocking, `npm run build`), `lint` (optional, prettier `--check`), `test` (optional, `npm test`), `repository-analysis` (blocking, composite), `capture-session-lessons` (blocking, seeds validated session lessons into the experience-memory server) |
| `downstream-servers.json` | GitNexus (blocking, `http://host.docker.internal:4747/api/mcp`) and Insight (`http://host.docker.internal:3002/mcp`) as **HTTP downstreams** with per-server capability allowlists |
| `policies.json` | Trust levels (`untrusted` → `privileged`), `egress.httpHostAllowlist` (**mandatory and fail-closed** as soon as any enabled server uses HTTP transport: `host.docker.internal:3002`, `host.docker.internal:4747`), redaction patterns, review-blocking severities `high\|critical` |
| `schemas/*.schema.json` | One strict JSON-Schema (draft 2020-12, `additionalProperties: false`) per phase submission |

### ⚠️ Important: workspace path under HTTP/Docker

When Guidance runs as a Docker HTTP server, the workspace is the
**container path** (`GUIDANCE_WORKSPACE_ROOT`, here `/workspace` — the repo
is bind-mounted). **`start_workflow` MUST be called with
`workspaceRoot: "/workspace"`.** Host paths (`D:\repos\…`, `D:/repos/…`),
relative paths (`.`) and WSL notation (`/mnt/d/…`) are rejected with
`escapes the configured workspace`. This rule is recorded in the repo's
`AGENTS.md` (section "Guidance MCP Server (Docker-Deployment)") so agents
that load it pass the correct path automatically.

Two more operating caveats learned in production:

- **Downstream servers connect lazily:** `get_downstream_status` shows
  `disconnected` until an operation uses a server for the first time — that
  is normal, not an error.
- **Config snapshot per session:** edits to `.guidance/*.json` only take
  effect after a container restart or in new sessions (the
  `configurationVersion` SHA is pinned in the session state).

Zed integration — add to `context_servers` in the Zed settings:

```json
{
  "context_servers": {
    "guidance": { "source": "custom", "url": "http://localhost:3003/mcp" }
  }
}
```

### The configured workflow, step by step

The `standard-development` flow consists of seven phases. The diagram is the
map — each phase below has a compact table with the exact config location
(file + key). `when` transitions fire on success, `reason` transitions only
on failure.

```mermaid
flowchart TD
    S(["start_workflow"]) --> P1["1 understand — analyze the request"]
    P1 -->|"submission_valid"| P2["2 plan — task breakdown"]
    P2 -->|"submission_valid"| P3["3 review_and_adjust_plan"]
    P3 -->|"major_plan_revision_required"| P2
    P3 -->|"submission_valid"| P4["4 implement — execute the plan"]
    P4 -->|"submission_valid"| P5["5 review_and_fix_implementation"]
    P4 -->|"significant_plan_deviation"| P2
    P5 -->|"implementation_changes_required"| P4
    P5 -->|"submission_valid (high/critical findings block)"| P6["6 verify — gates: lint opt · test opt · build REQ"]
    P6 -->|"verification_failed"| P5
    P6 -->|"required_operations_succeeded"| P7["7 complete — gates: repository-analysis REQ · capture-session-lessons REQ"]
    P7 -->|"required_operations_succeeded"| DONE(["completed — terminal"])
```

Omitted for readability: any phase can `report_blocker` → `blocked` (system
state); `resume_workflow` returns to the previous phase, `cancel_workflow`
ends the run in the `cancelled` terminal state.

#### 1. `understand` — analyze before proposing

| Aspect | Detail | Config |
|---|---|---|
| Hook on enter | `query-project-insights` — Insight `experience_search` with the session request; optional, failures tolerated | `workflow.json` → `phases.understand.lifecycle.afterEnter` · `operations.json` → `query-project-insights` |
| Instruction | Analyze before proposing; facts vs. assumptions; surface blocking questions; **no plan yet**. Uses Clear-Thought: at least one `sequential_thinking` pass, referenced in the submission | `responses.json` → `understand` |
| Submission | `submit_understanding` — required: `summary`; optional: `assumptions`, `openQuestions`, `risks`, `acceptanceCriteria`, `affectedAreas`, `constraints` | `schemas/understand.schema.json` |
| Transition | `submission_valid` → `plan` | `workflow.json` → `phases.understand.transitions` |
| Clear-Thought duty | `sequential_thinking` pass is a `requiredAction` — the submission must reference its conclusions | `responses.json` → `understand.requiredActions` |
| Shell setup | Run all terminal commands through `wsl.exe -e bash` (this repo's shell) — set up before analysis; hardcoded in the instruction because the server's strict `guidance.json` validation rejects unknown fields | `responses.json` → `understand.instruction` |

#### 2. `plan` — concrete implementation plan

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Concrete plan with stable task IDs, affected files, dependencies, planned tests, verification; **no implementation yet**. Uses Clear-Thought: decompose/prioritize via `sequential_thinking` or `decision_framework` | `responses.json` → `plan` |
| Submission | `submit_plan` — required: `tasks` (policy: unique IDs, known dependencies, no cycles); optional: `dependencies`, `publicApiChanges`, `configurationChanges`, `documentationChanges` | `schemas/plan.schema.json` · `policies.json` → `validation` |
| Transition | `submission_valid` → `review_and_adjust_plan` | `workflow.json` → `phases.plan.transitions` |
| Clear-Thought duty | `sequential_thinking`/`decision_framework` pass is a `requiredAction` — the plan submission must reference its results | `responses.json` → `plan.requiredActions` |

#### 3. `review_and_adjust_plan` — self-review of the plan

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Critical self-review (architecture, correctness, maintainability, testability, security, backward compatibility, performance, operations); submit the adjusted plan | `responses.json` → `review_and_adjust_plan` |
| Submission | `submit_plan_review` — required: `findings`; optional: `adjustments`, `approvedPlan`, `remainingConcerns` | `schemas/review-plan.schema.json` |
| Transitions | `major_plan_revision_required` → back to `plan` (loop); `submission_valid` → `implement` | `workflow.json` → `phases.review_and_adjust_plan.transitions` |
| Clear-Thought duty | `assumption_xray`/`socratic_method`/`argument_map` stress-test pass is a `requiredAction` — the findings must reference its results | `responses.json` → `review_and_adjust_plan.requiredActions` |

#### 4. `implement` — execute the approved plan

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Implement strictly along the approved task IDs, no unrelated changes; report every changed/created/deleted file and any deviation. **First step:** verify the current branch (`git status`), then create a feature branch (`feature/<meaningful-name>`) — no worktree (container gates verify `/workspace` = main checkout). **Last step:** update `README.md` and the memory-bank files | `responses.json` → `implement` |
| Submission | `submit_implementation` — required: `implementedTasks`; optional: `changedFiles`, `createdFiles`, `deletedFiles`, `testsAddedOrUpdated`, `commandsExecuted`, `deviations`, `unresolvedIssues` | `schemas/implement.schema.json` |
| Transitions | `submission_valid` → `review_and_fix_implementation`; `significant_plan_deviation` → back to `plan` (deviations must be planned, not silently absorbed) | `workflow.json` → `phases.implement.transitions` |

#### 5. `review_and_fix_implementation` — self-review of the code

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Self-review: correctness, edge cases, error handling, security, maintainability, duplication, dead code, performance, compatibility, test coverage, plan conformity — apply fixes before submitting | `responses.json` → `review_and_fix_implementation` |
| Submission | `submit_implementation_review` — required: `findings`; optional: `filesChangedDuringReview`, `testsAddedOrUpdated`, `unresolvedFindings` | `schemas/review-implementation.schema.json` |
| Transitions | `implementation_changes_required` → back to `implement`; `submission_valid` → `verify` — findings with severity `high`\|`critical` block (see `policies.json` → `reviewFindings.blockingSeverities`) | `workflow.json` → `phases.review_and_fix_implementation.transitions` |
| Clear-Thought duty | `metacognitive_monitoring` final confidence check is a `requiredAction`; `debugging_approach` for non-trivial findings — results referenced in the findings | `responses.json` → `review_and_fix_implementation.requiredActions` |

#### 6. `verify` — gates run server-side

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Guidance executes the configured verification operations; analyze failures and return to implementation review when code changes are needed; never claim success while a mandatory operation is failing | `responses.json` → `verify` |
| Submission | `submit_verification` — required: `verificationSummary`; optional: `skippedChecks`, `acceptedCriteriaEvidence` | `schemas/verify.schema.json` |
| Gates on exit (`beforeExit`, blocking) | `lint` (prettier `--check`, optional), `test` (`npm test`, optional), `build` (`npm run build`, **required**) — child processes in the workspace; required failures keep the session in the phase (`retry_operation` re-runs) | `workflow.json` → `phases.verify.lifecycle.beforeExit` · `operations.json` → `lint`/`test`/`build` |
| Transitions | `verification_failed` → back to `review_and_fix_implementation`; `required_operations_succeeded` → `complete` | `workflow.json` → `phases.verify.transitions` |

#### 7. `complete` — final report under completion gates

| Aspect | Detail | Config |
|---|---|---|
| Instruction | Final completion report — summary, changed files, verification results, known limitations, remaining risks, deviations, deferred work, next steps. **Before submitting:** (1) refresh the GitNexus index host-side (`gitnexus analyze --no-stats`, see AGENTS.md — the gate verifies availability, not freshness) and note it in the report; (2) write the session lessons file (contract below) | `responses.json` → `complete` |
| Submission | `complete_workflow` — required: `summary`; optional: `changedFiles`, `verificationSummary`, `knownLimitations`, `remainingRisks`, `deviations`, `deferredWork`, `nextSteps` | `schemas/complete.schema.json` |
| Gates on exit (`beforeExit`) | `repository-analysis` (**required**, composite `firstAvailable`: MCP `check` against GitNexus HTTP, fallback local `gitnexus analyze --no-stats` CLI for stdio deployments — the HTTP server exposes no analyze tool) · `capture-session-lessons` (**required**, see contract below) — required failures block completion (`retry_operation` re-runs) | `workflow.json` → `phases.complete.lifecycle.beforeExit` · `operations.json` → `repository-analysis`/`capture-session-lessons` |
| Transition | `required_operations_succeeded` → `completed` (terminal) | `workflow.json` → `phases.complete.transitions` |

**Session lessons contract (`capture-session-lessons`):** before calling
`complete_workflow`, the agent reviews the session for recurring bugs, traps,
and validated fixes (procedure: `.github/prompts/capture-lessons.prompt.md`)
and writes them to `.guidance/state/session-lessons.json` as
`[{"slug", "observation", "cause", "fix"}]` — always create the file, an
empty array is a no-op success. The gate runs
`servers/server-insight/scripts/seed-lessons.mjs` against the
experience-memory server (`EMMS_HTTP_URL=http://host.docker.internal:3002/mcp`,
scope `thinking-mcp-lessons`); seeding is idempotent per slug (`duplicate`
instead of a second episode). The script talks to Insight directly and
bypasses Guidance pattern redaction — the agent MUST redact secrets before
writing the file. Secrets/env are set inline via `sh -c` because process
operations inherit the container environment (no per-operation env support
yet).

**Escape hatch at any point:** `report_blocker` moves the session to the
system state `blocked`; the user decides via `resume_workflow` (decision is
recorded) or ends the run via `cancel_workflow`.

### Operating notes for this sample

- **Docker deployment:** `docker-compose.override.yml` mounts this repo as
  `/workspace` and shadows `node_modules` with an isolated named volume
  (container deps installed via
  `npm install --include=dev --ignore-scripts --script-shell=/bin/true` —
  corepack-yarn crashes on alpine, `NODE_ENV=production` skips dev
  dependencies, and workspace `prepare` scripts run despite
  `--ignore-scripts`).
- **GitNexus index:** the HTTP server (:4747) exposes no `analyze` tool —
  the index refresh is the **agent's responsibility before calling
  `complete_workflow`**: run `gitnexus analyze --no-stats` host-side (WSL
  CLI, see the repo's `AGENTS.md`) and mention the refresh in the completion
  report. The gate only verifies via `check` that the index exists and is
  queryable — **it cannot detect staleness** (a `check` on an outdated index
  still succeeds). The repo name is hardcoded in the gate until template
  placeholder resolution is fixed.
- **Clear-Thought duty in all four reasoning phases (`understand`, `plan`,
  both reviews):** each phase instructs the agent to use Clear-Thought
  reasoning tools via `requiredActions`, and submissions must reference the
  reasoning results (checked in the following phase's review). Per phase:
  `understand` — `sequential_thinking`; `plan` — `sequential_thinking`/
  `decision_framework`; `review_and_adjust_plan` — `assumption_xray`/
  `socratic_method`/`argument_map` stress-test; `review_and_fix_implementation`
  — `metacognitive_monitoring` (always) + `debugging_approach` (for
  non-trivial findings). Honest boundary: Clear-Thought is a **client-side**
  context server of the agent — Guidance cannot see or gate its usage
  server-side (a downstream `sequential_thinking` call would run in the
  Guidance process, not the agent's context, and would not influence agent
  reasoning). The duty is therefore instruction-enforced and review-checked,
  and assumes the agent has Clear-Thought loaded (guaranteed in this repo
  via `AGENTS.md`).
- **Branch workflow + worktree limitation:** every implementation starts with
  a branch check and a feature branch (`feature/<meaningful-name>`) — plain
  branch, deliberately **no worktree**: the container gates verify `/workspace`
  (= the main checkout), so a worktree outside it would be verified stale
  (falsely green). Worktrees remain an opt-in for parallel work outside
  gated runs. Related server follow-ups (tracked as GUID-5 family): a shell
  option for process operations and a per-session switchable workspace root.
  The shell (`wsl.exe -e bash`) is defined in the `understand` instruction —
  a `shell` field in `guidance.json` is rejected by the server's strict
  config validation.
- **Asking questions — channels per phase:** every non-`verify` phase
  instructs the agent to ask open questions in the chat **before** submitting
  and to reference them in the phase's schema field — `understand` →
  `openQuestions`, `plan` → `openQuestions` (added to
  `schemas/plan.schema.json`), `review_and_adjust_plan` →
  `remainingConcerns`, `implement` → `unresolvedIssues` (+`deviations`),
  `review_and_fix_implementation` → `unresolvedFindings`, `complete` →
  `deferredWork`/`nextSteps`. **Blocker rule** (in every instruction):
  `report_blocker` ONLY when the answer would materially change the
  submission (a different plan or different code); otherwise document the
  question, state the working assumption, and proceed — `report_blocker`
  stops the session, so soft questions must not use it. `verify` is
  deliberately excluded: deterministic gates have no question domain.
- **Optional failing gates are tolerated by design:** in this sample `lint`
  and `test` are `required: false` (pre-existing prettier findings; native
  modules not buildable on alpine). Tighten them once your environment
  supports it.

### Companion servers (full potential)

Guidance works standalone, but this sample's full potential — reasoning
helpers, insight capture, index gates — needs the companion servers of this
repository. All downstream servers must be reachable from the Guidance
container via `host.docker.internal` (see `downstream-servers.json`).

| Server | Kind | Powers | Without it |
|---|---|---|---|
| Clear-Thought (`:3000/mcp`) | agent-side context server (not a downstream) | the Clear-Thought duties in all four reasoning phases (`understand`, `plan`, both reviews) | instructions cannot be fulfilled (instruction-enforced — technically tolerated, but the reasoning quality contract is broken) |
| Insight (`:3002/mcp`) | downstream MCP, `required: false` | `query-project-insights` (entering `understand`) and `capture-session-lessons` (before `complete`) | insight query fails as a tolerated failure; the capture gate is **two-stage**: an empty lessons file succeeds without ever contacting Insight, while non-empty lessons make Insight a **hard dependency** (blocking failure, `complete` unreachable) |
| GitNexus (`:4747/api/mcp`) | downstream MCP, `required: true` | `repository-analysis` gate before `complete` (see its composite fallback) | gate fails and blocks completion |

Config locations: transport and capabilities in `downstream-servers.json`,
gate wiring in `operations.json` and `workflow.json`, agent duties in
`responses.json`.

### Example prompt

To start a run, give the agent (Zed agent panel with Guidance loaded):

> Start a Guidance workflow for: **⟨short task description⟩**. Follow the
> phase instructions from the guidance envelope, submit each phase with the
> matching `submit_*` tool, and report blockers via `report_blocker`
> instead of guessing.

Real first production run (docs-only change):

> Start a Guidance workflow for: Improve the README quick-start section.
> Add a verification hint and make the Docker sentence precise.

The agent then calls `start_workflow` with `workspaceRoot: "/workspace"`
and walks understand → … → complete; the `lint/test/build` gates (before
`verify`) and `repository-analysis` (before `complete`) run server-side
automatically.

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

### Configuration assistant tools (3)

Stateless wizard for designing a `.guidance/` configuration — see
[Configuration assistant](#configuration-assistant) for the full flow.

| Tool | Parameters | Purpose |
|---|---|---|
| `setup_guidance_start` | — | Returns the question catalog and the first question (with help text and options) |
| `setup_guidance_answer` | `answers` | Validates the accumulated answers and returns the next open question, or `done: true` with `nextTool: setup_guidance_generate` |
| `setup_guidance_generate` | `answers` | Returns the complete `.guidance/` file set as a payload (files + notes); the agent writes them — the server never writes config files |

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
