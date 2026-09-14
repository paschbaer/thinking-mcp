#  AGENTS.md

## Architecture Map
- Before answering architecture or codebase questions, use the GitNexus graph tools to analyze the codebase (skill: gitnexus-workflow.md).
- Do not make blind edits or assumptions about execution pathways. Always query the precomputed knowledge graph for context.
- Type `gitnexus analyze --no-stats` in Terminal to build or update the knowledge graph. The `--no-stats` flag is mandatory in this repo: it keeps AGENTS.md/CLAUDE.md free of volatile symbol/relationship counts so code changes don't dirty these files.

## Agent Working Rules
- Always break down complex tasks into a plan first. See Reasoning & Planning Rules.
- Ask for approval before deleting files you haven't created yourself.
- Keep strategy logic isolated by module responsibility (scanner/signal/risk/execution).
- Keep console output readable;

## Review Evidence Protocol
- Never dismiss a HIGH or CRITICAL review finding without first verifying it against the current source and a reproducible check.
- For every review finding, record a concise evidence table containing: file/symbol; reproducible execution path; current code location; test or direct check that proves or disproves it; whether the current diff introduced it; and the actual severity.
- When reviewer reports conflict, treat the current source plus reproducible test/check as authoritative over the agent's claim.
- A review may be marked approved only after every HIGH/CRITICAL finding is either fixed or explicitly classified with evidence as already fixed, pre-existing, out of scope with a tracked follow-up, or a verified false positive.
- Stale or contradictory reviewer reports must themselves be recorded as review-quality issues; this does not remove the obligation to classify the underlying technical concern separately.
- Before reviewing, the reviewer must verify `git status --short --branch`, `git rev-parse HEAD`, `git diff`, `git diff --cached`, and the exact review scope; a changed snapshot invalidates the review.
- The reviewer output must include a snapshot table stating the branch, HEAD, review basis, staged/unstaged diff status, current-source reads, and tests actually executed.
- The reviewer must provide one evidence-table row for every finding and must not output `approved` or equivalent without an explicit count of unresolved HIGH/CRITICAL findings.
- For post-commit reviews, the reviewer must verify the target commit with `git show <commit> --stat` and inspect that commit's file diff directly.

## Findings Lifecycle Rule
- Every unresolved review finding (any severity) must be persisted in `memory-bank/activeContext.md` AND `memory-bank/remaining-work-plan.md` as a tracked follow-up BEFORE the scope is closed or the session ends. Reviewer reports and chat summaries do not count as documentation.
- Each tracked follow-up must state: the finding, its trigger point (the concrete future scope, stage, or condition under which it must be handled), and whether action is required or it is an accepted observation with rationale.
- When a future scope begins, its owner must check the tracked follow-ups for entries whose trigger point matches that scope and either handle them or explicitly re-schedule them with a new trigger point.
- A finding may only be removed from the tracked follow-ups when it is fixed with regression coverage or explicitly reclassified with evidence (e.g., verified false positive or subsumed by another change).

## Reasoning & Planning Rules
- For complex tasks, architectural decisions, or refactoring requests, you MUST use the `clearthought` tool.
- Use the `clearthought` process to break down the problem into logical steps, verify assumptions, and identify edge cases BEFORE writing code or modifying files.
- Document your thought process in at least 3-5 steps within the tool to ensure a structured solution.
- If a solution seems uncertain, use the "thought revision" capability of the server to adjust your plan accordingly.

## Branch Management Rules
- **Feature Branch Requirement**: When working on `main` or `develop` branches, always create a feature branch following the pattern `feature/<meaningful-name>`.
- **Code Changes**: All code changes must be made in the feature branch, not directly on `main` or `develop`. Use `working trees` for concurrent changes. 
- **Code Review**: Before merging to `develop` or `main`, perform a thorough code review to identify and fix any issues.
- **Test Execution**: Run all tests and verify their error-free execution before merging.
- **Documentation Standards**: Update README.md for any new features or configuration changes and keep documentation in sync with code changes.
- **Meta-Data**: Update the knowledge graph (see Architecture Map).
- **Rebase**: When merging to `develop`, try to rebase. If this is not possible merge branches the common way.
- **Squash Commit**: When merging to `main`, use squash commit to maintain a clean history.
- **Branch Cleanup**: Delete the feature branch after successful merge.
- **Commit Messages**: Use clear, descriptive commit messages following conventional commits format.
- **Cleanup**: Remove temporary files before committing. Ask for approval before deletion.

