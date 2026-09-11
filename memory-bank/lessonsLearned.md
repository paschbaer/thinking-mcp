# Lessons Learned — Thinking-MCP

> Recurring bugs, traps, and best practices. Check BEFORE starting a new task;
> update when resolving a recurring bug or making a strategic decision
> (AGENTS.md → Lessons Learned / Automatic Post-Bugfix Documentation).

## Avoid These Mistakes

- **MCP stdio smoke tests need open stdin (SDK 1.30):** With immediately-closed
  stdin (`/dev/null` or `printf … | node dist/index.js` without a trailing
  `sleep`), the server under `@modelcontextprotocol/sdk` 1.30 starts silently
  (no startup line, no responses, process lingers until killed) — looks like a
  broken build. → Hold stdin open like a real client:
  `(sleep 1; printf '%s\n' '<requests>'; sleep 3) | node dist/index.js`.
  Discovered in the stochastic HTTP-MCP Phase-0 spike (2026-09-11).
- **Tool output > 2000 chars per line:** `read_file` truncates single long
  lines (e.g. JSON payloads with a `content` string). Terminal captures hard-
  wrap long lines and corrupt them (mid-word breaks). → Extract structured
  payload with a small script writing directly to the target file, then verify
  with `read_file`; disclose any artifact.
- **Memory/log files must never lose history:** when editing append-only files,
  never use an existing entry's full text as `oldString` with a replacement
  that omits it. Append after a unique tail anchor or include the original
  entry verbatim in the replacement.

## Resolved Decisions & Best Practices

- **GitNexus stats pollute rule files:** plain `gitnexus analyze` rewrites the
  GitNexus block in AGENTS.md/CLAUDE.md with volatile counts (symbols,
  relationships, flows) on every run, dirtying committed rule files.
  → Always run `gitnexus analyze --no-stats` in this repo; never hand-edit
  content inside the generated block (it is rewritten anyway).
- Guide content lives in `AGENTS_TEMPLATE` + `AGENTS.template.md`; the root
  `AGENTS.md` is generated. All three must stay in sync —
  `tests/agents-guide.test.ts` enforces the contract.
- New reasoning tools: register in `src/tools/index.ts` AND route into the
  matching toolset in `src/toolsets/` — otherwise toolset calls break silently.

## Entries

(dated log of resolved bugs / decisions will accumulate here)
