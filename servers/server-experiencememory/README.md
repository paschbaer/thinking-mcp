# Experience Memory MCP Server (EMMS)

Evidence-backed long-term memory layer for coding agents. The server turns
debugging activity into durable, searchable, validated operational knowledge:
agents capture structured **experience episodes** (goal → observations →
attempts → hypotheses → solution → validation), receive a **guidance envelope**
with every response that recommends the next concrete request, and retrieve the
most **applicable** prior experience when a similar problem reappears — with
known-bad attempts flagged so they are not repeated.

**Status:** MVP (tasks T001–T048 complete, golden paths verified).
Functionality is specified in
[`specs/001-experience-memory-server/spec.md`](../../specs/001-experience-memory-server/spec.md);
the underlying product specification is
`SDD/experience-memory-mcp-server-specification.md`.

## Features

### Guided capture workflow
A durable, resumable workflow state machine (`DRAFT → OBSERVED → DIAGNOSING →
SOLUTION_PROPOSED → VALIDATING → LOCALLY_VERIFIED → …`) with per-workflow
revision counters (optimistic concurrency), idempotency keys (replays return
the original result), and append-only event history. Sessions can be
interrupted at any point and resumed without data loss.

### Evidence before confidence
Verified status is impossible without objective evidence: every validation
check that claims `passed` needs an attached artifact (test report, build log,
reproduction output). Unsupported agent assertions can never produce a verified
episode. Harmful attempts remain "critical side effects" until a later
successful attempt resolves them.

### Hybrid retrieval with applicability-first ranking
Four retrieval arms — exact failure-signature hash, normalized signature,
SQLite FTS5 full-text, and local semantic embeddings (all-MiniLM-L6-v2,
384 dims, fully offline) — combined with environment-compatibility scoring.
A semantically similar but incompatible episode (other OS, other runtime
major) is demoted below compatible ones and flagged `reference_only` with
explicit mismatches. Known-bad attempts, contradictions, staleness, and
harmful-feedback are visible per result.

### Per-response guidance
Every successful or recoverable response carries a guidance envelope: current
workflow state, missing required information (with safe collection hints),
allowed next tools, warnings (contradiction, duplicate, stale,
unverified-root-cause), and one schema-valid **recommended next request** with
placeholders (`<collect value>`, `<attach artifact>`) instead of fabricated
values. Agents can decline guidance with a reason; the server recalculates.

### Security & governance
Deterministic pattern-based redaction (API keys, tokens, private keys,
connection strings, passwords, home paths) before anything is persisted;
instruction-like content in artifacts is flagged as data, never treated as
instruction; repository-scope visibility isolation including existence-leak
protection; audit records for privileged operations; no physical deletion of
episodes in the MVP (negative knowledge is retained).

## Tool Selection Guide

| Situation | Use |
|-----------|-----|
| Starting work on any non-trivial failure | `workflow_start` → follow the guidance |
| Same error seen before (known error message/code) | `experience_search` with `failure_signature_hash` if available |
| Vaguely similar problem, different wording | `experience_search` (semantic arm finds paraphrases) |
| Capturing what the environment returned | `experience_record_observation` (kinds: `failure_output`, `command_output`, `test_result`, `environment_fact`, `agent_reflection`, …) |
| Trying a remediation strategy | `experience_record_attempt` → execute via host tools → `experience_complete_attempt` |
| Forming a diagnosis | `experience_propose_hypothesis` (hypothesis ≠ evidence) |
| Having a fix candidate | `experience_propose_solution` with validation `checks` (≥ 1 targeting the original failure + regression checks) |
| Proving the fix works | `artifact_attach` + `validation_record_run` per check |
| Closing the episode | `experience_finalize` (server assesses; requested outcome may be downgraded) |
| A "fixed" problem broke again later | `experience_mark_regression` |
| Memory pointed the wrong way | `experience_record_reuse_feedback` (`misleading`/`harmful` demotes content) |
| Episode is dead ends only | `workflow_abandon` (evidence retained, state → `UNRESOLVED`) |
| False/rotten memory found | `experience_invalidate` (audited, privileged) |