## Self-Evolution Rule
- If you make an error in the reasoning process or realize your planning steps were incomplete, you MUST proactively suggest an update to `Memory Bank Protocol`.
- After completing a complex task, analyze whether the existing rules were sufficient. If not, ask: "Should I optimize the `Memory Bank Protocol` to avoid this mistake in the future?"
- You are authorized to propose new best practices discovered during our work as permanent rules for future sessions.

## Strict Compliance Rule
- You MUST strictly adhere to all guidelines in AGENTS.md.
- Any deviation from AGENTS.md rules requires explicit user approval.
- Before deviating from established procedures, you must:
  1. Explain the reason for the proposed deviation
  2. Request explicit user consent
  3. Document the approved deviation in AGENTS.md
- This rule takes precedence over all other guidelines when conflicts arise.

## Bugfix Protocol (clearthought)
When investigating and fixing bugs, your reasoning steps MUST include:
1. **Reproduction:** Describe exactly how to reproduce the bug. If possible, create a failing test case first.
2. **Root Cause Analysis:** Explain *why* the bug is happening, not just *where*. Identify the underlying logic flaw.
3. **Impact Assessment:** Check if this bug (or the proposed fix) affects other parts of the system or related components.
4. **Fix Strategy:** Compare at least two ways to fix the issue (e.g., a "quick fix" vs. a "robust refactor") before choosing one.
5. **Verification Plan:** Define how you will prove the bug is gone (e.g., "Run npm test" or "Verify manual UI state").

## User Preferences & Persistent Memory
- **Communication:**
	- Keep explanations concise

## Lessons Learned (Self-Evolving)
- When we resolve a recurring bug or make a strategic architectural decision, update `memory-bank/lessonsLearned.md`.
- Check these lessons before starting any new task to avoid repeating past mistakes.
- Baseline-aware testing: run focused tests first and label pre-existing full-suite failures separately to avoid attributing unrelated regressions to the current task.

# Rule Update & Backup Protocol
- BEFORE modifying `AGENTS.md` or any rule file, you MUST:
  1. Create a backup of the current file by copying it to `.clinerules.bak` or `AGENTS.md.bak`.
  2. Use the `clearthought` tool to verify that the new rules do not contradict existing ones.
  3. Clearly state in the chat what changes you are making and why.
- If an update fails or causes logic loops, immediately offer to restore from the `.bak` file.

# Memory Bank Protocol
- Before starting any task, read all files in the `memory-bank/` directory.
- Update `activeContext.md` after every significant change to track progress.
- Update `systemPatterns.md` when new architectural decisions are made.
- Update `lessonsLearned.md` when you resolve a recurring bug or recurring failing command.
- Always maintain the source of truth in these files.

# Session Termination, Progress Tracking $ Self-Evolving
- BEFORE marking a task as "completed" or ending a session, you MUST update `memory-bank/progress.md` and `memory-bank/lessonsLearned.md`.
- In `progress.md`, document:
  1. **What works:** Features or fixes successfully implemented.
  2. **What's left:** Pending tasks or known issues.
  3. **Current State:** A brief summary of the overall project status.
- In `lessonsLearned.md`, document:
  1. **What bugs occured:** How were these bugs fixed or how to work around them. Focus on "why" things failed and "how" to do them right next time.
- Once updated, provide a final summary in the chat so I know the documentation is current.

# Automatic Post-Bugfix Documentation
- Immediately AFTER a bug is confirmed as fixed (verified by tests or manual check), you MUST:
  1. Reflect on whether this bug represents a recurring pattern or a non-obvious trap.
  2. If so, add a new entry to the "Avoid These Mistakes" section in `memory-bank/lessonsLearned.md`.
  3. Keep the entries concise: State the issue, the root cause, and the preventive measure (e.g., a specific code pattern or a new rule for `AGENTS.md` and `.clinerules`).
- **Lessons Learned Tracking:** Whenever you solve a particularly difficult bug, find a clever optimization, or we decide on a specific "best practice," you MUST document this in `memory-bank/lessonsLearned.md`. 
- Focus on "why" things failed and "how" to do them right next time.

# Clear Thought — Reasoning Tool Guide for Thinking-MCP

