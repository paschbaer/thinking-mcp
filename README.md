# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@paschbaer/clear-thought` | Sequential thinking tools, mental models, debugging approaches, risk analysis (pre-mortem, FMEA, fault trees), causal & game-theoretic analysis, Fermi estimation, guided workflow recipes, and stochastic decision algorithms (MDP, MCTS, bandit, Bayesian optimization, HMM) |

> **Merged:** the former `@paschbaer/stochasticthinking` server is now part of
> Clear Thought (toolset `stochastic`). The standalone package is deprecated —
> see [Migration from `@paschbaer/stochasticthinking`](#migration-from-paschbaerstochasticthinking).

📖 **Detailed tool documentation** — every tool with parameters, responses,
and workflow recipes — lives in each server's README:

- [Clear Thought — Tool Reference & Usage](./servers/server-clear-thought/README.md)

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
```

## Docker

**Clear Thought** — HTTP MCP server, listens on port `3000` (health endpoint: `/health`):

```bash
docker build -t paschbaer/clear-thought servers/server-clear-thought
docker run -p 3000:3000 paschbaer/clear-thought
```

The server is then reachable at `http://localhost:3000`.

## Publishing

Clear Thought is published to the [Smithery registry](https://smithery.ai) as an MCPB bundle. Maintainers publish via the server's tooling — see the **Publishing (maintainers)** section in the [Clear Thought](./servers/server-clear-thought/README.md#publishing-maintainers) README. On release merges (`develop` → `main`), the `publish-smithery.yml` workflow also republishes automatically (version-guarded; requires the `SMITHERY_API_KEY` repository secret — the `smry_…` token from `npx @smithery/cli auth login`).

On every release merge (`develop` → `main`) GitHub Actions publish automatically:

- **npmjs.com** — `@paschbaer/clear-thought` (`.github/workflows/publish-npm.yml`; only when the package version changed, provenance attested). One-time setup: either configure a **Trusted Publisher** on the npm package (repo `paschbaer/thinking-mcp`, workflow `publish-npm.yml`) or add an `NPM_TOKEN` repository secret.
- **GitHub Container Registry** — `ghcr.io/paschbaer/clear-thought`, tagged `latest` + package version + sha (`.github/workflows/publish-containers.yml`; the image runs the HTTP server on port 3000). One-time setup: flip the created package to **public** in its package settings.

> The `@paschbaer/stochasticthinking` jobs were removed from these workflows in
> the course of the server merge; the deprecated npm package remains installable
> but unmaintained.

## Migration from `@paschbaer/stochasticthinking`

The stochastic algorithms (MDP, MCTS, bandit, Bayesian optimization, HMM) are
now part of the Clear Thought server — including **per-session bandit `runId`
continuation** and the new `decision-under-uncertainty` recipe.

1. Replace the server entry in your MCP client config:
   `@paschbaer/stochasticthinking` → `@paschbaer/clear-thought`.
2. Tool calls keep working unchanged: the tool name `stochasticalgorithm` and
   its arguments (`algorithm`, `problem`, `parameters`) are identical.
3. Optionally use the grouped toolset `stochastic` with the conventional
   `operation` discriminator:
   `stochastic { operation: 'mdp', problem, parameters }`.

Parameter reference: [Stochastic Thinking README — Tool Reference](./servers/server-stochasticthinking/README.md#tool-reference)
(the deprecated package's README remains as the algorithm parameter reference).

## Benchmark

The Clear Thought server ships an LLM benchmark harness ("hard set") that
measures whether the tools measurably improve model answers. The same four
computation-forcing tasks are solved twice — bare (baseline) and with the
MCP server attached — and both answers are scored 0–40 by an independent
judge model against ground-truth rubrics (exact fault-tree probability,
iterated dominance + closed-form mixed equilibrium, Fermi + value of
information, and a stateful bandit run that must continue via `runId`
across tool calls).

Latest run (2026-09-15, actor `glm-5.3-flash`, judge `glm-5.3`, Z.AI):

| Task | Baseline | With server | Δ |
|---|---:|---:|---:|
| Fault-tree exact probability | 24/40 | 40/40 | +16 |
| Iterated-dominance game (mixed equilibrium) | 37/40 | 38/40 | +1 |
| Fermi estimation + value of information | 40/40 | 40/40 | 0 |
| Bandit `runId` continuation (stateful) | 18/40 | 40/40 | +22 |
| **Total** | **74.4 %** | **98.8 %** | **+24.4 pp** |

**Assessment.** Tool value tracks the *compute gap*: where the server
computes what a model structurally cannot — seeded stateful simulation
(a baseline cannot fabricate cumulative regret across calls) and exact
combinatorial enumeration — answers are perfect with large deltas. Where
the model is already strong (game theory, Fermi arithmetic), tools stay
neutral rather than harmful once the harness hardening (verbatim-parameter
operator briefing, tool-call logging, per-role reasoning control) removed
the transcription-failure class. Full protocol and configuration:
[servers/server-clear-thought — Benchmark](./servers/server-clear-thought/README.md#benchmark-llm-task-evals)
and [`servers/server-clear-thought/evals/`](./servers/server-clear-thought/evals/README.md).

## Acknowledgments

- **Clear Thought** is a maintained fork of the original Clear Thought MCP
  server by glassBead ([@waldzellai](https://github.com/waldzellai)) — thank
  you for the excellent reasoning-toolset foundation (MIT).
- Built on the [Model Context Protocol](https://modelcontextprotocol.io) by
  Anthropic.

## License

MIT — see [LICENSE](./LICENSE) and the per-server `LICENSE` files.
