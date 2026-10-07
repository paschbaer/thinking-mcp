# Guidance Beads Execution Adapter Specification

**Document ID:** GBEA-SPEC-001  
**Version:** 0.2.0-draft  
**Status:** Draft for review  
**Language:** English  
**Normative keywords:** MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, MAY

## 1. Purpose

This specification defines the integration of Beads as an optional downstream work-execution backend for the Guidance MCP Server. It standardizes the adapter boundary, canonical data model, Spec-Kit handoff, work-graph projection, readiness filtering, work claiming, execution context delivery, progress reporting, blocker handling, evidence-gated completion, synchronization, drift detection, recovery, observability, and security controls.

The integration SHALL preserve the following invariant:

> Guidance owns governance decisions and canonical execution authorization. Beads owns projected operational work state.

## 2. Scope

### 2.1 In Scope

- A backend-neutral `WorkExecutionAdapter` port.
- A Beads implementation of that port.
- Projection of authorized Spec-Kit-derived work graphs.
- Stable correlation between Guidance and Beads identifiers.
- Ready-work discovery and Guidance-side filtering.
- Governed atomic claiming with Guidance-managed leases.
- Progress and blocker reporting.
- Two-phase, evidence-gated completion.
- Event normalization and reconciliation.
- Out-of-band mutation and semantic drift detection.
- Capability and version negotiation.
- Security, auditability, diagnostics, and operational recovery.

### 2.2 Out of Scope

- Replacing Spec-Kit as the specification source.
- Delegating policy evaluation to Beads.
- Using Beads as the canonical evidence repository.
- Allowing agents to expand authorized scope without an amendment.
- Requiring Beads for all Guidance executions.
- Defining the internal implementation of GitNexus, Insight, or ClearThought.
- Defining a user interface for Beads.

## 3. System Context

### 3.1 Components

- **Spec-Kit:** Produces specification, plan, task, model, contract, research, and quickstart artifacts.
- **Guidance Core:** Classifies intent, resolves policies, validates readiness, controls approvals, derives evidence requirements, and makes acceptance decisions.
- **Execution Backend Port:** Backend-neutral domain interface used by Guidance.
- **Beads Adapter:** Anti-corruption layer translating between Guidance semantics and Beads operations.
- **Beads Backend:** Persistent dependency-aware operational work graph.
- **Execution Agent:** Claims and executes governed work.
- **Evidence Store:** Stores or resolves immutable evidence artifacts and digests.
- **Other Downstream Servers:** GitNexus, Insight, and ClearThought, selected and governed by Guidance.

### 3.2 Trust Boundaries

1. Spec-Kit artifacts enter Guidance as untrusted inputs until validated.
2. Guidance-to-adapter requests are trusted only when accompanied by valid internal authorization context.
3. Beads responses are external backend state and MUST be validated before use.
4. Agent reports are claims, not accepted facts.
5. Evidence references MUST be resolved and integrity-checked before acceptance.
6. Direct backend mutations are untrusted out-of-band changes.

## 4. Architectural Invariants

1. Guidance MUST remain functional when the Beads adapter is disabled or unavailable.
2. Guidance identifiers MUST remain canonical.
3. Backend identifiers MUST NOT leak into policy rules as canonical object identifiers.
4. A Beads-ready item MUST NOT be exposed as governed-ready until Guidance authorization succeeds.
5. A Beads claim MUST NOT occur before Guidance authorizes the claimant and work item.
6. Agent completion submission MUST NOT directly close a Beads work item.
7. Only Guidance acceptance MAY authorize backend closure.
8. Projection MUST be idempotent.
9. Semantic drift MUST NOT be silently merged.
10. Scope-expanding work creation MUST require an authorized amendment unless explicitly allowed by policy.
11. Every state-changing operation MUST be auditable and correlated.
12. Failures in governance validation MUST fail closed.

## 5. Adapter Interface

```typescript
interface WorkExecutionAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;

  probeCapabilities(request: CapabilityProbeRequest): Promise<CapabilityProbeResult>;
  health(request: BackendHealthRequest): Promise<BackendHealthResult>;

  openExecution(request: OpenExecutionRequest): Promise<ExecutionBinding>;
  publishWorkGraph(request: PublishWorkGraphRequest): Promise<PublishWorkGraphResult>;
  reconcileWorkGraph(request: ReconcileWorkGraphRequest): Promise<ReconciliationResult>;

  listReadyWork(request: ReadyWorkRequest): Promise<ReadyWorkResult>;
  claimWork(request: ClaimWorkRequest): Promise<WorkClaim>;
  heartbeatClaim(request: ClaimHeartbeatRequest): Promise<WorkClaim>;
  releaseClaim(request: ReleaseClaimRequest): Promise<ReleaseClaimResult>;

  reportProgress(request: ProgressReport): Promise<ProgressReceipt>;
  reportBlocker(request: BlockerReport): Promise<BlockerReceipt>;

  submitCompletion(request: CompletionSubmission): Promise<CompletionReceipt>;
  rejectCompletion(request: CompletionRejection): Promise<CompletionState>;
  acceptCompletion(request: CompletionAcceptance): Promise<CompletionState>;

  getExecutionSnapshot(request: ExecutionSnapshotRequest): Promise<ExecutionSnapshot>;
  collectEvents(request: EventCursorRequest): Promise<ExecutionEventBatch>;
  closeExecution(request: CloseExecutionRequest): Promise<CloseExecutionResult>;
}
```

### 5.1 Interface Requirements

- Every mutating request MUST contain an `idempotencyKey`.
- Every request MUST contain `correlationId`.
- Mutating requests SHOULD contain `expectedRevision` when a backend revision is known.
- Every response MUST identify the adapter, adapter version, backend instance, and operation timestamp.
- Backend errors MUST be normalized into the error taxonomy in Section 17.
- The adapter MUST NOT make policy decisions.
- Request and result types referenced by this interface are defined normatively in Appendix A.

