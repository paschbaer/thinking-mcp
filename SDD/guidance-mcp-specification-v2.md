# Guidance v2

## Technical Specification for an MCP Workflow Orchestrator

**Status:** Draft  
**Version:** 2.0.0  
**Project name:** Guidance  
**Document language:** English  

---

## 1. Overview

Guidance v2 is a configurable workflow orchestrator for coding agents.

It operates in two distinct roles:

1. **MCP server:** Guidance exposes workflow tools to an MCP host and its coding agent.
2. **MCP client:** Guidance establishes its own MCP connections to configured downstream MCP servers and invokes their capabilities directly.

This dual-role architecture allows Guidance to enforce development processes without relying on the coding agent to select or invoke required external tools.

```text
MCP Host and Coding Agent
            |
            | MCP tool calls
            v
    Guidance MCP Server
            |
            | Workflow orchestration
            |
            +-------------------------+
            |                         |
            v                         v
    Local Hook Runner         Guidance MCP Client
                                      |
                   +------------------+------------------+
                   |                  |                  |
                   v                  v                  v
             GitNexus MCP       Insight MCP        Memory MCP
```

Guidance remains the authoritative workflow state machine.

The coding agent performs reasoning, planning, implementation, review, and remediation. Guidance controls the workflow, executes deterministic hooks, invokes required downstream MCP tools, validates results, and decides whether a phase transition is permitted.

The standard workflow remains:

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

Guidance v2 adds a configurable **MCP orchestration layer** to the phase lifecycle.

A phase can therefore execute:

- local process hooks
- downstream MCP tool calls
- downstream MCP resource reads
- downstream MCP prompt retrieval
- optional model sampling through the upstream MCP client
- user elicitation through the upstream MCP client
- deterministic result validations
- conditional transitions based on external results

---

## 2. Motivation

In Guidance v1, a phase could instruct the coding agent to use a particular tool.

This approach is not sufficient for mandatory workflow requirements because MCP tools exposed to a model are normally model-controlled. The model decides which available tool to invoke. An instruction can influence that decision, but it does not provide a deterministic guarantee.

Guidance v2 removes this dependency for workflow-critical operations.

Instead of returning:

```text
Use the GitNexus tool before completing the workflow.
```

Guidance performs the required downstream call itself:

```text
Call the configured GitNexus MCP server.
Invoke its configured analysis tool.
Validate the result.
Record the result.
Allow or reject completion.
```

The core invariant is:

> Any operation that determines whether a workflow transition is valid MUST be performed or verified by Guidance itself.

---

## 3. Protocol Context

MCP distinguishes among hosts, clients, and servers:

- A host coordinates the AI application.
- An MCP client maintains a connection to an MCP server.
- An MCP server exposes capabilities such as tools, resources, and prompts.
- A client may expose capabilities such as sampling and elicitation to the server.

Tools are exposed by servers and invoked through clients using operations such as `tools/list` and `tools/call`. Tool use presented directly to a model is generally model-controlled, which is why Guidance must invoke mandatory downstream tools as an MCP client instead of merely asking the coding agent to use them.

Guidance v2 is therefore not using a special MCP server-to-server mechanism. It embeds an MCP client manager alongside its MCP server implementation.

```text
Process: Guidance
|
+-- MCP server role
|   |
|   +-- receives workflow calls from the upstream host
|
+-- Workflow engine
|   |
|   +-- decides which operations are required
|
+-- MCP client role
    |
    +-- connects to explicitly configured downstream MCP servers
```

Each downstream server connection is an independent MCP client session.

---

## 4. Goals

Guidance v2 has the following goals.

### 4.1 Deterministic downstream orchestration

Guidance MUST be able to invoke explicitly configured downstream MCP tools without depending on the coding agent's tool selection.

### 4.2 Configuration-driven orchestration

Downstream server definitions, capability mappings, tool arguments, result validators, retry policies, and phase bindings MUST be configurable.

### 4.3 Workflow integration

Downstream MCP operations MUST participate in the same phase lifecycle as local hooks.

### 4.4 Capability discovery

Guidance MUST discover and cache the capabilities exposed by each configured downstream server.

### 4.5 Stable logical operation names

Workflow definitions SHOULD reference logical operation identifiers rather than concrete downstream tool names.

Example:

```yaml
operations:
  repository-analysis:
    provider: gitnexus
    capability: tools
    target: analyze
```

This allows a downstream server or tool name to change without modifying the workflow definition.

### 4.6 Result validation

A successful MCP protocol response alone MUST NOT automatically mean that a workflow requirement succeeded.

Guidance MUST support validation of:

- MCP request success
- tool-level error indicators
- structured content
- required output fields
- expected resource contents
- operation-specific success conditions
- warnings and severity thresholds

### 4.7 Auditability

Every downstream connection, capability discovery, operation invocation, result, error, retry, and transition decision MUST be recorded.

### 4.8 Failure isolation

Failure of one downstream server MUST NOT corrupt the Guidance workflow state or other downstream connections.

### 4.9 Least authority

Guidance MUST connect only to explicitly configured downstream MCP servers and invoke only explicitly allowed capabilities.

### 4.10 Upstream independence

The Guidance workflow MUST remain valid even if different coding agents or MCP hosts use the Guidance server.

---

## 5. Non-Goals

Guidance v2 is not intended to:

- expose all downstream tools transparently to the coding agent
- operate as an unrestricted generic MCP proxy
- let the coding agent dynamically register arbitrary downstream servers
- allow the coding agent to select arbitrary downstream tools
- merge all downstream tool lists into one global namespace by default
- delegate workflow authority to downstream MCP servers
- permit downstream servers to transition the workflow directly
- trust downstream tool descriptions as executable policy
- perform recursive orchestration without explicit limits
- act as a replacement for CI/CD
- guarantee semantic correctness solely because downstream tools succeeded
- automatically grant credentials to downstream servers
- silently approve sensitive or destructive downstream actions

---

## 6. Design Principles

### 6.1 Guidance owns the workflow

Downstream servers provide capabilities and results. They do not own the Guidance state machine.

### 6.2 Workflow configuration selects operations

The coding agent does not decide which downstream operations are mandatory.

