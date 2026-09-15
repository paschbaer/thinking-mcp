# Lessons Learned — Thinking-MCP

> Recurring bugs, traps, and best practices. Check BEFORE starting a new task;
> update when resolving a recurring bug or making a strategic decision
> (AGENTS.md → Lessons Learned / Automatic Post-Bugfix Documentation).

## Avoid These Mistakes

- **Smithery Naming score is rename-resistant — don't chase it:** renaming all 12
  compact-lowercase tools to snake_case (breaking 1.0.0) left the Smithery "Naming"
  score EXACTLY unchanged at 4.44pt. The scoring rule is unknown (possibly camelCase
  preferred, possibly a structural plateau). → 96/100 is the practical ceiling; never
  do another breaking rename toward an UNKNOWN scoring target. Falsified empirically
  via before/after rescan (2026-09-15).
- **Factories must parse config defensively — raw configs arm broken defaults:** the clear-thought
  factory trusted the caller to pass a schema-parsed config; a raw/partial config left
  `sessionTimeout` undefined → `setTimeout(cleanup, undefined)` = **immediate cleanup**, wiping the
  session store between two tool calls (symptom: session_save exported empty data; looked like a
  store bug). → `ServerConfigSchema.parse(config)` inside the factory. Found while building
  track-D persistence tests (2026-09-14).
- **read_file can serve stale editor-buffer content after external (sed/python) writes:**
  grep/disk showed the broken line, read_file showed clean content. → Trust grep/disk tools after
  out-of-band edits; verify with `sed -n` before re-editing. Hit during the session-timeout
  debugging (2026-09-14).- **npm account 2FA mode „authorization and publishing" blocks OIDC trusted publishing:** with
  this mode the registry demands an OTP per publish — an OIDC workflow cannot supply one, so the
  publish fails with `403 OIDC permission denied for this action` even with a correctly
  configured trusted publisher. Deceptive: provenance SIGNING still succeeds (masking the
  cause). → Switch the account 2FA mode to „authorization only" for OIDC releases. Found
  during the 0.2.0 release (2026-09-14).
  **Second ring (same 403 after the account fix):** packages first published interactively get
  PACKAGE-level 2FA enforcement ("require 2FA to publish") — also incompatible with OIDC. →
  Package Settings → disable the per-package 2FA requirement, then re-run the failed job.
  **Third ring (found in the TP settings UI):** check the trusted publisher's PERMISSIONS label —
  ours read `npm stage publish` (stage-only!) while "Publishing access" was on the legacy option
  2 ("... or granular access token with bypass 2fa enabled"). Fix sequence: switch Publishing
  access to option 1 ("disallow bypass 2fa tokens (recommended)") → Update → DELETE and re-CREATE
  the trusted publisher (permissions are frozen per connection) → re-run the job. Target state:
  permissions show `npm publish`. Account mode + package access + TP permission must ALL be
  OIDC-friendly (2026-09-14, pending final confirmation).
- **Advertised outputSchema requires structuredContent on EVERY call path:** once a tool declares
  an output schema, the SDK rejects results without structuredContent (`-32602: ...no structured
  content was provided`). The central text→structuredContent derivation silently skips non-JSON
  payloads (arrays, markdown) — session_export broke exactly this way for MCP clients when the
  capability round advertised its schema. → Handlers with array payloads or non-JSON text
  (markdown summaries) must provide explicit structuredContent. Found by the Tier-1 contract
  eval; fixed in 0.1.2 (2026-09-14).
- **npm bins run through .bin symlinks — direct-execution guards must compare realpaths:** when
  npm/npx invokes a bin, `process.argv[1]` is the `.bin` symlink path while `import.meta.url` is the
  resolved real file — a plain equality guard (`import.meta.url === pathToFileURL(argv[1]).href`)
  silently no-ops (exit 0, zero output) for every npx/global install. Use
  `realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)`. Found after publishing 0.1.0:
  `npx @paschbaer/clear-thought` was a silent no-op; bin-invocation regression tests now cover it.
  Related: with `/dev/null` stdin the stdio server exits cleanly right after startup (EOF) — hold
  stdin open in smoke tests, and give drvfs module loads ≥120 s in spawn-based tests.
- **Direct module calls bypass zod defaults → NaN payloads:** calling the
  algorithm modules with raw objects (instead of `schema.parse(...)`) leaves
  defaulted fields (`stepReward`, `lengthscale`, `maxIterations`, …) as
  `undefined`; computations silently produce NaN and `JSON.stringify` renders
  them as `null`s — integration tests via the MCP client stayed green while 4
  unit tests failed. → Unit tests must parse params through the zod schemas
  (single source of truth), exactly like the dispatcher does. Found in the
  Real Computing round (2026-09-13).
- **Escaped JSON inside MCP SSE responses:** `tools/call` results arrive as
  `data: {...}` lines where `result.content[0].text` is itself a JSON
  *string* — the inner quotes are escaped (`\"mode\": ...`), so grep patterns
  like `'"mode": "full"'` silently match nothing. → Parse with a real JSON
  pipeline (node `fetch` + `JSON.parse`), never grep raw SSE for inner fields.
- **WSL2 /mnt/c cold-start I/O hang:** Node processes started from this repo
  on `/mnt/c` occasionally hang uninterruptibly during module load (`ps` STAT
  `Dl`): silent, no output, HTTP listener never binds. Environment issue (9P
  filesystem), not a code bug — non-deterministic, retries succeed.
  → For smoke tests, poll the listener instead of using fixed sleeps:
  `until curl -s --max-time 2 http://localhost:PORT/health; do sleep 1; done`.
  Discovered in the stochastic HTTP-MCP phase 3 verification (2026-09-11).
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
- **Tool-metadata strategy (decision 2026-09-13):** for productive (typed)
  outputSchemas + human-readable titles (RB-10), use a central metadata
  registry (`src/tools/tool-metadata.ts`) applied by the existing central
  `tool.update()` loop in `src/index.ts` — decisionframework
  `rb10-schema-strategy-2026-09-13` — instead of editing ~25 register files
  or keeping passthrough-only schemas. Plan: `plans/quality-distribution.md`.

## Entries

(dated log of resolved bugs / decisions will accumulate here)

- **2026-09-15 — MCP-SDK-Timeout-Falle:** `new Client(info, { timeout })` wird
  still ignoriert (Timeout blieb 60 s → MCP -32001 beim drvfs-Kaltstart).
  Richtig: Constructor-Option `defaultRequestTimeoutMsec` UND pro Request
  `{ timeout }` an `connect`/`listTools`/`callTool` (connect akzeptiert
  `options?: RequestOptions`). Applies to every spawned-server script in
  `evals/` — Kaltstarts auf drvfs brauchen >60 s.
- **2026-09-15 — Startup-Proben unter drvfs-Last:** `bin-invocation.test.ts`
  (Symlink-Startup-Probe) schlägt in der Full-Suite fehl, isoliert aber grün —
  die Probe hat ein festes Zeitfenster und drvfs-Parallellast (collect 1200–1700 s
  pro Suite-Lauf) sprengt es. Regel: Bei Full-Suite-Rot zuerst den Test isoliert
  nachlaufen lassen und die Testdauer prüfen; erst bei isoliert-rot von einer
  echten Regression ausgehen. Dauerhafter Fix (Backlog): Probe-Fenster in der
  Umgebung konfigurierbar machen.


