# Spec 018 — M0 Decision Proposals (ADR 1–8, Proof Signing, Config Default)

**Status:** ACCEPTED — approved by user 2026-10-07, all proposals unchanged.
Decisions recorded in `memory-bank/decisions.md` (DEC-GBEA-M0).

**Evidence base (2026-10-07):**
- `servers/server-guidance` persists today as JSON files (`state/SessionRepository.ts`
  fs-sync writes + per-session mutex; `AuditRepository` append-only). No
  SQLite, no crypto, no canonicalization utilities in server-guidance.
- `bd` is NOT installed on this host (verified `command -v bd` → not found).
- RFC §23 sample config fixes the defaults to mirror (CLI transport, poll
  sync, stealth workspace, 30 s readiness TTL, …).
- Beads facts verified 2026-10-07 at v1.3.0 (see `m0-beads-v1.3-baseline.md`).

---

## ADR-1 — First transport for the Beads adapter

**Constraint (RFC §28.1, §20, §23):** transport choice is open; security
requirements 20.2–20.6/20.9–20.10 and the §23 sample (CLI, `bd`, timeout,
output cap) apply once chosen.

**Options:** (a) CLI only; (b) MCP; (c) HTTP API; (d) combination.

**Recommendation: (a) CLI only for v1.**
- Matches the RFC §23 default configuration exactly; §20's controls
  (argument arrays, no shell, env allowlist, output caps, timeouts) are
  designed for process spawning.
- `bd` absent on this host is an environment gap, not a design blocker:
  unit/contract/golden tiers run against the fake backend; real-`bd` tests
  (T063 R-pilot) get a pinned install (see ADR-8).
- The port stays transport-agnostic (WP-01); an MCP transport can be added
  later behind the same adapter without touching mapping v1.

## ADR-2 — Beads metadata limits beyond the normative mapping

**Constraint (RFC §28.2, §9.6.3):** the 32 KiB `guidance`-metadata guard is
normative; further backend constraints are open.

**Recommendation:** adopt the normative 32,768-byte guard as a single
config-less constant; add conservative client-side caps only where the
pinned Beads v1.3 baseline documents hard limits (title/description
lengths), enforced with the same per-item `PROJECTION_FAILED` +
actionable-diagnostic pattern; refine caps from `probeCapabilities` output
if a future Beads version reports them. No speculative limits.

## ADR-3 — Persistence technology for the coordination/binding store

**Constraint (RFC §28.3, §11.4, §21.1):** must provide transactional claim
intents with unique constraints and fencing tokens, transactional gap-free
event-sequence allocation, atomic multi-record commits (or WAL-equivalent
crash consistency), and the §21.1 query paths without steady-state full
scans.

**Options:**
- (a) **better-sqlite3** — proven in this repo (`server-insight`), WAL mode,
  real transactions, unique indexes; synchronous API makes atomic
  multi-record commits trivial.
- (b) JSON files + per-key mutex + write-ahead journal (current guidance
  pattern) — transactional sequence allocation and lease sweeps at §21.1
  quality bar are hand-rolled and fragile.
- (c) External DB (Postgres) — new infra/ops surface; unjustified for v1.

**Recommendation: (a) better-sqlite3**, one Guidance-side store file beside
the existing guidance data (not in repository content, consistent with
RFC §7.1 placement rules), WAL mode, prepared-statement query paths for the
§21.1 patterns. **Documented deployment constraint:** multi-instance
operation (RFC §11.4 split-brain) is supported for co-located instances
sharing the store file on one machine (SQLite multi-process locking);
cross-machine active-active is out of scope for v1 and stated in the
implementation contract. Workspace-level EMMS lesson
(`better-sqlite3-bindings`) applies: yarn workspaces install, no npm at
root.

## ADR-4 — Lease recovery timing and tooling after Guidance restart

**Constraint (RFC §28.4, §11.3):** restart semantics are fixed (downtime
counts against expiry; startup runs orphaned-claim detection before serving
claims; stale-claim handling auditable). Open: sweep timing and tooling.

**Recommendation:** orphaned-claim detection runs (1) synchronously at store
open, before the server accepts claim requests, and (2) as part of every
reconciliation pass driven by the existing `synchronization.pollIntervalSeconds`
(10 s default) — expired-lease lookup is a prepared indexed query, so no new
config key is needed (keeps the config surface strictly RFC §23). Tooling:
`guidance.adapters.reconcile` exposes sweep results; runbook covers manual
stale-claim resolution per `claims.staleClaimPolicy`.

## ADR-5 — Status synchronization: polling vs. hook-assisted

**Constraint (RFC §28.5, §16.6, §23):** `synchronization.strategy: poll` is
the sample default; Beads v1.3 journal is per-replica at-least-once (no
documented reliable push hook).

**Recommendation:** polling-only for v1 (poll + incremental reconciliation +
24 h full reconciliation per §23 defaults). Re-evaluate only if Beads ships
a stable push mechanism; the adapter port already isolates the strategy.

