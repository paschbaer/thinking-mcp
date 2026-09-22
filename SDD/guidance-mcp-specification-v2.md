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

   *connection:
      startupTimeoutSe*onds: 30
      requestTimeoutSecon*s: 120
      reconnect:
        en*bled: true
        maximumAttempts* 2
        delayMilliseconds: 1000*```

---

## 16. Transport Support*
Guidance v2 SHOULD support:

```t*xt
stdio
Streamable HTTP
```

Addi*ional transports MAY be supported *y the selected MCP SDK.

### Stdio*servers

For stdio servers, Guidan*e starts and supervises the downst*eam process.

Guidance MUST define*

- executable
- argument list
- w*rking directory
- environment
- st*rtup timeout
- shutdown timeout
- *estart behavior
- output handling
*### Remote servers

For remote MCP*servers, Guidance MUST define:

- *erver URL
- authorization strategy*- TLS requirements
- connection ti*eout
- request timeout
- redirect *olicy
- credential reference
- per*itted scopes
- server identity val*dation

---

## 17. Operation Conf*guration

Example `.guidance/opera*ions.yaml`:

```yaml
version: 2

o*erations:
  repository-analysis:
 *  description: Analyze the reposit*ry using GitNexus.

    type: mcpT*ol
    server: gitnexus
    capabi*ity: analyze

    arguments:
     *mode: fixed
      value:
        n*Stats: true

    required: true
  * timeoutSeconds: 900

    retry:
 *    maximumAttempts: 2
      retry*n:
        - connection_lost
     *  - server_unavailable
        - t*meout

    validation:
      proto*olRequestMustSucceed: true
      t*olResultMustNotBeError: true
     *requiredContent: true

    output:*      returnToAgent: summary_and_e*rors
      retainRawResult: true
 *    maximumBytes: 5242880

    fai*ure:
      remainInPhase: true
   *  allowManualRetry: true
      rep*rtToAgent: true

  query-project-i*sights:
    description: Retrieve *xisting development insights.

   *type: mcpTool
    server: insight
*   capability: query_insights

   *arguments:
      mode: template
  *   value:
        query: "${sessio*.request}"
        scope: "${proje*t.name}"

    required: false
    *imeoutSeconds: 60

    validation:*      protocolRequestMustSucceed: *rue
      toolResultMustNotBeError* true

    output:
      returnToA*ent: normalized
      retainRawRes*lt: false
```

---

## 18. Argumen* Sources

Operation arguments MAY *riginate from approved sources.

S*pported sources SHOULD include:

`*`text
fixed configuration
session *etadata
validated phase submission*
previous normalized operation res*lts
project configuration
approved*user elicitation
trusted environme*t references
```

Example:

```yam*
arguments:
  mode: mapped
  value*
    repository:
      source: ses*ion.workspaceRoot

    taskSummary*
      source: submissions.underst*nd.summary

    changedFiles:
    * source: submissions.implement.cha*gedFiles
```

Arguments MUST NOT b* copied from untrusted model outpu* without validation.

---

## 19. *rgument Templates

Templates MAY r*ference an explicitly defined cont*xt.

Recommended namespaces:

```t*xt
project
session
workflow
phase
*ubmissions
operations
userDecision*
```

Example:

```yaml
value:
  q*ery: "${submissions.understand.sum*ary}"
  repository: "${session.wor*spaceRoot}"
```

Unknown variables*MUST cause configuration validatio* or operation preparation to fail.*
Template evaluation MUST NOT exec*te arbitrary code.

---

## 20. Wo*kflow Binding

Example `.guidance/*orkflow.yaml`:

```yaml
version: 2*
workflow:
  id: standard-developm*nt-v2
  initialPhase: understand

*hases:
  understand:
    response:*understand

    lifecycle:
      a*terEnter:
        operations:
    *     - query-project-insights

   *transitions:
      - to: plan
    *   when: submission_valid

  plan:*    response: plan

    transition*:
      - to: review_and_adjust_pl*n
        when: submission_valid

* review_and_adjust_plan:
    respo*se: review_and_adjust_plan

    tr*nsitions:
      - to: plan
       *reason: major_plan_revision_requir*d

      - to: implement
        w*en: submission_valid

  implement:*    response: implement

    trans*tions:
      - to: review_and_fix_*mplementation
        when: submis*ion_valid

  review_and_fix_implem*ntation:
    response: review_and_*ix_implementation

    transitions*
      - to: implement
        rea*on: implementation_changes_require*

      - to: verify
        when:*submission_valid

  verify:
    re*ponse: verify

    lifecycle:
    * beforeExit:
        operations:
 *        - lint
          - test
  *       - build

    transitions:
 *    - to: review_and_fix_implement*tion
        reason: verification_*ailed

      - to: complete
      * when: required_operations_succeed*d

  complete:
    response: compl*te

    lifecycle:
      beforeExi*:
        operations:
          - *epository-analysis
          - sto*e-completion-insight

    transiti*ns:
      - to: completed
        *hen: required_operations_succeeded*
states:
  completed:
    terminal* true

  blocked:
    system: true*
  cancelled:
    terminal: true
`*`

---

## 21. GitNexus Completion*Integration

The Guidance v1 compl*tion invariant used a local comman*:

```bash
gitnexus analyze --no-s*ats
```

Guidance v2 SHOULD suppor* this requirement through a logica* operation.

Preferred v2 behavior*

```text
complete_workflow
      * |
        v
validate completion r*port
        |
        v
resolve r*pository-analysis operation
      * |
        v
connect to GitNexus M*P server
        |
        v
invok* configured analysis tool
        *
        v
validate MCP and tool r*sult
        |
        v
record no*malized result
        |
        v*transition to completed
```

Examp*e operation:

```yaml
repository-a*alysis:
  type: mcpTool
  server: *itnexus
  capability: analyze

  a*guments:
    mode: fixed
    value*
      noStats: true

  required: *rue

  validation:
    protocolReq*estMustSucceed: true
    toolResul*MustNotBeError: true
```

If the c*nfigured GitNexus MCP server does *ot provide an equivalent tool, Gui*ance MAY retain the v1 local proce*s hook as a fallback:

```yaml
rep*sitory-analysis:
  strategy: first*vailable

  alternatives:
    - ty*e: mcpTool
      server: gitnexus
*     capability: analyze
      arg*ments:
        noStats: true

    * type: process
      executable: g*tnexus
      args:
        - analy*e
        - --no-stats
```

Fallba*k execution MUST be explicit. Guid*nce MUST NOT silently replace an M*P operation with a process command*unless configuration permits it.

*--

## 22. Capability Discovery

W*en connecting to a downstream serv*r, Guidance MUST:

1. initialize t*e MCP session
2. negotiate the pro*ocol version
3. record server iden*ity and declared capabilities
4. l*st allowed tools when tools are re*uired
5. resolve required resource* or prompts when configured
6. ver*fy that every required operation c*n be mapped
7. reject invalid or a*biguous mappings
8. cache the reso*ved capability information
9. pers*st an audit event

Example interna* discovery result:

```json
{
  "s*rverId": "gitnexus",
  "status": "*eady",
  "serverInfo": {
    "name*: "gitnexus",
    "version": "1.0.*"
  },
  "capabilities": {
    "to*ls": true,
    "resources": false,*    "prompts": false
  },
  "allow*dTools": [
    {
      "name": "analyze",
      "inputSchemaHash": "sha256:..."
    }
  ]
}
```

---

##*23. Capability Drift

A downstream*server may change its tool schema *r capability list.

Guidance MUST *etect relevant capability drift.

*ossible responses include:

```tex*
invalidate cached mapping
reject *he operation
re-run discovery
mark*the session blocked
require config*ration review
continue only if the*change is backward compatible
```
*For active workflow sessions, the *ecommended behavior is:

- pin the*discovered operation contract by s*hema hash
- permit compatible chan*es only when configured
- reject r*moved or incompatible required cap*bilities
- record the drift in the*audit history

---

## 24. Tool In*ocation

Guidance invokes a downst*eam MCP tool using the configured *lient connection.

The invocation *esult MUST distinguish between:

1* transport or protocol failure
2. *CP request failure
3. tool-reporte* error
4. successful tool result
5* incomplete or input-required resu*t
6. cancelled operation
7. timed-*ut operation
8. result validation *ailure

Example normalized result:*
```json
{
  "operationId": "repos*tory-analysis",
  "executionId": "*peration-01K5...",
  "serverId": "*itnexus",
  "capabilityType": "too*",
  "capabilityName": "analyze",
* "status": "succeeded",
  "require*": true,
  "startedAt": "2026-09-2*T15:00:00Z",
  "finishedAt": "2026*09-22T15:00:07Z",
  "durationMs": *000,
  "attempt": 1,
  "isError": *alse,
  "summary": "GitNexus repos*tory analysis completed.",
  "cont*nt": [],
  "warnings": [],
  "erro*s": []
}
```

---

## 25. Input-Re*uired Downstream Operations

A dow*stream tool may require additional*input.

Guidance MUST NOT fabricat* that input.

It MUST apply one of*the configured strategies:

```tex*
use a validated existing session *alue
request upstream elicitation
*eturn a structured blocker
reject *he operation
```

Example:

```yam*
inputRequired:
  strategy: elicit*or_block
  allowFields:
    - arch*tectureChoice
    - compatibilityM*de
  denyFields:
    - password
  * - apiKey
    - accessToken
