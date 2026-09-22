# Guidance MCP Server (@paschbaer/guidance)

Configurable MCP workflow orchestrator with an optional Spec-Kit integration
profile. Defined by `specs/002-guidance-workflow-server/spec.md` (v1 + v2 + v2.1).

## Status

Implementation in progress — see `specs/002-guidance-workflow-server/tasks.md`
for the task list and current phase.

## Build & test

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Run

```bash
npm start           # stdio transport
npm run start:http  # HTTP transport (loopback-only, FR-027)
```

## Configuration

Projects configure Guidance in a `.guidance/` directory (JSON only). See
`examples/default-guidance/` for the default configuration set and
`specs/002-guidance-workflow-server/contracts/downstream-config-contract.md`
for the contract.
