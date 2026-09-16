# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@paschbaer/clear-thought` | Sequential thinking tools, mental models, debugging approaches, risk analysis (pre-mortem, FMEA, fault trees), causal & game-theoretic analysis, Fermi estimation, guided workflow recipes, and stochastic decision algorithms (MDP, MCTS, bandit, Bayesian optimization, HMM) |

> **Merged:** the former `@paschbaer/stochasticthinking` server is now part of
> Clear Thought (toolset `stochastic`). The standalone package is deprecated —
> see [Migration from `@paschbaer/stochasticthinking`](#migration-from-paschbaerstochasticthinking).

## Quick Start

No checkout needed — MCP clients run the server directly via npx:

```json
{
  "mcpServers": {
    "clear-thought": {
      "command": "npx",
      "args": ["-y", "@paschbaer/clear-thought"]
    }
  }
}
```

Prefer HTTP instead of stdio? Run the Docker image (see [Docker](#docker)) and
point your client at `http://localhost:3000`.

## What you get

~45 tools, callable **individually** or via **grouped toolsets** — both call
paths behave identically. Toolset calls use a conventional `operation`
discriminator: `stochastic { operation: 'mdp', problem, parameters }` ≡
`stochasticalgorithm { algorithm: 'mdp', … }`.

| Toolset | Operations (selection) |
|---|---|
| `reasoning` (15) | `sequential_thinking`, `mental_model`, `debugging_approach`, `decision_framework`, `socratic_method`, `scientific_method`, `argument_map`, `causal_graph`, `fermi_estimate`, `game_matrix`, … |
| `visualization` | `mind_map`, `concept_map`, `fishbone_diagram`, `swot_analysis`, `issue_tree`, `visual_reasoning` |
| `risk` | `premortem`, `fmea`, `fault_tree` |
| `utility` | `assumption_xray`, `value_of_information`, `comparative_advantage`, `agents_guide`, … |
| `stochastic` | `mdp`, `mcts`, `bandit`, `bayesian`, `hmm` (real, measured computations; bandit runs persist per session via `runId`) |
| `workflow` | `recipe_runner` — guided multi-tool recipes (7: debug-failure, architecture-decision, stress-test-conclusion, open-ended-ideation, multi-agent-delegation, long-research-question, decision-under-uncertainty) |
| `session` | `session_info`, `session_export`, `session_import`, `session_save`, `session_load` — reasoning state survives context compaction |

The server also exposes 7 workflow **prompts** and 4 session **resources**
(`clear-thought://session/{stats,export,thoughts,workflows}`).

📖 Full tool reference with parameters, responses and usage examples:
[Clear Thought — Tool Reference](./servers/server-clear-thought/README.md#tool-reference)

## Using it with your coding agent

**Agent Guide.** Copy [`AGENTS.template.md`](./servers/server-clear-thought/AGENTS.template.md)
to your project root as `AGENTS.md` — it is written for LLM consumption
(tool routing table, recipes, usage rules). Alternatively, let your agent call
the `agents_guide` tool: it renders the guide for your project and can merge
it idempotently into an existing `AGENTS.md` (marker-based, repeat calls
update in place). Prompt examples: [Agent Guide](./servers/server-clear-thought/README.md#agent-guide).

**Claude Skill.** Prefer the skill mechanism over an `AGENTS.md`? Generate
the user-level skill (~/.claude/skills/clear-thought/SKILL.md) from a source
checkout — it always matches the shipped tools:

```bash
cd servers/server-clear-thought
npm run sync:skill            # writes ~/.claude/skills/clear-thought/SKILL.md
npm run sync:all              # guide + skill in one go
```

The generator derives the skill from `AGENTS.template.md` (single source of
truth) and fails loudly if the toolset table drifts from the wired
registries. Details: [Guide & skill codegen](./servers/server-clear-thought/README.md#guide--skill-codegen-maintainers).

## Development

Minimal loop for contributors; the full developer & maintainer documentation
(build, tests, tool registration conventions, codegen chain, publishing,
benchmark harness) lives in the
[server README](./servers/server-clear-thought/README.md#development):

```bash
corepack enable   # activates the pinned Yarn 4 version
yarn install
yarn build        # build all workspaces
yarn test         # run all tests
```

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

## Publishing (maintainers)

Releases are automated: on every release merge (`develop` → `main`) GitHub
Actions publish npm (`publish-npm.yml`, version-guarded, OIDC provenance),
containers to ghcr (`publish-containers.yml`), and the Smithery bundle
(`publish-smithery.yml`). Full setup, one-time secrets and manual publishing:
[Publishing (maintainers)](./servers/server-clear-thought/README.md#publishing-maintainers).

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
