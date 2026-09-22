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
[
  { "slug": "...", "observation": "...", "cause": "...", "fix": "..." }
]
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

## Rules

- Only capture **validated** lessons (fix confirmed working in this session) —
  never unverified speculation.
- Idempotency: re-running with the same `slug` reports `duplicate` — never
  duplicates (server-side `idempotency_key = lesson-<slug>`).
- Sensitive data (secrets, tokens, credentials) must be redacted before
  seeding — the server also runs pattern-based redaction as a safety net.
- This file is the MASTER prompt (repo Thinking-MCP). Copies in other repos
  must be synced from here; do not edit copies in place.
