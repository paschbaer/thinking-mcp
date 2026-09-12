# Clear Thought MCP Server

A Model Context Protocol (MCP) server that provides systematic thinking, mental models, and debugging approaches for enhanced problem-solving capabilities.

## Features

### Mental Models

- First Principles Thinking
- Opportunity Cost Analysis
- Error Propagation Understanding
- Rubber Duck Debugging
- Pareto Principle
- Occam's Razor
- And many more...

### Design Patterns

- Modular Architecture
- API Integration Patterns
- State Management
- Asynchronous Processing
- Scalability Considerations
- Security Best Practices
- Agentic Design Patterns

Note: Compatible with various modern web frameworks and architectures.

### Programming Paradigms

- Imperative Programming
- Procedural Programming
- Object-Oriented Programming
- Functional Programming
- Declarative Programming
- Logic Programming
- Event-Driven Programming
- Aspect-Oriented Programming
- Concurrent Programming
- Reactive Programming

### Debugging Approaches

- Binary Search
- Reverse Engineering
- Divide and Conquer
- Backtracking
- Cause Elimination
- Program Slicing
- Advanced debugging patterns
- Log Analysis
- Static Analysis
- Root Cause Analysis
- Delta Debugging
- Fuzzing
- Incremental Testing

### Sequential Thinking

- Structured thought process
- Revision and branching support
- Progress tracking
- Context maintenance

## Tool Selection Guide

Each tool in the Clear Thought MCP Server has specific strengths. Here are some scenarios where each tool might be particularly useful:

### Mental Models

Best suited for:

- Initial problem understanding
- Breaking down complex systems
- Analyzing trade-offs
- Finding root causes
- Making strategic decisions

Example scenarios:

- Analyzing system architecture choices
- Evaluating competing solutions
- Understanding error patterns

### Design Patterns

Best suited for:

- Implementing proven solutions
- Structuring new features
- Ensuring maintainable code
- Scaling applications
- Managing technical debt

Example scenarios:

- Building new system components
- Refactoring existing code
- Implementing cross-cutting concerns

### Debugging Approaches

Best suited for:

- Troubleshooting issues
- Performance optimization
- System analysis
- Error resolution
- Quality assurance

Example scenarios:

- Fixing production issues
- Optimizing slow processes
- Resolving integration problems

### Sequential Thinking

Best suited for:

- Complex problem-solving
- Multi-step analysis
- Decision refinement
- Process improvement
- Comprehensive planning

Example scenarios:

- Planning major features
- Analyzing system-wide changes
- Making architectural decisions

Note: These are suggestions rather than rules. Tools can be used in any order or combination that best serves your needs.

## Installation

The package is **not yet published** to npm or Smithery — install from source:

```bash
git clone https://github.com/paschbaer/thinking-mcp.git
cd thinking-mcp
corepack enable && yarn install
yarn workspace @paschbaer/clear-thought build
```

The stdio entry is then available at
`servers/server-clear-thought/dist/dev.js`.

> **Planned:** npm publishing under the `@paschbaer` scope (then
> `npx @paschbaer/clear-thought` works as advertised below) and Smithery
> deployment via `npm run deploy` in this directory (config: `smithery.yaml`).
> Status 2026-09-12: `@paschbaer/clear-thought` is a 404 on npm; no Smithery
> server exists under `@paschbaer` or the upstream `@waldzellai` scope.

## Agent Guide

Building an agent that consumes this server? Copy
[`AGENTS.template.md`](./AGENTS.template.md) to your project root as
`AGENTS.md` — it contains a tool routing table, workflow recipes, and usage
rules optimized for LLM consumption.

The server also exposes this guide as the `agents_guide` tool (also in the
`utility` toolset): call it to get the guide rendered for your project
(`project_name`, `domain_context`, `codebase_root`), or pass your existing
`AGENTS.md` content as `existing_agents_md` to merge the guide in — repeat
calls update the inserted block in place instead of duplicating it.

