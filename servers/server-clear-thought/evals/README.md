# LLM Task Evals (E3 Tier 2)

Runs the same tasks **with and without** the Clear Thought MCP server and
scores both answers against a rubric — the measurable answer to "do the
tools actually help?"

## Setup

1. Build first: `npm run build` (the runner spawns `dist/dev.js` via stdio).
2. API key: `export OPENAI_API_KEY=sk-…` (or `EVAL_API_KEY`).
3. Optional: `EVAL_BASE_URL` (any OpenAI-compatible endpoint, e.g. your
   OpenRouter or LocalAI URL) and `EVAL_MODEL` (default `gpt-4o-mini`).

## Run

```bash
node evals/run.mjs               # all tasks
node evals/run.mjs --max-tasks 1 # cost-limited smoke
```

Never runs in CI (needs a key, costs money). Results land in
`evals/results/<timestamp>/` as `report.json` + `report.md` with per-task
baseline/server scores, the delta, and the tools actually used.

## Tasks

`evals/tasks.json` holds the tasks: prompt, `expects_tools` (documentative —
the runner does not enforce them) and a weighted `rubric` scored 0–4 per
criterion by an LLM judge. Add a task by appending to the array.
