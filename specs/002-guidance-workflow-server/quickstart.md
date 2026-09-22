# Quickstart: Guidance — Validation Guide

Feature: specs/002-guidance-workflow-server · References: [contracts/](./contracts/), [data-model.md](./data-model.md), [research.md](./research.md)

## Prerequisites

- Node.js ≥ 18, npm
- `gitnexus` CLI on PATH (for the default GitNexus binding; tests use stubs)
- Feature branch `feature/guidance-v2-orchestration` (constitution Feature Branch Rule)

## Build & test

```bash
cd servers/server-guidance
npm install
npm run build        # tsc -p tsconfig.build.json
npm test             # vitest run — contract tests exist & pass first (Test-First)
npm run typecheck
```

Expected: green suites across `tests/contract/`, `tests/speckit/` (parser goldens over `tests/fixtures/`), `tests/orchestration/` (stub fault modes), `tests/workflow/`, `tests/integration/`.

## Run

```bash
node dist/index.js     # stdio
node dist/server.js    # HTTP — binds 127.0.0.1 only (FR-027); non-loopback bind must fail
```

## End-to-end validation A: plain profile

1. Minimal `.guidance/` config (no Spec-Kit keys) → profile resolves `plain` (FR-060).
2. Walk the 7 phases with an MCP client; verify out-of-phase rejection, transition instructions, verify-ops execution.
3. `complete_workflow` with stub downstream failing → stays in `complete`; retry with stub succeeding → `completed`; duplicate `requestId` → recorded result, stub invocation count unchanged.

## End-to-end validation B: spec-kit profile

1. Config with `integrations.spec-kit` (or feature root) → profile resolves `spec-kit`; Spec-Kit tools registered (R17).
2. `discover_spec_kit_feature` with fixture feature `valid-full` → discovered, imported, snapshot persisted.
3. Fault fixtures: `missing-tasks`, `duplicate-task-ids`, `dependency-cycle` → import blocked with precise codes.
4. `get_next_task` → only dependency-free tasks released; attempt `start_task` for a blocked task → rejected.
5. Implement released batch; `submit_task_implementation`; `submit_task_review` with a blocking finding → task `fix_required`; fix, re-review, verify → `complete_task` succeeds only with evidence.
6. Checkbox tampering: flip `[x]` in fixture `tasks.md` without evidence → task NOT completed (SC-011).
7. `propose_plan_change` (add task, major) → `artifact_update_required`; edit fixture artifacts; `refresh_spec_kit_artifacts` → preview + new snapshot + evidence preserved (SC-014).
8. Tamper a fixture file after import → staleness flagged; completion blocked until refresh (FR-064).
9. `validate_spec_kit_completion` → lists uncovered criterion; cover + verify it; complete → invariants pass, `completed`.

## Manual verification checklist

- [ ] Atomic session files after every state change; JSONL history append-only; snapshot dirs immutable
- [ ] No secrets in any agent response or audit event (pattern scan)
- [ ] Killing one stub downstream server does not affect others (SC-008)
- [ ] `cancel_workflow` during a long op drains, then `cancelled`
- [ ] Restart mid-session: phase, tasks, snapshot, active batch restored; unknown-outcome op blocks re-run
- [ ] Guidance-added transition overhead < 1 s p95 with stubs (SC-010)
- [ ] Traceability report shows parsed vs asserted link sources and uncovered criteria

## Pointers

- Tool shapes & behavioral guarantees: `contracts/upstream-mcp-tools.md`
- Config/profile rules & default bindings: `contracts/downstream-config-contract.md`
- Adapter/parser/snapshot/reconciliation contract: `contracts/spec-kit-adapter-contract.md`
- Entities & state machines: `data-model.md`; decisions: `research.md`
