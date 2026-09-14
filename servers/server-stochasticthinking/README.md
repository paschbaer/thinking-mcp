# Stochastic Thinking MCP Server

## Why Stochastic Thinking Matters

When AI assistants make decisions - whether writing code, solving problems, or suggesting improvements - they often fall into patterns of "local thinking", similar to how we might get stuck trying the same approach repeatedly despite poor results. This is like being trapped in a valley when there's a better solution on the next mountain over, but you can't see it from where you are.

This server introduces advanced decision-making strategies that help break out of these local patterns:
- Instead of just looking at the immediate next step (like basic Markov chains do), these algorithms can look multiple steps ahead and consider many possible futures
- Rather than always picking the most obvious solution, they can strategically explore alternative approaches that might initially seem suboptimal
- When faced with uncertainty, they can balance the need to exploit known good solutions with the potential benefit of exploring new ones

Think of it as giving your AI assistant a broader perspective - instead of just choosing the next best immediate action, it can now consider "What if I tried something completely different?" or "What might happen several steps down this path?"

A Model Context Protocol (MCP) server that provides stochastic algorithms and probabilistic decision-making capabilities, extending the sequential thinking server with advanced mathematical models.

## Features

### Stochastic Algorithms

#### Markov Decision Processes (MDPs)
- Optimize policies over long sequences of decisions
- Incorporate rewards and actions
- Support for Q-learning and policy gradients
- Configurable discount factors and state spaces

#### Monte Carlo Tree Search (MCTS)
- Simulate future action sequences
- Balance exploration and exploitation
- Configurable simulation depth and exploration constants
- Ideal for large decision spaces

#### Multi-Armed Bandit Models
- Balance exploration vs exploitation
- Support multiple strategies:
  - Epsilon-greedy
  - UCB (Upper Confidence Bound)
  - Thompson Sampling
- Dynamic reward tracking

#### Bayesian Optimization
- Optimize decisions with uncertainty
- Probabilistic inference models
- Configurable acquisition functions
- Continuous parameter optimization

#### Hidden Markov Models (HMMs)
- Infer latent states
- Forward-backward algorithm
- State sequence prediction
- Emission probability modeling

## Usage

### Installation