```

T*e workflow MUST remain in a recove*able state while waiting for input*

---

## 26. Result Validation

E*ery required operation MUST define*an explicit success policy.

Possi*le validators include:

```text
MC* request completed
tool result is *ot marked as an error
required con*ent exists
structured content matc*es a JSON Schema
specific field ha* an accepted value
warning count i* below a threshold
maximum severit* is below a threshold
resource con*ent matches an expected media type*result is newer than a configured *imestamp
result refers to the corr*ct workspace
```

Example:

```yam*
validation:
  protocolRequestMust*ucceed: true
  toolResultMustNotBe*rror: true

  structuredContent:
 *  schema: schemas/gitnexus-analysi*-result.schema.json

  rules:
    * path: "$.repository"
      equals*emplate: "${session.workspaceRoot}*

    - path: "$.status"
      one*f:
        - completed
        - u*changed
```

---

## 27. Result Co*position

A downstream result may *ontribute to the response returned*to the coding agent.

Example:

``*json
{
  "accepted": false,
  "cur*entPhase": "complete",
  "reason":*"required_operation_failed",
  "op*ration": {
    "id": "repository-a*alysis",
    "server": "gitnexus",*    "status": "failed",
    "summa*y": "Repository analysis failed.",*    "errors": [
      {
        "c*de": "index_update_failed",
      * "message": "The repository graph *ould not be updated."
      }
    *
  },
  "allowedActions": [
    "r*try_operation",
    "get_workflow_*tate",
    "report_blocker"
  ]
}
*``

Raw downstream content SHOULD *OT be returned automatically when *t:

- contains secrets
- exceeds c*nfigured limits
- includes unrelat*d repository data
- is intended on*y for internal validation
- is unt*usted prompt content

---

## 28. *omposite Operations

A composite o*eration groups multiple operations*

Example:

```yaml
completion-fin*lization:
  type: composite
  stra*egy: sequential

  steps:
    - re*ository-analysis
    - update-proj*ct-memory
    - store-completion-i*sight

  failurePolicy: stop_on_re*uired_failure
```

Supported execu*ion strategies MAY include:

```te*t
sequential
parallel
dependencyGr*ph
firstSuccessful
firstAvailable
*``

Parallel execution MUST only b* used when the operations are inde*endent.

---

## 29. Conditional O*erations

Operations MAY run condi*ionally.

Example:

```yaml
securi*y-analysis:
  type: mcpTool
  serv*r: security-scanner
  capability: *can_changes

  condition:
    any:*      - changedFileMatches: "src/a*th/**"
      - changedFileMatches:*"src/security/**"
      - dependen*yChangesPresent: true
```

Conditi*n evaluation MUST be deterministic*and based on validated workflow da*a.

Model-generated free text MUST*NOT be used directly as an executa*le condition.

---

## 30. Exposin* Downstream Results to the Agent

*uidance SHOULD expose normalized r*sults, not raw downstream implemen*ation details.

Possible exposure *odes:

```text
none
status_only
su*mary
summary_and_errors
normalized*raw
```

Example configuration:

`*`yaml
output:
  returnToAgent: sum*ary_and_errors
  retainRawResult: *rue
```

The coding agent may use *hese results to fix problems, but *t does not control whether the req*ired operation is considered succe*sful.

---

## 31. New Guidance MC* Tools

Guidance v2 SHOULD add the*following upstream tools:

```text*get_orchestration_status
list_conf*gured_operations
get_operation_res*lt
retry_operation
resolve_operati*n_input
get_downstream_status
```
*Administrative tools MAY be expose* separately and SHOULD NOT be mode*-accessible by default.

---

## 3*. Tool: `get_orchestration_status`*
### Purpose

Return the operation*status for the active phase.

### *nput

```json
{
  "sessionId": "se*sion-123"
}
```

### Output

```js*n
{
  "sessionId": "session-123",
* "currentPhase": "complete",
  "op*rations": [
    {
      "id": "rep*sitory-analysis",
      "status": *failed",
      "required": true,
 *    "retryAllowed": true
    }
  ]*}
```

---

## 33. Tool: `list_con*igured_operations`

### Purpose

R*turn the logical operations releva*t to the current session.

This to*l MUST NOT reveal secrets, credent*als, unrestricted server configura*ion, or hidden operations.

### Ou*put

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

Return a filtered oper*tion result.

### Input

```json
{*  "sessionId": "session-123",
  "e*ecutionId": "operation-01K5...",
 *"includeContent": true
}
```

Guid*nce MUST apply the configured outp*t and redaction policy before retu*ning content.

---

## 35. Tool: `*etry_operation`

### Purpose

Retr* a failed orchestration operation.*
### Input

```json
{
  "sessionId*: "session-123",
  "operationId": *repository-analysis",
  "requestId*: "retry-request-456"
}
```

A ret*y is allowed only when:

- the ope*ation previously failed
- the oper*tion permits retry
- the session i* still at the applicable lifecycle*point
- retry limits have not been*exceeded
- the operation input rem*ins valid
- no incompatible state *hange has occurred

---

## 36. To*l: `resolve_operation_input`

### *urpose

Submit approved input requ*sted by an operation when upstream*elicitation is unavailable or deli*erately not used.

### Input

```j*on
{
  "sessionId": "session-123",*  "operationId": "architecture-rev*ew",
  "inputRequestId": "input-78*",
  "values": {
    "compatibilit*Mode": "preserve"
  }
}
```

The v*lues MUST be validated against the*stored input request schema.

---
*## 37. Tool: `get_downstream_statu*`

### Purpose

Return a safe summ*ry of downstream server health.

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

*ensitive transport and authorizati*n information MUST NOT be returned*

---

## 38. Connection Lifecycle*
A downstream client connection ha* the states:

```text
unconfigured*disabled
disconnected
connecting
i*itializing
discovering
ready
degra*ed
reconnecting
failed
closing
clo*ed
```

A required operation may r*n only when its downstream connect*on is `ready`, unless a configured*fallback is available.

---

## 39* Connection Strategies

Guidance S*OULD support:

### Eager connectio*

Connect when Guidance starts.

A*vantages:

- early configuration v*lidation
- predictable operation l*tency
- immediate detection of mis*ing servers

### Lazy connection

*onnect when the first operation re*uires the server.

Advantages:

- *ower startup cost
- unused optiona* servers are not started
- fewer b*ckground processes

Recommended de*ault:

```text
required servers: e*ger
optional servers: lazy
```

--*

## 40. Retry Policy

Retries MUS* distinguish transient failures fr*m deterministic failures.

Potenti*lly retryable:

```text
connection*reset
temporary unavailability
req*est timeout
server restart
transpo*t interruption
```

Normally not r*tryable:

```text
invalid argument*
tool not found
schema mismatch
au*horization denied
policy rejection*tool returned a deterministic doma*n error
```

Example:

```yaml
ret*y:
  maximumAttempts: 3
  initialD*layMilliseconds: 500
  backoffMult*plier: 2
  maximumDelayMillisecond*: 5000
  retryOn:
    - connection*lost
    - server_unavailable
    * timeout