## 6. Canonical Domain Model

### 6.1 Governed Execution Package

```typescript
interface GovernedExecutionPackage {
  schemaVersion: "guidance.execution-package/v1";
  executionId: string;
  projectId: string;
  specificationId: string;
  specificationRevision: string;

  source: {
    provider: "spec-kit";
    artifactUri: string;
    contentDigest: string;
  };

  governance: {
    policySetId: string;
    policySetRevision: string;
    policyDecisionId: string;
    approvalId?: string;
    riskClass: "low" | "medium" | "high" | "critical";
    allowedOperations: string[];
    prohibitedOperations: string[];
    authorizationExpiresAt?: string;
  };

  workGraph: {
    nodes: WorkNode[];
    edges: WorkEdge[];
  };

  completionPolicy: CompletionPolicy;
  provenance: ProvenanceRecord;
}
```

### 6.2 Work Node

```typescript
interface WorkNode {
  workId: string;
  parentWorkId?: string;
  kind: "epic" | "task" | "validation" | "review" | "approval" | "evidence";
  title: string;
  description: string;

  priority: {
    class: "critical" | "high" | "normal" | "low";
    ordinal: number;
  };

  inputs: ArtifactReference[];
  expectedOutputs: ExpectedArtifact[];
  acceptanceCriteria: AcceptanceCriterion[];
  requiredEvidence: EvidenceRequirement[];

  executionConstraints: {
    allowedTools?: string[];
    deniedTools?: string[];
    writablePaths?: string[];
    protectedPaths?: string[];
    networkPolicy?: "denied" | "restricted" | "allowed";
    maximumAttempts?: number;
    timeoutSeconds?: number;
  };

  labels: Record<string, string>;
}
```

### 6.3 Work Edge

```typescript
interface WorkEdge {
  from: string;
  to: string;
  relation:
    | "blocks"
    | "parent-of"
    | "requires-evidence-from"
    | "requires-approval-from"
    | "relates-to";
}
```

### 6.4 Completion Policy

```typescript
interface CompletionPolicy {
  mode: "evidence-gated";
  requireAllAcceptanceCriteria: boolean;
  allowNotApplicableCriteria: boolean;
  requireSourceRevision: boolean;
  requiredReviewKinds: string[];
  rejectOnOpenSeverity: Array<"critical" | "high" | "medium" | "low">;
  closeBackendWorkOnlyAfterAcceptance: true;
}
```

### 6.5 Provenance Record

```typescript
interface ProvenanceRecord {
  generatedAt: string;
  generatedBy: string;
  sourceArtifactDigests: Record<string, string>;
  packageDigest: string;
  canonicalizationAlgorithm: string;
  hashAlgorithm: "sha256";
}
```

## 7. Identifier and Binding Model

```typescript
interface ExternalWorkBinding {
  executionId: string;
  guidanceWorkId: string;
  backend: "beads";
  backendInstanceId: string;
  backendWorkId: string;
  sourceDigest: string;
  projectionRevision: number;
  backendRevision?: string;
  createdAt: string;
  lastReconciledAt: string;
}
```

Requirements:

- The pair `(executionId, guidanceWorkId)` MUST be unique.
- The triple `(backend, backendInstanceId, backendWorkId)` MUST be unique.
- Bindings MUST be durable across Guidance restarts.
- A deleted backend item MUST NOT cause reuse of its binding for unrelated work.
- Re-creation after authorized recovery MUST increment `projectionRevision`.
- Evidence and audit events MUST refer to Guidance IDs and MAY additionally include backend IDs.

## 8. Spec-Kit Ingestion and Authorization Handoff

### 8.1 Required Processing

Guidance MUST:

1. locate required Spec-Kit artifacts;
2. validate structure and declared schema versions;
3. calculate content digests;
4. extract requirements, tasks, constraints, and dependencies;
5. normalize task identifiers;
6. resolve ambiguous or missing dependencies as validation findings;
7. attach acceptance criteria to executable work;
8. derive evidence requirements;
9. assign risk classification;
10. resolve the governing policy set;
11. enforce required approval gates;
12. produce a deterministic work graph;
13. canonicalize and hash the execution package; and
14. record an authorization decision.

### 8.2 Authorization States

```text
DRAFT
  -> VALIDATING
VALIDATING
  -> CHANGES_REQUIRED | AWAITING_APPROVAL | EXECUTION_AUTHORIZED | REVOKED
CHANGES_REQUIRED
  -> VALIDATING                          (after artifact revision and resubmission)
AWAITING_APPROVAL
  -> EXECUTION_AUTHORIZED | CHANGES_REQUIRED | REVOKED
EXECUTION_AUTHORIZED
  -> SUSPENDED | REVOKED | COMPLETED
SUSPENDED
  -> EXECUTION_AUTHORIZED                (after the suspension cause is resolved and policy validity is revalidated)
REVOKED                                 (terminal)
COMPLETED                               (terminal)
```

Rules:

- Only `EXECUTION_AUTHORIZED` packages MAY be published to Beads.
- Every transition into or out of `SUSPENDED` MUST record the suspension cause and, on resume, the revalidation decision.
- `REVOKED` and `COMPLETED` are terminal; continuing work after either state requires a new execution package.
- A suspended execution MUST NOT offer governed-ready work (Section 10.2).

### 8.3 Determinism

Given byte-identical source artifacts, policy revisions, and configuration, Guidance SHOULD generate the same canonical work graph and package digest. Non-deterministic fields such as timestamps MUST be excluded from the canonical digest or normalized by the canonicalization algorithm.

The canonicalization algorithm MUST satisfy all of the following, independent of the concrete algorithm selected by ADR 7 (Section 28):

- object keys MUST be sorted deterministically (lexicographic by Unicode code point);
- input MUST be encoded as UTF-8 without insignificant whitespace;
- all excluded or normalized non-deterministic fields MUST be enumerated explicitly by the canonicalization profile;
- the algorithm MUST be versioned, and its identifier MUST be recorded in `ProvenanceRecord.canonicalizationAlgorithm`; and
- a change of algorithm or profile MUST change the identifier and MUST invalidate equality comparisons between digests produced under different identifiers.

