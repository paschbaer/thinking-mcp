# Experience Memory MCP Server

## Complete Product and Technical Specification

**Working title:** Experience Memory MCP Server (EMMS)  
**Document version:** 1.0  
**Status:** Draft for implementation  
**Date:** 2026-09-17  
**Language:** English  
**Intended audience:** Product owners, software architects, AI engineers, security engineers, platform engineers, coding-agent developers, and evaluators

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision, Mission, and Product Thesis](#2-vision-mission-and-product-thesis)
3. [Problem Definition](#3-problem-definition)
4. [Goals, Non-Goals, and Design Principles](#4-goals-non-goals-and-design-principles)
5. [Terminology and Conceptual Model](#5-terminology-and-conceptual-model)
6. [Personas and Primary Use Cases](#6-personas-and-primary-use-cases)
7. [System Context and Architecture](#7-system-context-and-architecture)
8. [Guided Agent Interaction Protocol](#8-guided-agent-interaction-protocol)
9. [MCP Interface Specification](#9-mcp-interface-specification)
10. [Experience Lifecycle and State Machines](#10-experience-lifecycle-and-state-machines)
11. [Domain Model and Data Schema](#11-domain-model-and-data-schema)
12. [Environment Fingerprinting and Taxonomy](#12-environment-fingerprinting-and-taxonomy)
13. [Capture and Evidence Pipeline](#13-capture-and-evidence-pipeline)
14. [Retrieval, Ranking, and Context Assembly](#14-retrieval-ranking-and-context-assembly)
15. [Consolidation and Knowledge Evolution](#15-consolidation-and-knowledge-evolution)
16. [Validation, Revalidation, and Contradiction Handling](#16-validation-revalidation-and-contradiction-handling)
17. [Security, Privacy, and Trust](#17-security-privacy-and-trust)
18. [Authorization, Tenancy, and Governance](#18-authorization-tenancy-and-governance)
19. [Storage and Infrastructure](#19-storage-and-infrastructure)
20. [Observability and Auditability](#20-observability-and-auditability)
21. [Reliability, Performance, and Scalability](#21-reliability-performance-and-scalability)
22. [Agent Integration Contract](#22-agent-integration-contract)
23. [Administration and Human Review](#23-administration-and-human-review)
24. [Evaluation Framework](#24-evaluation-framework)
25. [API Errors and Recovery Behavior](#25-api-errors-and-recovery-behavior)
26. [Configuration and Deployment Profiles](#26-configuration-and-deployment-profiles)
27. [Implementation Plan and Acceptance Criteria](#27-implementation-plan-and-acceptance-criteria)
28. [Reference Workflows](#28-reference-workflows)
29. [Risks and Mitigations](#29-risks-and-mitigations)
30. [Evolution Strategy to the Maximum](#30-evolution-strategy-to-the-maximum)
31. [Appendices](#31-appendices)

---

# 1. Executive Summary

The Experience Memory MCP Server, abbreviated EMMS, is a vendor-neutral, evidence-backed long-term memory layer for coding agents. It enables agents to capture failures, attempted remediations, observed outcomes, verified solutions, invalid strategies, environmental constraints, and generalized lessons. It then retrieves the most applicable prior experience when an agent encounters a new task or failure.

EMMS is not merely a vector database, chat-history archive, or documentation RAG service. Its primary unit is a structured **experience episode**:

> In environment X, while pursuing goal Y, action Z produced observation O. The diagnosed cause was C. Candidate solution S changed artifacts A and was validated by evidence V. Its known scope, confidence, contradictions, and later outcomes are retained.

The server guides an agent through the full experience process by returning, with every response, a structured **recommended next request**. This creates a formal stateful workflow at the application level even when the underlying MCP protocol is stateless. The agent can therefore discover what information is missing, what evidence is required, what action should occur next, and when an experience is eligible for validation or promotion.

The current <Organization>Model Context Protocol</Organization> specification defines a stateless, self-contained request model over JSON-RPC and exposes tools, resources, and prompts. It also supports optional extensions and multi-round-trip interaction patterns. EMMS aligns with that architecture while maintaining durable workflow state in its own domain database. citeturn2search43turn2search44turn2search45

Existing systems validate portions of the concept. The official MCP memory server provides a basic persistent knowledge graph, <Organization>Mem0</Organization> provides MCP-accessible memory operations and project-aware coding memory, and <Organization>Letta</Organization> supports persistent agents and learned skills. Research systems such as <Project>Reflexion</Project> and <Project>ExpeL</Project> show that agents can improve by retaining reflections and extracting reusable insights from successes and failures. However, EMMS differentiates itself through typed debugging episodes, execution evidence, version-sensitive applicability, negative experience, contradiction management, guided interaction, and agent-independent MCP access. citeturn1search7turn1search14turn1search17turn1search23turn1search31turn1search37

---

# 2. Vision, Mission, and Product Thesis

## 2.1 Vision

Coding agents should improve from every verified interaction, regardless of which model, IDE, or agent runtime is used later.

## 2.2 Mission

Provide a secure and interoperable experience layer that turns debugging activity into durable, searchable, scoped, and validated operational knowledge.

## 2.3 Product thesis

The defensible value of the system is not the embedding model, vector store, or MCP transport. The value is the continuously improving corpus of:

- reproducible failure episodes;
- exact environmental fingerprints;
- observed unsuccessful approaches;
- verified corrective strategies;
- evidence artifacts;
- version and scope constraints;
- contradictions and regressions;
- cross-episode abstractions;
- measured utility in later work.

## 2.4 Desired outcome

For a recurring or analogous failure, an agent should:

1. identify the relevant prior experience before repeating avoidable work;
2. understand whether the experience applies to the current environment;
3. avoid previously disproven or harmful strategies;
4. perform the minimum diagnostic steps needed to resolve uncertainty;
5. execute an evidence-supported solution;
6. validate it using objective checks;
7. update the shared memory with the new outcome.

---

# 3. Problem Definition

## 3.1 Current failure mode

Most coding-agent sessions are operationally isolated. Within a session, an agent may inspect a repository, attempt commands, encounter failures, revise hypotheses, and eventually produce a successful patch. When the session ends, the useful sequence is usually lost or reduced to an unstructured transcript.

This causes:

- repeated diagnosis of previously understood failures;
- repeated execution of known bad commands;
- loss of repository-specific operational knowledge;
- loss of framework and version migration knowledge;
- poor transfer between agent products and model vendors;
- inability to measure whether memory improves outcomes;
- propagation of unverified self-generated explanations.

## 3.2 Why conventional RAG is insufficient

Conventional document RAG tends to retrieve chunks based primarily on semantic similarity. Debugging requires additional signals:

- exact error codes and message fragments;
- stack-frame and symbol matches;
- runtime, framework, and library versions;
- operating system and architecture;
- build system, package manager, and lockfile state;
- repository scope and branch state;
- attempts already performed;
- validation quality;
- age and last revalidation date;
- contradictions and known regressions.

Pure vector similarity is especially weak for precise identifiers and rare error strings, while filtered approximate-nearest-neighbor search introduces recall tradeoffs. EMMS therefore requires hybrid retrieval, typed filters, exact signature matching, and reranking. <Project>pgvector</Project> supports exact and approximate vector search inside <Product>PostgreSQL</Product>, while production guidance highlights the need to combine vector ranking with conventional filters and keyword retrieval. citeturn2search64turn2search65

## 3.3 Why unverified reflection is dangerous

A self-authored lesson may be incorrect even when it sounds confident. Persisting a false diagnosis can turn a one-time hallucination into a recurring system-level failure. Recent research describes this as memory confabulation and reports that programmatically extracted failure signals can outperform open-ended self-diagnosis in affected cases. EMMS therefore treats agent reflection as a hypothesis, not as evidence. citeturn1search26

---

# 4. Goals, Non-Goals, and Design Principles

## 4.1 Functional goals

EMMS SHALL:

1. capture structured experiences during active coding-agent work;
2. guide agents through capture, diagnosis, resolution, and validation;
3. store positive and negative attempts;
4. attach immutable evidence and provenance;
5. retrieve experiences using hybrid search and compatibility constraints;
6. expose applicability reasons and mismatches;
7. maintain explicit lifecycle and confidence states;
8. consolidate episodes into reusable lessons;
9. detect duplicates, contradictions, staleness, and regressions;
10. support multiple agents, repositories, organizations, and models;
11. enforce tenant, project, and visibility boundaries;
12. provide complete audit trails;
13. protect secrets and untrusted content;
14. operate locally, in teams, and as a managed service.

## 4.2 Non-goals for the initial implementation

The MVP SHALL NOT attempt to:

- replace the coding agent itself;
- execute arbitrary remediation commands directly;
- train or fine-tune foundation-model weights;
- ingest an entire public software ecosystem without curation;
- certify that a fix is universally correct;
- infer user authorization from natural-language instructions;
- expose raw private source code across tenant boundaries;
- treat popularity as proof of correctness.

## 4.3 Design principles

### Evidence before confidence

No experience becomes verified through language alone.

### Applicability before similarity

A semantically similar experience with an incompatible environment must rank below a less similar but compatible experience.

### Negative knowledge is first-class

Failed and harmful attempts are retained with context and outcome.

### Every claim has provenance

Root causes, commands, patches, tests, and generalizations must identify their source.

### Human control remains available

Administrators can review, correct, invalidate, merge, export, and delete experience.

### The server guides but does not impersonate the host

EMMS recommends the next MCP request and required observation. The coding agent or host decides whether to perform external actions.

### Untrusted content never becomes instruction

Logs, output, repository text, retrieved experience, and generated summaries are data with explicit trust labels.

### Interoperability over agent lock-in

Core behavior is available through MCP and exportable schemas.

---

# 5. Terminology and Conceptual Model

## 5.1 Core terms

**Experience episode:** A bounded record of a goal, context, actions, observations, hypotheses, resolution, and validation.

**Attempt:** An action or strategy tried within an episode.

**Observation:** A fact captured from the environment, tool output, file state, user feedback, or test execution.

**Failure signature:** A normalized representation of an error, including exact tokens, stack frames, exit code, and structural fingerprints.

**Environment fingerprint:** A structured and partially hashed representation of the execution context.

**Hypothesis:** A proposed explanation for an observed failure.

**Root-cause claim:** A hypothesis supported by explicit evidence and lifecycle state.

**Solution:** A remediation strategy, optionally including commands, patch references, configuration changes, and rollback steps.

**Validation run:** A controlled check intended to prove or disprove a solution.

**Evidence artifact:** An immutable log, diff, test report, trace fragment, manifest, or attestation.

**Lesson:** A generalized, reusable rule derived from one or more episodes.

**Applicability envelope:** The technologies, versions, platforms, scopes, preconditions, and exclusions under which an experience may apply.

**Counterexample:** An episode showing that a lesson or solution does not hold in a stated context.

**Guidance envelope:** The response metadata that identifies workflow state, missing information, allowed next operations, and the recommended next request.

## 5.2 Memory layers

EMMS defines four memory layers:

1. **Working workflow state:** Current episode status and pending request.
2. **Episodic memory:** Concrete captured events and outcomes.
3. **Semantic memory:** Consolidated factual knowledge and relationships.
4. **Procedural memory:** Reusable diagnostic or remediation playbooks.

---

# 6. Personas and Primary Use Cases

## 6.1 Coding agent

Uses EMMS before, during, and after implementation or debugging work.

Primary needs:

- find applicable prior experience;
- know what evidence to collect next;
- avoid bad strategies;
- record progress incrementally;
- close the loop after validation.

## 6.2 Developer

Reviews retrieved experience, approves sensitive actions, corrects false conclusions, and benefits from reduced repeat work.

## 6.3 Platform engineer

Operates the server, configures tenancy and retention, manages index performance, and integrates identity.

## 6.4 Knowledge curator

Reviews proposed lessons, resolves conflicting experience, and manages publication scope.

## 6.5 Security and compliance reviewer

Examines redaction, authorization, audit logs, provenance, retention, and cross-tenant controls.

## 6.6 Evaluator or researcher

Measures whether memory improves task success, latency, tool usage, cost, and safety.

## 6.7 Primary use cases

1. Recurring local build failure.
2. CI-only failure with environment mismatch.
3. Framework upgrade regression.
4. Dependency-resolution conflict.
5. Database migration failure.
6. Container build or runtime failure.
7. Infrastructure-as-code deployment error.
8. Test flakiness diagnosis.
9. Performance regression remediation.
10. Security patch with mandatory regression checks.
11. Repository-specific procedure discovery.
12. Cross-project generalization of a validated lesson.

---

# 7. System Context and Architecture

## 7.1 Logical architecture

```text
+------------------------------+
| Coding Agent / IDE / Harness |
+---------------+--------------+
                | MCP
+---------------v--------------+
| Experience Memory MCP Layer  |
| - Tool and resource facade   |
| - Guidance engine            |
| - Schema validation          |
| - Authorization enforcement  |
+---------------+--------------+
                |
+---------------v--------------+
| Application Services         |
| - Episode service            |
| - Retrieval service          |
| - Evidence service           |
| - Validation service         |
| - Consolidation service      |
| - Policy and redaction       |
+-------+-----------+----------+
        |           |
+-------v----+ +----v----------------+
| PostgreSQL | | Object storage      |
| + pgvector | | logs/diffs/reports  |
+-------+----+ +---------------------+
        |
+-------v----------------------+
| Async workers and evaluators |
+------------------------------+
```

## 7.2 Protocol alignment

EMMS SHALL support:

- local stdio deployment for individual developers;
- remote HTTP deployment for teams and managed-service operation;
- self-contained request processing;
- protocol-version validation;
- tool discovery;
- MCP resources for read-only inspection;
- MCP prompts or skills for recommended workflows when supported;
- asynchronous task handles for long-running consolidation or revalidation where supported.

The current MCP architecture separates hosts, one-to-one clients, and focused servers, with security and consent coordinated by the host. EMMS SHALL preserve that separation and SHALL NOT assume access to the host's full conversation or to other MCP servers. citeturn2search43turn2search45

## 7.3 Stateless protocol, durable workflow

MCP transport state and EMMS workflow state are separate concerns.

Each mutating request SHALL carry:

- `workflow_id`;
- `experience_id`, when created;
- `expected_revision` for optimistic concurrency;
- caller identity and scope from the authorization context;
- an idempotency key;
- protocol-level correlation metadata.

The database maintains the durable workflow. Any EMMS instance can process the next request.

## 7.4 Components

### MCP facade

Validates requests and maps them to application commands.

### Guidance engine

Calculates missing information, permitted transitions, and the next recommended tool call.

### Episode service

Maintains episodes, attempts, observations, claims, and lifecycle state.

### Retrieval service

Performs candidate generation, compatibility filtering, reranking, and explanation.

### Evidence service

Stores content-addressed artifacts, redacts secrets, computes hashes, and records provenance.

### Validation service

Evaluates structured validation evidence and updates confidence.

### Consolidation worker

Clusters related episodes, proposes lessons, identifies contradictions, and manages staleness.

### Policy service

Applies visibility, retention, redaction, export, and human-approval rules.

---

# 8. Guided Agent Interaction Protocol

## 8.1 Purpose

The server SHALL formally guide agents through the process via request-response interactions. Each successful or recoverable response SHALL include a `guidance` object. The guidance object is normative for EMMS clients.

## 8.2 Guidance envelope

```json
{
  "guidance": {
    "workflow_id": "wf_01J...",
    "experience_id": "exp_01J...",
    "workflow_state": "diagnosing",
    "revision": 7,
    "objective": "Establish whether the peer dependency conflict is the root cause",
    "completion": {
      "percent": 48,
      "required_items_remaining": 2
    },
    "missing_information": [
      {
        "field": "environment.package_manager.version",
        "reason": "Version-sensitive retrieval requires this value",
        "required": true,
        "safe_collection_hint": "Run the package manager version command"
      }
    ],
    "warnings": [
      {
        "code": "UNVERIFIED_ROOT_CAUSE",
        "severity": "medium",
        "message": "The root-cause statement is still a hypothesis"
      }
    ],
    "allowed_next_tools": [
      "experience.record_observation",
      "experience.record_attempt",
      "experience.propose_hypothesis"
    ],
    "recommended_next_request": {
      "tool": "experience.record_observation",
      "reason": "The package manager version is required before selecting a compatible lesson",
      "arguments_template": {
        "workflow_id": "wf_01J...",
        "experience_id": "exp_01J...",
        "expected_revision": 7,
        "observation": {
          "kind": "environment_fact",
          "path": "environment.package_manager.version",
          "value": "<collect value>",
          "source": "command_output",
          "evidence_artifact_id": "<attach or reference artifact>"
        }
      }
    },
    "alternative_next_requests": [],
    "stop_conditions": [],
    "human_approval": {
      "required": false
    }
  }
}
```

## 8.3 Guidance rules

1. The recommended request SHALL be valid against the advertised input schema.
2. The recommendation SHALL include a reason.
3. The template SHALL never fabricate an unknown value.
4. Unknown values SHALL use explicit placeholders such as `<collect value>`.
5. The guidance engine SHALL prefer evidence collection over speculative diagnosis.
6. A recommendation SHALL NOT instruct the agent to execute a dangerous external action through an unrelated tool.
7. Destructive, privileged, externally visible, or privacy-sensitive actions SHALL set `human_approval.required` to `true`.
8. The server MAY present alternatives when multiple safe paths exist.
9. The agent MAY choose an allowed alternative.
10. If the agent chooses an unsuitable but permitted action, the next response SHALL explain the resulting uncertainty.
11. If the request is invalid for the state, the response SHALL return a recoverable error with a corrected next-request template.
12. Guidance text SHALL be treated as server data by the host. Authorization SHALL remain enforced outside the model.

## 8.4 Guided workflow phases

```text
DISCOVER
  -> SEARCH
  -> OPEN OR START
  -> BASELINE
  -> DIAGNOSE
  -> PLAN
  -> ATTEMPT
  -> OBSERVE
  -> VALIDATE
  -> FINALIZE
  -> CONSOLIDATE
  -> REUSE_FEEDBACK
```

### Discover

Agent identifies server capabilities and workflow profile.

### Search

Agent searches before making high-cost or irreversible attempts.

### Open or start

Agent either reuses an existing applicable episode or creates a new one.

### Baseline

Agent records the goal, current failure, environment, and reproduction status.

### Diagnose

Agent records hypotheses and evidence rather than asserting a root cause.

### Plan

Agent selects a prior lesson or proposes a new candidate strategy.

### Attempt

Agent records the intended action before execution when feasible.

### Observe

Agent records actual output, exit status, artifact changes, and unexpected effects.

### Validate

Agent runs explicit checks tied to acceptance criteria.

### Finalize

Agent summarizes evidence-backed outcome and applicability.

### Consolidate

System proposes deduplication or generalization asynchronously.

### Reuse feedback

Later agents report whether retrieval was helpful and applicable.

## 8.5 Maximum-turn protection

A workflow profile SHALL define:

- maximum diagnostic turns before summarization;
- maximum repeated identical attempts;
- budget thresholds for tokens, wall time, and tool calls;
- escalation rules;
- conditions for requesting human input;
- conditions for stopping without a verified solution.

---

# 9. MCP Interface Specification

## 9.1 Tool naming

Tools use namespaced names in documentation. Implementations MAY map dots to a client-compatible naming convention.

## 9.2 Common request fields

All mutating tools SHALL accept:

```json
{
  "workflow_id": "wf_...",
  "experience_id": "exp_...",
  "expected_revision": 3,
  "idempotency_key": "client-generated-unique-key",
  "client_context": {
    "agent_id": "agent-identifier",
    "agent_version": "version",
    "model_id": "optional-model-identifier",
    "repository_scope_id": "repo_...",
    "trace_id": "optional-trace-id"
  }
}
```

## 9.3 Common response fields

```json
{
  "request_id": "req_...",
  "server_time": "2026-09-17T08:00:00Z",
  "revision": 4,
  "result": {},
  "guidance": {},
  "provenance": {
    "server_version": "1.0.0",
    "schema_version": "1.0",
    "policy_version": "2026-09-01"
  }
}
```

## 9.4 Discovery tools

### `workflow.discover`

Returns server capabilities, supported schema versions, workflow profiles, evidence limits, taxonomy vocabularies, and authentication scope.

### `workflow.start`

Creates a durable workflow before an experience exists.

Required inputs:

- high-level goal;
- intended scope;
- workflow profile;
- repository scope, if available.

### `workflow.status`

Returns current state, missing requirements, recent transitions, and next recommendation.

### `workflow.abandon`

Closes an incomplete workflow with a reason. Captured evidence is retained according to policy.

## 9.5 Retrieval tools

### `experience.search`

Inputs:

- natural-language problem statement;
- failure signatures;
- environment fingerprint;
- attempted strategies;
- scope constraints;
- desired result count;
- inclusion policy for unverified or negative experience.

Outputs:

- ranked results;
- applicability score and reasons;
- environmental matches and mismatches;
- validation tier;
- known failed attempts;
- contradiction flags;
- recommended next diagnostic request.

### `experience.get`

Returns a bounded projection of one experience. Sensitive artifact bodies are omitted unless explicitly authorized.

### `lesson.search`

Searches consolidated lessons rather than raw episodes.

### `lesson.get`

Returns lesson claims, supporting episodes, counterexamples, scope, and revision history.

### `experience.compare`

Compares the current environment and failure with one or more candidate experiences.

## 9.6 Capture tools

### `experience.begin`

Creates an episode.

Required inputs:

- goal;
- initial symptom or task;
- repository scope;
- known environment subset;
- data handling classification.

### `experience.record_observation`

Records a structured observation and optional evidence reference.

Observation kinds:

- failure output;
- command output;
- test result;
- environment fact;
- file state;
- dependency graph fact;
- user feedback;
- performance measurement;
- security measurement;
- external service result;
- agent reflection.

### `experience.record_attempt`

Records intended or completed action, rationale, risk classification, and prior knowledge used.

### `experience.complete_attempt`

Adds outcome, affected artifacts, side effects, duration, and observed status.

### `experience.propose_hypothesis`

Adds a root-cause hypothesis with supporting and conflicting evidence references.

### `experience.update_hypothesis`

Refines, supersedes, supports, or rejects a hypothesis without deleting history.

### `experience.propose_solution`

Adds a candidate solution and its expected mechanism, prerequisites, rollback, and validation plan.

### `artifact.attach`

Creates or completes an artifact upload and returns a content-addressed identifier.

### `artifact.describe`

Returns metadata, redaction status, content hash, and authorized access modes.

## 9.7 Validation tools

### `validation.plan`

Defines checks required to validate a solution.

Each check includes:

- criterion;
- test type;
- expected result;
- relationship to the original failure;
- regression coverage;
- execution authority;
- timeout;
- evidence requirement.

### `validation.record_run`

Records one validation execution.

### `validation.assess`

Computes whether evidence satisfies the plan. It does not execute the plan.

### `validation.revalidate`

Creates a new revalidation workflow for an existing experience or lesson.

### `experience.mark_regression`

Records that a previously verified solution failed or caused a regression.

## 9.8 Finalization and feedback tools

### `experience.finalize`

Attempts transition to a terminal or review state.

Possible outcomes:

- finalized verified;
- finalized partially verified;
- finalized unresolved;
- needs more evidence;
- needs human review;
- rejected as duplicate.

### `experience.record_reuse_feedback`

Records whether retrieved experience was applicable, useful, misleading, or harmful.

### `experience.propose_merge`

Proposes duplicate linkage or merge.

### `lesson.propose`

Proposes a generalized lesson from selected episodes.

### `lesson.review`

Human or authorized evaluator approves, rejects, or edits a lesson.

### `experience.invalidate`

Marks an episode invalid while preserving history and references.

## 9.9 MCP resources

Recommended resource URI patterns:

```text
experience://episodes/{experience_id}
experience://episodes/{experience_id}/timeline
experience://episodes/{experience_id}/evidence
experience://lessons/{lesson_id}
experience://taxonomies/{taxonomy_name}
experience://workflows/{workflow_id}
experience://policies/current
```

## 9.10 MCP prompts or skills

When supported, EMMS SHOULD expose reusable workflows:

- `debug-with-experience-memory`;
- `capture-validated-fix`;
- `review-conflicting-lessons`;
- `revalidate-stale-solution`;
- `sanitize-and-publish-experience`.

---

# 10. Experience Lifecycle and State Machines

## 10.1 Episode states

```text
DRAFT
  -> OBSERVED
  -> DIAGNOSING
  -> SOLUTION_PROPOSED
  -> VALIDATING
  -> LOCALLY_VERIFIED
  -> REPRODUCED
  -> CROSS_PROJECT_VERIFIED

Any active state may transition to:
  -> UNRESOLVED
  -> PARTIALLY_VERIFIED
  -> NEEDS_REVIEW
  -> CONTRADICTED
  -> INVALIDATED
  -> DEPRECATED
  -> SUPERSEDED
```

## 10.2 State requirements

### DRAFT

Goal and scope exist.

### OBSERVED

At least one failure or task observation is stored with provenance.

### DIAGNOSING

At least one hypothesis or diagnostic action exists.

### SOLUTION_PROPOSED

Solution contains mechanism, prerequisites, risk, and validation plan.

### VALIDATING

At least one validation run has begun or been recorded.

### LOCALLY_VERIFIED

The original failure criterion passes in the same repository and environment family, and required regression checks pass.

### REPRODUCED

An independent clean reproduction confirms both pre-fix failure and post-fix success.

### CROSS_PROJECT_VERIFIED

The strategy succeeds in multiple independent scopes with compatible applicability.

## 10.3 Attempt states

```text
PROPOSED -> APPROVED -> EXECUTED -> OBSERVED -> CLASSIFIED
                      -> CANCELLED
                      -> BLOCKED
```

Classification values:

- successful;
- partially successful;
- ineffective;
- harmful;
- inconclusive;
- not applicable.

## 10.4 Immutable history

State changes SHALL be append-only events. Current projections MAY be updated transactionally, but prior claims and states SHALL remain auditable.

---

# 11. Domain Model and Data Schema

## 11.1 Principal entities

- Tenant
- Actor
- Agent
- RepositoryScope
- Workflow
- ExperienceEpisode
- Goal
- Observation
- FailureSignature
- EnvironmentSnapshot
- TechnologyComponent
- Attempt
- Hypothesis
- Solution
- ValidationPlan
- ValidationRun
- EvidenceArtifact
- Lesson
- ApplicabilityRule
- Contradiction
- ReuseFeedback
- PolicyDecision
- AuditEvent

## 11.2 Canonical experience document

```json
{
  "experience_id": "exp_01J...",
  "schema_version": "1.0",
  "tenant_id": "tenant_...",
  "scope": {
    "visibility": "repository",
    "repository_scope_id": "repo_...",
    "organization_scope_id": "org_..."
  },
  "goal": {
    "summary": "Restore reproducible dependency installation",
    "acceptance_criteria": [
      "Clean install exits with code 0",
      "Unit tests pass",
      "Production build passes"
    ]
  },
  "problem": {
    "summary": "Dependency resolver rejects incompatible peer ranges",
    "failure_signatures": [
      {
        "kind": "package_manager_error",
        "exact_tokens": ["ERESOLVE"],
        "normalized_hash": "sha256:...",
        "exit_code": 1
      }
    ]
  },
  "environment_snapshot_id": "env_...",
  "timeline": [],
  "hypotheses": [],
  "attempts": [],
  "solutions": [],
  "validation": {},
  "applicability": {},
  "quality": {
    "state": "locally_verified",
    "confidence": 0.91,
    "evidence_strength": 0.88
  },
  "provenance": {},
  "created_at": "2026-09-17T08:00:00Z",
  "last_verified_at": "2026-09-17T08:40:00Z"
}
```

## 11.3 Relational requirements

The relational schema SHALL:

- use stable opaque identifiers;
- enforce tenant ownership on every primary domain row;
- version mutable logical entities;
- retain event history;
- store normalized key fields relationally;
- permit flexible extension through controlled JSONB fields;
- store embeddings separately by model and version;
- support soft deletion and legal deletion workflows;
- distinguish claim text from evidence references.

## 11.4 Evidence artifact metadata

```json
{
  "artifact_id": "art_...",
  "kind": "test_report",
  "media_type": "application/json",
  "content_hash": "sha256:...",
  "byte_size": 18420,
  "storage_uri": "internal-object-reference",
  "redaction": {
    "status": "completed",
    "ruleset_version": "2026-09-01",
    "findings": 3
  },
  "trust": {
    "classification": "untrusted_data",
    "producer": "local_test_runner",
    "attested": false
  },
  "retention_class": "repository_standard"
}
```

## 11.5 Provenance

Every observation and claim SHALL record:

- actor type;
- actor identifier;
- timestamp;
- source type;
- source artifact;
- trace and request IDs;
- whether content was directly observed, inferred, or summarized;
- transformation history;
- redaction status;
- signature or attestation when available.

---

# 12. Environment Fingerprinting and Taxonomy

## 12.1 Required dimensions

The environment model SHOULD support:

- operating system, distribution, and kernel;
- CPU architecture;
- container runtime and version;
- container base image digest;
- programming languages and versions;
- runtimes and versions;
- frameworks and versions;
- libraries and versions;
- package managers and versions;
- lockfile type and hash;
- compiler and linker versions;
- build system;
- test framework;
- database type and version;
- infrastructure-as-code tool;
- cloud and CI provider;
- shell;
- locale and timezone when relevant;
- environment variables by allowed name and hashed or redacted value;
- relevant feature flags;
- Git commit and dirty state;
- repository fingerprint;
- hardware accelerator when relevant.

## 12.2 Data collection levels

### Minimal

Language, runtime, operating system, repository scope, and exact failure signature.

### Standard

Adds framework, package manager, dependency manifests, lockfile hash, container, and CI data.

### Forensic

Adds sanitized dependency graph, selected configuration, build trace, resource state, and attestations.

## 12.3 Version representation

Versions SHALL preserve:

- original reported string;
- normalized semantic version when possible;
- ecosystem-specific comparison semantics;
- prerelease and build metadata;
- source of the version value;
- confidence in normalization.

## 12.4 Applicability rules

Rules support:

- exact version;
- inclusive or exclusive range;
- compatible major or minor range;
- operating-system family;
- architecture;
- required and prohibited features;
- repository-only constraints;
- dependency relationship predicates;
- unknown-tolerant and unknown-rejecting policies.

## 12.5 Taxonomy governance

Taxonomies SHALL be versioned. Unknown components SHALL be accepted as provisional identifiers and later normalized. Aliases, package ecosystems, renamed products, forks, and end-of-life status SHALL be represented without rewriting historical observations.

---

# 13. Capture and Evidence Pipeline

## 13.1 Capture sequence

1. Start workflow.
2. Search existing experience.
3. Begin episode if no sufficient match exists or if recording a new outcome.
4. Capture baseline and reproduction.
5. Attach raw evidence.
6. Record attempts before or immediately after execution.
7. Record observed outcome separately from intended outcome.
8. Propose hypotheses with evidence links.
9. Propose solution and validation plan.
10. Record validation runs.
11. Assess and finalize.

## 13.2 Separation of concerns

The system SHALL keep these distinct:

- **action intent:** what the agent planned;
- **action fact:** what was actually invoked;
- **observation:** what the environment returned;
- **interpretation:** what the agent thinks it means;
- **claim:** a structured proposition;
- **evidence:** immutable support or contradiction;
- **decision:** why a state transition occurred.

## 13.3 Failure normalization

Normalization MAY include:

- line-ending normalization;
- removal of timestamps and volatile IDs;
- replacement of absolute user paths with placeholders;
- stack-frame extraction;
- error-code extraction;
- preservation of exact rare tokens;
- structural hashing;
- language-specific exception parsing;
- command and exit-code association.

Both raw redacted content and normalized representation SHOULD be retained.

## 13.4 Redaction before persistence

Artifact content SHALL pass through:

1. size and type validation;
2. decompression safeguards;
3. malware or content-policy scanning where configured;
4. secret detection;
5. PII and private-path redaction;
6. tenant-specific pattern rules;
7. structured parser redaction;
8. final content hash and storage.

## 13.5 Evidence quality ranking

From strongest to weakest:

1. cryptographically attested independent reproduction;
2. clean-room pre-fix and post-fix execution;
3. deterministic automated test with logs;
4. build or command exit status with relevant output;
5. static analysis or dependency graph evidence;
6. human review;
7. agent-generated interpretation;
8. unsupported agent assertion.

Unsupported assertion SHALL never independently produce verified status.

---

# 14. Retrieval, Ranking, and Context Assembly

## 14.1 Query understanding

The retrieval service SHALL extract:

- task intent;
- exact error tokens;
- normalized signatures;
- technologies and versions;
- affected subsystem;
- repository scope;
- attempts already performed;
- desired risk level;
- current workflow phase.

## 14.2 Candidate generation arms

Candidates SHALL be gathered from multiple independent arms:

1. exact failure-signature lookup;
2. normalized signature lookup;
3. full-text search;
4. semantic vector search;
5. technology and version filter search;
6. repository and organization scope search;
7. graph-neighborhood search, when enabled;
8. known-attempt match;
9. lesson search;
10. counterexample search.

## 14.3 Hard filters

Default hard filters:

- tenant visibility;
- legal and retention state;
- authorization scope;
- invalidated-content exclusion;
- explicit platform exclusion;
- incompatible required technology;
- prohibited data classification.

## 14.4 Ranking model

Reference scoring formula:

```text
score =
    0.24 * semantic_similarity
  + 0.20 * failure_signature_similarity
  + 0.15 * environment_compatibility
  + 0.10 * version_compatibility
  + 0.10 * validation_strength
  + 0.06 * repository_proximity
  + 0.05 * exact_token_score
  + 0.04 * reuse_success_rate
  + 0.03 * recency
  + 0.03 * evidence_completeness
  - incompatibility_penalty
  - contradiction_penalty
  - staleness_penalty
  - suspected_poisoning_penalty
```

Weights SHALL be configurable and evaluation-driven.

## 14.5 Confidence is not ranking

The server SHALL expose separately:

- retrieval relevance;
- applicability confidence;
- solution validation confidence;
- evidence strength;
- result freshness;
- policy trust.

A single opaque score SHALL NOT replace these dimensions.

## 14.6 Returned result format

```json
{
  "experience_id": "exp_...",
  "summary": "Align peer dependency versions instead of bypassing checks",
  "relevance": 0.89,
  "applicability": {
    "score": 0.82,
    "matches": ["npm 10", "Linux", "same exact error code"],
    "mismatches": ["Prior episode used Node.js 22; current uses 20"],
    "unknowns": ["Current framework patch version"],
    "hard_exclusions": []
  },
  "validation": {
    "tier": "locally_verified",
    "last_verified_at": "2026-08-04T10:00:00Z"
  },
  "known_bad_attempts": [
    {
      "strategy": "Disable peer dependency checks",
      "outcome": "Installed but failed runtime tests"
    }
  ],
  "recommended_use": "diagnostic_reference",
  "citations": ["experience://episodes/exp_..."]
}
```

## 14.7 Context budget

The server SHOULD return concise cards first. The agent can request expanded timelines or artifacts. Default responses SHALL avoid flooding the model context with raw logs.

## 14.8 Retrieval feedback loop

For every presented result, EMMS SHOULD capture:

- selected or ignored;
- applicable or not applicable;
- changed agent plan or not;
- contributed to success or failure;
- misleading or harmful;
- time saved estimate;
- final outcome.

---

# 15. Consolidation and Knowledge Evolution

## 15.1 Purpose

Consolidation transforms repeated episodes into durable lessons without erasing episode-level nuance.

## 15.2 Pipeline

1. Candidate clustering.
2. Duplicate detection.
3. Environment and outcome comparison.
4. Claim extraction.
5. Supporting and contradicting evidence linking.
6. Applicability-envelope proposal.
7. Confidence calculation.
8. human or automated review according to policy.
9. lesson publication.
10. ongoing reuse measurement and revalidation.

## 15.3 Lesson schema

A lesson SHALL contain:

- concise rule;
- problem pattern;
- diagnostic procedure;
- recommended strategy;
- prohibited or ineffective strategies;
- mechanism explanation;
- prerequisites;
- applicability envelope;
- exclusions;
- validation recipe;
- rollback guidance;
- supporting episodes;
- counterexamples;
- confidence dimensions;
- revision history;
- owner or curator;
- last verified date.

## 15.4 Promotion thresholds

Reference policy:

- one locally verified episode: candidate lesson only;
- two independent verified episodes: provisional lesson;
- three independent scopes or one reproduced benchmark: verified lesson;
- repeated success across project families: broadly verified lesson;
- any credible counterexample: narrow scope or mark contested.

Thresholds SHALL vary by risk class.

## 15.5 No destructive merging

Merged episodes remain individually addressable. Canonical records point to members and preserve provenance.

---

# 16. Validation, Revalidation, and Contradiction Handling

## 16.1 Validation principles

Validation SHALL be tied to the original acceptance criteria. A successful command is insufficient if the original user goal remains unmet.

## 16.2 Minimum local verification

Local verification normally requires:

- reproduction of the initial failure or credible baseline evidence;
- application of the recorded solution;
- successful check for the original failure;
- appropriate regression tests;
- no unresolved critical side effect;
- artifacts proving the result.

## 16.3 Validation types

- unit test;
- integration test;
- end-to-end test;
- build;
- lint or static analysis;
- type checking;
- dependency resolution;
- migration dry run;
- security scan;
- performance benchmark;
- infrastructure plan or policy check;
- manual acceptance with named reviewer.

## 16.4 Revalidation triggers

- dependency major-version change;
- runtime or framework change;
- base-image change;
- age threshold reached;
- negative reuse feedback;
- newly linked counterexample;
- security advisory;
- changed validation recipe;
- lesson promoted to broader scope.

## 16.5 Contradictions

A contradiction object SHALL identify:

- claims in conflict;
- environments involved;
- evidence strength on each side;
- whether conflict is real or caused by differing applicability;
- provisional resolution;
- required experiment to resolve uncertainty.

## 16.6 Regression behavior

A confirmed regression SHALL:

1. immediately reduce recommendation priority;
2. add a visible warning;
3. link the failing episode;
4. narrow applicability if a boundary is found;
5. transition the previous claim to contradicted or superseded when appropriate;
6. trigger revalidation of affected lessons.

---

# 17. Security, Privacy, and Trust

## 17.1 Threat model

EMMS handles powerful and potentially hostile inputs:

- tool outputs containing prompt injection;
- poisoned stored memories;
- malicious tool metadata;
- secrets in logs or patches;
- path traversal in artifact references;
- cross-tenant retrieval;
- confused-deputy authorization;
- replayed mutating requests;
- false validation evidence;
- supply-chain compromise;
- excessive agent permissions;
- denial of service through large artifacts or expensive search.

<Organization>OWASP</Organization> identifies tool poisoning, cross-server manipulation, confused-deputy behavior, excessive permissions, replay, supply-chain compromise, data exfiltration, and sandbox escape among central MCP risks. Official MCP security guidance also treats authorization and proxy consent as explicit design concerns. citeturn2search49turn2search50turn2search53

## 17.2 Trust labels

All content SHALL be marked as one of:

- trusted policy;
- trusted server-generated metadata;
- authenticated human statement;
- authenticated tool evidence;
- untrusted external data;
- untrusted agent-generated content;
- sanitized derived content.

Retrieved experience content SHALL never be labeled as a system instruction.

## 17.3 Prompt-injection defenses

- constrain tool responses to strict schemas;
- isolate narrative content from actionable fields;
- never embed hidden instructions in descriptions;
- sanitize and label external content;
- require host-side approval for sensitive actions;
- use allowlisted tool transitions;
- prevent retrieved content from expanding authorization;
- detect instruction-like strings in artifacts and flag them;
- avoid sending raw secrets or full artifacts to the language model;
- record which retrieved text influenced a decision.

## 17.4 Secret handling

The server SHALL detect and redact:

- API keys;
- access tokens;
- private keys;
- passwords;
- connection strings;
- confidential environment-variable values;
- personal data patterns;
- internal hostnames according to policy;
- user home-directory paths when not needed.

Raw pre-redaction content SHOULD NOT be persisted. A hardened deployment MAY quarantine encrypted originals under separate authorization and retention.

## 17.5 Artifact security

- content-addressed storage;
- malware scanning where appropriate;
- media-type validation;
- decompression limits;
- signed access URLs with short expiry;
- tenant-prefixed object keys;
- encryption in transit and at rest;
- hash validation on read;
- immutable versions;
- object-lock option for regulated audit evidence.

## 17.6 Integrity

Mutating operations SHALL use idempotency keys and optimistic concurrency. High-assurance deployments SHOULD sign evidence manifests and preserve append-only audit trails.

## 17.7 Supply chain

Server releases SHOULD provide:

- signed container images;
- software bill of materials;
- pinned dependencies;
- reproducible builds where practical;
- vulnerability scanning;
- provenance attestations;
- minimal runtime image;
- non-root execution.

---

# 18. Authorization, Tenancy, and Governance

## 18.1 Identity dimensions

Authorization decisions MAY depend on:

- user;
- agent;
- client application;
- tenant;
- organization;
- repository;
- workflow;
- action;
- data classification;
- artifact kind;
- publication scope.

## 18.2 Scopes

Reference scopes:

```text
experience:search
experience:read
experience:write
experience:validate
experience:invalidate
lesson:propose
lesson:review
artifact:write
artifact:read
admin:taxonomy
admin:policy
admin:audit
```

## 18.3 Visibility levels

- session;
- workflow;
- repository;
- project group;
- organization;
- private tenant-wide;
- sanitized community;
- public.

Scope widening SHALL be explicit and audited.

## 18.4 Tenant isolation

Remote deployments SHALL enforce tenant isolation at:

- authentication;
- application authorization;
- database row-level policy or equivalent;
- cache keys;
- vector search filters;
- object storage paths;
- telemetry redaction;
- backups and exports.

## 18.5 Human review triggers

Required for:

- publication beyond organization scope;
- overriding contradiction warnings;
- marking a high-risk fix broadly verified;
- restoring invalidated memory;
- accessing quarantined artifacts;
- deleting regulated evidence;
- changing retention or redaction policy.

---

# 19. Storage and Infrastructure

## 19.1 MVP storage choice

Use <Product>PostgreSQL</Product> with <Project>pgvector</Project> and compatible object storage.

Reasons:

- relational constraints and transactions;
- JSONB for extensible metadata;
- full-text search;
- exact filtering;
- vector search;
- joins and provenance queries;
- point-in-time recovery;
- mature backup and operations ecosystem.

<Project>pgvector</Project> supports exact and approximate nearest-neighbor search, several distance measures, multiple vector representations, and standard PostgreSQL operational properties. citeturn2search64

## 19.2 Suggested database modules

- identity and tenancy;
- workflow and event store;
- episode projection;
- evidence metadata;
- taxonomy;
- embeddings;
- retrieval features;
- lessons and contradictions;
- feedback;
- audit.

## 19.3 Embedding storage

Each embedding row SHALL include:

- source entity and field;
- embedding model;
- model version;
- dimensions;
- normalization method;
- input content hash;
- creation time;
- redaction policy version;
- tenant and scope.

Model upgrades SHALL create new embeddings without overwriting old ones until migration completes.

## 19.4 Object storage

Store large:

- logs;
- diffs;
- traces;
- test reports;
- dependency graphs;
- build manifests;
- attestations.

Small normalized excerpts MAY be stored in PostgreSQL for retrieval.

## 19.5 Event model

An append-only event stream SHOULD drive projections. Events include:

- workflow started;
- episode begun;
- observation recorded;
- attempt proposed or completed;
- hypothesis changed;
- solution proposed;
- validation recorded;
- state transitioned;
- lesson proposed or reviewed;
- feedback recorded;
- artifact redacted;
- policy decision made.

---

# 20. Observability and Auditability

## 20.1 Telemetry

EMMS SHALL emit:

- distributed traces;
- structured logs;
- metrics;
- immutable audit events;
- retrieval decision explanations.

## 20.2 Trace hierarchy

```text
workflow request
  -> authorization
  -> schema validation
  -> database command
  -> candidate retrieval
      -> exact search
      -> full-text search
      -> vector search
      -> compatibility filtering
      -> reranking
  -> guidance calculation
  -> response
```

## 20.3 Recommended metrics

- request latency by tool;
- error rate;
- guidance-follow rate;
- workflow completion rate;
- average turns to verification;
- retrieval precision and recall on evaluation sets;
- successful reuse rate;
- harmful recommendation rate;
- stale-result exposure rate;
- redaction findings;
- cross-tenant access denials;
- artifact processing latency;
- consolidation queue depth;
- token and embedding cost;
- validation tier distribution.

## 20.4 OpenTelemetry alignment

Use <Project>OpenTelemetry</Project> conventions where stable and record the convention version. The GenAI conventions project covers spans, metrics, and events for model clients, agents, vector retrieval, tool execution, and MCP-oriented telemetry, but implementations should account for evolving stability levels. citeturn2search55turn2search57turn2search60

## 20.5 Audit requirements

Audit records SHALL include:

- actor;
- authorization decision;
- operation;
- target;
- before and after revision identifiers;
- timestamp;
- request and trace identifiers;
- policy version;
- result;
- reason for privileged actions.

Sensitive content SHALL not be copied into audit logs.

---

# 21. Reliability, Performance, and Scalability

## 21.1 Availability targets

Reference targets:

- local profile: best effort;
- team profile: 99.5 percent monthly availability;
- managed production: 99.9 percent or higher;
- search P95 under 1.5 seconds at target corpus size;
- ordinary mutation P95 under 500 milliseconds excluding artifact upload;
- durable acknowledgement only after transaction commit.

## 21.2 Consistency

- episode mutations require optimistic concurrency;
- artifact metadata and domain reference updates use transactional outbox patterns;
- search indexes may be eventually consistent;
- exact episode reads shall be read-after-write consistent;
- guidance SHALL be computed from the committed revision.

## 21.3 Idempotency

Duplicate requests with the same actor, tool, and idempotency key SHALL return the original result unless the retention window has expired.

## 21.4 Scaling strategy

1. vertical PostgreSQL scaling;
2. read replicas for administration and analytics;
3. partitioning by tenant and time;
4. asynchronous embedding and consolidation;
5. retrieval caches keyed by scope and environment hash;
6. dedicated retrieval workers;
7. optional specialized vector or graph backends behind stable interfaces;
8. regional data residency.

## 21.5 Backpressure

The server SHALL reject or defer:

- excessive artifact size;
- too many concurrent workflow writes;
- unbounded search result counts;
- expensive full-corpus exports;
- repeated identical failed calls.

Responses SHALL include a safe retry recommendation.

---

# 22. Agent Integration Contract

## 22.1 Required agent behavior

A conforming agent SHOULD:

1. call `workflow.discover` on first use or cache the result per TTL;
2. search before performing a costly debugging attempt;
3. supply known environmental context without inventing missing values;
4. follow or explicitly decline the recommended next request;
5. record attempts and observations separately;
6. preserve exact exit codes and key error tokens;
7. attach evidence rather than merely summarize it;
8. treat retrieved experience as untrusted advisory data;
9. request human approval for flagged actions;
10. finalize unresolved workflows honestly;
11. provide reuse feedback after applying prior experience.

## 22.2 Declining guidance

An agent MAY include:

```json
{
  "guidance_decision": {
    "recommended_request_id": "rec_...",
    "decision": "declined",
    "reason_code": "ALREADY_KNOWN",
    "explanation": "The value is available from an existing signed manifest"
  }
}
```

The server then recalculates the path.

## 22.3 Forbidden agent behavior

A conforming agent SHALL NOT:

- mark its own unsupported statement as verified evidence;
- send raw credentials intentionally;
- promote visibility without authorization;
- treat similarity as proof of applicability;
- conceal a failed validation run;
- rewrite historical outcomes;
- automatically execute a dangerous recommendation solely because it came from memory.

## 22.4 Host responsibilities

The host SHALL remain responsible for:

- user consent;
- tool authorization;
- sandboxing;
- external command execution;
- protecting other connected servers;
- deciding what tool outputs enter the model context.

---

# 23. Administration and Human Review

## 23.1 Administrative capabilities

- browse workflows and episodes;
- filter by status, technology, repository, and age;
- inspect provenance and evidence metadata;
- compare conflicting claims;
- approve or reject lessons;
- merge duplicates non-destructively;
- reclassify visibility;
- configure retention and redaction;
- export or delete subject data;
- trigger re-embedding or revalidation;
- quarantine suspicious content;
- view audit trails.

## 23.2 Review queue priorities

1. suspected harmful guidance;
2. cross-tenant or publication request;
3. high-risk broadly scoped lesson;
4. contradiction affecting heavily reused content;
5. stale but frequently retrieved lesson;
6. duplicate and taxonomy cleanup.

## 23.3 Explainability view

For every retrieval, an administrator SHOULD be able to see:

- candidate-generation arms;
- hard filters;
- component scores;
- penalties;
- result order;
- returned excerpts;
- subsequent agent selection;
- final outcome.

---

# 24. Evaluation Framework

## 24.1 Core research question

Does structured evidence-backed experience memory improve coding-agent performance without increasing harmful or incorrect actions?

## 24.2 Experimental conditions

Compare:

1. agent without persistent memory;
2. agent with transcript search;
3. agent with vector-only RAG;
4. agent with structured EMMS retrieval;
5. EMMS without negative attempts;
6. EMMS without environment compatibility;
7. EMMS without guided next requests;
8. full EMMS.

## 24.3 Dataset

Build 30 to 100 reproducible tasks for MVP evaluation, then scale to thousands. Include:

- repeat instances;
- near matches with important environmental differences;
- misleading semantic matches;
- obsolete solutions;
- poisoned or low-quality memories;
- conflicting episodes;
- completely novel failures;
- security-sensitive cases.

## 24.4 Primary metrics

- task success rate;
- verified success rate;
- time to solution;
- tool calls to solution;
- model tokens;
- repeated bad-attempt rate;
- retrieval precision at K;
- applicable-result recall;
- harmful recommendation rate;
- false verification rate;
- regression rate;
- user intervention rate.

## 24.5 Guidance-specific metrics

- recommendation acceptance rate;
- correct next-step rate;
- average workflow turns;
- percentage of missing required fields resolved;
- state-transition error rate;
- abandonment rate;
- unnecessary-request rate;
- time spent collecting low-value data.

## 24.6 Quality gates

Before general availability:

- no known cross-tenant leak in security testing;
- false verification below defined risk threshold;
- measurable reduction in repeated failed attempts;
- statistically meaningful success improvement on held-out tasks;
- prompt-injection tests demonstrate no authorization expansion;
- recovery from malformed and repeated requests;
- complete audit coverage for privileged operations.

---

# 25. API Errors and Recovery Behavior

## 25.1 Error model

```json
{
  "error": {
    "code": "MISSING_REQUIRED_EVIDENCE",
    "message": "The validation run lacks a test report or exit status",
    "retryable": true,
    "details": {
      "missing": ["validation_run.exit_code"]
    }
  },
  "guidance": {
    "workflow_state": "validating",
    "recommended_next_request": {
      "tool": "validation.record_run",
      "reason": "Complete the existing run with objective result data",
      "arguments_template": {}
    }
  }
}
```

## 25.2 Error categories

- invalid request;
- unsupported schema version;
- authorization denied;
- scope violation;
- stale revision;
- idempotency conflict;
- invalid state transition;
- missing evidence;
- artifact rejected;
- policy quarantine;
- rate limited;
- temporary dependency failure;
- retrieval incomplete;
- internal error.

## 25.3 Recovery contract

Recoverable errors SHOULD include:

- what failed;
- whether retry is safe;
- missing or conflicting fields;
- current workflow revision;
- corrected recommended request;
- retry delay when applicable.

Internal details, secrets, and cross-tenant existence SHALL not be leaked.

---

# 26. Configuration and Deployment Profiles

## 26.1 Local developer profile

- stdio;
- single user;
- Docker Compose;
- local PostgreSQL and object storage;
- optional local embedding model;
- repository-only default scope;
- no public sharing;
- file-based backup option.

## 26.2 Team profile

- remote HTTP;
- organization identity provider;
- repository and team scopes;
- centralized PostgreSQL;
- object storage;
- review queue;
- audit export;
- high availability optional.

## 26.3 Enterprise profile

- regional deployment;
- strict data residency;
- customer-managed keys;
- private networking;
- SSO and fine-grained authorization;
- legal hold and retention rules;
- policy-as-code;
- signed evidence;
- security monitoring integration;
- isolated embedding service.

## 26.4 Community federation profile

- only sanitized and approved lessons;
- no raw private artifacts;
- provenance signatures;
- reputation and trust domains;
- moderation;
- revocation distribution;
- license metadata;
- opt-in publication.

---

# 27. Implementation Plan and Acceptance Criteria

## 27.1 Phase 0: Foundation

Deliver:

- canonical JSON schemas;
- threat model;
- workflow state machine;
- five golden end-to-end examples;
- evaluation harness design;
- architectural decision records.

Acceptance:

- all state transitions are machine-testable;
- guidance templates validate against tool schemas;
- security review approves MVP boundaries.

## 27.2 Phase 1: Local MVP

Tools:

- `workflow.discover`;
- `workflow.start`;
- `experience.search`;
- `experience.begin`;
- `experience.record_observation`;
- `experience.record_attempt`;
- `experience.complete_attempt`;
- `experience.propose_hypothesis`;
- `experience.propose_solution`;
- `validation.plan`;
- `validation.record_run`;
- `experience.finalize`.

Infrastructure:

- MCP stdio server;
- PostgreSQL plus pgvector;
- local object storage;
- deterministic redaction baseline;
- Docker Compose;
- structured logs.

Acceptance:

- one complete guided workflow works without manual database edits;
- server survives restart between any two requests;
- duplicate idempotent calls create no duplicate records;
- exact error search and semantic search both work;
- incompatible environments are visibly penalized;
- verified status requires objective evidence.

## 27.3 Phase 2: Team-ready service

Deliver:

- remote transport;
- authentication and tenant isolation;
- repository and organization visibility;
- admin review interface or API;
- audit log;
- reuse feedback;
- asynchronous workers;
- backup and restore.

Acceptance:

- tenant-isolation test suite passes;
- recovery-point and recovery-time objectives are demonstrated;
- all privileged actions create audit entries.

## 27.4 Phase 3: Consolidation

Deliver:

- duplicate clustering;
- lesson proposal;
- contradiction detection;
- stale-content jobs;
- revalidation workflows;
- curator review.

Acceptance:

- every lesson links supporting episodes and counterexamples;
- no source episode is deleted during merge;
- lesson scope narrows when a valid counterexample is introduced.

## 27.5 Phase 4: Production evaluation

Deliver:

- benchmark corpus;
- controlled A/B evaluation;
- retrieval diagnostics;
- safety red-team suite;
- cost and performance dashboards.

Acceptance:

- full EMMS outperforms vector-only baseline on verified task success;
- harmful recommendation rate stays within approved threshold;
- guidance reduces repeated failed attempts.

---

# 28. Reference Workflows

## 28.1 Workflow A: Known failure with strong match

1. Agent calls `workflow.start` with goal and scope.
2. Server recommends `experience.search`.
3. Agent supplies exact error and environment.
4. Server returns one locally verified match and asks for one missing runtime version.
5. Agent records the version.
6. Server compares environments and recommends using the prior diagnostic procedure.
7. Agent records the planned attempt.
8. Agent executes through its normal host tools.
9. Agent records outcome and artifacts.
10. Server recommends validation against original and regression criteria.
11. Agent records passing runs.
12. Server finalizes a new linked verified episode and records positive reuse feedback.

## 28.2 Workflow B: Retrieved solution is incompatible

1. Search finds a semantically strong Windows episode.
2. Current environment is Linux in a container.
3. Hard applicability analysis marks the solution `reference_only`.
4. Server recommends collecting container base-image and package-manager data.
5. Agent follows the diagnostic idea but does not execute the Windows-specific command.
6. A new platform-specific solution is discovered and validated.
7. Consolidation creates a common diagnostic lesson with two platform-specific branches.

## 28.3 Workflow C: Known bad attempt

1. Search returns a prior failed strategy with high environment match.
2. Response identifies the strategy as harmful because it suppressed installation checks but caused runtime failure.
3. Server recommends checking dependency ranges instead.
4. Agent avoids the bad attempt.
5. Reuse feedback records a prevented repeat failure.

## 28.4 Workflow D: Unresolved episode

1. Agent captures baseline and three attempts.
2. Budget limit is reached.
3. Server recommends one final evidence collection or human escalation.
4. Agent cannot obtain the evidence.
5. Episode finalizes as unresolved with useful negative knowledge.
6. Future agents can retrieve the failed attempts but receive no verified solution claim.

## 28.5 Workflow E: Contradiction

1. A previously validated solution fails after a framework upgrade.
2. Agent records regression and new environment.
3. Server lowers ranking and triggers revalidation.
4. Consolidation discovers that the lesson applies only below the new major version.
5. Lesson scope is narrowed and a new version-specific branch is proposed.

---

# 29. Risks and Mitigations

## 29.1 Memory poisoning

**Risk:** Malicious or incorrect content is retrieved repeatedly.  
**Mitigation:** trust labels, evidence tiers, quarantine, schema-constrained fields, provenance, feedback, contradiction detection, and human review.

## 29.2 Overfitting

**Risk:** Repository-specific fixes become universal advice.  
**Mitigation:** default narrow scope, independent verification thresholds, explicit applicability envelopes, and counterexamples.

## 29.3 False validation

**Risk:** A passing command does not prove the user goal.  
**Mitigation:** acceptance-criteria linkage, pre-fix baseline, regression checks, immutable evidence, and risk-adapted review.

## 29.4 Staleness

**Risk:** Old fixes remain highly ranked.  
**Mitigation:** last-verified timestamps, version-aware rules, staleness penalties, automated revalidation, and supersession.

## 29.5 Excessive context

**Risk:** Large memories reduce model performance and increase cost.  
**Mitigation:** card-first responses, progressive disclosure, context budgets, and structured excerpts.

## 29.6 Privacy leakage

**Risk:** Logs or code cross repository or tenant boundaries.  
**Mitigation:** redaction before persistence, visibility filters in every retrieval path, tenant-aware caches, authorization, and publication review.

## 29.7 Agent dependency on guidance

**Risk:** Agents blindly follow the server.  
**Mitigation:** expose reasons and alternatives, preserve host authorization, label uncertainty, and require approval for sensitive actions.

## 29.8 Evaluation gaming

**Risk:** Agents optimize easy validations rather than the real objective.  
**Mitigation:** independent acceptance criteria, held-out tests, regression suites, artifact review, and outcome-based metrics.

---

# 30. Evolution Strategy to the Maximum

This chapter defines an incremental path from a practical local MCP server to the maximum credible form of a global, continuously improving, evidence-backed experience network for software agents.

## 30.1 Stage 1: Personal local memory

**Capability**

- one developer;
- one local server;
- repository-scoped episodes;
- manual or semi-automatic evidence attachment;
- basic hybrid retrieval;
- guided next requests;
- local Docker deployment.

**Primary objective**

Prove that structured capture reduces repeated work without creating unacceptable friction.

**Maximum learning at this stage**

- developer preferences;
- repository commands;
- recurring local failures;
- environment-specific procedures;
- effective and ineffective debugging sequences.

**Exit criteria**

- measurable repeated-failure reduction;
- workflows survive multiple agent sessions;
- redaction is reliable enough for local use;
- retrieval visibly explains applicability.

## 30.2 Stage 2: Repository memory shared across agents

**Capability**

- multiple coding agents share one repository memory;
- agent and model provenance;
- Git-aware branch and commit context;
- CI integration;
- automatic capture hooks;
- validation from test and build artifacts;
- agent-specific feedback without agent lock-in.

**Primary objective**

Make memory portable across IDEs, models, and agent runtimes.

**New intelligence**

- comparison of strategies across agents;
- identification of model-specific failure patterns;
- automatic recognition of recurring repository states;
- recommended workflow based on repository conventions.

**Exit criteria**

- at least two independent agent clients interoperate;
- CI can validate or contradict local experience;
- repository memory improves held-out issue resolution.

## 30.3 Stage 3: Organization-wide operational knowledge

**Capability**

- tenant and team governance;
- organization identity;
- repository families;
- lesson review;
- centralized observability;
- cross-project retrieval with privacy controls;
- policy-as-code;
- enterprise audit and retention.

**Primary objective**

Convert fragmented engineering knowledge into governed organizational memory.

**New intelligence**

- recurring failure clusters across services;
- internal platform best practices derived from evidence;
- detection of systematically harmful workarounds;
- organization-specific compatibility graphs;
- migration playbooks learned across projects.

**Exit criteria**

- secure cross-project sharing;
- curator workflow scales;
- broad lessons retain traceable evidence;
- no critical tenant or repository boundary failures.

## 30.4 Stage 4: Autonomous consolidation and revalidation

**Capability**

- continuous clustering;
- automatic lesson proposals;
- contradiction experiments;
- scheduled clean-room reproductions;
- staleness prediction;
- dynamic applicability adjustment;
- benchmark-driven retrieval tuning.

**Primary objective**

Move from passive storage to active memory maintenance.

**New intelligence**

- causal hypotheses across many episodes;
- automatically generated version boundaries;
- confidence calibrated by observed reuse;
- early warning when an ecosystem update may invalidate a lesson;
- active selection of the most informative revalidation experiment.

**Safety boundary**

Autonomous revalidation SHALL run only in isolated environments with bounded permissions, cost, time, network access, and artifact output.

**Exit criteria**

- automated consolidation matches or exceeds curator quality on a reviewed sample;
- stale or contradicted guidance is quickly demoted;
- revalidation cost is justified by avoided failures.

## 30.5 Stage 5: Federated private knowledge network

**Capability**

- organizations exchange sanitized lessons without sharing raw episodes;
- signed provenance bundles;
- trust domains;
- selective disclosure;
- revocation and supersession feeds;
- local policy enforcement;
- privacy-preserving aggregate statistics.

**Primary objective**

Benefit from cross-organization experience while protecting code, identity, and infrastructure.

**New intelligence**

- broader compatibility data;
- earlier awareness of ecosystem regressions;
- cross-vendor verification;
- reputation based on reproducibility, not popularity.

**Possible techniques**

- signed lesson manifests;
- confidential-computing enclaves for sensitive validation;
- differential privacy for aggregate reuse statistics;
- zero-knowledge or selective-disclosure attestations for limited claims;
- content-addressed public evidence where licensing permits.

**Exit criteria**

- provenance and revocation are reliable;
- privacy review approves data exchange;
- external lessons improve outcomes without material leakage.

## 30.6 Stage 6: Global software experience graph

**Capability**

- ecosystem-scale technology, version, error, cause, and solution graph;
- public and private overlays;
- standardized experience interchange format;
- trusted publishers;
- automated ingestion from reproducible CI, issue trackers, package registries, and security advisories;
- real-time compatibility and regression signals.

**Primary objective**

Create an always-current operational map of how software actually behaves across environments.

**New intelligence**

- probabilistic causal paths from errors to likely causes;
- ecosystem-wide blast-radius prediction;
- automated migration planning;
- early detection of emerging failure patterns;
- solution selection optimized for risk, cost, and reversibility.

**Required governance**

- independent standards body or open governance;
- transparent schemas and scoring;
- reproducibility requirements;
- dispute and correction processes;
- licensing and attribution framework;
- anti-manipulation controls;
- public safety and security policy.

## 30.7 Stage 7: Proactive and preventive agent memory

**Capability**

The system no longer waits for a failure. It analyzes a planned change and retrieves likely failure modes before execution.

Examples:

- warns that a proposed dependency upgrade conflicts with prior validated environments;
- recommends a migration sequence learned from similar repositories;
- proposes tests that historically detected regressions;
- identifies an intended workaround as a known harmful pattern;
- predicts where documentation and real behavior diverge.

**Primary objective**

Turn debugging memory into preventive engineering intelligence.

**Decision contract**

The system SHALL present predictions, evidence, uncertainty, and reversibility. It SHALL NOT silently block or modify software without explicit policy authority.

## 30.8 Stage 8: Self-improving agent orchestration

**Capability**

- agents select specialized diagnostic subagents based on prior outcomes;
- workflows adapt to evidence value and cost;
- memory determines which tools and tests are most informative;
- successful procedures compile into portable agent skills;
- skill performance is continuously evaluated and rolled back when degraded;
- agents share procedural knowledge through controlled repositories.

**Primary objective**

Optimize not only the answer, but the entire problem-solving process.

**New intelligence**

- learned diagnostic policies;
- tool-selection strategies;
- adaptive stopping rules;
- controlled exploration versus exploitation;
- budget-aware experiment design;
- model routing based on historical performance by task class.

## 30.9 Stage 9: Maximum credible system

The maximum credible form is a **global, federated, continuously revalidated software experience fabric** with the following characteristics:

1. **Vendor-neutral:** Any authorized agent can contribute and query through open protocols.
2. **Evidence-native:** Claims are linked to machine-verifiable outcomes and attestations.
3. **Version-aware:** Applicability is computed over precise environment and dependency graphs.
4. **Causally structured:** The system distinguishes correlation, hypothesis, mechanism, and demonstrated cause.
5. **Self-maintaining:** It finds contradictions, schedules bounded experiments, narrows claims, and retires stale knowledge.
6. **Privacy-preserving:** Raw private context remains local while sanitized claims can be shared selectively.
7. **Reputation-aware:** Trust derives from reproducibility, provenance, correction behavior, and measured downstream utility.
8. **Preventive:** It predicts likely failures and validation needs before changes are executed.
9. **Agent-optimizing:** It improves tool choice, test selection, model routing, and workflow strategy.
10. **Human-governed:** High-impact publication, policy, and irreversible action remain accountable to people and institutions.

At this maximum, EMMS becomes more than memory for coding agents. It becomes an operational learning substrate for the software ecosystem. The system continuously converts execution traces into evidence, evidence into scoped experience, experience into lessons, lessons into preventive guidance, and new outcomes back into revised knowledge.

## 30.10 What must never be optimized away

Even at maximum evolution, the following invariants remain:

- authorization is enforced outside the language model;
- unsupported reflection is not evidence;
- negative results are not deleted merely because they are inconvenient;
- provenance survives consolidation;
- private data is not made public by inference;
- confidence is decomposed and explained;
- agents can decline guidance;
- humans can inspect, correct, invalidate, and appeal;
- the system reports uncertainty and stops when evidence is insufficient.

## 30.11 Recommended strategic sequence

```text
Local utility
  -> Multi-agent portability
  -> Team governance
  -> Autonomous maintenance
  -> Privacy-preserving federation
  -> Ecosystem experience graph
  -> Preventive engineering
  -> Self-improving orchestration
  -> Global evidence-backed experience fabric
```

The project SHOULD not jump directly to federation or autonomous execution. Its foundation must be trustworthy local episodes, rigorous evidence semantics, guided workflows, measurable reuse value, and robust security boundaries.

---

# 31. Appendices

## Appendix A: Minimum viable tool set

```text
workflow.discover
workflow.start
workflow.status
experience.search
experience.begin
experience.record_observation
experience.record_attempt
experience.complete_attempt
experience.propose_hypothesis
experience.propose_solution
validation.plan
validation.record_run
experience.finalize
experience.record_reuse_feedback
```

## Appendix B: Validation tier ordering

```text
UNSUPPORTED
OBSERVED
HYPOTHESIZED
PARTIALLY_VERIFIED
LOCALLY_VERIFIED
REPRODUCED
CROSS_PROJECT_VERIFIED
CONTESTED
INVALIDATED
DEPRECATED
SUPERSEDED
```

## Appendix C: Example recommended-next-request cycle

Request:

```json
{
  "tool": "experience.begin",
  "arguments": {
    "workflow_id": "wf_123",
    "goal": "Make the clean build pass",
    "problem_summary": "Build exits with ERESOLVE",
    "repository_scope_id": "repo_456",
    "idempotency_key": "agent-turn-18"
  }
}
```

Response excerpt:

```json
{
  "result": {
    "experience_id": "exp_789",
    "state": "observed"
  },
  "guidance": {
    "workflow_state": "baseline",
    "missing_information": [
      {
        "field": "failure.exact_output",
        "required": true
      },
      {
        "field": "environment.runtime.version",
        "required": true
      }
    ],
    "recommended_next_request": {
      "tool": "experience.record_observation",
      "reason": "Preserve the exact failure before attempting remediation",
      "arguments_template": {
        "workflow_id": "wf_123",
        "experience_id": "exp_789",
        "expected_revision": 1,
        "observation": {
          "kind": "failure_output",
          "exit_code": "<collect value>",
          "exact_error_excerpt": "<collect redacted value>",
          "evidence_artifact_id": "<attach artifact>"
        }
      }
    }
  }
}
```

## Appendix D: Suggested repository structure

```text
/apps
  /mcp-server
  /admin-ui
/services
  /episode
  /retrieval
  /evidence
  /validation
  /consolidation
/packages
  /schemas
  /taxonomy
  /policy
  /client-sdk
  /test-fixtures
/infrastructure
  /docker
  /kubernetes
  /migrations
/evaluation
  /benchmarks
  /red-team
/docs
  /architecture-decisions
  /protocol
  /operations
```

## Appendix E: Source and standards notes

- The <Organization>Model Context Protocol</Organization> is the interoperability layer. Its current specification uses JSON-RPC, self-contained requests, tools, resources, prompts, and optional extensions. citeturn2search43turn2search44
- The official MCP memory server demonstrates persistent graph-style memory but does not define the full evidence-backed debugging model in this specification. citeturn1search7turn1search9
- <Organization>Mem0</Organization> and <Product>OpenMemory</Product> demonstrate MCP-accessible and project-aware memory patterns for coding agents. citeturn1search14turn1search17
- <Organization>Letta</Organization> demonstrates persistent agents, searchable history, memory repositories, and learned skills. citeturn1search20turn1search23turn1search24
- <Project>Reflexion</Project> and <Project>ExpeL</Project> provide research precedents for verbal reflection, episodic retention, and abstraction from successful and failed experience. citeturn1search31turn1search37
- Security controls should be reviewed against official MCP security guidance and the <Organization>OWASP</Organization> MCP guidance as both protocol and attack patterns evolve. citeturn2search49turn2search50turn2search53

---

**End of specification**
