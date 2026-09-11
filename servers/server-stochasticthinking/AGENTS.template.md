# AGENTS.md Template — Stochastic Thinking MCP Server

> **Template usage:** Copy this file to the root of the project that consumes
> the Stochastic Thinking MCP server, rename it to `AGENTS.md`, and fill in the
> `{{PLACEHOLDER}}` values. Delete this block before committing.
>
> - `{{PROJECT_NAME}}`: name of your project
> - `{{DOMAIN_CONTEXT}}`: 1–3 sentences about your project's domain, so the
>   model can pick fitting decision problems and parameters
> - `{{CODEBASE_ROOT}}`: path the agent should treat as the working root

---

# Stochastic Thinking — Decision Tool Guide for {{PROJECT_NAME}}

Domain context: {{DOMAIN_CONTEXT}}. Codebase root: {{CODEBASE_ROOT}}.

You (the agent) have access to the **Stochastic Thinking** MCP server. It
turns stochastic decision algorithms into structured, parameterized decision
frames. This guide tells you **when to use which algorithm**, **how to call
the tool correctly**, and **how to combine it with clear-thought workflows**.

## Ground rules

1. **Name the decision before you pick the algorithm.** Write down decision
   situation, options, and uncertainty source — the `problem` field must be a
   concrete, self-contained statement.
2. **One algorithm per call.** Each call answers one decision question. For
   multi-part problems, run several calls and compare the summaries.
3. **Calls are stateless; the transport is stateful.** Every call stands on
   its own (no accumulated server state). HTTP sessions only keep the MCP
   connection alive — do not expect call history server-side.
4. **Be honest about what the summary is.** The response is a
   parameter-driven decision frame (options, exploration/exploitation
   balance, discounting), not a numerical simulation. Use it to structure and
   justify the approach; derive actual numbers yourself.
5. **Feed results back.** Pass the previous `summary` as the optional
   `result` string to refine a follow-up call's framing.

## Calling convention

A single tool, `stochasticalgorithm`:

| Parameter | Type | Required | Meaning |
|---|---|---|---|
| `algorithm` | `mdp` \| `mcts` \| `bandit` \| `bayesian` \| `hmm` | yes | decision algorithm to apply |
| `problem` | string | yes | concrete decision problem statement |
| `parameters` | object | yes | algorithm-specific parameters (see routing table) |
| `result` | string | no | previous result to refine the framing |

Response: `{ algorithm, status, summary, hasResult }` (`status: 'failed'` +
`isError: true` with an `error` message on invalid input).

## Algorithm routing table

| Decision situation | `algorithm` | Typical `parameters` |
|---|---|---|
| Sequential decisions over states/actions with long-horizon rewards | `mdp` | `states`, `actions[]`, `gamma` (discount factor), `learningRate` |
| Large search spaces / game trees with lookahead | `mcts` | `simulations`, `explorationConstant`, `maxDepth` |
| Explore-vs-exploit among fixed options (arms) | `bandit` | `arms`, `strategy`: `epsilon-greedy` \| `UCB` \| `thompson`, `epsilon` |
| Continuous/black-box optimization with expensive evaluations | `bayesian` | `acquisitionFunction`, `kernel`, `iterations` |
| Latent states hidden behind a sequence of observations | `hmm` | `states`, `algorithm`: `forward-backward` \| `viterbi`, `observations` |

## Workflow recipes

### 1. Decision under uncertainty

```
Frame the problem (options + uncertainty source)
→ stochasticalgorithm (pick the routing-table algorithm)
→ state the chosen approach, citing the summary parameters
```

### 2. Combined with Clear Thought

```
clear-thought: sequentialthinking → decisionframework (options)
→ stochasticalgorithm: quantify the leading options (mdp/mcts/bayesian)
→ clear-thought: metacognitivemonitoring before committing
```

### 3. Compare strategies on one problem

```
stochasticalgorithm (strategy A) → stochasticalgorithm (strategy B, feed
summary of A as result) → compare summaries and pick with rationale
```

## Honesty note

Never present a summary as measured/simulated data. It frames the decision
(`"Explored N paths with exploration constant C"`, `"Optimized policy over N
states with discount factor G"`); your value derives from whether those
parameters genuinely describe the problem.
