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
runs stochastic decision algorithms as **real, measurable computations**
(value iteration, UCT tree search, actual bandit pulls, Gaussian-process
regression, exact HMM inference). This guide tells you **when to use which
algorithm**, **how to call the tool correctly**, and **how to combine it
with clear-thought workflows**.

## Ground rules

1. **Name the decision before you pick the algorithm.** Write down decision
   situation, options, and uncertainty source — the `problem` field must be a
   concrete, self-contained statement.
2. **One algorithm per call.** Each call answers one decision question. For
   multi-part problems, run several calls and compare the summaries.
3. **Calls are pure — except bandit runs.** mdp, mcts, bayesian and hmm are
   pure functions of their inputs. Bandit runs persist per session: pass the
   returned `runId` back to continue a run (counts, sums, regret and RNG
   state accumulate across calls).
4. **The numbers are measured — your inputs are not validated against
   reality.** `summary` and `details` contain real computed results
   (converged value functions, visit counts, mean rewards, regret,
   log-likelihood, Expected Improvement). The model inputs you supply
   (matrices, arms, observations) are assumptions YOU own: spend your
   skepticism on `parameters`, not on the arithmetic.
5. **Iterate like a scientist.** Add the proposed point to your `bayesian`
   observations and call again; continue a `bandit` run via `runId` and
   watch regret shrink; feed `hmm` posteriors back into clear-thought
   `decisionframework`.

## Calling convention

A single tool, `stochasticalgorithm`:

| Parameter | Type | Required | Meaning |
|---|---|---|---|
| `algorithm` | `mdp` \| `mcts` \| `bandit` \| `bayesian` \| `hmm` | yes | decision algorithm to apply |
| `problem` | string | yes | concrete decision problem statement (context for you, not used by the math) |
| `parameters` | object | yes | algorithm-specific **model inputs** (see routing table + worked examples) |
| `result` | string | no | reserved for future use; accepted but not used by the real algorithms |

Response: `{ algorithm, status, summary, hasResult, details? }` — `summary`
is one measured line, `details` carries the structured artifacts (value
function, visit counts, per-arm stats, gamma table, EI, …). Invalid or
missing model inputs → `status: 'failed'` + `isError: true` with the exact
expected parameter shape in the message.

## Algorithm routing table

| Decision situation | `algorithm` | `parameters` (real model inputs) |
|---|---|---|
| Sequential decisions with an explicit transition/reward model | `mdp` | `transitions[s][a][s′]` (row-stochastic), `rewards[s][a]`, optional `states`/`actions` name arrays, `gamma`, `theta`, `maxIterations` → value iteration + greedy policy |
| Search in a spatial environment with goal/traps/walls | `mcts` | `environment { rows, cols, start, goal, walls?, traps?, goalReward?, trapReward?, stepReward?, maxSteps? }`, `simulations`, `explorationConstant`, `seed` → UCT search on the built-in gridworld |
| Explore-vs-exploit among fixed options with measurable regret | `bandit` | `arms [{type:"bernoulli",p} \| {type:"gaussian",mu,sigma}]` (≥2), `strategy`: `epsilon-greedy` \| `UCB` \| `thompson`, `epsilon`, `c`, `pulls`, `seed`, optional `runId` (continue run) |
| Next best evaluation of an expensive black-box function | `bayesian` | `observations [[x,y],…]` (≥2), `bounds [lo,hi]`, `lengthscale`, `noise`, `gridPoints`, `maximize` → GP-RBF posterior + Expected Improvement |
| Latent states behind an observed symbol sequence | `hmm` | `states`, `observationSymbols`, `observations`, `transitions A[si][sj]`, `emissions B[si][oi]`, `initial π`, `algorithm`: `forward-backward` \| `viterbi` \| `both` |

All matrices must be row-stochastic (tolerance 1e-6); violations and
unknown symbols fail with precise messages.

## Worked examples

```jsonc
// mdp — two states, hand-checkable: V = [9, 10] at γ = 0.9
{ "algorithm": "mdp", "problem": "save or spend",
  "parameters": {
    "states": ["poor", "rich"], "actions": ["work", "slack"],
    "transitions": [[[0,1],[1,0]], [[0,1],[0,1]]],
    "rewards": [[0,0.1],[1,1]], "gamma": 0.9 } }

// mcts — 1×3 corridor: best action will be "right"
{ "algorithm": "mcts", "problem": "reach the goal",
  "parameters": { "environment": { "rows": 1, "cols": 3,
    "start": [0,0], "goal": [0,2] }, "simulations": 400, "seed": 7 } }

// bandit — first call creates run "bandit-1"; pass runId back to continue
{ "algorithm": "bandit", "problem": "A/B test two buttons",
  "parameters": { "arms": [{"type":"bernoulli","p":0.3},{"type":"bernoulli","p":0.5}],
    "strategy": "UCB", "pulls": 100, "seed": 11 } }

// bayesian — next evaluation near the unknown maximum
{ "algorithm": "bayesian", "problem": "tune one hyperparameter",
  "parameters": { "observations": [[0,-4],[1,-1],[3,-1],[4,-4]],
    "bounds": [0,4], "maximize": true } }

// hmm — classic weather example → Viterbi path Sunny→Rainy→Rainy
{ "algorithm": "hmm", "problem": "infer weather from activities",
  "parameters": { "states": ["Rainy","Sunny"],
    "observationSymbols": ["walk","shop","clean"],
    "observations": ["walk","shop","clean"],
    "transitions": [[0.7,0.3],[0.4,0.6]],
    "emissions": [[0.1,0.4,0.5],[0.6,0.3,0.1]],
    "initial": [0.6,0.4], "algorithm": "both" } }
```

## Workflow recipes

### 1. Decision under uncertainty

```
Model the problem explicitly (transitions, arms, observations)
→ stochasticalgorithm (pick the routing-table algorithm)
→ state the chosen approach, citing the measured numbers (value, regret, EI)
```

### 2. Combined with Clear Thought

```
clear-thought: sequentialthinking → decisionframework (options)
→ stochasticalgorithm: quantify the leading options (mdp/mcts/bayesian)
→ clear-thought: metacognitivemonitoring before committing
```

### 3. Iterate to a decision

```
bayesian: propose x → evaluate in reality → append observation → repeat
bandit: pull in batches via runId → stop when regret flattens
hmm: score candidate state models by log-likelihood
```

## Reading the results

The numbers in `summary` and `details` are **measured outputs of real
algorithms**: converged value functions (with iteration count and Δ), UCT
visit counts and mean values, realized rewards and regret, exact Viterbi
log-probabilities, GP posterior means/stds and Expected Improvement.

They carry **no warranty about your model**: if the transition matrix, the
arm distributions or the observations misdescribe reality, you get precisely
computed nonsense. Validate the inputs, cite the outputs as what they are —
results under your stated assumptions.
