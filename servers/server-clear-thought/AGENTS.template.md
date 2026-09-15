# AGENTS.md Template — Clear Thought MCP Server

> **Template usage:** Copy this file to the root of the project that consumes
> the Clear Thought MCP server, rename it to `AGENTS.md`, and fill in the
> `{{PLACEHOLDER}}` values. Delete this block before committing.
>
> - `{{PROJECT_NAME}}`: name of your project
> - `{{DOMAIN_CONTEXT}}`: 1–3 sentences about your project's domain, so the
>   model can pick fitting examples and mental models
> - `{{CODEBASE_ROOT}}`: path the agent should treat as the working root

---

# Clear Thought — Reasoning Tool Guide for {{PROJECT_NAME}}

Domain context: {{DOMAIN_CONTEXT}}. Codebase root: {{CODEBASE_ROOT}}.

You (the agent) have access to the **Clear Thought** MCP server. It provides
structured reasoning tools. This guide tells you **which tool to use when**,
**how to call it correctly**, and **how to chain tools into workflows**.

## Ground rules

1. **Think before you act.** For any non-trivial task, start with
   `sequential_thinking` to plan before using domain tools.
2. **One reasoning step per tool call.** Feed each tool's output into the next
   call — the tools are designed to chain.
3. **Close what you open.** Iterative tools end with a `next*Needed` flag; set
   it to `false` when done. Never leave a thinking sequence dangling.
4. **State lives server-side per session.** The stateful reasoning tools
   (e.g. `sequential_thinking`, `mental_model`, `debugging_approach`) return a
   `sessionContext` block with accumulated stats — read it, don't duplicate it.
   Stateless utilities (e.g. `swot_analysis`, `value_of_information`) do not.
5. **Prefer the cheapest sufficient tool.** A `mental_model` pass is cheaper
   than a full `decision_framework`; use the heavier tools for heavier stakes.

## Calling conventions

Every tool exists **twice**: as an individual tool (e.g. `mental_model`) and as
an operation inside a grouped toolset (e.g. `reasoning` with
`operation: 'mental_model'`). Both are equivalent. Use whichever your client
exposes; the parameter names are identical except that toolset calls add:

```
{ "operation": "<operation-name>", ...toolParameters }
```

Toolset routing:

| Toolset | Operations |
|---|---|
| `reasoning` | `sequential_thinking`, `mental_model`, `debugging_approach`, `collaborative_reasoning`, `decision_framework`, `metacognitive_monitoring`, `socratic_method`, `creative_thinking`, `systems_thinking`, `scientific_method`, `structured_argumentation` |
| `visualization` | `mind_map`, `concept_map`, `fishbone_diagram`, `swot_analysis`, `issue_tree` |
| `utility` | `analogical_mapper`, `assumption_xray`, `comparative_advantage`, `drag_point_audit`, `safe_struggle_designer`, `seven_seekers_orchestrator`, `value_of_information`, `existing_tool_example`, `agents_guide` |
| `session` | `session_info`, `session_export`, `session_import` |

## Tool routing table