## 9. Execution Opening and Work-Graph Projection

### 9.1 Open Execution

`openExecution` creates or resolves an execution-level backend binding. It MUST NOT publish work nodes unless explicitly combined by an implementation-specific transaction that preserves identical semantics.

### 9.2 Projection Mapping

| Canonical concept | Required Beads representation |
|---|---|
| Execution | Root epic or immutable execution marker |
| Epic | Epic-like hierarchical item |
| Task | Standard work item |
| Validation | Work item labeled `guidance.kind=validation` |
| Review | Work item labeled `guidance.kind=review` |
| Approval | Blocking gate work item or adapter-managed virtual gate |
| Blocks | Blocking dependency |
| Parent-of | Hierarchical relation |
| Acceptance criteria | Structured metadata and human-readable body |
| Evidence requirement | Structured metadata and optional evidence work item |
| Policy decision | Immutable correlation metadata |
| Package digest | Immutable projection metadata |

### 9.3 Projection Algorithm

The adapter MUST:

1. validate package authorization and schema compatibility;
2. resolve the execution binding;
3. verify that the submitted package digest equals the currently authorized package digest for the execution; a stale or superseded package MUST be rejected with `STALE_PACKAGE` without modifying backend state;
4. topologically validate the work graph;
5. detect unsupported edge types;
6. calculate per-node projection digests;
7. load existing bindings and backend revisions;
8. create missing nodes in deterministic order;
9. update authorized changed nodes using compare-and-swap where possible;
10. create dependencies only after both endpoint bindings exist;
11. validate the resulting backend graph;
12. persist bindings and projection revisions; and
13. return created, updated, unchanged, skipped, and conflicted counts.

### 9.4 Dry Run

`publishWorkGraph` MUST support a dry-run mode that returns the intended mutations without changing backend state.

### 9.5 Idempotency

Reusing an idempotency key with an identical request MUST return the original logical result. Reusing it with a different request digest MUST return `IDEMPOTENCY_CONFLICT`.

## 10. Ready-Work Discovery

### 10.1 Backend Ready Set

The adapter queries Beads for items that are operationally ready according to dependency and status state.

### 10.2 Governed Ready Set

Guidance MUST filter candidates using:

- execution authorization state;
- current policy decision validity;
- approval satisfaction;
- agent identity and role;
- agent capability declarations;
- tool authorization;
- risk restrictions;
- claim availability;
- execution suspension state; and
- required context availability.

### 10.3 Response

```typescript
interface GovernedReadyWorkResult {
  backendReadyCount: number;
  governedReadyCount: number;
  items: GovernedReadyWorkItem[];
  exclusions: ReadyWorkExclusion[];
  evaluatedAt: string;
  policyDecisionId: string;
}
```

Exclusion details exposed to agents MUST avoid leaking protected policy information. Administrative diagnostics MAY contain full reasons.

## 11. Governed Claiming and Leases

### 11.1 Claim Flow

1. Guidance authenticates the agent.
2. Guidance authorizes the agent for the selected work item.
3. Guidance issues a short-lived execution token bound to execution, work, agent, policy decision, and expiry.
4. The adapter validates the token context supplied by Guidance.
5. The adapter atomically claims the backend item.
6. Guidance persists the governed claim and lease.
7. Guidance returns an execution context envelope.

Crash-safety: if Guidance fails between the backend claim (step 5) and governed lease persistence (step 6), the resulting orphaned backend claim MUST be detected by startup or periodic reconciliation, recorded as an audit event, and resolved according to the configured stale-claim policy. While an unresolved orphaned claim exists for an execution, further claims for that execution MUST be suspended (fail closed).

### 11.2 Claim Request

```typescript
interface ClaimWorkRequest {
  executionId: string;
  workId: string;
  agentId: string;
  authorization: {
    policyDecisionId: string;
    executionToken: string;
  };
  requestedLeaseSeconds: number;
  idempotencyKey: string;
  correlationId: string;
  expectedRevision?: string;
}
```

### 11.3 Lease Rules

- A lease MUST have an expiry.
- Heartbeats MUST extend a lease only within policy limits.
- An expired Guidance lease MUST NOT automatically clear a backend claim unless the configured stale-claim policy authorizes it.
- Claim release MUST be idempotent.
- Reassignment after failure MUST produce a new claim ID.
- Completion submitted under an expired or superseded claim MUST be rejected.

## 12. Execution Context Delivery

```typescript
interface ExecutionContextEnvelope {
  schemaVersion: "guidance.execution-context/v1";
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  objective: string;
  acceptanceCriteria: AcceptanceCriterion[];
  requiredEvidence: EvidenceRequirement[];
  allowedOperations: string[];
  prohibitedOperations: string[];
  inputs: ResolvedArtifactReference[];
  expectedOutputs: ExpectedArtifact[];
  relatedKnowledge: {
    gitNexusRefs?: string[];
    insightRefs?: string[];
    clearThoughtRefs?: string[];
  };
  provenance: {
    specificationDigest: string;
    executionPackageDigest: string;
    policyDecisionId: string;
  };
  expiresAt: string;
}
```

Guidance MUST apply least-privilege context disclosure. Beads MUST NOT independently invoke other downstream servers.

## 13. Progress Reporting

```typescript
interface ProgressReport {
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  sequence: number;
  timestamp: string;
  state:
    | "started"
    | "in-progress"
    | "blocked"
    | "awaiting-review"
    | "completion-submitted";
  summary: string;
  producedArtifacts?: ArtifactReference[];
  idempotencyKey: string;
  correlationId: string;
}
```

Requirements:

