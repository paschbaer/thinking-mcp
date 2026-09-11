# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

**Last updated:** 2026-09-11

## Current Focus

- Base setup of project governance files: root `AGENTS.md` (generated reasoning
  guide + project rules) and `memory-bank/` structure (this directory).
- Knowledge graph index refreshed via `gitnexus analyze --no-stats`
  (`--no-stats` mandatory — see Architecture Map).

## Recent Changes

- 2026-09-11: Created `AGENTS.md` via `agents_guide` tool (Thinking-MCP
  context), customized project-specific conventions section.
- 2026-09-11: Created `memory-bank/` with the 8 base files.
- 2026-09-11: Removed volatile GitNexus stats from AGENTS.md/CLAUDE.md via
  `gitnexus analyze --no-stats`; `--no-stats` is now the mandatory repo command
  (documented in Architecture Map, techContext, lessonsLearned).

## Next Steps

1. Wire memory-bank workflow into daily use: read all files before tasks,
   update `activeContext.md` + `progress.md` + `lessonsLearned.md` at session end.
2. Review open follow-ups in `remaining-work-plan.md` when starting new scopes.
3. Candidate work items: see `progress.md` → "What's left".

## Open Questions

- Scope and feature set of `server-stochasticthinking` (currently a skeleton).
