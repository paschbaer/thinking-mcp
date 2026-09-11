# Tech Context — Thinking-MCP

> Technologies, setup, commands, and constraints.

## Stack

- **Language:** TypeScript (ESM, `type: module`), Node.js >= 18 (repo root;
  server requires >= 20 — see its `engines` field)
- **Monorepo:** yarn 4.6.0 workspaces (`servers/*`); scripts also run via npm
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.30.0, `@smithery/sdk` ^1.4.3
- **Validation:** `zod` ^3.25.27, `zod-to-json-schema` ^3.22.4
- **HTTP server:** `express` ^4.18.2 (Streamable HTTP transport)
- **Tests:** vitest (`servers/server-clear-thought/tests/`)
- **Formatting:** prettier
- **Code intelligence:** GitNexus index (repo name: `thinking-mcp`);
  rebuild with `gitnexus analyze --no-stats` (`--no-stats` is mandatory here —
  keeps AGENTS.md/CLAUDE.md free of volatile counts)

## Structure

```
servers/
  server-clear-thought/     # main server (v0.0.5)
    src/
      index.ts              # createClearThoughtServer factory (Smithery-compatible)
      dev.ts                # stdio entry (StdioServerTransport, `npm run dev`)
      server.ts             # express/http entry (Streamable HTTP, `npm start`)
      config.ts             # defaultConfig
      state/SessionState.ts # session state + per-domain stores (stores/)
      tools/                # one file per tool + index.ts (registerTools)
      toolsets/             # reasoning, visualization, utility, session, registry
      types/index.ts
    tests/                  # vitest suites incl. agents-guide sync test
    AGENTS.template.md      # shipped agent guide template
  server-stochasticthinking/ # minimal second server
memory-bank/                # this knowledge base
```

## Common Commands

Run from `servers/server-clear-thought/` unless noted:

| Task | Command |
|---|---|
| Build (all workspaces) | `yarn build` (repo root) or `npm run build` |
| Tests (server) | `npx vitest` or `npm test` |
| Live smoke test | `npm run test:live` (`scripts/funktionstest.mjs`) |
| Typecheck | `npm run typecheck` |
| Dev (stdio) | `npm run dev` |
| Dev (http) | `npm run dev:http` |
| Docker | `npm run docker:build` / `docker:run` |
| Smithery deploy | repo root: `npm run smithery:clear-thought` |
| Format | repo root: `npm run format` |

## Constraints

- ESM everywhere — relative imports in `src/` use `.js` extensions.
- Tool registration is duplicated by design: `src/tools/index.ts` registers
  each tool individually AND routes it into a toolset (`src/toolsets/`);
  new tools must do both.
- `AGENTS.template.md`, `AGENTS_TEMPLATE` (src/tools/agents-guide-template.ts)
  and root `AGENTS.md` must stay in sync (tests/agents-guide.test.ts).
- GitNexus rules: run impact analysis before editing symbols; never rename via
  find-and-replace; run detect_changes() before committing.
