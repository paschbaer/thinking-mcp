# Tasks: Guidance Production Hardening

**Feature**: specs/005-guidance-production-hardening · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-26
**Principles**: Test-First (constitution III); conventional commits; `gitnexus analyze --no-stats` + `detect_changes()` before **every commit**.
**Paths**: `servers/server-guidance/…` unless noted; memory-bank paths are repo-root.

## Dependencies

- T001 (plan hygiene) is independent and first. T002 independent. T003→T004→T005 sequential (metrics). T006→T007 sequential (tokens). T008/T009 independent of T003–T007. T010 last.

## Phase 1 — Hygiene + Namespace (P1)

- [x] T001 [US1] PLAN-CLEANUP: memory-bank/remaining-work-plan.md — mark fixed entries `[x]` with evidence (R-004, R-005, R-006, R-010, R-011, R-012a-c, R-013, FR-110-Harter-Kill — fixed by 8fa8125/61d7399/8fa8125-lineage), merge the duplicated R-011/R-012 sections, add hygiene rule to memory-bank/systemPatterns.md ("resolve plan entries in the same session as the fix")
- [x] T002 [US5] TRACK-NS: renumber specs/003-guidance-toolchain-bootstrap to FR-301…FR-315 / SC-301…SC-305 with alias table (FR-101→FR-301 … SC-005→SC-305); update spec-internal cross-references (tasks.md, data-model.md, quickstart.md); update memory-bank references

## Phase 2 — Metrics (L260/FR-059, P1)

- [x] T003 [US2] Write failing tests in `tests/contract/metrics.test.ts`: counters increment per execution (success/failure/cancelled/timeout), duration aggregates, get_metrics shape (FR-402), JSONL persistence + replay on boot, redaction of payloads
- [x] T004 [US2] Implement `src/metrics/MetricsRepository.ts` (aggregate + JSONL append + replay) and recording hooks in `WorkflowEngine` (executeRequired paths + runOperation) and `ClientManager` (health snapshots) — make T003 pass
- [x] T005 [US2] Register `get_metrics` tool (no session needed) + registration-surface test update; make T003 fully pass

## Phase 3 — Client-report integrity (FR-104.5, P2)

- [x] T006 [US3] Write failing tests in `tests/contract/remote-report-token.test.ts`: awaiting_client op gets a token; report with wrong/missing token → `client_report_invalid`; replay of a used token → rejected; correct token accepted exactly once; HMAC mode when key auth configured (FR-404)
- [x] T007 [US3] Implement opToken generation/validation in the remote ClientOpEngine ledger + `report_operation_result` enforcement + audit — make T006 pass

## Phase 4 — Venv relocation + Scaffold detection (P2/P3)

- [x] T008 [US4] TRACK-Venv-C: compose example (named volume + `UV_PROJECT_ENVIRONMENT`), README section, E2E variant running toolchain-sync with relocated venv env (FR-405)
- [x] T009 [US6] TRACK-Scaffold: language detection in `src/scaffold.ts` (pyproject.toml → uv op set incl. gate op), tests for both variants (FR-407/SC-404)
- [x] T010 [US-all] Full regression + typecheck + build (SC-405); README updates (FR-408); memory-bank updates; final review per protocol; merge to develop

## Notes

- FR numbering: FR-401+ (spec 003 will occupy FR-301+ after T002).
- E2E commands run via the guidance-bootstrap-test container pattern (repo copy + musl rollup), `RUN_PY_E2E=1` for the python E2E.
