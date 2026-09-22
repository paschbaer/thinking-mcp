# Contract: Project Configuration Files (`.guidance/`)

Feature: specs/002-guidance-workflow-server · Canonical format: JSON (clarified). Fail-closed loading (FR-009): any violation blocks session start with `configuration_invalid`.

## Files

| File | Purpose |
|---|---|
| `guidance.json` | version, project, file references, state dir, orchestration defaults, security flags, **profile resolution** (`profile` key; `integrations.spec-kit.*` keys imply `spec-kit` per FR-060) |
| `workflow.json` | workflow id, profile reference, initialPhase, terminal states, phases: response ref, submission schema ref, lifecycle ops, transitions |
| `responses.json` | per-phase `{ title, instruction, requiredActions }` (incl. profile `spec-kit-*` responses) |
| `operations.json` | logical operations (process / mcpTool / mcpResource / mcpPrompt / composite / sampling / elicitation) |
| `downstream-servers.json` | server definitions: transport (stdio/http), trust level, capability allowlist, connections, environment allowlist |
| `policies.json` | trust/egress/approval/redaction/exposure defaults; Spec-Kit validation severities; plan-change approval policy |
| `profiles/spec-kit.json` | profile config: discovery (featureRoot `specs`, strategy `explicit` + fallbacks, branch mapping), artifact mappings (specification/plan/tasks required; research/dataModel/quickstart/contracts/checklists optional), validation flags, taskExecution (`batch`, max 3), `markdownCheckboxPolicy: "hint"`, plan-change triggers, completion invariants (FR-060–075) |
| `schemas/<phase>.schema.json` | submission schemas, draft 2020-12, `additionalProperties: false` |
| `state/` | `sessions/`, `history/`, `operation-results/`, `snapshots/` |

## Default downstream bindings (FR-056, unchanged)

GitNexus (`gitnexus mcp`; `repository-analysis` required at complete.beforeExit with explicit local-command fallback chain, FR-055) · Insight (`insight-mcp serve`; `query-project-insights` optional at understand.afterEnter, `store-completion-insight` optional at complete.beforeExit) · Memory (configurable executable; optional lifecycle ops). All independently disable-able.

## Config loader rules

1. Unknown top-level keys rejected; JSON only (YAML never accepted).
2. Every lifecycle operation id resolves; MCP ops map to allowlisted capabilities (FR-034/048) — else session start aborts.
3. Template variables resolve against the closed namespace; unknown vars fail preparation.
4. Destructive/credential-sensitive ops without authorization entry rejected (FR-053).
5. Profile resolution per FR-060 recorded in `configurationVersion` (sha256).
6. Spec-Kit profile keys (featureRoot, artifact patterns) validated as workspace-relative, canonicalizable paths (FR-061).

## Contract tests (write FIRST)

- Minimal plain config starts a session; each violation class yields `configuration_invalid` with precise path.
- Implied profile: enabling `integrations.spec-kit` or configuring a feature root without `profile` resolves to `spec-kit` (FR-060).
- YAML input rejected. Schema hash stability across loads. Profile config with `featureRoot` escaping the workspace rejected.