## ADR-6 — Canonical JSON algorithm for digests

**Constraint (RFC §28.6, §8.3):** sorted keys (Unicode code point), UTF-8,
no insignificant whitespace, versioned identifier, enumerated
non-deterministic-field exclusions, `sha256:<lowercase-hex>` output.

**Options:** (a) full RFC 8785 (JCS) incl. float serialization rules;
(b) profiled canonical JSON with integer-only numbers.

**Recommendation: (b)** — define `guidance.canonical-json/v1`: UTF-8; object
keys sorted by Unicode code point; ECMAScript minimal JSON escaping; no
insignificant whitespace; **non-integer numbers are forbidden in
canonicalized content** (validated at type boundary — all RFC §6/App A
numeric fields are integers), which removes JCS float nondeterminism
entirely. Identifier recorded in `ProvenanceRecord.canonicalizationAlgorithm`
and in every receipt per §15.4.

## ADR-7 — Retention and immutable-archive policy

**Constraint (RFC §28.7, §18.2, §21.1):** pruning only into an immutable
audit archive with verified integrity + cursor continuity; no pruning under
receipt/legal hold; `retentionEpoch` semantics.

**Recommendation:** v1 = **no online pruning by default** (hot store keeps
full history; storage growth bounded by §18.2 snapshots for replay cost,
not by deletion). The audit archive is the SQLite store itself with
append-only enforcement at the data-access layer (no UPDATE/DELETE on event
and receipt tables) plus nightly digest export (JSONL of the day's events +
chain digest) to an archive directory as the WORM-adjacent artifact;
external anchoring (§18.2 SHOULD) documented as an optional deployment
step. `retentionEpoch` exists in the schema from day one (constant 1 until
an admin performs an archival operation).

## ADR-8 — Backend upgrade policy and version-range maintenance

**Constraint (RFC §28.8, §19, §23 `supportedBackendVersionRange`):** range
enforced fail-closed at init; re-negotiation audited.

**Recommendation:** ship `">=1.3.0 <2.0.0"` (RFC §23 sample). Within-range
minor upgrades accepted automatically after probe. Widening the range or a
Beads MAJOR release requires: golden + contract tiers green against the new
version (baseline doc updated first), an explicit config change, and the
audited re-negotiation per §19. A Beads MAJOR that changes issue
schema/status semantics triggers mapping-v2 evaluation per §9.6/§9.7.
Pinning in environments: `bd` resolved via configured executable path
(absolute or PATH); the pilot environment installs Beads 1.3.x pinned.

## Proof-Signing Design (T003, feeds RFC §11.5 implementation contract)

**Recommendation: Ed25519** via `node:crypto` (`generateKeyPairSync('ed25519')`).
- Key provisioning: keypair generated on first start, persisted `0600` beside
  the execution store (same trust domain as the store itself; not in
  repository content). Config override: optional `signingKeyPath`.
- Rotation: proofs are short-lived (expiry per §11.5 issued-at/expiry
  window); rotation = generate new pair + record audit event; old public key
  retained for receipt/proof verification of in-flight proofs only.
- Nonce store: SQLite table with UNIQUE constraint on `proofId`/nonce;
  verification consumes the nonce atomically (INSERT … on conflict →
  `OPERATION_NOT_AUTHORIZED`), satisfying single-use replay protection
  without a separate service.
- Signature format: `ed25519:<base64url(signature)>` over the canonical
  JSON (ADR-6 profile) of the proof fields except the signature itself;
  algorithm identifier embedded in the proof envelope for future agility.

## Config Default Decision (T005)

**Recommendation:** shipped default is `executionBackends.beads` absent →
functionally `enabled: false` (AC-A1). Config surface = strictly the RFC
§23 keys (no v1 extensions — see ADR-4 rationale). The config assistant
does not offer Beads enablement until rollout stage R5 (plan §8); enabling
in R1–R4 is a manual config edit, audited at startup per §23 validation.

---

## Decision matrix for approval

| # | Decision | Recommendation |
|---|---|---|
| ADR-1 | Transport | CLI only (port stays agnostic) |
| ADR-2 | Metadata limits | Normative 32 KiB + baseline-documented caps only |
| ADR-3 | Persistence | better-sqlite3, WAL, co-located multi-instance only |
| ADR-4 | Lease recovery | Startup sweep + sweep on poll/reconciliation; no new config keys |
| ADR-5 | Status sync | Polling-only v1 |
| ADR-6 | Canonical JSON | `guidance.canonical-json/v1`, integers-only numbers |
| ADR-7 | Retention | No pruning in v1; append-only store + nightly digest export; epoch=1 |
| ADR-8 | Upgrade policy | `>=1.3.0 <2.0.0`; widening gated on golden+contract green + audit |
| T003 | Proof signing | Ed25519, key beside store, SQLite nonce table |
| T005 | Config default | Backend absent/disabled by default; RFC §23 keys only |
