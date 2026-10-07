# Spec 018 — Guidance Beads Execution Adapter (Implementation of GBEA-SPEC-001)

**Status:** Draft — specify phase
**Normative source of truth:** `SDD/guidance-beads-adapter-specification-en.md`,
RFC **GBEA-SPEC-001 v0.6.1-draft** (review rounds 1–5 applied; verdict of the
external review: READY FOR IMPLEMENTATION WITH MINOR CHANGES, residual items
resolved at v0.6.1).
**Scope:** `servers/server-guidance` (adapter port, Beads adapter module,
configuration, persistence, MCP methods) plus dedicated test infrastructure
(fake backend, second test adapter).
**Out of scope:** everything listed in RFC §2.2; execution partitioning
(GBEA-F016 tracked follow-up, RFC §21.2); a second production backend;
Beads UI; the v1.0 editorial restructure and capability guarantee profiles
(RFC §28, deliberately deferred).

---

## 1. Problem

The GBEA specification is implementation-ready but exists only as an RFC. It
defines — normatively, with MUST/SHALL — the adapter boundary, canonical
model, projection mapping, claiming, completion, reconciliation, security,
and operations for running Beads as a governed downstream execution backend
of the Guidance MCP Server. What is missing is the implementation project
that turns it into code: a scoped milestone plan with deliverables,
acceptance criteria traceable to the RFC, a testing strategy covering the ten
required test suites (RFC §26), and a rollout plan.

This spec is **subordinate to the RFC**. It adds implementation structure
only.

## 2. Normative Anchors and Precedence

1. In any conflict between this spec and the RFC, **the RFC wins**
   (GBEA-SPEC-001 v0.6.1-draft at `SDD/guidance-beads-adapter-specification-en.md`).
2. This spec MUST NOT redefine, relax, or extend normative behavior. Where it
   mentions behavior, the RFC section reference (`RFC §x`) is the anchor;
   prose here is navigation, not normative restatement.
3. The version under implementation is fixed at **v0.6.1-draft**. Any RFC
   revision after spec approval re-opens the affected sections of this
   document (change-control note, Section 11).
4. RFC §28 open design decisions (ADR 1–8) are **not** choices this spec may
   make unilaterally; they are resolved and recorded as ADRs in Milestone 0
   (Section 4) with user approval per AGENTS.md.

## 3. Implementation Scope

The implementation delivers, in this order of dependency:

**S1 — Backend-neutral port and canonical types.** The `WorkExecutionAdapter`
interface (RFC §5) and all canonical types of RFC §6 and Appendix A as a
single typed module inside the Guidance domain, with no Beads-specific types
leaking into the domain model (RFC §25.1, invariants RFC §4.2–4.3).

**S2 — Spec-Kit ingestion delta.** The 14 required processing steps
(RFC §8.1) up to and including the recorded authorization decision and the
deterministic canonical package digest (RFC §8.3). Existing Spec-Kit
validation (specs/017 artifact import) is reused where it already satisfies
a step; the delta (work-graph derivation, evidence-requirement derivation,
risk classification, policy-set resolution, canonicalization/hashing) is new.

**S3 — Beads adapter (anti-corruption layer).** CLI transport per the RFC
default configuration (RFC §23: `transport.type: cli`, executable `bd`,
argument-array invocation without a shell, RFC §20.4–20.5), workspace
discovery/stealth/init policy (RFC §23.1), backend-instance identity
(RFC §7.1), projection and mapping v1 (RFC §9.2–9.6), status mapping
(RFC §9.6.7), error normalization (RFC §17), capability negotiation
(RFC §19).

**S4 — Governed execution services in Guidance core.** Governed ready-set
filtering and evaluation cache (RFC §10), distributed claim coordination,
fencing tokens, leases, authorization proofs (RFC §11), execution context
envelopes (RFC §12), progress and blocker handling incl. amendments
(RFC §13, §14), evidence-gated completion with both state machines and
acceptance receipts (RFC §15), reconciliation and drift lifecycle
(RFC §16), normalized event log with snapshots and cursors (RFC §18),
observability (RFC §22), and the agent-facing and administrative MCP methods
(RFC §24).