Domain context: MCP servers providing structured reasoning and problem-solving tools (clear-thought toolset) for coding agents. Codebase root: /mnt/c/Users/AlexanderPaschold/source/repos/Thinking-MCP.

You (the agent) have access to the **Clear Thought** MCP server. It provides
structured reasoning tools. This guide tells you **which tool to use when**,
**how to call it correctly**, and **how to chain tools into workflows**.

<!-- clear-thought:agents-guide:start -->
## Clear Thought — Reasoning Tool Guide

Project: Thinking-MCP Domain: MCP servers providing structured reasoning and problem-solving tools (clear-thought toolset) for coding agents. Codebase root: /mnt/c/Users/AlexanderPaschold/source/repos/Thinking-MCP

## Ground rules

1. **Think before you act.** For any non-trivial task, start with
   `sequentialthinking` to plan before using domain tools.
2. **One reasoning step per tool call.** Feed each tool's output into the next
   call — the tools are designed to chain.
3. **Close what you open.** Iterative tools end with a `next*Needed` flag; set
   it to `false` when done. Never leave a thinking sequence dangling.
4. **State lives server-side per session.** The stateful reasoning tools
   (e.g. `sequentialthinking`, `mentalmodel`, `debuggingapproach`) return a
   `sessionContext` block with accumulated stats — read it, don't duplicate it.
   Stateless utilities (e.g. `swot_analysis`, `value_of_information`) do not.
5. **Prefer the cheapest sufficient tool.** A `mentalmodel` pass is cheaper
   than a full `decisionframework`; use the heavier tools for heavier stakes.

## Calling conventions

Every tool exists **twice**: as an individual tool (e.g. `mentalmodel`) and as
an operation inside a grouped toolset (e.g. `reasoning` with
`operation: 'mentalmodel'`). Both are equivalent. Use whichever your client
exposes; the parameter names are identical except that toolset calls add:

```
{ "operation": "<operation-name>", ...toolParameters }
```

Toolset routing:

| Toolset | Operations |
|---|---|
| `reasoning` | `sequentialthinking`, `mentalmodel`, `debuggingapproach`, `collaborativereasoning`, `decisionframework`, `metacognitivemonitoring`, `socraticmethod`, `creativethinking`, `systemsthinking`, `scientificmethod`, `structuredargumentation` |
| `visualization` | `mind_map`, `concept_map`, `fishbone_diagram`, `swot_analysis`, `issue_tree` |
| `utility` | `analogical_mapper`, `assumption_xray`, `comparative_advantage`, `drag_point_audit`, `safe_struggle_designer`, `seven_seekers_orchestrator`, `value_of_information`, `existing_tool_example`, `agents_guide` |
| `session` | `session_info`, `session_export`, `session_import` |

## Tool routing table

