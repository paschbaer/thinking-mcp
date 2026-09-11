# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@paschbaer/clear-thought` | Sequential thinking tools, mental models, debugging approaches, and memory management |
| [Stochastic Thinking](./servers/server-stochasticthinking) | `@paschbaer/stochasticthinking` | Stochastic algorithms and probabilistic decision making |

## Development

Requires Node.js >= 18. Yarn 4 is pinned via `packageManager` in `package.json`.

```bash
corepack enable   # activates the pinned Yarn version
yarn install
yarn build        # build all workspaces
yarn test         # run all tests
```

Build or test a single server:

```bash
yarn workspace @paschbaer/clear-thought build
yarn workspace @paschbaer/clear-thought test
yarn workspace @paschbaer/stochasticthinking build
```

## Docker

**Clear Thought** — HTTP MCP server, listens on port `3000` (health endpoint: `/health`):

```bash
docker build -t paschbaer/clear-thought servers/server-clear-thought
docker run -p 3000:3000 paschbaer/clear-thought
```

The server is then reachable at `http://localhost:3000`.

**Stochastic Thinking** — HTTP MCP server, listens on port `3000` inside the container (health endpoint: `/health`), published on host port `3001`:

```bash
docker build -t paschbaer/stochasticthinking servers/server-stochasticthinking
docker run -p 3001:3000 paschbaer/stochasticthinking
```

The server is then reachable at `http://localhost:3001`. For stdio-based MCP clients, run the npm bin directly (`mcp-server-stochasticthinking` → stdio entry `dist/dev.js`).

## License

MIT — see [LICENSE](./LICENSE) and the per-server `LICENSE` files.