## Tool Reference

**Naming:** tool names use `snake_case` with underscore family prefixes
(`workflow_*`, `experience_*`, `validation_*`, `artifact_*`) — VS Code and other
MCP clients only accept `[a-z0-9_-]` in tool names, so the dotted spec names
(`workflow.start`, …) are mapped 1:1 at registration.

All mutating tools accept the common fields `workflow_id`,
`expected_revision` (optimistic concurrency), `idempotency_key` (replay
protection), and `client_context` (`scope_id` required; `agent_id`,
`trace_id` optional). Every response — success or recoverable error — includes
a `guidance` envelope.

### Setup tool

- **`setup_experience_memory`** — bootstraps the EMMS integration in a target
  repo (analog to clear-thought's `agents_guide`). Returns ready-to-write
  content for `AGENTS.md` / `CLAUDE.md` (marker-based idempotent merge —
  repeat calls replace the previous `emms:lookup-rules` block in place),
  the capture prompt file, and `.gitignore` lines. Accepts
  `repo_name` / `repo_lessons_scope`, `custom_triggers` (repo-specific trap
  domains), and existing file contents to switch into merge mode. The calling
  agent writes the returned `content` fields to the target files. See
  *Automating lesson capture → Level 0* for the full bootstrap flow.

### Workflow tools

- **`workflow_start`** — creates workflow + episode (state `DRAFT`). Inputs:
  `goal`, `scope_id`, optional `scope_fingerprint` (recognizes the same repo
  under a different name), `problem_summary`, `idempotency_key`.
- **`workflow_status`** — current state, revision, missing information, recent
  transitions, guidance.
- **`workflow_abandon`** — finalizes `UNRESOLVED`; all captured evidence is
  retained; audited.

### Capture tools

- **`experience_record_observation`** — `kind` + `content` (+ `exit_code`,
  optional `evidence_artifact_id`). `failure_output` content is normalized
  (timestamps/UUIDs/home paths masked, exit code extracted) into a signature
  hash used by retrieval; `environment_fact` content should be a JSON object
  (e.g. `{"os":"linux","node":"20"}`) — it populates the applicability
  dimensions used by ranking.
- **`experience_record_attempt`** — the intended strategy (`intent`,
  `risk_classification`, `rationale`) recorded before execution.
- **`experience_complete_attempt`** — the actual `outcome` +
  `classification` (`successful`, `harmful`, `ineffective`, …) recorded after.
  Intent and fact are kept distinct by design.
- **`experience_propose_hypothesis`** — a root-cause guess with evidence
  references; status can later be supported/rejected/superseded.

### Solution & validation tools

- **`experience_propose_solution`** — `strategy`, `mechanism`,
  `prerequisites`, `rollback`, optional `checks` (equivalent to
  `validation_plan`).
- **`validation_plan`** — ≥ 1 check with `targets_original_failure: true` plus
  regression checks; moves the episode to `VALIDATING`.
- **`validation_record_run`** — one executed check; `evidence_artifact_id` is
  required when the check declares `evidence_requirement`. When all checks
  have passed runs with evidence, the episode advances to `LOCALLY_VERIFIED`.
- **`experience_finalize`** — `requested_outcome: verified |
  partially_verified | unresolved`. The server assesses the evidence: a
  `verified` request without complete evidence yields
  `MISSING_REQUIRED_EVIDENCE` (listing exactly what is missing) and leaves the
  state untouched — complete the evidence and re-finalize. Duplicate
  candidates (same normalized signature + ≥ 0.8 goal similarity) are reported.

### Evidence tools

- **`artifact_attach`** — base64 content, `kind`, `media_type` (`text/plain`,
  `application/json`, `text/x-diff`, `application/x-ndjson`), max 1 MiB.
  Content is redacted (findings reported), stored content-addressed
  (SHA-256 as filename), hash-verified on read (`ARTIFACT_HASH_MISMATCH` on
  tamper).

### Retrieval & feedback tools

- **`experience_search`** — `query`, `scope_id`, optional
  `failure_signature_hash`, `environment` (dimensions to compare), `limit`
  (1–20, default 5), `include_unverified`/`include_negative`. Results are
  concise cards: relevance, applicability (matches/mismatches/unknowns),
  validation tier, `known_bad_attempts`, flags (`contradiction`, `stale`),
  `recommended_use` (`applicable` vs `reference_only`).
  `retrieval_notes.semantic_available` reports whether the embedding arm is
  active.
- **`experience_record_reuse_feedback`** — verdict `applicable | useful |
  misleading | harmful`; `harmful` visibly demotes the episode in future
  rankings.
- **`experience_mark_regression`** — a previously verified solution failed;
  immediately demotes it, flags a contradiction warning, links the failing
  episode.
- **`experience_invalidate`** — privileged; removes from default search,
  keeps everything auditable.

## Usage

### Typical debugging cycle

1. **Start** — always begin with a search, not a capture:

```json
{ "tool": "experience_search", "arguments": {
  "query": "ERESOLVE peer dependency conflict",
  "scope_id": "my-repo",
  "environment": { "os": "linux", "node": "20" }
}}
```

If a verified, applicable episode comes back: use its solution, skip the
`known_bad_attempts`, and close the loop with `record_reuse_feedback`.

2. **Capture** — if nothing (or only `reference_only`) comes back:

```json
{ "tool": "workflow_start", "arguments": {
  "goal": "clean install exits 0",
  "scope_id": "my-repo",
  "problem_summary": "npm ERR code ERESOLVE",
  "idempotency_key": "turn-12",
  "client_context": { "scope_id": "my-repo", "agent_id": "claude" }
}}
```

3. **Follow the guidance** — each response names the single most useful next
request and what is still missing. The safe sequence is: failure observation →
environment fact (JSON) → attempt → outcome → hypothesis → solution with
checks → attach evidence → validation runs → finalize.

4. **Be honest at finalize** — requesting `verified` without complete evidence
returns the exact gap (`checks[1].passed_evidence`,
`unresolved_critical_side_effect`) instead of silently verifying. That is the
feature working as designed; collect the evidence and retry.

### What NOT to do

- Do not record `agent_reflection` observations as if they were `test_result`
  evidence — trust labels and provenance distinguish them, and finalize will
  not count them toward verification.
- Do not skip `expected_revision` — concurrent agents mutating the same
  workflow will be rejected with `STALE_REVISION` and the current revision.
- Do not put secrets in observation content — artifacts are redacted, raw
  observation content is stored as-is (the agent is expected to redact
  before recording).
- Do not treat `reference_only` results as instructions — they explain how a
  similar problem was solved *elsewhere*; port the idea, not the commands.

## Installation

**From source (current state — not yet published to npm):**

```bash
git clone https://github.com/paschbaer/thinking-mcp.git
cd thinking-mcp
yarn install
yarn workspace @paschbaer/experiencememory build
```

The stdio entry is then available at
`servers/server-experiencememory/dist/dev.js`.

**VS Code (`.vscode/mcp.json`):**

```json
{
  "servers": {
    "experience-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/thinking-mcp/servers/server-experiencememory/dist/dev.js"],
      "env": {}
    }
  }
}
```

## Docker

Build and run (HTTP transport on port 3002):

```bash
cd servers/server-experiencememory
docker compose up -d --build
curl http://localhost:3002/health
# → {"status":"ok","service":"experience-memory-mcp",...}
```

The MCP endpoint is `http://localhost:3002/mcp` (Streamable HTTP). The store
lives in `./emms-data/` on the host (bind mount) — it survives re-deploys,
`docker compose down`, and image rebuilds; back it up by copying that
directory while the container is stopped.

Plain `docker run` also works — the image defaults
`EMMS_STORAGE_PATH=/usr/src/app/data/emms-store.db` (inside the node-owned
volume directory):

```bash
docker run -d -p 3002:3002 paschbaer/experiencememory:latest
```

### MCP client configuration (Docker, HTTP transport)

When the container runs, point your MCP client at the exposed HTTP endpoint
instead of a stdio command — VS Code (`User mcp.json` or workspace
`.vscode/mcp.json`):

```json
{
  "servers": {
    "experiencememory": {
      "url": "http://localhost:3002/mcp",
      "type": "http",
      "autoStart": true
    }
  }
}
```

The repository root also ships a `docker-compose.yml` that runs both MCP
servers (experience-memory on :3002, clear-thought on :3000) together — the
store persists on the host in `emms-data/`:

```bash
docker compose up -d --build   # from the repository root
```

Verify: `curl http://localhost:3002/health`

Notes:
- `better-sqlite3` is rebuilt natively inside the image (container platform
  ≠ host platform).
- The first semantic search downloads the MiniLM model (~90 MB) into the
  container's cache; until then `semantic_available: false` is reported and
  signature + full-text arms serve retrieval. Mount a cache volume if you
  want the model to survive container recreation.

## Automating lesson capture

The server's own dogfooding showed the core value: recurring bugs (native
builds, driver quirks, race conditions) persist as searchable episodes and
surface automatically when a related problem reappears. Four levels of
automation — from one-command setup to fully integrated agent behavior:

