# Spec 018 — M0 Beads v1.3 Conformance Baseline (T004)

**Status:** ACCEPTED — approved by user 2026-10-07; binding for mapping v1
(WP-02) and the golden suite (T038) (decision record: DEC-GBEA-M0 in
`memory-bank/decisions.md`).

Ground truth for `guidance.beads-mapping/v1`, pinned to **Beads 1.3.0**
(facts verified 2026-10-07 against the Beads repository
`github.com/gastownhall/beads` and docs `beads.gascity.com` at v1.3.0, per
GBEA-SPEC-001 §30 and the 2026-10-07 review rounds). Golden fixtures are
generated against this baseline; changing any fact here requires re-running
the golden + contract tiers before the backend version range is widened
(ADR-8).

## 1. Verified Facts

### Statuses (RFC §9.6.7 mapping input)

- Supported statuses: `open`, `in_progress`, `blocked`, `closed`.
- `done` is a status **category**, not a status; `closed` is the terminal
  status within `done` (v0.4.0 review blocker — never map to `done`).
- Custom statuses via `status.custom` configuration exist in Beads but are
  **outside mapping v1** and MUST be rejected as unknown backend statuses
  (`BACKEND_SCHEMA_INCOMPATIBLE`).

### Issue types and priorities (RFC §9.6.2 mapping input)

- Native types: `bug`, `feature`, `task`, `epic`, `chore`, `gate`.
  Mapping v1 emits only `epic` and `task`.
- Priorities `0..4`; `4` = backlog and MUST NOT be assigned by the adapter
  (RFC §9.6.2). Canonical classes map `critical`→0, `high`→1, `normal`→2,
  `low`→3.
- Human gates exist natively in Beads; mapping v1 does **not** use them —
  approvals are adapter-managed virtual gates in Guidance (RFC §9.6.2/9.6.4).

### Dependencies (RFC §9.6.4 mapping input)

- Blocking vs. non-blocking dependency classes.
- Full type set observed: `blocks`, `parent-child`, `related`,
  `conditional-blocks`, `waits-for`, `tracks`, `discovered-from`,
  `caused-by`, `validates`, `supersedes`.
- Mapping v1 produces only `blocks`, `parent-child`, `related`; any other
  type detected on a Guidance-managed item during reconciliation is drift
  (RFC §9.6.4/§16.4).

### Metadata and labels

- Metadata reserved key prefixes `bd:` and `_` MUST NOT be used by the
  adapter (RFC §9.6.3); Guidance data lives under the single `guidance`
  key as canonical JSON, ≤ 32,768 bytes.
- Labels `guidance.managed` (MUST), `guidance.execution=<executionId>`
  (SHOULD), `guidance.kind=<validation|review|evidence>` per §9.6.2.

### Store, identity, and stealth (RFC §7.1/§23.1 input)

- Beads state lives in a `.beads` database directory; `BEADS_DIR` can
  relocate it (external/shared stores).
- Git worktrees **share one** `.beads` store → same backend instance
  identity (store-root-derived, not workspace-derived).
- Stealth mode: `bd init --stealth` keeps state workspace-local with
  `no-git-ops: true` — no hooks installed, no git operations, nothing
  committed to the host repository.

### Events

- Beads journal is per-replica, at-least-once → Guidance normalization and
  the §18 ordering model are authoritative; Beads events are hints only.

## 2. Environment Facts (2026-10-07)

- `bd` is **not installed** on the development host (`command -v bd` → not
  found). Real-backend tests (T063 e2e R-pilot, capability/health tests)
  require a pinned Beads 1.3.x installation; all other tiers run against
  the fake backend (T015).
- Version range shipped: `>=1.3.0 <2.0.0` (ADR-8).

## 3. Golden-Fixture Conformance Checks (input for T038)

1. Every projected item round-trips: canonical fields recoverable from
   native fields + labels + `guidance` metadata (exception: virtual
   approval gates, Guidance-recoverable only) — RFC §9.6.6.
2. Status table §9.6.7 applied exhaustively; unknown/custom statuses
   rejected.
3. Priority conversion incl. backlog-4 prohibition; `priorityOrdinal`
   metadata-only.
4. Forbidden dependency types never produced; detection classified as
   drift.
5. Metadata size guard: 32,767 bytes pass, 32,769 bytes fail per item with
   `PROJECTION_FAILED` and actionable diagnostic (no truncation).
6. Titles contain no mutable state (status/assignee/claim).

Any Beads release that changes a Section 1 fact invalidates this baseline:
update the baseline first, then re-run golden + contract tiers, then widen
the range (ADR-8).
