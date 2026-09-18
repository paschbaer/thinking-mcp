# Experience Memory MCP Server (EMMS)

Evidence-backed long-term memory layer for coding agents: capture structured
debugging episodes, validate solutions with objective evidence, and retrieve
the most applicable prior experience — with per-response guidance on the
recommended next request.

**Status:** MVP implemented (tasks T001–T048). Functionality is defined by
[`specs/001-experience-memory-server/spec.md`](../../specs/001-experience-memory-server/spec.md)
(source specification: `SDD/experience-memory-mcp-server-specification.md`).

## Implemented tools

`workflow.start`, `workflow.status`, `workflow.abandon`, `experience.search`,
`experience.record_observation`, `experience.record_attempt`,
`experience.complete_attempt`, `experience.propose_hypothesis`,
`experience.propose_solution`, `validation.plan`, `validation.record_run`,
`artifact.attach`, `experience.finalize`, `experience.record_reuse_feedback`,
`experience.mark_regression`, `experience.invalidate`.

Every response carries a guidance envelope (workflow state, missing
information, recommended next request). Storage: embedded SQLite (WAL, FTS5)
with content-addressed evidence files; deterministic pattern redaction before
persistence; optimistic concurrency via workflow revisions.

## Development

```bash
cd servers/server-experiencememory
npm install
npm run dev        # stdio
npm run dev:http   # HTTP (port 3002)
npm test
npm run build
```

## Planned tool families (per spec)

- `workflow.*` — discover, start, status, abandon
- `experience.*` — search, begin, record_observation, record_attempt,
  complete_attempt, propose_hypothesis, propose_solution, finalize, feedback
- `lesson.*` — search, get, propose, review
- `validation.*` — plan, record_run, assess, revalidate
- `artifact.*` — attach, describe

Every tool response MUST include a guidance envelope (workflow state, missing
information, recommended next request) — see spec FR-010…FR-013.
