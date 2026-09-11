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

1. **`server-clear-thought`** (`@paschbaer/clear-thought`, v0.0.5) — MCP server
   for systematic thinking, mental models, debugging approaches, and memory
   management. ~28 reasoning tools plus grouped toolsets.
2. **`server-stochasticthinking`** — minimal second server (stochastic
   thinking), currently a skeleton (`src/index.ts`).

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
