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