- Sequence numbers MUST increase monotonically per claim.
- Duplicate reports MUST be safely ignored or return the original receipt.
- Guidance MUST detect sequence gaps per claim; a gap MUST NOT be silently ignored.
- Out-of-order or future-sequence reports MUST be buffered in a bounded pending set; if the gap is not closed within a configured timeout, the report stream MUST be marked suspect and the claim MUST be re-synchronized before further reports are accepted.
- Progress summaries MUST be treated as untrusted text.
- Artifact references MUST NOT imply acceptance.
- Progress MAY be projected into Beads notes or status metadata.
- The complete governed event record MUST remain in Guidance.

## 14. Blocker Handling and Amendments

### 14.1 Blocker Types

- `work`: dependency on existing governed work.
- `policy`: policy or authorization prevents progress.
- `environment`: tool, service, capacity, or infrastructure issue.
- `human`: decision or approval required.
- `specification`: a defect or ambiguity in the authorized specification.
- `new-scope`: newly discovered work outside the package.

### 14.2 Handling

- Existing work blockers MAY create a new dependency after validation.
- Policy blockers MUST remain Guidance-owned.
- Specification blockers MUST suspend affected work and return to the Spec-Kit lifecycle.
- New-scope blockers MUST create an amendment request, not an immediate executable task.
- A work-graph amendment MUST create a new package revision and digest.
- Reconciliation MUST preserve previously accepted work and identify newly affected readiness.

## 15. Evidence-Gated Completion

### 15.1 Submission

```typescript
interface CompletionSubmission {
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  summary: string;
  outputs: ArtifactReference[];
  evidence: EvidenceSubmission[];
  assertions: Array<{
    criterionId: string;
    result: "satisfied" | "not-satisfied" | "not-applicable";
    evidenceRefs: string[];
  }>;
  sourceRevision?: {
    vcs: "git";
    commit: string;
    treeDigest?: string;
  };
  idempotencyKey: string;
  correlationId: string;
}
```

### 15.2 Validation

Guidance MUST verify:

1. execution and claim validity;
2. submission sequence and replay safety;
3. output artifact existence and digest integrity;
4. criterion coverage;
5. evidence type and source requirements;
6. required test results;
7. required reviews and approvals;
8. open findings against severity thresholds;
9. source revision requirements;
10. authorized scope compliance; and
11. current policy validity.

### 15.3 State Machine

```text
IN_PROGRESS
  -> COMPLETION_SUBMITTED               (agent submits under a valid claim)
COMPLETION_SUBMITTED
  -> VALIDATING_COMPLETION              (validation starts)
  -> IN_PROGRESS                        (submission withdrawn before validation)
VALIDATING_COMPLETION
  -> COMPLETION_ACCEPTED                (all checks pass)
  -> COMPLETION_REJECTED                (a check fails or validation times out)
COMPLETION_REJECTED
  -> IN_PROGRESS                        (after remediation; resubmission requires a valid claim)
COMPLETION_ACCEPTED
  -> BACKEND_CLOSING                    (closure operation starts)
BACKEND_CLOSING
  -> CLOSED                             (backend item closed)
  -> BACKEND_CLOSING                    (idempotent retry, bounded by maxClosureAttempts)
CLOSED                                  (terminal)
```

Rules:

- These states govern the work item's completion lifecycle. The claim lifecycle (claimed, heartbeat, release, expiry) is governed independently by Section 11; a completion submission is only valid under a non-expired, non-superseded claim.
- `VALIDATING_COMPLETION` MUST have a configured timeout; expiry transitions to `COMPLETION_REJECTED` with reason code `VALIDATION_TIMEOUT`.
- When closure retries reach `completion.maxClosureAttempts`, retries stop, an operational alert MUST be raised, and administrative repair tooling (Section 21) takes over; Guidance state remains `COMPLETION_ACCEPTED` (Section 15.4).
- `CLOSED` is terminal. Acceptance and closure are final; redoing accepted work requires the amendment process (Section 14.2).

### 15.4 Acceptance

- Guidance MUST persist an immutable acceptance receipt before backend closure.
- The receipt MUST contain evidence references, policy decision ID, package digest, source revision, and acceptance digest.
- The adapter MUST close only the matching bound backend work item.
- A backend closure failure MUST leave Guidance state at `COMPLETION_ACCEPTED` with a recoverable `BACKEND_CLOSING` operation.
- Retry MUST be idempotent.
- Acceptance is final. This specification defines no acceptance revocation: receipts are immutable and backend closure is not reversed. Work that must be redone after acceptance is raised as a `new-scope` blocker (Section 14.1) and handled through the amendment process (Section 14.2).

### 15.5 Rejection

A rejection MUST include machine-readable reason codes and human-readable remediation instructions. It MUST NOT close the backend work item.

## 16. Synchronization and Reconciliation

### 16.1 Reconciliation Inputs

- Canonical Guidance execution package.
- Durable external bindings.
- Last known backend revisions.
- Current Beads snapshot.
- Unprocessed normalized events.

### 16.2 Ownership Classes

**Guidance-owned:** criteria, evidence requirements, policy metadata, security constraints, gate dependencies, package digest.

**Beads-owned:** backend revision, internal timestamps, technical storage metadata.

**Shared:** status, assignee, description, priority, dependency projection.

### 16.3 Conflict Rules

```text
Governance fields       -> guidance-wins
Execution claims        -> compare-and-swap
Descriptions            -> fail-on-semantic-drift
Progress notes          -> append-only merge
Dependencies            -> fail-on-drift
Backend metadata        -> backend-wins
```

### 16.4 Drift Severity

- **Informational:** backend-only metadata changed.
- **Low:** non-semantic formatting changed.
- **Medium:** description or priority changed.
- **High:** assignment, status, or ordinary dependency changed.
- **Critical:** governance gate, security constraint, evidence requirement, binding, or package digest changed.

High and critical drift MUST suspend affected mutations until resolved. Critical drift SHOULD suspend affected execution.

### 16.5 Drift Resolution

High and critical drift MUST be resolved through the following procedure before affected mutations resume:

