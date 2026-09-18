# Implementation Plan: Experience Memory Server (EMMS)

**Branch**: `001-experience-memory-server` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-experience-memory-server/spec.md`

## Summary

Build the Experience Memory MCP Server (`servers/server-experiencememory`): a
vendor-neutral, evidence-backed long-term memory layer for coding agents.
Agents capture structured experience episodes (goal, observations, attempts,
hypotheses, solutions, validation), receive a per-response guidance envelope
recommending the next request, and retrieve the most applicable prior
experience via hybrid matching (exact/normalized signatures + full-text in the
MVP; semantic arm behind the same interface later). Verification requires
objective evidence; negative knowledge is first-class; visibility boundaries
and audit trails apply from day one.

## Technical Context

**Language/Version**: TypeScript 5.3, Node.js >= 18 (ESM)

**Primary Dependencies**: @modelcontextprotocol/sdk, @smithery/sdk, express, zod, better-sqlite3

**Storage**: Pluggable interface; embedded SQLite default; PostgreSQL+pgvector adapter (team phase). Evidence artifacts as content-addressed files beside the store.

**Testing**: vitest (unit + contract tests); golden-path scenarios in quickstart.md

**Target Platform**: Local developer machine; stdio transport (primary), HTTP via Smithery stateful server (secondary, port 3002)

**Project Type**: MCP server (scaffold already at `servers/server-experiencememory`)

**Performance Goals**: Interactive search perceived as instant (<1.5 s at target corpus size); ordinary mutations well under 1 s

**Constraints**: Fully offline-capable in MVP; no external services (embedding, scanning); secrets never routed through model-visible channels; no physical deletion of experiences (FR-034)

**Scale/Scope**: Single developer, one repository family, ~10^3–10^4 episodes; 32 functional requirements; MVP tool families: workflow, experience, validation, artifact (lesson.* deferred to consolidation phase but schema-reserved)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Reasoning Before Action | PASS | clear-thought structured review performed (see memory-bank/activeContext.md 2026-09-17); 5 plan-level findings resolved as first design decisions in research.md |
| II. Evidence-Backed Changes | PASS | Design decisions carry Decision/Rationale/Alternatives in research.md; acceptance tests map to SC-001..SC-010 |
| III. Test-First (NON-NEGOTIABLE) | PASS | tasks.md (Phase 2) MUST sequence contract tests before implementation; quickstart.md defines golden paths as executable validation |
| IV. Memory Bank as Source of Truth | PASS | Findings persisted in activeContext.md + remaining-work-plan.md; progress updates continue during implementation |
| V. Server Isolation & Vendor Neutrality | PASS | New isolated server directory; no clear-thought/stochastic imports; MCP stdio+HTTP transports; guidance documents stay free of generated content |

No gate violations.

## Resolution of Review Findings (first design decisions)

The five required findings from the 2026-09-17 spec review are resolved as
design decisions D1–D5; full rationale in [research.md](./research.md):

1. **Actor model (D1)**: Actor = `{actor_type: agent|human|system, actor_id}`. In the MVP there is exactly one implicit tenant ("local"); `actor_id` comes from `client_context.agent_id`, defaulting to `"local-agent"`; human actors exist only via audit records for privileged operations.
2. **Revision semantics (D2)**: Each workflow carries a monotonically increasing integer `revision` (starting at 1). Every mutating request MUST pass `expected_revision`; on mismatch the server returns recoverable error `STALE_REVISION` with the current revision and a corrected recommended request. No silent overwrite; no locking.
3. **Evaluation corpus (D3)**: Minimum 30 tasks per the source SDD, of which at least 3 golden end-to-end paths are executable from `quickstart.md` (verified capture→finalize→search→retrieve; incompatible-environment demotion; known-bad-attempt avoidance). Fixtures live under `servers/server-experiencememory/tests/fixtures/`.
4. **Guidance object schema (D4)**: zod-validated `GuidanceEnvelope` — `workflow_id`, `workflow_state`, `revision`, `missing_information[]`, `allowed_next_tools[]`, `warnings[]`, `recommended_next_request {tool, reason, arguments_template}`, `human_approval {required, reason?}`. Full contract in [contracts/guidance.md](./contracts/guidance.md).
5. **FR-021 thresholds (D5)**: Duplicate = identical normalized failure-signature hash AND ≥0.8 similarity of goal text. Contradiction = same normalized signature hash AND opposing attempt classifications (successful vs harmful/ineffective) each backed by at least one evidence artifact. Detection runs at episode finalize and at search time (flag only).

## Project Structure

### Documentation (this feature)

```text
specs/001-experience-memory-server/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── tools.md         # MCP tool surface contracts
│   └── guidance.md      # Guidance envelope schema
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

```text
servers/server-experiencememory/
├── package.json         # scaffolded
├── tsconfig*.json       # scaffolded
├── src/
│   ├── index.ts         # server factory (scaffolded)
│   ├── server.ts        # HTTP transport (scaffolded)
│   ├── dev.ts           # stdio transport (scaffolded)
│   ├── config.ts        # config schema (scaffolded)
│   ├── domain/          # entities, state machines, revision logic
│   ├── storage/         # StorageAdapter interface + SQLiteAdapter
│   ├── retrieval/       # signature, full-text, (later: semantic) arms + ranking
│   ├── guidance/        # guidance envelope computation
│   ├── evidence/        # content-addressed artifact store + redaction
│   └── tools/           # MCP tool registrations per contracts/tools.md
└── tests/
    ├── contracts/       # schema/contract tests (written FIRST)
    ├── fixtures/        # evaluation corpus tasks (D3)
    └── unit/            # state machine, revision, ranking unit tests
```

**Scope note**: `apps/admin-ui`, federation, lesson consolidation workers are
out of MVP scope; lesson entities are schema-reserved only.

### MVP operational constraints (resolved checkpoints)

- **Store growth (CHK034)**: target corpus 10^3–10^4 episodes; no cap enforced in MVP; store size logged at startup. Growth governance is a team-phase concern.
- **Backup/restore (CHK038)**: MVP backup = manual file copy of the SQLite store plus the artifacts directory while the server is stopped; automated backup/restore tooling is team-phase scope.
- **FTS5 dependency (CHK042)**: the embedded SQLite build MUST include FTS5; if unavailable at startup the server fails fast with a clear error instead of silently degrading search.
