# Project Brief — Thinking-MCP

> Foundation document. Defines the core requirements and goals of the project.
> All other memory-bank files build on this. Update when the project scope changes.

## Project Identity

- **Name:** `@paschbaer/thinking-mcp` (v0.0.1, private monorepo)
- **Owner:** paschbaer
- **Repository:** https://github.com/paschbaer/thinking-mcp.git
- **License:** MIT

## Core Goal

Provide **thinking-focused MCP servers** that give coding agents structured
reasoning and problem-solving capabilities:

1. **`server-clear-thought`** (`@paschbaer/clear-thought`, v0.2.0) — MCP server
   for systematic thinking, mental models, debugging approaches, and memory
   management. 39 registered tools — 33 individual (incl. the risk family
   and recipe_runner) plus 6 grouped toolsets.
2. **`server-stochasticthinking`** (`@paschbaer/stochasticthinking`, v0.1.1) —
   stochastic decision server: mdp/mcts/bandit/bayesian/hmm compute real,
   measured results (bandit runs persist per session); HTTP + stdio.

## Key Requirements

- Tools must be callable **individually** and via **grouped toolsets**
  (`reasoning`, `visualization`, `utility`, `session`) — both call paths are
  equivalent.
- Server-side session state per MCP session (accumulated stats, history).
- Shipped agent documentation: `AGENTS.template.md` must stay in sync with
  `AGENTS_TEMPLATE` (enforced by `tests/agents-guide.test.ts`).
- Deployable via npm, Docker, and Smithery.

## Success Criteria

- All vitest suites in `servers/server-clear-thought/tests/` pass.
- Toolset calls and individual tool calls produce identical behavior.
- Guide/template sync test stays green whenever tool docs change.