### Level 0 — One-command setup (`/setup-experience-memory`)

Bootstraps the full integration in any repo. Invoke the prompt file
`.github/prompts/setup-experience-memory.prompt.md` (VS Code:
`/setup-experience-memory`) and the agent performs:

1. Verify the EMMS server build (`dist/dev.js`)
2. Create the capture prompt file (`.github/prompts/capture-lessons.prompt.md`)
3. Append the Level-2 lookup rules to `AGENTS.md` / `CLAUDE.md`
   (idempotent — skips if the section exists; trigger table adaptable to
   the repo's trap domains)
4. Gitignore runtime data (`emms-data/`, store, artifacts)
5. Optionally seed initial lessons (from a JSON file or convertible
   `lessonsLearned.md` entries)
6. Report everything created/appended/seeded

After the setup runs, `/capture-lessons` is available for session-end
capture and the Level-2 lookup rules are live for task-start retrieval.

### Level 1 — Batch seeding (script)

`scripts/seed-lessons.mjs` reads a JSON file of lessons and captures each as a
complete episode (observation → environment → attempt → outcome → hypothesis
→ finalize). Idempotent via `idempotency_key = lesson-<slug>`:

```bash
node scripts/seed-lessons.mjs tests/fixtures/lessons.json
# re-running never duplicates (verified: second run leaves count at 7)
```

The seed file (`tests/fixtures/lessons.json`) doubles as the portable,
reviewable source of truth for your team's traps. Wire it into your workflow:
after a debugging session, append the new lesson to the JSON and re-run.

### Level 1b — Session-end capture hook (prompt file, via `/capture-lessons`)

A reusable VS Code prompt file triggers capture at session end:
`.github/prompts/capture-lessons.prompt.md`. Invoke it with
`/capture-lessons` — the agent analyzes the session, writes the lessons JSON,
runs the seeder, verifies the round-trip via `experience_search`, and appends
the constitution-required `memory-bank/lessonsLearned.md` entry. Semi-automatic
(one deliberate invocation), but reliable because the prompt encodes the
whole procedure.

Two further hook variants (not implemented — trade-offs below):

| Variant | Mechanism | Trade-off |
|---------|-----------|-----------|
| Git post-commit hook | Captures on every commit from the commit message + diff | Automatic, but wrong trigger point (commit ≠ session end) and no chat context |
| VS Code extension with session-end event | Full hook: fires when the agent session closes | True automation, but requires building/maintaining an extension |

### Level 2 — Proactive retrieval via agent instructions

Seeding only helps if the lesson is found again. Add a rule to your agent
instructions (`copilot-instructions.md` / `AGENTS.md`) that triggers a search
at task start when the domain matches:

```markdown
## Experience Memory lookup
Before touching better-sqlite3, SQLite FTS5, yarn workspaces, or native
module builds, search prior experience:

experience_search { query: "<the area + problem keywords>",
                    scope_id: "thinking-mcp-lessons" }

If a PARTIALLY_VERIFIED / LOCALLY_VERIFIED episode matches, follow its
recorded fix and record reuse feedback afterwards.
```

This turns passive documentation into an **active lookup**: the trap surfaces
before the mistake repeats, and `record_reuse_feedback` measures whether the
memory actually helped (misleading/harmful content is demoted automatically).

### Level 3 — Auto-capture hooks (consolidation phase, planned)

The end state (spec §30.2, automatic capture hooks): the agent runtime feeds
failed attempts, error signatures, and successful fixes to the server during
the session — no explicit seeding step at all. Prerequisites: lesson
consolidation (`lesson.*` tools), promotion thresholds, and capture hooks in
the agent harness. The current data model already supports this; only the
tooling is missing.

### Recommendation

Start with Level 1 (batch-seed your team's known traps once), add Level 2 to
the agent instructions, and treat Level 3 as the consolidation-phase
deliverable. The `lessons.json` file from Level 1 is the seed corpus for
Level 3's automatic clustering.

## Configuration

| Env / config | Default | Meaning |
|--------------|---------|---------|
| `EMMS_STORAGE_PATH` | `./emms-store.db` | SQLite database file (WAL mode, FTS5 required) |
| `PORT` | `3002` | HTTP transport port (stdio via `npm run dev`) |
| ranking weights | D6 defaults (see research.md) | configurable in `src/config.ts` |

## Development

```bash
cd servers/server-experiencememory
yarn install
yarn workspace @paschbaer/experiencememory build
npm test             # 63 tests: contract, unit, golden paths
npm run typecheck
npm run dev          # stdio
npm run dev:http     # HTTP on :3002
```

Test layout:
- `tests/contracts/` — tool/storage/guidance/retrieval/isolation contracts
  (written before implementation, per project constitution)
- `tests/unit/` — state machine, revisions, redaction, normalization
- `tests/fixtures/` — 30-task evaluation corpus, SC-001 baseline harness,
  golden-path runner (G1–G3, `golden-results.md`)

The golden-path test (`tests/fixtures/golden-g1-g3.test.ts`) executes the
full quickstart scenarios end-to-end against a real server instance and is
the deployment regression gate.

## Contributing

Follow the repository constitution (`.specify/memory/constitution.md`):
feature branch off `develop`, tests before implementation, memory-bank
updates with every significant change. Spec changes go through the Spec Kit
flow (`/speckit-specify` → … → `/speckit-implement`).

## License

MIT — see [LICENSE](../../LICENSE).

### Prompt files: workspace vs. user level

The two prompt files live in `.github/prompts/` (workspace). VS Code only
auto-discovers workspace prompt files in **agent** chat mode — if `/setup-
experience-memory` or `/capture-lessons` do not appear in the `/` menu:

1. switch the chat mode dropdown (next to the input) to **Agent**, or
2. copy the files to the user prompts folder, where they are always listed:

```bash
mkdir -p ~/.vscode-server/data/User/prompts   # WSL remote
cp .github/prompts/*.prompt.md ~/.vscode-server/data/User/prompts/
```

(user-level path on Windows: `%APPDATA%\Code\User\prompts\`)