### 6.3 Explicit allowlists

Every downstream server and callable capability MUST be declared in trusted configuration.

### 6.4 Logical names over physical names

Workflow phases SHOULD reference stable logical operation names.

### 6.5 Validate, then transition

A downstream call must be completed and validated before it can satisfy a transition condition.

### 6.6 Fail closed

If a required downstream operation cannot be performed or validated, Guidance MUST reject the transition.

### 6.7 Preserve evidence

Raw protocol metadata and normalized results SHOULD be retained according to the configured audit and redaction policy.

### 6.8 No implicit authority escalation

A downstream server MUST NOT gain access to upstream server capabilities, additional filesystem paths, credentials, or other downstream servers unless explicitly configured.

### 6.9 Bounded orchestration

All downstream operations MUST have defined limits for:

- time
- retries
- response size
- nested requests
- concurrency
- user interaction
- model sampling
- cost, where applicable

### 6.10 Graceful capability degradation

Optional operations MAY be skipped when a downstream capability is unavailable. Required operations MUST block the corresponding transition.

---

## 7. High-Level Architecture

```text
+-------------------------------------------------------------+
| Upstream MCP Host                                           |
|                                                             |
|  Coding Agent                                               |
|      |                                                      |
|      v                                                      |
|  MCP Client for Guidance                                    |
+---------------------------|---------------------------------+
                            |
                            v
+-------------------------------------------------------------+
| Guidance Process                                            |
|                                                             |
|  +-----------------------+                                  |
|  | Guidance MCP Server   |                                  |
|  |                       |                                  |
|  | Workflow tools        |                                  |
|  | Resources             |                                  |
|  | Prompts               |                                  |
|  +-----------+-----------+                                  |
|              |                                              |
|              v                                              |
|  +-----------------------+                                  |
|  | Workflow Engine       |                                  |
|  |                       |                                  |
|  | Phase state           |                                  |
|  | Transitions           |                                  |
|  | Lifecycle execution   |                                  |
|  | Policy enforcement    |                                  |
|  +-----+------------+----+                                  |
|        |            |                                       |
|        v            v                                       |
|  +-----------+  +------------------------+                   |
|  | Local     |  | MCP Orchestration      |                   |
|  | Hook      |  | Engine                 |                   |
|  | Runner    |  |                        |                   |
|  +-----------+  | Operation registry     |                   |
|                 | Client manager         |                   |
|                 | Capability cache       |                   |
|                 | Result normalization   |                   |
|                 | Policy enforcement     |                   |
|                 +-----------+------------+                   |
|                             |                                |
|  +--------------------------+-----------------------------+  |
|  | State Repository, Audit Log, Credential References    |  |
|  +--------------------------------------------------------+  |
+-----------------------------|-------------------------------+
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
       +-----------+    +-----------+    +-----------+
       | GitNexus |    | Insight   |    | Memory    |
       | MCP      |    | MCP       |    | MCP       |
       +-----------+    +-----------+    +-----------+
```

---

## 8. Core Components

## 8.1 Guidance MCP Server

The server-facing side exposes Guidance workflow capabilities to the upstream MCP host.

Its responsibilities include:

- exposing workflow tools
- accepting phase submissions
- returning phase-specific guidance
- reporting workflow and orchestration status
- returning normalized downstream results
- requesting user input when supported and permitted
- requesting upstream sampling when supported and permitted

The upstream MCP surface remains separate from the downstream MCP surface.

---

## 8.2 Workflow Engine

The workflow engine remains the authoritative state manager.

It determines:

- the current phase
- the required lifecycle operations
- allowed transitions
- required validations
- permitted recovery actions
- whether downstream results satisfy transition conditions
- whether the workflow can reach `completed`

---

## 8.3 MCP Client Manager

The MCP client manager maintains downstream connections.

Its responsibilities include:

- creating clients from trusted configuration
- negotiating protocol versions
- initializing connections
- discovering capabilities
- monitoring connection health
- reconnecting when permitted
- closing clients during shutdown
- isolating failures per server
- supporting multiple transport types
- binding credentials without exposing them to the coding agent

A separate client instance SHOULD be maintained for each downstream server connection.

---

## 8.4 Downstream Server Registry

The registry stores configured downstream server definitions and runtime status.

Example logical entries:

```text
gitnexus
insight
memory
filesystem-review
security-scanner
```

The registry MUST distinguish between:

- server identity
- transport configuration
- authorization configuration
- declared trust level
- permitted capabilities
- discovered capabilities
- connection status
- health status

---

## 8.5 Operation Registry

The operation registry maps stable Guidance operation identifiers to concrete downstream MCP capabilities.

Example:

```yaml
repository-analysis:
  server: gitnexus
  type: tool
  name: analyze
```

The workflow references:

```text
repository-analysis
```

It does not need to know the concrete server tool name.

---

## 8.6 Result Normalizer

Different downstream tools may return results with different content structures.

The result normalizer converts them into a Guidance operation result.

```json
{
  "operationId": "repository-analysis",
  "serverId": "gitnexus",
  "capabilityType": "tool",
  "capabilityName": "analyze",
  "status": "succeeded",
  "summary": "Repository analysis completed.",
  "data": {},
  "content": [],
  "warnings": [],
  "errors": [],
  "protocolMetadata": {}
}
```

---

## 8.7 Policy Engine

The policy engine decides whether an operation may run.

It evaluates:

- current workflow phase
- configured lifecycle point
- operation allowlist
- downstream server trust level
- input source
- workspace restrictions
- approval requirements
- retry limits
- sampling limits
- elicitation limits
- data-sharing rules
- operation timeout
- operation result size

---

## 9. Downstream MCP Capabilities

Guidance v2 MAY support the following downstream server capabilities.

## 9.1 Tools

Guidance can discover downstream tools and invoke configured tools directly.

Typical uses include:

- repository analysis
- code graph generation
- static analysis
- memory updates
- issue retrieval
- architecture lookup
- project indexing
- dependency inspection
- documentation generation

Tools are the primary downstream capability for Guidance v2.

---

## 9.2 Resources

Guidance can read configured resources from downstream servers.

Typical uses include:

- repository metadata
- code analysis reports
- project memory
- architecture documentation
- dependency graphs
- workflow policies
- previous decisions

A resource read MAY be used as:

- input to a phase instruction
- evidence for a validator
- context returned to the coding agent
- input for upstream sampling
- input for another configured operation

---

## 9.3 Prompts

Guidance MAY retrieve configured downstream prompt templates.

Possible uses include:

- project-specific review instructions
- security review templates
- architecture review templates
- completion summaries
- domain-specific planning guidance

A downstream prompt MUST NOT automatically override Guidance workflow policy.

Prompt content MUST be treated as untrusted external content unless the server and prompt are explicitly trusted.

---

## 9.4 Subscriptions and Notifications

If supported by the downstream server and SDK, Guidance MAY subscribe to capability-change notifications or resource changes.

Notifications MUST NOT directly cause a workflow transition.

They MAY:

- invalidate a capability cache
- mark an operation result as stale
- trigger a configured refresh
- append an audit event
- create a non-blocking workflow warning

---

## 10. Upstream Client Capabilities Used by Guidance

Although Guidance acts as a client toward downstream servers, it remains a server toward the upstream MCP host.

Guidance MAY use capabilities exposed by the upstream client.

## 10.1 Elicitation

Guidance MAY request structured user input from the upstream client when:

- a workflow decision requires human input
- a destructive operation requires approval
- a required parameter cannot be derived safely
- a downstream server requires non-sensitive user input
- the workflow contains an approval gate

Guidance MUST provide a fallback when elicitation is not supported.

The fallback SHOULD return a blocked workflow response containing a structured question for the coding agent to present to the user.

Sensitive credentials MUST NOT be collected using ordinary form elicitation.

---

## 10.2 Sampling

Guidance MAY request sampling from the upstream MCP client for explicitly configured reasoning tasks.

Possible uses include:

- interpreting an analysis report
- classifying findings
- summarizing downstream results
- comparing an implementation with an approved plan
- generating a review draft

Sampling MUST NOT become the authority for deterministic transitions unless its result is combined with independently enforceable policy.

A sampled statement such as:

```text
The implementation looks correct.
```

MUST NOT replace required tests, hooks, or downstream analysis.

Sampling requests MUST have:

- an explicit purpose
- a bounded prompt
- a token limit
- an approval policy
- a retry limit
- an audit record
- a fallback behavior

---

## 10.3 Workspace Context

Guidance SHOULD receive the workspace through explicit tool parameters, server configuration, or resource URIs.

New Guidance implementations SHOULD NOT depend on MCP Roots for access control. Roots are informational rather than an enforced security boundary, and the feature was deprecated in the July 28, 2026 protocol revision.

Guidance MUST enforce workspace boundaries using its own validated configuration and canonical filesystem paths.

---

## 11. Phase Lifecycle in v2

The Guidance phase lifecycle is extended with orchestrated MCP operations.

```text
phase transition requested
        |
        v
validate phase submission
        |
        v
run before-exit local hooks
        |
        v
run before-exit MCP operations
        |
        v
validate all required results
        |
        v
execute transition
        |
        v
run after-exit operations
        |
        v
run next-phase before-enter operations
        |
        v
enter next phase
        |
        v
run next-phase after-enter operations
        |
        v
compose and return phase guidance
```

Recommended lifecycle points:

```text
beforeEnter
afterEnter
beforeExit
afterExit
```

Each lifecycle point MAY contain:

```text
local hooks
MCP tool calls
MCP resource reads
MCP prompt retrieval
sampling requests
elicitation requests
validators
```

---

## 12. Operation Types

Guidance v2 defines a unified orchestration operation model.

Supported operation types SHOULD include:

```text
process
mcpTool
mcpResource
mcpPrompt
sampling
elicitation
composite
```

### Process operation

Executes a trusted local executable.

### MCP tool operation

Invokes a tool provided by a configured downstream MCP server.

### MCP resource operation

Reads a configured resource.

### MCP prompt operation

Retrieves a configured prompt template.

### Sampling operation

Requests model generation through the upstream MCP client.

### Elicitation operation

Requests structured user input through the upstream MCP client.

### Composite operation

Executes a configured sequence or graph of other operations.

---

## 13. Configuration Structure

Recommended project structure:

```text
.guidance/
├── guidance.yaml
├── workflow.yaml
├── responses.yaml
├── operations.yaml
├── downstream-servers.yaml
├── policies.yaml
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
    ├── history/
    └── operation-results/
```

Secrets MUST NOT be stored directly in these files.

---

## 14. Main Configuration

Example `.guidance/guidance.yaml`:

```yaml
version: 2

project:
  name: example-project

workflow:
  file: workflow.yaml

responses:
  file: responses.yaml

operations:
  file: operations.yaml

downstreamServers:
  file: downstream-servers.yaml

policies:
  file: policies.yaml

state:
  directory: state
  persistAfterEveryOperation: true
  retainRawMcpResponses: true

orchestration:
  defaultTimeoutSeconds: 120
  defaultRetryCount: 0
  maximumConcurrentOperations: 4
  failClosedForRequiredOperations: true

security:
  allowAgentDefinedServers: false
  allowAgentDefinedOperations: false
  allowAgentProvidedCommands: false
  restrictWorkingDirectory: true
  redactSensitiveOutput: true
```

---

## 15. Downstream Server Configuration

Example `.guidance/downstream-servers.yaml`:

```yaml
version: 2

servers:
  gitnexus:
    displayName: GitNexus
    enabled: true
    required: true
    trustLevel: trusted

    transport:
      type: stdio
      command:
        executable: gitnexus
        args:
          - mcp

    capabilities:
      allow:
        tools:
          - analyze
          - status
        resources: []
        prompts: []

    connection:
      startupTimeoutSeconds: 30
      requestTimeoutSeconds: 300
      reconnect:
        enabled: true
        maximumAttempts: 2
        delayMilliseconds: 1000

    environment:
      inherit: false
      variables:
        PATH:
          fromHost: PATH

  insight:
    displayName: Insight
    enabled: true
    required: false
    trustLevel: trusted

    transport:
      type: stdio
      command:
        executable: insight-mcp
        args:
          - serve

    capabilities:
      allow:
        tools:
          - store_insight
          - query_insights
        resources:
          - "insight://project/*"
        prompts: []

     connection:
      startupTimeoutSeconds: 30
      requestTimeoutSeconds: 120
      reconnect:
        enabled: true
        maximumAttempts: 2
        delayMilliseconds: 1000*```

