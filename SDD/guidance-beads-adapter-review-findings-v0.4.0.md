# Review Findings for Guidance Beads Execution Adapter Specification v0.4.0-draft

## Executive Summary

The specification is implementation-ready and significantly improved compared to v0.3.0. The following findings are not considered blockers. They are recommendations intended to strengthen long-term operability, migration support, auditability, and extreme-scale deployments.

---

# F-013: Backend Version Negotiation

## Finding

The specification defines capability negotiation and mapping versioning, but does not fully define compatibility negotiation between:

- Adapter Version
- Mapping Version
- Backend (Beads) Version

Future Beads releases may introduce changes to:

- status values
- dependency semantics
- issue schema
- metadata handling

without Guidance being able to reason about compatibility deterministically.

## Risks

- Silent incompatibilities
- Incorrect status synchronization
- Mapping failures after backend upgrades
- Runtime-only discovery of incompatibilities

## Proposed Solution

Introduce a normative compatibility structure:

```ts
interface NegotiatedCompatibility {
  adapterVersion: string;
  mappingVersion: string;
  backendVersion: string;
  negotiatedAt: string;
}
```

### Requirements

- Compatibility MUST be validated during adapter initialization.
- Unsupported backend versions MUST fail closed.
- Compatibility decisions MUST be recorded in audit logs.
- Supported backend version ranges MUST be explicitly documented.

---

# F-014: Mapping Migration Procedure

## Finding

The specification now includes:

```text
guidance.beads-mapping/v1
```

However, no migration procedure exists for future major mapping versions.

Example:

```text
v1 → v2
```

Effects on bindings, snapshots, receipts, and historical events are undefined.

## Risks

- Migration ambiguity
- Incompatible repositories
- Broken historical replay
- Non-reproducible audit results

## Proposed Solution

Create a new section:

```text
Mapping Migration Procedure
```

### Recommended Process

1. Freeze execution state.
2. Validate current mapping version.
3. Generate migration plan.
4. Upgrade bindings.
5. Upgrade snapshots.
6. Upgrade receipts.
7. Verify event-stream compatibility.
8. Reconcile backend state.
9. Publish migration receipt.
10. Resume execution.

### Additional Requirement

Every mapping major version MUST include:

- migration prerequisites
- rollback strategy
- compatibility matrix

---

# F-015: Snapshot Hash Chaining

## Finding

Snapshot integrity digests are defined.

However, snapshots are not connected through a cryptographic chain.

A malicious actor with sufficient access could theoretically:

1. Modify historical data.
2. Generate replacement snapshots.
3. Preserve local digest validity.

## Risks

- Reduced audit confidence
- Harder forensic validation
- Missing evidence of historical tampering

## Proposed Solution

Extend snapshot metadata:

```ts
interface SnapshotMetadata {
  snapshotDigest: string;
  previousSnapshotDigest?: string;
}
```

### Requirements

- Every snapshot references its predecessor.
- Genesis snapshots contain no predecessor.
- Replay verification validates the entire chain.
- Broken chains MUST raise integrity failures.

---

# F-016: Extremely Large Work Graphs

## Finding

Current reconciliation and projection strategies scale well to several thousand nodes.

The specification does not explicitly address:

- 50,000+ work items
- 100,000+ work items
- large autonomous agent factories

## Risks

- Long projection times
- Large reconciliation windows
- Memory pressure
- Reduced responsiveness

## Proposed Solution

Introduce hierarchical execution partitioning.

Example:

```text
Execution
 ├─ Partition A
 ├─ Partition B
 ├─ Partition C
 └─ Partition D
```

### Requirements

- Partitions are independently reconcilable.
- Partitions maintain local checkpoints.
- Readiness evaluation is partition-aware.
- Reconciliation can execute in parallel.

### Additional Recommendation

Define normative scalability targets.

Example:

```text
100,000 items
< 30 minute full reconciliation
```

---

# F-017: Policy Digest for Audit Reproducibility

## Finding

The specification currently references policy revisions.

Example:

```text
Policy Revision 42
```

A revision number alone is insufficient to prove which policy content was evaluated.

## Risks

- Reduced audit reproducibility
- Harder forensic analysis
- Difficult historical verification

## Proposed Solution

Add policy bundle digests.

```ts
interface PolicyReference {
  revision: number;
  policyDigest: string;
}
```

### Requirements

- Policy digests use a canonical hash algorithm.
- Receipts MUST store the evaluated digest.
- Readiness decisions MUST reference the digest.
- Validation workflows MUST persist the digest.

---

# F-018: Receipt Chain

## Finding

Completion receipts are already strongly defined.

However, receipts remain independent objects.

There is no cryptographic linkage between:

```text
Receipt A
Receipt B
Receipt C
```

## Risks

- Harder long-term audit validation
- Lower forensic traceability
- Reduced tamper evidence

## Proposed Solution

Create a receipt chain.

```ts
interface CompletionReceipt {
  receiptSequence: number;
  receiptDigest: string;
  previousReceiptDigest?: string;
}
```

### Requirements

- Receipt sequences are strictly monotonic.
- Every receipt references its predecessor.
- Receipt verification validates chain integrity.
- Missing links generate audit failures.

---

# Minor Recommendations

## M-001: Refactor Section 9.6

Suggested structure:

```text
9.6 Mapping Overview
9.6.1 Node Mapping
9.6.2 Dependency Mapping
9.6.3 Metadata Mapping
9.6.4 Status Mapping
```

Benefits:

- Improved readability
- Easier navigation
- Better maintenance

---

## M-002: Split Appendix A

Suggested structure:

```text
Appendix A Core Types
Appendix B Execution Types
Appendix C Event Types
Appendix D Migration Types
```

Benefits:

- Better organization
- Simpler future extensions
- Reduced appendix complexity

---

# Overall Recommendation

The specification is implementation-ready in its current form.

Recommended priority order:

1. F-013 Backend Version Negotiation
2. F-014 Mapping Migration Procedure
3. F-017 Policy Digest
4. F-015 Snapshot Hash Chaining
5. F-018 Receipt Chain
6. F-016 Large-Scale Partitioning

After adoption of these recommendations, the specification would be suitable for a near-final v1.0 architecture baseline.