### Using `agents_guide` from chat

You do not need this repository checked out — the tool ships with the server.
Ask your coding agent in natural language; it calls the tool and writes the
result back. Two typical prompts:

Merge into an existing AGENTS.md (recommended — idempotent, in-place updates):

> Read my AGENTS.md in this project. Call the `agents_guide` tool with its
> content as `existing_agents_md`, `project_name: "Thinking-MCP"`,
> `domain_context: "Algorithmic trading."` and
> `codebase_root: "C:/repos/Tradix"`. Then write the returned `content` field
> back to my AGENTS.md.

Create a fresh document (no `existing_agents_md`):

> Call `agents_guide` with `project_name: "Thinking-MCP"` and write the returned
> `content` field to AGENTS.md at the project root.

Tips:

- In VS Code Copilot Chat you can also reference the tool directly: type `#`
  and pick `agents_guide` — or the `utility` toolset, which exposes it as
  `operation: "agents_guide"`.
- The tool only returns text; your agent performs the file write. If the
  response lists `unresolved_placeholders`, fill them in the written file.
- Repeat merge calls stay idempotent: the inserted block is delimited by
  `clear-thought:agents-guide` markers, so updates never duplicate it.

## Tool Reference

Reference for **every** tool, grouped like the four toolsets. All tools return
structured JSON plus a `sessionContext`/status block where noted.

### Reasoning tools

#### `sequentialthinking`
Step-by-step reasoning with revision and branching.
- **Parameters:** `thought`, `thoughtNumber`, `totalThoughts`, `nextThoughtNeeded`; optional `isRevision` + `revisesThought` (correct a thought), `branchFromThought` + `branchId` (explore alternatives), `needsMoreThoughts` (extend the estimate).
- **Returns:** current thought, full `thoughtHistory`, `branches`, and `sessionContext` stats.

#### `mentalmodel`
Applies one of six thinking heuristics to a problem.
- **Parameters:** `modelName` (`first_principles` | `opportunity_cost` | `error_propagation` | `rubber_duck` | `pareto_principle` | `occams_razor`), `problem`, `steps[]`, `reasoning`, `conclusion`.
- **Returns:** model-specific `modelInsights`, `applicationResults`, `sessionContext`.

#### `debuggingapproach`
Structured bug-hunting with 12 named strategies.
- **Parameters:** `approachName` (`binary_search`, `reverse_engineering`, `divide_conquer`, `backtracking`, `cause_elimination`, `program_slicing`, `log_analysis`, `static_analysis`, `root_cause_analysis`, `delta_debugging`, `fuzzing`, `incremental_testing`), `issue`, `steps[]`, plus `rootCause`/`resolution`/`findings` as they become known.
- **Returns:** approach-specific analysis, `resolution`, `sessionContext`.

#### `collaborativereasoning`
Multi-persona deliberation: define personas, trade observations/questions/insights.
- **Parameters:** `topic`, `personas[]` (name, expertise, perspective, biases, communication style/tone), `contributions[]`, `stage` (`problem-definition` → `ideation` → `critique` → `integration` → `decision` → `reflection`), `activePersonaId`, `sessionId`, `iteration`, `nextContributionNeeded`.
- **Returns:** the processed contribution, updated persona state, `sessionContext`.

#### `decisionframework`
Weighted multi-option decision analysis over multiple stages.
- **Parameters:** `decisionStatement`, `options[]` (name + description + pros/cons), `analysisType` (e.g. `architecture`, `technology`, `process`), `stage` (`options` → `evaluation` → `decision`), `iteration`, `nextStageNeeded`.
- **Returns:** `recommendations` ranked per criterion, comparison matrix, accumulated `sessionContext`.

#### `metacognitivemonitoring`
Audits the quality of your own reasoning before you commit to a claim.
- **Parameters:** `task`, `stage`, `overallConfidence` (0–1), `uncertaintyAreas[]`, `recommendedApproach`, `monitoringId`, `iteration`, `nextAssessmentNeeded`.
- **Returns:** confidence `judgments`, identified biases/knowledge gaps, `sessionContext`.