1. **Detection:** reconciliation classifies each finding per Section 16.4 and records it as a `DriftFinding` (Appendix A).
2. **Suspension:** affected work items and, for critical drift, the execution enter the suspended state; the suspension reason MUST reference the finding.
3. **Inspection:** an administrator inspects findings via `guidance.adapters.inspect_drift` (Section 24.2).
4. **Resolution action:** the administrator selects exactly one action per finding:
   - `accept-backend`: adopt the backend value into the canonical package; this requires a package amendment and produces a new package digest (Section 14.2).
   - `restore-canonical`: re-project the canonical value to the backend under a new projection revision.
   - `quarantine`: leave the item suspended and escalate, for cases where neither adoption nor restoration is safe.
5. **Audit and resume:** every resolution MUST be audited and emitted as a reconciliation event; suspended mutations resume only after all blocking findings have a recorded resolution.

Agents MUST NOT resolve high or critical drift. Informational, low, and medium drift MAY be resolved automatically by the reconciliation rules configured per Section 16.3.

## 17. Error Model

```typescript
type AdapterErrorCode =
  | "BACKEND_UNAVAILABLE"
  | "BACKEND_TIMEOUT"
  | "BACKEND_AUTHENTICATION_FAILED"
  | "BACKEND_VERSION_UNSUPPORTED"
  | "BACKEND_SCHEMA_INCOMPATIBLE"
  | "CAPABILITY_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "INVALID_STATE_TRANSITION"
  | "BINDING_NOT_FOUND"
  | "BINDING_CONFLICT"
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "WORK_NOT_READY"
  | "WORK_ALREADY_CLAIMED"
  | "CLAIM_EXPIRED"
  | "SEMANTIC_DRIFT"
  | "PROJECTION_FAILED"
  | "RECONCILIATION_REQUIRED"
  | "STALE_PACKAGE"
  | "OPERATION_NOT_AUTHORIZED";
```

Each error MUST include a stable code, operation, retryability, correlation ID, safe message, optional backend diagnostic, and remediation hint. Secrets and sensitive paths MUST be redacted.

## 18. Event Model

```typescript
interface ExecutionEventEnvelope<T> {
  schemaVersion: "guidance.execution-event/v1";
  eventId: string;
  eventType: string;
  occurredAt: string;
  executionId: string;
  workId?: string;
  source: {
    adapterId: string;
    adapterVersion: string;
    backend: "beads";
    backendInstanceId: string;
  };
  correlationId: string;
  causationId?: string;
  sequence: number;
  payload: T;
  integrity: { payloadDigest: string };
}
```

The normalized event log MUST assign a strictly increasing, gap-free `sequence` per execution. `collectEvents` MUST deliver events in ascending sequence order; cursors (`EventCursorRequest.afterSequence`, Appendix A) resume exactly after the given sequence. Delivery is at-least-once; consumers remain idempotent by `eventId`.
```

Required event types include:

- `execution.opened`
- `work.published`
- `work.updated`
- `work.claimed`
- `work.claim.heartbeat`
- `work.claim.released`
- `work.progressed`
- `work.blocked`
- `work.completion.submitted`
- `work.completion.rejected`
- `work.completion.accepted`
- `work.backend.closed`
- `backend.drift.detected`
- `backend.unavailable`
- `reconciliation.completed`

Events MUST be append-only in the Guidance audit log. Consumers MUST be idempotent by `eventId`.

## 19. Capability Negotiation

```typescript
interface CapabilityProbeResult {
  backend: "beads";
  backendVersion: string;
  schemaVersion?: string;
  capabilities: {
    jsonOutput: boolean;
    dependencyGraph: boolean;
    atomicClaim: boolean;
    hierarchicalWork: boolean;
    auditTrail: boolean;
    persistentMemory: boolean;
    multiWriter: boolean;
    crossMachineSync: boolean;
    compareAndSwap?: boolean;
    nativeEvents?: boolean;
  };
  limitations: string[];
  probedAt: string;
}
```

Capability probing MUST occur at startup and SHOULD recur after backend upgrade, an incompatible error, or the configured `capabilityProbeIntervalSeconds` interval. Missing REQUIRED capabilities MUST mark the adapter unavailable. Optional capabilities MAY select fallback strategies.

## 20. Security Requirements

1. Direct agent access to Beads MUST be denied by default. Enabling it requires explicit configuration (`security.allowDirectAgentAccess`), MUST be audited, and MUST NOT bypass governed claiming.
2. The adapter executable path MUST be explicitly configured or securely discovered.
3. Workspace paths MUST be canonicalized and checked against an allowlist.
4. User-controlled values MUST NOT be interpolated into shell commands.
5. CLI invocation MUST use argument arrays without a shell.
6. Environment variables passed to the backend MUST be allowlisted.
7. Execution tokens MUST be short-lived, audience-bound, and non-replayable where practical.
8. Sensitive fields MUST be redacted from logs.
9. Backend output MUST be size-limited and schema-validated.
10. Timeouts and process termination MUST be enforced.
11. Automatic backend initialization MUST be disabled by default.
12. Direct out-of-band mutation MUST trigger reconciliation.
13. Governance metadata in Beads MUST not contain secrets.
14. Evidence artifacts MUST be stored by reference with integrity digests.

## 21. Reliability and Recovery

- All mutations MUST be retry-safe.
- Durable bindings MUST be committed atomically with successful projection results where possible.
- Partial graph publication MUST be reported with per-item outcomes.
- Crashed publication MUST be recoverable through reconciliation.
- Backend unavailability MUST NOT corrupt Guidance state.
- Accepted completion with failed backend closure MUST be retried without repeating acceptance.
- Dead-letter handling MUST exist for repeatedly failing normalized events.
- Administrative tooling MUST support snapshot inspection and controlled repair.

## 22. Observability

### 22.1 Metrics

At minimum:

- adapter request count and latency by operation;
- backend error count by normalized code;
- publication created, updated, unchanged, and conflicted counts;
- ready candidate and governed-ready counts;
- claim success and conflict counts;
- lease expiry count;
- completion accepted and rejected counts;
- closure retry count;
- drift count by severity;
- reconciliation duration and result;
- backend availability and capability status.

### 22.2 Logs

Logs MUST be structured and include timestamp, correlation ID, execution ID, work ID where applicable, adapter version, backend instance ID, operation, result, duration, and normalized error code.

### 22.3 Traces

A trace SHOULD span Guidance request handling, policy evaluation, adapter operation, backend invocation, persistence, and event emission.

## 23. Configuration

```yaml
executionBackends:
  beads:
    enabled: true
    adapterVersion: "1"
    capabilityProbeIntervalSeconds: 3600

    transport:
      type: cli
      executable: bd
      timeoutSeconds: 30
      maxOutputBytes: 1048576

    workspace:
      discovery: repository-root
      initPolicy: require-existing
      mode: stealth
      allowedRoots:
        - "${workspace.root}"

    projection:
      rootEpicPerExecution: true
      includeAcceptanceCriteria: true
      includeEvidenceTasks: true
      includeGovernanceMetadata: true
      dryRunByDefault: false

    claims:
      enabled: true
      leaseSeconds: 1800
      heartbeatSeconds: 300
      maximumLeaseSeconds: 7200
      staleClaimPolicy: require-guidance-release

    synchronization:
      strategy: poll
      pollIntervalSeconds: 10
      reconciliationIntervalSeconds: 300
      conflictPolicy: fail-on-semantic-drift

    completion:
      closeOnlyAfterGuidanceAcceptance: true
      maxClosureAttempts: 10

    security:
      allowDirectAgentAccess: false
      allowAutomaticInit: false
      redactBackendDiagnostics: true