```

---

## 41. Cancella*ion and Progress

If supported, Gu*dance SHOULD propagate cancellatio* to downstream operations.

Progre*s notifications MAY be normalized *nd recorded.

Example:

```json
{
* "operationId": "repository-analys*s",
  "status": "running",
  "prog*ess": {
    "completed": 65,
    "*otal": 100,
    "message": "Analyz*ng dependency graph."
  }
}
```

P*ogress MUST NOT be treated as evid*nce that the operation succeeded.
*---

## 42. Security Model

MCP to*l execution and arbitrary data acc*ss create significant security ris*s. Guidance v2 MUST treat every do*nstream connection as a security b*undary.

## 42.1 Trusted configura*ion only

The coding agent MUST NO* be allowed to:

- add downstream *ervers
- change server commands
- *hange remote URLs
- add credential*
- expand capability allowlists
- *eplace validators
- convert an opt*onal operation into an unrestricte* operation
- select arbitrary down*tream tool names

## 42.2 Capabili*y allowlisting

Guidance MUST invo*e only capabilities listed in trus*ed configuration.

Discovery does *ot imply permission.

```text
Disc*vered capability != Allowed capabi*ity
```

## 42.3 Tool descriptions*are untrusted

Descriptions, annot*tions, prompts, and tool results f*om downstream servers MUST be trea*ed as untrusted content.

They MUS* NOT override:

- Guidance policy
* system configuration
- workspace *estrictions
- credential rules
- t*ansition requirements
- user appro*al requirements

## 42.4 Credentia* isolation

Credentials MUST be re*erenced indirectly.

Example:

```*aml
authorization:
  type: bearer
* token:
    fromSecretStore: guida*ce/gitnexus/token
```

Credentials*MUST NOT appear in:

- workflow st*te
- agent-facing responses
- oper*tion templates
- audit logs
- raw *rror messages

## 42.5 Workspace b*undaries

Guidance MUST canonicali*e and validate workspace paths its*lf.

Filesystem access MUST NOT re*y only on information supplied by *he coding agent or on deprecated r*ot hints.

## 42.6 Per-server envi*onment

Stdio servers SHOULD recei*e a minimal environment.

Environm*nt variables MUST be individually *llowed.

## 42.7 Remote server aut*orization

Remote authorization MU*T use appropriate OAuth and MCP au*horization practices.

Guidance MU*T prevent credential forwarding to*unintended servers and MUST valida*e remote server identity.

## 42.8*Data egress policy

Before sending*values to a downstream server, Gui*ance MUST evaluate:

- which data *ields are being sent
- whether the*server is permitted to receive the*
- whether source-code content is *ncluded
- whether personal or secr*t data is included
- whether user *pproval is required

## 42.9 Promp* injection resistance

Downstream *ontent may contain instructions di*ected at the agent or Guidance.

G*idance MUST treat downstream conte*t as data unless configuration exp*icitly designates it as an approve* prompt source.

Even approved pro*pt sources MUST NOT modify determi*istic workflow policy.

## 42.10 R*cursive call limits

If downstream*servers can themselves initiate sa*pling or input requests, Guidance *UST enforce:

- maximum nested dep*h
- maximum requests per operation*- timeout budgets
- user approval *olicy
- tool allowlists
- result s*ze limits

## 42.11 Destructive op*ration approval

Operations classi*ied as destructive MUST require ex*licit authorization.

Examples:

`*`text
delete data
push commits
cre*te releases
modify remote issues
s*nd external messages
deploy softwa*e
rotate credentials
```

---

## *3. Trust Levels

Recommended downs*ream trust levels:

```text
untrus*ed
restricted
trusted
privileged
`*`

### Untrusted

May return data *ut cannot receive sensitive projec* content.

### Restricted

May rec*ive limited validated inputs and e*ecute allowlisted read-only operat*ons.

### Trusted

May receive pro*ect data required for configured d*velopment operations.

### Privile*ed

May perform explicitly authori*ed state-changing actions.

Trust *evel alone MUST NOT grant capabili*y access. The capability allowlist*remains authoritative.

---

## 44* Operation Risk Classes

Recommend*d risk classes:

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