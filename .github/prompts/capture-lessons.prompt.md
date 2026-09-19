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
   `servers/insight/tests/fixtures/lessons.json` format:

```json
[
  { "slug": "...", "observation": "...", "cause": "...", "fix": "..." }
]
```

4. **Seed via the seeder script** (idempotent — re-runs never duplicate):

```bash
cd servers/insight
node scripts/seed-lessons.mjs <path-to-lessons.json>
```

5. **Verify** the round-trip with `experience_search` (scope
   `thinking-mcp-lessons`) using the lesson's wording, and report the
   retrieved episodes to the user.

6. **Append a short entry** to `memory-bank/lessonsLearned.md` (constitution
   requirement) — keep it consistent with the episode content.

## Rules

- Only capture **validated** lessons (fix confirmed working in this session) —
  never unverified speculation.
- Idempotency: re-running with the same `slug` never duplicates (the seeder
  uses `idempotency_key = lesson-<slug>`).
- Sensitive data (secrets, tokens, credentials) must be redacted before
  seeding — the server also runs pattern-based redaction as a safety net.
