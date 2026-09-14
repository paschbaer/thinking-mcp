# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@paschbaer/clear-thought` | Sequential thinking tools, mental models, debugging approaches, risk analysis (pre-mortem, FMEA, fault trees), causal & game-theoretic analysis, Fermi estimation, and guided workflow recipes |
| [Stochastic Thinking](./servers/server-stochasticthinking) | `@paschbaer/stochasticthinking` | Stochastic algorithms and probabilistic decision making |

📖 **Detailed tool documentation** — every tool with parameters, responses,
and workflow recipes — lives in each server's README:

- [Clear Thought — Tool Reference & Usage](./servers/server-clear-thought/README.md)
- [Stochastic Thinking — Tool Reference & Usage](./servers/server-stochasticthinking/README.md)

## Development

Requires Node.js >= 20 (both server packages declare `engines.node` `>=20`).
Yarn 4 is pinned via `packageManager` in `package.json`.

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
yarn workspace @paschbaer/stochasticthinking test
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

The server is then reachable at `http://localhost:3001`.

The server also supports **stdio** for MCP clients that spawn it directly: use the npm bin `mcp-server-stochasticthinking` (stdio entry `dist/dev.js`, optional `debug` config).

## Publishing

Both servers are published to the [Smithery registry](https://smithery.ai) as MCPB bundles. Maintainers publish via each server's tooling — see the **Publishing (maintainers)** sections in the [Clear Thought](./servers/server-clear-thought/README.md#publishing-maintainers) and [Stochastic Thinking](./servers/server-stochasticthinking/README.md#publishing-maintainers) READMEs.

On every release merge (`develop` → `main`) GitHub Actions publish automatically:

- **npmjs.com** — `@paschbaer/clear-thought` + `@paschbaer/stochasticthinking` (`.github/workflows/publish-npm.yml`; only when the package version changed, provenance attested). One-time setup: either configure a **Trusted Publisher** on each npm package (repo `paschbaer/thinking-mcp`, workflow `publish-npm.yml`) or add an `NPM_TOKEN` repository secret.
- **GitHub Container Registry** — `ghcr.io/paschbaer/clear-thought` + `ghcr.io/paschbaer/stochasticthinking`, tagged `latest` + package version + sha (`.github/workflows/publish-containers.yml`; images run the HTTP server on port 3000). One-time setup: flip the created packages to **public** in their package settings.

## Acknowledgments

- **Clear Thought** is a maintained fork of the original Clear Thought MCP
  server by glassBead ([@waldzellai](https://github.com/waldzellai)) — thank
  you for the excellent reasoning-toolset foundation (MIT).
- Built on the [Model Context Protocol](https://modelcontextprotocol.io) by
  Anthropic.

## License

MIT — see [LICENSE](./LICENSE) and the per-server `LICENSE` files.