#### `socraticmethod`
Stress-tests a claim through staged questioning.
- **Parameters:** `claim`, `premises[]`, `conclusion`, `question`, `stage` (`clarification` → `assumptions` → `evidence` → `perspectives` → `implications` → `questions`), `argumentType` (`deductive` | `inductive` | `abductive` | `analogical`), `confidence` (0–1), `sessionId`, `iteration`, `nextArgumentNeeded`.
- **Returns:** challenge results, refined argument state, `sessionContext`.

#### `creativethinking`
Divergent idea generation with explicit technique tracking.
- **Parameters:** `prompt`, `ideas[]`, `techniques[]` (e.g. `first_principles`, `scamper`, `lateral_thinking`), `connections[]`, `insights[]`, `sessionId`, `iteration`, `nextIdeaNeeded`.
- **Returns:** processed idea set with `metrics`, `sessionContext`.

#### `systemsthinking`
Models a system's components, feedback loops, and leverage points.
- **Parameters:** `system`, `components[]`, `relationships[]` (`from`, `to`, `type`: `positive` | `negative` feedback), `feedbackLoops[]`, `emergentProperties[]`, `leveragePoints[]`, `sessionId`, `iteration`, `nextAnalysisNeeded`.
- **Returns:** dynamics analysis, identified loops, `sessionContext`.

#### `scientificmethod`
Empirical hypothesis testing workflow.
- **Parameters:** `stage` (`observation` → `question` → `hypothesis` → `experiment` → `analysis` → `conclusion` → `iteration`), `variables` (independent/dependent/controlled/confounding), `hypothesis`, `experiment`, `analysis`, `conclusion`, `status` (`proposed`/`testing`/`supported`/`refuted`/`refined`), `nextStageNeeded`.
- **Returns:** stage-specific evaluation, `sessionContext`.

#### `structuredargumentation`
Builds or attacks an argument with explicit premises.
- **Parameters:** `claim`, `premises[]`, `conclusion`, `argumentType` (`deductive` | `inductive` | `abductive` | `analogical`), `confidence` (0–1), `nextArgumentNeeded`.
- **Returns:** argument `validity`/`soundness` checks, counterarguments, `sessionContext`.

#### `visualreasoning`
Creates and evolves visual diagrams as reasoning artifacts.
- **Parameters:** `operation` (`create` | `update` | `delete` | `transform` | `observe`), `diagramId`, `diagramType` (e.g. `graph`, `flowchart`, `mindmap`), diagram elements, `iteration`, `nextOperationNeeded`.
- **Returns:** updated diagram state with insights, `sessionContext`.

### Visualization tools

All five are **dual-mode**: called without content they return a *facilitation scaffold* (guiding questions); called with content they return the structured analysis. Never present the scaffold as a result.

#### `mind_map`
Hierarchical brainstorm.
- **Parameters:** `topic` (required), optional `branches[]` (`title`, `subtopics[]`), `sessionId`, `iteration`.
- **Returns:** normalized mind-map structure plus `suggestions` and stats.

#### `concept_map`
Concepts connected by labelled relations.
- **Parameters:** `main_concept` (required), optional `related_concepts[]` and `relations[]` (`from`, `to`, `label`).
- **Returns:** normalized concept map with cycle/grouping analysis.

#### `fishbone_diagram`
Ishikawa root-cause analysis across cause categories.
- **Parameters:** `problem` (required), optional `causes[]` (`category`, `causes[]`) and custom `categories[]`.
- **Returns:** normalized fishbone with per-category statistics.

