---
description: Set up the experience-memory integration for this repo (tools, prompt file, instruction rules)
---

# Set Up Experience Memory Integration

Bootstrap the EMMS integration for THIS repository. Perform every step below,
then report what was created/verified. Do not skip steps silently.

## Step 1 — Verify the EMMS server is available

Check the server entry point exists:

```
servers/server-experiencememory/dist/dev.js
```

If missing, run `yarn workspace @paschbaer/experiencememory build` (or
`cd servers/server-experiencememory && npm run build`). If the build fails,
STOP and report the error.

Smoke-test via stdio: connect an MCP client to `dist/dev.js` and call
`workflow.start`. Expect a workflow id + guidance envelope.

## Step 2 — Create the capture prompt file

Create `.github/prompts/capture-lessons.prompt.md` (skip if it already
exists and is non-empty). Content: the session-end capture procedure —
analyze the session for recurring bugs/traps/validated fixes, write a
lessons JSON array (`slug`, `observation`, `cause`, `fix`), seed via
`servers/server-experiencememory/scripts/seed-lessons.mjs` (idempotent,
`idempotency_key = lesson-<slug>`), verify via `experience_search`, and
append a short entry to `memory-bank/lessonsLearned.md`.

## Step 3 — Append lookup rules to instruction files

Append the following section to BOTH `AGENTS.md` and `CLAUDE.md`
(before appending, check the section is not already present — search for
`Experience Memory Lookup (EMMS)`; if found, skip the append for that file):

````markdown
## Experience Memory Lookup (EMMS) — Level 2 proactive retrieval

Before working in a known trap domain, search prior experience via the
local **experience-memory** server (stdio, `servers/server-experiencememory`):

Trigger domains → search query keywords:

| Trigger (touching…) | Query keywords |
|---|---|
| better-sqlite3 (install, rebuild, queries) | `better-sqlite3 bindings named params` |
| SQLite FTS5 / full-text search | `fts5 match injection sanitize` |
| vitest / ESM test imports | `vitest esm ts extensions` |
| finalize / assessment / evidence logic | `finalize assessment read-only read-after-write` |
| ranking / demotion / dedupe tests | `sc009 ranking comparison jaccard` |
| semantic embeddings / transformers | `minilm embeddings offline` |
| Docker / native module builds | `docker native rebuild bindings` |

Call (stdio via VS Code MCP server `experience-memory`, or a small node script
with `StdioClientTransport`):

```
experience_search { query: "<keywords>", scope_id: "<repo-name>-lessons" }
```

- A hit with tier `PARTIALLY_VERIFIED` / `LOCALLY_VERIFIED`: follow the
  recorded fix (`known_bad_attempts` = paths that already failed) and record
  `experience_record_reuse_feedback` afterwards (verdict `useful`/`harmful`).
- No hit: proceed normally — and if the session uncovers a new recurring trap,
  seed it via `servers/server-experiencememory/scripts/seed-lessons.mjs`.
````

Adapt the trigger table to THIS repo's trap domains (remove rows that do not
apply, add repo-specific ones). Replace `<repo-name>-lessons` with the
actual lessons scope id.

## Step 4 — Ensure runtime data is gitignored

Append to `.gitignore` if not present:

```
servers/server-experiencememory/emms-data/
servers/server-experiencememory/emms-store.db*
servers/server-experiencememory/emms-artifacts/
```

## Step 5 — Seed initial lessons (optional)

If the user provides a lessons JSON file (or existing
`memory-bank/lessonsLearned.md` contains convertible entries), seed them:

```bash
cd servers/server-experiencememory
node scripts/seed-lessons.mjs <lessons.json>
```

Convert markdown lessons to the JSON format (`slug`, `observation`, `cause`,
`fix`) — one episode per lesson. Report the seeded count.

## Step 6 — Report

Summarize: files created, files appended, lessons seeded, and the reminder
that `/capture-lessons` is now available for session-end capture.

## Rules

- Never modify the generated GitNexus block in AGENTS.md/CLAUDE.md.
- Append-only edits to AGENTS.md/CLAUDE.md (never replace existing content).
- Use the exact tool names (`workflow_start`, `experience_search`, …) —
  dotted spec names are not valid MCP tool names.