```

Configuration MUST be schema-validated at startup. Invalid security-sensitive configuration MUST fail closed.

### 23.1 Configuration Semantics

- **`workspace.mode: stealth`** refers to Beads stealth mode (`bd init --stealth`): Beads state is kept under the workspace-local `.beads/` database directory, git operations and git hook installation are disabled (`no-git-ops: true`), and no Beads-managed files are committed to the host repository. When stealth mode is configured, the adapter MUST NOT install git hooks, MUST NOT perform git operations through Beads, and MUST NOT require Beads-managed files to be committed to the repository. Stealth mode MUST NOT weaken binding durability (Section 7): bindings are persisted by Guidance, not in Beads-managed files.
- **`capabilityProbeIntervalSeconds`** is the recurring interval for capability probing per Section 19.
- **`completion.maxClosureAttempts`** bounds the idempotent closure retries in state `BACKEND_CLOSING` (Section 15.3); reaching the bound stops retries and raises an operational alert.

## 24. Guidance MCP Methods

### 24.1 Agent-Facing

```text
guidance.execution.status
guidance.work.ready
guidance.work.claim
guidance.work.heartbeat
guidance.work.release
guidance.work.report_progress
guidance.work.report_blocker
guidance.work.submit_completion
guidance.work.get_context
```

### 24.2 Administrative

```text
guidance.execution.open
guidance.execution.publish
guidance.execution.reconcile
guidance.execution.close
guidance.adapters.list
guidance.adapters.capabilities
guidance.adapters.health
guidance.adapters.reconcile
guidance.adapters.inspect_drift
```

Every method MUST define authentication, authorization, request schema, response schema, idempotency behavior, error codes, and audit events in the implementation contract.

## 25. Acceptance Criteria

The adapter is implementation-ready when all criteria below are satisfied.

### 25.1 Architecture

- The Guidance domain model contains no required Beads-specific status or ID types.
- The adapter can be disabled without breaking Spec-Kit validation or Guidance governance flows.
- A second test adapter can implement the same port without Beads dependencies.

### 25.2 Projection

- Publishing an authorized graph creates the expected backend structure.
- Repeating the identical publication produces no additional work items.
- Changed authorized content increments projection revision.
- Unsupported relations fail with a specific diagnostic.
- A stale or superseded package revision is rejected with `STALE_PACKAGE` and does not modify backend state.
- Partial failures are recoverable by reconciliation.
- Publication exceeding backend metadata size limits fails per item with an actionable diagnostic; silent truncation is not permitted.

### 25.3 Readiness and Claims

- Backend-ready but unauthorized work is not returned to the agent.
- Two simultaneous claim attempts result in at most one successful claim.
- Expired tokens cannot claim work.
- Heartbeat and release operations are idempotent.
- A stale lease follows configured policy and is auditable.

### 25.4 Completion

- Completion submission does not close backend work.
- Missing evidence causes deterministic rejection.
- Accepted evidence creates an immutable acceptance receipt.
- Backend close occurs only after acceptance persistence.
- Closure retry does not duplicate acceptance.

### 25.5 Drift

- Direct dependency removal is detected.
- Governance metadata change is classified as critical drift.
- Critical drift suspends affected execution.
- Non-semantic backend metadata changes do not block execution.

### 25.6 Security

- The negative security test suite (Section 26, item 7) passes for command-injection attempts through titles, descriptions, paths, and IDs over the CLI transport.
- Workspace escape attempts are rejected.
- Secrets are absent from logs and projected metadata.
- Oversized or malformed backend output is rejected safely.

### 25.7 Operations

- Metrics, logs, and traces correlate a complete work lifecycle.
- Backend outage leaves Guidance state consistent.
- Restart during publication or closure is recoverable.
- Capability mismatch produces actionable health diagnostics.

## 26. Required Test Suites

1. Unit tests for canonicalization, mapping, validation, and error normalization.
2. Contract tests for every adapter method.
3. Golden tests for projected work-item representations.
4. Idempotency tests for all mutations.
5. Concurrency tests for claims and reconciliation.
6. Negative tests for malformed JSON, unsupported versions, and schema skew.
7. Security tests for command injection, path traversal, secret leakage, output exhaustion, and token replay.
8. Fault-injection tests for timeout, process crash, partial projection, storage failure, and backend unavailability.
9. End-to-end tests from Spec-Kit package through accepted completion.
10. Migration tests for adapter and binding schema upgrades.

## 27. Delivery Plan

### Milestone 1: Foundation

- Define port and canonical schemas.
- Implement configuration and capability probing.
- Implement health and read-only snapshot operations.
- Build a fake backend for contract tests.

### Milestone 2: Controlled Projection

- Implement execution bindings and node bindings.
- Implement dry-run and idempotent publication.
- Implement dependency projection and validation.
- Add drift detection and reconciliation reports.

### Milestone 3: Governed Execution

- Implement ready-work filtering integration.
- Implement atomic claim, leases, heartbeats, and release.
- Implement execution context envelopes.
- Add claim concurrency and recovery tests.

### Milestone 4: Evidence-Gated Completion

- Implement completion submission and validation workflow.
- Persist acceptance receipts.
- Close backend work only after acceptance.
- Add rejection and remediation behavior.

### Milestone 5: Hardening

- Implement full observability.
- Complete security and fault-injection suites.
- Add administrative drift inspection and repair workflow.
- Produce operational runbooks and upgrade documentation.

## 28. Open Design Decisions

The implementation project MUST resolve and record ADRs for:

1. Whether the first transport is CLI, MCP, API, or a combination.
2. Exact Beads metadata encoding and size limits.
3. Representation of approval and evidence gates as physical or virtual work items.
4. Source of truth and persistence technology for external bindings.
5. Lease recovery timing and tooling after Guidance restart (the crash-window detection requirement is fixed in Section 11.1).
6. Whether status synchronization is polling-only or hook-assisted.
7. Canonical JSON algorithm used for digests (normative requirements are fixed in Section 8.3; the ADR selects the concrete algorithm).
8. Retention policy for snapshots, events, receipts, and backend diagnostics.
9. Multi-repository and monorepo backend-instance identity.
10. Supported Beads version range and upgrade policy.

## 29. Definition of Done

The integration is complete when:

- all mandatory acceptance criteria pass;
- all required test suites pass;
- threat model and security review are approved;
- recovery exercises demonstrate publication, claim, and closure recovery;
- operational dashboards and alerts are available;
- compatibility and upgrade policies are documented;
- an end-to-end execution demonstrates Spec-Kit ingestion, Guidance authorization, Beads projection, governed claiming, progress reporting, evidence rejection, remediation, acceptance, backend closure, and release of dependent work.

## 30. References

- Beads repository: https://github.com/gastownhall/beads (verified 2026-10-07)
- Beads documentation: https://beads.gascity.com/ (verified 2026-10-07; current release 1.3.0)

## Appendix A: Shared Type Definitions

This appendix defines the request, result, and shared domain types referenced by
Sections 5 through 18. All types are normative. `GovernedExecutionPackage`,
`WorkNode`, `WorkEdge`, `CompletionPolicy`, `ProvenanceRecord`, `ExternalWorkBinding`,
`ClaimWorkRequest`, `ExecutionContextEnvelope`, `ProgressReport`, `CompletionSubmission`,
`GovernedReadyWorkResult`, `CapabilityProbeResult`, and `ExecutionEventEnvelope` are
defined inline in their sections and are not repeated here.

### A.1 Criteria and Evidence

```typescript
interface AcceptanceCriterion {
  criterionId: string;
  statement: string;
  verificationMethod: "test" | "review" | "inspection" | "demonstration";
  verificationCommand?: string;
  severity: "critical" | "high" | "medium" | "low";
  waivable: boolean;
}

