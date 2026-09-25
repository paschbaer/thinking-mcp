# Thinking-MCP

Monorepo of "thinking"-focused MCP (Model Context Protocol) servers, extracted from [waldzell-mcp](https://github.com/waldzellai/waldzell-mcp).

## Servers

| Server | Package | Description |
|--------|---------|-------------|
| [Clear Thought](./servers/server-clear-thought) | `@paschbaer/clear-thought` | Sequential thinking tools, mental models, debugging approaches, risk analysis (pre-mortem, FMEA, fault trees), causal & game-theoretic analysis, Fermi estimation, guided workflow recipes, and stochastic decision algorithms (MDP, MCTS, bandit, Bayesian optimization, HMM) |
| [Insight](./servers/server-insight) | `@paschbaer/insight` | Evidence-backed long-term experience memory for coding agents: capture structured debugging episodes, validate fixes with objective evidence, hybrid retrieval (exact/normalized signatures + full-text + local semantic embeddings), per-response guidance on the next recommended request, visibility isolation and audit. Setup via `/setup-insight` prompt file (see server README). MVP; spec-driven |
| [Guidance](./servers/server-guidance) | `@paschbaer/guidance` | Configurable workflow orchestrator: phases, transitions, agent instructions, validation schemas and security policies live in project-owned `.guidance/` config; drives coding agents through structured development loops (understand → plan → implement → verify) with downstream operation gates (lint/test/build), optional Spec-Kit integration profile, stdio + streamable-HTTP transports. Spec-driven |

> **Merged:** the former `@paschbaer/stochasticthinking` server is now part of
> Clear Thought (toolset `stochastic`). The standalone package is deprecated —
> see [Migration from `@paschbaer/stochasticthinking`](#migration-from-paschbaerstochasticthinking).

## Quick Start

No checkout needed — MCP clients run the servers directly via npx:

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

**Verify it works:** restart your client and check that the Clear Thought tools
appear (e.g. call `session_info` — it should echo session stats).

**Other servers** (same `npx -y <package>` pattern, each with its own tools):

- [Insight](./servers/server-insight/README.md) (`@paschbaer/insight`) —
  experience memory; HTTP variant: `http://localhost:3002/mcp`
- [Guidance](./servers/server-guidance/README.md) (`@paschbaer/guidance`) —
  workflow orchestrator; needs a `.guidance/` config in your repo (see its
  [README](./servers/server-guidance/README.md))

Prefer HTTP instead of stdio? Run the prebuilt Docker image
`ghcr.io/paschbaer/clear-thought` (no build required — see
[Docker](#docker)) and point your client at `http://localhost:3000/mcp`.

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
| `utility` | `assumption_xray`, `value_of_information`, `comparative_advantage`, `setup_clearthought`, … |
| `stochastic` | `mdp`, `mcts`, `bandit`, `bayesian`, `hmm` (real, measured computations; bandit runs persist per session via `runId`) |
| `workflow` | `recipe_runner` — guided multi-tool recipes (7: debug-failure, architecture-decision, stress-test-conclusion, open-ended-ideation, multi-agent-delegation, long-research-question, decision-under-uncertainty) |
| `session` | `session_info`, `session_export`, `session_import`, `session_save`, `session_load` — reasoning state survives context compaction |

The server also exposes 7 workflow **prompts** and 4 session **resources**
(`clear-thought://session/{stats,export,thoughts,workflows}`).

📖 Full tool reference with parameters, responses and usage examples:
[Clear Thought — Tool Reference](./servers/server-clear-thought/README.md#tool-reference)

## Guidance — structured development workflows

[Guidance](./servers/server-guidance) is a **workflow orchestrator**: instead of
adding thinking tools, it puts the *development process itself* under
project-owned configuration. A `.guidance/` directory in your repository defines
the phases (understand → plan → review → implement → review-fix → verify →
complete), the agent instruction for each phase, strict JSON-Schemas for every
submission, lifecycle operation gates (e.g. lint/test/build must pass before
completion) and security policies (egress, redaction, approval gates). The
agent is driven through the loop with 17 workflow tools (`start_workflow`,
`get_current_guidance`, `submit_*`, `report_blocker`, …); an optional
**Spec-Kit profile** adds 12 tools for spec-driven task execution with
evidence-gated completion.

```bash
# stdio (local agent)
cd servers/server-guidance && npm install && npm run build
node dist/index.js        # workspace = cwd, config from ./.guidance/

# or HTTP via Docker
cd servers/server-guidance && docker compose up -d   # http://localhost:3003/mcp
```

Intro, configuration reference and agent-usage examples:
[Guidance README](./servers/server-guidance/README.md).

## Using it with your coding agent

**Agent Guide.** Copy [`AGENTS.template.md`](./servers/server-clear-thought/AGENTS.template.md)
to your project root as `AGENTS.md` — it is written for LLM consumption
(tool routing table, recipes, usage rules). Alternatively, let your agent call
the `setup_clearthought` tool: it renders the guide for your project and can merge
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

Requires Node.js >= 20 (the root and all server packages declare `engines.node`
`>=20`). Yarn 4 is pinned via `packageManager` in `package.json`.

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

**MCP client configuration (HTTP transport)** — the Streamable HTTP endpoint is
`http://localhost:3000/mcp`:

```json
{
  "mcpServers": {
    "clear-thought": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

> Some clients name the transport differently (`"streamable-http"` instead of
> `"http"`) or wrap it in a `remoteServers`/`remote` block — the URL stays the
> same. A prebuilt image is also available at
> `ghcr.io/paschbaer/clear-thought` (`latest` + release tags), so a plain
> `docker run ghcr.io/paschbaer/clear-thought` works without building.

### Running the combined stack

The **root `docker-compose.yml`** is the canonical entry point — it starts both
servers as one project (`thinking-mcp-insight-1`, `thinking-mcp-clear-thought-1`):

```bash
docker compose up -d          # from the repo root
```

- **insight**: `http://localhost:3002/mcp` (store persisted on the host in
  `servers/server-insight/emms-data/`)
- **clear-thought**: `http://localhost:3000/mcp`

> Each server folder also has its own `docker-compose.yml` for standalone
> development. Note that Docker Compose derives the project name from the
> directory of the compose file, so starting from a server folder creates a
> **separate project** (`server-insight-insight-1`, …) with different container
> names than the root stack. Pick one entry point and stick with it; when
> container names look unfamiliar, `docker compose ls` lists all active
> projects.

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