| When you need to… | Use | Essential parameters |
|---|---|---|
| Plan or reason step by step | `sequentialthinking` | `thought`, `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`; optional: `isRevision` + `revisesThought` to correct, `branchFromThought` + `branchId` to explore alternatives, `needsMoreThoughts` to extend |
| Apply a thinking heuristic | `mentalmodel` | `modelName`: `first_principles` \| `opportunity_cost` \| `error_propagation` \| `rubber_duck` \| `pareto_principle` \| `occams_razor`; plus `problem`, `steps`, `reasoning`, `conclusion` |
| Find a bug's root cause | `debuggingapproach` | `approachName`: `binary_search` \| `reverse_engineering` \| `divide_conquer` \| `backtracking` \| `cause_elimination` \| `program_slicing` \| `log_analysis` \| `static_analysis` \| `root_cause_analysis` \| `delta_debugging` \| `fuzzing` \| `incremental_testing`; plus `issue`, `steps[]` |
| Deliberate from multiple personas | `collaborativereasoning` | persona + message + iteration pattern; set `nextContributionNeeded` |
| Make a weighted decision | `decisionframework` | `decisionStatement`, `options[]` (name + description), `analysisType`, `stage`, `nextStageNeeded` |
| Audit your own reasoning quality | `metacognitivemonitoring` | `task`, `stage`, `overallConfidence` (0–1), `uncertaintyAreas[]`, `recommendedApproach`, `nextAssessmentNeeded` |
| Stress-test a claim with questions | `socraticmethod` | `stage`: `clarification` → `assumptions` → `evidence` → `perspectives` → `implications` → `questions`; `argumentType`: `deductive` \| `inductive` \| `abductive` \| `analogical` |
| Generate creative options | `creativethinking` | `prompt`, `ideas[]`, `techniques[]`, `connections[]`, `insights[]`, `nextIdeaNeeded` |
| Model a system's dynamics | `systemsthinking` | components + relationships (type: `positive` \| `negative` feedback), emerging patterns |
| Test a hypothesis empirically | `scientificmethod` | `stage`: `observation` → `question` → `hypothesis` → `experiment` → `analysis` → `conclusion` → `iteration`; variables (independent/dependent/controlled/confounding), status: `proposed`/`testing`/`supported`/`refuted`/`refined` |
| Build or attack an argument | `structuredargumentation` | `claim`, `premises[]`, `conclusion`, `argumentType`, `confidence` (0–1) |
| Check an argument's Toulmin completeness | `argument_map` | `claim` required; optional `warrant`, `backing[]`, `qualifiers[]`, `rebuttals[]`, `evidence[]` — missing elements come back with guiding questions |
| Separate causation from correlation | `causal_graph` | `outcome`; optional `causes[]` + `links[]` ({ from, to, kind: `causes` \| `contributes_to` \| `confounds` }) — intervention/counterfactual questions, confounder + root-cause candidates |
| Rough-estimate a quantity | `fermi_estimate` | `target`, `assumptions[]` ({ label, value, uncertainty_pct }), `combine`: `multiply` \| `sum` — point estimate + sensitivity ranking |
| Analyze strategic interaction | `game_matrix` | `row_labels[]`, `col_labels[]`, `payoff_matrix[row][col]` ({ row, col }) — strict dominance, best responses, pure Nash, mixed 2×2 |
| Sketch a diagram of reasoning | `visualreasoning` | `operation`: `create` \| `update` \| `delete` \| `transform` \| `observe`; `diagramId`, `diagramType`, `iteration`, `nextOperationNeeded` |
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
sequentialthinking (plan, totalThoughts 3–5)
→ debuggingapproach (pick the approachName matching the symptom class)
→ fishbone_diagram (only if multiple candidate causes)
→ metacognitivemonitoring (confidence check before claiming the root cause)
```

### 2. Architecture / technology decision

```
issue_tree (decompose the decision)
→ swot_analysis per serious option (pass content you already know)
→ value_of_information (is more research worth it? if yes: research, then re-run swot)
→ decisionframework (options + weighted analysis)
→ metacognitivemonitoring (before committing)
```

### 3. Stress-test a conclusion you are about to report

```
structuredargumentation (state claim + premises + confidence)
→ socraticmethod (walk clarification → assumptions → evidence)
→ assumption_xray (on the weakest premise)
→ revise the argument; set confidence honestly
```

### 4. Open-ended ideation

```
creativethinking (diverge, several iterations)
→ analogical_mapper (import solutions from other domains)
→ systemsthinking (check the dynamics of the top ideas)
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
→ sequentialthinking (synthesize)
→ session_export (persist findings before the context closes)
```

## Anti-patterns (do not do these)

- **Do not** call `swot_analysis` with only `subject` when you already know
  quadrant content — you would get scaffolding instead of analysis.
- **Do not** claim a root cause or decision without having run
  `metacognitivemonitoring` when stakes are high.
- **Do not** set `totalThoughts: 1` and then issue 15 revisions. Estimate
  honestly; use `needsMoreThoughts` if you underestimated.
- **Do not** interleave two unfinished sequences (e.g. two open
  `sequentialthinking` branches) without distinct `branchId`s.
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
- Record the chosen option of every `decisionframework` run in
  `memory-bank/decisions.md`.
<!-- clear-thought:agents-guide:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **thinking-mcp**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/thinking-mcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/thinking-mcp/clusters` | All functional areas |
| `gitnexus://repo/thinking-mcp/processes` | All execution flows |
| `gitnexus://repo/thinking-mcp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- stochastic-thinking:agents-guide:start -->
## Stochastic Thinking — Decision Tool Guide

Project: Thinking-MCP Domain: MCP servers providing structured reasoning and decision tools for coding agents. Codebase root: /mnt/c/Users/AlexanderPaschold/source/repos/Thinking-MCP

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
<!-- stochastic-thinking:agents-guide:end -->