---

## 16. Transport Support
Guidance v2 SHOULD support:

```text
stdio
Streamable HTTP
```

Additional transports MAY be supported by the selected MCP SDK.

### Stdio servers

For stdio servers, Guidance starts and supervises the downstream process.

Guidance MUST define:

- executable
- argument list
- working directory
- environment
- startup timeout
- shutdown timeout
- Restart behavior
- output handling
*### Remote servers

For remote MCP servers, Guidance MUST define:

- server URL
- authorization strategy*- TLS requirements
- connection timeout
- request timeout
- redirect policy
- credential reference
- permitted scopes
- server identity validation

---

## 17. Operation Configuration

Example `.guidance/operations.yaml`:

```yaml
version: 2

operations:
  repository-analysis:
 *  description: Analyze the repository using GitNexus.

    type: mcpTool
    server: gitnexus
    capability: analyze

    arguments:
       mode: fixed
      value:
        noStats: true

    required: true
  * timeoutSeconds: 900

    retry:
 *    maximumAttempts: 2
      retryOn:
        - connection_lost
     *  - server_unavailable
        - timeout

    validation:
      protocolRequestMustSucceed: true
      toolResultMustNotBeError: true
       requiredContent: true

    output:
      returnToAgent: raw
      retainRawResult: true
      retainRawResult: true
 *    maximumBytes: 5242880

    failure:
      remainInPhase: true
   *  allowManualRetry: true
      reportToAgent: true

  query-project-insights:
    description: Retrieve Existing development insights.

     type: mcpTool
    server: insight
*   capability: query_insights

     arguments:
      mode: template
  *   value:
        query: "${session.request}"
        scope: "${project.name}"

    required: false
      imeoutSeconds: 60

    validation:*      protocolRequestMustSucceed: true
      toolResultMustNotBeError: true

    output:
      returnToAgent: normalized
      retainRawResult: false
```

---

## 18. Arguments Sources

Operation arguments MAY originate from approved sources.

Supported sources SHOULD include:

```text
fixed configuration
session metadata
validated phase submissions
previous normalized operation results
project configuration
approved user elicitation
trusted environment references
```

Example:

```yaml
arguments:
  mode: mapped
  values:
    repository:
      source: session.workspaceRoot

    taskSummary:
      source: submissions.understand.summary

    changedFiles:
    * source: submissions.implement.changedFiles
```

Arguments MUST NOT be copied from untrusted model output without validation.

---

## 19. Argument Templates

Templates MAY reference an explicitly defined context.

Recommended namespaces:

```text
project
session
workflow
phase
Submissions
operations
userDecision:
```

Example:

```yaml
value:
  query: "${submissions.understand.summary}"
  repository: "${session.workspaceRoot}"
```

Unknown variables MUST cause configuration validation or operation preparation to fail.
Template evaluation MUST NOT execute arbitrary code.

---

## 20. Workflow Binding

Example `.guidance/workflow.yaml`:

```yaml
version: 2*
workflow:
  id: standard-development-v2
  initialPhase: understand

  hases:
  understand:
    response: understand

    lifecycle:
      afterEnter:
        operations:
    *     - query-project-insights

     transitions:
      - to: plan
    *   when: submission_valid

  plan:*    response: plan

    transitions:
      - to: review_and_adjust_plan
        when: submission_valid

* review_and_adjust_plan:
    response: review_and_adjust_plan

    transitions:
      - to: plan
         reason: major_plan_revision_required

      - to: implement
        when: submission_valid

  implement:*    response: implement

    transitions:
      - to: review_and_fix_implementation
        when: submission_valid

  review_and_fix_implementation:
    response: review_and_fix_implementation

    transitions:
      - to: implement
        reason: implementation_changes_required

      - to: verify
        when: submission_valid

  verify:
    response: verify

    lifecycle:
    * beforeExit:
        operations:
 *        - lint
          - test
  *       - build

    transitions:
 *    - to: review_and_fix_implementation
        reason: verification_failed

      - to: complete
       when: required_operations_succeeded

  complete:
    response: complete

    lifecycle:
      beforeExit:
        operations:
          - Repository-analysis
          - store-completion-insight

    transitions:
      - to: completed
          when: required_operations_succeeded:
states:
  completed:
    terminal: true

  blocked:
    system: true
  cancelled:
    terminal: true
```

---

## 21. GitNexus Completion Integration

The Guidance v1 completion invariant used a local command:

```bash
gitnexus analyze --no-stats
```

Guidance v2 SHOULD support this requirement through a logical operation.

Preferred v2 behavior:

```text
complete_workflow
      * |
        v
validate completion report
        |
        v
resolve repository-analysis operation
      * |
        v
connect to GitNexus MCP server
        |
        v
invoke configured analysis tool
        *
        v
validate MCP and tool result
        |
        v
record normalized result
        |
        via transition to completed
```

Example operation:

```yaml
repository-analysis:
  type: mcpTool
  server: GitNexus
  capability: analyze

  arguments:
    mode: fixed
    values:
      noStats: true

  required: true

  validation:
    protocolRequestMustSucceed: true
    toolResultMustNotBeError: true
```

If the configured GitNexus MCP server does not provide an equivalent tool, Guidance MAY retain the v1 local process hook as a fallback:

```yaml
repository-analysis:
  strategy: firstavailable

  alternatives:
    - type: mcpTool
      server: gitnexus
*     capability: analyze
      arguments:
        noStats: true

    * type: process
      executable: gitnexus
      args:
        - analyze
        - --no-stats
```

Fallback execution MUST be explicit. Guidance MUST NOT silently replace an MCP operation with a process command unless configuration permits it.

*--

## 22. Capability Discovery

When connecting to a downstream server, Guidance MUST:

1. initialize the MCP session
2. negotiate the protocol version
3. record server identity and declared capabilities
4. list allowed tools when tools are required
5. resolve required resources or prompts when configured
6. verify that every required operation can be mapped
7. reject invalid or ambiguous mappings
8. cache the resolved capability information
9. persist an audit event

Example internal discovery result:

```json
{
  "serverId": "gitnexus",
  "status": "ready",
  "serverInfo": {
    "name": "gitnexus",
    "version": "1.0.*"
  },
  "capabilities": {
    "tools": true,
    "resources": false,*    "prompts": false
  },
  "allowedTools": [
    {
      "name": "analyze",
      "inputSchemaHash": "sha256:..."
    }
  ]
}
```

---

##*23. Capability Drift

A downstream server may change its tool schema *r capability list.

Guidance MUST detect relevant capability drift.

possible responses include:

```text
invalidate cached mapping
reject the operation
re-run discovery
mark the session blocked
require configuration review
continue only if the change is backward compatible
```
  For active workflow sessions, the recommended behavior is:

- pin the discovered operation contract by schema hash
- permit compatible changes only when configured
- reject removed or incompatible required capabilities
- record the drift in the audit history

---

## 24. Tool Invocation

Guidance invokes a downstream MCP tool using the configured client connection.

The invocation result MUST distinguish between:

1* transport or protocol failure
2. *CP request failure
3. tool-reported error
4. successful tool result
5* incomplete or input-required result
6. cancelled operation
7. timed-but operation
8. result validation failure

Example normalized result:*
```json
{
  "operationId": "repository-analysis",
  "executionId": "operation-01K5...",
  "serverId": "GitNexus",
  "capabilityType": "too*",
  "capabilityName": "analyze",
* "status": "succeeded",
  "required": true,
  "startedAt": "2026-09-2*T15:00:00Z",
  "finishedAt": "2026*09-22T15:00:07Z",
  "durationMs": *000,
  "attempt": 1,
  "isError": false,
  "summary": "GitNexus repository analysis completed.",
  "content": [],
  "warnings": [],
  "errors": []
}
```

---

## 25. Input-Required Downstream Operations

A downstream tool may require additional input.

Guidance MUST NOT fabricated that input.

It MUST apply one of the configured strategies:

```text
use a validated existing session value
request upstream elicitation
return a structured blocker
reject the operation
```

Example:

```yaml
inputRequired:
  strategy: elicit_or_block
  allowFields:
    - architectureChoice
    - compatibilityMode
  denyFields:
    - password
  * - apiKey
    - accessToken
```

The workflow MUST remain in a recoverable state while waiting for input.

---

## 26. Result Validation

Every required operation MUST define an explicit success policy.

Possible validators include:

```text
MCP request completed
tool result is not marked as an error
required content exists
structured content matches a JSON Schema
specific field has an accepted value
warning count is below a threshold
maximum severity is below a threshold
resource content matches an expected media type, result is newer than a configured timestamp
result refers to the correct workspace
```

Example:

```yaml
validation:
  protocolRequestMustSucceed: true
  toolResultMustNotBeerror: true

  structuredContent:
 *  schema: schemas/gitnexus-analysis-result.schema.json

  rules:
    * path: "$.repository"
      equals template: "${session.workspaceRoot}*

    - path: "$.status"
      one of:
        - completed
        - unchanged
```

---

## 27. Result Composition

A downstream result may contribute to the response returned to the coding agent.

Example:

```json
{
  "accepted": false,
  "currentPhase": "complete",
  "reason":*"required_operation_failed",
  "operation": {
    "id": "repository-analysis",
    "server": "gitnexus",*    "status": "failed",
    "summary": "Repository analysis failed.",*    "errors": [
      {
        "code": "index_update_failed",
      * "message": "The repository graph should not be updated."
      }
    *
  },
  "allowedActions": [
    "retry_operation",
    "get_workflow_state",
    "report_blocker"
  ]
}
*``

Raw downstream content SHOULD NOT be returned automatically when *t:

- contains secrets
- exceeds configured limits
- includes unrelated repository data
- is intended only for internal validation
- is untrusted prompt content

---

## 28. composite Operations

A composite operation groups multiple operations:

Example:

```yaml
completion-finalization:
  type: composite
  strategy: sequential

  steps:
    - repository-analysis
    - update-project-memory
    - store-completion-insight

  failurePolicy: stop_on_required_failure
```

Supported execution strategies MAY include:

```text
sequential
parallel
dependencyGraph
firstSuccessful
firstAvailable
*``

Parallel execution MUST only be used when the operations are independent.

---

## 29. Conditional Operations

Operations MAY run conditionally.

Example:

```yaml
security-analysis:
  type: mcpTool
  server: security-scanner
  capability: *can_changes

  condition:
    any:*      - changedFileMatches: "src/a*th/**"
      - changedFileMatches:*"src/security/**"
      - dependencyChangesPresent: true
```

Condition evaluation MUST be deterministic and based on validated workflow data.

Model-generated free text MUST NOT be used directly as an executable condition.

---

## 30. Exposing Downstream Results to the Agent

Default exposure mode is `raw` (transparent-proxy principle, GDS-5): the
guidance container route MUST deliver the downstream tool response in its
original schema, identical to what a direct tool call returns.

- `raw` (default):
  - mcpTool operations carry the downstream CallToolResult verbatim after
    redaction — the `content` array unchanged, plus `structuredContent` at
    top level when the downstream server provided one.
  - process operations carry the captured stdout (maxBuffer-capped,
    redacted) in `content`.
  - Routing metadata (id/status/summary/errors) travels alongside the
    original schema; it MUST NOT replace or re-shape it.
- Restriction modes are opt-out per operation: `normalized`,
  `summary_and_errors`, `summary`, `status_only`, `none`.
- `structuredContent` is forwarded ONLY in `raw` mode.
- Redaction is ALWAYS active, independent of the exposure mode (applied
  upstream in the OperationEngine, before exposure filtering).

Opt-out example (noisy process operation):

```yaml
output:
  returnToAgent: normalized
  retainRawResult: true
```

The coding agent may use these results to fix problems, but it does not
control whether the required operation is considered successful.

---

## 31. New Guidance MCP Tools

Guidance v2 SHOULD add the following upstream tools:

```text
get_orchestration_status
list_configured_operations
get_operation_result
retry_operation
resolve_operation_input
get_downstream_status
```
Administrative tools MAY be exposed separately and SHOULD NOT be mode-accessible by default.

---

## 3*. Tool: `get_orchestration_status`*
### Purpose

Return the operation status for the active phase.

### input

```json
{
  "sessionId": "session-123"
}
```

### Output

```json
{
  "sessionId": "session-123",
* "currentPhase": "complete",
  "operations": [
    {
      "id": "repository-analysis",
      "status": "failed",
      "required": true,
 *    "retryAllowed": true
    }
  ]*}
```

---

## 33. Tool: `list_configured_operations`

### Purpose

Return the logical operations relevant to the current session.

This tool MUST NOT reveal secrets, credentials, unrestricted server configuration, or hidden operations.

### Output

```json
{
  "operations": [
    {
      "id": "repository-analysis",
      "description": "Analyze the repository using GitNexus.",
      "type": "mcpTool",
      "required": true
    }
  ]
}
```

---

##*34. Tool: `get_operation_result`

*## Purpose

Return a filtered operation result.

### Input

```json
{*  "sessionId": "session-123",
  "executionId": "operation-01K5...",
 *"includeContent": true
}
```

Guidance MUST apply the configured output and redaction policy before returning content.

---

## 35. Tool: `retry_operation`

### Purpose

Retrieve a failed orchestration operation.*
### Input

```json
{
  "sessionId": "session-123",
  "operationId": "repository-analysis",
  "requestId": "retry-request-456"
}
```

A retry is allowed only when:

- the operation previously failed
- the operation permits retry
- the session is still at the applicable lifecycle point
- retry limits have not been exceeded
- the operation input remains valid
- no incompatible state change has occurred

---

## 36. Tool: `resolve_operation_input`

### Purpose

Submit approved input requested by an operation when upstream elicitation is unavailable or deliverately not used.

### Input

```json
{
  "sessionId": "session-123",*  "operationId": "architecture-review",
  "inputRequestId": "input-78*",
  "values": {
    "compatibilityMode": "preserve"
  }
}
```

The values MUST be validated against the stored input request schema.

---
*## 37. Tool: `get_downstream_status`

### Purpose

Return a safe summary of downstream server health.

#*# Output

```json
{
  "servers": [
    {
      "id": "gitnexus",
      "status": "ready",
      "required": true,
      "lastSuccessfulRequestAt": "2026-09-22T15:00:07Z"
    },
    {
      "id": "insight",
      "status": "disconnected",
      "required": false
    }
  ]
}
```

sensitive transport and authorization information MUST NOT be returned.

---

## 38. Connection Lifecycle
A downstream client connection has the states:

```text
unconfigured, disabled
disconnected
connecting
initializing
discovering
ready
degraded
reconnecting
failed
closing
closed
```

A required operation may run only when its downstream connection is `ready`, unless a configured fallbacklback is available.

---

## 39* Connection Strategies

Guidance SHOULD support:

### Eager connection

Connect when Guidance starts.

Advantages:

- early configuration validation
- predictable operation latency
- immediate detection of missing servers

### Lazy connection

connect when the first operation requires the server.

Advantages:

- lower startup cost
- unused optional servers are not started
- fewer background processes

Recommended default:

```text
required servers: eager
optional servers: lazy
```

--*

## 40. Retry Policy

Retries MUST distinguish transient failures from deterministic failures.

Potentially retryable:

```text
connection reset
temporary unavailability
request timeout
server restart
transport interruption
```

Normally not retryable:

```text
invalid arguments
tool not found
schema mismatch
authorization denied
policy rejection, tool returned a deterministic domain error
```

Example:

```yaml
retry:
  maximumAttempts: 3
  initialDelayMilliseconds: 500
  backoffMultiplier: 2
  maximumDelayMilliseconds: 5000
  retryOn:
    - connection lost
    - server_unavailable
    * timeout
```

---

## 41. Cancellation and Progress

If supported, Guidance SHOULD propagate cancellation to downstream operations.

Progress notifications MAY be normalized and recorded.

Example:

```json
{
* "operationId": "repository-analysis",
  "status": "running",
  "progress": {
    "completed": 65,
    "total": 100,
    "message": "Analyzing dependency graph."
  }
}
```

Progress MUST NOT be treated as evidence that the operation succeeded.
*---

## 42. Security Model

MCP tool execution and arbitrary data access create significant security risks. Guidance v2 MUST treat every downstream connection as a security boundary.

## 42.1 Trusted configuration only

The coding agent MUST NOT be allowed to:

- add downstream servers
- change server commands
- change remote URLs
- add credentials
- expand capability allowlists
- replace validators
- convert an optional operation into an unrestricted operation
- select arbitrary downstream tool names

## 42.2 Capability allowlisting

Guidance MUST invoke only capabilities listed in trusted configuration.

Discovery does not imply permission.

```text
Discovered capability != Allowed capability
```

## 42.3 Tool descriptions are untrusted

Descriptions, annotations, prompts, and tool results from downstream servers MUST be treated as untrusted content.

They MUST NOT override:

- Guidance policy
* system configuration
- workspace restrictions
- credential rules
- transition requirements
- user approval requirements

## 42.4 Credential isolation

Credentials MUST be referenced indirectly.

Example:

```yaml
authorization:
  type: bearer
* token:
    fromSecretStore: guidance/gitnexus/token
```

Credentials MUST NOT appear in:

- workflow state
- agent-facing responses
- operation templates
- audit logs
- raw error messages

## 42.5 Workspace boundaries

Guidance MUST canonicalize and validate workspace paths itself.

Filesystem access MUST NOT rely only on information supplied by the coding agent or on deprecated rnot hints.

## 42.6 Per-server environment

Stdio servers SHOULD receive a minimal environment.

Environment variables MUST be individually allowed.

## 42.7 Remote server authorization

Remote authorization MUST use appropriate OAuth and MCP authorization practices.

Guidance MUST prevent credential forwarding to unintended servers and MUST validate remote server identity.

## 42.8 Data egress policy

Before sending values to a downstream server, Guidance MUST evaluate:

- which data fields are being sent
- whether the server is permitted to receive the content
- whether source-code content is included
- whether personal or secret data is included
- whether user approval is required

## 42.9 Prompt injection resistance

Downstream content may contain instructions directed at the agent or Guidance.

Guidance MUST treat downstream content as data unless configuration explicitly designates it as an approve* prompt source.

Even approved prompt sources MUST NOT modify deterministic workflow policy.

## 42.10 Recursive call limits

If downstream servers can themselves initiate sampling or input requests, Guidance *UST enforce:

- maximum nested depth
- maximum requests per operation*- timeout budgets
- user approval policy
- tool allowlists
- result size limits

## 42.11 Destructive operation approval

Operations classified as destructive MUST require explicit authorization.

Examples:

```text
delete data
push commits
create releases
modify remote issues
sand external messages
deploy software
rotate credentials
```

---

## *3. Trust Levels

Recommended downstream trust levels:

```text
untrusted
restricted
trusted
privileged
```

### Untrusted

May return data but cannot receive sensitive project content.

### Restricted

May receive limited validated inputs and execute allowlisted read-only operations.

### Trusted

May receive project data required for configured development operations.

### Privileged

May perform explicitly authorized state-changing actions.

Trust level alone MUST NOT grant capability access. The capability allowlist remains authoritative.

---

## 44* Operation Risk Classes

Recommended risk classes:

```text
read_only
workspace_write
external_write
destructive
credential_sensitive
```

Example:

```yaml
repository-analysis:
  riskClass: workspace_write
  approval: configuration_authorized
```

The policy engine MAY require additional approval based on risk class.

---

## 45. State Persistence

The workflow state MUST include downstream orchestration state.

Example:

```json
{
  "sessionId": "session-123",
  "workflowId": "standard-development-v2",
  "configurationVersion": "sha256:...",
  "currentPhase": "complete",
  "status": "active",
  "downstream": {
    "servers": {
      "gitnexus": {
        "status": "ready",
        "capabilitySnapshotHash": "sha256:..."
      }
    },
    "operations": {
      "repository-analysis": {
        "latestExecutionId": "operation-01K5...",
        "status": "failed",
        "attempts": 1
      }
    }
  }
}
```

Raw operation results MAY be persisted in separate files.

---

## 46. Audit Events

Additional v2 audit events SHOULD include:

```text
downstream_connection_started
downstream_connection_ready
downstream_connection_failed
downstream_capabilities_discovered
downstream_capabilities_changed
operation_prepared
operation_rejected_by_policy
operation_started
operation_progressed
operation_input_required
operation_completed
operation_failed
operation_cancelled
operation_retried
operation_result_validated
operation_result_rejected
sampling_requested
elicitation_requested
user_approval_received
credential_reference_resolved
fallback_selected
```

Secrets and disallowed content MUST be redacted before audit persistence.

---

## 47. Error Model

Recommended v2 error codes:

```text
downstream_server_not_configured
downstream_server_disabled
downstream_server_unavailable
downstream_connection_failed
downstream_protocol_error
downstream_capability_missing
downstream_capability_not_allowed
downstream_capability_changed
operation_not_configured
operation_not_allowed_in_phase
operation_arguments_invalid
operation_input_required
operation_cancelled
operation_timed_out
operation_result_invalid
operation_result_too_large
operation_retry_not_allowed
operation_retry_limit_exceeded
authorization_required
authorization_failed
user_approval_required
user_approval_declined
data_egress_denied
fallback_unavailable
nested_request_limit_exceeded
```

Example:

```json
{
  "accepted": false,
  "error": {
    "code": "downstream_capability_missing",
    "message": "The required GitNexus analysis capability is unavailable.",
    "recoverable": false
  },
  "currentPhase": "complete",
  "workflowStatus": "blocked"
}
```

---

## 48. Idempotency

Every state-changing Guidance request SHOULD include a request identifier.

Every downstream operation execution MUST have an execution identifier and idempotency status.

Guidance MUST prevent duplicate invocation when:

- the upstream MCP host retries a request
- a response is lost
- the client reconnects
- the user repeats a completion request
- the server restarts after recording a successful operation

For operations with external side effects, Guidance SHOULD pass an idempotency key to the downstream capability when that capability supports one.

---

## 49. Crash Recovery

After restart, Guidance MUST examine operations that were recorded as `running`.

The operation state should become one of:

```text
succeeded
failed
unknown
reconciling
```

Guidance MUST NOT automatically rerun a potentially state-changing operation when the previous outcome is unknown.

For read-only or explicitly idempotent operations, automatic retry MAY be permitted.

---

## 50. Concurrency

Guidance MUST serialize state transitions per workflow session.

Independent operations at the same lifecycle point MAY run in parallel only when configuration explicitly permits it.

Example:

```yaml
verify-all:
  type: composite
  strategy: parallel
  steps:
    - lint
    - test
    - build
```

A transition MUST wait for every required parallel operation.

---

## 51. Completion Invariant for v2

The Guidance v2 completion invariant is:

> A workflow MUST NOT enter `completed` until every required completion operation has been executed by Guidance, validated successfully, and persisted.

For a GitNexus-backed configuration, all of the following MUST be true:

```text
the active phase is complete
the completion report is valid
the repository-analysis operation is configured
the mapped GitNexus server is authorized and available
the required GitNexus capability was discovered
the capability is allowlisted
the operation arguments are valid
the MCP request completed
the tool did not report an error
the operation result passed validation
all other required completion operations succeeded
the audit events were recorded
the terminal state was persisted
```

The coding agent cannot bypass this invariant by:

- claiming that analysis already ran
- reporting a successful result itself
- invoking a different tool
- omitting the required operation
- requesting a direct transition to `completed`

---

## 52. Example End-to-End Completion Flow

```text
Agent
  |
  | complete_workflow
  v
Guidance MCP Server
  |
  | validate completion report
  v
Workflow Engine
  |
  | resolve complete.beforeExit operations
  v
Operation Registry
  |
  | repository-analysis -> GitNexus analyze tool
  v
MCP Client Manager
  |
  | ensure GitNexus connection is ready
  | verify tool is discovered and allowlisted
  v
GitNexus MCP Server
  |
  | execute repository analysis
  v
Guidance Result Normalizer
  |
  | normalize and validate result
  v
Policy and Workflow Engine
  |
  +---- failure ----> remain in complete
  |                   return actionable error
  |
  +---- success ----> persist evidence
                      transition to completed
                      return final report
```

