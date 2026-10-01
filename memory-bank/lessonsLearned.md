# Lessons Learned — Thinking-MCP

> Recurring bugs, traps, and best practices. Check BEFORE starting a new task;
> update when resolving a recurring bug or making a strategic decision
> (AGENTS.md → Lessons Learned / Automatic Post-Bugfix Documentation).

## Avoid These Mistakes

- **Undocumented language conventions (2026-09-30):** user preferences like output
  language must be persisted in `AGENTS.md` immediately when stated, otherwise they
  are lost across sessions. Convention here: chat in German, all artifacts in English.
- **`git diff`/`git log` ohne `--no-pager` im Agent-Terminal hängt (2026-09-28, rezidiv):** im
  non-interaktiven pty startet der Pager und blockiert den Call endlos (User-Abbruch nötig).
  AGENTS.md fordert `--no-pager` für JEADEN read-only-git-Befehl — der Verstoß passierte genau bei
  `git diff --stat`. → Prevention: nie einen git-Befehl ohne `--no-pager` absetzen (oder `PAGER=cat`),
  auch bei "sicher kurzen" Diffs; bei Hanging-Call primär Pager vermuten, nicht git selbst.
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

## 2026-09-25 — Capture-Gate erster produktiver Lauf (3. Lauf, grün nach Fix)
- **Tool-vs.-Contract-Lücke**: `experience_seed_lessons` validiert `minItems 1` — der dokumentierte „leeres Array = No-Op"-Vertrag des `capture-session-lessons`-Gates scheiterte im ersten produktiven Lauf (`required_hook_failed`, complete blockiert). Fix: Guard im Thin-Client `seed-lessons.mjs` (leeres Array → Exit 0 vor MCP-Transport). Lehre: Gate-Verträge am Tool-Verhalten verifizieren, nicht nur an der Doku — der erste produktive Lauf eines neuen Gates IST der eigentliche Test.
- **Clear-Thought-Duty live erfüllt**: understand (first_principles mental_model), plan (issue_tree-Zerlegung) — die Referenzierungs-Pflicht wurde in beiden Submissions umgesetzt.

- **gitnexus detect-changes Index-Lag**: detect-changes meldete 'No changes detected' trotz frischer Edits — Ursache ungeklärt; Kompensation: analyze vor detect-changes in derselben Session neu ausführen, bei Widerspruch explizite Checks (JSON-Validierung, Full-Read) nutzen. (Auch als EMMS-Episode geseedet.)
- **Guidance-Validator-Cache**: workflow.json-Äderungen wirken nicht in laufenden Sessions — 
  `WorkflowEngine.validatorFor` cached kompilierte Schemas per schemaRef für die Session-Lifetime; Schema-Edits sind wie aller .guidance-Config erst nach Restart/Neuer Session wirksam.

## 2026-09-25 — Guidance-Gates: Config-Snapshot + Template-Platzhalter (GUID-1/3 abgeschlossen)
- **Config-Snapshot pro Session**: Der Guidance-Server lädt `.guidance/` beim Session-Start (configurationVersion-SHA im Session-State). Operation-Config-Änderungen auf Disk wirken NICHT in laufenden Sessions — Fix + Container-Restart + resume nötig. Prevention: Operations-Config vor `start_workflow` verifizieren, nicht mid-session patchen.
- **`${project.name}`-Platzhalter wird nie aufgelöst**: mcpTool-Arguments liefen mit Literal-String ("Repository \"${project.name}\" not found") — Literal-Passthrough ist kein Gate-Success. Workaround: konkrete Werte hartcodieren; echter Fix (Placeholder-Engine) = GUID-3.
- **Gate-Debugging über retry_operation**: Der Retry führt die Phasen-Gates serverseitig erneut aus — Fehler Summaries dort sind die primäre Diagnosequelle; host-seitige Läufe (WSL `yarn build`, exit 0) sind gültige Gegenbeweise bei Container-Umgebungsproblemen.

## 2026-09-18: EMMS-Implementierung
- **better-sqlite3 native build**: `--ignore-scripts`-Installation laesst die native Bindung fehlen ("Could not locate the bindings file"). Fix: `npm rebuild better-sqlite3`. Bei Workspace-Root-Installs: Bindung liegt am Root, nicht im Server-Ordner.
- **better-sqlite3 named params**: alle benannten Parameter muessen uebergeben werden (auch `null` fuer optionale Spalten) — `...spread` mit `undefined`-Feldern wirft "Missing named parameter". Immer explizit mappen.
- **FR-008-Assessment-Reihenfolge**: finalize muss plan/runs/attempts FRISCH aus dem Adapter lesen (read-after-write), nicht den beim mutate geladenen Ctx-Snapshot — sonst fehlt der gerade aufgeschriebene Run.
- **Assessment read-only**: ein abgelehntes finalize (MISSING_REQUIRED_EVIDENCE) darf den Episode-State NICHT mutieren (kein PARTIALLY_VERIFIED-Zwangsuebergang), sonst kann der Agent nach Nachlegen der Evidenz nie mehr 'verified' erreichen.
- **vitest + ESM-Imports in Tests**: `.js`-Endungen in Test-Imports resolveen unter vitest/node16-Mix nicht zuverlaessig — in Tests `.ts`-Endungen verwenden (Tests sind von tsconfig.build excluded).
- **FTS5 MATCH-Injection**: Nutzertext mit Satzzeichen bricht MATCH-Syntax (`syntax error near ","`) — Query-Tokens vor MATCH auf `[\w\s]` sanitizen.
- **SC-009-Demotion-Test**: Ranking-Demotion braucht >=2 Kandidaten mit GLEICHER Signatur-Hash (sonst kein echter Ranking-Vergleich) und der Peer muss voll kompatibel sein (sonst dominiert Applicability-first ohnehin).

## 2026-09-25 — Guidance-Capture-Gate (2. produktiver End-to-End-Lauf, grün)
- **spawnSync ohne env-Support**: Prozess-Operationen erben nur das Container-Environment (`OperationEngine.ts:188`) — ENV-Variablen für Gate-Scripts müssen heute per `sh -c`-Inline-Assignment gesetzt werden (siehe `capture-session-lessons`); saubere Lösung wäre ein `env`-Feld in der Operation-Config (→ GUID-5).
- **Lessons-File-Vertrag**: Der Agent schreibt `.guidance/state/session-lessons.json` VOR dem `complete_workflow`-Call (Gates laufen on-transition); IMMER Datei anlegen (leeres Array = No-Op-Erfolg), sonst blockiert das required-Gate docs-only-Läufe. Redaction-Pflicht beim Agent — `seed-lessons.mjs` spricht Insight direkt an und umgeht Guidances Pattern-Redaction.
- **Idempotenz live bestätigt**: erneuter Seed-Lauf meldet dieselben Slugs als `duplicate` (Exit 0) — Doppel-Episoden ausgeschlossen; Verifikation via `experience_search` mit exaktem Slug (Full-Text-Arm, semantischer Arm MVP-deaktiviert).