| When you need to… | Use | Essential parameters |
|---|---|---|
| Plan or reason step by step | `sequential_thinking` | `thought`, `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`; optional: `isRevision` + `revisesThought` to correct, `branchFromThought` + `branchId` to explore alternatives, `needsMoreThoughts` to extend |
| Apply a thinking heuristic | `mental_model` | `modelName`: `first_principles` \| `opportunity_cost` \| `error_propagation` \| `rubber_duck` \| `pareto_principle` \| `occams_razor`; plus `problem`, `steps`, `reasoning`, `conclusion` |
| Find a bug's root cause | `debugging_approach` | `approachName`: `binary_search` \| `reverse_engineering` \| `divide_conquer` \| `backtracking` \| `cause_elimination` \| `program_slicing` \| `log_analysis` \| `static_analysis` \| `root_cause_analysis` \| `delta_debugging` \| `fuzzing` \| `incremental_testing`; plus `issue`, `steps[]` |
| Deliberate from multiple personas | `collaborative_reasoning` | persona + message + iteration pattern; set `nextContributionNeeded` |
| Make a weighted decision | `decision_framework` | `decisionStatement`, `options[]` (name + description), `analysisType`, `stage`, `nextStageNeeded` |
| Audit your own reasoning quality | `metacognitive_monitoring` | `task`, `stage`, `overallConfidence` (0–1), `uncertaintyAreas[]`, `recommendedApproach`, `nextAssessmentNeeded` |
| Stress-test a claim with questions | `socratic_method` | `stage`: `clarification` → `assumptions` → `evidence` → `perspectives` → `implications` → `questions`; `argumentType`: `deductive` \| `inductive` \| `abductive` \| `analogical` |
| Generate creative options | `creative_thinking` | `prompt`, `ideas[]`, `techniques[]`, `connections[]`, `insights[]`, `nextIdeaNeeded` |
| Model a system's dynamics | `systems_thinking` | components + relationships (type: `positive` \| `negative` feedback), emerging patterns |
| Test a hypothesis empirically | `scientific_method` | `stage`: `observation` → `question` → `hypothesis` → `experiment` → `analysis` → `conclusion` → `iteration`; variables (independent/dependent/controlled/confounding), status: `proposed`/`testing`/`supported`/`refuted`/`refined` |
| Build or attack an argument | `structured_argumentation` | `claim`, `premises[]`, `conclusion`, `argumentType`, `confidence` (0–1) |
| Check an argument's Toulmin completeness | `argument_map` | `claim` required; optional `warrant`, `backing[]`, `qualifiers[]`, `rebuttals[]`, `evidence[]` — missing elements come back with guiding questions |
| Separate causation from correlation | `causal_graph` | `outcome`; optional `causes[]` + `links[]` ({ from, to, kind: `causes` \| `contributes_to` \| `confounds` }) — intervention/counterfactual questions, confounder + root-cause candidates |
| Rough-estimate a quantity | `fermi_estimate` | `target`, `assumptions[]` ({ label, value, uncertainty_pct }), `combine`: `multiply` \| `sum` — point estimate + sensitivity ranking |
| Analyze strategic interaction | `game_matrix` | `row_labels[]`, `col_labels[]`, `payoff_matrix[row][col]` ({ row, col }) — strict dominance, best responses, pure Nash, mixed 2×2 |
| Sketch a diagram of reasoning | `visual_reasoning` | `operation`: `create` \| `update` \| `delete` \| `transform` \| `observe`; `diagramId`, `diagramType`, `iteration`, `nextOperationNeeded` |
| Hierarchical brainstorm | `mind_map` | `topic`; optional `branches[]` ({ title, subtopics[] }) — without it a facilitation scaffold is returned |
| Relate concepts with labels | `concept_map` | `main_concept`; optional `related_concepts[]` + `relations[]` — without them a facilitation scaffold is returned |
| Root-cause analysis (many causes) | `fishbone_diagram` | `problem`; optional `causes[]` ({ category, causes[] }) — without it a facilitation scaffold is returned |
| Strategic assessment of one subject | `swot_analysis` | `subject` (required); optional quadrant arrays — plain strings or weighted objects `{ text, impact 1-5, likelihood 1-5, tags[] }`; `topN`, `matchMode` — **see dual-mode note below** |
| Decompose a problem into sub-issues | `issue_tree` | `problem`, `depth`; optional `sub_questions[]` — without them a facilitation scaffold is returned |
| Run a pre-mortem on a plan | `premortem` | `project`; optional `timeframe_months`, `failure_causes[]` ({ cause, likelihood 1-5, impact 1-5, mitigation }), `top_n` — without causes a facilitation scaffold is returned; analysis ranks by likelihood × impact and reports mitigation coverage |
| Analyze failure modes with RPN ranking | `fmea` | `scope`; optional `failure_modes[]` ({ failure_mode, severity 1-10, occurrence 1-10, detection 1-10, causes/effects/controls/actions }), `rpn_threshold` (default 100) — RPN = S × O × D, flagged rows reported |
| Evaluate a fault tree exactly | `fault_tree` | `top_event`, `gates[]` ({ id, type: `basic` \| `and` \| `or`, probability (basics), `inputs[]` (gates) }) — exact top-event probability + contribution ranking of basic events; the LAST gate is the top gate |
| Import solution patterns from other domains | `analogical_mapper` | `problem`, `seed_domains[]`, `k` — returns per-domain guiding questions (scaffold; you construct the analogy) |
| Surface hidden assumptions | `assumption_xray` | `claim`, `context` — heuristic extraction (universality, causality, necessity, comparatives) with evidence, heuristic confidence and falsification tests |
| Pick the best executor for tasks | `comparative_advantage` | `skills` (map of agent → { skill: level }), `tasks` (map of task → required skills[]); optional `capacity` (max tasks per agent → greedy multi-task assignment) and `costs` (effective score = skill score / cost); missing skills count as 0 |
| Find friction in a process log | `drag_point_audit` | `log` (real scan: keyword counts, repeated messages, drag density); `categories[]` = keywords (default: error, warning, timeout, retry, slow) |
| Design deliberate practice | `safe_struggle_designer` | `skill`, `current_level`, `target_level` (must be greater); optional `hours_per_week`, `session_minutes`, `deadline_weeks` — returns success criteria + prerequisite chain per step, derived review intervals and deadline-overrun warnings |
| Orchestrate multi-lens research | `seven_seekers_orchestrator` | `query`, optional `downstream_tools[]` — returns a 7-lens scaffold (empirical, logical, ethical, pragmatic, systemic, creative, critical) with guiding questions |
| Quantify if research is worth it | `value_of_information` | `decision_options[]`, `uncertainties[]`, `payoffs[]` (opportunity cost per uncertainty); optional `probabilities[]` (0-1, weighted instead of worst-case), `option_payoffs` (per-option matrix → per-option VoI ranking), `sampled_uncertainties[]` (partial VoI + share of total) |
| Smoke-test the tool wiring | `existing_tool_example` | `text` — echoes it back; useful to verify connectivity |
| Get this guide as AGENTS.md content | `agents_guide` | optional `project_name`, `domain_context`, `codebase_root`; pass `existing_agents_md` to merge into existing content |
| Inspect session state | `session_info` | — |
| Persist / restore state | `session_export` / `session_import` | — |
| Save / load sessions as files | `session_save` / `session_load` | `name`; optional `merge` (load) — requires the server to be configured with `dataDir` |
| Follow a guided multi-tool workflow | `recipe_runner` | `recipe`: `debug-failure` \| `architecture-decision` \| `stress-test-conclusion` \| `open-ended-ideation` \| `multi-agent-delegation` \| `long-research-question`; `action`: `list` \| `start` \| `status` \| `advance` \| `reset` — per-session progress, navigation only (YOU execute the stages) |