---

## 53. Compatibility with Guidance v1

Guidance v2 SHOULD remain compatible with v1 local hooks.

The unified operation model can represent existing hooks as `process` operations.

Example migration:

### Guidance v1

```yaml
hooks:
  gitnexus-analysis:
    command:
      executable: gitnexus
      args:
        - analyze
        - --no-stats
```

### Guidance v2

```yaml
operations:
  repository-analysis:
    type: process
    executable: gitnexus
    args:
      - analyze
      - --no-stats
```

Later migration to MCP:

```yaml
operations:
  repository-analysis:
    type: mcpTool
    server: gitnexus
    capability: analyze
    arguments:
      noStats: true
```

Workflow files can continue referencing the same logical identifier:

```text
repository-analysis
```

---

## 54. Suggested Implementation Components

```text
src/
├── mcp-server/
│   ├── GuidanceServer
│   ├── ToolHandlers
│   └── ResponseMapper
├── mcp-client/
│   ├── ClientManager
│   ├── ClientConnection
│   ├── CapabilityDiscovery
│   ├── TransportFactory
│   └── ConnectionHealth
├── orchestration/
│   ├── OperationEngine
│   ├── OperationRegistry
│   ├── OperationResolver
│   ├── ResultNormalizer
│   ├── ResultValidator
│   ├── RetryController
│   └── CompositeExecutor
├── workflow/
│   ├── WorkflowEngine
│   ├── PhaseLifecycle
│   └── TransitionValidator
├── policy/
│   ├── PolicyEngine
│   ├── DataEgressPolicy
│   ├── ApprovalPolicy
│   └── WorkspacePolicy
├── state/
│   ├── SessionRepository
│   ├── OperationRepository
│   └── AuditRepository
└── configuration/
    ├── ConfigLoader
    ├── ConfigValidator
    └── TemplateResolver
```

---

## 55. Suggested v2 Implementation Milestones

### Milestone 1: Dual-role runtime

- keep the existing Guidance MCP server
- add an MCP client manager
- connect to one configured stdio MCP server
- perform MCP initialization
- list tools
- close the connection safely

### Milestone 2: Operation registry

- define logical operations
- map operations to downstream tools
- validate mappings
- expose connection and capability status

### Milestone 3: Direct tool invocation

- invoke a configured downstream tool
- capture the MCP result
- normalize errors
- persist execution results

### Milestone 4: Workflow integration

- attach operations to phase lifecycle points
- block transitions on required failures
- return normalized results to the agent
- support manual retry

### Milestone 5: GitNexus integration

- configure GitNexus as a downstream MCP server
- map `repository-analysis`
- run the operation during `complete.beforeExit`
- enforce the completion invariant
- retain the local command as an optional fallback

### Milestone 6: Resources and prompts

- read configured resources
- retrieve configured prompts
- apply trust and output policies
- provide selected content to phase guidance

### Milestone 7: Elicitation and sampling

- negotiate upstream capabilities
- request structured user input
- support bounded sampling
- provide blocked-state fallbacks

### Milestone 8: Security hardening

- server and capability allowlists
- credential references
- data egress policies
- remote transport authorization
- prompt injection defenses
- nested request limits

### Milestone 9: Reliability

- reconnect policies
- capability drift detection
- request idempotency
- crash recovery
- cancellation
- progress forwarding
- concurrency limits

---

## 56. v2 Acceptance Criteria

Guidance v2 is acceptable when:

1. Guidance continues to operate as an MCP server for coding agents.
2. Guidance can simultaneously act as an MCP client.
3. At least one downstream stdio MCP server can be configured.
4. Guidance can initialize a downstream connection.
5. Guidance can discover downstream tools.
6. Guidance can map a logical operation to a downstream tool.
7. Guidance can invoke the mapped tool without asking the coding agent to select it.
8. The coding agent cannot register arbitrary downstream servers.
9. The coding agent cannot invoke non-allowlisted downstream capabilities through Guidance.
10. Downstream results are normalized and persisted.
11. Tool-reported errors are distinguished from transport errors.
12. Required operation failures block phase transitions.
13. Optional operation failures produce warnings without corrupting workflow state.
14. Failed operations can be retried when policy permits.
15. Duplicate upstream requests do not cause duplicate downstream invocations.
16. Active sessions survive a Guidance restart.
17. Capability changes are detected.
18. Workspace and data-egress policies are enforced.
19. Secrets are not exposed in agent responses or audit logs.
20. Completion invokes the configured GitNexus analysis operation directly.
21. The workflow cannot enter `completed` if the GitNexus operation fails.
22. A successful, validated GitNexus operation permits completion.
23. Local process operations remain available for v1 compatibility.
24. Every downstream invocation is visible in the audit history.
25. Downstream content cannot override Guidance workflow policy.

---

## 57. Summary

Guidance v2 evolves Guidance from a deterministic workflow server into a deterministic MCP workflow orchestrator.

It retains its original upstream role:

```text
Coding agent -> Guidance MCP server
```

It adds a new downstream role:

```text
Guidance MCP client -> Other MCP servers
```

This architecture allows Guidance to perform mandatory operations directly instead of instructing the coding agent to select a particular tool.

The key architectural rule is:

> Workflow-critical operations are selected, invoked, validated, and recorded by Guidance, not delegated to the coding agent's tool-selection behavior.

As a result, Guidance can guarantee operations such as:

```text
repository analysis
memory updates
project insight retrieval
security checks
architecture checks
completion indexing
```

provided that the corresponding downstream MCP servers are configured and available.

For the standard completion flow, Guidance invokes the configured GitNexus analysis capability itself and blocks completion unless the result succeeds and passes validation.

Guidance v2 therefore provides:

```text
deterministic workflow control
direct MCP capability orchestration
configurable multi-server integration
real result validation
auditable execution
recoverable failures
agent-independent enforcement
```