## 2026-09-25 — GUID-3/4/5 abgeschlossen (Template-Resolution, env/shell, Regression)
- **Template-Resolution fail-fast**: `${token}` in `mode: "template"` wird jetzt tief aufgelöst (`session.request`, `project.name`); unbekannte Tokens werfen `operation_arguments_invalid` statt literal durchzugehen (GUID-3-Wurzel: maskierte Gate-Bugs). Behavior-Change in README dokumentiert.
- **Prozess-Ops: `env` + `shell`** (GUID-5): `spawnSync` merged `config.env` über process.env und reicht `shell` (boolean|string) durch — der `sh -c`-Wrapper-Workaround entfällt aus der eigenen operations.json.
- **Regression-Muster für „nur im Build sichtbar“-Bugs** (GUID-4): public-API-Test über den echten Schema-Load-Pfad (validatorFor) + Source-Scan-Test gegen bare-`require("…")` — vitest allein hatte den Crash nie reproduziert.

## 2026-09-25 — bare `require` in ESM-Quellcode (Rezidiv, 2. Fall)
- **Issue**: `createRequireShim()` in `WorkflowEngine.ts` nutzte `require("node:module")` per Bare-`require` — in ESM ist `require` nicht definiert ⇒ ReferenceError: require is not defined bei JEDEM `submit_*`-Call (Schemavalidierung lädt über den Shim). Traf erst im Live-Docker-Betrieb auf, die vitest-Suite griff den Pfad nicht.
- **Root Cause**: Wiederholung des SpecKitEngine-„2d-Fix"-Musters — dynmische `require()`-Aufrufe überleben den CJS→ESM-Wechsel im tests nicht abgedeckten Lazy-Load-Pfad.
- **Fix**: statischer Import `import { createRequire } from "node:module"` + `createRequire(import.meta.url)` (Muster aus `schema-validator.ts`).
- **Prävention**: Neue Regel für Code-Reviews: `grep -rn "require\(" servers/*/src` muss nur noch legale `createRequire`- Importe zeigen; jede neue `require(`-Stelle in `src/**` ist ein Blocker. Second-Occurrence → Muster gilt als rezidivierend.

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