## Dual-mode tools: facilitation vs. analysis

Several tools (`swot_analysis`, `mind_map`, `concept_map`, `fishbone_diagram`,
`issue_tree`, `premortem`, `fmea`, `fault_tree`, `causal_graph`, `analogical_mapper`,
`seven_seekers_orchestrator`, `drag_point_audit` on empty logs) work in two modes:

- `mode: 'facilitation'` — you have not provided content yet. The response
  contains guiding questions. **Answer them yourself and call the tool again
  with the content parameters.** Never present a facilitation scaffold as a
  result.
- `mode: 'analysis'` — your content was processed (structured, counted,
  scored). Use it as the result.

## swot_analysis specifics

- **Call with only `subject`** when you have not yet gathered content: you get
  a facilitation scaffold with per-quadrant guiding questions. Answer them,
  then call again **with filled arrays**.
- **Call with filled arrays** to get the structured analysis. Quadrant
  entries may be plain strings or weighted objects `{ text, impact 1-5,
  likelihood 1-5, tags[] }` (defaults 3/3, no tags). The response contains
  TOWS strategies ranked by weight (`towsRanked` per `so`/`wo`/`st`/`wt`),
  `scores` (counts, `balance`, `riskExposure`, `weighted`) and `meta`
  (`truncatedPerQuadrant`, `weightedEntries`, `unpaired`).
