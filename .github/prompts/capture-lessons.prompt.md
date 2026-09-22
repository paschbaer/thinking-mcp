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

4. **Ensure the HTTP server is up, then seed via the seeder script.**
   The seeder writes to the HTTP store (default `EMMS_HTTP_URL =
   http://localhost:3002/mcp`) so lessons land in the SAME store the
   Dockerized server serves — NOT in `~/.insight/emms-store.db`.

```bash
# Step 0: server reachable? (start it if not — it has restart: unless-stopped)
curl -sf http://localhost:3002/health || \
  (cd servers/server-insight && docker compose up -d && sleep 3)

cd servers/server-insight
node scripts/seed-lessons.mjs <path-to-lessons.json>
```

   **If the container cannot be started** (no Docker, remote host): fall back
   with `EMMS_SEED_TRANSPORT=stdio` — this writes the local
   `~/.insight/emms-store.db` — and afterwards merge it into the HTTP store:

```bash
   EMMS_SEED_TRANSPORT=stdio node scripts/seed-lessons.mjs <lessons.json>
   # later, with the container stopped (WAL):
   node scripts/migrate-stdio-store.mjs
```

   Do NOT silently seed via stdio while the HTTP server is running — the two
   stores diverge and the episode becomes invisible to `experience_search`
   over HTTP (observed mismatch, see lessons: split-store).

5. **Verify** the round-trip with `experience_search` (scope
   `thinking-mcp-lessons`) using the lesson's wording, and report the
   retrieved episodes to the user. This read path goes through the same HTTP
   endpoint the seeder wrote to, so it also rules out instance/store
   mismatches. If the session's `experience-memory` MCP instance is not
   connected to the HTTP endpoint, verify directly at the store level
   instead: count the lesson's `lesson-<slug>` rows in
   `servers/server-insight/emms-data/emms-store.db` (table `idempotency`) —
   NOT in `~/.insight/emms-store.db`.

6. **Append a short entry** to `memory-bank/lessonsLearned.md` (constitution
   requirement) — keep it consistent with the episode content.

## Rules

- Only capture **validated** lessons (fix confirmed working in this session) —
  never unverified speculation.
- Idempotency: re-running with the same `slug` never duplicates (the seeder
  uses `idempotency_key = lesson-<slug>`).
- Sensitive data (secrets, tokens, credentials) must be redacted before
  seeding — the server also runs pattern-based redaction as a safety net.
- Single store of truth: seed over HTTP. stdio is only a documented fallback
  followed by a migration run — never a silent parallel store.
- This file is the MASTER prompt (repo Thinking-MCP). Copies in other repos
  must be synced from here; do not edit copies in place.
