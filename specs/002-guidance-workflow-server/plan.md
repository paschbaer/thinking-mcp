# Implementation Plan: Guidance — Configurable MCP Workflow Orchestrator with Spec-Kit Integration

**Branch**: `002-guidance-workflow-server` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-guidance-workflow-server/spec.md` (v1 + v2 orchestration + v2.1 Spec-Kit profile; FR-001–075, SC-001–015; 25 recorded clarification decisions)

## Summary

Build `servers/server-guidance`: a dual-role MCP workflow orchestrator. Upstream it exposes workflow tools to coding agents (stdio + loopback-only HTTP); downstream it acts as an MCP client to configured servers (GitNexus, Insight, Memory) and executes workflow-critical operations itself. The workflow engine enforces the seven-phase process with configuration-driven instructions, strict JSON-Schema submission validation, atomic file persistence, append-only audit history, and validated operation results gating transitions. The opt-in `spec-kit` profile adds a read-only artifact adapter (feature discovery with exclusive per-feature session locks, deterministic import, immutable snapshots), persistent task entities with a dependency-aware scheduler (fixed satisfaction set: `completed`/`verified`), evidence-gated task completion, requirements-to-verification traceability (with user-approved criterion waivers), controlled plan changes (closed trigger list, deterministic classification, atomic reconciliation), and Spec-Kit completion invariants.

## Technical Context

**Language/Version**: TypeScript 5.3, Node.js ≥ 18, ESM (`"type": "module"`), strict tsconfig (repo convention, mirrors `servers/server-insight`)

**Primary Dependencies**: `@modelcontextprotocol/sdk` (^1.30, upstream server + downstream clients), `ajv` (JSON Schema validation; canonical config/schema format is JSON), `zod` (upstream tool-input parsing), `express` (loopback-only HTTP transport). No markdown AST library (see research R11); no database.

**Storage**: File-based — atomic session state (tmp+rename), append-only JSONL audit history, per-execution raw operation results, immutable artifact snapshots under `.guidance/state/` (configurable)

**Testing**: vitest; in-process stub downstream MCP servers (SDK-based) for fault injection; fixture Spec-Kit feature directories for adapter/parser tests; contract tests first (Test-First constitution principle)

**Target Platform**: Linux/macOS/WSL single-process server; stdio + HTTP (loopback only, FR-027)

**Project Type**: MCP server package (`servers/server-guidance`, isolated per constitution Principle V)

**Performance Goals**: Guidance-added orchestration overhead < 1 s (p95) per phase transition excluding operation run time (SC-010); staleness pre-checks must be O(artifact count) stat calls (FR-064 tiered scheme)

**Constraints**: loopback-only HTTP (FR-027); fail-closed config/operations; strict `additionalProperties: false` submissions (FR-030); graceful cancellation (FR-057); unknown-outcome ops never silently re-run (FR-043); read-only artifact adapter (FR-072); Markdown artifacts treated as untrusted data (FR-049, FR-075); exclusive per-feature session lock (FR-061); fixed dependency-satisfaction set {`completed`, `verified`} (FR-067); closed plan-change triggers with deterministic classification (FR-072); atomic reconciliation apply (FR-073); checklist-derived defaults from spec Assumptions (concurrency 1, excerpt/task/entity limits, parser-upgrade ⇒ stale, severity→blocking mapping) land in the default configuration

**Scale/Scope**: single server per workspace; 7 phases; ~27 upstream tools (15 v1/v2 + 12 profile); 3 default downstream bindings; profiles: plain (default) + `spec-kit` (implied by Spec-Kit config keys, FR-060)

## Constitution Check

*GATE: passed pre-research; re-checked post-design: PASS.*

| Principle | Status | Evidence |
|---|---|---|
| I. Reasoning Before Action | PASS | clear-thought sequential decisions recorded in research.md; GitNexus `impact` required before implementation edits |
| II. Evidence-Backed Changes | PASS | SC-002/005/008/009/010/011–015 are test-verified outcomes; task completion itself is evidence-gated by design |
| III. Test-First (NON-NEGOTIABLE) | PASS | tasks.md must order parser/adapter contract fixtures + stub-based contract tests before implementation |
| IV. Memory Bank as Source of Truth | PASS | tracked follow-ups persisted in `remaining-work-plan.md`; session-end `activeContext.md`/`progress.md` updates required |
| V. Server Isolation & Vendor Neutrality | PASS | isolated `servers/server-guidance` package; MCP transports only; Spec-Kit integration is read-only over files — no Spec-Kit code dependency |
| Security & Supply Chain | PASS | artifacts as untrusted data (FR-075), secrets via references (FR-050), destructive ops gated (FR-053), pinned deps |
| Workflow & Quality Gates | PASS | feature branch; tests + review + README per commit; `gitnexus analyze --no-stats` + `detect_changes` pre-commit |

**Post-design re-check**: PASS — the Spec-Kit adapter adds read-only file I/O within the workspace boundary; no new constitutional surface. Complexity tracking table remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-guidance-workflow-server/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── upstream-mcp-tools.md
│   ├── downstream-config-contract.md
│   ├── operation-result-contract.md
│   └── spec-kit-adapter-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
servers/server-guidance/
├── package.json             # @paschbaer/guidance (ESM, bin: mcp-server-guidance)
├── tsconfig.json / tsconfig.build.json / vitest.config.ts
├── Dockerfile / docker-compose.yml / README.md
├── scripts/                 # build-mcpb.mjs etc.
├── src/
│   ├── index.ts             # stdio entry (bin)
│   ├── server.ts            # HTTP entry (loopback-only)
│   ├── config.ts            # JSON config load/validate/hash; profile resolution (FR-060)
│   ├── mcp-server/          # upstream surface: workflow + orchestration + profile tools
│   ├── mcp-client/          # ClientManager, ClientConnection, CapabilityDiscovery, transports
│   ├── orchestration/       # OperationEngine, registry, resolver, normalizer, validator, retry, composite
│   ├── workflow/            # WorkflowEngine, PhaseLifecycle, TransitionValidator
│   ├── integrations/
│   │   └── spec-kit/        # FeatureDiscovery, ArtifactDiscovery/Importer/Parser/Validator,
│   │                        # SnapshotManager, ReconciliationEngine, RequirementNormalizer,
│   │                        # TaskNormalizer, DependencyGraph, TaskScheduler, TraceabilityGraph,
│   │                        # CompletionValidator, PlanChangeService, types
│   ├── policy/              # allowlists, egress, approval (ElicitationService), workspace policies
│   ├── state/               # SessionRepository (atomic), AuditRepository (JSONL),
│   │                        # OperationRepository, SnapshotStore, locks
│   └── types/
└── tests/
    ├── contract/            # tool/config/operation/adapter contracts (FIRST)
    ├── fixtures/            # fixture Spec-Kit feature directories (valid + fault variants)
    ├── orchestration/       # stub downstream servers: success/fail/timeout/drift/injection/idempotency
    ├── speckit/             # parser, validation, snapshots, reconciliation, scheduler, traceability
    ├── workflow/            # phase machine, transitions, completion invariants (both profiles)
    └── integration/         # end-to-end 7-phase flows (plain + spec-kit), restart recovery
```

**Structure Decision**: single isolated server package; the Spec-Kit adapter is a self-contained `src/integrations/spec-kit/` module behind a narrow interface so the workflow engine depends only on logical artifact/task types, never on Markdown specifics.

## Complexity Tracking

> No constitutional violations — table intentionally empty.