## 2026-09-19 — Replay-Revision-Fix-Lessons (in `thinking-mcp-lessons` gespielt)
- **idempotent-replay-stale-revision**: FR-028-Literal-Replay von `workflow_start` lieferte die Original-Revision (meist 1) zurück → Addendum-Läufe rechneten ab da und crashten mit STALE_REVISION (Niyama-Befund „Rev 3 auf dem älteren Workflow"). Fix: Replay patcht `result.revision` auf die aktuelle Workflow-Revision + `replayed: true`; Regressionstest `replay-revision.test.ts`, Suite 95/95. Meta-Lesson: Literal-Replay ist unsicher für jedes Ergebnisfeld, das sich mit der Zeit ändert.
- **emms-search-response-field-results**: `experience_search` liefert Treffer unter `result.results` — ein Verify-Probe, das `result.items` liest, maskiert echte Treffer als „0 hits". Fix: `results` lesen; bei 0 Treffern erst den Roh-Envelope dumpen, bevor Fehlschlag konstatiert wird.
- Seeder 2/2, Round-Trip bestätigt.

## 2026-09-19 — drvfs-Verzeichnis-Rename-Falle (experiencememory → insight)
- **Issue**: `git mv servers/server-experiencememory servers/server-insight` auf /mnt/d (WSL drvfs) vergiftete den Dentry-Cache: das Zielverzeichnis war danach für WSL dauerhaft unlesbar (`d?????????` / "No such file or directory"), obwohl Windows (`cmd.exe dir`) den vollständigen Inhalt zeigte. Negative Cache-Einträge verfielen auch nach >2 min nicht.
- **Ursache**: WSL-seitige Umbenennungen auf drvfs hinterlassen stale positive/negative Dentry-Einträge für den Zielnamen; selbst Windows-seitige Neu-Erstellung desselben Namens bleibt für WSL unsichtbar.
- **Validierte Workarounds** (in dieser Reihenfolge):
  1. **Case-Variante als Seitentür**: `ls servers/Server-Insight/` (abweichende Groß-/Kleinschreibung) umgeht den negativen Dentry und zeigt den Inhalt.
  2. **Heilung über Rename-Kette auf einen unbelasteten Namen**: `mv <fallVariant> servers/insight-heal && mv servers/insight-heal servers/insight` — der zweite Sprung auf einen nie gecachten Namen funktioniert; das Original-Ziel ('server-insight') blieb dauerhaft defekt.
  3. Verzeichnis-Ops auf drvfs bevorzugt **Windows-seitig** ausführen (`cmd.exe /c move ...`), nie WSL-seitig bei#getrackten Ordnern.
- Konsequenz: Server-Ordner heißt jetzt `servers/insight` (statt `server-insight`) — der saubere Name war frei.

## 2026-09-19 — Compose-Service-Drift-Lesson (in `thinking-mcp-lessons` gespielt)
- **server-local-compose-service-drift**: Nach Root-Compose-Rename (experience-memory → insight) erzeugte `docker compose up` einen dritten Container `experience-memory` — die server-lokale `docker-compose.yml` in `servers/server-insight` definierte den Service noch unter dem alten Namen. Fix: Service auch dort umbenennen, toten Container `docker rm`, Verifikation via `docker compose config --services` je Verzeichnis. Regel: Bei Service-Renames ALLE compose-Dateien im Repo greppen, nicht nur die Root.
- Seeder 1/1, Round-Trip bestätigt (exp_353dfc99).

## 2026-09-19 — Release-Pipeline-Review (insight)
- **publish-skript-Kopien validieren**: Das von clear-thought kopierte `publish-smithery.mjs` war nur halb angepasst (falsche Factory-Importe, `defaultConfig`-Export existierte nicht, clear-thought-configSchema/-Card) und wäre zur Laufzeit gecrasht. Regel: kopierte Skripte end-to-end ausführen (mindestens bis zur Netzwerk-Grenze trocken), nicht nur Syntax-checken.
- **build-mcpb.mjs war nie lauffähig** (fehlender `dirname`-Import, invalides Manifest-Schema: tools als String-Array statt Objekte). Fix nach clear-thought-Muster: Laufzeit-Tool-Capture + schema-valide Manifeste.
- **mcpb pack hängt bei ~300 MB node_modules** (onnxruntime) in dieser Umgebung — direkter tar.gz-Pack (`.mcpb` IST ein tar.gz mit manifest.json im Root) als Ersatz; Staging auf ext4 (/tmp) wegen drvfs-Dentry-Flackern.
- **npm-OIDC kann Packages nicht erstellen**: Trusted Publisher muss pro Package auf npmjs.com existieren — Erst-Release immer manuell, dann Workflow. Guards: npm `REMOTE=none` → fail-fast mit Anleitung; Smithery `none` → skip mit Note.

## 2026-09-19 — Workflow-Persistenz-Lücke (Niyama-Fund, wf_225bf751-af3)
- **Root Cause**: STDIO-Default `storagePath = cwd/emms-store.db` — jeder Agent startete den Server aus seinem eigenen cwd und bekam eine frische, cwd-lokale DB. Workflows früherer Sessions waren "not found", obwohl der Server korrekt funktionierte.
- **Fix**: Persistenter Default `~/.insight/emms-store.db` (mkdirSync recursive). Kette: config.storagePath > EMMS_STORAGE_PATH (resolveConfig) > ~/.insight. Docker/compose setzt weiter EMMS_STORAGE_PATH auf das Volume.
- **Verifiziert**: Workflow in Server-Prozess A erstellt, in unabhängigem Prozess B gefunden. Suite 95/95.
- **Meta-Lesson**: cwd-abhängige Defaults sind Persistence-Fallen für stdio-MCP-Server — Default-State gehört auf user-level Pfade.

## 2026-09-19 — Finale Session-Lessons (in `thinking-mcp-lessons` gespielt)
- **compose-project-context-determines-container-names**: Compose leitet den Projektnamen aus dem Verzeichnis der compose-Datei ab — server-lokale Compose-Dateien erzeugen eigene Projekte (server-insight-insight-1) statt des Root-Stacks (thinking-mcp-insight-1). Nicht kaputt, aber verwirrend; kanonischen Einstiegspunkt festlegen und `docker compose ls` bei Namensverwirrung nutzen.
- **docker-restore-must-include-wal-sidecar-files**: SQLite WAL hält frische Commits in der -wal-Datei — .db-only-Kopien verlieren genau diese (Root-Mechanismus des Data Loss beim Rename). Backups UND Restores müssen -wal/-shm mitsichern; nach Restore Zeilenzahl verifizieren.
- **reseed-lessons-from-fixtures-after-store-loss**: Lessons existieren doppelt außerhalb des Stores (JSON-Fixtures + lessonsLearned.md) — Store-Verlust wird so zum idempotenten Re-Seed statt Datenverlust (10/10 wiederhergestellt). Dual-Write-Disziplin beibehalten.
- Seeder 3/3, Round-Trip bestätigt.

## 2026-09-19 — Stale Import nach Rename überlebte lokalen Testlauf (CI rot)
- **Issue**: CI failed mit "Failed to load url ../src/tools/agents-guide.js" in setup-clearthought.test.ts — lokal lief die Suite grün.
- **Root Cause**: Der Rename-Commit (be4a4d2) benannte Dateien um, übersah aber den Test-Import. Der lokale "142/142 green" war wertlos: vitest-Cache/inkrementelles Verhalten maskierte den Load-Fehler, bzw. die Suite wurde nicht im Clean-State ausgeführt.
- **Fix**: Import auf setup-clearthought.js korrigiert (feb4665), Suite 152/152.
- **Prävention**: Vor "suite green"-Claims bei Rename/Move-Commits: `vitest run` in einem sauberen Zustand (mind. `npx vitest run --no-cache` oder frischer Checkout). `Failed to load url`-Fehler = tote Import-Pfade, die nur ohne Cache sichtbar sind.

## 2026-09-20 — Merge-Runde-Lessons (in `thinking-mcp-lessons` gespielt)
- **native-module-unhandled-rejection-in-vitest**: CI rot trotz 95/95 grün — der abgefangene onnxruntime-Load-Fehler surfte als vitest-Unhandled-Rejection. Fix: `EMMS_DISABLE_EMBEDDINGS=1` (kurzschließt VOR dem dynamischen Import) + `it.skipIf` für die 2 echten Modell-Tests + env in test.yml. Meta: vor "green" die Unhandled-Errors-Sektion prüfen.
- **npm-publish-from-wrong-directory-publishes-wrong-package**: Publish lief zweimal vom Monorepo-Root und versuchte `@paschbaer/thinking-mcp@0.0.1` (292 Dateien) zu pushen — nur `private: true` verhinderte Schlimmes. Fix: cd in den Workspace-Ordner, Intent via `node -p "require('./package.json').name"` verifizieren, Tarball-Contents-Listing LESEN.
- **gitignore-pattern-lost-during-string-replace-edits**: Verkettete String-Replace-Edits an .gitignore verloren still das Pattern `/emms-store.db*` — Datei blieb untracked trotz dreimal "done". Fix: nach Ignore-Edit für JEDE Datei `git check-ignore` verifizieren und das komplette Pattern-Set greppen, Commit amenden bis alles exit 0.
- Seeder 3/3, Round-Trip bestätigt (exp_3ebae212, exp_4d4ecd2b, exp_56e5bded).

## 2026-09-20 — Smithery-Erst-Publish (insight live!)
- **smithery-first-publish-needs-server-upsert**: PUT /servers/{q}/releases liefert 404 "Server not found" für neue Server — der Record muss zuerst via PUT /servers/{q} (Upsert mit displayName/description, HTTP 201) angelegt werden; danach funktioniert das Release-PUT. Skript macht jetzt create-fallback + retry.
- **smithery-bundle-cap-25mb-trim**: Smithery-Cap 25 MB komprimiert. Roh-Install ~300 MB. Trim: onnxruntime darwin/win32/arm64-Binaries, onnxruntime-web, alle ort-wasm-Varianten außer simd-threaded, sourcemaps, protobufjs/cli, better-sqlite3 build-Toolchain (deps/, obj.target, *.mk) → 96 MB → 23.7 MB gz (gzip -9 statt default — allein das brachte 28→23.7).
- **spawnSync-maxbuffer-kills-big-stdout**: tar -cf - mit stdout-Pipe (100 MB+) crashte spawnSync still (status≠0, ENOENT-ähnlich, keine Meldung) — Default-maxBuffer ist 1 MB. Fix: stdio-stderr auf 'pipe' + maxBuffer 512 MB, stderr loggen. Regel: spawnSync mit erwartetem Groß-Output NIE ohne maxBuffer.
- **build-skript-claims-verify-end-to-end**: Das kopierte publish-skript referenzierte insight.mcpb, das Build aber insight-<version>.mcpb erzeugt — plus TDZ-Crash (pkg vor Nutzung). Regel: bei kopierten/umgebauten Skripten den ERSTEN echten Lauf im selben Commit verifizieren, nicht nur Syntax.
- **insight ist jetzt LIVE auf Smithery**: https://insight--paschbaer.run.tools (Release 202, Record-Patch 200, Registry-Eintrag verifiziert).

## 2026-09-20 — Smithery-Erst-Publish-Lessons (in `thinking-mcp-lessons` gespielt)
- **smithery-first-publish-needs-server-upsert**: Release-PUT 404t für neue Server; Create ist PUT /servers/{q} (Upsert, HTTP 201), nicht POST. Skript hat jetzt Create-Fallback + Release-Retry (create 201 → release 202 → patch 200, end-to-end verifiziert).
- **smithery-bundle-cap-25mb-trim**: 80-MB-Bundle (onnxruntime Multi-Platform + onnxruntime-web + wasm-Varianten + sourcemaps + better-sqlite3-Toolchain) auf 23.7 MB getrimmt; gzip -9 allein brachte 28→23.7.
- **spawn-sync-maxbuffer-kills-big-stdout**: tar-stdout (100 MB+) über spawnSync-Pipe crashte still — Default-maxBuffer 1 MB. Fix: maxBuffer 512 MB + stderr pipen/loggen. Regel: spawnSync mit großem erwartetem Output nie ohne maxBuffer.
- **bundle-filename-version-drift-between-build-and-publish**: publish suchte insight.mcpb, build erzeugt insight-<version>.mcpb (ENOENT) + TDZ-Crash beim ersten Fix. Fix: versionierte Auflösung + pkg nach oben. Regel: ersten echten Lauf kopierter/umgebauter Skripte im selben Commit verifizieren.
- Seeder 4/4, Round-Trip bestätigt (exp_fa71d807, exp_2f92135e, exp_f99452a2, exp_4da4713b).

- (2026-09-22, insight) Split-store trap fixed structurally: seeding logic was a client-side script bound to a repo checkout path — unusable for MCP consumers in other repos. Lesson: server capabilities must be delivered BY the server (MCP tool), scripts only as thin transport wrappers. Prevention: any new capture/write workflow ships as an MCP tool first; a CLI wrapper is optional sugar. Also: on /mnt/d, verify load-bearing edit-tool changes with an immediate terminal grep — two replacement batches silently failed to land today and had to be reapplied via terminal.

- (2026-09-22, insight) FTS-Retrieval war vollständig wirkungslos, aber schleichend: (1) `episodes_fts` hatte NIE einen Writer — nur Migration + Reader. Fix: Insert/Update-Trigger + Backfill im Adapter-Init. (2) `searchFullText` INNER-JOINte `signatures` und warf damit alle signaturlosen Episoden (Lessons!) weg; (3) FTS-Treffer flossen nicht ins Relevance-Scoring ein — Kandidatenfindung ohne Ranking ist bei limit-basierter Ausgabe wertlos. Lektion: "Silent empty result" muss zwischen "Index leer", "Join filtert weg" und "Score ignoriert Treffer" unterschieden werden — jedes Bug-Layer war einzeln grün im Test, weil die Tests nur über den Fallback liefen. Regressionstest muss die FTS-Arm-Adresse direkt prüfen (Relevance > Fallback-Floor, Top-Rank).

- (2026-09-23, guidance) 12 Lessons aus der Guidance-Implementierung (Phasen 1-12) via experience_seed_lessons geseed (alle PARTIALLY_VERIFIED, keine Duplikate): python-patch-partial-replace, mntd-edit-tool-phantom-success (3. Rezidiv), guidance-profile-shallow-merge, guidance-transition-reason-vs-when, closure-tdz-runtime-crash, hollow-failure-path-tests, exposure-mode-field-hygiene, unwired-policy-dead-code, path-boundary-prefix-match, dispute-review-finding-with-targeted-repro, vitest-no-tests-fails-suite, ajv2020-esm-interop-constructor, mcp-sdk-register-tool-zod-shape, read-path-mutation-lock. Suche-Round-Trip: experience_search liefert derzeit nur Legacy-Episoden (0.25 Relevance, Signature/Full-Text-Arm) — neue Episoden sind per Seed-Status (experience_ids) bestätigt, semantische Suche ist im MVP deaktiviert.
- Kernmuster dieser Session: (1) Reviewer-Findings nie ohne gezielten Repro widersprechen (TDZ-Fall: Suite grün, aber requestId-Pfad nie getestet). (2) Security-/Policy-Controls nach dem Implementieren sofort im Produktionspfad verdrahten (evaluateEgress war Dead Code trotz grüner Unit-Tests). (3) Workspace-Boundary-Checks brauchen separator-bewusste Prefix-Prüfung + echten Sibling-Repro. (4) Reason-only-Transitionen nur im Fehlerpfad matchen. (5) Atomic Persistence (tmp+rename) auch für Lock-Dateien — korrupte Locks hätten alles blockiert.
- (2026-09-23, guidance F4) Terminal-phase submit assertions: die transition_rejected-Route im WorkflowEngine gibt Code `required_hook_failed` ("remaining in phase") zurück; ein zweiter Submit einer Phase mit `transitions: []` kann NIE Transition-Ergebnisse liefern. Hook-Effekte auf den Submit asserten, der die Transition durchführt. Optional failed beforeEnter-Ops erscheinen DOCH in `operations` (exposeOpResult filtert nicht). Lesson geseed: guidance-terminal-phase-submit-assertion (PARTIALLY_VERIFIED).
- (2026-09-23, guidance HTTP/Docker) 6 neue Lessons via experience_seed_lessons geseed (alle PARTIALLY_VERIFIED, 0 Duplikate): (1) docker-compose-bind-mount-missing-config-crash-loop — leeres Host-Verzeichnis im Bind-Mount → configuration_not_found-Crash-Loop, ECONNREFUSED im Client; mounted content verifizieren, nicht nur den Mount. (2) dockerfile-healthcheck-curl-missing-in-image — HEALTHCHECK mit curl, aber curl nie installiert → ewig 'health: starting'; Diagnose via docker inspect State.Health.Log. (3) async-json-tojson-promise-empty-payload — fehlendes await → JSON.stringify(Promise)='{}', 142 grüne Tests sahen es nicht; Review fand es. (4) ts-duplicate-import-after-partial-edit-tool-failure + (5) python-patch-silent-noop-exact-match-required — /mnt/d-Patch-Fallen: replace-Tools melden Erfolg, tsc beweist das Gegenteil; count-printen + grep -c verifizieren. (6) mcp-http-post-requires-accept-header — POST /mcp braucht accept: application/json, text/event-stream, sonst 406 (irreführend nach Auth-Fix).

### Avoid These Mistakes (2026-09-23, Transport-Migration)
- **MCP-Server-Transport-Wiring**: StreamableHTTPServerTransport OHNE `await server.connect(transport)` = Sessions werden erstellt, Antworten kommen nie (hängende Clients). Beim manuellen Session-Management IMMER connect vor handleRequest; Verifikation nur mit dem offiziellen SDK-Client gegen den gebauten Stand (nicht gegen tsx-Quelle und nicht per curl — SSE-Streams lassen curl ohne Session-Header hängen und suggerieren Fehlfunktionen).
- **Express-App-Fehlerpfad mit offenen Responses**: shutdown/`uncaughtException`-Handler, die `server.close(cb)` mit Callback verwenden, hängen ewig, wenn der Server nie erfolgreich gelisten hat (EADDRINUSE) — immer Fallback-`setTimeout(...).unref()` ergänzen.
- **WSL-Testhygiene**: Hintergrund-node-Prozesse auf /mnt/d hinterlassen Geister-Listen-Sockets; EADDRINUSE-Ketten und "leere" Logs täuschen über den eigentlichen Fehler hinweg. Vor Servertests Ports gezielt prüfen (ss -tln) und Prozesse per PID vom Socket killen, nicht per breitem pgrep (hasst VS-Code-Server-Prozesse).


### Avoid These Mistakes (2026-09-23, setup_clearthought Endless-Retry-Loop)
- **Tool-Response-Feldreihenfolge für LLM-Clients**: Bei Antworten >15 KB stehen
  Trailing-Felder (`status`, `nextSteps`) im truncierten/offgeloadeten
  Tool-Result-View oft NICHT mehr im Modell-Kontext — das Modell hält einen
  erfolgreichen Call für fehlgeschlagen und retryt endlos (beobachtet: 47 Calls
  mit rotierenden `project_name`s). Regel: Bei großen Responses IMMER `status`
  (und bei Einmal-Tools ein explizites `one_shot: true` + "do NOT call again")
  als ERSTE Felder serialisieren, plus denselben Warnhinweis in die
  Tool-Description. Generisch: Erfolgssignal nie hinter Megabytes verstecken.

### Experience Memory Capture (2026-09-23)
- Session-Lessons wurden per `experience_seed_lessons` in den EMMS-Store
  (`thinking-mcp-lessons`) geseedet, beide `PARTIALLY_VERIFIED`,
  Round-Trip per `experience_search` verifiziert:
  - `large-tool-response-status-truncation` (exp_f3795b94-c9a) — siehe
    "setup_clearthought Endless-Retry-Loop" oben; Fix in 38875a9/a8fb97d.
  - `mnt-d-readfile-linewrap-edit-mismatch` (exp_8c20e8af-668) — read_file
    liefert auf /mnt/d hart umgebrochene Zeilen; edit-Tools brauchen
    Byte-Exaktheit. Fix: Terminal-Python-Patch mit Occurrence-Assertion +
    sofortiger grep-Verifikation; Terminal-Lesen ist Disk-Autorität.
- Hinweis: EMMS-Suche ist im MVP nur Full-Text/Signature (semantische Suche
  inaktiv) — mit Slug-Fragmenten suchen (z.B. "status-truncation"), nicht
  mit freier Beschreibung.

### Avoid These Mistakes (2026-09-23, Fortsetzung Loop-Defense)
- **Kurze Erfolgs-Antworten stoppen Loops NICHT zuverlaessig**: Modelle
  ignorieren selbst sichtbare status:'loop_detected'-Results (20+ Retries
  beobachtet) — nur Protokoll-Fehler (isError:true) wirken zuverlaessig.
  Eskalationsstufe einplanen, nicht nur Status-Felder.
- **Templates duerfen Marker nicht selbst enthalten**: buildGuideBlock wrappt
  den Body — ein im Template hinterlegter End-Marker verdoppelt ihn und
  Merge-Mode faellt stumm in den Append-Fallback (block_replaced:false +
  warning). Regel: Marker-Nur-Durch-Code; Test fehlt noch (getrackt).
- **create_file auf /mnt/d**: diesmal sofort per grep verifiziert — okay.
  Aber Heredoc-Anhaenge an Testdateien koennen bei abgebrochenen Terminals
  Dateien duplizieren: vor Commit immer grep -c auf Helfer-Symbole.

### Avoid These Mistakes (2026-09-24, Codebase-Review)
- **Session-Registry-Muster**: create-on-unknown-POST + Registry-Eintrag nur in
  `onsessioninitialized` erzeugt reaper-blinde Orphans (in insight UND
  clear-thought identisch vorhanden). Praevention: non-initialize-Requests ohne
  Session-Header early-rejecten (body.method-Pruefung) oder Session sofort mit
  pending-State registrieren. Beim Review nach `onsessioninitialized` +
  `sessions.set` greppen.
- **Branch-Disziplin: BRANCH VOR DEM ERSTEN COMMIT anlegen** (2x in dieser
  Session direkt auf develop committet — jeweils per reset --mixed repariert,
  aber vermeidbar). Regel: nach `git checkout -b feature/...` als ALLERERSTER
  Schritt erst committen, dann weiterarbeiten; nie `git commit` ausführen,
  ohne den Branch-Namen im Prompt-Prefix geprüft zu haben.
- **Commit-/Memory-bank-Behauptungen grep-verifizieren**: „dbg-Logs entfernt"
  (c22585a) war unvollstaendig — 1 [dbg] verblieb in src L132. Behauptungen ueber
  abgeschlossene Bereinigungen nie trauen, immer selbst zaehlen.
- **Deprecation braucht npm deprecate**: README-Hinweis allein verhindert
  Installation nicht (package.json hat kein deprecated-Feld). Zusatzfalle:
  `app.listen(PORT)` ohne Host-Arg bindet 0.0.0.0 — Loopback-Default immer
  explizit setzen.

### Experience Memory Capture (2026-09-24, Review-Batches)
6 validierte Lessons über `experience_seed_lessons` in den laufenden
insight-Server (HTTP :3002, scope `thinking-mcp-lessons`) geseedet und per
`experience_search` round-trip-verifiziert (6/6, tier PARTIALLY_VERIFIED):
session-registry-orphan-pattern, verify-cleanup-claims-by-grep,
yarn-lockfile-format-mismatch, env-port-string-2arg-listen,
validation-throw-swallowed-by-catch, fts5-bare-operators-survive-sanitization.
Inhalte deckungsgleich mit den Einträgen oben (Batch-Lessons).

### Avoid These Mistakes (2026-09-24, Batch B/C+D)
- **Validierungs-Throws nicht in allgemeine Catch-Blöcke legen**: Der neue
  Malformed-Hash-Error in `evidence/store.ts pathFor()` wurde anfangs vom
  Read-Miss-Catch in `read()` verschluckt („Artifact content not found") —
  der Test mit genauer MessageAssertion hat es sofort aufgedeckt. Regel:
  pfad-/inputvalidierung VOR try-Blöcken auflösen; Tests auf die konkrete
  Fehlermeldung, nicht nur „wirft irgendwas".
- **Lockfile-Format-Konflikt schläft im Repo**: v1-Format + yarn@4-Pin fiel
  nicht auf, weil test.yml nicht bei develop-Pushes läuft. Bei CI-Problemen
  erst die Trigger-Matrix prüfen, bevor man „CI grün" als Beweis zitiert.
- **listen(port)-String-Falle (2. Vorkommnis!)**: `process.env.PORT` ist ein
  String — der 1-Arg-Overload von `app.listen` schluckt das, aber beim
  Nachziehen des Host-Arguments (2-Arg-Overload) knallt TS2769. insight hatte
  den identischen Bug (+ Fix-Kommentar dort). Regel: `Number(process.env.PORT)`
  von Anfang an; IMMER `tsc`/`yarn build` für jeden getouchten Server laufen
  lassen — vitest (esbuild) typecheckt NICHT und ist kein Build-Ersatz.
- **MCP SDK Client-Transport heißt anders als das Server-Pendant**: Server:
  `StreamableHTTPServerTransport` (server/streamableHttp.js) — Client:
  `StreamableHTTPClientTransport` (client/streamableHttp.js), NICHT
  `StreamableClientTransport`. Der Name ist erst zur Laufzeit weggebrochen
  („is not a constructor"), weil vitest/esbuild nicht typecheckt. Regel: bei
  neuen SDK-Importen Klassenname per Blick in die SDK-D.ts verifizieren.
- **Node-Toolchain in WSL ist nur in interaktiven Shells auf PATH**: `wsl.exe
  bash -c` lädt nvm nicht (nvm sitzt in .bashrc). Direkter Pfad:
  `export PATH=$HOME/.nvm/versions/node/v24.16.0/bin:$PATH` mit `\$`-Escaping —
  das Windows-seitige sh interpoliert `$VAR` sonst VOR wsl.exe. Workspaces
  hoisten vitest/tsc ins Repo-Root (`node_modules/.bin/vitest` dort aufrufen).
- **ECONNREFUSED beweist kein Timeout-Wiring**: Ein Test gegen einen
  Verbindung-verwerfenden Port (z.B. 127.0.0.1:9) schlägt sofort mit
  ECONNREFUSED fehl — nie über den Timeout-Pfad. Um Handshake-/Request-Timeouts
  zu verdrahten, braucht es einen HANGING Transport (im Test über den
  useTransport-Seam: start() never resolves). Erst dann zeigt elapsed<5s bei
  Default 10s, dass der per-Call-Timeout wirklich greift.

## Avoid These Mistakes
- **requestId reuse an Guidance-Submit-Tools:** submit_plan_review/submit_plan/submit_understanding mit bereits registrierter requestId geben still `accepted: true` zurück (idempotenter Replay des gecachten Results, WorkflowEngine.submitLocked L1617) OHNE den Phase-Advance auszulösen → Agent stolpert in eine Retry-Schleife (3× akzeptiert, Phase wechselt nie). Preventive: (1) pro Phase-Submission IMMER eine frische requestId (`req-<phase>-<purpose>-<n>`); (2) `accepted:true` + unveränderte currentPhase ist ein Signal, NICHT ein Retry-Trigger — erst get_workflow_state (requestIds: previousPhase ≠ currentPhase = Request hat schon gewirkt) und get_current_guidance (requiredActions/operations) prüfen; (3) Server-seitig: Replay-Result mit `replayed:true` markieren (siehe remaining-work-plan Hardening-Plan).
- **sed -i auf CRLF-Dateien (Windows-Checkout):** `sed -i` rewrote komplette Datei (132/132 Zeilen im Diff) statt nur der gematchten Zeile — Zeilenenden wurden normalisiert. Preventive: edits in CRLF-Dateien mit `perl -pi -e` (erhält \r) oder `edit_file`-Tool; danach immer `git diff --stat` auf Zeilenzahl-Plausibilität prüfen.

## 2026-09-27: specs/011 — Latente Adopt-Bugs erst durch echten e2e sichtbar
- generateFiles-Unit-Tests prüften nur die generierten Strings, nie loadConfig/Workflow-Boot. Dadurch überlebten 2 Bugs aus 009 unentdeckt: (1) mainConfigSchema hatte additionalProperties:false und kein "adoption"-Property → jede adopt-Config scheiterte am Config-Load; (2) Insight-Erkennung hing am Op-Namen "capture-session-lessons", das Template heute "store-completion-insight" heißt. Preventive: Generator-Änderungen immer mit einem e2e (generate → auf Disk schreiben → composeApplication → startWorkflow) absichern; namensbasierte Erkennungen (Op-IDs) als geteilte Konstante führen statt String-Literalen zu duplizieren.

## 2026-09-28: Guidance-Phase-Advance hängt an frischem requestId (Niyama session-46a43aeb)
- **Issue:** Niyama-Agent steckte 3 Submissions lang in `review_and_adjust_plan`, obwohl jede `submit_plan_review`-Antwort `accepted: true` war. **Root cause:** dieselbe requestId (`req-plan-v2-impl-c0c1`) wiederverwendet — `WorkflowEngine.submitLocked` replays still das gecachte Result (das den Transition plan→review bereits ausgelöst hatte); ein Phase-Advance passiert nur bei NEUER requestId. **Fix:** Resubmission mit frischer requestId (`req-plan-review-adjusted-c0c1`) → Phase sofort `implement`. **Preventive:** siehe Avoid-These-Mistakes-Eintrag oben; Regel zusätzlich in die Config-Assistant-Templates (examples/default-guidance/responses-wisdom.json) und Server-Hardening (duplicate-marker) eingebracht.

## 2026-09-28: Zustandslose HTTP-Server können Verbindungsstatus nicht im RAM führen
- **Issue:** `get_downstream_status` meldete dauerhaft "disconnected", obwohl alle Downstream-Server lebendig waren und Calls erfolgreich liefen. **Root cause:** Der guidance-HTTP-Endpoint baut pro Request einen frischen WorkflowEngine+ClientManager (server.ts: "Stateless streamable HTTP: fresh server+transport per request") — in-memory Verbindungsstatus wird nach jedem Request verworfen, das Tool fällt auf den Default "disconnected" zurück. **Preventive:** (1) Observability-Tools dürfen nie aus per-Request-Konstrukt-Zustand lesen — Status entweder aus persistierten Metriken oder via on-demand Probe ermitteln. (2) Bei der Diagnose "Status tool sagt X, aber Calls funktionieren": zuerst klären, ob das Tool pro Request einen frischen Kontext bekommt, bevor Transport-/Netzwerk-Ursachen verfolgt werden. (3) Ein "forced first use" über eine stale Session-ID beweist nichts — `session_not_found` schlägt still fehl, bevor ensureReady jemals läuft; immer die Run-Operation-Response prüfen und get_metrics gegenprüfen.

## 2026-09-28: Git-Worktrees + Windows/WSL-Split
- **Issue:** In einem Windows-gecheckten Worktree (.git = Datei mit 'gitdir: D:/...') scheitern WSL-git und Gate-Scripts: WSL-git kann den Windows-Pfad nicht folgen; check-final-review/check-index-freshness resolvieren den Pointer falsch; Tests, die .git/HEAD direkt lesen, brechen mit ENOTDIR. **Fix (GDS-5):** Pointer-Resolution mit Kandidatenliste (POSIX-relativ, /mnt/<drive>, /workspace/<rest>, /workspaces/<name>), commondir für packed-refs UND loose refs prüfen; im Test-Helper dieselbe Logik. **Preventive:** Neuer Code darf nie .git/HEAD direkt lesen — immer über die Pointer-Auflösung; Worktree-Regel ist jetzt instructions.global.
- **Issue:** npm-Install im Guidance-Container (NODE_ENV=production) überspringt devDependencies → Build-Gate exit 127 (tsc not found). **Preventive:** container-seitig `npm install --include=dev`; Worktree-Workflows müssen die Dep-Installation als ersten Schritt einplanen.

## 2026-09-29 — Guidance-Testsuite: Last-Flakiness (WSL /mnt/d)
- **Issue:** server-guidance-Vollläufe zeigten unter Last 2-4 Fehler (teils mit
  variierender Datei-/Testanzahl), saubere Wiederholungsläufe 437/437 grün.
- **Root cause:** IO/CPU-Last auf /mnt/d (9p) verlängert collect-Phasen drastisch
  (66-167s) und kippt timing-sensible Tests — nicht inhaltsbezogen.
- **Preventive measure:** Bei Suite-Fehlern immer einen sauberen Volllauf als
  Zweitlese vor der Fehleranalyse fahren; Fehler nur werten, wenn sie in einem
  unlasteten Lauf reproduzieren (Baseline-aware, konsequent auf Vollläufe
  ausgeweitet). Vollläufe möglichst mit geminderter Parallelität oder auf
  ext4-Worktree ausführen.

### RID-Reuse-Stall bei Phasen-Submissions (bestätigt 2026-09-29, WC-1-Session)
- **Issue:** `submit_verification` lief in einen Context-Server-Timeout; der
  Retry mit GLEICHER requestId hätte den bekannten requestId-Reuse-Stall
  (Lesson 2026-09-28, session-46a43aeb) ausgelöst.
- **Why it failed:** Phasen-Submissions sind requestId-keyed — gleiche ID nach
  Timeout wirkt wie Duplikat/Replay; unterschiedliche Payloads ⇒ payloadMismatch.
- **Preventive measure:** Nach Timeout einer Phasen-Submission IMMER mit neuem
  requestId retryen (Submissions sind pro Phase mit frischer ID idempotent);
  bei `invalid_active_phase: expected X, got Y` ist die erste Submission
  trotzdem angekommen — Status prüfen statt erneut submitieren.
- **Beobachtet:** Genau dieses Muster trat auf (Retry fresh-ID →
  `invalid_active_phase: expected complete, got verify`) — erste Submission
  hatte die Phase bereits gewechselt. Kein Datenverlust.

### Verify-Gate-Fails im Container sind umweltbedingt — State prüfen statt retryen (bestätigt 2026-09-30, CT-1-Session)
- **Issue:** submit_verification lief 2× in Client-Timeouts; danach zeigte der
  State: Submission AKZEPTIERT, Phase advanced — aber Gates lint/test
  serverseitig failed (exit 1). Beinahe Fehlinterpretation als Diff-Regression.
- **Why it failed:** (a) Der Guidance-Container führt die Gates am Repo-Root
  ohne Linux-native node_modules aus → prettier/root-workspaces-Tests failen
  umweltbedingt (beide required:false, Phase advanced trotzdem); (b) die
  Gate-Ausführung (Vollauf-Suite, ~80 s+) sprengt das Client-MCP-Timeout —
  der Client timeoutet, der Server arbeitet weiter.
- **Preventive measure:** Vor submit_verification: prettier --check auf
  servers/*/src lokal (WSL) ausführen — der Gate prüft genau das. Nach
  Client-Timeout: get_workflow_state prüfen (nie blind retryen, RID-Lesson).
  Gate-Fails gegen den lokalen WSL-Referenzlauf abgleichen: lokaler Lauf
  grün + Container-Fail ⇒ umweltbedingt (GATE-1/DB-1-Kontext), nicht
  Diff-Regression. Authoritative Testroute bleibt WSL
  (npm test in servers/server-guidance), Container-Gates erst nach
  deps-install (DB-1-Rest) als verbindlich behandeln.

### 2026-09-30 — Guidance-Container-Start-Crash: falscher /workspaces-Mount an einem veralteten Container (EACCES)
- **Issue:** Der Guidance-Container crashete beim Start mit `Error: EACCES:
  permission denied, mkdir '/workspaces/.guidance'` (scaffold.js →
  ensureConfiguration). `D:\repos\.guidance` existierte auf dem Host nicht;
  ein Isoliertest mit dem korrekten Mount (`docker run --user node -v
  D:/repos:/workspaces ...`) zeigte: Mount ist `drwxrwxrwx`, mkdir als `node`
  funktioniert.
- **Root cause:** Der laufende Container war NICHT aus den aktuellen
  Compose-Dateien erzeugt: `docker inspect` zeigte `bind /mnt ->
  /workspaces` (das root-gehörige `/mnt` der Docker-VM, `drwxr-xr-x`) plus
  ein Relikt-Volume `/workspace` — vermutlich aus einer früheren/WSL-seitigen
  Erzeugung mit falsch aufgelöstem Pfad. `USER node` darf dort nicht
  anlegen → EACCES. `docker compose config` im Compose-Verzeichnis löste
  korrekt auf (`D:\repos -> /workspaces`).
- **Fix:** `docker compose up -d --force-recreate` aus
  `servers/server-guidance` → Scaffold legt `D:\repos\.guidance` sauber an,
  `/health` liefert `configured:true, reachable:true`. Alt-Container mit
  `docker rm -v` entfernt.
- **Preventive measure:** Container-Start via `docker compose up -d` aus
  `servers/server-guidance` ODER aus der Repo-Wurzel (Root-Compose startet
  alle drei Server) — Mount-Auflösung beider Files im Sync halten
  (Root: `../`, Server: `../../../`); bei Startup-EACCES zuerst `docker inspect
  <name>` (Mounts/User) gegen `docker compose config` abgleichen, bevor
  Permission-/Code-Ursachen verfolgt werden. Regel in AGENTS.md
  (Guidance-Sektion) dokumentiert.

### 2026-09-30 — Falsy-Checks genügen nicht bei Config-Objekten; Gate-Fails im Container sind umweltbedingt (Chain-Läufe CT/WW/WC)
- **Issue 1:** Der erste WC-1-CT-1-Guard prüfte nur Falsiness von
  `config.workflow` — ein truthy-leeres Objekt (workflow: {} ohne file)
  wäre durchgerutscht und hätte den TypeError-Crash behalten.
  **Preventive:** Bei Config-Objekten auf die benötigte STRUKTUR prüfen
  (z. B. workflow.id/initialPhase), nicht auf Falsiness; Present-but-empty
  immer als Testfall aufnehmen.
- **Issue 2:** Vollauf-Suite failte 2× mit Timeout-Flakes (metrics/engine,
  30-s-Limit) obwohl der Diff unrelated war.
  **Preventive:** Fokussierte Re-Runs der betroffenen Dateien vor jeder
  Regressionseinschätzung (Baseline-aware, AGENTS.md); Flakes als
  umweltbedingt labeln, nicht fixen.
- **Issue 3 (Prozess):** Massen-Parallel-Reads einer großen Datei führen zu
  Abbrüchen und Token-Verschwendung. **Preventive:** Gezielte Edits aus
  bereits bekannten Code-Stellen; ein gelesener Ausschnitt reicht — nicht
  dieselbe Datei in Dutzenden Window-Reads erneut anfassen.

## 2026-10-01 — Guidance-Completion: First-Try grün fahren, Retry finalisiert nicht (GDS-6)
- **Issue:** Nach Hook-Fehlschlag bei complete_workflow (z.B. index-freshness mtime-Race) und erfolgreichem retry_operation bleibt die Session in status=active/phase=completed stecken — kein Terminal-Übergang, kein Audit, kein Chain-Successor; erneutes complete_workflow → invalid_active_phase.
- **Root cause:** Finalisierung (Terminal-Transition + Successor-Erzeugung) läuft nur im ersten complete_workflow-Pfad; der Retry-Pfad führt nur die Operationen aus.
- **Preventive measure:** Vor complete_workflow ALLE Gates lokal vorab prüfen (check-final-review.mjs, check-index-freshness.mjs, docs-drift) und `gitnexus analyze --no-stats --force` als LETZTEN Schritt vor dem Completion-Call fahren (plain analyze short-circuitet „already up to date" ohne mtime-Refresh). Bei eingefrorener Session: canceln + frische Session statt Retry-Schleife.

## 2026-10-01 — Dual-GITNEXUS_HOME (WSL-Index vs. gitnexus-server-Container)
- **Issue:** guidance repository-analysis-Gate fragt den Container-gitnexus (:4747) ab; dessen Registry kennt das WSL-indexierte Repo nicht („No indexed repositories") bzw. „foreign" bei geteiltem .gitnexus (unterschiedliche repoPath: /mnt/d/... vs /workspace).
- **Fix (arbeitshaft):** Container mit Repo-Mount /workspace + `GITNEXUS_STORAGE_PATH=/data/gitnexus/index-thinking-mcp gitnexus analyze /workspace --no-stats` (eigenes Duplikat-Index im Volume); zusätzlich `git config --global --add safe.directory /workspace` im Container und MSYS_NO_PATHCONV=1 bei docker exec aus Git-Bash (sonst Pfad-Verstümmelung C:/Program Files/Git/...).
- **Offen:** Dauerhafte Verankerung als compose-env (GDS-7) — nur außerhalb von Guidance-Sessions ändern.

## 2026-10-01 — Handgeschriebene JSON-RPC-Payloads über file+curl: fehlende/überzählige schließende Klammern
- **Issue:** Große Guidance-Submissions (submit_understanding/submit_plan) als handgeschriebenes JSON via write_file + curl: zweimal Syntax-/Bad-Request-Fehler durch falsche Klammerbilanz am Dateiende (depth ±1) — parse errors auf Serverseite waren nicht diagnostizierbar (nur HTTP 400).
- **Fix:** Vor jedem POST Klammer-Tiefe (String-aware Scanner) + JSON.parse in WSL prüfen; ab dem zweiten Vorfall die Payload mit einem Node-Builder-Script konstruiert (JS-Objekt-Literal → JSON.stringify) — deterministisch korrekt.
- **Preventive measure:** Für Guidance-HTTP-Submissions NIEMALS hand-escapen: immer Builder-Script oder mindestens depth-Scan vor dem POST; bei HTML "Bad Request" zuerst JSON-Validität des Bodies prüfen, nicht die Server-Logik verdächtigen.

## 2026-10-01 — Composite firstAvailable stoppt beim ersten Erfolg (deps-reinstall Design-Falle)
- **Issue:** deps-reinstall als 2-Step-Composite (rm node_modules → npm install) modelliert: firstAvailable liefert nach dem ERFOLGREICHEN rm-Step zurück — npm install läuft nie; via-Label zeigte fälschlich den Clean-Step.
- **Fix:** deps-reinstall als einzelner process-Step (node -e: rmSync + spawnSync npm install, exit propagate).
- **Preventive measure:** Composite-strategies kennen: sequential/firstAvailable sind ODER-Verknüpfungen (Alternativen), keine sequentiellen Pipelines — jede Step-Kette mit "erst X, dann Y"-Semantik gehört in EINEN process-Step (sh -c / node -e) oder in einen Workflow.

## 2026-10-01 — Zero-Dependency-npm-Installs erzeugen kein node_modules
- **Issue:** Contract-Tests für deps-Ops mit dep-freiem package.json: npm install/ci succeedet, aber existsSync(node_modules)=false — Assertion "Tree installiert" schlägt trotz Success zu.
- **Fix:** Lokale file:-Dependency (deps/tiny) in das Fixture — npm materialisiert dann node_modules/tiny; Lockfile für den npm-ci-Test per echtem npm install generieren (handgeschriebene Lockfiles sind fragil).
- **Preventive measure:** npm-behavior-Tests immer mit mindestens einer (lokalen) Dependency fahren; Lockfiles generieren, nicht tippen.

## 2026-10-01 — gitnexus -32001 "Session not found": ClientManager re-initialisiert nicht, guidance-Sessions sind workflow-run-scoped
- **Issue:** repository-analysis-Gate failte mit "Session not found. Re-initialize." (-32001) auf jedem Versuch: der guidance ClientManager hält die MCP-Session-ID zum gitnexus-Server (:4747) prozessintern und re-initialisiert bei -32001 NICHT (reconnect greift nur auf Transportebene). Restart des gitnexus-Servers allein hilft nicht (die ID bleibt invalide). Ein guidance-Container-Restart (gleiches Image) löst es — killt ABER alle laufenden Sessions: "sessions are workflow-run-scoped and do not survive a server restart" (der Disk-State unter .guidance/state/sessions wird beim Boot NICHT als laufende Session wiederhergestellt).
- **Fix (arbeitshaft):** gitnexus-Server + guidance-Container neu starten (gleiches Image, kein Deploy), dann frische Session mit Replay aller Submissions.
- **Preventive measure:** Bei -32001 auf einem Downstream-MCP: NICHT retryen (wickelt sich nicht), sondern guidance-Container neu starten und frische Session starten — Submissions vorher als Replay-Script konservieren. Guidance-Phasen-Submissions sind Text — Replay ist billig, wenn Payloads als Builder-Script vorliegen.

## 2026-10-01 — index-freshness-Gate: Scratch-Dateien im Repo zählen als Quellen
- **Issue:** Der index-freshness-Gate vergleicht mtimes ALLER Dateien (auch ungetrackte) gegen den gitnexus-Index. Diagnose-/Payload-Dateien im Repo (tmp/, .us2-*.txt) machten den Index bei JEDEM complete/retry-Versuch erneut stale — Schleife aus analyze → neuer Scratch → stale.
- **Fix:** Sämtliche Session-Artefakte (Replay-Scripts, Diagnose-Outputs) ausschließlich unter /tmp (außerhalb des Repos) halten; Repo vor complete auf sauberen Tree prüfen; analyze --no-stats --force als LETZTER Schritt vor complete (plain analyze short-circuitet ohne mtime-Refresh).
- **Preventive measure:** Wie GDS-6-Lesson, erweitert um: NIE Dateien im Repo anfassen, während eine Session in complete ist — auch keine Log-/Statusausgaben dorthin schreiben.

## 2026-10-01 — DEPLOY-015 ausgeführt: Container-Gates geheilt und verschärft
- **Issue/Fix:** Nach dem Deploy wurden deps-install/deps-reinstall in die Instanz-.guidance/operations.json übernommen (Commit 0837069), `test` auf required:true gezogen. Beim Heal (npm ci im Container) zwei Fallen: (1) better-sqlite3 braucht node-gyp → python3/make/g++ mussten per apt in den Container (root); (2) npm ≥11.19 blockiert Install-Scripts per Default → `npm install-scripts approve` + `allowScripts` in package.json (versioniert, Commit 0837069). npm hat dabei die yarn.lock zerschossen (Projekt nutzt yarn 4) → restored.
- **Ergebnis:** lint + test Gates im Container grün (test: Root-Suite 43/43; Vollauf server-guidance bleibt WSL-authoritativ: 496 passed).
- **Offen (DEPLOY-015b):** Build-Tools leben nur im laufenden Container — ins Image backen oder Prebuilds sicherstellen, sonst schlägt der nächste Rebuild-Reinstall fehl.
- **Preventive measure:** npm ci in frischen Containern IMMER mit Allowlist-Check starten; nach npm-Installationsaktionen `git status` auf package.json/yarn.lock-Kollateral prüfen (npm fängt an, yarn.lock zu schreiben, wenn kein lockfile-respect greift).