interface EvidenceRequirement {
  evidenceId: string;
  evidenceType:
    | "test-result"
    | "review-report"
    | "build-log"
    | "artifact-digest"
    | "measurement"
    | "attestation";
  description: string;
  requiredForAcceptance: boolean;
  sourceConstraints?: {
    allowedSources?: string[];
    requiresIndependentRun?: boolean;
  };
}

interface EvidenceSubmission {
  evidenceId: string;
  artifact: ArtifactReference;
  producedBy: string;
  producedAt: string;
  claims: string[];
}

interface ArtifactReference {
  uri: string;
  contentDigest: string;
  mediaType?: string;
  byteSize?: number;
}

interface ResolvedArtifactReference extends ArtifactReference {
  resolvedAt: string;
  integrityVerified: boolean;
}

interface ExpectedArtifact {
  artifactId: string;
  description: string;
  pathPattern?: string;
  artifactType?: string;
}
```

### A.2 Ready Work and Claims

```typescript
interface ReadyWorkRequest {
  executionId: string;
  maxItems?: number;
  correlationId: string;
}

interface ReadyWorkResult {
  executionId: string;
  fetchedAt: string;
  backendRevision?: string;
  candidates: Array<{
    guidanceWorkId: string;
    backendWorkId: string;
    backendStatus: string;
    blockedBy: string[];
  }>;
}

interface GovernedReadyWorkItem {
  workId: string;
  title: string;
  kind: WorkNode["kind"];
  priorityClass: WorkNode["priority"]["class"];
  requiredCapabilities: string[];
  allowedTools: string[];
  contextDigest: string;
}

interface ReadyWorkExclusion {
  workId: string;
  reasonCode:
    | "authorization-invalid"
    | "approval-missing"
    | "agent-not-authorized"
    | "capability-mismatch"
    | "tool-not-authorized"
    | "risk-restricted"
    | "execution-suspended"
    | "context-unavailable"
    | "claim-unavailable";
  safeDescription: string;
}
```

`ReadyWorkResult` is the adapter-level backend ready set (Section 10.1);
`GovernedReadyWorkResult` (Section 10.3) is the Guidance-level response built from it.
`ReadyWorkExclusion.safeDescription` MUST NOT contain protected policy information
(Section 10.3).

```typescript
interface WorkClaim {
  claimId: string;
  executionId: string;
  workId: string;
  backendWorkId: string;
  agentId: string;
  policyDecisionId: string;
  issuedAt: string;
  expiresAt: string;
  lease: {
    leaseSeconds: number;
    maximumLeaseSeconds: number;
    heartbeatSeconds: number;
  };
}

