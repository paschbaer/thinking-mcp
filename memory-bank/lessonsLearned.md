# Lessons Learned — Thinking-MCP

> Recurring bugs, traps, and best practices. Check BEFORE starting a new task;
> update when resolving a recurring bug or making a strategic decision

## 2026-10-09 — SEARCH-FIX Step 2 session lessons (session-4ee5f200, feature/insight-search-fts-or-ranking)
- **npm ci --ignore-scripts breaks sharp (transitive dep of @xenova/transformers):** the sharp install script selects/downloads platform binaries; with scripts skipped the import fails at runtime with 'Cannot find module ../build/Release/sharp-linux-x64.node'. → Prevention: add sharp to the explicit `npm rebuild` line (next to better-sqlite3) whenever a Dockerfile uses `npm ci --ignore-scripts` and the dependency tree contains native modules BEYOND the one you know about — check the lockfile for native deps, not just the direct dependency.
- **Per-session service construction does not suit per-process startup hooks:** the HTTP entry builds a fresh McpServer+EmmsService PER MCP SESSION, so a warmup wired into the tool-registration path would run once per session. → Prevention: place once-per-process background work (warmup, caches) at the process entries (listen callback / stdio main), not into factory functions that sessions call repeatedly.

## 2026-10-09 — SEARCH-FIX Step 1 session lessons (session-b25dd900, feature/insight-search-fts-or-ranking)
- **Per-test adapters multiply the better-sqlite3 worker-exit crash:** six tests each creating (and GC-ing) their own WAL database on WSL/drvfs deterministically crash the vitest worker at exit (Database::~Database assert, tests never even start); the same tests pass individually and pass with ONE shared adapter created in beforeAll. → Prevention: for read-only test suites over a seeded store, use a single beforeAll adapter + afterAll close instead of beforeEach/per-test databases — this sidesteps the known Node-24/WSL flake class entirely (seed of this lesson validated by before/after reproduction in the same session).
- **prettier --write on memory-bank files reflows thousands of lines (recurrence of the README trap, now generalized):** batch-formatting activeContext.md/progress.md produced a 3300-line rewrap that buried the real ~15-line content change. → Prevention: never put memory-bank (or other prose-heavy, non-format-contract) files into a prettier --write batch; edit content surgically and leave formatting alone.

## 2026-10-09 — GN-D6 API-Reindex lessons (feature/gn-d6-api-reindex)
- **API analyze ALWAYS writes the stats line (no no-stats):** the HTTP API job has no `--no-stats` equivalent (body: path|url, force, embeddings, dropEmbeddings, token, branch) and updates the counts line in AGENTS.md/CLAUDE.md. Content restore alone is NOT enough: the restored file has a newer mtime than the index and inevitably makes `check-index-freshness.mjs` (mtime signal) fail. → Prevention: restore the stats line PLUS preserve the mtime (`touch -d @<epoch>` with the pre-job mtime) — this makes the job's net effect on the file null (`scripts/reindex-via-api.sh` implements the pattern).
- **write_file produces CRLF in .sh files (Windows setup):** dash/bash in WSL then throw misleading syntax errors ("word unexpected (expecting do/in)") on completely correct case/for blocks. → Prevention: after creating shell scripts, normalize to LF (`sed -i 's/\r$//' file`) and cross-check with `sh -n` BEFORE suspecting the logic.
## 2026-10-09 — GND1-Session lessons (feature/gnd1-probe-residuals)
- **retry_operation was a free phase advance:** retryOperations unconditionally advanced the phase after a green ops re-run — without checking whether a submission for the phase had been recorded. With an empty beforeExit (standard phases), any session could be pushed through phases via retry_operation without a submission; experienced live 2x as a desync (phase skipped, submissions:{} empty, content believed lost). → Prevention/Fix: a guard holds the transition without a phase submission (complete excepted — pendingCompletion GDS-6); a regression test pins both directions. Agent-side: after required_hook_failed on a submission, FIRST check get_workflow_state (submissions + phase) and resubmit the submission — do NOT blindly retry_operation (that only heals ops, never the submission).

## 2026-10-08 — Chain-step workflowId is a registry reference since specs/017
- **workflowId in chain.steps is resolved against the workflow registry:** since specs/017 (FR-1) the engine fails closed with `workflow_not_found` (expects `.guidance/workflows/<id>.json`) when a chain step carries a workflowId that is not a registry definition — and that only at `complete_workflow` (successor spawn), NOT already at `start_workflow`. Free-form labels ("gn-d6-api-reindex" as a step name) are legacy semantics from pre-017 times. → Prevention: do NOT set a workflowId in chain.steps (successors inherit standard-development) or reference a real registry file; the stumbling symptom is an apparently successful head run that only explodes at completion. Additionally learned: check-final-review.mjs requires lowercase severities (low/high/…) and status fixed|tracked|accepted as well as base+head in the commits array.

## 2026-10-08 — wsl-writer identity unification (GN chain step 1)
- **One storage identity per pool, otherwise "foreign":** GitNexus validates meta.repoPath against the registry paths — writer and reader MUST use the same path identity. In wsl-writer mode the dual mount (`../:/mnt/d/repos` in addition to `../:/workspaces`) solves exactly that: the WSL CLI writes `/mnt/d/repos/...`, the container reads the same index via the same prefix. A container analyze in this mode flips the identity to `/workspaces/...` and the server loses the repo (healing: WSL analyze with `--force`). Preventive: define the writer role ONCE per workspace (gitnexus.mode), never mix.
- **Docs follow the topology, not the other way around:** after every topology change (writer role, ports, DNS names) ALL description locations must move in sync — the AGENTS.md topology bullet, the README deployment block, compose comments AND the workspace's own responses.json (it steers future agent sessions). Omitted locations produce actionable mis-instructions (e.g. a forbidden container analyze as a reindex).

