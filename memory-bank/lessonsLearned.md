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
- **2026-09-15 — Reasoning-Modelle können in Reasoning-Loops enden:** z.ai
  glm-5.3-flash lieferte auf einem rechenlastigen Fault-Tree-Prompt >6 min
  durchgehend reasoning_content-Deltas (2,8 MB!) ohne je zu rendern — 3× HTTP-
  Timeout über drei Versuche, obwohl ein Ping in 3,2 s antwortete und der Stream
  gesund war (SSE, first byte 4,2 s). Der Reihe nach falsch diagnostiziert als
  „Timeout zu kurz" und „Gateway-Buffering". Richtig: rohen Stream anzapfen und
  Byte-Ankunft messen; dann fixte `thinking:{type:'disabled'}` denselben Prompt
  in 24 s. Regel: An Eval-/Agent-Endpoints das Think-Budget pro Rolle steuerbar
  machen (Actor schnell, Judge gründlich) — nicht erst im Störfall suchen.




- 2026-09-15 (Avoid These Mistakes — nachgetragen via Terminal-Append, stale
  Tool-Layer): **Edit tools can serve a stale layer for files changed by
  external tooling** — read_file/grep_search/replace_string zeigten den alten
  Inhalt (z. B. prä-1.0.0-Rename), während Terminal cat/grep den echten
  Disk-Stand zeigte; Probe-Edits landeten in der Phantom-Schicht (nie auf
  Disk). → Für extern veränderte Dateien zuerst per Terminal verifizieren;
  wenn replace_string an disk-verifizierten Ankern scheitert: Probe gegen
  einen nur-im-Altinhalt-existing String, dann (mit User-Konsens)
  closeAllEditors bzw. Terminal-Append/Patch; create_file überschreibt keine
  existierenden Dateien. Gefunden bei der Merge-Implementierung.

## 2026-09-18: EMMS-Implementierung
- **better-sqlite3 native build**: `--ignore-scripts`-Installation laesst die native Bindung fehlen ("Could not locate the bindings file"). Fix: `npm rebuild better-sqlite3`. Bei Workspace-Root-Installs: Bindung liegt am Root, nicht im Server-Ordner.
- **better-sqlite3 named params**: alle benannten Parameter muessen uebergeben werden (auch `null` fuer optionale Spalten) — `...spread` mit `undefined`-Feldern wirft "Missing named parameter". Immer explizit mappen.
- **FR-008-Assessment-Reihenfolge**: finalize muss plan/runs/attempts FRISCH aus dem Adapter lesen (read-after-write), nicht den beim mutate geladenen Ctx-Snapshot — sonst fehlt der gerade aufgeschriebene Run.
- **Assessment read-only**: ein abgelehntes finalize (MISSING_REQUIRED_EVIDENCE) darf den Episode-State NICHT mutieren (kein PARTIALLY_VERIFIED-Zwangsuebergang), sonst kann der Agent nach Nachlegen der Evidenz nie mehr 'verified' erreichen.
- **vitest + ESM-Imports in Tests**: `.js`-Endungen in Test-Imports resolveen unter vitest/node16-Mix nicht zuverlaessig — in Tests `.ts`-Endungen verwenden (Tests sind von tsconfig.build excluded).
- **FTS5 MATCH-Injection**: Nutzertext mit Satzzeichen bricht MATCH-Syntax (`syntax error near ","`) — Query-Tokens vor MATCH auf `[\w\s]` sanitizen.
- **SC-009-Demotion-Test**: Ranking-Demotion braucht >=2 Kandidaten mit GLEICHER Signatur-Hash (sonst kein echter Ranking-Vergleich) und der Peer muss voll kompatibel sein (sonst dominiert Applicability-first ohnehin).

## 2026-09-17 — better-sqlite3 boolean bind (recurred, second root cause)
- **Issue**: `experience_record_reuse_feedback` threw "SQLite3 can only bind numbers, strings, bigints, buffers, and null" even after the earlier `?? null` fix.
- **Root cause**: `?? null` only converts `undefined`, NOT `false`/`true`. better-sqlite3 rejects booleans outright — optional boolean fields need explicit 0/1 encoding for INTEGER columns.
- **Preventive measure**: For every optional boolean column bind, write `val == null ? null : (val ? 1 : 0)`, never `val ?? null`. Grep for `?? null` on boolean-typed fields after schema changes.
- **Test note**: add regression tests for BOTH call shapes (optional fields omitted AND supplied) — the minimal-shape test alone passed while the full call crashed.

## 2026-09-18 — Session capture (2 weitere validierte Lessons, gespielt in experience-memory scope `thinking-mcp-lessons`)
- **mcp-service-method-unregistered**: `lesson_publish`/`lesson_unpublish` existierten als Service-Methoden mit grünen Service-Tests, waren aber nie via `registerTool` auf der MCP-Oberfläche registriert. Prevention: jede öffentliche Service-Fähigkeit registrieren + MCP-Surface-Test mit `listTools()`-Assertion.
- **drvfs-edit-tool-silent-nowrite**: Editor-basierter Replace meldete SUCCESS, landete aber NICHT auf disk (Terminal-grep zeigte Alttext auf /mnt/d drvfs). Prevention: Source-Edits in diesem Repo per Terminal (python3 replace mit assert) + grep-Verifikation VOR build/test; Tool-Erfolgsmeldung ohne Terminal-Read als unverifiziert behandeln.
- Fixture: `tests/fixtures/lessons-session-2026-09-18.json` — Seeder 3/3, Round-Trip via `experience_search` bestätigt (jede Query liefert Treffer).

## 2026-09-19 — CI-Setup-Lessons (in experience-memory scope `thinking-mcp-lessons` gespielt)
- **yarn4-v1-lockfile-immutable**: `yarn install --immutable` scheiterte mit YN0028, weil yarn.lock noch im Yarn-v1-Format war — Berry migriert die Datei beim ersten Install, was `--immutable` verbietet. Fix: einmal plain `yarn install`, migrierten Lockfile committen, danach `--immutable` grün.
- **yarn4-blocks-native-build-scripts**: Yarn ≥4.9 blockiert Build-Scripts von Dependencies standardmäßig → better-sqlite3-Postinstall lief nie, natives Binding fehlte (CI wäre gescheitert trotz funktionierendem lokalen npm-Setup). Fix: Root-`package.json` → `dependenciesMeta: { "better-sqlite3": { "built": true } }`; Verifikation via Binding-Datei + Testsuite.
- Fixture: seeder 2/2, `experience_search` Round-Trip bestätigt (beide Queries liefern beide neuen Episodes).