interface ClaimHeartbeatRequest {
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  requestedExtensionSeconds?: number;
  idempotencyKey: string;
  correlationId: string;
}

interface ReleaseClaimRequest {
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  reason: "completed" | "abandoned" | "error" | "administrative";
  idempotencyKey: string;
  correlationId: string;
}

interface ReleaseClaimResult {
  claimId: string;
  releasedAt: string;
  backendClaimCleared: boolean;
  followUpRequired: string[];
}
```

### A.3 Reporting and Completion

```typescript
interface ProgressReceipt {
  receiptId: string;
  claimId: string;
  acceptedSequence: number;
  duplicate: boolean;
  receivedAt: string;
}

interface BlockerReport {
  executionId: string;
  workId: string;
  claimId: string;
  agentId: string;
  blockerType:
    | "work"
    | "policy"
    | "environment"
    | "human"
    | "specification"
    | "new-scope";
  description: string;
  suggestedDependencyWorkId?: string;
  proposedAmendment?: string;
  idempotencyKey: string;
  correlationId: string;
}

interface BlockerReceipt {
  receiptId: string;
  blockerId: string;
  disposition:
    | "recorded"
    | "dependency-created"
    | "amendment-required"
    | "escalated";
  recordedAt: string;
}

interface ValidationFinding {
  checkId: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  remediation?: string;
}

interface CompletionReceipt {
  receiptId: string;
  workId: string;
  state:
    | "COMPLETION_SUBMITTED"
    | "VALIDATING_COMPLETION"
    | "COMPLETION_REJECTED"
    | "COMPLETION_ACCEPTED";
  findings: ValidationFinding[];
  receivedAt: string;
}

interface CompletionRejection {
  executionId: string;
  workId: string;
  claimId: string;
  reasonCodes: string[];
  findings: ValidationFinding[];
  remediation: string;
  resubmissionAllowed: boolean;
  correlationId: string;
}

interface CompletionAcceptance {
  executionId: string;
  workId: string;
  acceptanceReceiptId: string;
  acceptedAt: string;
  correlationId: string;
}

interface CompletionState {
  executionId: string;
  workId: string;
  state:
    | "IN_PROGRESS"
    | "COMPLETION_SUBMITTED"
    | "VALIDATING_COMPLETION"
    | "COMPLETION_REJECTED"
    | "COMPLETION_ACCEPTED"
    | "BACKEND_CLOSING"
    | "CLOSED";
  updatedAt: string;
  backendRevision?: string;
}
```

### A.4 Execution Lifecycle Requests and Results

```typescript
interface CapabilityProbeRequest {
  correlationId: string;
  requestedCapabilities?: string[];
}

interface BackendHealthRequest {
  correlationId: string;
}

interface BackendHealthResult {
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  degradedReasons: string[];
  capabilitySummary: CapabilityProbeResult["capabilities"];
}

interface OpenExecutionRequest {
  executionId: string;
  packageDigest: string;
  authorizationContext: {
    policyDecisionId: string;
    executionToken?: string;
  };
  idempotencyKey: string;
  correlationId: string;
}

interface ExecutionBinding {
  executionId: string;
  backend: "beads";
  backendInstanceId: string;
  backendExecutionRef: string;
  projectionRevision: number;
  createdAt: string;
}

interface PublishWorkGraphRequest {
  executionId: string;
  executionPackage: GovernedExecutionPackage;
  dryRun: boolean;
  idempotencyKey: string;
  correlationId: string;
  expectedRevision?: string;
}

interface PublishWorkGraphResult {
  dryRun: boolean;
  projectionRevision: number;
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    conflicted: number;
  };
  perItemOutcomes: Array<{
    workId: string;
    backendWorkId?: string;
    outcome: "created" | "updated" | "unchanged" | "skipped" | "conflict";
    detail?: string;
  }>;
}

interface ReconcileWorkGraphRequest {
  executionId: string;
  correlationId: string;
}

type DriftResolutionAction = "accept-backend" | "restore-canonical" | "quarantine";

interface DriftFinding {
  workId?: string;
  field: string;
  severity: "informational" | "low" | "medium" | "high" | "critical";
  expectedValue: string;
  observedValue: string;
  detectedAt: string;
  resolution?: DriftResolutionAction;
}

interface ReconciliationResult {
  executionId: string;
  completedAt: string;
  findings: DriftFinding[];
  countsBySeverity: Record<string, number>;
  actionsApplied: DriftResolutionAction[];
  suspendedWorkIds: string[];
}

interface ExecutionSnapshotRequest {
  executionId: string;
  includeItems: boolean;
  correlationId: string;
}

interface ExecutionSnapshot {
  executionId: string;
  takenAt: string;
  projectionRevision: number;
  items: Array<{
    workId: string;
    backendWorkId: string;
    backendStatus: string;
    backendRevision: string;
    claimId?: string;
    lastReconciledAt: string;
  }>;
  pendingOperations: string[];
}

interface EventCursorRequest {
  executionId: string;
  afterSequence?: number;
  maxEvents: number;
  correlationId: string;
}

interface ExecutionEventBatch {
  events: Array<ExecutionEventEnvelope<unknown>>;
  nextAfterSequence?: number;
  hasMore: boolean;
}

interface CloseExecutionRequest {
  executionId: string;
  requireAllClosed: boolean;
  idempotencyKey: string;
  correlationId: string;
}

interface CloseExecutionResult {
  executionId: string;
  closedAt?: string;
  outcome: "closed" | "already-closed" | "blocked";
  openWorkIds: string[];
}
```

Event delivery follows Section 18: strict ascending `sequence` per execution,
at-least-once semantics, and consumer idempotency by `eventId`.
