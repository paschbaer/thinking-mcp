---
description: Capture session lessons as EMMS experience episodes
---

# Capture Lessons to Experience Memory

Analyze this session for recurring bugs, traps, and validated fixes, then
persist each one as an experience episode in the experience-memory server.

## Procedure

1. **Review the session** for recurring bugs, traps, surprising failures, and
   validated fixes. Candidate signals:
   - the same error occurred more than once
   - a fix required multiple attempts (first attempts were `harmful`/`ineffective`)
   - a root cause differed from the obvious one
   - an environment/build/driver quirk cost significant time

2. **For each candidate**, collect these fields:
   - `slug` — kebab-case identifier (e.g. `better-sqlite3-native-binding`)
   - `observation` — what went wrong (symptom + context)
   - `cause` — root cause / why it happened
   - `fix` — the validated workaround or fix

3. **Write them to a JSON file** matching
   `servers/server-insight/tests/fixtures/lessons.json` format:

```json
[{ "slug": "...", "observation": "...", "cause": "...", "fix": "..." }]
```

4. **Seed via the `experience_seed_lessons` MCP tool** (server-side batch
   seeding — NO local script, NO repo checkout required):

```
experience_seed_lessons {
  lessons: [ { slug, observation, cause, fix }, ... ],
  client_context: { scope_id: 'thinking-mcp-lessons', agent_id: 'capture-lessons' }
}
```

The server runs the full episode pipeline (observation → environment →
attempt → outcome → hypothesis → finalize) internally and reports a
per-lesson status: `seeded` | `duplicate` | `failed`. The tool is
transport-independent — it writes to the store of the CONNECTED server
(typically the HTTP store at http://localhost:3002/mcp).

Optional standalone batch seeding from a terminal (e.g. CI): the thin
client `scripts/seed-lessons.mjs <lessons.json>` in this repo calls the
same tool over HTTP (or `EMMS_SEED_TRANSPORT=stdio`). It is a
convenience wrapper only — the MCP tool is the primary path.

5. **Verify** the round-trip with `experience_search` (scope
   `thinking-mcp-lessons`) using the lesson's wording, and report the
   retrieved episodes to the user. The read goes through the same server
   instance the seed tool used, so it also rules out store mismatches.

6. **Append a short entry** to `memory-bank/lessonsLearned.md` (constitution
   requirement) — keep it consistent with the episode content.

7. **Generalize and publish lessons with cross-project value** (optional,
   per lesson, NEVER automatic):
   - Identify lessons whose trap and fix hold for ANY project (tool/library
     behavior, platform quirks, testing patterns) — not repo-specific
     workflows, paths, or configuration.
   - REWRITE the lesson generalized: strip project names, file paths,
     hostnames, container names, and any organizational context; describe
     the tools and versions generically. Redaction for public content is
     stricter than for repository content: no absolute paths, no
     hostnames/usernames, no project or customer names, no environment
     values, no secrets (checklist — verify every field against it).
   - Prefix the slug with `general-` (e.g. `general-fts5-quoted-token-joins-are-implicit-and`).
     The prefix is FUNCTIONALLY required: idempotency keys are global per
     slug (`lesson-<slug>`), so an un-prefixed twin of a repo lesson would
     replay-skip instead of seeding.
   - Seed into the dedicated scope:

```
experience_seed_lessons {
  lessons: [ { slug: 'general-...', observation, cause, fix }, ... ],
  scope_id: 'shared-lessons',
  client_context: { scope_id: 'shared-lessons', agent_id: 'capture-lessons' }
}
```

- Publish each seeded lesson explicitly (audited, revertible via
  `lesson_unpublish`):

```
lesson_publish { workflow_id, experience_id, client_context: { scope_id: 'shared-lessons', ... } }
```

- Verify the cross-scope round-trip: `experience_search` from THIS
  repo's lessons scope (e.g. `thinking-mcp-lessons`) must find the
  published lesson by its keywords.

## Rules

- Only capture **validated** lessons (fix confirmed working in this session) —
  never unverified speculation.
- Idempotency: re-running with the same `slug` reports `duplicate` — never
  duplicates (server-side `idempotency_key = lesson-<slug>`).
- Sensitive data (secrets, tokens, credentials) must be redacted before
  seeding — the server also runs pattern-based redaction as a safety net.
- This file is the MASTER prompt (repo Thinking-MCP). Copies in other repos
  must be synced from here; do not edit copies in place.
- Publishing is an explicit, separate, audited act per lesson: seed first
  (repository-private), review the generalized text against the public
  redaction checklist, THEN publish. `lesson_unpublish` reverts at any time.
  The guidance completion gate (`capture-session-lessons`) seeds only the
  repo scope — shared-lessons seeding in step 7 is an additional,
  agent-driven call and never part of the gate.