- `topN` defaults to **5** ranked pairs per TOWS family (0 = unlimited) —
  check `meta.truncatedPerQuadrant` so silent truncation of long lists is
  not mistaken for a complete analysis.
- `matchMode: 'tags'` pairs only entries sharing a tag (case-insensitive);
  `meta.unpaired` lists what could not be paired.
- Never present the facilitation scaffold as an analysis result.

## Workflow recipes

Each recipe is available as guided navigation via `recipe_runner`: call it
with `action: 'start'` and the recipe id (ids match the recipe names below),
then `action: 'advance'` between stages. Progress persists for the session.

### 1. Debug a failure

```
sequential_thinking (plan, totalThoughts 3–5)
→ debugging_approach (pick the approachName matching the symptom class)
→ fishbone_diagram (only if multiple candidate causes)
→ metacognitive_monitoring (confidence check before claiming the root cause)
```

### 2. Architecture / technology decision

```
issue_tree (decompose the decision)
→ swot_analysis per serious option (pass content you already know)
→ value_of_information (is more research worth it? if yes: research, then re-run swot)
→ decision_framework (options + weighted analysis)
→ metacognitive_monitoring (before committing)
```

### 3. Stress-test a conclusion you are about to report

```
structured_argumentation (state claim + premises + confidence)
→ socratic_method (walk clarification → assumptions → evidence)
→ assumption_xray (on the weakest premise)
→ revise the argument; set confidence honestly
```

### 4. Open-ended ideation

```
creative_thinking (diverge, several iterations)
→ analogical_mapper (import solutions from other domains)
→ systems_thinking (check the dynamics of the top ideas)
→ mind_map (structure the surviving ideas)
```

### 5. Multi-agent delegation

```
comparative_advantage (map tasks to the best-suited agent)
→ (delegate)
→ drag_point_audit (on the process log afterwards)
→ safe_struggle_designer (if an agent needs skill-building for next time)
```

### 6. Long research question

```
assumption_xray (on the question itself)
→ seven_seekers_orchestrator (multi-lens sweep; downstream_tools to refine)
→ sequential_thinking (synthesize)
→ session_export (persist findings before the context closes)
```

## Anti-patterns (do not do these)

- **Do not** call `swot_analysis` with only `subject` when you already know
  quadrant content — you would get scaffolding instead of analysis.
- **Do not** claim a root cause or decision without having run
  `metacognitive_monitoring` when stakes are high.
- **Do not** set `totalThoughts: 1` and then issue 15 revisions. Estimate
  honestly; use `needsMoreThoughts` if you underestimated.
- **Do not** interleave two unfinished sequences (e.g. two open
  `sequential_thinking` branches) without distinct `branchId`s.
- **Do not** ignore `sessionContext` stats returned by tools — they tell you
  what has already been tried.
- **Do not** re-derive what a tool already structured (e.g. re-listing SWOT
  quadrants in prose after calling `swot_analysis`). Reference the result.

## Session persistence

All tools share one server-side session. For long tasks:

1. Check state: `session_info`.
2. Read it without tool calls via the session **resources**:
   `clear-thought://session/stats`, `clear-thought://session/export`,
   `clear-thought://session/thoughts`, `clear-thought://session/workflows`.
3. Before your context ends or gets compacted: `session_export`, store the
   payload in the project (e.g. `memory-bank/`), or — when the server runs
   with a `dataDir` — `session_save` and later `session_load`.
4. On resume: `session_import`, then continue where the stats say you left
   off.

The server also exposes **workflow prompts** (one per recipe:
`debug-failure`, `architecture-decision`, `stress-test-conclusion`,
`open-ended-ideation`, `multi-agent-delegation`, `long-research-question`) —
clients render them as ready-to-send starting messages.

## Project-specific conventions

<!-- Customize this section per project. Example: -->

- For trading decisions, always run `value_of_information` before requesting
  additional market data.
- For refactors, `issue_tree` depth must not exceed 3.
- Record the chosen option of every `decision_framework` run in
  `memory-bank/decisions.md`.