## 2026-10-08 — GN-D1 Engine-Session lessons (feature/gn-chain-step2)
- **README.md is NOT prettier-formatted as a whole:** `prettier --write README.md` also reformats unnamed, pre-existing areas (tables, JSON samples) — the diff explodes. Preventive: edit only your own section, leave the README out of every `--write` batch (the repo's own lint gate apparently does not check prettier over the whole README).
- **Stray character in large edit_file inserts:** a single stray letter (`n`) in an inserted method produces a tsc error cascade of ~30 messages whose FIRST is reported only AFTER the break point — with syntax errors always take `head` of the error list and read the earliest line, not `tail`.
- **Transport error taxonomy for "capability absent":** a `kind:"transport"` result proves NO absence — timeouts and expired sessions (404/-32001) run through the same branch even though the server is reachable. Classifications may only be built on connection-level errors without `timedOut`/`sessionExpired` flags (GN-D1 review F2).
> (AGENTS.md → Lessons Learned / Automatic Post-Bugfix Documentation).

## Avoid These Mistakes

- **`npx tsx -e` fails for ESM imports in this repo (2026-10-10):** `tsx -e "import {...} from './src/...js'"` runs as CJS eval and throws MODULE_NOT_FOUND for the .js specifier (root yarn workspace hoists tsx, CJS loader cannot resolve the TS-behind-.js mapping). → Prevention: write a temporary `.mts` script file next to the target, run `npx tsx file.mts`, delete it. Used successfully to regenerate `examples/default-guidance/responses.json` from `buildResponses()`.
- **404/-32001 from MCP HTTP servers = evicted session, not a tool defect (2026-10-08, generalized from WF-1):** after server restarts/rebuilds, direct tool calls to HTTP MCP servers (clear-thought, gitnexus, …) occasionally return 404 or JSON-RPC -32001 — the session ID has expired, the tool is not broken. → Prevention: reconnect the editor context server once (self-healed afterwards); do NOT repeat the same route after a failure; at most one fallback (reconnect → call_downstream → one direct HTTP call). NO tool-specific routing rule needed — default tool routing plus this knowledge suffices; for downstream calls through guidance the generic timeout policy from the phase instructions applies anyway.

- **Server-required ≠ capability-required (2026-10-08, Decouple session):** `required: true` on the downstream server (config time) was silently read as mandatory for the CAPABILITY (runtime) — absence blocked workflow completion although the goal was "use IF present". The coupling crept in via compose services, generator defaults and prose rules (optional → obligate symbiosis). → Prevention: capability declaration per workspace (gitnexus.state/mode in guidance.json), an alone test pins the off case, formulate rules conditionally.

- **DrvFs partial-write incoherence between Windows writer and WSL reader (2026-10-08):** a `sed -i` from Git Bash left a file with MIXED pages (one line new, one old); tsc/vitest (WSL) saw the mixed state ("parseGnSetup is not defined"), grep and esbuild output looked partially correct — three tools, three views of the same path. → Prevention: after quick Windows-side writes ALWAYS verify with the consuming toolchain (WSL tsc); on incoherent read views rewrite the file ONCE completely through ONE writer.

- **Two GitNexus index worlds: CLI registry ≠ MCP server registry (2026-10-08, GN migration):** the
  gitnexus MCP server (:4747, its own container) resolved repos exclusively via its OWN
  registry — a WSL CLI `gitnexus analyze` wrote only in-repo `.gitnexus` + the WSL registry and
  remained invisible to the server ("Repository not found. Available: thinking-mcp"); the fix
  required docker-cp of the repo INTO the server container (/tmp, ephemeral). Gate blindness:
  repository-analysis checked the queryability of the container index, index-freshness the WSL
  meta.json — both green although the served index was a week stale. → Prevention: ONE index
  writer (since the migration the compose gitnexus-server container), and on "index not available"
  symptoms ALWAYS compare both registry files (server registry vs. `~/.gitnexus/registry.json`)
  before copying or deleting anything. Path identity is a string comparison: `/mnt/d/...` vs
  `/workspaces/...` is foreign — `--force` takes over the storage.

- **git `safe.directory` is ignored from env/local config (2026-10-08):** `GIT_CONFIG_COUNT/_KEY_/_VALUE_`
  with `safe.directory` showed NO effect in the container — git honors safe.directory only in
  protected (system/global) config; consequence: silently empty `lastCommit` values in the index,
  because analyze swallowed `dubious ownership` errors. → Prevention: in containers with
  root-ownership mounts use the command wrapper (`git config --global --add safe.directory '*' && exec <cmd>`);
  empty lastCommit values in meta.json are the symptom, not the error.

- **start_workflow without a registered workspace name (SKP-1 session, 2026-10-03):** `start_workflow` in pool operation MUST explicitly pass `workspace: "thinking-mcp"` (or the respective registered name) — without the name the session lands under the generic default workspace (pool root), with a different response schema (e.g. a mandatory `summary` at submit_implementation instead of the repo schema) and registry paths. → Prevention: always start future sessions with the registered workspace name; schema deviations (missing mandatory fields) are a symptom of this, not a server bug.

- **GitNexus storage "foreign" due to path casing drift (2026-10-02):** `gitnexus analyze` from
  `/mnt/d/repos/Thinking-MCP` failed with `Storage path is in state "foreign"` because `.gitnexus/meta.json`
  references the index under `/mnt/d/repos/thinking-mcp` (lowercase) — DrvFs is case-insensitive
  (both paths work for cd), but storage ownership checks the path STRING. → Prevention:
  always invoke the index refresh from the exact path recorded in `meta.json` (`repoPath`/`storagePath`);
  on "foreign" first read meta.json, do not delete the storage. Affected is any agent that addresses
  the checkout with differing casing (Windows/WSL mix).
- **Timeout on an MCP mutation ≠ failure (2026-10-02, recurrence-prone):** `submit_verification` ran into
  a context server timeout, but the workflow state afterwards showed `accepted` + phase advance —
  the requestId ledger had already processed the submission. → Prevention: after a mutation timeout
  ALWAYS cross-check `get_workflow_state` (read-only) first, never blindly resubmit (double
  submission/replay risk); the FR-035 retry-once applies only to read-only/idempotent calls.
- **Undocumented language conventions (2026-09-30):** user preferences like output
  language must be persisted in `AGENTS.md` immediately when stated, otherwise they
  are lost across sessions. Convention here: chat in German, all artifacts in English.
- **`git diff`/`git log` without `--no-pager` hangs in the agent terminal (2026-09-28, recurring):** in
  the non-interactive pty the pager starts and blocks the call indefinitely (user abort needed).
  AGENTS.md demands `--no-pager` for EVERY read-only git command — the violation happened exactly at
  `git diff --stat`. → Prevention: never issue a git command without `--no-pager` (or `PAGER=cat`),
  even for "surely short" diffs; on a hanging call suspect the pager first, not git itself.
- **Config-assistant generators must be target-agnostic (Niyama incident, 2026-09-28):** the FRESH
  generator hardcoded a Thinking-MCP lint glob (`npx prettier --check 'servers/*/src/**/*.{ts,tsx}'`)
  into every generated workspace config — exit 2 in any repo without that layout. Fix + rule now in
  `ConfigAssistant.buildOperations`/`generateFiles`: generated ops delegate to the target's own
  scripts (`npm run lint`, non-blocking); adopt-mode preset ops are ALWAYS regenerated from the
  target-fresh template (divergent ref args → loud `REGENERATED` note), never copied; only non-preset
  ops are copied with an `[adopted]` marker. → Prevention: any new generated op must be expressible
  for an arbitrary repo (template vars or delegation to package scripts, never repo-layout globs);
  pinned by the self-containment tests (no `servers/*/src` fragments in generated args).
- **better-sqlite3 glibc binding cannot dlopen in the musl (Alpine) guidance container (2026-09-28):**
  the entire server-insight suite fails there with `Error relocating .../better_sqlite3.node: fcntl64:
  symbol not found` — 72 failures, while the same suite is green on the host. Symmetric to the
  Niyama rollup/musl store issue (NIY-CFG-2). → Prevention: container test-gates that depend on
  native modules need the binding rebuilt for the container platform (or a glibc-based image);
  before attributing container test failures to a diff, check for `ERR_DLOPEN_FAILED` first.
- **`docker compose -f <file>` does NOT auto-load `<file>.override.yml` (2026-09-27):** restarting the
  guidance container with only `docker compose -f servers/server-guidance/docker-compose.yml up -d`
  silently mounted `servers/server-guidance/workspace` (a near-empty dir) as `/workspace` instead of
  the repo — existing sessions appeared "lost" and downstream status reset. Correct invocation:
  `-f docker-compose.yml -f docker-compose.override.yml` (override mounts `../../:/workspace`, the
  `/workspaces` pool and the node_modules volume; README documents it, the -f form ignores it).
  → Prevention: after ANY container restart verify the mount (`docker inspect ... --format
  '{{json .Mounts}}'`) and the workspace list (`curl localhost:3003/health`) before concluding data loss.
- **Guidance sessions are bound to the configurationVersion snapshot — restarting the container after
  any `.guidance` config change invalidates running sessions (specs/008 AC-5, fail-closed by design):**
  continuation fails with `session ... is bound to sha256:..., current configuration is sha256:...`.
  Combined with the compose trap above this looks like data loss; the session JSON survives in
  `.guidance/state/sessions/` but is unusable.
  → Prevention: finish or intentionally abandon a guidance session BEFORE changing `.guidance/*`
  config or restarting its container; after drift, close out the work out-of-band (document +
  verify results independently) instead of fighting the binding.
- **MCP `Context server request timeout` — diagnose SERVER vs CLIENT before touching config (2026-09-27):**
  recurring timeouts on clearthought/gitnexus tool calls looked like server problems.
  Evidence chain that settled it: (1) `docker ps` + `curl /health` — all containers healthy;
  (2) `docker logs --since 24h | grep -iE "error|timeout|slow|warn"` — zero hits;
  (3) direct curl MCP roundtrip against `:3000/mcp` (initialize + notifications/initialized +
  tools/call) = **~160 ms total** — server-side latency is not the bottleneck;
  (4) the same trivial call through the editor connection still timed out.
  → Root cause layer is the **Zed MCP client/HTTP transport** (broken SSE stream / client
  request timeout), NOT the servers. Prevention:
  - On any MCP tool timeout: run the 4-step evidence chain above FIRST. Only after the
    server is proven fast+clean suspect the client.
  - Workaround for heavy ops (gitnexus analyze/reindex): run via CLI/terminal, not MCP —
    server-side timeouts in `.guidance/downstream-servers.json` (300 s) don't apply to the
    editor client, which uses its own (shorter, unconfigurable-from-repo) limit.
  - After a timeout, restart the MCP server session in the editor; cascading timeouts after
    a first failure indicate a dead stream that never re-initialized.
  - Note: gitnexus `:4747` is the WEB UI (`gitnexus serve`), there is no `/mcp` endpoint —
    the editor's gitnexus MCP connection is configured elsewhere (user-level settings).
- **Self-review finds boundary defects late — mandate an independent reviewer pass INSIDE
  the workflow, not only at merge time:** during the workflow-chaining implementation
  (2026-09-25), the in-workflow implementation review (same author, minutes after writing
  the code) missed 4 real defects (wrong featureId source, concurrent-replay double
  activation, gate-ordering at `steps.length == maxChainDepth`, hardcoded zod limit) that
  a fresh review sub-agent over the semantic diff found immediately. Root causes: author
  bias (reading intent, not code), test plan = spec cases only (boundary/replay/omitted-
  optional-field combinations untested), and gate-ordering defects that only boundary-value
  analysis catches. → Prevention (now in `.guidance/responses.json`, review_and_fix_implementation):
  non-trivial scopes REQUIRE an independent reviewer pass (sub-agent, authorship excluded)
  over the semantic diff + boundary checklist (limits ≤/==/>, concurrency/replay/idempotency,
  optional config fields omitted, guard-vs-exhaustion ordering). Same lesson applies outside
  guidance workflows: never merge core-engine changes reviewed only by their author.
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
  debugging (2026-09-14).- **npm account 2FA mode "authorization and publishing" blocks OIDC trusted publishing:** with
  this mode the registry demands an OTP per publish — an OIDC workflow cannot supply one, so the
  publish fails with `403 OIDC permission denied for this action` even with a correctly
  configured trusted publisher. Deceptive: provenance SIGNING still succeeds (masking the
  cause). → Switch the account 2FA mode to "authorization only" for OIDC releases. Found
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

- **2026-09-15 — MCP SDK timeout trap:** `new Client(info, { timeout })` is
  silently ignored (timeout stayed 60 s → MCP -32001 on the drvfs cold start).
  Correct: constructor option `defaultRequestTimeoutMsec` AND per request
  `{ timeout }` on `connect`/`listTools`/`callTool` (connect accepts
  `options?: RequestOptions`). Applies to every spawned-server script in
  `evals/` — cold starts on drvfs need >60 s.
- **2026-09-15 — startup probes under drvfs load:** `bin-invocation.test.ts`
  (symlink startup probe) fails in the full suite but is green in isolation —
  the probe has a fixed time window and drvfs parallel load (collect 1200–1700 s
  per suite run) blows it. Rule: when the full suite is red, first re-run the
  test in isolation and check the test duration; only assume a real regression
  when it is red in isolation. Permanent fix (backlog): make the probe window
  configurable via the environment.
- **2026-09-15 — reasoning models can end up in reasoning loops:** z.ai
  glm-5.3-flash delivered >6 min of continuous reasoning_content deltas
  (2.8 MB!) on a compute-heavy fault-tree prompt without ever rendering —
  3× HTTP timeout across three attempts, although a ping answered in 3.2 s
  and the stream was healthy (SSE, first byte 4.2 s). Sequentially
  misdiagnosed as "timeout too short" and "gateway buffering". Correct: tap
  the raw stream and measure byte arrival; then `thinking:{type:'disabled'}`
  fixed the same prompt in 24 s. Rule: make the think budget per role
  controllable at eval/agent endpoints (actor fast, judge thorough) — don't
  go searching for it only when things break.




- 2026-09-15 (Avoid These Mistakes — backfilled via terminal append, stale
  tool layer): **Edit tools can serve a stale layer for files changed by
  external tooling** — read_file/grep_search/replace_string showed the old
  content (e.g. pre-1.0.0 rename) while terminal cat/grep showed the real
  disk state; probe edits landed in the phantom layer (never on disk).
  → For externally changed files verify via terminal first;
  if replace_string fails on disk-verified anchors: probe against a
  string existing only in the old content, then (with user consensus)
  closeAllEditors or terminal append/patch; create_file does not overwrite
  existing files. Found during the merge implementation.

## 2026-09-25 — Capture gate first productive run (3rd run, green after fix)
- **Tool-vs-contract gap**: `experience_seed_lessons` validates `minItems 1` — the documented "empty array = no-op" contract of the `capture-session-lessons` gate failed in the first productive run (`required_hook_failed`, complete blocked). Fix: guard in the thin client `seed-lessons.mjs` (empty array → exit 0 before MCP transport). Lesson: verify gate contracts against tool behavior, not just the docs — the first productive run of a new gate IS the actual test.
- **Clear-Thought duty fulfilled live**: understand (first_principles mental_model), plan (issue_tree decomposition) — the referencing duty was implemented in both submissions.

- **gitnexus detect-changes index lag**: detect-changes reported 'No changes detected' despite fresh edits — cause unclear; compensation: re-run analyze before detect-changes in the same session, use explicit checks (JSON validation, full read) on contradiction. (Also seeded as an EMMS episode.)
- **Guidance validator cache**: workflow.json changes do not take effect in running sessions —
  `WorkflowEngine.validatorFor` caches compiled schemas per schemaRef for the session lifetime; schema edits, like all .guidance config, only take effect after a restart/new session.

## 2026-09-25 — Guidance gates: config snapshot + template placeholders (GUID-1/3 completed)
- **Config snapshot per session**: the guidance server loads `.guidance/` at session start (configurationVersion SHA in the session state). Operation config changes on disk do NOT take effect in running sessions — fix + container restart + resume needed. Prevention: verify the operations config before `start_workflow`, don't patch mid-session.
- **`${project.name}` placeholder never resolved**: mcpTool arguments ran with the literal string ("Repository \"${project.name}\" not found") — literal passthrough is not a gate success. Workaround: hardcode concrete values; real fix (placeholder engine) = GUID-3.
- **Gate debugging via retry_operation**: the retry re-executes the phase gates server-side — error summaries there are the primary diagnosis source; host-side runs (WSL `yarn build`, exit 0) are valid counter-evidence for container environment problems.

## 2026-09-18: EMMS implementation
- **better-sqlite3 native build**: `--ignore-scripts` installation leaves the native binding missing ("Could not locate the bindings file"). Fix: `npm rebuild better-sqlite3`. For workspace-root installs: the binding sits at the root, not in the server folder.
- **better-sqlite3 named params**: all named parameters must be passed (also `null` for optional columns) — `...spread` with `undefined` fields throws "Missing named parameter". Always map explicitly.
- **FR-008 assessment order**: finalize must read plan/runs/attempts FRESH from the adapter (read-after-write), not the ctx snapshot loaded at mutate time — otherwise the just-written run is missing.
- **Assessment read-only**: a rejected finalize (MISSING_REQUIRED_EVIDENCE) must NOT mutate the episode state (no forced PARTIALLY_VERIFIED transition), otherwise the agent can never reach 'verified' after supplying the evidence.
- **vitest + ESM imports in tests**: `.js` extensions in test imports do not resolve reliably under the vitest/node16 mix — use `.ts` extensions in tests (tests are excluded from tsconfig.build).
- **FTS5 MATCH injection**: user text with punctuation breaks MATCH syntax (`syntax error near ","`) — sanitize query tokens to `[\w\s]` before MATCH.
- **SC-009 demotion test**: ranking demotion needs >=2 candidates with the SAME signature hash (otherwise no real ranking comparison) and the peer must be fully compatible (otherwise applicability-first dominates anyway).

## 2026-09-25 — Guidance capture gate (2nd productive end-to-end run, green)
- **spawnSync without env support**: process operations inherit only the container environment (`OperationEngine.ts:188`) — ENV variables for gate scripts must today be set via `sh -c` inline assignment (see `capture-session-lessons`); a clean solution would be an `env` field in the operation config (→ GUID-5).
- **Lessons file contract**: the agent writes `.guidance/state/session-lessons.json` BEFORE the `complete_workflow` call (gates run on-transition); ALWAYS create the file (empty array = no-op success), otherwise the required gate blocks docs-only runs. Redaction duty is on the agent — `seed-lessons.mjs` talks to insight directly and bypasses guidance's pattern redaction.
- **Idempotency confirmed live**: a repeated seed run reports the same slugs as `duplicate` (exit 0) — double episodes excluded; verification via `experience_search` with the exact slug (full-text arm, semantic arm disabled in the MVP).

## 2026-09-25 — GUID-3/4/5 completed (template resolution, env/shell, regression)
- **Template resolution fail-fast**: `${token}` in `mode: "template"` is now resolved deeply (`session.request`, `project.name`); unknown tokens throw `operation_arguments_invalid` instead of passing through literally (GUID-3 root cause: masked gate bugs). Behavior change documented in the README.
- **Process ops: `env` + `shell`** (GUID-5): `spawnSync` merges `config.env` over process.env and passes `shell` (boolean|string) through — the `sh -c` wrapper workaround disappears from our own operations.json.
- **Regression pattern for "only visible in build" bugs** (GUID-4): public-API test over the real schema load path (validatorFor) + source scan test against bare `require("…")` — vitest alone had never reproduced the crash.

## 2026-09-25 — bare `require` in ESM source (recurrence, 2nd case)
- **Issue**: `createRequireShim()` in `WorkflowEngine.ts` used `require("node:module")` as a bare `require` — in ESM `require` is not defined ⇒ ReferenceError: require is not defined on EVERY `submit_*` call (schema validation loads via the shim). It only surfaced in live Docker operation; the vitest suite never touched the path.
- **Root cause**: repetition of the SpecKitEngine "2d fix" pattern — dynamic `require()` calls survive the CJS→ESM switch in lazy-load paths not covered by tests.
- **Fix**: static import `import { createRequire } from "node:module"` + `createRequire(import.meta.url)` (pattern from `schema-validator.ts`).
- **Prevention**: new rule for code reviews: `grep -rn "require\(" servers/*/src` must only show legal `createRequire` imports; every new `require(` occurrence in `src/**` is a blocker. Second occurrence → the pattern counts as recurring.

## 2026-09-17 — better-sqlite3 boolean bind (recurred, second root cause)
- **Issue**: `experience_record_reuse_feedback` threw "SQLite3 can only bind numbers, strings, bigints, buffers, and null" even after the earlier `?? null` fix.
- **Root cause**: `?? null` only converts `undefined`, NOT `false`/`true`. better-sqlite3 rejects booleans outright — optional boolean fields need explicit 0/1 encoding for INTEGER columns.
- **Preventive measure**: For every optional boolean column bind, write `val == null ? null : (val ? 1 : 0)`, never `val ?? null`. Grep for `?? null` on boolean-typed fields after schema changes.
- **Test note**: add regression tests for BOTH call shapes (optional fields omitted AND supplied) — the minimal-shape test alone passed while the full call crashed.

## 2026-09-18 — Session capture (2 more validated lessons, played into experience-memory scope `thinking-mcp-lessons`)
- **mcp-service-method-unregistered**: `lesson_publish`/`lesson_unpublish` existed as service methods with green service tests but were never registered via `registerTool` on the MCP surface. Prevention: register every public service capability + MCP surface test with a `listTools()` assertion.
- **drvfs-edit-tool-silent-nowrite**: editor-based replace reported SUCCESS but did NOT land on disk (terminal grep showed the old text on /mnt/d drvfs). Prevention: do source edits in this repo via terminal (python3 replace with assert) + grep verification BEFORE build/test; treat a tool success message without a terminal read as unverified.
- Fixture: `tests/fixtures/lessons-session-2026-09-18.json` — seeder 3/3, round-trip confirmed via `experience_search` (every query returns hits).

## 2026-09-19 — CI setup lessons (played into experience-memory scope `thinking-mcp-lessons`)
- **yarn4-v1-lockfile-immutable**: `yarn install --immutable` failed with YN0028 because yarn.lock was still in Yarn v1 format — Berry migrates the file on the first install, which `--immutable` forbids. Fix: one plain `yarn install`, commit the migrated lockfile, afterwards `--immutable` is green.
- **yarn4-blocks-native-build-scripts**: Yarn ≥4.9 blocks build scripts of dependencies by default → the better-sqlite3 postinstall never ran, the native binding was missing (CI would have failed despite a working local npm setup). Fix: root `package.json` → `dependenciesMeta: { "better-sqlite3": { "built": true } }`; verification via binding file + test suite.
- Fixture: seeder 2/2, `experience_search` round-trip confirmed (both queries return both new episodes).

## 2026-09-19 — Replay revision fix lessons (played into `thinking-mcp-lessons`)
- **idempotent-replay-stale-revision**: FR-028 literal replay of `workflow_start` returned the original revision (usually 1) → addendum runs computed against it from then on and crashed with STALE_REVISION (Niyama finding "Rev 3 on the older workflow"). Fix: replay patches `result.revision` to the current workflow revision + `replayed: true`; regression test `replay-revision.test.ts`, suite 95/95. Meta-lesson: literal replay is unsafe for every result field that changes over time.
- **emms-search-response-field-results**: `experience_search` returns hits under `result.results` — a verify probe reading `result.items` masks real hits as "0 hits". Fix: read `results`; on 0 hits first dump the raw envelope before concluding failure.
- Seeder 2/2, round-trip confirmed.

## 2026-09-19 — drvfs directory rename trap (experiencememory → insight)
- **Issue**: `git mv servers/server-experiencememory servers/server-insight` on /mnt/d (WSL drvfs) poisoned the dentry cache: the target directory was then permanently unreadable for WSL (`d?????????` / "No such file or directory"), although Windows (`cmd.exe dir`) showed the full content. Negative cache entries did not expire even after >2 min.
- **Cause**: WSL-side renames on drvfs leave stale positive/negative dentry entries for the target name; even a Windows-side re-creation of the same name stays invisible for WSL.
- **Validated workarounds** (in this order):
  1. **Case variant as a side door**: `ls servers/Server-Insight/` (differing case) bypasses the negative dentry and shows the content.
  2. **Healing via a rename chain to an unburdened name**: `mv <caseVariant> servers/insight-heal && mv servers/insight-heal servers/insight` — the second jump to a never-cached name works; the original target ('server-insight') remained permanently broken.
  3. Preferably execute directory ops on drvfs **Windows-side** (`cmd.exe /c move ...`), never WSL-side for tracked folders.
- Consequence: the server folder is now called `servers/insight` (instead of `server-insight`) — the clean name was free.

## 2026-09-19 — Compose service drift lesson (played into `thinking-mcp-lessons`)
- **server-local-compose-service-drift**: after the root compose rename (experience-memory → insight), `docker compose up` created a third container `experience-memory` — the server-local `docker-compose.yml` in `servers/server-insight` still defined the service under the old name. Fix: rename the service there too, `docker rm` the dead container, verify via `docker compose config --services` per directory. Rule: on service renames grep ALL compose files in the repo, not only the root.
- Seeder 1/1, round-trip confirmed (exp_353dfc99).

## 2026-09-19 — Release pipeline review (insight)
- **Validate publish script copies**: the `publish-smithery.mjs` copied from clear-thought was only half adapted (wrong factory imports, the `defaultConfig` export did not exist, clear-thought-configSchema/-Card) and would have crashed at runtime. Rule: run copied scripts end-to-end (at least dry up to the network boundary), not just syntax-check them.
- **build-mcpb.mjs was never runnable** (missing `dirname` import, invalid manifest schema: tools as a string array instead of objects). Fix following the clear-thought pattern: runtime tool capture + schema-valid manifests.
- **mcpb pack hangs at ~300 MB node_modules** (onnxruntime) in this environment — direct tar.gz pack (`.mcpb` IS a tar.gz with manifest.json in the root) as a replacement; staging on ext4 (/tmp) because of drvfs dentry flicker.
- **npm OIDC cannot create packages**: the trusted publisher must exist per package on npmjs.com — always do the first release manually, then the workflow. Guards: npm `REMOTE=none` → fail-fast with instructions; Smithery `none` → skip with a note.

## 2026-09-19 — Workflow persistence gap (Niyama finding, wf_225bf751-af3)
- **Root cause**: STDIO default `storagePath = cwd/emms-store.db` — every agent started the server from its own cwd and got a fresh, cwd-local DB. Workflows from earlier sessions were "not found" although the server worked correctly.
- **Fix**: persistent default `~/.insight/emms-store.db` (mkdirSync recursive). Chain: config.storagePath > EMMS_STORAGE_PATH (resolveConfig) > ~/.insight. Docker/compose still sets EMMS_STORAGE_PATH to the volume.
- **Verified**: workflow created in server process A, found in independent process B. Suite 95/95.
- **Meta-lesson**: cwd-dependent defaults are persistence traps for stdio MCP servers — default state belongs on user-level paths.

## 2026-09-19 — Final session lessons (played into `thinking-mcp-lessons`)
- **compose-project-context-determines-container-names**: compose derives the project name from the directory of the compose file — server-local compose files create their own projects (server-insight-insight-1) instead of the root stack (thinking-mcp-insight-1). Not broken, but confusing; define a canonical entry point and use `docker compose ls` on name confusion.
- **docker-restore-must-include-wal-sidecar-files**: SQLite WAL keeps fresh commits in the -wal file — .db-only copies lose exactly those (root mechanism of the data loss during the rename). Backups AND restores must include -wal/-shm; verify the row count after a restore.
- **reseed-lessons-from-fixtures-after-store-loss**: lessons exist twice outside the store (JSON fixtures + lessonsLearned.md) — store loss thus becomes an idempotent re-seed instead of data loss (10/10 restored). Keep the dual-write discipline.
- Seeder 3/3, round-trip confirmed.

## 2026-09-19 — Stale import after rename survived the local test run (CI red)
- **Issue**: CI failed with "Failed to load url ../src/tools/agents-guide.js" in setup-clearthought.test.ts — locally the suite ran green.
- **Root cause**: the rename commit (be4a4d2) renamed files but overlooked the test import. The local "142/142 green" was worthless: vitest cache/incremental behavior masked the load error, or the suite was not run in a clean state.
- **Fix**: import corrected to setup-clearthought.js (feb4665), suite 152/152.
- **Prevention**: before "suite green" claims on rename/move commits: `vitest run` in a clean state (at least `npx vitest run --no-cache` or a fresh checkout). `Failed to load url` errors = dead import paths that are only visible without cache.

## 2026-09-20 — Merge round lessons (played into `thinking-mcp-lessons`)
- **native-module-unhandled-rejection-in-vitest**: CI red despite 95/95 green — the caught onnxruntime load error surfaced as a vitest unhandled rejection. Fix: `EMMS_DISABLE_EMBEDDINGS=1` (short-circuits BEFORE the dynamic import) + `it.skipIf` for the 2 real model tests + env in test.yml. Meta: check the unhandled-errors section before claiming "green".
- **npm-publish-from-wrong-directory-publishes-wrong-package**: the publish ran twice from the monorepo root and tried to push `@paschbaer/thinking-mcp@0.0.1` (292 files) — only `private: true` prevented worse. Fix: cd into the workspace folder, verify intent via `node -p "require('./package.json').name"`, READ the tarball contents listing.
- **gitignore-pattern-lost-during-string-replace-edits**: chained string-replace edits on .gitignore silently lost the pattern `/emms-store.db*` — the file stayed untracked despite three "done"s. Fix: after ignore edits verify `git check-ignore` for EVERY file and grep the complete pattern set, amend the commit until everything is exit 0.
- Seeder 3/3, round-trip confirmed (exp_3ebae212, exp_4d4ecd2b, exp_56e5bded).

## 2026-09-20 — Smithery first publish (insight live!)
- **smithery-first-publish-needs-server-upsert**: PUT /servers/{q}/releases returns 404 "Server not found" for new servers — the record must first be created via PUT /servers/{q} (upsert with displayName/description, HTTP 201); afterwards the release PUT works. The script now does create-fallback + release-retry (create 201 → release 202 → patch 200, verified end-to-end).
- **smithery-bundle-cap-25mb-trim**: Smithery cap 25 MB compressed. Raw install ~300 MB. Trim: onnxruntime darwin/win32/arm64 binaries, onnxruntime-web, all ort-wasm variants except simd-threaded, sourcemaps, protobufjs/cli, better-sqlite3 build toolchain (deps/, obj.target, *.mk) → 96 MB → 23.7 MB gz (gzip -9 instead of default — that alone brought 28→23.7).
- **spawnSync-maxbuffer-kills-big-stdout**: tar -cf - with a stdout pipe (100 MB+) crashed spawnSync silently (status≠0, ENOENT-like, no message) — the default maxBuffer is 1 MB. Fix: stdio-stderr on 'pipe' + maxBuffer 512 MB, log stderr. Rule: never run spawnSync with expected large output without maxBuffer.
- **build-skript-claims-verify-end-to-end**: the copied publish script referenced insight.mcpb, but the build produces insight-<version>.mcpb — plus a TDZ crash (pkg before use). Fix: versioned resolution + hoist pkg. Rule: verify the FIRST real run of copied/reworked scripts in the same commit, not just syntax.
- **insight is now LIVE on Smithery**: https://insight--paschbaer.run.tools (release 202, record patch 200, registry entry verified).
- **bundle-filename-version-drift-between-build-and-publish**: publish looked for insight.mcpb, the build produces insight-<version>.mcpb (ENOENT) + TDZ crash on the first fix. Rule: verify the first real run of copied/reworked scripts in the same commit.
- Seeder 4/4, round-trip confirmed (exp_fa71d807, exp_2f92135e, exp_f99452a2, exp_4da4713b).

- (2026-09-22, insight) Split-store trap fixed structurally: seeding logic was a client-side script bound to a repo checkout path — unusable for MCP consumers in other repos. Lesson: server capabilities must be delivered BY the server (MCP tool), scripts only as thin transport wrappers. Prevention: any new capture/write workflow ships as an MCP tool first; a CLI wrapper is optional sugar. Also: on /mnt/d, verify load-bearing edit-tool changes with an immediate terminal grep — two replacement batches silently failed to land today and had to be reapplied via terminal.

- (2026-09-22, insight) FTS retrieval was completely ineffective, but creepingly so: (1) `episodes_fts` NEVER had a writer — only migration + reader. Fix: insert/update triggers + backfill in the adapter init. (2) `searchFullText` INNER-JOINed `signatures` and thereby threw away all episodes without a signature (lessons!); (3) FTS hits did not flow into relevance scoring — candidate finding without ranking is worthless with limit-based output. Lesson: "silent empty result" must be distinguished into "index empty", "join filters away" and "score ignores hits" — each bug layer was individually green in tests because the tests only ran through the fallback. The regression test must check the FTS arm address directly (relevance > fallback floor, top rank).

- (2026-09-23, guidance) 12 lessons from the guidance implementation (phases 1-12) seeded via experience_seed_lessons (all PARTIALLY_VERIFIED, no duplicates): python-patch-partial-replace, mntd-edit-tool-phantom-success (3rd recurrence), guidance-profile-shallow-merge, guidance-transition-reason-vs-when, closure-tdz-runtime-crash, hollow-failure-path-tests, exposure-mode-field-hygiene, unwired-policy-dead-code, path-boundary-prefix-match, dispute-review-finding-with-targeted-repro, vitest-no-tests-fails-suite, ajv2020-esm-interop-constructor, mcp-sdk-register-tool-zod-shape, read-path-mutation-lock. Search round-trip: experience_search currently returns only legacy episodes (0.25 relevance, signature/full-text arm) — new episodes are confirmed via seed status (experience_ids), semantic search is disabled in the MVP.
- Core patterns of this session: (1) never contradict reviewer findings without a targeted repro (TDZ case: suite green, but the requestId path never tested). (2) Wire security/policy controls into the production path immediately after implementing them (evaluateEgress was dead code despite green unit tests). (3) Workspace boundary checks need separator-aware prefix checking + a real sibling repro. (4) Match reason-only transitions only in the error path. (5) Atomic persistence (tmp+rename) also for lock files — corrupt locks would have blocked everything.
- (2026-09-23, guidance F4) Terminal-phase submit assertions: the transition_rejected route in the WorkflowEngine returns code `required_hook_failed` ("remaining in phase"); a second submit of a phase with `transitions: []` can NEVER deliver transition results. Assert hook effects on the submit that performs the transition. Optional failed beforeEnter ops DO appear in `operations` (exposeOpResult does not filter). Lesson seeded: guidance-terminal-phase-submit-assertion (PARTIALLY_VERIFIED).
- (2026-09-23, guidance HTTP/Docker) 6 new lessons seeded via experience_seed_lessons (all PARTIALLY_VERIFIED, 0 duplicates): (1) docker-compose-bind-mount-missing-config-crash-loop — empty host directory in the bind mount → configuration_not_found crash loop, ECONNREFUSED in the client; verify the mounted content, not just the mount. (2) dockerfile-healthcheck-curl-missing-in-image — HEALTHCHECK with curl, but curl never installed → forever 'health: starting'; diagnosis via docker inspect State.Health.Log. (3) async-json-tojson-promise-empty-payload — missing await → JSON.stringify(Promise)='{}', 142 green tests did not see it; review found it. (4) ts-duplicate-import-after-partial-edit-tool-failure + (5) python-patch-silent-noop-exact-match-required — /mnt/d patch traps: replace tools report success, tsc proves the opposite; print the count + verify with grep -c. (6) mcp-http-post-requires-accept-header — POST /mcp needs accept: application/json, text/event-stream, otherwise 406 (misleading after the auth fix).

### Avoid These Mistakes (2026-09-23, transport migration)
- **MCP server transport wiring**: StreamableHTTPServerTransport WITHOUT `await server.connect(transport)` = sessions get created, responses never arrive (hanging clients). With manual session management ALWAYS connect before handleRequest; verify only with the official SDK client against the built artifact (not against tsx source and not via curl — SSE streams make curl hang without session headers and suggest malfunction).
- **Express app error path with open responses**: shutdown/`uncaughtException` handlers that use `server.close(cb)` with a callback hang forever when the server never successfully listened (EADDRINUSE) — always add a fallback `setTimeout(...).unref()`.
- **WSL test hygiene**: background node processes on /mnt/d leave ghost listen sockets; EADDRINUSE chains and "empty" logs obscure the actual error. Before server tests check ports specifically (ss -tln) and kill processes by PID from the socket, not with a broad pgrep (it also hits VS Code server processes).


### Avoid These Mistakes (2026-09-23, setup_clearthought endless-retry-loop)
- **Tool response field order for LLM clients**: with responses >15 KB, trailing
  fields (`status`, `nextSteps`) are often NO LONGER present in the model context
  in the truncated/offloaded tool result view — the model considers a successful
  call failed and retries endlessly (observed: 47 calls with rotating
  `project_name`s). Rule: with large responses ALWAYS serialize `status`
  (and for one-shot tools an explicit `one_shot: true` + "do NOT call again")
  as the FIRST fields, plus the same warning in the tool description.
  Generic: never hide the success signal behind megabytes.

### Experience Memory Capture (2026-09-23)
- Session lessons were seeded into the EMMS store (`thinking-mcp-lessons`)
  via `experience_seed_lessons`, both `PARTIALLY_VERIFIED`,
  round-trip verified via `experience_search`:
  - `large-tool-response-status-truncation` (exp_f3795b94-c9a) — see
    "setup_clearthought endless-retry-loop" above; fix in 38875a9/a8fb97d.
  - `mnt-d-readfile-linewrap-edit-mismatch` (exp_8c20e8af-668) — read_file
    delivers hard-wrapped lines on /mnt/d; edit tools need byte-exactness.
    Fix: terminal python patch with occurrence assertion + immediate grep
    verification; terminal reads are disk authority.
- Note: EMMS search in the MVP is full-text/signature only (semantic search
  inactive) — search with slug fragments (e.g. "status-truncation"), not
  with a free description.

### Avoid These Mistakes (2026-09-23, continued loop defense)
- **Short success responses do NOT reliably stop loops**: models ignore even
  visible status:'loop_detected' results (20+ retries observed) — only
  protocol errors (isError:true) work reliably. Plan an escalation level,
  not just status fields.
- **Templates must not contain the markers themselves**: buildGuideBlock wraps
  the body — an end marker stored in the template doubles it and merge mode
  silently falls into the append fallback (block_replaced:false + warning).
  Rule: markers only through code; test still missing (tracked).
- **create_file on /mnt/d**: this time verified immediately via grep — okay.
  But heredoc appends to test files can duplicate files on aborted terminals:
  always grep -c helper symbols before committing.

### Avoid These Mistakes (2026-09-24, codebase review)
- **Session registry pattern**: create-on-unknown-POST + registry entry only in
  `onsessioninitialized` produces reaper-blind orphans (present identically in
  insight AND clear-thought). Prevention: early-reject non-initialize requests
  without a session header (body.method check) or register the session
  immediately with a pending state. During reviews grep for
  `onsessioninitialized` + `sessions.set`.
- **Branch discipline: CREATE THE BRANCH BEFORE THE FIRST COMMIT** (2x in this
  session committed directly on develop — each repaired via reset --mixed,
  but avoidable). Rule: after `git checkout -b feature/...` commit FIRST as
  the very first step, then continue working; never run `git commit` without
  having checked the branch name in the prompt prefix.
- **Grep-verify commit/memory-bank claims**: "dbg logs removed" (c22585a) was
  incomplete — 1 [dbg] remained in src L132. Never trust claims about
  completed cleanups, always count yourself.
- **Deprecation needs npm deprecate**: a README note alone does not prevent
  installation (package.json has no deprecated field). Additional trap:
  `app.listen(PORT)` without a host argument binds 0.0.0.0 — always set the
  loopback default explicitly.

### Experience Memory Capture (2026-09-24, review batches)
6 validated lessons seeded via `experience_seed_lessons` into the running
insight server (HTTP :3002, scope `thinking-mcp-lessons`) and round-trip
verified via `experience_search` (6/6, tier PARTIALLY_VERIFIED):
session-registry-orphan-pattern, verify-cleanup-claims-by-grep,
yarn-lockfile-format-mismatch, env-port-string-2arg-listen,
validation-throw-swallowed-by-catch, fts5-bare-operators-survive-sanitization.
Contents identical to the entries above (batch lessons).

### Avoid These Mistakes (2026-09-24, batch B/C+D)
- **Do not put validation throws into general catch blocks**: the new
  malformed-hash error in `evidence/store.ts pathFor()` was initially
  swallowed by the read-miss catch in `read()` ("Artifact content not found")
  — the test with an exact message assertion exposed it immediately. Rule:
  resolve path/input validation BEFORE try blocks; test for the concrete
  error message, not just "throws something".
- **Lockfile format conflict sleeps in the repo**: v1 format + yarn@4 pin did
  not surface because test.yml does not run on develop pushes. With CI
  problems first check the trigger matrix before citing "CI green" as proof.
- **listen(port) string trap (2nd occurrence!)**: `process.env.PORT` is a
  string — the 1-arg overload of `app.listen` swallows that, but when adding
  the host argument afterwards (2-arg overload) TS2769 strikes. insight had
  the identical bug (+ fix comment there). Rule: `Number(process.env.PORT)`
  from the start; ALWAYS run `tsc`/`yarn build` for every touched server —
  vitest (esbuild) does NOT typecheck and is not a build replacement.
- **MCP SDK client transport is named differently than the server counterpart**:
  server: `StreamableHTTPServerTransport` (server/streamableHttp.js) — client:
  `StreamableHTTPClientTransport` (client/streamableHttp.js), NOT
  `StreamableClientTransport`. The name only broke at runtime
  ("is not a constructor") because vitest/esbuild does not typecheck. Rule:
  verify class names of new SDK imports by looking into the SDK .d.ts.
- **Node toolchain in WSL is only on PATH in interactive shells**: `wsl.exe
  bash -c` does not load nvm (nvm sits in .bashrc). Direct path:
  `export PATH=$HOME/.nvm/versions/node/v24.16.0/bin:$PATH` with `\$` escaping —
  otherwise the Windows-side sh interpolates `$VAR` BEFORE wsl.exe. Workspaces
  hoist vitest/tsc into the repo root (call `node_modules/.bin/vitest` there).
- **ECONNREFUSED proves no timeout wiring**: a test against a
  connection-refusing port (e.g. 127.0.0.1:9) fails immediately with
  ECONNREFUSED — never via the timeout path. To wire handshake/request
  timeouts you need a HANGING transport (in the test via the
  useTransport seam: start() never resolves). Only then does elapsed<5s at
  default 10s show that the per-call timeout really bites.

## Avoid These Mistakes
- **requestId reuse on guidance submit tools:** submit_plan_review/submit_plan/submit_understanding with an already registered requestId silently return `accepted: true` (idempotent replay of the cached result, WorkflowEngine.submitLocked L1617) WITHOUT triggering the phase advance → the agent stumbles into a retry loop (3× accepted, phase never changes). Preventive: (1) ALWAYS use a fresh requestId per phase submission (`req-<phase>-<purpose>-<n>`); (2) `accepted:true` + unchanged currentPhase is a signal, NOT a retry trigger — first check get_workflow_state (requestIds: previousPhase ≠ currentPhase = the request already took effect) and get_current_guidance (requiredActions/operations); (3) server-side: mark replay results with `replayed:true` (see the remaining-work-plan hardening plan).
- **sed -i on CRLF files (Windows checkout):** `sed -i` rewrote the whole file (132/132 lines in the diff) instead of only the matched line — line endings were normalized. Preventive: edit CRLF files with `perl -pi -e` (preserves \r) or the `edit_file` tool; afterwards always check `git diff --stat` for line-count plausibility.

## 2026-09-27: specs/011 — latent adopt bugs only became visible through a real e2e
- generateFiles unit tests only checked the generated strings, never loadConfig/workflow boot. Two bugs from 009 therefore survived undetected: (1) mainConfigSchema had additionalProperties:false and no "adoption" property → every adopt config failed at config load; (2) insight detection hung on the op name "capture-session-lessons", while the template today is called "store-completion-insight". Preventive: always secure generator changes with an e2e (generate → write to disk → composeApplication → startWorkflow); introduce name-based detections (op IDs) as a shared constant instead of duplicating string literals.

## 2026-09-28: Guidance phase advance depends on a fresh requestId (Niyama session-46a43aeb)
- **Issue:** the Niyama agent was stuck in `review_and_adjust_plan` for 3 submissions although every `submit_plan_review` response was `accepted: true`. **Root cause:** the same requestId (`req-plan-v2-impl-c0c1`) reused — `WorkflowEngine.submitLocked` silently replays the cached result (which had already triggered the plan→review transition); a phase advance only happens with a NEW requestId. **Fix:** resubmission with a fresh requestId (`req-plan-review-adjusted-c0c1`) → phase immediately `implement`. **Preventive:** see the Avoid-These-Mistakes entry above; rule also added to the config assistant templates (examples/default-guidance/responses-wisdom.json) and server hardening (duplicate marker).

## 2026-09-28: Stateless HTTP servers cannot keep connection state in RAM
- **Issue:** `get_downstream_status` permanently reported "disconnected" although all downstream servers were alive and calls ran successfully. **Root cause:** the guidance HTTP endpoint builds a fresh WorkflowEngine+ClientManager per request (server.ts: "Stateless streamable HTTP: fresh server+transport per request") — in-memory connection state is discarded after every request, the tool falls back to the default "disconnected". **Preventive:** (1) observability tools must never read from per-request construct state — determine status either from persisted metrics or via an on-demand probe. (2) When diagnosing "status tool says X, but calls work": first clarify whether the tool gets a fresh context per request before pursuing transport/network causes. (3) A "forced first use" via a stale session ID proves nothing — `session_not_found` fails silently before ensureReady ever runs; always check the run-operation response and cross-check get_metrics.

## 2026-09-28: Git worktrees + Windows/WSL split
- **Issue:** in a Windows-checked-out worktree (.git = file with 'gitdir: D:/...') WSL git and gate scripts fail: WSL git cannot follow the Windows path; check-final-review/check-index-freshness resolve the pointer wrongly; tests that read .git/HEAD directly break with ENOTDIR. **Fix (GDS-5):** pointer resolution with a candidate list (POSIX-relative, /mnt/<drive>, /workspace/<rest>, /workspaces/<name>), check commondir for packed refs AND loose refs; the same logic in the test helper. **Preventive:** new code must never read .git/HEAD directly — always via the pointer resolution; the worktree rule is now instructions.global.
- **Issue:** npm install in the guidance container (NODE_ENV=production) skips devDependencies → build gate exit 127 (tsc not found). **Preventive:** container-side `npm install --include=dev`; worktree workflows must plan the dep installation as the first step.

## 2026-09-29 — Guidance test suite: load flakiness (WSL /mnt/d)
- **Issue:** server-guidance full runs showed 2-4 errors under load (partly with
  varying file/test counts), clean repeat runs 437/437 green.
- **Root cause:** IO/CPU load on /mnt/d (9p) drastically lengthens collect
  phases (66-167s) and tips timing-sensitive tests — not content-related.
- **Preventive measure:** with suite errors always run a clean full run as a
  second reading before the error analysis; only count errors if they
  reproduce in an unloaded run (baseline-aware, consistently extended to
  full runs). Run full runs preferably with reduced parallelism or on an
  ext4 worktree.

### RID reuse stall on phase submissions (confirmed 2026-09-29, WC-1 session)
- **Issue:** `submit_verification` ran into a context server timeout; the
  retry with the SAME requestId would have triggered the known
  requestId-reuse stall (lesson 2026-09-28, session-46a43aeb).
- **Why it failed:** phase submissions are requestId-keyed — the same ID after
  a timeout acts like a duplicate/replay; different payloads ⇒ payloadMismatch.
- **Preventive measure:** after a timeout of a phase submission ALWAYS retry
  with a new requestId (submissions are idempotent per phase with a fresh ID);
  on `invalid_active_phase: expected X, got Y` the first submission still
  arrived — check the status instead of submitting again.
- **Observed:** exactly this pattern occurred (retry fresh-ID →
  `invalid_active_phase: expected complete, got verify`) — the first
  submission had already changed the phase. No data loss.

### Verify gate failures in the container are environmental — check the state instead of retrying (confirmed 2026-09-30, CT-1 session)
- **Issue:** submit_verification ran into client timeouts 2×; afterwards the
  state showed: submission ACCEPTED, phase advanced — but the gates lint/test
  failed server-side (exit 1). Almost misinterpreted as a diff regression.
- **Why it failed:** (a) the guidance container runs the gates at the repo
  root without Linux-native node_modules → prettier/root-workspaces tests
  fail environmentally (both required:false, phase advanced anyway); (b)
  gate execution (full suite run, ~80 s+) breaks the client MCP timeout —
  the client times out, the server keeps working.
- **Preventive measure:** before submit_verification: run prettier --check on
  servers/*/src locally (WSL) — the gate checks exactly that. After a
  client timeout: check get_workflow_state (never blindly retry, RID
  lesson). Match gate failures against the local WSL reference run: local
  run green + container fail ⇒ environmental (GATE-1/DB-1 context), not a
  diff regression. The authoritative test route remains WSL
  (npm test in servers/server-guidance); treat container gates as binding
  only after deps-install (DB-1 rest).

### 2026-09-30 — Guidance container start crash: wrong /workspaces mount on a stale container (EACCES)
- **Issue:** the guidance container crashed at start with `Error: EACCES:
  permission denied, mkdir '/workspaces/.guidance'` (scaffold.js →
  ensureConfiguration). `D:\repos\.guidance` did not exist on the host;
  an isolated test with the correct mount (`docker run --user node -v
  D:/repos:/workspaces ...`) showed: the mount is `drwxrwxrwx`, mkdir as
  `node` works.
- **Root cause:** the running container was NOT created from the current
  compose files: `docker inspect` showed `bind /mnt ->
  /workspaces` (the Docker VM's root-owned `/mnt`, `drwxr-xr-x`) plus a
  relic volume `/workspace` — presumably from an earlier/WSL-side creation
  with a wrongly resolved path. `USER node` may not create there → EACCES.
  `docker compose config` in the compose directory resolved correctly
  (`D:\repos -> /workspaces`).
- **Fix:** `docker compose up -d --force-recreate` from
  `servers/server-guidance` → the scaffold creates `D:\repos\.guidance`
  cleanly, `/health` returns `configured:true, reachable:true`. The old
  container was removed with `docker rm -v`.
- **Preventive measure:** container start via `docker compose up -d` from
  `servers/server-guidance` OR from the repo root (the root compose starts
  all three servers) — keep the mount resolution of both files in sync
  (root: `../`, server: `../../../`); on startup EACCES first compare
  `docker inspect <name>` (mounts/user) against `docker compose config`
  before pursuing permission/code causes. Rule documented in AGENTS.md
  (guidance section).

### 2026-09-30 — Falsy checks are not enough for config objects; gate failures in the container are environmental (chain runs CT/WW/WC)
- **Issue 1:** the first WC-1-CT-1 guard only checked falsiness of
  `config.workflow` — a truthy-empty object (workflow: {} without file)
  would have slipped through and kept the TypeError crash.
  **Preventive:** for config objects check the required STRUCTURE
  (e.g. workflow.id/initialPhase), not falsiness; always include
  present-but-empty as a test case.
- **Issue 2:** the full suite failed 2× with timeout flakes (metrics/engine,
  30-s limit) although the diff was unrelated.
  **Preventive:** focused re-runs of the affected files before every
  regression assessment (baseline-aware, AGENTS.md); label flakes as
  environmental, don't fix them.
- **Issue 3 (process):** mass parallel reads of a large file lead to aborts
  and token waste. **Preventive:** targeted edits from already known code
  locations; one read excerpt suffices — do not touch the same file again
  in dozens of window reads.

## 2026-10-01 — Guidance completion: drive it green on the first try, a retry does not finalize (GDS-6)
- **Issue:** after a hook failure at complete_workflow (e.g. index-freshness mtime race) and a successful retry_operation, the session stays stuck in status=active/phase=completed — no terminal transition, no audit, no chain successor; a repeated complete_workflow → invalid_active_phase.
- **Root cause:** finalization (terminal transition + successor creation) only runs in the first complete_workflow path; the retry path only executes the operations.
- **Preventive measure:** before complete_workflow pre-check ALL gates locally (check-final-review.mjs, check-index-freshness.mjs, docs-drift) and run `gitnexus analyze --no-stats --force` as the LAST step before the completion call (plain analyze short-circuits "already up to date" without an mtime refresh). With a frozen session: cancel + fresh session instead of a retry loop.

## 2026-10-01 — Dual GITNEXUS_HOME (WSL index vs. gitnexus-server container)
- **Issue:** the guidance repository-analysis gate queries the container gitnexus (:4747); its registry does not know the WSL-indexed repo ("No indexed repositories") or reports "foreign" with a shared .gitnexus (different repoPath: /mnt/d/... vs /workspace).
- **Fix (workable):** container with repo mount /workspace + `GITNEXUS_STORAGE_PATH=/data/gitnexus/index-thinking-mcp gitnexus analyze /workspace --no-stats` (its own duplicate index in the volume); additionally `git config --global --add safe.directory /workspace` in the container and MSYS_NO_PATHCONV=1 on docker exec from Git Bash (otherwise path mangling C:/Program Files/Git/...).
- **Open:** permanent anchoring as compose env (GDS-7) — only change outside guidance sessions.

## 2026-10-01 — Handwritten JSON-RPC payloads via file+curl: missing/superfluous closing brackets
- **Issue:** large guidance submissions (submit_understanding/submit_plan) as handwritten JSON via write_file + curl: twice syntax/bad-request errors from wrong bracket balance at the end of the file (depth ±1) — parse errors on the server side were not diagnosable (only HTTP 400).
- **Fix:** before every POST check bracket depth (string-aware scanner) + JSON.parse in WSL; from the second occurrence onwards construct the payload with a Node builder script (JS object literal → JSON.stringify) — deterministically correct.
- **Preventive measure:** NEVER hand-escape guidance HTTP submissions: always use a builder script or at least a depth scan before the POST; on an HTML "Bad Request" first check the JSON validity of the body, don't suspect the server logic.

## 2026-10-01 — Composite firstAvailable stops at the first success (deps-reinstall design trap)
- **Issue:** deps-reinstall modeled as a 2-step composite (rm node_modules → npm install): firstAvailable returns after the SUCCESSFUL rm step — npm install never runs; the via label wrongly showed the clean step.
- **Fix:** deps-reinstall as a single process step (node -e: rmSync + spawnSync npm install, propagate exit).
- **Preventive measure:** know the composite strategies: sequential/firstAvailable are OR links (alternatives), not sequential pipelines — every step chain with "first X, then Y" semantics belongs in ONE process step (sh -c / node -e) or in a workflow.

## 2026-10-01 — Zero-dependency npm installs create no node_modules
- **Issue:** contract tests for deps ops with a dependency-free package.json: npm install/ci succeeds, but existsSync(node_modules)=false — the assertion "tree installed" fails despite success.
- **Fix:** local file: dependency (deps/tiny) into the fixture — npm then materializes node_modules/tiny; generate the lockfile for the npm-ci test via a real npm install (handwritten lockfiles are fragile).
- **Preventive measure:** always run npm behavior tests with at least one (local) dependency; generate lockfiles, don't type them.

## 2026-10-01 — gitnexus -32001 "Session not found": ClientManager does not re-initialize, guidance sessions are workflow-run-scoped
- **Issue:** the repository-analysis gate failed with "Session not found. Re-initialize." (-32001) on every attempt: the guidance ClientManager holds the MCP session ID to the gitnexus server (:4747) in-process and does NOT re-initialize on -32001 (reconnect only works at the transport level). Restarting the gitnexus server alone does not help (the ID stays invalid). A guidance container restart (same image) resolves it — but kills all running sessions: "sessions are workflow-run-scoped and do not survive a server restart" (the disk state under .guidance/state/sessions is NOT restored as a running session at boot).
- **Fix (workable):** restart the gitnexus server + guidance container (same image, no deploy), then a fresh session with a replay of all submissions.
- **Preventive measure:** on -32001 from a downstream MCP: do NOT retry (it does not resolve itself), instead restart the guidance container and start a fresh session — preserve the submissions beforehand as a replay script. Guidance phase submissions are text — replay is cheap if the payloads exist as a builder script.

## 2026-10-01 — index-freshness gate: scratch files in the repo count as sources
- **Issue:** the index-freshness gate compares the mtimes of ALL files (including untracked ones) against the gitnexus index. Diagnostic/payload files in the repo (tmp/, .us2-*.txt) made the index stale again on EVERY complete/retry attempt — a loop of analyze → new scratch → stale.
- **Fix:** keep all session artifacts (replay scripts, diagnostic outputs) exclusively under /tmp (outside the repo); check the repo for a clean tree before complete; analyze --no-stats --force as the LAST step before complete (plain analyze short-circuits without an mtime refresh).
- **Preventive measure:** like the GDS-6 lesson, extended by: NEVER touch files in the repo while a session is in complete — don't even write log/status outputs there.

## 2026-10-01 — DEPLOY-015 executed: container gates healed and tightened
- **Issue/Fix:** after the deploy, deps-install/deps-reinstall were adopted into the instance .guidance/operations.json (commit 0837069), `test` pulled to required:true. During the heal (npm ci in the container) two traps: (1) better-sqlite3 needs node-gyp → python3/make/g++ had to go into the container via apt (as root); (2) npm ≥11.19 blocks install scripts by default → `npm install-scripts approve` + `allowScripts` in package.json (versioned, commit 0837069). npm thereby wrecked the yarn.lock (the project uses yarn 4) → restored.
- **Result:** lint + test gates green in the container (test: root suite 43/43; the full server-guidance run remains WSL-authoritative: 496 passed).
- **Open (DEPLOY-015b):** the build tools live only in the running container — bake them into the image or ensure prebuilds, otherwise the next rebuild reinstall fails.
- **Preventive measure:** ALWAYS start npm ci in fresh containers with an allowlist check; after npm installation actions check `git status` for package.json/yarn.lock collateral (npm starts writing yarn.lock when no lockfile-respect kicks in).

### 2026-10-01 — DEPLOY-015b done (feature/015-deploy-015b-image-tools)
- **What works:** make + g++ in the Dockerfile apt layer (node-gyp toolchain completely in the image); the duplicated unconditional dotnet block was removed (INSTALL_CSHARP=false works again, the README statement is correct). Verified via `docker compose build guidance` + throwaway probe: make/g++/python3 ✅, dotnet absent ✅.
- **Lesson:** when merging Dockerfile sections, opt-in blocks duplicate easily — the second block ran without an if guard and made the build ARG ineffective; always verify image properties via a throwaway `docker run --rm` probe instead of trusting the Dockerfile.
- **Open:** roll-out (`docker compose up -d --force-recreate`) after session completion; afterwards a fresh container heals native deps without manual apt rework. Newly discovered during this: the container test suite crashes during worker teardown (DEPLOY-015c) — test gate back to required:false, WSL remains authoritative; separate debug follow-up.

### 2026-10-02 — Frozen config handles at boot wiring (session-fae2aa34)
- **Issue:** registry_register persisted correctly and the engine recomposed — but start_workflow still rejected with workspace_not_registered; only a container restart "fixed" it.
- **Root cause:** during boot wiring ONE WorkspaceRegistry object was copied into a tool closure (capture-at-boot), while the engine reassigns the same field on every register (new object). Two mount points on "the registry", one of them stale — an alias-for-immunity error.
- **Preventive measure:** never pass engine.config.<X> as a value into long-lived closures/modules — always pass a provider () => engine.config.<X> (or live getters at the composition root). When reloading configuration: grepping for all aliases of the old object is part of the root-cause check ("who captured this?").

## 2026-10-03: Guidance chained-workflow lessons (session-b1c62520/b22053ef)

- **Chain head scope trap (WF-6):** with `start_workflow` with `chain.steps`, the head session runs under the top-level request with its OWN scope; successors ALWAYS start at `steps[0]`. WIZ-4 was implemented under the head session → the successor carried the same step again (duplicate cycles loom). **Next time:** frame the head request as its own scope and omit `steps[0]` (head = step 1), or implement NOTHING from the steps under the head session.
- **State transitions are asynchronous-long (WF-2):** verify/complete hooks (lint+build, final-review, index-freshness) run for minutes — the MCP client timeout fires, but the transition is still completed server-side. **Next time:** submit, then poll `get_workflow_state` (with sleep), do NOT retry the original call (the single-flight lock makes retries time out too).
- **Gate order is deterministic (WF-5):** the last vitest run makes the GitNexus index stale (`.vite/vitest/results.json` counts as a source). **Next time:** reindex (`gitnexus analyze --no-stats`, exact path) ALWAYS as the last action before `complete_workflow`, after the last test run.
- **final-review evidence per session (WF-4):** `.guidance/state/final-review.json` must be written anew for every session (headCommit == HEAD, schema in `servers/server-guidance/scripts/check-final-review.mjs`); have delta commits after the review re-blessed by the same reviewer.
- **Root build is gate-relevant (WF-3):** `npm run build --workspaces` fails on fresh checkouts (`tsc: not found` — no bins in workspace node_modules). **Next time:** `npm install` at the root before gate runs; note: npm install collides with a coexisting `yarn.lock` (collateral change → revert; clarify ownership, WF-3b).
- **Clear-Thought routing (WF-1, as of 2026-10-05):** the primary route is again the built-in editor MCP client (`clear_thought_*`); fallback chain with exactly ONE attempt per route: container route (`call_downstream` serverId clearthought or reasoning-pass/ct-*) → one direct HTTP JSON-RPC call. Never retry the same route. After server restarts/TTL eviction a reconnect of the Clear-Thought context server in Zed may be necessary; the server-side 404 gate (stale-session fix) has since made sessions self-healing.

- **Guidance phase order (WIZ-1/WIZ-3, 2026-10-03):** implementing BEFORE the phase submissions forces retrospective re-capture (invalid_active_phase). Next time: submit_understanding → submit_plan → submit_plan_review ALWAYS before the first code edit; the engine tolerates no order shortcuts.
- **40-hex requirement in final-review.json:** short hashes in the commits array make the gate fail (evidence.commits must be 40-hex). Next time: use exclusively `git rev-parse` full hashes.

### 2026-10-03 — fault_tree top-gate selection bug (silent HIGH)
- **Issue:** fault_tree ignored its top_event parameter and evaluated the last gates-array element as the top gate — silently, even when it was a basic event (under-reported probability by ~11x in the report tree).
- **Root cause:** L116 hardcoded `topId = defs[defs.length - 1].id`; top_event was only echoed into the response, never used. Existing tests passed because their TOP gate happened to be last.
- **Preventive measure:** never derive semantics from array position when an explicit selector parameter exists; resolve selectors first (id, then unique name), use position only as a documented last-resort fallback. Parameter-echo without use is a smell — grep handlers for parameters that are echoed but never read.
- **Meta-lesson:** assumption_xray marker detection is English-only (the no_marker note now says so); its confidence 0 on a valid claim means "no English markers found", not "no assumptions exist".

## Avoid These Mistakes (2026-10-03 — yarn.lock drift via server-level npx/npm)
- **Issue:** Running `npm ci` / `npx vitest` inside `servers/server-guidance` (workspace member) rewrote the ROOT `yarn.lock` from Yarn-4 Berry format to a Yarn-v1 lockfile (458→41 keys, root workspace entry removed) — caught by independent review as CRITICAL (AGENTS.md WF-3).
- **Root cause:** npm does not read `yarn.lock`; a tool invocation that resolves dependencies above the member package walks into the yarn-managed root and drifts it.
- **Prevention:** In this repo, run member-server npm scripts only AFTER checking `git status` shows no lockfile change; after ANY npm/npx invocation, verify `git diff --stat yarn.lock` is empty before continuing. If drifted: `git checkout -- yarn.lock` and rerun the step via Corepack yarn. Consider adding a pre-commit lockfile-format check.

## Avoid These Mistakes (2026-10-03 — missing --no-pager on git in compound commands)
- **Issue:** A git read command inside a compound terminal command opened the pager and blocked/hung the tool call; the user had to interrupt it.
- **Root cause:** `--no-pager` was applied to earlier standalone git log calls but omitted when git commands were embedded in longer compound commands (analyze + status chains).
- **Prevention:** EVERY git read command (`log`, `diff`, `show`, `blame`, `status`) must carry `--no-pager` (or `--no-optional-locks` + `--no-pager` combined) in ALL contexts — standalone or embedded in compound commands. Never assume an earlier flag elsewhere covers a new invocation.

## Avoid These Mistakes (2026-10-04 — guidance container rebuild from the wrong compose context)
- **Issue:** `docker compose up -d --force-recreate` run from `servers/server-guidance` failed with `Bind for 127.0.0.1:3003 failed: port is already allocated` and left a second, dead container behind.
- **Root cause:** The running stack belongs to the ROOT docker-compose project (`thinking-mcp`, all three servers orchestrated); the member directory has its own compose file with the same published port. Recreating from the member context creates a container of a DIFFERENT project that collides with the healthy one instead of replacing it.
- **Prevention:** Always recreate the guidance container from the repo root (`docker compose up -d --build guidance`). Before recreating, check `docker ps --format "{{.Names}}\t{{.Ports}}"` to identify the owning project by container name prefix; remove stray containers from the wrong project (`docker rm -f <name>`).

## Avoid These Mistakes (2026-10-04 — spec 016 SSE/async implementation)

- **Accept header trap:** streamable HTTP requires BOTH accept types on EVERY POST (the SDK otherwise answers 406) before the handler runs. An "exclusive text/event-stream" is impossible on the protocol side — therefore signal the SSE opt-in via `_meta.progressToken`, not via the header. (Validated lesson: guidance-sse-upgrade-keys-on-progresstoken-not-accept)
- **Persisted in-flight registries:** check-then-begin without a mutex = TOCTOU double execution; crash without a boot stamp = permanent in_flight latch. Always begin() atomically and reclassify foreign boot records as interrupted on first read. (Validated lesson: persisted-in-flight-registry-needs-boot-staleness-and-atomic-begin)
- **Idempotency key design:** requestId is a normal tool argument at submit_* and therefore unsuitable as a key signal (RID reuse stall + new requestIds on real retries). The single-flight scope (session+tool) IS the idempotency scope. (Validated lesson: idempotency-key-must-not-include-client-controlled-retry-fields)
- **final-review.json schema:** severities lowercase, commits[] must contain base+head, all hashes full 40-hex via git rev-parse — read the script beforehand instead of guessing the schema. (Validated lesson: guidance-final-review-json-schema-gotchas)

## 2026-10-04 — S016-ADOPT lessons (Avoid These Mistakes)

- **Block comments: `*/` inside glob patterns kills the comment.** Writing `servers/server-*/src/...` inside a TS block comment terminates it at `*/` and esbuild parses the rest as code ("Expected \";\" but found \"—\""). Prevention: use `server-<name>/` in comments; esbuild errors point at the line AFTER the broken comment — read the actual line first.
- **MCP progress notifications only stream while the request is open.** After the tools/call response is written, extra.sendNotification frames are dropped by the transport. Consequence: SSE/progress (AC3) rides the synchronous path; async acceptance (Stufe 2) and progress streaming are complementary, not composable on one request. Design SSE tests around the terminal result arriving on the stream.
- **SDK tools with outputSchema REQUIRE structuredContent.** A tool callback returning only content when an outputSchema is registered fails with MCP -32602 ("MCP error..." as text). Custom acceptance envelopes must include structuredContent (mirroring the payload).
- **Vendored copies drift via line endings.** Files created/copied on Windows committed CRLF while canonical stayed LF → byte-identity hash guards red despite identical content. Prevention: vendor exclusively via the sync script (copies bytes), verify with sha256sum before committing.
- **per-server Docker contexts forbid workspace-package dependencies.** insight's Dockerfile npm-ci runs in the isolated server dir — `workspace:` deps cannot resolve. Shared code ships as vendored copies (sync script + hash test), not as a package dependency.
- **better-sqlite3 native cleanup crashes are environmental, not logical.** `Assertion failed: (env) != nullptr` in Statement::~Statement at worker exit (Node 24/WSL) fails test FILES whose tests all pass individually. Classify as baseline/environment (npm rebuild helps some files); never attribute to code changes without a same-commit reproduction.

## Avoid These Mistakes (2026-10-04 — guidance schema drift via pool-root legacy config)
- **Issue:** `submit_implementation` failed with `must have required property 'summary'` although the server tool schema and the repo `.guidance` schema both had no such field. The failing session ran on the implicit `default` workspace (pool root `/workspaces` = `D:\repos`), whose leftover full instance config carried its own `implement.schema.json` requiring `summary`.
- **Root cause:** The workspace context decides WHICH submission schema validates a payload. A full process config at the instance root next to an explicit registry serves no session but keeps the implicit `default` fallback alive — its schemas silently drift from every repo schema.
- **Prevention:** Keep the pool-root `.guidance` registry-only (only `guidance.json` with `workspaces[]`); always pass an explicit registered `workspace` name to `start_workflow`; the registry is boot-loaded for new sessions (use `registry_register` for runtime changes), and workspace sessions survive restarts — they rebind from disk on next access, re-validated against the current config (in-flight operations are interrupted).

## Avoid These Mistakes (2026-10-04 — registry-only means NO file references)
- **Issue:** Removing the process files at the instance root while keeping their `*.file` references in `guidance.json` produced a config that boots fine (in-memory) but fails the NEXT restart hard: `loadConfig` throws `configuration_invalid: <key>: referenced file missing` whenever a `*.file` ref is set, and `registryOnly` is only true when NO file refs exist at all.
- **Root cause:** "Registry-only" is defined by absence of file references, not by absence of the files.
- **Prevention:** When slimming an instance config to registry-only, delete the `workflow`/`responses`/`operations`/`downstreamServers`/`policies` BLOCKS from `guidance.json` in the same step, then verify with a real restart — a running container proves nothing about boot validity.

### 2026-10-04 — defaultRoot is NOT necessarily the pool root
- **Issue:** registry-only guidance instance rejected `start_workflow` for the alphabetically-first registered workspace (`workspace_process_config_missing`) although its `.guidance/` existed and was visible in the container.
- **Root cause:** `WorkspaceRegistry.default` falls back to the first registered entry, hijacking `defaultRoot`; the guard assumed defaultRoot = pool root without process config. Misleading symptom: the failing workspace was registered AND its config existed — always test a sibling workspace as a discriminator (it worked → identity/guard bug, not a mount problem).
- **Prevention:** never assume `defaultRoot` equals the boot/pool root in multi-workspace code paths; when changing guard conditions, follow both start and session-probe paths (`probeWorkspaceRoutes` skipped defaultRoot and would have broken restart routing).

### 2026-10-04 — HTTP 400 vs 404 decides MCP client recovery
- **Issue:** clients stranded with "MCP session no longer valid" after server-side session eviction (TTL 1h, MAX_SESSIONS).
- **Root cause:** custom early-reject returned 400 for unknown session ids; the MCP SDK client treats 400 as fatal but re-initializes on 404. Any custom /mcp gate MUST use 404 for expired/unknown sessions, reserving 400 for missing session id or malformed bodies.
- **Prevention:** same pattern exists in server-insight (same CB-3-style code) — check it when touching session handling there.

### 2026-10-04 — StreamableHTTPError hides the HTTP status in its message
- **Issue:** session-expiry detection failed silently — the SDK error message is only "Streamable HTTP error: <response body>"; the status code lives on the error's `code` property.
- **Prevention:** when classifying HTTP transport failures from the MCP SDK client, always read `err.code`, never parse the message alone. Also: guidance's reconnect only runs when `connection.reconnect.enabled` is configured — session-expiry is now exempt (minAttempts=1).

- **UNREQUESTED FIXES are a rule violation (2026-10-05):** after findings/analyses only observation + options; request every fix (config, registry, files outside the assignment) concretely BEFOREHAND and wait for confirmation. Second incident (registry-register + Niyama operations.json without an assignment). Ambiguity resolves to NOT acting.

## 2026-10-05 — specs/017 implementation lessons
- **$include inherits transitions too:** inheriting a base phase via `$include` also inherits its transitions — a variant that inserts phases between inherited ones MUST override `transitions` explicitly (plan initially jumped straight to `review_and_adjust_plan`, bypassing the new checklist/tasks phases). Preventive: after authoring a variant, walk the transition graph end-to-end.
- **Schema coupling on inherited phases:** inherited phases keep the base `submissionSchema`; variant-specific payload extensions (e.g. `batch`, review `outcome`) require the variant phase to override `submissionSchema` — otherwise `additionalProperties: false` rejects the extension at submission time.
- **One-level `$include` resolution:** include targets are read as raw JSON (no recursive workflow-file loading), so A→B→A cycles surface as an unresolved `$include` key in the merged phase — fail closed on a leftover `$include` after merge rather than recursing.
- **Skip chain vs. test fixtures:** `artifacts_present` skips run transitively at session start; test fixtures that pre-seed artifacts must account for the resulting start phase (walk the queue from the session's actual `currentPhase`, not from `understand`).

## 2026-10-05 — 017 review lessons (independent diff review, split A/B)
- **git pager hangs sub-agents:** any `git show`/`log`/`diff` in a sub-agent prompt MUST carry `--no-pager` — without it the pager blocks on stdin and the review appears to "run forever" (two canceled review runs before the fix).
- **Bounded review scopes work:** splitting the review (A: new registry/config files, B: engine diff) with a single permitted command, an explicit "≤10 findings" cap and forbidding repo exploration turned a 45h+ hang into two fast, high-quality reviews.
- **Persist loop-state at the mutation site:** counters/approvals mutated in an in-lock session object but persisted only on the success path get lost on reject paths (beforeEnter/ops failure) while the audit already shows the outcome — persist (or explicitly not-persist-and-document) at every mutation site (Review B F1, fixed).

## 2026-10-08 — Form-B chain lessons (feature/form-b-chain-fix)
- **Session-keyed state bridges die with the sessionId:** the FR-117 spec-kit bridge loads `spec-kit-states/<sessionId>.json`; chain successors get a NEW sessionId, so without explicit state inheritance the bridge returns [] and Form B ends silently after ONE task. Preventive: any per-session state consumed by a cross-session mechanism must be inherited (or keyed by chain, not session) — and the same applies to child engines: `engineForWorkspace` dropped ALL spec-kit bridges for pool deployments, so Form B was structurally dead in Docker before this fix.
- **Parsed ≠ applied:** the tasks.md parser captured `checkboxChecked` all along — the import simply hardcoded `status:"pending"`. When diagnosing "X is not parsed", verify the CONSUMER of the parsed field, not just the parser.
- **Spec semantics can invert:** the behavior we fixed had its own test + fixture ("checkbox [x] alone never completes a task", SC-011, fixture `checkbox-tampered`). Before "fixing" a defect, grep the test suite for tests that pin the CURRENT behavior — the fix is then a documented deviation, and the test must be rewritten together with a spec note (CHFIX-1), not just deleted.
- **Form A ends SILENTLY when steps.length == maxChainDepth (LOW-4):** a depth-gate test with exactly N steps and depth N never produces `chain_depth_exceeded` — the exhaustion check runs BEFORE the depth gate. Depth-gate tests need steps.length > depth.
- **Clean Form-B traversal needs maxChainDepth >= unchecked+1:** the last successor is created at chainIndex = unchecked and must still pass the backstop on ITS completion to reach the silent end; depth == unchecked fails on the final session. The pre-check warning therefore compares against unchecked+1.

## 2026-10-08 — CHFIX-2/3/5 session lessons
- **stderr is the agent-facing channel for process-op gates:** the OperationEngine puts process stderr VERBATIM (post-redaction) into exposedOpResult.errors[0].message — healing hints for gate failures belong IN the gate script's stderr (house pattern per nodeDepsHints), not in config descriptions the agent never sees.
- **Copy-pasteable remedies must match the invoking workspace:** a hardcoded host-side command in a shared gate script misdirects every OTHER registered workspace in pool deployments (final-review F-1 / CHFIX-6) — derive paths from argv/workspace when the gate is reused.
- **Per-test timeouts over global raises:** a known-slow test (25s isolated) under full-suite load on slow filesystems needs an explicit it(..., 60_000); a global testTimeout raise would blind hang-detection for ~680 other tests.
- **Doc pointers must be checked against engine reality:** get_workflow_state is fail-closed for 'activating' sessions (throws chain_activation_incomplete instead of showing status) — recovery docs must branch on session status BEFORE recommending state reads (F-3 / CHFIX-8).