#### `swot_analysis`
Weighted SWOT with TOWS strategy ranking. See the detailed example in [Usage](#usage).
- **Parameters:** `subject` (required), optional quadrant arrays with plain strings or weighted objects `{ text, impact 1-5, likelihood 1-5, tags[] }`, `topN` (default 5 per TOWS family), `matchMode` (`all` | `tags`).
- **Returns:** normalized quadrants, ranked `towsRanked` (`so`/`wo`/`st`/`wt`), `scores` (incl. `balance`, `riskExposure`, `weighted`) and `meta` (`truncatedPerQuadrant`, `unpaired`).

#### `issue_tree`
Hierarchical problem decomposition.
- **Parameters:** `problem` (required), `depth` (1–5), optional `sub_questions[]`.
- **Returns:** normalized issue tree with per-branch depth statistics.

### Utility tools

#### `analogical_mapper`
Imports solution patterns from other domains. Returns per-domain guiding questions; **you** construct the analogy.
- **Parameters:** `problem`, `seed_domains[]` (e.g. `biology`, `economics`), `k` (domains to use).

#### `assumption_xray`
Surfaces hidden assumptions in a claim via heuristic extraction (universality, causality, necessity, comparatives).
- **Parameters:** `claim`, `context`.
- **Returns:** assumptions with `evidence`, `heuristicConfidence`, and `falsificationTests`.

#### `comparative_advantage`
Maps tasks to the best-suited agent by skill fit.
- **Parameters:** `skills` (map agent → { skill: level }), `tasks` (map task → required skills[]); optional `capacity` (max tasks per agent → greedy multi-task assignment) and `costs` (effective score = skill score / cost). Missing skills count as 0.

#### `drag_point_audit`
Scans a process log for drag points: per-keyword occurrence counts, repeated messages, overall drag density.
- **Parameters:** `log` (required), optional `categories[]` (default: `error`, `warning`, `timeout`, `retry`, `slow`).

#### `safe_struggle_designer`
Designs a deliberate-practice plan from a skill gap.
- **Parameters:** `skill`, `current_level`, `target_level` (must be greater); optional `hours_per_week`, `session_minutes`, `deadline_weeks`.
- **Returns:** level ladder with success criteria and prerequisite chains per step, review intervals, deadline-overrun warnings.

#### `seven_seekers_orchestrator`
Orchestrates a multi-lens research sweep.
- **Parameters:** `query`, optional `downstream_tools[]`.
- **Returns:** scaffold for seven lenses (empirical, logical, ethical, pragmatic, systemic, creative, critical) with guiding questions; **you** answer them and synthesize.

#### `value_of_information`
Quantifies whether resolving an uncertainty is worth the research cost (EVPI-style).
- **Parameters:** `decision_options[]`, `uncertainties[]`, `payoffs[]` (opportunity cost per uncertainty); optional `probabilities[]` (0–1), `option_payoffs` (per-option matrix), `sampled_uncertainties[]` (partial VoI).
- **Returns:** `voi_score`, ranked uncertainties by expected impact.

#### `existing_tool_example`
Echoes the provided `text` back — smoke test for the tool wiring.

#### `agents_guide`
Returns a ready-to-use AGENTS.md reasoning-tool guide for consuming projects. See [Agent Guide](#agent-guide) for modes, markers, and chat prompts.

### Session tools

Reasoning state lives server-side per session. Three tools manage it:

- **`session_info`** — inspect the current session: per-tool-call statistics, history, and state sizes.
- **`session_export`** — serialize the full session state (persist it in your project, e.g. `memory-bank/`, before a context ends).
- **`session_import`** — restore a previously exported state and continue where the stats left off.

## Usage

Each individual tool (e.g., `sequentialthinking`, `mentalmodel`, `debuggingapproach`, ...) is
registered on its own. In addition, four grouped toolset tools are available — `reasoning`,
`visualization`, `utility`, and `session` — which select the underlying tool via an
`operation` parameter (e.g., operation `mentalmodel` within the `reasoning` toolset).
The examples below use the toolset form.

Note on naming: individual tool names follow their historical naming — the earlier tools use
compact lowercase (`sequentialthinking`, `mentalmodel`), while later additions use snake_case
(`analogical_mapper`, `session_info`). These names are part of the public API and are kept stable.

### SWOT analysis

`swot_analysis` works in two modes. Without quadrant content it returns a facilitation
scaffold with per-quadrant guiding questions. With content provided via the optional
`strengths` / `weaknesses` / `opportunities` / `threats` arrays it returns the structured
analysis, weighted scores, ranked TOWS strategies (SO/WO/ST/WT), and match metadata.

Quadrant entries accept either a plain string or an object `{ text, impact, likelihood,
tags }` with `impact`/`likelihood` in 1–5 (default 3). Entries are returned normalized
as objects, and `towsRanked` lists the strategic pairs sorted by `impact × likelihood`
(pairScore) with a stable input-order tiebreaker.

**Breaking changes vs. the previous behavior (v2):**

- `topN` (default **5**) caps the strategic pairs per TOWS quadrant after ranking; the
  previous hard-coded 2x2 cap on the first entries per side is gone. Pass `topN: 0` for
  the unlimited cross product. `tows` and `towsRanked` are cut consistently — TOWS strings
  stay score-free, scores live only in `towsRanked` (`pair`, `score`, `tags`, `sharedTags`).
- Quadrant arrays in the response are **normalized objects** (`{ text, impact, likelihood,
  tags }`), not the raw input strings — consumers reading plain strings must switch to
  `.text`.

**Tag matching:** `matchMode: "tags"` keeps only pairs whose entries share at least one
tag (case-insensitive; `sharedTags` reports the intersection in the first side's
spelling, exactly one pair per entry combination). Untagged entries — including plain
strings — form no pairs and are reported in `meta.unpaired`. `towsRanked[].tags` mirrors
both entries' tags in input order (duplicates preserved). `meta.weightedEntries` counts
the entries supplied as objects (vs. defaulted plain strings) per quadrant.
`meta.truncatedPerQuadrant` shows where `topN` cut. The default `matchMode: "all"` keeps
the full cross product and leaves `unpaired` empty. `scores.weighted` mirrors the v1
balance/riskExposure ratios on weighted sums (impact × likelihood per entry).

### Mental Models

```typescript
const response = await mcp.callTool('reasoning', {
  operation: 'mentalmodel',
  modelName: 'first_principles',
  problem: 'How to implement a new feature?',
  steps: ['Break down the problem', 'Analyze components', 'Build solution']
});
```

### Debugging Approaches

```typescript
const response = await mcp.callTool('reasoning', {
  operation: 'debuggingapproach',
  approachName: 'binary_search',
  issue: 'Performance degradation in the system',
  steps: ['Identify performance metrics', 'Locate bottleneck', 'Implement solution'],
  findings: 'Database connections spiking during peak hours',
  resolution: 'Optimized connection pooling'
});
```

### Sequential Thinking

```typescript
const response = await mcp.callTool('reasoning', {
  operation: 'sequentialthinking',
  thought: 'Initial analysis of the problem',
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true
});
```

## Docker

Build the Docker image:

```bash
docker build -t paschbaer/clear-thought .
```

Run the container:

```bash
docker run -it -p 3000:3000 paschbaer/clear-thought
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Start the server: `npm run start:http` (or `npm start`) — listens on the `PORT` environment variable (default: `3000`)
5. Run tests: `npm test`
6. After every **deployment**, run the live functional test against the running instance: `npm run test:live` (or `BASE=<url>/mcp node scripts/funktionstest.mjs`). It exercises every registered tool — individual and toolset dispatch, dual-mode behavior and the session lifecycle — and exits non-zero on any failure. Treat it as the regression gate for deployments.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE for details.

## Acknowledgments

- Based on the Model Context Protocol (MCP) by Anthropic, and uses the code for the sequentialthinking server
- Mental Models framework inspired by [James Clear's comprehensive guide to mental models](https://jamesclear.com/mental-models), which provides an excellent overview of how these thinking tools can enhance decision-making and problem-solving capabilities
