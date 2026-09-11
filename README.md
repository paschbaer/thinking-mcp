# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@waldzellai/clear-thought` | Sequential thinking tools, mental models, debugging approaches, and memory management |
| [Stochastic Thinking](./servers/server-stochasticthinking) | `@waldzellai/stochasticthinking` | Stochastic algorithms and probabilistic decision making |

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
yarn workspace @waldzellai/clear-thought build
yarn workspace @waldzellai/clear-thought test
yarn workspace @waldzellai/stochasticthinking build
```

## Deployment (Smithery)

```bash
yarn smithery:clear-thought
yarn smithery:stochastic
```

Pushes to `main` that touch `servers/*/smithery.yaml`, `servers/*/src/**`, or `servers/*/Dockerfile` trigger the [Smithery deploy workflow](./.github/workflows/smithery.yml). The workflow requires the `SMITHERY_TOKEN` secret.

## Docker

```bash
yarn docker   # builds the clear-thought image (waldzellai/clear-thought)
```

The stochastic server image can be built with `docker build -t waldzellai/stochasticthinking servers/server-stochasticthinking`.

## License

MIT — see [LICENSE](./LICENSE) and the per-server `LICENSE` files.