**S5 — Persistence layer.** A Guidance-side coordination/binding store
satisfying RFC §21.1 (durability, atomicity, transactional sequence
allocation, required query patterns, retention) and the durable backend
operation journal (RFC §21.3). Technology selected by ADR 3 in Milestone 0.

**S6 — Test infrastructure.** A fake backend implementing the port for
contract tests, and a second minimal test adapter without Beads dependencies
proving port neutrality (RFC §25.1, §27 Milestone 1).

Explicitly **not** in scope: any change to governance semantics, gate logic,
or workflow phases of Guidance beyond adding the RFC §24 methods; any Beads
schema beyond mapping v1; partitioning.

## 4. Milestones

Milestone content and ordering follow RFC §27. **M0 is added** as an
approval/decision gate in front of RFC Milestone 1 — it produces no adapter
code and changes no normative behavior; it exists because RFC §28 makes ADR
resolution a precondition of a conforming implementation.

### M0 — Decisions and Implementation Contract (precondition)

Resolve and record, with user approval (AGENTS.md strict-compliance rule):

- **ADR 1–8** per RFC §28 (transport, Beads limits, persistence technology,
  lease-recovery tooling, sync strategy, canonical JSON algorithm, retention
  and immutable-archive policy, backend upgrade policy).
- **Proof signing:** Guidance signing key management and algorithm for
  `AdapterAuthorizationProof` (RFC §11.5 "documented in the implementation
  contract").
- **Implementation contract** per RFC §24: for each of the 22 MCP methods —
  authentication, authorization, request/response schemas, idempotency
  behavior, error codes, audit events.
- **Mapping v1 conformance baseline:** pin the verified Beads facts
  (v1.3.0, verified 2026-10-07) the mapping relies on.

**Exit:** ADRs recorded in `memory-bank/decisions.md`; implementation
contract document committed under `SDD/` or the feature directory; user
approval.

### M1 — Foundation (RFC §27 Milestone 1)

Port, canonical schemas, configuration schema validation (fail-closed,
RFC §23), capability probing incl. version-range enforcement and
`NegotiatedCompatibility` persistence (RFC §19), health and read-only
snapshot operations, fake backend, second test adapter.

**Exit (maps to RFC §25.1):** Guidance domain model contains no required
Beads-specific types; adapter disableable without breaking Spec-Kit
validation or governance flows; second test adapter implements the port
without Beads dependencies; initialization fails closed on out-of-range
backend versions and audit-records negotiated compatibility.

### M2 — Controlled Projection (RFC §27 Milestone 2)

Execution bindings, backend-instance identity (RFC §7.1 incl. `BEADS_DIR`,
worktree sharing, fallback store id, `BINDING_CONFLICT` fail-closed paths),
node bindings, mapping-version persistence; dry-run (RFC §9.4) and idempotent
publication (RFC §9.5) incl. `STALE_PACKAGE` guard; dependency projection
and validation (RFC §9.6.4); staged publication vs. `batchTransaction`
(RFC §9.3); drift detection, incremental reconciliation checkpoints
(RFC §16.6).

**Exit (maps to RFC §25.2 and the drift criteria of §25.5):** all §25.2
bullets verified by the M2 test set (Section 7); direct dependency removal
detected; governance-metadata change classified critical; scoped suspension
per RFC §16.4.

### M3 — Governed Execution (RFC §27 Milestone 3)

Ready-work filtering integration (RFC §10.2/10.3), distributed atomic claim
intents, fencing tokens, leases, heartbeats, release (RFC §11.1–11.4),
authorization proofs incl. replay protection (RFC §11.5), backend claim
markers and orphaned-claim detection (RFC §11.6), execution context
envelopes (RFC §12); claim concurrency and recovery tests, **including the
mandatory split-brain tests across at least two Guidance instances**
(RFC §11.4).

**Exit (maps to RFC §25.3):** all §25.3 bullets verified; shared-store
identity (workspaces/worktrees sharing one `.beads` store) resolves to one
backend instance identity and cannot double-claim.

### M4 — Evidence-Gated Completion (RFC §27 Milestone 4)

Completion submission and bounded validation workflow (timeout, transient
retry, RFC §15.2/15.3), immutable acceptance receipts with event binding and
digest verification (RFC §15.4), backend closure only after acceptance with
the independent `backendClosureState` machine and repair-required alerting
(RFC §15.3), rejection with machine-readable reason codes (RFC §15.5),
blocker lifecycle and amendment flow (RFC §14).

**Exit (maps to RFC §25.4):** all §25.4 bullets verified; acceptance and
closure state vectors evolve independently.

### M5 — Hardening (RFC §27 Milestone 5)

Full observability (metrics/log/trace correlation, RFC §22), readiness
caching with diagnostics (RFC §10.4), event snapshots with chained digests
and archive-aware cursors (RFC §18.2), scale conformance tests (RFC §21.2:
100k items; full reconciliation ≤ 30 min; incremental ≤ 5 min; readiness
p95 ≤ 2 s), complete security and fault-injection suites, administrative
drift inspection/resolution workflow (RFC §16.5, §24.2), operational
runbooks and upgrade documentation.

**Exit:** RFC §25.6 and §25.7 verified; Definition of Done (RFC §29) fully
satisfied, including the end-to-end execution demonstrating the complete
lifecycle (ingestion → authorization → projection → claim → progress →
evidence rejection → remediation → acceptance → closure → dependent release).

## 5. Deliverables

| ID | Deliverable | Milestone |
|---|---|---|
| D-01 | Typed canonical model + port module (RFC §5, §6, Appendix A) | M1 |
| D-02 | Configuration schema + fail-closed validation (RFC §23) | M1 |
| D-03 | Capability probe, version-range gate, `NegotiatedCompatibility` audit | M1 |
| D-04 | Fake backend + second test adapter (port-neutrality proof) | M1 |
| D-05 | Canonicalization/hashing module with versioned profile (RFC §8.3) | M1 |
| D-06 | Spec-Kit ingestion delta: work graph, evidence derivation, package digest, authorization decision (RFC §8.1) | M2 |
| D-07 | Binding store + backend-instance identity incl. fallback-id persistence (RFC §7, §7.1) | M2 |
| D-08 | Projection/mapping v1 incl. status mapping, labels/metadata encoding, 32 KiB guard (RFC §9.6) | M2 |
| D-09 | Dry-run + idempotent publication + staged/atomic publication (RFC §9.3–9.5) | M2 |
| D-10 | Reconciliation engine: checkpoints, drift findings, scoped suspension (RFC §16) | M2 |
| D-11 | Governed ready-set service + evaluation cache (RFC §10) | M3 |
| D-12 | Claim-intent store, fencing tokens, leases, heartbeats, release, stale-claim policy (RFC §11.1–11.4) | M3 |
| D-13 | `AdapterAuthorizationProof` issue/verify incl. nonce store and audit (RFC §11.5) | M3 |
| D-14 | Claim markers + orphaned-claim detection wiring (RFC §11.6) | M3 |
| D-15 | Execution context envelope delivery (RFC §12) | M3 |
| D-16 | Progress reporting with per-claim sequences and gap handling (RFC §13) | M4 |
| D-17 | Blocker lifecycle + amendment/package-revision flow (RFC §14) | M4 |
| D-18 | Completion validation, both state machines, receipts, closure, rejection (RFC §15) | M4 |
| D-19 | MCP method surface — 9 agent-facing + 13 administrative (RFC §24) | M3–M4 |
| D-20 | Durable backend operation journal (RFC §21.3) | M2 (grow-with-use through M5) |
| D-21 | Event log, snapshots, chained digests, archive-aware cursors (RFC §18) | M4–M5 |
| D-22 | Observability: metrics, structured logs, traces, dashboards, alerts (RFC §22) | M5 |
| D-23 | Security suite, fault-injection suite, scale tests (RFC §26 items 7, 8; §21.2) | M5 |
| D-24 | Drift admin workflow `inspect_drift`/`resolve_drift` (RFC §16.5, §24.2) | M5 |
| D-25 | Runbooks (recovery exercises, drift, closure repair, upgrade) + compatibility/upgrade documentation (RFC §29) | M5 |
| D-26 | Mapping-migration tooling per RFC §9.7 (exercised by migration tests) | M5 |
| D-27 | ADR records 1–8 + implementation contract + proof-signing key plan | M0 |

## 6. Acceptance Criteria

The RFC's own criteria are the acceptance criteria; they are verified as
follows and are **passed only as written** — this spec adds no weaker
variant and no substitution:

| Block | RFC source | Verified by | Gate at |
|---|---|---|---|
| Architecture | §25.1 | Contract tests with fake backend + second adapter; domain-model lint (no Beads types in Guidance domain) | M1 |
| Projection | §25.2 | Golden, contract, idempotency, negative suites (§26 items 1–4, 6) | M2 |
| Readiness & Claims | §25.3 | Concurrency + split-brain + security suites (§26 items 4, 5, 7) | M3 |
| Completion | §25.4 | Contract + fault-injection suites (§26 items 2, 8) | M4 |
| Drift | §25.5 | Reconciliation/drift tests within §26 items 5, 8 | M2 (detection) / M5 (resolution workflow) |
| Security | §25.6 | Negative security suite (§26 item 7) over the CLI transport | M5 |
| Operations | §25.7 | Fault-injection, replay, capability-health tests (§26 item 8) + observability correlation check | M5 |

Implementation-specific additions (additive, not normative reinterpretation):

- **AC-A1:** With `executionBackends.beads` absent or `enabled: false`
  (the shipped default), all existing Guidance suites pass unchanged —
  invariant RFC §4.1.
- **AC-A2:** Configuration schema validation at startup rejects
  security-sensitive misconfiguration fail-closed (RFC §23), with tests.
- **AC-A3:** Every RFC §24 method has contract-test coverage of its
  implementation-contract entry (authn/authz/schemas/idempotency/errors/audit).
- **AC-A4:** The persistence layer demonstrably satisfies the RFC §21.1
  query patterns without full scans (asserted by the fault-injection suite).

Final gate: **Definition of Done, RFC §29** — all mandatory criteria, all
ten suites, approved threat model and security review, demonstrated
publication/claim/closure recovery, dashboards and alerts, documented
compatibility/upgrade policy, conformance tests (mapping, status,
distributed-claim, snapshot, reconciliation-checkpoint, backend-instance
identity), and the complete end-to-end execution.

## 7. Testing Strategy

The ten required suites (RFC §26) map to the following concrete layers
(vitest, `servers/server-guidance` test conventions):

1. **Unit** — canonicalization/hashing (determinism, sorted keys, excluded
   fields, digest format `sha256:<hex>`), mapping v1 field/type/label/
   dependency/status tables (RFC §9.6.2–9.6.4, §9.6.7), validation rules,
   error normalization (RFC §17 incl. redaction).
2. **Contract** — every adapter method against the fake backend **and** the
   second test adapter (port neutrality); later against a real `bd` in a
   sandboxed workspace.
3. **Golden** — projected item representations and **lossless round-trip**
   of canonical fields from Beads representation (RFC §9.6.6); unknown-status
   rejection; virtual approval gates excluded from round-trip and recoverable
   from Guidance state only.
4. **Idempotency** — every mutation incl. `IDEMPOTENCY_CONFLICT` on differing
   request digests (RFC §9.5), heartbeat/release idempotency, closure retry
   without duplicate acceptance.
5. **Concurrency** — parallel claims (at most one winner), stale fencing
   tokens, CAS conflicts, **split-brain across ≥ 2 Guidance instances**
   (mandatory, RFC §11.4), reconciliation races.
6. **Negative** — malformed JSON, unsupported schema versions (major-version
   rejection both directions, RFC §6.6), schema skew, oversized/malformed
   backend output (RFC §20.9).
7. **Security** — command injection via titles/descriptions/paths/IDs over
   the CLI transport, path traversal/workspace escape, secret leakage in
   logs and projected metadata, output exhaustion, proof replay/expiry
   (RFC §20, §25.6).
8. **Fault-injection** — timeouts, process crashes at every protocol step
   (between backend claim and lease persistence, between acceptance and
   closure), partial projection, storage failure, backend unavailability;
   operation-journal replay after restart (RFC §21.1, §21.3, §11.1).
9. **End-to-end** — Spec-Kit package → authorization → projection → claim →
   progress → **evidence rejection** → remediation → acceptance → closure →
   release of dependent work (the RFC §29 scenario).
10. **Migration** — adapter/binding schema upgrades; mapping MAJOR-version
    migration following the ten-step procedure with migration receipt and
    untouched historical receipts (RFC §9.7).

Scale conformance (RFC §21.2) runs as a dedicated M5 test tier (generated
100k-item execution; full/incremental reconciliation budgets; readiness p95)
— not part of the regular CI fast path. Baseline-aware testing per
AGENTS.md: pre-existing suite failures are labeled separately.

## 8. Rollout Plan

Rollout is **opt-in, disabled by default, and reversible by config** —
invariant RFC §4.1 is the rollback mechanism.

1. **Stage R0 — Merge behind flags (after M1/M2).** Adapter code merged with
   `executionBackends.beads.enabled: false` shipped default; no user-visible
   behavior change (AC-A1 suite proves it).
2. **Stage R1 — Dry-run pilot (after M2).** A pilot workspace enables the
   backend with `projection.dryRunByDefault: true`; publications are
   dry-run-verified against the real `bd` in stealth mode; reconciliation
   runs read-only. Gate: zero unexplained drift findings on pilot packages.
3. **Stage R2 — Shadow projection (after M2 hardening).** Pilot publishes
   real projections into a dedicated Beads store; claiming still disabled
   (`claims.enabled: false`); reconciliation and drift dashboards observed.
4. **Stage R3 — Governed execution pilot (after M3).** Claims, heartbeats,
   context delivery enabled for one pilot execution with a short
   `leaseSeconds`; split-brain configuration avoided (single writer) until
   the split-brain suite is green in the pilot environment.
5. **Stage R4 — Completion pilot (after M4).** Evidence-gated completion
   enabled; first real acceptance receipts and backend closures; closure
   repair runbook exercised at least once deliberately.
6. **Stage R5 — General availability (after M5 / DoD).** Documentation
   (README, runbooks, upgrade policy per ADR 8) published; configuration
   assistant optionally offers Beads enablement; scale targets verified.
7. **Rollback.** Any stage: set `enabled: false` (Guidance remains
   functional, RFC §4.1). Already-projected backend items are left in place
   and reconciled if the backend is re-enabled; acceptance receipts are
   immutable and never rolled back (RFC §15.4).
8. **Upgrade policy.** Backend upgrades bounded by
   `transport.supportedBackendVersionRange` (fail-closed,
   `BACKEND_VERSION_UNSUPPORTED`); widening the range is an audited change
   per ADR 8. Breaking mapping changes go through the RFC §9.7 migration
   procedure with freeze–validate–migrate–receipt–resume.

## 9. Risks and Tracked Follow-ups

- **GBEA-F016 (partitioning deferral):** remains tracked in
  `memory-bank/remaining-work-plan.md`; adopted only if §21.2 targets are
  demonstrably missed in production (RFC §21.2).
- **Beads version drift:** mapping v1 is grounded on Beads 1.3.0 (verified
  2026-10-07). A Beads release changing issue schema/status semantics must
  re-run the golden + contract tiers before the version range is widened.
- **Windows/WSL store-root canonicalization:** backend-instance identity
  (RFC §7.1) depends on platform-normalized, symlink-resolved store roots;
  the dual Windows/WSL layout of this repo is an explicit test case.
- **Guidance restart during pilot stages:** restart semantics (RFC §11.3)
  and orphaned-claim detection must be exercised in R3 before multi-agent
  use.

## 10. Non-Goals

- No redesign of the RFC architecture, mapping, state machines, or error
  taxonomy.
- No relaxation of any MUST/SHALL (e.g., no acceptance revocation, no
  agent-side drift resolution, no direct agent backend access by default).
- No second production backend, no partitioning, no Beads UI work.
- No changes to Guidance workflow phases or existing governance gates beyond
  adding the RFC §24 method surface.
- No editorial restructuring of the RFC (deferred to its v1.0 pass, §28).

## 11. Change Control

If GBEA-SPEC-001 advances beyond v0.6.1-draft before implementation
completes, the affected milestones' exit criteria are re-derived from the
new RFC text; this spec's structure (milestones, deliverables, test
mapping, rollout stages) survives unless the RFC's §27 delivery plan itself
changes.
