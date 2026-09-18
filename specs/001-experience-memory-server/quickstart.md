# Quickstart: Experience Memory Server (EMMS)

**Feature**: 001-experience-memory-server | **Date**: 2026-09-17

Runnable validation scenarios proving the feature works end-to-end (golden
paths G1–G3 from research.md D3). Implementation code belongs to
`tasks.md`/implementation; this guide defines the validation only.

## Prerequisites

- Node.js ≥ 18
- Dependencies installed: `cd servers/server-experiencememory && npm install`
- Fresh store: default SQLite location under the server directory (delete the
  store file between scenario runs for reproducibility)

## Setup / run commands

```bash
cd servers/server-experiencememory
npm run build
npm run dev        # stdio (use an MCP inspector/client)
npm run dev:http   # optional HTTP mode on :3002
npm test           # contract + unit tests (fixtures from tests/fixtures/)
```

## G1 — Verified capture → retrieval (SC-003, SC-004, FR-007/008/019)

1. `workflow.start` with goal "clean install exits 0", scope `demo-repo`, failure "ERESOLVE exit 1".
2. Follow guidance: `experience.record_observation` (failure_output + attached artifact) → `experience.record_attempt` → `complete_attempt` (harmful) → second attempt (successful) → `propose_hypothesis` → `propose_solution` + `validation.plan`.
3. `validation.record_run` for original-failure check AND regression check, each with an evidence artifact.
4. `experience.finalize` requesting `verified` → expect final state `LOCALLY_VERIFIED` (evidence complete).
5. New workflow; `experience.search` with the same signature + environment → expect G1 episode top result, applicability reasons listed.
6. Negative check: attempt to finalize a second episode with missing regression run → expect `NEEDS_MORE_EVIDENCE`, not verified.

## G2 — Incompatible environment demotion (SC-006, FR-015/016)

1. Seed the store with a verified episode recorded under `environment.os = "windows"`.
2. Search from environment `os = "linux", containerized = true` with the same failure signature.
3. Expect: the Windows episode is NOT top-ranked; result card lists `mismatches: ["os"]` and `recommended_use: reference_only`; search notes report `semantic_available: false`.

## G3 — Known-bad attempt avoidance (SC-001, SC-009, FR-006/024)

1. With G1's store, run a new workflow for the same failure.
2. Search → expect the G1 episode's harmful attempt ("disable peer checks") in `known_bad_attempts` and a guidance recommendation to try a different strategy.
3. Record `experience.record_reuse_feedback` verdict `useful` → expect accepted; subsequent search ranking for that episode reflects positive feedback.

## Additional validation scenarios

- **Idempotency (FR-028)**: replay `workflow.start` with the same idempotency key → identical result, exactly one episode.
- **Stale revision (D2)**: call `record_observation` with `expected_revision = 1` after two mutations → `STALE_REVISION` error with `current_revision: 3` and corrected template.
- **Redaction (FR-025)**: attach an artifact containing `AKIA…`-style token and a home path → response reports `redaction.findings_count ≥ 2`; stored/normalized content contains no secret.
- **Isolation (FR-027)**: search from scope `other-repo` → no results referencing `demo-repo` content.
- **Audit (FR-030)**: perform `experience.finalize` invalidation-equivalent privileged op → audit event with actor, reason, revisions exists.

## Expected outcome

All scenarios pass using only the documented tool contracts
([contracts/tools.md](./contracts/tools.md)) and guidance invariants
([contracts/guidance.md](./contracts/guidance.md)); `npm test` green
including fixture-driven contract tests.

## Error-code acceptance matrix ( CHK029 )

Every error code in contracts/tools.md has a scripted scenario: INVALID_REQUEST
(malformed search limit), STALE_REVISION (G1 step 6 variant), INVALID_TRANSITION
(record validation run before solution proposed), MISSING_REQUIRED_EVIDENCE
(finalize verified without regression evidence), ARTIFACT_REJECTED (2 MiB
upload), ARTIFACT_HASH_MISMATCH (tamper fixture file then describe), DUPLICATE_IDEMPOTENCY
(replay), RATE_LIMITED (flood mutations), INTERNAL_ERROR (forced handler fault
in test harness). Implemented as `tests/contracts/errors.test.ts`.
