# LLM Task Evals (E3 Tier 2)

Runs the same tasks **with and without** the Clear Thought MCP server and
scores both answers against a rubric — the measurable answer to "do the
tools actually help?"

## Actor and Judge are separate endpoints

The runner treats **actor** (solves the tasks) and **judge** (scores the
answers) as independent endpoints — each with its own model, base URL and
API key. Using a different provider for the judge avoids the same-model
self-bias confounder.

| Role | Env vars | Default |
|---|---|---|
| Actor | `EVAL_ACTOR_MODEL`, `EVAL_ACTOR_BASE_URL`, `EVAL_ACTOR_API_KEY` | `EVAL_MODEL` / `EVAL_BASE_URL` / `EVAL_API_KEY`→`OPENAI_API_KEY`, else `gpt-4o-mini` @ `https://api.openai.com/v1` |
| Judge | `EVAL_JUDGE_MODEL`, `EVAL_JUDGE_BASE_URL`, `EVAL_JUDGE_API_KEY` | falls back to the **actor** endpoint (legacy behavior) |

The old single-endpoint vars (`EVAL_MODEL`, `EVAL_BASE_URL`, `EVAL_API_KEY`)
keep working — they configure the actor, and the judge inherits from it.

```bash
# Example: actor on Z.AI, judge on OpenAI — fully independent scoring
export EVAL_ACTOR_BASE_URL=https://api.z.ai/api/coding/paas/v4
export EVAL_ACTOR_API_KEY=…        export EVAL_ACTOR_MODEL=glm-5.3
export EVAL_JUDGE_BASE_URL=https://api.openai.com/v1
export EVAL_JUDGE_API_KEY=sk-…     export EVAL_JUDGE_MODEL=gpt-4.1
```

If actor and judge resolve to the same model on the same endpoint, the
runner prints a self-bias warning at startup.

## Setup

1. Build first: `npm run build` (the runner spawns `dist/dev.js` via stdio).
   The sibling `../server-stochasticthinking/dist/dev.js` is attached
   automatically when it exists, so tasks can also use its stateful
   algorithm tools (bandit runs continued via `runId`).
2. Credentials: either export the env vars, or copy `.env.example` to
   `.env` (server dir or repo root) and fill in your key — the runner
   loads both locations; real environment variables take precedence.
   `.env` is gitignored.
3. Optional: `EVAL_BASE_URL` / `EVAL_ACTOR_BASE_URL` (any OpenAI-compatible
   endpoint) and the model vars from the table above.

## Run

```bash
node evals/run.mjs                              # tasks.json, all tasks
node evals/run.mjs --max-tasks 1                # cost-limited smoke
node evals/run.mjs --tasks evals/tasks-hard.json  # the hard task set
```

Never runs in CI (needs a key, costs money). Results land in
`evals/results/<timestamp>/` as `report.json` + `report.md` (written
incrementally after every task) plus `config.json` — an endpoint snapshot
(actor/judge model + base URL, keys never written) for reproducibility.

## Tasks

Two task sets ship:

- `evals/tasks.json` — reasoning-quality tasks (risk analysis, argument
  stress-tests, guided decisions). Best for showing *structural* gains.
- `evals/tasks-hard.json` — computation-forcing tasks with **ground-truth
  numbers baked into the rubric**: exact fault-tree probability, iterated
  dominance + closed-form mixed equilibrium, Fermi sensitivity + value of
  information, and a bandit run that must continue via `runId` across two
  tool calls (structurally impossible without the server). Rubric criteria
  carry explicit scoring bands, so judging stays objective even for a
  weaker judge model. These are the differentiating set after Run 2 showed
  Δ = 0 for a strong actor on the easy tasks.

Each task has a prompt, `expects_tools` (documentative — the runner does
not enforce it) and a weighted `rubric` scored 0–4 per criterion by the
judge (one corrective JSON retry on unparseable output). Add a task by
appending to the array in either file.

When authoring numeric rubric criteria, generate the ground truth by
calling the real tools with the task's exact parameters — never by hand.