**npm (recommended):** published as
[`@paschbaer/stochasticthinking`](https://www.npmjs.com/package/@paschbaer/stochasticthinking) —
no checkout needed; MCP clients run it directly:

```json
{
  "mcpServers": {
    "stochasticthinking": {
      "command": "npx",
      "args": ["-y", "@paschbaer/stochasticthinking"]
    }
  }
}
```

**Smithery:** also published on the Smithery registry as
`paschbaer/stochasticthinking` (stdio bundle — local install, no hosted HTTP
endpoint).

**From source:**

```bash
git clone https://github.com/paschbaer/thinking-mcp.git
cd thinking-mcp
corepack enable && yarn install
yarn workspace @paschbaer/stochasticthinking build
```

The stdio entry is then available at
`servers/server-stochasticthinking/dist/dev.js`.

### Publishing (maintainers)

The server is published to the [Smithery registry](https://smithery.ai/servers/paschbaer/stochasticthinking)
via the documented releases API:

```bash
npm run build && npm run build:mcpb && node scripts/publish-smithery.mjs
```

`publish-smithery.mjs` uploads the MCPB bundle with a static server card
(all tool metadata — the quality-score input) and syncs the server record
(display name, homepage, icon, license). Credentials are read from the local
Smithery CLI login (`npx -y @smithery/cli auth login`).

### Running the Server

The server supports both MCP transports:

**stdio** (for MCP clients that spawn the server, e.g. Claude Desktop):

```bash
npm run build
node dist/dev.js     # stdio entry (same as the npm bin target)
# development: npm run dev
```

**HTTP** (Streamable HTTP, for remote/container deployments):

```bash
npm start            # dist/server.js — listens on port 3001 (override: PORT env)
# development: npm run dev:http
```

- `GET /health` — liveness endpoint (`{"status":"ok",...}`)
- `POST /mcp` — MCP endpoint (Streamable HTTP)

### Development

```bash
npm install
npm run build        # tsc -p tsconfig.build.json
npm test             # vitest suite
npm run test:live    # live HTTP smoke test (server must be running)
npm run typecheck
```

### Docker

The Docker image runs the HTTP server (in-container port `3000`, health-checked):

```bash
npm run docker:build
npm run docker:run   # publishes the container on host port 3001
```

### Connecting an MCP Client

**Streamable HTTP** (server already running on port 3001):

```json
{
  "mcpServers": {
    "stochasticthinking": {
      "url": "http://localhost:3001/mcp",
      "type": "http"
    }
  }
}
```

**stdio** (client spawns the server):

```json
{
  "mcpServers": {
    "stochasticthinking": {
      "command": "node",
      "args": ["/absolute/path/to/thinking-mcp/servers/server-stochasticthinking/dist/dev.js"]
    }
  }
}
```

Or the shortest path — run it straight from npm (no checkout):

```json
{
  "mcpServers": {
    "stochasticthinking": {
      "command": "npx",
      "args": ["-y", "@paschbaer/stochasticthinking"]
    }
  }
}
```

Optional server configuration: `{ "debug": false }` (enable debug logging).

## Agent Guide

Building an agent that consumes this server? Copy
[`AGENTS.template.md`](./AGENTS.template.md) to your project root as
`AGENTS.md` — it contains the algorithm routing table (`mdp` / `mcts` /
`bandit` / `bayesian` / `hmm`), workflow recipes, and usage rules optimized
for LLM consumption.

The server also exposes this guide as the `agents_guide` tool: call it to get
the guide rendered for your project (`project_name`, `domain_context`,
`codebase_root`), or pass your existing `AGENTS.md` content as
`existing_agents_md` to merge the guide in — repeat calls update the inserted
block in place instead of duplicating it. The merge only ever touches
`stochastic-thinking:agents-guide` markers, so other guide blocks (e.g. from
the Clear Thought server) are preserved.

### Using `agents_guide` from chat

You do not need this repository checked out — the tool ships with the server.
Ask your coding agent in natural language; it calls the tool and writes the
result back. Two typical prompts:

Merge into an existing AGENTS.md (recommended — idempotent, in-place updates):

> Read my AGENTS.md in this project. Call the `agents_guide` tool with its
> content as `existing_agents_md`, `project_name: "Thinking-MCP"`,
> `domain_context: "MCP servers for coding agents."` and
> `codebase_root: "C:/repos/Thinking-MCP"`. Then write the returned `content`
> field back to my AGENTS.md.

Create a fresh document (no `existing_agents_md`):

> Call `agents_guide` with `project_name: "Thinking-MCP"` and write the
> returned `content` field to AGENTS.md at the project root.

Tips:

- In VS Code Copilot Chat you can also reference the tool directly: type `#`
  and pick `agents_guide` from the stochasticthinking server.
- The tool only returns text; your agent performs the file write. If the
  response lists `unresolved_placeholders`, fill them in the written file.
- Repeat merge calls stay idempotent: the inserted block is delimited by
  `stochastic-thinking:agents-guide` markers, so updates never duplicate it.

## Tool Reference

The server exposes **two tools**. All algorithms except `bandit` are pure
functions of their inputs; bandit runs persist per session (see below).
HTTP sessions keep the transport connection alive.

### `stochasticalgorithm`

Runs one stochastic decision algorithm as a **real computation** and returns
the measured result.

**Parameters:**

| Parameter | Type | Required | Meaning |
|---|---|---|---|
| `algorithm` | `mdp` \| `mcts` \| `bandit` \| `bayesian` \| `hmm` | yes | decision algorithm to apply |
| `problem` | string | yes | concrete decision problem statement (context; not used by the math) |
| `parameters` | object | yes | algorithm-specific model inputs (see below) |
| `result` | string | no | reserved; accepted but not used by the real algorithms |

**Response:** `{ algorithm, status, summary, hasResult, details? }` (also
provided as `structuredContent`) — `summary` is one measured line, `details`
carries the structured artifacts. Invalid input returns an `isError: true`
result with `status: "failed"` and a message stating the exact expected
parameter shape (schema errors and per-algorithm validation errors alike).

**Algorithm parameters:**

| `algorithm` | Decision situation | `parameters` |
|---|---|---|
| `mdp` | Sequential decisions with an explicit transition/reward model | `transitions[s][a][s′]` (row-stochastic), `rewards[s][a]`, optional `states`/`actions` name arrays, `gamma`, `theta`, `maxIterations` |
| `mcts` | Search in a spatial environment with goal/traps/walls | `environment { rows, cols, start, goal, walls?, traps?, goalReward?, trapReward?, stepReward?, maxSteps? }`, `simulations`, `explorationConstant`, `seed` |
| `bandit` | Explore-vs-exploit among fixed options with measurable regret | `arms [{type:"bernoulli",p} \| {type:"gaussian",mu,sigma}]` (≥2), `strategy` (`epsilon-greedy` \| `UCB` \| `thompson`), `epsilon`, `c`, `pulls`, `seed`, optional `runId` |
| `bayesian` | Next best evaluation of an expensive black-box function | `observations [[x,y],…]` (≥2), `bounds [lo,hi]`, `lengthscale`, `noise`, `gridPoints`, `maximize` |
| `hmm` | Latent states behind an observed symbol sequence | `states`, `observationSymbols`, `observations`, `transitions`, `emissions`, `initial`, `algorithm` (`forward-backward` \| `viterbi` \| `both`) |

**Bandit run state:** the first `bandit` call without `runId` creates a run
(`bandit-1`, …) inside the current session and returns its id in `details`.
Pass `runId` on later calls to continue the same run — counts, sums, regret
and the RNG state accumulate across calls, so regret shrinks as the run
learns. Runs never leak across sessions.

> **Reading the results:** the numbers in `summary` and `details` are
> measured outputs of real algorithms (converged value functions, UCT visit
> counts, realized rewards and regret, Viterbi log-probabilities, GP
> posterior stats and Expected Improvement). They carry no warranty about
> your model: if the matrices, arms or observations misdescribe reality, you
> get precisely computed nonsense. Validate the inputs, cite the outputs as
> what they are.

### `agents_guide`

Returns a ready-to-use AGENTS.md decision-tool guide for consuming projects.
Full details, modes, and chat prompts: see [Agent Guide](#agent-guide).

**Parameters:**

| Parameter | Type | Required | Meaning |
|---|---|---|---|
| `project_name` | string (min 1) | no | target project name — fills `{{PROJECT_NAME}}` |
| `domain_context` | string (min 1) | no | target domain — fills `{{DOMAIN_CONTEXT}}` |
| `codebase_root` | string (min 1) | no | working root — fills `{{CODEBASE_ROOT}}` |
| `existing_agents_md` | string (min 1) | no | existing AGENTS.md content → switches to merge mode |

**Response:** `{ mode, block_replaced, warning?, content, unresolved_placeholders, nextSteps, status }` —
in merge mode the guide block is delimited by
`stochastic-thinking:agents-guide` markers, so repeat calls update in place
and foreign guide blocks (e.g. from clear-thought) are preserved. Whitespace-only
parameter values are rejected (`MCP error -32602`).

### API Examples

#### Markov Decision Process
```typescript
const response = await mcp.callTool("stochasticalgorithm", {
  algorithm: "mdp",
  problem: "Optimize robot navigation policy",
  parameters: {
    states: 100,
    actions: ["up", "down", "left", "right"],
    gamma: 0.9,
    learningRate: 0.1
  }
});
```

#### Monte Carlo Tree Search
```typescript
const response = await mcp.callTool("stochasticalgorithm", {
  algorithm: "mcts",
  problem: "Find optimal game moves",
  parameters: {
    simulations: 1000,
    explorationConstant: 1.4,
    maxDepth: 10
  }
});
```

#### Multi-Armed Bandit
```typescript
const response = await mcp.callTool("stochasticalgorithm", {
  algorithm: "bandit",
  problem: "Optimize ad placement",
  parameters: {
    arms: 5,
    strategy: "epsilon-greedy",
    epsilon: 0.1
  }
});
```

#### Bayesian Optimization
```typescript
const response = await mcp.callTool("stochasticalgorithm", {
  algorithm: "bayesian",
  problem: "Hyperparameter optimization",
  parameters: {
    acquisitionFunction: "expected_improvement",
    kernel: "rbf",
    iterations: 50
  }
});
```

#### Hidden Markov Model
```typescript
const response = await mcp.callTool("stochasticalgorithm", {
  algorithm: "hmm",
  problem: "Infer weather patterns",
  parameters: {
    states: 3,
    algorithm: "forward-backward",
    observations: 100
  }
});
```

## Algorithm Selection Guide

Choose the appropriate algorithm based on your problem characteristics:

### Markov Decision Processes (MDPs)
Best for:
- Sequential decision-making problems
- Problems with clear state transitions
- Scenarios with defined rewards
- Long-term optimization needs

### Monte Carlo Tree Search (MCTS)
Best for:
- Game playing and strategic planning
- Large decision spaces
- When simulation is possible
- Real-time decision making

### Multi-Armed Bandit
Best for:
- A/B testing
- Resource allocation
- Online advertising
- Quick adaptation needs

### Bayesian Optimization
Best for:
- Hyperparameter tuning
- Expensive function optimization
- Continuous parameter spaces
- When uncertainty matters

### Hidden Markov Models (HMMs)
Best for:
- Time series analysis
- Pattern recognition
- State inference
- Sequential data modeling

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Start the server: `npm start`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE for details.

## Acknowledgments

- Architecture and agent-guide patterns adopted from the Clear Thought MCP
  server by glassBead ([@waldzellai](https://github.com/waldzellai))
- Based on the Model Context Protocol (MCP) by Anthropic
- Extends the sequential thinking server with stochastic capabilities
- Inspired by classic works in reinforcement learning and decision theory
