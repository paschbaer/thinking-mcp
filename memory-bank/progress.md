# Progress — Thinking-MCP

> What works, what's left, current state. Update before ending a session
> (AGENTS.md → Session Termination).

**Last updated:** 2026-10-10

## What Works

- **Responses options-gate implemented (2026-10-10, feature/response-options-gate, uncommitted):** plan-phase instruction now mandates per-issue scopes + ≥2 presented solution alternatives with explicit user option decision before implementation; understand-phase lists multi-issue requests as separate scopes. Template (ConfigAssistant.buildResponses + examples/default-guidance/responses.json) and live .guidance/responses.json updated; 59/59 contract tests green, typecheck clean.
- **Open:** merge feature/response-options-gate to develop after user review; check workspace `zed` for its own .guidance/responses.json (outside this repo).

- **SRCH/S016/POSTGRES CHAIN MERGED to develop (2026-10-09, fast-forward 13a5e3c → e454e9b, all 5 stacked feature branches deleted after merge):** SRCH-1-F3 (fts_rank contract pin), SRCH-2-R3 (backend-aware memoized storage factory + idempotent/race-free adapter init), SRCH-2-R4 (async-safe storage dir creation), S016-ENV-SQLITE (container test flow, environmental confirmed by 2× full green in-container runs), live-postgres-smoke (reusable smoke script, 2× ALL CHECKS GREEN vs temp pgvector; live-found listInScope parity bug fixed). Pre-merge validation: full insight suite in-container at merge HEAD (152 passed + 4 skipped). develop ahead of origin by 21 commits — push pending (user decision). Net diff: 15 files, +803/−52 (service/factory/sqlite/postgres/tools + 3 test files + Dockerfile.test/script/README + memory-bank).
- **Open:** push of develop (user decision, known SSH-key trap); tracked follow-ups R4-REV-5 (OperationRegistry lazy mkdirSync) and PG-DEP-1 (pg@9 concurrent-query deprecation) with their triggers.

- **SRCH/S016/POSTGRES chain head COMPLETED, 5 successors queued (2026-10-09, session-0858846c, verification-only, develop @ a99c4c9):** chained workflow for SRCH-1-F3 (fts_rank contract pin, FTS-arm consumption site only), SRCH-2-R3 (memoized backend-aware storage factory for registerTools + launchSemanticWarmup), SRCH-2-R4 (async fault-tolerant mkdir in that factory), S016-ENV-SQLITE (container test flow, falsifiable AC: 2 consecutive green full in-container runs else reclassify), live-postgres-smoke (temp docker pgvector + reusable smoke script decoupled from docker). Head: 0 code changes, lint+build green, independent final review 0 HIGH/CRITICAL (all cited source facts verified at HEAD). User decisions: temp docker pgvector, option (b) container test flow, pin F3 now, run through without interruption.
- **Open (chain):** execute successors S1-S5 in order; each on its own feature branch with memory-bank follow-up resolution; S2 must verify adapter close semantics under memoization (review LOW #10).

- **MERGED: search-fix chain to develop (2026-10-09, fast-forward, branch feature/insight-search-fts-or-ranking deleted after merge):** develop 9c4550c → d7e631c (5 commits: Step 1 A+B+D fix, docs, Step 2 C semantic arm, review fix, docs). Pre-merge suite 128 passed | 4 skipped, 0 assertion failures (4 worker-exit errors = documented pre-existing flake class). Push of develop remains a user decision; insight container already runs the new image.
- **experience_search chained fix — Step 2 (C) implemented, semantic arm LIVE (2026-10-09, successor session-4ee5f200, feature/insight-search-fts-or-ranking):** node:22-slim base (glibc) + sharp rebuild fix + MiniLM model baked into the image (EMMS_MODEL_CACHE); load errors logged; query-embed dedupe; once-per-process fire-and-forget startup warmup (121 summaries in 4.1s, non-blocking); live semantic_available=true with q2 top hit = registry-trap (0.674); degraded mode (EMMS_DISABLE_EMBEDDINGS=1) verified. Chain complete after this step; feature branch ready for merge per Branch Management Rules.
- **experience_search chained fix — Step 1 (A+B+D) implemented (2026-10-09, successor session-b25dd900, feature/insight-search-fts-or-ranking):** OR-joined FTS tokens with graded bm25/ts_rank relevance (sqlite+postgres parity, SearchRow.fts_rank), scope fallback only on zero arm candidates, applicability 0.5 for all-unknown env keys with unknowns surfaced, stale = verified-but->90d with new validation.verified flag, graded FTS boost ≤ EMMS_FTS_RELEVANCE_BOOST. Regression tests with the three live fixture queries 6/6; parity tests 5/5; q2 top hit = chain-step-workflowid-registry-trap confirmed. Step 2 (C: slim base, baked MiniLM, warmup, semantic arm) queued as chain successor.
- **experience_search chained fix workflow STARTED (2026-10-09, head session-e395b193 COMPLETED):** Diagnosed live defect (identical 20 oldest episodes, flat 0.25 relevance for every query): FTS5 implicit-AND over quoted tokens kills multi-token queries; unconditional listInScope fallback makes every episode a candidate; uniform scoring (applicability=1.0 for env-unknown, stale penalty for never-verified) → identical 0.25. Semantic arm dead: node:22-alpine (musl) cannot load onnxruntime-node glibc prebuilt (reproduced in-container; swallowed catch). Chained workflow started (workspace thinking-mcp): head = verification-only (plan persisted in chainSpec steps, zero code changes, all gates green, 2 lessons seeded: fts5-implicit-and-kills-multi-token-queries, alpine-musl-onnxruntime-glibc-mismatch); successor Step 1 session-b25dd900 ACTIVE = options A (FTS OR + bm25 graded ranking, sqlite+postgres parity) + B (fallback taming) + D (applicability 0.5 neutral-unknown, verified:false field, weight recalibration); Step 2 queued = option C (node:22-slim base, baked MiniLM model, load-error logging, query-embed dedupe, fire-and-forget startup warmup, combined weight calibration). User decisions F1 slim / F2 bake / F3 warmup / F4 2-step chain / F5 scoring semantics recorded in both step requests.
- **Open:** Complete Step 1 review+completion; then Step 2 (C); rebuild insight container after Step 2 and live-verify semantic_available=true on :3002.

- **specs/018 Phase 0 (M0) COMPLETE (2026-10-07):** User approved all M0 proposals unchanged → decision record **DEC-GBEA-M0** in `memory-bank/decisions.md` (ADR-1 CLI-only transport / ADR-2 32 KiB + baseline caps / ADR-3 better-sqlite3 WAL, co-located multi-instance / ADR-4 startup+poll sweep, no new config keys / ADR-5 polling-only / ADR-6 `guidance.canonical-json/v1` integers-only / ADR-7 no pruning v1, append-only + nightly digest export / ADR-8 `>=1.3.0 <2.0.0` gated widening; Ed25519 proof signing with SQLite nonce store; `executionBackends.beads` absent→disabled default). M0 docs ACCEPTED (adr-proposals, implementation-contract binding for AC-A3, beads-v1.3-baseline binding for mapping v1/golden). T001–T005 done; ⏳ADR tasks unblocked; WP-01 ready.

- **specs/018 tasks.md created (2026-10-07, `specs/018-guidance-beads-execution-adapter/tasks.md`):** speckit.tasks output completing the SDD trilogy (spec/plan/tasks): 74 tasks T001–T074 across phases M0–M5, 1:1 mapping of every plan task (WP-00..WP-10), each task carries `[WP-x.y]` back-reference, RFC §-anchor, and a `Verify:` gate (RFC §26 suite / §25 criterion); ⏳ADR gates on T013/T024/T066; batching guidance (store cluster T024–T028 as one batch); completion gate = RFC §29 DoD; baseline-aware testing + GBEA-F016 deferral noted.

- **specs/018 plan.md created (2026-10-07, `specs/018-guidance-beads-execution-adapter/plan.md`):** speckit.plan output for spec 018: 11 work packages (WP-00 decision gate M0 + adapter core / mapping engine / bindings / projection / claim coordination / validation workflow / reconciliation / snapshots / observability / testing), 60+ tasks with RFC §-anchors, deliverable-ID mapping (D-01..D-27), MUST/SHALL compliance matrix (every RFC §4–§29 area owned by exactly one package), mermaid dependency graph with milestone mapping M1–M5, ⏳ADR markers for ADR-dependent tasks, verification lines per package tied to RFC §26 suites and §25 criteria, branch/review/gitnexus gates per AGENTS.md, DoD = RFC §29.

- **specs/018 GBEA implementation spec created (2026-10-07, `specs/018-guidance-beads-execution-adapter/spec.md`):** speckit.specify output translating RFC GBEA-SPEC-001 v0.6.1-draft into an implementation project: scope S1–S6 (port/canonical types, Spec-Kit ingestion delta, Beads adapter, governed execution services, persistence, test infra), milestones M0–M5 (M0 = ADR 1–8 + implementation contract + proof-signing decisions; M1–M5 map 1:1 to RFC §27), deliverables D-01..D-27, AC traceability to RFC §25.1–25.7 plus additive AC-A1..A4 (disabled-default invariance, fail-closed config validation, per-method contract coverage, §21.1 query-pattern conformance), all ten RFC §26 test suites mapped to concrete vitest layers incl. mandatory split-brain and scale tiers, rollout R0–R5 behind `executionBackends.beads.enabled: false` with config-only rollback (RFC §4.1). RFC precedence clause; no architecture redesign, no normative restatement.

- **GBEA-SPEC-001 review round 5 (READY FOR IMPLEMENTATION WITH MINOR CHANGES, overall 9.6/10) applied → v0.6.1-draft (2026-10-07, SDD):** All prior Criticals confirmed resolved by reviewer. Of 8 remaining findings: 6 fixed (`fencingToken` added to `BlockerReport` — normative text existed since v0.6.0 but the interface field was missing; `ReadyWorkResult` + `backendInstanceId`/`mappingVersion`; duplicate `expectedRevision` removed from `ClaimWorkRequest`; §23.1 legacy state names updated to `backendClosureState RETRYING`/`acceptanceState VALIDATING`; `acceptanceDigest` canonicalization/hash/validation defined in §15.4; header metadata converted to bullet list), 2 classified no-fix with evidence (M-002 mermaid fencing already correct at §3.2 L59-72 — reviewer tooling artifact; M-006 capability profiles match the documented §28 deferral).

- **GBEA-SPEC-001 external review round 4 (CHANGES REQUIRED) fully applied → v0.6.0-draft (2026-10-07, SDD):** All 24 findings (C-001–C-004, H-001–H-009, M-001–M-011) resolved in one round per user decisions. Key changes: §11.5 signed `AdapterAuthorizationProof` (decision vs. verification authority split; replaces soft execution token; §20.7 hardened); §11.6 `BackendClaimMarker` + `claimCorrelation` capability (native/metadata-cas/single-writer-only/unsupported, fail-closed); §15.3 rewritten as orthogonal `acceptanceState` × `backendClosureState` vectors (resolves the BACKEND_CLOSING state-vs-operation contradiction; CompletionState/Receipt/§9.6.7 updated); §21.3 `DurableBackendOperation` journal (PREPARED→DISPATCHED→OUTCOME_UNKNOWN→CONFIRMED→FINALIZED/REPAIR_REQUIRED); fencing tokens extended to progress/blocker reports; blocker lifecycle REPORTED→…→RESOLVED/SUPERSEDED + `guidance.blockers.*` methods; `guidance.adapters.resolve_drift` + DriftFinding identity (findingId/Revision/state); normative `AcceptanceReceipt` type; `originPackageDigest`/`currentPackageDigest` split (resolves amendment-vs-immutability conflict); accepted-work semantic immutability; per-candidate `candidateRevision` + mandatory claim revision guard; adapter methods renamed (`closeAcceptedWork`/`recordCompletionRejection`); structured `AmendmentRequest`; shell-free `verificationCommand`; `sha256:<hex>` digest format; §6.8 timestamp/clock rules; claimReportSequence/executionSequence disambiguation incl. cursor fields + retentionEpoch/archiveLocator; checkpoint bound to backend identity/versions; staged publication + `batchTransaction` capability; execution-closure preconditions; M-010 capability profiles deferred with rationale in §28.

- **GBEA-SPEC-001 external review round 3 (v0.4.0 findings) applied → v0.5.0-draft (2026-10-07, SDD):** All six F-findings resolved per user decisions: §19 extended with `NegotiatedCompatibility` + init-time fail-closed backend-version-range check (new config `transport.supportedBackendVersionRange`, ADR 8 narrowed); §9.7 Mapping Migration Procedure (10 steps, receipts stay immutable — verification gains compatibility rules); `policySetDigest` added to package governance, receipts, readiness results, and validation persistence (§15.2); snapshot hash chaining as SHOULD with explicit partial-tampering caveat + external anchoring recommendation (§18.2); acceptance receipts MUST bind to their `work.completion.accepted` event (user chose Variant A event-binding over full receipt chain; `CompletionAcceptance.acceptanceEvent` added); §21.2 normative scalability targets (100k items) with partitioning deferred as tracked follow-up GBEA-F016 in remaining-work-plan.md. M-001/M-002 editorial restructuring deferred to v1.0 pass (noted in §28).

- **GBEA-SPEC-001 v0.4.0 review + fixes → v0.4.1 (2026-10-07, SDD):** Reviewed the externally revised v0.4.0 draft (13 findings: 2 blockers, 6 major, 5 minor) and applied all fixes; old spec file replaced by the corrected one under the canonical name `SDD/guidance-beads-adapter-specification-en.md`. Blocker fixes: status mapping `CLOSED → done` corrected to `closed` (Beads `done` is a status CATEGORY, not a status — verified via `bd statuses` CLI reference); backend-instance identity now derived from the canonical `.beads` STORE root instead of the workspace root (worktrees/`BEADS_DIR` shared stores previously got distinct identities for one claimable store → double-claim risk). Also: `issueType` union cleaned (`gate`/`chore` removed), round-trip exception for virtual approval gates, 4 stale ADR refs fixed after renumbering, `validationRetryAttempts` semantics defined, `fencingToken` required in ClaimWorkRequest, new §6.7 operational work states underpinning §9.6.7, metrics list extended, §23.1 completed, shared-store test criterion added.

- **GBEA-SPEC-001 external review round 2 + fixes (2026-10-07, SDD):** External reviewer findings verified against v0.2.0 (F2/F5 partially pre-fixed, F1/F3/F4/F6 valid); all six resolved → v0.3.0-draft. New: §9.6 normative Canonical→Beads mapping (`BeadsProjectedItem`, type/priority/label/dependency tables, metadata namespace `guidance` with 32 KiB limit, evidence by reference, round-trip requirement) grounded on verified Beads v1.3 docs; §18.1 Event Ordering Model (global: none / per-execution: total / per-claim: monotonic; causationId semantics; late-report drop rule); §21.1 technology-neutral Persistence Requirements (Option A — ADR 4 selects tech); §6.6 Schema Versioning and Compatibility; §11.3 lease restart semantics; §16.4/16.5 suspension scopes (item/subtree/execution). ADRs 2/4/5 narrowed accordingly. Also fixed a stray code fence in §18 from the previous edit round that hid §19 from outline parsing.

- **GBEA-SPEC-001 spec review + fixes (2026-10-07, SDD):** Full review of `SDD/guidance-beads-adapter-specification-en.md` (13 findings: 1 blocker, 6 major, 6 minor) and all fixes applied in the same session → version bumped 0.1.0-draft → 0.2.0-draft. Key changes: acceptance revocation removed entirely (user decision: Option A — final receipts, reopen only via amendment); §15.3 completion state machine rewritten with explicit transitions, validation timeout, bounded closure retries (`maxClosureAttempts`); §8.2 authorization states completed (SUSPENDED resume path, terminal states); §8.3 normative canonicalization requirements (ADR 7 selects algorithm only); §9.3 stale-package check + new `STALE_PACKAGE` error code; §11.1 orphaned-claim crash-safety requirement; §16.5 drift resolution procedure; §20.1 direct agent access upgraded SHOULD→MUST; §23 config semantics (stealth mode defined from verified Beads docs, `capabilityProbeIntervalSeconds`, closure bound); Appendix A added with all previously undefined shared types. Beads references verified online (repo active, docs v1.3.0). Open: none from this review; ADRs in §28 remain for the implementation project.

- **MCP HTTP keep-alive timeout 65 s (2026-10-02, feature/mcp-keep-alive-timeout):** Root cause of all "connection stalls/breaks off" symptoms — Node ≥19 default `keepAliveTimeout=5000 ms` → `Keep-Alive: timeout=5` in all four MCP HTTP servers. Fix: `server.keepAliveTimeout=65000` (env `KEEP_ALIVE_TIMEOUT_MS`) + `headersTimeout=+5s` in clear-thought/guidance/insight/stochasticthinking. Independent review (sub-agent, fresh context): APPROVED 0 HIGH/CRIT (Node-24 header repro + shutdown repro + tsc per server). Fast-forward merge to develop (1677a9d), branch deleted. Follow-ups KA-1/2/3/4 tracked in remaining-work-plan.
- **Open:** Push develop (user decision, ahead 6); container rebuild (`docker compose up -d --build`) + live counter-check `curl -sI .../health` → `timeout=65`; KA-4: `gitnexus analyze` aborts with storage status `foreign` (index refresh blocked, ownership to be clarified).
- **registry_register default-ON + profile binding removed (2026-10-02, feature/registry-register-default-on):** FR-1207 gate is now opt-out (`registryRegister.enabled: false`), `registry_register` independent of profile (registration = instance concern, workflow type = per session); both templates emit `enabled: true`; README updated; review APPROVED 0 HIGH/CRIT. Fast-forward merge to develop (283fc74..39a0be2, 5 commits), branch deleted. LOW follow-ups REV-RRDO-1/2 (coverage) closed in 9f7bc5f, FR-FINAL-2 (AGENTS/CLAUDE CLI tables) committed; guidance session session-1bb0632b completed (all gates green). Full run 537/537.
- **Open:** Push develop (user decision, ahead 5); container rebuild until `registry_register` is visible in the running instance.

- **Guidance container deployment (2026-09-30)**: Start crash (EACCES
  mkdir '/workspaces/.guidance') fixed — outdated container with wrong
  mount (`/mnt` instead of `D:\repos`) replaced via `docker compose up -d
  --force-recreate` from `servers/server-guidance`; `/health` green
  (`configured:true, reachable:true`), old container + relic volume removed
  via `docker rm -v`. Start discipline rule documented in AGENTS.md
  (Guidance section), lesson in lessonsLearned.md (2026-09-30).

- **Config assistant generic patterns (2026-09-28, guidance session
  session-2c0c15fe, branch feature/config-assistant-generic-patterns,
  UNcommitted)**: Niyama root cause fixed — the FRESH generator
  hardcoded the Thinking-MCP prettier glob as a lint op; now `npm run lint`
  (non-blocking). Adopt classification: preset ops are ALWAYS regenerated
  from the target fresh template (divergent ref args → loud
  REGENERATED note), only non-preset ops are copied with `[adopted]` marker;
  builtin sync test pinned. README genericity rule documented.
  Validation: 57/57 targeted, tsc clean, guidance suite 429/429; build gate
  green; lint/test gate fails classified as pre-existing (prettier drift TMPL-1)
  or environment-related (better-sqlite3/musl, TMPL-2).
  Independent review: 0 HIGH/CRITICAL.
- **Niyama blocker documented (2026-09-28, NIY-CFG-1/2/3)**:
  session-46a43aeb cancelled as infrastructure-blocked; container fixes
  (lint glob in verification config, pnpm/musl store) tracked.

- **Small items L256/L257/L253 (2026-09-26, guidance chain session-3b7f96a5,
  committed as `60b2eddf` on develop)**: L256 FTS coverage —
  observations_fts (insert trigger + count-guard backfill, 500-character cap),
  searchFullText matches both indices with dedupe (7 regression tests);
  L257 Postgres FTS parity — to_tsquery over goal_summary +
  observations excerpts, LEFT JOIN signatures, GIN expression indices
  (5 SQL contract tests; live smoke test tracked); L253 closed as obsolete
  (user decision). 118/118 tests + tsc + build green; 2 independent reviews
  APPROVED 0 HIGH/CRIT; 2 lessons seeded; tracked follow-ups F1/F2/F4–F6
  + index-freshness race with parallel work in remaining-work-plan.

- **CHN series complete (2026-09-26, 4 guidance workflows + overall review,
  develop @ `7cb55be`)**: CHN-1 activating recovery via retry_operation
  (`17cdf15`), CHN-2 dogfooding chain.enabled + image lockstep (`49a18bc`),
  CHN-3 mixed manifests spec v1.1 §12/FR-119 incl. HIGH-1 fix (`52538c3`),
  CHN-4/5/6 chain_end audit + crash cache + fresh start guidance
  (`bb37f6c`), CHN-R2-2 test gap (`7cb55be`). 251/251 tests, build green;
  final review: 0 HIGH/CRITICAL, ready to merge. Develop ahead 6 (push by
  user). Tracked open: CHN-R2-1/3/4 (accepted), CHN-7.
- **Workflow-Chaining-Spec APPROVED (2026-09-25)**:
- **Workflow chaining implemented (2026-09-25, `feature/workflow-chaining`,
  guidance session `session-802f2c91…` → completed)**: Amendment 002
  (Form A explicit steps + Form B `spec_kit_tasks`) per FR-110…FR-118 —
  chain schema in `start_workflow`, lazy successor creation in
  `completeWorkflowLocked` (Q2 head copy), `activating` fail-closed against
  the crash window (plan review F1), `specKitTasks` engine deps bridge,
  chainTaskScope guidance (FR-118), chain.* templates fail-closed (Q1).
  243/243 tests (10 new chain tests, spec §10.1–10.11), build green,
  detect_changes scope-clean, index fresh. Docs: README section
  "Workflow Chaining" (plain- + spec-kit example). Follow-ups: CHN-1…CHN-3
  (remaining-work-plan). Verify gates lint/test failed with pre-existing
  container caveats (required:false; native suite green).
- **Workflow-Chaining-Spec APPROVED (2026-09-25)**:
  `specs/002-guidance-workflow-server/amendments/002-workflow-chaining.md`
  (Layer 1: `chain` manifest, lazy successor creation, `nextSessionId`-
  response, FR-110…FR-118; Q1–Q3 locked, Q3 revised: Form B in the
  spec-kit profile). Implementation see above.
- **Guidance working sample documented (2026-09-25, `842cd3c` + `b91054a`)**:
  First attempt in the root README reverted (wrong place + German text);
  final version in `servers/server-guidance/README.md` (English): workspace
  path caveat (`workspaceRoot: "/workspace"` with Docker), Zed
  `context_servers` snippet, config file map, **step-by-step walkthrough of
  all 7 phases**
  (instruction, submission schema, transitions, gates), operating notes and
  example prompts.
- **First productive guidance workflow run end-to-end green (2026-09-25)**:
  Session `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` → **completed**.
  All phases (understand → plan → review → implement → review-fix →
  verify → complete) passed; `build` gate green (after container deps
  install), `repository-analysis` gate green (GUID-1 closed). Scope:
  README quick-start improvement (docs-only). Detected bugs: ESM `require`
  (fixed `5316c88`), template placeholders (workaround active, GUID-3 open).
- **Guidance Zed setup (2026-09-24, `feature/guidance-workflow-setup`)**:
  `.guidance/` in the repo root (plain, standard flow), compose override with
  repo mount + isolated node_modules volume, gates configured (lint/test/
  repository-analysis `required:false` with documented container caveats).
  Container verification: `/health` configured:true, `/mcp` 200.

- **Root README user-first (2026-09-16, `6ddba51` + `dd2e00d`)**: Quick Start,
  toolset overview, agent guide/skill generator docs, Docker MCP HTTP config
  (`/mcp` endpoint verified in code); dev/maintainer docs via reference to
  the server README. Entry point now contains all user info.
- **Release 2.0.0 prepared (2026-09-16)**: Server merge implemented and on
  develop (`1bed87e` + `039c7e3` + review fixes `df0a84a`); version bump to
  **2.0.0** (package.json + factory ServerInfo, branch `feature/release-2-0-0`,
  typecheck green). Open: PR `develop → main` + publish (user), then MG-1
  (deprecation stochastic + pipeline cleanup); GitNexus re-index after repo
  move pending (index registered under old path).
- **Eval Run 5 (2026-09-15, Hard Set + EV-8 countermeasures)**: **98,8 % vs. 74,4 %** —
  3 of 4 tasks perfect (Fault-Tree 40/40 Δ+16, Bandit 40/40 Δ+22, Fermi 40/40 Δ0,
  Game 38/40 Δ+1). The EV-8 fixes eliminated both Run-4 error classes: no
  more schema flailing (3 rounds instead of 6), fermi_estimate used correctly. The bandit
  actor corrected itself (wrong epsilon-greedy → thompson 80+60, regret 16.140 ✓).
  Result series Run 3→4→5 (server %, weighted recalculated): 92,5 → 86,9 → 98,8 — Run 4 was the schema-flailing dip, EV-8 closed it. Rig development complete;
  the result series documents the tool-value thesis: the compute gap determines tool value.
- **Eval Run 4 (2026-09-15, Hard Set, hardened rig: operator prompt/tool-call log/weighted scoring)**:
  Aggregate 86,9 % vs. 80,0 %. **Bandit 18→40/40 (Δ +22) and Fault-Tree 36→40/40 (Δ +4)** —
  full score where tools compute exactly what the model cannot. Game-Matrix −6
  and Fermi −9: the tool-call log shows two new error classes — (a) schema flailing (4×
  payoff_matrix as strings instead of {row,col} objects, budget burned), then over-
  reliance on the full-game dominance output instead of the 2×2 subgame; (b) wrong tool choice
  (fermi_estimate skipped, VoI fed with sensitivity data, monthly total presented
  as annual total). **Thesis validated: tool value = f(compute gap)** — large for
  seeded state/enumeration, negative where the model is already strong solo and transcription
  creates new error surfaces.
- **Eval Run 3 (2026-09-15, HARD SET, glm-5.3-flash Actor [thinking:disabled] ↔ glm-5.3 Judge)**:
  first complete hard-set run — **bandit task Δ +11 (5→16/16, full)**: the baseline
  structurally cannot fake seeded cumulative numbers, the actor did the runId continuation
  exactly (regret 16.140). Fault-Tree Δ +2 (14→16/16: the tool delivers basic event
  contributions exactly).
  Game-Matrix Δ −4 (16→12): the actor mangled a payoff during tool-call transcription
  (col 5 instead of 2) → dominance criterion 0. Fermi/VoI Δ 0 (both 16/16, ceiling).
  Aggregate: server 60/64 vs. baseline 51/64 (raw 16-point scale). Infra lessons:
  streaming reassembly + thinking control per role (actor disabled — reasoning loop
  >6 min/2.8 MB; judge enabled), attempt-scaled timeouts, .env loader.
- **RELEASE 1.0.0 (2026-09-15)**: PR `develop → main` merged (branch protection),
  pipelines green — **npm 1.0.0 via OIDC Trusted Publishing** (tokenless, provenance),
  ghcr images 1.0.0, Smithery re-publish with snake_case names. Contents: snake-case rename
  (BREAKING, 12 tools), recipe runner briefings with example_arguments + result_guidance,
  LLM task evals (E3 Tier 2), Tier-1 contract evals, risk family (B1), B2–B5,
  D1–D3, Real Computing. 129/129 tests. npx smoke verified (45 tools new names,
  recipe_runner briefing, prompts).
- **Eval Run 2 (2026-09-15, glm-5.3 as actor+judge, corrected rubric)**: all tasks
  Δ = 0 — the baseline catches up strongly (42/120 vs. 25/120 in Run 1), tools used
  correctly (recipe_runner navigation across stages, fermi_estimate, value_of_information) but
  no score gain with a strong model. Methodology insight: tool value depends on
  actor strength and task difficulty; harder tasks + stateful flows (bandit
  runId) + possibly a weaker actor needed for differentiating measurements. Same-
  model judge bias remains a confounder.
- **Naming rename + 1.0.0 (2026-09-15, branch `feature/track-b2-b5`→develop)**: all 12
  compact tool names unified to snake_case (`sequential_thinking`,
  `mental_model`, …) — breaking, version 1.0.0. ~200 references replaced across src/tests/guides/
  READMEs; sync chain regenerated; verify the Smithery naming score effect at the next
  rescan (direction was ambiguous — revert via git possible).
- **Roadmap track E3 Tier 2 — LLM task evals (2026-09-15, branch `feature/llm-evals`)**:
  `evals/run.mjs` (OpenAI-compatible, env-driven) runs per task **with/without** server
  (MCP stdio client + tool loop) and evaluates both answers via an LLM judge against
  weighted rubrics; report as JSON+Markdown in `evals/results/`. 3 example tasks
  (risk analysis, postmortem reasoning, guided decision). Runs manually only
  (`npm run eval:llm`), never in CI. No live run yet (API key with the user).
- **RELEASE 0.3.0 (2026-09-14)**: `develop → main` via PR (branch protection active),
  GitHub Actions release pipelines green: **npmjs.com — `@paschbaer/clear-thought@0.3.0`
  via OIDC Trusted Publishing** (tokenless, provenance badge, Sigstore transparency log) —
  after the 3-ring debug (account 2FA mode → package access option → TP stage permission,
  see lessonsLearned); **ghcr.io images** `clear-thought` + `stochasticthinking` with
  latest/0.3.0/sha tags. Registry-verified (`npm view`, npx smoke to follow).
  0.3.0 contents: risk family (B1), argument map/causal/Fermi/game matrix (B2–B5),
  recipe runner + workflow toolset (C), session resources + prompts + persistence (D1–D3),
  session_export bugfix, factory config parse fix. 129/129 tests.
- **Roadmap track D (2026-09-14, branch `feature/track-d`, 0.3.0)**: D1 session resources
  (`clear-thought://session/{stats,export,thoughts,workflows}` via `registerResource`),
  D2 workflow prompts (6 recipe prompts via `registerPrompt`, one user message each with
  recipe_runner instruction), D3 file persistence (`session_save`/`session_load` in the session
  toolset, `dataDir` config, path sanitizing). **Found a latent factory bug in the process**:
  unparsed config → `sessionTimeout` undefined → an immediate cleanup timer emptied the store
  between tool calls — the factory now parses defensively (`ServerConfigSchema.parse`).
  129/129 tests (8 new track-D tests).
- **Roadmap track B2–B5 (2026-09-14, branch `feature/track-b2-b5`, 0.3.0)**: four new
  stateless analysis tools in the `reasoning` toolset — `argument_map` (Toulmin completeness
  with guiding questions, 6 elements), `causal_graph` (dual-mode: intervention/counterfactual
  questions, confounder + root candidates, cycle/unknown-refs validation), `fermi_estimate`
  (multiplication/sum chain + sensitivity ranking, deterministic), `game_matrix`
  (strict dominance, best responses, pure Nash, mixed 2×2 closed-form). 10 new
  hand-verified tests (PD-Nash, Stag-Hunt 2×Nash + mixed 0.5, Fermi sensitivity
  ±20 % > ±10 %); 121/121 tests, audit 43/43 clean.
- **Roadmap track B1 — risk family (2026-09-14, branch `feature/risk-family`, 0.2.0)**:
  three new dual-mode tools — `premortem` (failure-cause ranking + mitigation coverage),
  `fmea` (RPN = S×O×D with threshold flagging), `fault_tree` (exact AND/OR evaluation +
  contribution ranking of the basic events) — plus new `risk` toolset (5th toolset).
  Registry metadata for all 37 entries; 103/103 tests. Hand-verified values:
  FMEA RPN 120/40/24, fault tree P_top 0.314 with B3 dominance.
- **Roadmap track C — recipe runner (2026-09-14, branch `feature/recipe-runner`, 0.3.0)**:
  all 6 guide recipes as data (`src/recipes/index.ts`), `recipe_runner` with
  per-session progress in the new `WorkflowStore` (start/status/advance/reset/list,
  auto-start), `workflow` toolset (6th toolset). Guide + root AGENTS.md triple
  synced; 111/111 tests (8 new workflow tests), audit 39/39 clean.
- **CI/CD release flow (2026-09-14, branch `develop`)**: GitFlow-light — `develop` is the
  development branch (test action runs there + on PRs), releases merge `develop` → `main`;
  on `main` `publish-npm.yml` (npmjs.com, version-guarded, --provenance) and
  `publish-containers.yml` (ghcr.io, latest+version+sha tags, HTTP server images port 3000) publish.
- **E-plan Phase 3, Tier 1 (2026-09-14, branch `feature/eval-harness`)**: contract evals in
  `tests/contracts.test.ts` — dual-mode sweep (concept_map/fishbone_diagram/issue_tree, which
  were previously untested), toolset parity (individual ≡ toolset across reasoning/visualization/utility/
  session) and session accumulation. **Directly found a shipped bug**: session_export with
  advertised outputSchema threw `-32602` (structuredContent missing for array/markdown payloads) —
  fixed in 0.1.2 (explicit structuredContent in the handler). 96/96 tests.
- **npm publish (2026-09-14, E-plan Phase 2)**: `@paschbaer/clear-thought` (currently
  **0.2.0** incl. risk family, manually published after the 2FA mode change) +
  `@paschbaer/stochasticthinking@0.1.1` live on npmjs.org (registry-verified,
  npx-ready; bin-guard fix `0c6daca` — 0.1.0 was a silent no-op via npx
  because bins run through .bin symlinks). READMEs document npx-based MCP
  client configs; npm-12/GAT-deprecation auth strategy recorded in the plan.
- **Shipping round 2026-09-14**: `main` pushed (head `94be80c`) — CI
  `test.yml` ran GREEN in Actions (RB-7 residual resolved). Clear-thought
  re-published to Smithery AFTER the RB-10 metadata merge: registry-driven
  titles/typed output schemas/honest hints now live in the registry release
  (rescan score pending). RB-10 code gap closed on main: TOOL_METADATA
  registry (33/33), central loop parametrized, 84/84 tests incl. 6 new
  metadata tests + audit script.
- **Real Computing (2026-09-13, feature branch
  `feature/real-computing-stochastic`, commit 0d33ead)**: all five stochastic
  algorithms compute measured results — mdp value iteration (hand-checked
  V=[9,10] toy problem), mcts UCT gridworld (corridor → "right"), bandit
  with per-session runs via runId + measurable regret, hmm Viterbi/
  forward-backward (known weather path), bayesian GP-RBF + EI (proposes the
  quadratic maximum at x≈2.0). 41/41 tests, typecheck/build green; guide
  chain (template ↔ constant ↔ root AGENTS.md ↔ README) and functional test
  updated to the new semantics.
- `server-clear-thought`: ~28 reasoning tools registered individually and via
  4 toolsets (`reasoning`, `visualization`, `utility`, `session`).
- `server-clear-thought` hygiene (2026-09-12, branch
  `fix/clear-thought-hygiene`): dev.ts guard hardened (pathToFileURL;
  `npm run dev` verified — drvfs cold start can take >20 s), npm bin → stdio
  entry (`dist/dev.js`), README install path corrected (RB-6 closed); 78
  tests green.
- Session state with per-domain stores; `session_info` / `session_export` /
  `session_import` for persistence.
- vitest test suites in `servers/server-clear-thought/tests/` (incl.
  `agents-guide` template-sync test).
- `agents_guide` tool generates project `AGENTS.md` (full + merge modes,
  marker-based in-place updates).
- Docker + Smithery packaging for clear-thought; yarn/npm workspaces build.
- GitNexus code index (`thinking-mcp`), analyzed with `--no-stats` convention.
- Root `AGENTS.md` + `memory-bank/` governance structure.
- `server-stochasticthinking`: rebuilt to the clear-thought HTTP architecture
  (merged to `main`) — session factory + zod config, Streamable HTTP server
  (port 3001, `/health`, graceful shutdown), stdio dev entry, `agents_guide`
  tool (full/merge), vitest suite (24 tests incl. agents_guide), live
  functional test (6 checks), Docker image built and runtime-verified (RB-4
  closed: healthy container, full MCP round-trip on mapped port 3002).

## What's Left

- Extension roadmap (`plans/extension-roadmap.md`): **A ✅ B1–B5 ✅ C ✅ D1–D3 ✅
  E1–E3 ✅ — roadmap fully worked off (Release 1.0.0, 2026-09-15).**
  Remaining optional items: D4 (sampling), orchestrated recipe runner
  (in changed form, deliberately deferred — the guidance form is in).
  Naming: 4.44pt despite rename (hypothesis falsified) — accepted, no
  further breaking rename.
- Optional (done, pending rescan): tool-name de-snake-casing executed in 1.0.0
  to close the Smithery Naming gap (~4pt, see RB-9-history) — the breaking
  major version.
- Optional RB candidate: shared workspace HTTP scaffold for both servers
  (decisionframework option C, deferred).
- Periodic refresh of the GitNexus index after larger refactors
  (`gitnexus analyze --no-stats`; note: the GitNexus MCP server in the
  2026-09-13 session could not load the rebuilt index — CLI works).

(Stale entries removed 2026-09-13: stochastic McpServer migration — done via
RB-11; RB-5 — resolved; resolutions recorded in `remaining-work-plan.md`.)

## Current State

Stochastic HTTP-MCP is merged, pushed, deployed and docker-verified (live on
port 3001 with both tools). **Published to the Smithery registry with a perfect 100/100 quality score** (rescan 2026-09-13); clear-thought followed on 2026-09-13 (paschbaer/clear-thought, 33/33 tools registered, capability round shipped 2026-09-13: annotations/outputSchemas/param
  descriptions for all 33 tools; release 4b0dfb6a; rescan pending, expected
  ~96/100). Migrated to the high-level McpServer API (RB-11 resolved:
  zod single-source validation, declarative registration, 24/24 tests,
  release 381e940e)
(`paschbaer/stochasticthinking`, stdio bundle distribution — verified
download-only via API, 1 connection exists, 2026-09-12). **`main` pushed
2026-09-14 (head `94be80c`) — CI `test.yml` green (RB-7 residual resolved);
clear-thought re-published with the RB-10 metadata registry — rescan
96/100 (2026-09-14): RB-10 CLOSED.** Resolved: RB-4, RB-5, RB-6, RB-7, RB-8,
RB-9, RB-10, RB-11. Real Computing merged (`80be3d1`). **E-Plan Phase 2
done: both servers live on npm at 0.1.1** (Phase-2 branch
`feature/npm-publish` pending review/merge). Next: E-plan Phase 3 (eval
harness) per `plans/quality-distribution.md`.

- 2026-09-15 (server merge, added later via terminal append): merge
  stochastic → clear-thought implemented on `feature/merge-stochastic-into-clear-thought`
  (phases 0-5 of the plan) — algorithms as toolset `stochastic`
  with unchanged tool name `stochasticalgorithm`, BanditRunStore in
  SessionState, recipe 7 `decision-under-uncertainty` + stochastic stage in
  `architecture-decision`, 7th prompt, consolidated guide (root AGENTS.md
  regenerated via the real handler), READMEs migrated. Targeted tests 30/30 + 18/18
  green; typecheck green; full suite locally under drvfs hit worker timeouts
  (CI authoritative). Open: Phase 6 (release 1.1.0 + deprecation, MG-1).

## 2026-09-18: EMMS MVP (server-experiencememory)
**What works:** Complete capture->validate->finalize cycle; hybrid retrieval (exact/normalized hash, FTS5, env applicability with D6 penalties); guidance envelope on every response; redaction + content-addressed artifacts; visibility isolation; optimistic concurrency; idempotency; audit; SC-001 baseline harness with 30-task corpus. 58/58 tests green.
**What's left:** T045 detect_changes + commit (waiting for approval); golden-results.md manual runs; lessonsLearned entries.
**Current State:** MVP functionally complete on branch 001-experience-memory-server.

UPDATE 2026-09-18 (2): T045 gitnexus analyze --no-stats executed (2425 nodes/5562 edges). T046: suite 58/58 + typecheck OK; only reviewer-manual parts still open (quickstart G1-G3 live, spec-quality checker marks, approval).

UPDATE 2026-09-18 (3): T046 COMPLETED. Golden paths G1-G3 + additional scenarios automated (tests/fixtures/golden-g1-g3.test.ts), 21/21 PASS, overall suite 59/59. Service improvement: environment_fact JSON now populates env dimensions for applicability ranking. Commits: 78c1170 (MVP), c6f9048 (golden paths). 48/48 tasks done. Branch 001-experience-memory-server finished; merge per strategy (squash to main / rebase to develop) rebase onto develop completed (fast-forward).

UPDATE 2026-09-18 (4): SEMANTIC RETRIEVAL ARM ACTIVE. @xenova/transformers (all-MiniLM-L6-v2, quantized, 384 dims, local/offline) via lazy load; embeddings cached per episode; D6 weight 0.24; graceful degradation without provider. 63/63 tests (4 new contract tests: vector properties, paraphrase retrieval, degradation). Commit 6c290ad on develop (via ff-merge feature/emms-semantic-retrieval).

UPDATE 2026-09-18 (5): DOCKER DEPLOYMENT (analogous to server-clear-thought). Dockerfile (node:22-alpine, non-root, healthcheck :3002, native better-sqlite3 rebuild in the image), docker-compose with persistent emms-data volume, .dockerignore, EMMS_STORAGE_PATH env fallback in resolveConfig. Build + live smoke via HTTP (StreamableHTTPClientTransport): 16 tools, workflow.start with guidance. Fix during testing: default store moved into the volume (node user could not open the root-owned path). Commits: ec25fa7, 8859a3e, aa11a2c.

UPDATE 2026-09-18 (7): POSTGRESQL+PGVECTOR ADAPTER (D, team phase). Decision (clear-thought decision_framework, 3 iterations): Option A — lazy dynamic import, pg as runtime dep (loaded only with the Postgres backend), SQLite remains default. PostgresAdapter implements the full StorageAdapter contract (schema parity, embeddings as vector(384) via pgvector). Backend selection via EMMS_STORAGE_BACKEND=postgres + EMMS_PG_CONNECTION_STRING. Migration path: migrate-to-postgres.ts (one-shot CLI, all tables + env dims + vector embeddings, rawUpsert helper). 66/66 tests, typecheck green. Commit 6b3e539, merged onto develop.

UPDATE 2026-09-18 (8): LEVEL-2 AUTOMATION ACTIVE. Trigger-domain table (7 domains -> search keywords) added to AGENTS.md + CLAUDE.md; experience_search with scope thinking-mcp-lessons at task start in trigger domains; follow hits + reuse_feedback; new traps via seed-lessons.mjs. Commit 8176b5f. Push pending.

UPDATE 2026-09-18 (9): CAPTURE HOOK (variant 1b) IMPLEMENTED. .github/prompts/capture-lessons.prompt.md — /capture-lessons: session analysis -> lessons JSON -> seed-lessons.mjs (idempotent) -> experience_search round trip -> lessonsLearned.md entry. README documents the hook variants (prompt file implemented; git post-commit hook and VS Code extension documented with trade-offs). Commit 0043ead.

UPDATE 2026-09-18 (10): SETUP_EXPERIENCE_MEMORY MCP TOOL (analogous to agents_guide). Marker-based idempotent merge into AGENTS/CLAUDE (emms:lookup-rules:start/end), capture prompt (skip when non-empty), gitignore (append only missing lines), custom_triggers for repo-specific domains. 8 contract tests. 74/74 green. Commit 75915f5. Benefit: the server ships with the tool — no prompt-file copy into target repos needed.

UPDATE 2026-09-18 (11): LESSON CONSOLIDATION (B, FR-022). LessonService wired; 3 MCP tools: lesson_propose (with NO_SUPPORTING_EVIDENCE guidance at 0 verified episodes), lesson_search, lesson_get. Promotion thresholds D5: 1=candidate, 2=provisional, >=3=verified; harmful attempt with the same signature = contested (FR-021: contradicting outcome). 8 contract tests. 81/81 green. Commit 42b65c0.

UPDATE 2026-09-18 (12): CROSS-PROJECT LESSON VISIBILITY. Visibility level 'public' (spec §18.3): public episodes in search results independent of the caller's scope. lesson_publish/lesson_unpublish MCP tools (audited). Bug fix: saveEpisode did not include visibility in the UPDATE — found by the cross-scope contract test. 3 tests; 85/85 green. Commit aa60983.

UPDATE 2026-09-18 (13): PUBLISHING SETUP. smithery.yaml, scripts/build-mcpb.mjs (analogous to clear-thought), pg as optional peerDep (lazy import). build:mcpb + deploy scripts. Ready for npm publish + Smithery deploy (maintainer). 85/85 green. Commit 5b2ae9b.

UPDATE 2026-09-18 (14): LEVEL 3 AUTO-CAPTURE HOOKS. finalize(verified) auto-proposes a lesson from the episode signature (non-blocking, auto_lesson in the response). Git post-commit hook (auto-capture-hook.mjs): error pattern detection in diffs, EMMS_AUTO_CAPTURE=0 to disable. npm scripts: capture + auto-capture. 85/85 green. Commit d31b921.

UPDATE 2026-09-18 (15): CONSOLIDATION WORKER (phase 3). ConsolidationWorker: timer-based background tasks (stale scan, auto-dedup, lesson promotion), 5-minute interval (unref). StorageAdapter extended with listScopes() + findAllEpisodes() (both adapters). Wired in tools/index.ts. 5 contract tests; 91/91 green. Commit 5cc6512.

## 2026-09-22 — experience_seed_lessons tool (feature/seed-lessons-tool)
- **What works:** New MCP tool `experience_seed_lessons` (server-side batch lesson seeding, idempotent per slug, per-lesson result reporting). `scripts/seed-lessons.mjs` reduced to a thin MCP client (HTTP default, stdio fallback). Master prompt `.github/prompts/capture-lessons.prompt.md` calls the tool directly — works in any repo without a Thinking-MCP checkout. Migration script `scripts/migrate-stdio-store.mjs` (stdio store → HTTP store) added earlier on this branch.
- **What's left:** Sync prompt copies in other repos; rebuild/redeploy the Docker image so HTTP clients get the new tool; sync prompt copies after merge.
- **Current state:** 4 new contract tests green; full suite 98/99 (golden-g1-g3 timeout flake under full-suite load only — passes isolated).

## 2026-09-23: Works / Left / State
- **What works:** clear-thought + insight run without Smithery on direct SDK Streamable HTTP (stateful sessions); Dockerfiles without sed patch; insight deterministic npm ci with its own lockfile; root compose with bind host vars; session reaper (60min TTL, cap of 500); all unit tests (152+99) green; container E2E verified via SDK client (47/20 tools, tool calls OK).
- **What's left:** merge of feature/sdk-streamable-transport-migration to develop (rebase) pending; accepted review observations (400/-32700 parse error, unregistered throwaway sessions, Smithery leftovers) tracked in remaining-work-plan; Smithery deploy strategy (scripts + smithery.yaml) to be decided.
- **Current State:** feature branch 1caa690, review HIGHs closed, ready for merge to develop.

### 2026-09-23 — setup_clearthought retry-loop series (completed)
**What works:** endless retry loop fully fixed, in 5 stages:
(1) status-first serialization + one_shot note, (2) server-side loop guard
(short loop_detected from the 3rd full call), (3) pagination (~4.5KB/part, part-N fetch,
guard-exempt), (4) escalation to isError:true (refused_do_not_retry) after
3 blocked attempts, (5) compact guide as default (~7KB, 1-2 parts instead of 5)
with detail:'full' legacy mode and section:'recipes' on-demand fetch.
157->160 tests green; root AGENTS.md regen pinned to detail:'full'.
**What's left:** 3 tracked follow-ups (see remaining-work-plan.md); push of the
newer commits (a5c5c98) + docker rebuild pending (SSH agent per terminal).
**Current state:** develop = origin/develop + a5c5c98 (local commit);
all server commits reviewed, 0 HIGH/CRITICAL.


### 2026-09-24 — Backlog-plan processing (1a + 2d + 2e + 2c + 2a + 2b, completed)
**What works:** All code packages of the backlog plan implemented, each on its own
feature branches with tests + tsc + build + review protocol:
- 1a (7dbfa92): remote restart persistence — workflowToRemote bindings,
  ClientOpLedger, lastAttempt in state.json per session (formatVersion 2),
  rebuild at boot; v1 sessions tolerant. Review APPROVED (R-1..R-3 tracked).
- 2d (18b27cf): spec-kit hygiene — parser dead code, hasSection, debris import;
  require-in-ESM crash in readdirSyncSafe fixed; criteria bold-only fixed;
  F7 dead conjunct; caps documented as reserved.
- 2e (ffdf393): capability hash pins persistent (capability-hashes.json,
  merge-on-save) — drift after a restart is detected instead of re-pinned; F8
  test gaps (contracts/removed-task/terminality/waiver-fields).
- 2c (9bcc6c6): egress content checks (restricted blocks credential values),
  downstream redaction seam (content + structuredContent via redactUnknown),
  multi-line redaction. Review APPROVED (R-6..R-8 tracked).
- 2a (27df359): snapshot chaining (importArtifacts with previous, history
  preserved, blocking refresh no longer wipes the chain) + internal staleness
  calculation (hash instead of caller flag). Review APPROVED (R-11..R-14 tracked).
- 2b (29b22c2): F6 lifecycle guards (approve/reject terminal, apply only after
  approval, GuidanceError on unknown id, status "approved"); F5
  spec_kit_criterion_waived; M3 cancelled+audit for removed unfinished
  tasks; M1 relative contracts paths (relocation-safe); refresh applies
  buildReconciledState (task progress survives); 2 new tools
  approve_plan_change/apply_plan_change. Inventory: SpecKitState persistence
  was already implemented (stale entry).
**What's left:** push (29b22c2 + docs); docker compose up --build (CB-4 binding);
Smithery decision + CB-22; CB-21 spec amendment; small items L253/256/257.
**Current state:** develop@29b22c2 — backlog-plan code packages fully
completed (189/189, tsc, build).

### 2026-09-24 — Smithery Option A + CB-20 insight auth (completed)
**What works:** Cluster 3 decision A (d566d94): stdio yamls for
clear-thought/insight modernized, dead deploy/build:smithery scripts
removed, stochastic unchanged; review APPROVED (R-20/R-21 → CB-22).
CB-20 (3c4f36f): EMMS_AUTH_TOKEN (timing-safe bearer on /mcp POST/GET/DELETE,
unset = open, compose passthrough + README) — insight remote-capable.
106/106 + tsc + build green.
**What's left:** push; docker compose up --build; CB-21 spec amendment
(downstream support); CB-22 publish + rescan at the next release;
L253/256/257.
**Current state:** develop@3c4f36f — all code packages + Smithery decision +
auth completed; only CB-21 (spec) + CB-22 + small items open.

### 2026-09-24 — Guidance security/policy verification + remaining fixes
**What works:** Phase 5/6 security fixes verified (egress content checks,
redactUnknown seam incl. protocolMetadata, multi-line redaction,
pin persistence across restarts); remaining fixes implemented (atomic pin write,
persistence regression test). 197/197 tests + tsc green (container verification).
Memory-bank synced (L264/L266/CB-1/CB-2/CB-9 → [x] with evidence).
**What's left:** metrics tool (L260); awaiting_client downstream spec
(L305d); push of the new commits; after that guidance is production-ready.
**Current state:** security/policy gaps closed — Guidance production-ready
from a security perspective; rest = ops/monitoring + remote downstream spec.

### 2026-09-26 — Feature 003 toolchain bootstrap (chained workflow completed)
**What works:** run_operation tool (fail-closed invocableByAgent),
FR-107/109/110 locking (incl. stale-lock recovery), Dockerfile python3+uv
0.12.19, Python example profile (uv sync --locked fail-closed), E2E
SC-001..004. 268/268 + tsc + build green. Independent review: HIGH fixed,
rest tracked. Commits 77fa854 + review fix on
feature/guidance-toolchain-bootstrap; merge to develop done.
**What's left:** R-006 (E2E gaps, needs async op engine), R-008a
(global lock), R-010 (ERROR_CODES test), scaffold language detection,
named-volume venv, FR-110 hard kill — all tracked in remaining-work-plan.
**Current state:** feature 003 functionally complete and rescued; develop
updated, feature branch deleted (after merge).

### 2026-09-25 — Guidance HTTP downstream (gitnexus/insight via HTTP/Docker)
**What works:** `transport.type "http"` for downstream-servers.json (URL +
header with `${ENV_VAR}`, fail-closed at config load); egress host allowlist
`policies.egress.httpHostAllowlist` (mandatory with http, exact match);
ClientManager `DownstreamTransportConfig` + StreamableHTTPClientTransport;
WorkflowEngine pass-through; README docs (config example insight via
host.docker.internal). 206/206 guidance tests + tsc green.
**What's left:** HD-1 (reconnect, MEDIUM — stays tracked, unaffected by the
merge), HD-3 rest (stateful session as automated test); merge to
develop (rebase). GitNexus: Docker MCP does not see D:\repos (HD-4 rest,
accepted).
**Current state:** HTTP downstream committed (e601515); HD-2 wired
(per-server handshake timeout, config validation, tests) — 209/209 + tsc
green, detect-changes risk MEDIUM (only expected symbols).

### 2026-09-25 — HD-1 reconnect implemented
**What works:** `connection.reconnect` {enabled, maximumAttempts,
delayMilliseconds} wired: ClientManager stores the connection
parameters per server, discards the dead client after a transport failure and
repeats handshake+call up to maximumAttempts; config errors are never
retried; validation fail-closed; 5 new tests. 214/214 + tsc green;
detect-changes MEDIUM (expected symbols).
**What's left:** push of develop (2 commits ahead); HD-3 rest (stateful
automated test); exponential backoff/jitter deliberately left open.
**Current state:** all reconnect functional tests green — guidance now survives
downstream restarts (insight/gitnexus) without a restart.


## 2026-09-27: Spec-Kit draft specs/008-multi-workspace
- Draft spec.md created (FR-801…807, US1–US4, AC-1…5, Out of Scope). Numbers 006/007 were taken → 008.
- Blocked on user decisions Q1 (topology), Q2 (config source), Q3 (tool surface), Q4 (state location), Q5 (lock scope) — each with recommendation.
- Clear-thought server was unreachable during planning (3x timeout); planning documented with manual structure.


## 2026-09-27: specs/008-multi-workspace — decisions made, plan/tasks caught up
- User decisions: Q1 single-container registry; Q2-Q5 = recommendations (guidance.json workspaces[], static, state in the repo, per-workspace lock).
- spec.md: Open Questions → Decisions section; FR-801..805 made concrete (no more variant language). plan.md (P1-P7 + risks) and tasks.md (T1-T16) created.
- Next step: implementation on the feature branch (feature/multi-workspace), batch mode max 3 tasks.


## 2026-09-27: Clear-thought review specs/008 (3-person critique, 8 findings)
- Server reachable again (collaborative_reasoning, critique+integration). Findings incorporated:
  FR-802 realpathSync on both sides; FR-807 gitignore requirement .guidance/state + deployment validation (non-mounted root = clear message); FR-808 NEW observability (/health registry exposure, get_metrics workspace dimension); AC-2 traversal/case/symlink test matrix; AC-5 global invalidation deliberately codified (workspace-scoped = out of scope).
- plan.md P3 marked as the largest item (component parameterization instead of N instances); tasks.md T5/T7/T14 extended, T17 new.


## 2026-09-27: Spec-Kit prompt for feature 008 created
- .github/prompts/spec-008-multi-workspace.implement.prompt.md (convention like capture-lessons.prompt.md: front-matter + procedure).
- Content: context (artifacts + key spots index.ts/register-tools.ts/SpecKitEngine/workspace-lock), AGENTS.md rules (feature branch, GitNexus impact/detect_changes, clearthought, review evidence protocol), phases P1-P7 with task references, evidence-bound checkbox maintenance, acceptance AC-1..AC-5.

## 2026-09-27: Hygiene sync + FR namespace cleanup (pre-008)
- LOW closure labels FR-801..804 → relabeled LR-1..LR-4 (code comments, 2 test names, prompt header, memory-bank) — collision with specs/008 FR-801..808 resolved.
- 006/007 tasks.md: all checkboxes [x] + evidence addenda; status 005/006/007 → Implemented (2026-09-27).
- memory-bank: F3/F5/F7 (2026-09-26 section) + L2/L3 set to [x] with evidence; L4 INFO stays open (if needed).
- detect_changes: GitNexus 2x timeout — replaced via git diff (only comments/test names, no behavior). SUITE NOT RUN LOCALLY (no Node on host); test-name renames are string-safe.
- LESSON: sed -i on CRLF files (specs/005,006) produced a whole-file rewrite (132/132 lines) — restored with git checkout and used perl -pi -e (CRLF-preserving). In the future, status edits in CRLF files only with perl or edit_file.
- specs/008-multi-workspace implemented: 17/17 tasks, suite 326 passed (5 pre-existing), tsc+build clean, P2 gate 0 HIGH/CRIT. Open: merges to develop (feature/multi-workspace + feature/release-batch-tool), push.

## 2026-09-27: Option B deployment + scaffold default workspace
- docker-compose.override.yml: relative mounts ../../:/workspace + ../../../:/workspaces (repo pool, D:/repos) — no more absolute paths; Niyama registered as /workspaces/Niyama (workspaces[] in .guidance/guidance.json), /health shows both reachable.
- Scaffold extended: ensureConfiguration/scaffoldIfMissing take workspaceRoot and write the default workspace explicitly into the generated guidance.json (FR-801/806) — registry visible/editable from day 1.
- CRLF lesson confirmed again (main.ts): node patches CRLF-safe via regex.

## 2026-09-27: Spec-009 delta re-review (R-1…R-5)
- What works: all 5 R-fixes verified in spec.md (R-1 solved in substance, R-2/R-3/R-4 solved, R-5 largely); 0 HIGH/CRITICAL open → spec approved.
- What's left: N-D1 (plan/tasks policies-copy residual drift, MEDIUM), N-D2/N-D3 (LOW), N-D4 (INFO) — tracked in remaining-work-plan.md.
- Current State: spec 009 plan-ready after 1-line fix N-D1 in plan.md/tasks.md.

## 2026-09-27: specs/009 config assistant extensions implemented
- feature/config-assistant-extensions: 15/15 tasks. configSource question (fresh|adopt), adopt generator (regeneration of downstream/policies/responses/operations, copy of workflow/schemas, adoption block), instructions.global slot + loadConfig validation + guidanceForPublic injection.
- Tests: 341/341 in the container (incl. 5 previously pre-existing final-review-gate — green in the main checkout). tsc + build clean.
- Open: merge to develop + push (user decision), complete guidance session session-2900015e lifecycle via complete_workflow.

## 2026-09-27: specs/009 merged, develop pushed, container rebuilt with multi-workspace + 009
- /health shows niyama + thinking-mcp both reachable (T17 live).
- Live validation (Niyama onboarding) is done by the user with the provided prompt (see chat).

## 2026-09-27: Session handoff — specs/010 implementation running (T1-T4 done, T5-T10 open)
- Guidance session session-6f80021f-6555-4c94-bb51-0fd3b4a32dba: phase implement, batch b1-gate-script (T1-T4) in_progress — state persisted (persistAfterEveryOperation), resumption via import_spec_kit_artifacts + batch release via state injection (workaround documented).
- DONE in this session: gate script check-docs-drift.mjs (4 checks, purely read-only), first gate run found real drift → remediated (exit 0). Q3 cleanup 80 ERROR codes table + status hygiene. Q1/Q2 implemented: docsImpact field NOT YET implemented (T6/T7 open)!
- OPEN for the next session: T5 (operations.json + workflow.json beforeExit ordering BEFORE final-review-gate), T6/T7 (docsImpact field + lifecycle tests), T8 (README assistant chapter for 009), T9/T10 (final regression + memory bank).
- IMPORTANT: 009 tasks T3-T15 from tasks.md 009 are NOT the 010 tasks — 010 has its own T1-T10 (see specs/010-documentation-drift-gate/tasks.md, state: T1-T4 open as the next implementation step).
- Push: develop is ahead (state: 3d47b53 + following). feature/config-assistant-extensions merged (009 part 1). The remaining feature branches are parallel-chat work.

## 2026-09-27: specs/010 documentation drift gate FULLY implemented (T1-T10)
- What works: T5 wiring (docs-drift op required/read_only/60s in operations.json; workflow.json complete.beforeExit BEFORE final-review-gate — headCommit protection); T6 mandatory docsImpact in submit_task_implementation evidence (DOCS_RELEVANT_PATTERNS: src/mcp-server/, src/setup/, src/config.ts, src/types/errors.ts, specs/, README.md; "updated: <file>"|"none: <reason>", otherwise submission_invalid; default none); T7 lifecycle tests (3 new: missing/none/updated); T8 README 009 chapter covered by predecessor session (verified); T9 Q3 cleanup verified (005/006/007 Implemented, 006/007 0 open checkboxes); T10 regression: 344/344 tests, tsc, build green; gate exit 0.
- What's left: commit + push to develop; GitNexus index refresh before complete_workflow (completion gate index-freshness).
- Current State: specs/010 complete implementation-wise; batch/task lifecycle set via the documented state-injection workaround (client without release_batch/verify_task); inject script deleted after the run.

## 2026-09-27: Rest-findings batch (guidance session session-4e4471f2, feature/rest-findings-batch)
- T1 FR2-L1: docsImpact bare prefix ("updated:"/"none:" with empty remainder) → submission_invalid; tests added.
- T2 FR2-L2: case-sensitive README tool-line matching anchored by test (contract already documented).
- T3 ops hygiene: repo-wide prettier normalization (149 files, format-only, verified with git diff -w) — lint op green; operations.json lint/test descriptions with convergence path.
- T4 AD-1: adopt takes over non-generic reference ops in operations.json ([adopted from reference] marker in the description); coherence check stays strict; repro regression test with a realistic reference (beforeExit with gates) green; old N-2 test adjusted (op missing in reference → fail-closed).
- T5 AD-2: referencePath help + README mention the builtin reference examples/default-guidance.
- T6 N-D1/N-D4 already fixed (verified); N-D3: FR-909 block added to spec.md 009.
- Verification: 360/360 + 24 focused after prettier, tsc, build, docs-drift gate, prettier --check green.

## 2026-09-28: specs/011-adopt-templates
- What works: builtin adopt template (FR-971–974, AC-1–AC-4) fully implemented + tested (20 focus tests, suite 369/369, tsc/build green). Env override GUIDANCE_BUILTIN_TEMPLATE_DIR. 2 latent adopt bugs from 009 fixed (adoption schema slot, insight op detection).
- What's left: commit/push, gitnexus analyze before complete_workflow (index-freshness gate).
- Current State: implementation complete on feature/011-adopt-templates, uncommitted.

## 2026-09-28: specs/011 merged (develop, fast-forward 395ae1e..2fe7338)
- Merge: feature/011-adopt-templates → develop via --ff-only (rebase dropped, develop had not moved on). Post-merge suite 370/370 green. Feature branch deleted.
- Open: push to origin/develop (ahead 6) — waiting for user decision.

## 2026-09-28: specs/011 follow-ups merged (develop, fast-forward d809e92..47c0c9f)
- Merge: feature/011-adopt-wizard-fixes → develop via --ff-only. Pre- and post-merge suite 377/377 green each. Feature branch deleted. Contains: wizard wait requirement in sample prompts, clearthought default profile (downstream + policies :3000 + template), derived-questions skip in adopt mode, container-only self-containment (embedded gate scripts, zero-dep seeder, mounted warning).
- Open: push to origin/develop (ahead 3) — waiting for user decision. niyama: regenerate with the corrected wizard needed (old config contains package path references).

## 2026-09-28: specs/012 merged (develop, fast-forward 1b5ba2f..3356d1e)
- Merge: feature/012-adopt-response-wisdom → develop via --ff-only. Pre- and post-merge suite 386/386 green each. Feature branch deleted.
- Contents: responses adoption (FR-981), responses.json requirement + phase coverage (FR-982, breaking for old references), generic spec drift gate in the default profile (FR-983/984, new embedded script check-spec-drift.mjs), hardening (FR-985).
- Open: push to origin/develop (ahead 4) — waiting for user decision. niyama: regenerate with the new wizard state (from 3356d1e) for responses wisdom + spec drift gate.

## 2026-09-28: specs/013-wisdom-baseline — workflow completed (session-14fd6161, feature/013-wisdom-baseline)
- All completion ops green (docs-drift, final-review-gate, index-freshness, repository-analysis, capture-session-lessons). HEAD after docs commits: c491ef9 (amend: spec status Implemented).
- What works: two responses baselines (fresh generic + drift guard; adopt renders the curated wisdom baseline with placeholders/condition blocks), mounted fallback 012-compatible, renderer fail-closed. 395/395 tests, tsc/build green, detect-changes LOW, both reviews 0 HIGH/CRITICAL.
- What's left: push + merge to develop; niyama regenerate with state ≥ deaa1de.

## 2026-09-28: specs/013 merged (develop, fast-forward fa4271a..a0266d1)
- Merge: feature/013-wisdom-baseline → develop via --ff-only. Pre- and post-merge suite 395/395 green each. Feature branch deleted.
- Contents: two responses baselines (fresh generic + drift guard; adopt renders responses-wisdom.json with placeholders/condition blocks), mounted fallback 012-compatible, renderer fail-closed (unknown-token/unbalanced/strict-leftovers for wisdom).
- Open: push to origin/develop (ahead 5) — waiting for user decision. niyama: regenerate with state ≥ a0266d1.

## 2026-09-28: Timeout diagnosis guidance→clearthought completed (tracked as GDS-1..3)
- Was works: complete chain verified live healthy — clearthought /health 200 (82 ms from the container), MCP handshake 200, `run_operation reasoning-pass` succeeded; get_metrics: reasoning-pass 13/13, 0 timedOut, max 177 ms. The guidance route did NOT time out; observed timeouts = client-side (consistent with the 2026-09-27 diagnosis).
- Was left: [GDS-1] `get_downstream_status` on HTTP transport is structurally always "disconnected" (stateless per-request engine construction) — fix open. [GDS-2] stale session IDs → silent `session_not_found` on forced first use. [GDS-3] contradictory old entry 2026-09-27 ("Status ready") to be corrected. Details in remaining-work-plan.md.
- Current state: diagnosis session completed, test workflow session (session-83429b58) cleanly cancelled; all findings persisted in activeContext.md + remaining-work-plan.md.

## 2026-09-28: requestId reuse stall diagnosed + prevention implemented (feature/requestid-reuse-prevention)
- What works: Niyama stall (session-46a43aeb) resolved to root cause — WorkflowEngine.submitLocked silently replays cached results when a requestId is reused; phase advance forced via a fresh requestId (req-plan-review-adjusted-c0c1 → implement). Rule incorporated into both config assistant templates (responses.json + buildResponses drift guard, responses-wisdom.json, 6 submission phases); tests/contract+setup 210/210 green. Commits e0b756a (templates) + f6a39a0 (memory bank).
- What's left: [RID-1] server hardening (replay marker, payload hash check, replay metric) — plan in remaining-work-plan.md, not yet implemented. The live .guidance/responses.json of existing workspaces (incl. Niyama) does not yet contain the rule → regenerate. detect_changes recorded 2× timeout (FR-035 path documented).
- Current state: feature branch feature/requestid-reuse-prevention ready (develop @ 0c4ccec), merge/review pending user decision.
- 2026-09-28 (afternoon): GDS-4 implemented — run_operation forwards complete tool responses (exposeOpResult full result, all ops on returnToAgent:"raw"); contract suite 206/206 (2×), tsc green, verified live via the newly deployed guidance container. Branch: feature/gds4-expose-op-content (uncommitted). Incident: a foreign commit 025b682 had swept up uncommitted memory-bank edits (GDS-4 entry lost, rewritten); parallel-work note in remaining-work-plan.md.
- 2026-09-28: GDS-4 merged — feature/gds4-expose-op-content (377193c) rebased onto develop, branch deleted. develop ahead 1 of origin (push waiting for user decision). Contract suite 206/206 before merge, verified live.

## 2026-09-28: RID-1 requestId replay hardening (session-dcd3ddc5, develop fbd5bdc)
- What works: requestId replays visible (replayed/duplicateOf/warning on the cloned result), payload hash + policy submission.requestIdReuse (warn default / reject-mismatch → requestId_reuse_payload_mismatch), metric requestIdReplays, 8 contract tests, docs (README + Amendment 006). Suite green, tsc clean. Survived a parallel-agent revert of WorkflowEngine.ts through worktree isolation (worktrees/rid1).
- What's left: push develop (ahead 2 of origin). Fresh-baseline FR-035 policy [CR-1] and engine gating test [CR-2] still tracked.
- Current state: RID-1 implemented and merged; session completion via the container route (guidance server alive, editor MCP route stale).
- 2026-09-28 (guidance workflow session-0cf9658d, worktree Thinking-MCP-gds5): GDS-5 implemented (feature/gds5-raw-exposure, 563f484+9b46ace) — raw default exposure (transparent proxy, original CallToolResult schema incl. structuredContent), process stdout in raw mode, restriction modes opt-out; config+templates switched; worktree isolation rule as instructions.global (active+templates) with FR-981 merge semantics; gate scripts + final-review test worktree-capable (.git pointer, Windows drive paths, commondir packed-refs). Contract suite 230/230, tsc green, build gate exit 0. Workflow COMPLETED: docs-drift/final-review/index-freshness/repository-analysis/capture-lessons all succeeded. Open: merge to develop + container rebuild + live verification of GDS-5.
- 2026-09-28: GDS-5 COMPLETED — feature/gds5-raw-exposure rebased onto develop (3870f7f), branch + worktree removed, registry entry discarded. Container rebuilt/deployed; live verification: run_operation reasoning-pass WITHOUT a returnToAgent entry delivers the complete sequential_thinking response (default raw applies); structuredContent correctly absent (Clear-Thought sets none). Worktree artifacts (analyze AGENTS/CLAUDE rewrites) discarded. Open: GDS-1/GDS-2, RF-2 (FR-981 docs), push, editor route timeouts (unresolved), lint/test debt (non-blocking).
- 2026-09-28 (evening): three dedicated guidance workflows completed (sequential, each its own worktree, all COMPLETED with full gates):
  1. GDS-1 (feature/gds1-status-probe, 0318e3a+8644daa): on-demand probe in getDownstreamStatus (http server, handshake min(5s,startup)); live verification: all 3 servers ready + lastSuccessfulRequestAt. Hotfix submitted afterwards: ensureReady expects a flat transport config.
  2. GDS-2 (feature/gds2-session-hint, 68b9d77): session_not_found with recovery hint (hint only, no IDs) at all 4 raise sites; contract assertion added.
  3. RF-2 (docs/rf2-fr981-merge, f8c6709): FR-981 amendment (replace->merge) in specs/012; SDD v2 checked (no update needed); RF-2 resolved.
  Open: push develop->origin (10 ahead), GDS-1 patch evidence in the container (rebuild already done, live status 'ready' verified), lint/test debt, editor route timeouts.

## 2026-09-29: Rust verification profile for guidance (feature/rust-guidance-example, b4d5c50)
- What works: examples/rust-guidance/ (cargo fetch/clippy/fmt/test/check, all --locked fail-closed), pinned Rust toolchain (rustup minimal) in the Dockerfile, CARGO_TARGET_DIR volume option, README verification section rewritten as a step-by-step (Python + Rust). JSONs validated; no docker build / no live test against a real Rust project.
- What's left: rebase onto develop REQUIRED — the Dockerfile duplicates the parallel agent's (there still uncommitted) trixie-slim base switch; after that commit, resolve the merge conflict (contents kept identical). Then: docker build + live verification of the ops, test the example against a real Rust workspace.
- Current state: commit on feature/rust-guidance-example in worktree Thinking-MCP-rust-guidance, merge pending user decision.
- 2026-09-29 (addendum): C# verification profile added (examples/csharp-guidance/, dotnet restore --locked-mode / format --verify-no-changes / build / test, pinned SDK via ARG DOTNET_VERSION, NUGET_PACKAGES volume option, README C# step-by-step). Same merge prerequisites as the Rust profile (rebase onto develop after the parallel agent's trixie-slim commit, docker build + live test open).
- 2026-09-29 (rebase + smoke): feature/rust-guidance-example rebased onto develop (18c1098, node:24-trixie-slim); Dockerfile conflict resolved so that the develop base + opt-in guards (INSTALL_RUST/INSTALL_CSHARP) are combined. Smoke verification: default image builds, cargo/dotnet ABSENT; full image (--build-arg both true) builds with cargo 1.90.0 + dotnet 10.0.401. Fixes along the way: gcc/libc6-dev (cc linker) and libicu76 (.NET ICU) in the apt line. Open: live test of the ops against real Rust/C# workspaces; merge decision with the user.
- 2026-09-29 (merge): feature/rust-guidance-example merged to develop via fast-forward (fa00a1d, 6 commits: Rust/C# profiles, opt-in toolchains, README step-by-steps, gcc/libc6-dev+libicu76 fixes). Worktree Thinking-MCP-rust-guidance removed, branch deleted, smoke images (guidance-smoke-default/full) removed. develop ahead 7 of origin — push waiting for user decision. Open: live test of the ops against real Rust/C# workspaces; container rebuild with the new ARGs if needed.

### 2026-09-29 — Wildcard container route (feature/wildcard-container-route, c72d5c8)
**What works:** wildcard `["*"]` in capabilities.allow.tools (fail-closed validation,
only standalone) makes the container route usable for ALL tools of clearthought/insight/
gitnexus; insight with containerRoute for the first time; auto-fallback stays
read_only-restricted; examples incl. egress allowlist consistent; README docs;
437/437 tests green; independent review APPROVED 0 HIGH/CRIT.
**What's left:** guidance session session-45abc996 in 'blocked' (submit_verification
2× context-server-timeout — infrastructure, decision via resume_workflow open);
chain step 2 (WA-1 config assistant multi-workspace) not yet started;
Docker image rebuild needed so the running container accepts "*";
MEDIUM WC-1 tracked (remaining-work-plan.md).
**Current state:** step 1 of the chain implemented + committed on
feature/wildcard-container-route (not merged); GitNexus index fresh
(5618 nodes / 12359 edges).

### 2026-09-29 — WA-1 wizard multi-workspace (feature/wizard-workspaces)
**What works:** assistant-driven workspaces[] emission (specs/008) — two
new optional questions, fail-closed parse validation, adopt mode respects
answers without reference leak; 440/440 tests green; README docs.
**What's left:** merge of both feature branches to develop (user decision);
 guidance session phases (review/verify/complete) still open.
**Current state:** both chain steps implemented; branches open.

### 2026-09-29 — Merge: wildcard container route + WA-1 wizard-workspaces to develop
**What works:** both feature branches merged to develop via rebase
(develop 474c2bc, ahead 9 of origin; conflicts only in memory-bank documents,
both sections preserved). Post-merge suite 445/445 green. Feature branches
deleted (branch cleanup per rule).
**What's left:** push of develop (9 commits) waiting for user decision;
Docker image rebuild (accept wildcard config); container mount for
a second repo (e.g. zed → /workspace-zed) + wizard run to use
workspaces[]; tracked LOW follow-ups WC-1/WC-4/WW-1/WW-2/WW-3.
**Current state:** both guidance chain steps implemented, merged,
sessions completed (all gates green).

## 2026-09-29: WC-1 wildcard↔trustLevel coupling (feature/wc1-wildcard-trustlevel-coupling, guidance session session-22e9b598)
**What works:** `validateDownstreamServers` rejects wildcard `["*"]` for servers with effective trustLevel != "trusted" fail-closed (configuration_invalid, server ID in the message); `toTrustLevel`/`TRUST_LEVELS` extracted to `src/trust-level.ts` (validator+runtime one semantics); review F1 fixed (non-string trustLevel → configuration_invalid). 6 new tests; suite 451/451 green. Independent review APPROVED 0 HIGH/CRIT. README + remaining-work-plan updated; remaining gap tracked as WC-1-B. GitNexus index updated before completion (5632 nodes).
**What's left:** WC-1-B (runtime hardening trusted wildcard servers), WC-4, WW-1/2/3; merge of the feature branch to develop + Docker rebuild outstanding.
**Current state:** WC-1 solved at config level; guidance session in phase complete.

## 2026-09-29: WC-4 shipped-config contract (feature/wc4-shipped-config-contract, guidance session session-e782866b)
**What works:** tests/contract/shipped-configs.test.ts loads all 5 shipped config sets (repo .guidance + 4 example adopt templates) directly against loadConfig; the only substitution is the workspaces[] key (container roots do not exist host-side, the default fallback tolerates that by design). Egress consistency (transport.http/containerRoute ⊆ allowlist, incl. disabled servers) + negative control. 7/7 tests, suite 458/458 green (first occurrence: documented load flake, clean full run exit 0).
**What's left:** WC-1-B, WW-1/2/3; merge of this branch to develop outstanding.
**Current state:** WC-4 solved; validator×data consistency regression-secured.

### 2026-09-29 — Merge: specs/014 Config Truth v2 to develop
**What works:** feature/config-truth-v2 merged to develop via
fast-forward (7ef1fbf) and branch deleted. Post-merge suite 470/470 green.
develop ahead 8 of origin (push waiting for user decision).
**What's left:** Docker image rebuild + GUIDANCE_WORKSPACE_ROOT=/workspaces
switch for pool operation; zed practice run (registry-edit + repo-config
with cargo gates); tracked LOWs CT-1/CT-2/R-3/WW-* /WC-*.
**Current state:** specs/014 concept implemented, merged; all
guidance sessions completed.

### 2026-09-29 — README: step-by-step repo setup guide (specs/014)
**What works:** new README section "Repo setup — step by step" (servers/
server-guidance/README.md): 4 paths (workspace/remote × manual/assistant)
with sample file contents (registry-only guidance.json), sample prompts
for the mode-aware config assistant, mode decision helper; docs-drift green.
**What's left:** Docker rebuild + /workspaces switch (practice), zed
onboarding, push of develop (ahead ~10).
**Current state:** docs complete for both modes.

### 2026-09-29 — Assistant: registry-edit rejected in remote mode
**What works:** guard in ConfigAssistant.generateFiles: target=registry-edit
+ GUIDANCE_REMOTE_MODE=1 → configuration_invalid with redirection to
repo-config + init_session; 2 new/adapted tests; docs-drift green.
**What's left:** as before (rebuild, /workspaces switch, zed run, push).
**Current state:** the assistant now leads only the correct paths in both modes.

### 2026-09-30 — Guidance instance switched to pool operation (specs/014 active)
**What works:** image built with INSTALL_RUST=true (cargo 1.90.0 in the container);
override switched to GUIDANCE_WORKSPACE_ROOT=/workspaces + recreate;
/health: default(/workspaces), thinking-mcp(/workspace), zed(/workspaces/zed)
all reachable; smoke start workspace zed successful (session created and
cancelled again). zed operations switched to cargo (build/lint/test).
**What's left:** zed first run (cargo build cold = slow; possibly a CARGO_TARGET_DIR
volume); push develop; check the zed .gitignore (.guidance/state).
**Current state:** two-mode operation live: registry-only pool instance serving
zed + thinking-mcp.

### 2026-09-30 — DB-1 slim: Node deps boot warnings
**What works:** warnNodeDeps (config-truth.ts, wired in composeApplication):
per registered Node workspace a warning for missing node_modules or
natively incompatible addons (.node probe via child node);
Rust repos unaffected. 4 new tests; suite 475/475 green (clean full run);
README note added. The generic deps-install/deps-reinstall operation
remains tracked (DB-1 rest, specs/015 candidate with HR-1).
**What's left:** as before (push, zed first run, rebuild rule for
dependency updates in the repo).
**Current state:** slim variant live on develop.

### 2026-09-30 — README reconciliation against implementation (review session 385ae1ae + re-reviews)
**What works:** complete README ↔ source reconciliation by an independent
reviewer (16 findings: 2 HIGH, 8 MEDIUM, rest LOW/INFO). All HIGH/MEDIUM
fixed (multi-workspace paragraph to registry-edit semantics, quickstart with
mandatory override, catalog counter 12, profile spec-kit, downstream/wildcard/
containerRoute claims, start_workflow line, env block distinction,
/workspace framings); re-reviews confirm. Residuals N-1..N-3 + R-1..R-5
fixed/tracked; specs/014 set to Implemented.
**What's left:** push develop; tracked LOW follow-ups (CT-1/2, R-3, N-4,
WW-*, WC-*, HR-1, DB-1 rest).
**Current state:** README fully at the implementation state.

## 2026-09-30: CT-1 constructor guard (feature/ct1-constructor-guard, 8f588c6, guidance session session-1070c546, chain step 1/8)
**What works:** the WorkflowEngine constructor rejects schema-valid guidance.json
with operations.file but without/incomplete workflow.file at
registryOnly=false fail-closed with configuration_invalid (structure check
workflow.id/initialPhase instead of mere falsiness — truthy empty object
covered). 4 regression tests; suite 479/479 green; prettier green;
independent review APPROVED 0 HIGH/CRIT; README note added.
GitNexus index updated via CLI (5.698 nodes).
**What's left:** CT-2, WW-1/2/3, WC-1-B (implementation) + HR-1 SDD,
DB-1 rest SDD — follow-up steps of the same guidance chain; push develop;
newly tracked: TYPE-1 (pre-existing TS2532 shipped-configs.test.ts),
GATE-1 (container gates red due to environment, required:false — DB-1 context).
**Current state:** chain step 1 (CT-1) implemented, committed,
verified; session in phase complete (completion follows after
memory-bank update + reindex).

## 2026-09-30: CT-2 legacy monolith E2E (feature/ct2-legacy-monolith-e2e, 96b0a67, guidance session session-9e23340f, chain step 1/7)
**What works:** E2E test in registry-composition.test.ts: legacy monolith
(full config at the pool root + registry) + extra workspace with its own
.guidance → session composed from the workspace root (configurationVersion
from zed/.guidance/state/sessions/<id>.json === workspace hash, ≠ pool hash;
no copy). Suite 480/480 green, prettier green. No production code needed.
**What's left:** WW-1/2/3, WC-1-B (implementation) + HR-1 SDD,
DB-1 rest SDD (follow-up chain steps); push develop; CHAIN-1 tracked
(auto successor session fails on AC-5 drift — fresh chains as workaround);
TYPE-1/GATE-1 tracked unchanged.
**Current state:** chain step CT-2 implemented, committed; verification
running (completion artifacts follow).

## 2026-09-30: Chain completion WW-1/WW-2/WW-3/WC-1-B + specs/015 SDD (6 guidance sessions, 8/8 follow-ups)
**What works:**
- WW-1 (6029007): parseExtraWorkspaces(value, defaultRoot?) — extra-root/
  default-root collision fails at generation instead of only at container load.
- WW-2 (5c06639): isAbsolute fail-fast for the default workspaceRoot in
  generateFiles — consistent semantics with the extras.
- WW-3 (101306c): boundary tests extraWorkspaces ('=' in the root,
  whitespace-only ≡ omitted) — no production code needed.
- WC-1-B (e5408c1): PolicyEngine.assertUnconfiguredWildcard — unconfigured
  tool on a wildcard server → recoverable authorization_required (option B,
  user decision); single choke point buildInvokerClosure covers child/
  downstream wiring; 1 LOW tracked (WC1B-F3 integration test).
- specs/015 SDD (1a34a35): registry hot-reload + deps-install/reinstall
  fully specified (draft; design decision US1 open, R1/R2
  blocking open points).
Each step: independent review APPROVED 0 HIGH/CRIT, full run
480→483→482 green, prettier green, all completion gates passed.
**What's left:** specs/015 implementation (R1/R2 decisions with the user);
push of develop (16 commits, user decision); tracked: TYPE-1 (TS2532
pre-existing), GATE-1 (container gates environment-related), CHAIN-1
(auto successor session AC-5 drift — fresh chains as workaround), WC1B-F3
(closure integration test).
**Current state:** all 8 follow-ups MERGED: chain fast-forwarded to
develop (ea582f8 → 507d2eb, 16 commits), 7 feature branches deleted,
post-merge suite 483/483 green, knowledge graph updated; develop
ahead 16 of origin (push waiting for user decision); specs/015 ready
for implementation planning.

## 2026-09-30: TYPE-1 (feature/type1-ts2532, 58faa7e, guidance session session-77a51a32, chain step 1/4)
**What works:** TS2532 in shipped-configs.test.ts(125) fixed (`CONFIG_SETS[1]!.dir`), file normalized to LF (CRLF root cause: WC-4 commit 235e9e6). typecheck/prettier green, focused 7/7, full run 474 passed / 9 skipped (63 files). New machine: Node v24.21.0 installed via nvm in WSL, guidance pool registry extended with thinking-mcp (commits 7428bd1, bd5edd3 on develop).
**What's left:** chain steps 2/4 WC1B-F3, 3/4 GATE-1, 4/4 CHAIN-1; then specs/015 implementation chain (R1=B decided, R2=continuation with re-validation; variant A tracked as SPEC015-A). Merge of feature/type1-ts2532 to develop + mind the rebase rule.
**Current state:** TYPE-1 implemented and committed; guidance phases implement/review/verification open.

## 2026-10-01: WC1B-F3 (feature/wc1b-f3-integration-test, guidance session session-293a251f, chain step 1/3)
**What works:** integration test for the WC-1-B closure wiring (wildcard + unconfigured tool → authorization_required, no downstream contact). Focused 20/20, full run 475 passed / 9 skipped (63 files), prettier green.
**What's left:** chain steps 2/3 (GATE-1 evidence), 3/3 (CHAIN-1 evidence/ACs); specs/015 US1 implementation (closes CHAIN-1); push develop.
**Current state:** step 1 implemented; review/verification/completion open.

## 2026-10-01: Chain completion WC1B-F3/GATE-1/CHAIN-1 (3 guidance sessions, 2x live CHAIN-1 repro)
**What works:** WC1B-F3 integration test (wildcard + unconfigured tool → authorization_required, 5f124f1); GATE-1 evidence note (41ebec8: only script-based completion hooks run in the container, lint/test remain environment-dependent until DB-1); CHAIN-1 root cause source-verified (WorkflowEngine.ts:641-648) + R2 ACs as AC-13…17 in the specs/015 addendum (a4cd178). Full run 475 passed / 9 skipped (63 files). All branches ff-merged to develop, cleanup done. Newly tracked: GDS-6 (retry finalization: complete_workflow after hook fail + retry_operation freezes in active/completed — no finalization/successor), GDS-7 (dual GITNEXUS_HOME: container index decoupled via GITNEXUS_STORAGE_PATH).
**What's left:** push develop (ahead 6); specs/015 US1 implementation (R1=B, closes CHAIN-1 via AC-16 regression test; R2=rebind with re-validation); GDS-6 fix (same WorkflowEngine area); DB-1 rest (US2) resolves GATE-1; niyama re-registration after clone.
**Current state:** cleanup chain fully processed; CHAIN-1 reproduced live twice (mid-session config change AND successor inherited hash) — mechanism fully explained and specified.

## 2026-10-01: specs/015 US1 (feature/015-us1-registry-register merged, 3 guidance sessions: 7e69dcdd phase 1 / b045ff14 US1 / successor cancelled)
**What works:** AC-16 routing fix (workspace sessions validate against their own composition — CHAIN-1 born-invalid fixed in code), rebind AC-13..17 (session_rebound audit, fingerprint drift recomposition), registry_register (FR-1201..1210, flag+profile-gated, RMW-serialized, atomic, audit). 10 new contract tests; full run 485 passed / 9 skipped (64 files); 3 review rounds final APPROVED 0 HIGH/CRIT; specs/008 test re-anchored to R2 semantics. Phase 1 (FR numbers, T001/T002) before that.
**What's left:** US2 (T007..T010 deps-install/reinstall — fresh chain, workaround: old server code runs in the container until rebuild), phase 4 (T011..T014: README rest, verification, tasks to done), THEN deploy: container rebuild (guidance+insight) + push develop; GDS-6 fix; niyama re-registration.
**Current state:** US1 shipped on develop (ahead of origin); container still runs on the old image (there is no hot reload of code — rebuild after push).

## 2026-10-01: specs/015 US2 + phase 4 (feature/015-us2-deps-operations, guidance session session-2184b012)
**What works:** deps-install/deps-reinstall in the operations catalog (scaffold + ConfigAssistant + example catalog; npm ci with lockfile fallback, via label as audit note; deps-reinstall workspace-scoped clean+reinstall in one step). Reactive detection: node_deps_hint on "Cannot find module"/"ERR_DLOPEN_FAILED"; proactive probe nodeDeps.proactiveProbe (default OFF). 11 new contract tests (real offline npm installs with a file: dep); full run 496 passed / 9 skipped; tsc/prettier/docs-drift green; specs/015 set to Implemented, tasks T001–T014 checked off; README section dependency bootstrap. Review APPROVED 0 HIGH/CRIT (F1–F6 tracked).
**What's left:** deploy after the chain (container rebuild guidance+insight, ONLY outside sessions) + extend the instance .guidance/operations.json with the deps ops; push develop (user decision); tracked REV-US2-F1..F6; GDS-6/GDS-7; niyama re-registration.
**Current state:** DEPLOY-015b COMPLETED (guidance session session-04832909; commits 8cda5e5/a33cf23/1530973 merged to develop, branch deleted): node-gyp toolchain in the image, dotnet duplicate removed, roll-out done. DEPLOY-015c tracked (container vitest teardown crash; test gate required:false, test removed from verify gates until fix). Pending: push develop (user decision); DEPLOY-015c debug; REV-US2-F1..F6; GDS-6; GDS-7; niyama re-registration.

## 2026-10-02: Independent Review 7edef62 (feature/rev-us2-f2f3f4 — REV-US2-F2/F3/F4 fixes)
**What works:** Review APPROVED, 0 HIGH/CRIT. Composite failure merge verified (warnings typed/initialized at OperationEngine.ts:170/196, success path untouched, base warnings not clobbered); three deps-op catalogs verified field-identical by direct read (10 guarded fields incl. steps/validation/output); shipped-configs.test.ts unaffected (schema validation only, no field assertions). Focused run: 3 files, 30/30 green (deps-operations, shipped-configs, scaffold).
**What's left:** None from this review; new accepted observations tracked as REV-F2F3F4-1..3 in remaining-work-plan.md (agent-invisibility of merged warnings + via label under summary_and_errors; cosmetic join change). Existing open items unchanged (REV-US2-F1/F5/F6, DEPLOY-015c, GDS-6/GDS-7, Push develop).
**Current state:** 7edef62 fixes the governing findings correctly; exposure-semantics tension documented, not blocking.

## 2026-10-01 — Three guidance sessions completed sequentially (REV-04a2b4c-1, GDS-6/CHAIN replay, REV-US2-F2/F3/F4)
- What works: (1) REV-04a2b4c-1 — tool-level response shape test for registry_register (9b07627); (2) GDS-6 — retry success finalizes wedged completions incl. chain successor (eedb7bb + ce83e1c); CHAIN replay — duplicate step 0 fail-closed; CHAIN-1/US1 verified as implemented; (3) REV-US2-F2/F3/F4 — composite warnings merge, deps op catalogs field-identical + drift guard, real fallback semantics documented (7edef62..8a96ff5). All three sessions with all completion gates green; develop ahead 6 (unpushed).
- What's left: REV-US2-F1 (FR-053/approval, MEDIUM, tracked); GDS-7 dual index & clear-thought outage (infrastructure, tracked); push only on user instruction; deployment of the new engine parts (container rebuild) pending — the running instance has pre-fix retry semantics.
- Current State: specs/015 follow-up batch essentially completed; features 00x stable on develop; memory bank (remaining-work-plan, activeContext, progress) current.

## 2026-10-02 — Rest backlog fully completed (session-01df2607 + session-a6005ca0)
- What works: FR-053 approval gate (scope A) on all 8 execution paths, approval ceremony validated live on the deployed container (authorization_required → report_blocker → resume approve → success-based grant consumption); all-or-nothing assert for op-by-op lifecycle loops (REV-F053-1); warnings pass-through in summary_and_errors; dual index procedure documented; Python profile afterEnter removed; via label note; full run 532/532.
- What's left: only observations/conditional items left (NIYAMA-REG as soon as the repo is cloned, REV-US2-F6 lockfile flakiness on npm major update, REV-F053-1b-1 docs, clear-thought container health, REV-F053-1 alternative tracking). develop ahead 4 (unpushed: 4adfd4a + cleanup batch 3 commits).
- Current State: all MEDIUM/LOW action follow-ups from remaining-work-plan.md processed; memory bank current; next maintenance occasion = Niyama clone or npm major update.

## 2026-10-02 — Approval policy config: FR-053 switched to unattended (session-0861a7b4)
- What works: policies.approvals (riskClass → allow|require, fail-closed validated); defaults: destructive/credential_sensitive → require (ceremony), all others → allow (unattended). Gate unchanged on all 8 paths; ceremony code remains for require classes. validatePolicies early-return bugfix (approvals validation was skipped when the submission section was missing — a fail-closed test pins it). Full run 534/534; 2 independent reviews APPROVED 0 HIGH/CRIT.
- What's left: push (develop ahead 3) + container rebuild/redeploy so the running instance runs unattended. Tracked remnants: REV-APPCFG-1 (composite riskClass claim check, LOW), NIYAMA-REG, lockfile flakiness, clear-thought container health.
- Current State: unattended operation is the norm again; interactive approvals only for destructive/credential_sensitive (currently present in no profile) or on explicit operator policy via policies.approvals.

## 2026-10-02 — Registry hot reload + deps pre-flight (session-fae2aa34)
- What works: start_workflow resolves workspace names against the live engine snapshot (provider refactor in register-tools/server/main); regression test register→start_workflow without restart green. Automatic deps-install pre-flight before gates (preFlight.enabled default ON, opt-out), serialized per root, fail-open, audited; staleness matrix + gate trigger tests green. Full run 547/547 in the container; reindex + detect-changes clean.
- What's left: container rebuild/redeploy (PREFLIGHT-DEPLOY, tracked) so the running instance carries both fixes; then a Niyama dummy workflow as live verification. Commit/push only on user instruction.
- Current State: both reported blockers (workspace_not_registered after hot-register; niyama without node_modules) solved in code and tested — hot reload without container restart, missing node_modules heal automatically before the first gate.

## 2026-10-03 (evening): WIZ-4 completed, chain aborted, WF follow-ups tracked
- **What works:** WIZ-4 (workspaceRoot default from workspaceNameHint + GUIDANCE_WORKSPACE_ROOT) fully implemented and accepted by the guidance workflow (session-b1c62520, all completion gates green); commits fe25128 + 0f829ed on feature/wiz-config-assistant-rework. Environment repair: root npm install restores tsc bins for all workspace builds.
- **What's left:** WIZ-2, WIZ-1, WIZ-3 (specification done, implementation open; resumption structure = WF-6 user decision). Push of develop (2+ commits ahead of origin) and of the feature branch pending. WF-3b decision (yarn.lock vs. npm lock). Merge of the feature branch to develop after review approval.
- **Current State:** config assistant rework running on feature/wiz-config-assistant-rework; chain session-b22053ef cancelled; 6 workflow problems (WF-1..6) tracked, lessons documented.

## 2026-10-03 (night): WIZ series fully accepted
- **What works:** WIZ-4, WIZ-2, WIZ-1, WIZ-3 all implemented, independently reviewed (0 HIGH/CRITICAL in 5 reviews) and accepted via guidance chains (sessions b1c62520, 7876f096, abe752d7, 57412c1b — all completed, all completion gates green). Wizard: 10 questions, workspace registration during the wizard run, no more profiles, projectName/workspaceRoot auto-suggestions.
- **What's left:** merge feature/wiz-config-assistant-rework (12 commits, fe25128..1957ec9 + e149146) to develop after user approval; push; container rebuild (new tool surface 40 tools); WF-1..WF-6 infrastructure follow-ups; LOW findings REV-FINAL-F3/F4/F5 tracked.
- **Current State:** config assistant rework fully on the feature branch; knowledge graph fresh (reindex after the last commit); chain ended.

## 2026-10-03 (late): WF follow-ups WF-1/2/4/5/6 resolved (feature/wf-followups, chain session-cc9b8326)
- **What works:** WF-1: container route documented as the sanctioned clear-thought path (diagnosis: container healthy, logs empty, route instant — cause editor client layer, AGENTS.md note + backup). WF-2: submit-once-then-poll rule in responses.json (instance+example) and README. WF-4: explicit final-review.json mandate instruction (schema, 40-hex, re-bless, checker). WF-5: check-index-freshness.mjs excludes nested test tooling artifacts (isSkipped checks every segment; touch verification). WF-6: closeout — entries resolved, lesson verified as persisted.
- **What's left:** merge/push of feature/wf-followups to develop (after review approval); container rebuild offer to the operator (responses.json changes are bind-mount-live, rebuild optional); reindex before complete_workflow (in this session).
- **Current State:** all WF infrastructure follow-ups from the 2026-10-03 chained WIZ report processed; one rule per follow-up active in responses.json/README/AGENTS.md.

## 2026-10-03 (addendum): chain head scope trap hardened
- **What works:** duplicate guard (stage 1) verified (already on develop); new CHAIN HEAD SCOPE annex on the engine side for chained heads + 4 regression tests; README section "Head-session scope rules".
- **What's left:** merge of feature/wf-followups (now contains the WF follow-ups + this hardening); push; optional container rebuild.
- **Current State:** WF-6 trap constructively secured (fail-closed against request duplication, guidance annex against the discipline form).

## 2026-10-03 (conclusion): wf-followups merged, pushed, redeployed
- **What works:** feature/wf-followups (6 commits 1826bb7..d82b7a8: WF-1/2/4/5/6 + template sync + chain head scope hardening) merged to develop via fast-forward, branch deleted, pushed (origin/develop == d82b7a8), guidance container rebuilt and restarted (healthy, 3 workspaces reachable).
- **What's left:** no open actions; tracked LOW remnants stay in remaining-work-plan (steps:[] manifest hygiene optional, REV-FINAL-F3/F4/F5, NIYAMA-REG etc. per trigger).
- **Current State:** develop == origin/develop == d82b7a8; container runs the new engine (CHAIN HEAD SCOPE annex) and updated templates; GitNexus index fresh at this state.

## 2026-10-03 (fault_tree top-gate fix, feature/fix-fault-tree-top-gate, session-a9c2d5b6)
- **What works:** fault_tree now resolves the top gate from top_event (id match, then unique name match, then the unique unreferenced non-basic gate; last-element only as last-resort fallback so cycle detection and legacy edge cases stay intact). A basic event resolved as top is flagged via the new optional field top_gate_type: "basic" instead of being silently reported. assumption_xray no_marker note now states marker detection is English-only. Regression tests for the three report vectors over multiple array orderings (nested 0.01099/G1, flat 0.07831, basic-as-last). Full suite 178/178, typecheck clean, GitNexus reindexed. Independent final review: approve, 0 HIGH/CRITICAL.
- **What's left:** Merge/push of feature/fix-fault-tree-top-gate after user approval; German marker support in assumption_xray tracked as follow-up (FT-AXRAY-DE); multi-root fallback transparency tracked as follow-up (FT-FT-F1); chain successors (steps[0..]) risk duplicating this head scope — decide to skip or let them run verification-only (FT-CHAIN-DUP).
- **Current State:** fix implemented, committed (33d8a04 + doc follow-up commit) and verified on feature branch; merge pending user approval.

## 2026-10-03 (conclusion): Merge, successor verification, branch cleanup
- **What works:** feature/fix-fault-tree-top-gate merged to develop via fast-forward (develop = abcdca6 = origin/develop, push done outside this session); chain successor steps[0] (session-672585e2) completed as a verification-only cycle — all completion gates green, 0 changes/commits; feature branch deleted after merge per user approval (was abcdca6); steps[1] (implementation) never started (not materialized server-side) — FT-CHAIN-DUP thereby resolved.
- **What's left:** tracked follow-ups FT-FT-F1 (multi-root fallback transparency), FT-AXRAY-DE (German markers) per trigger; no open actions from this chain.
- **Current State:** develop == origin/develop == abcdca6; all feature branches of the chain deleted; GitNexus index fresh; chain ended (steps[1]/steps[2] scopes covered by the head session).

## 2026-10-03 (Severity-Gate for review findings, feature/severity-gate-review-findings, session-4e869880)
- **What works:** The review reason-transitions (implementation_changes_required / major_plan_revision_required) are now reachable: evaluateReviewFindings() helper (severity in blockingSeverities AND status not in fixed/tracked/accepted = open, mirroring check-final-review.mjs) is wired into submitLocked; selectTransition accepts a gateReason; audit event review_findings_gate_triggered; per-phase loop counter surfaced as SEVERITY GATE LOOP note in guidance (Option A, no hard cap). Strict schemas (F2): review-implementation + review-plan findings require severity enum + optional status enum, mirrored in examples, test fixtures and scaffold.ts. Gate applies to BOTH review phases (F1); absent policy = gate disabled.
- **What's left:** Review phase of the guidance workflow session (session-4e869880), then verify/complete gates; merge after user approval; gitnexus reindex at completion.
- **Current State:** feature branch created off develop; focused tests + full server-guidance suite 585/585 green, typecheck clean; README severity-gate semantics section and memory-bank updated.

## 2026-10-03 (conclusion): severity gate implemented, workflow in completion
- **What works:** Severity gate live: open high/critical review findings loop review_and_fix_implementation→implement and review_and_adjust_plan→plan (audit event review_findings_gate_triggered, per-phase loop counter surfaced in guidance); strict schemas enforce severity enum + optional status across default/csharp/python/rust profiles, fixtures and scaffold; gate disabled when policy absent. FR-040 verify loop and completion final-review gate unchanged. All verification green: 585/585 server-guidance tests, tsc clean, root build exit 0, prettier green, yarn.lock intact. Independent review round: 0 unresolved HIGH/CRITICAL (10 findings: 8 fixed, 2 tracked).
- **What's left:** Commit/merge of feature/severity-gate-review-findings pending user approval; tracked follow-ups REV-GATE-6 and YARN-LOCK-TRAP in memory-bank/remaining-work-plan.md.
- **Current State:** Workflow session-4e869880 in complete phase (completion gates submitted); gitnexus reindexed at feature state; final-review evidence written (.guidance/state/final-review.json, openHighCritical 0).

## 2026-10-03 (YARN-LOCK-TRAP guard, feature/yarn-lock-guard, session-22f8339b)
- **What works:** Pre-commit/pre-push yarn.lock guard (scripts/check-yarn-lock.sh + .githooks/, core.hooksPath activated on main checkout) blocks v1-format/unknown-format lockfiles, staged deletions and pruned root trees; 7/7 guard tests green; AGENTS.md WF-3 + README documented; YARN-LOCK-TRAP tracking resolved as fixed-with-coverage.
- **What's left:** Workflow review/verify/complete phases for session-22f8339b; merge after user approval.
- **Current State:** feature branch feature/yarn-lock-guard off develop @ 052a2b5; guard live on this checkout (resolution commit goes through the hook).

## 2026-10-03 (YARN-LOCK-TRAP guard, feature/yarn-lock-guard, session-22f8339b)
- **What works:** yarn.lock integrity guard live: pre-commit + pre-push hooks (scripts/check-yarn-lock.sh via .githooks/, core.hooksPath activated on main checkout) block Yarn-v1/unknown-format lockfiles (index + working tree + committed tip), staged deletions, and pruned root trees (fresh-clone exempt; fail-closed on unreadable git state). 11/11 guard tests green; independent review round (1 HIGH + 3 MEDIUM + 2 LOW) fully resolved — including the intent-to-add/commit -a bypass and the now-real push-time tip check. Live proof both directions (legit commit passed, drift commit blocked). YARN-LOCK-TRAP tracking resolved as fixed-with-coverage.
- **What's left:** Merge of feature/yarn-lock-guard (2 commits) after user approval; push of develop.
- **Current State:** feature branch off develop @ 052a2b5, HEAD b79df55; tree clean; final-review evidence written (0 open HIGH/CRITICAL).

## 2026-10-03 (conclusion): yarn-lock-guard merged
- **What works:** feature/yarn-lock-guard merged to develop via fast-forward (develop = e4c6874, 3 commits ahead of origin), feature branch deleted; guard tests 11/11 green on develop; core.hooksPath still active.
- **What's left:** push of develop (3 commits) after user approval.
- **Current State:** YARN-LOCK-TRAP closed; guard productive on develop (this commit went through the pre-commit hook).

## 2026-10-04: SKP-1 formal verification + merge (Guidance-Session session-8a3f5bf4)
- **What works:** Full verification evidence recorded: focused contract tests 6/6, full server-guidance suite 73 files / 591 tests green (tip 8c41768, includes the SKP-2 end-to-end wiring test with revert drill). LIVE pool-mode proof re-executed on a freshly rebuilt container (root compose, `--build`): `discover_spec_kit_feature('008-multi-workspace')` resolves `/workspaces/Thinking-MCP/specs/008-multi-workspace` — original bug (`spec_kit_feature_not_found: feature root missing: specs`) confirmed gone. develop verified identical to merge-base (d44fc34, 0 behind / 4 ahead) → fast-forward merge of feature/speckit-pool-mode-wiring into develop, feature branch deleted. Note: origin fetch not possible from this shell (SSH key passphrase unavailable) — merge safety checked against LOCAL develop ref; push will surface any remote drift.
- **What's left:** Push of develop after user approval (carries SKP-1 fix + verification commits).
- **Current State:** SKP-1 fully closed: implemented, contract-tested (revert-drill-proven), live-verified in pool mode, merged to develop. Residuals SKP-3 (LOW, pre-existing Windows separator) remain tracked.

## 2026-10-03 (evening): SKP-1 Spec-Kit pool mode fixed (feature/speckit-pool-mode-wiring, 255bfd2, guidance session session-896320f1)
- **What works:** `createConfiguredServer` in servers/server-guidance/src/server.ts now passes `getSessionWorkspace` (session root instead of pool root) — pool mode discovery functional. Contract tests tests/contract/speckit-pool-mode.test.ts (4 cases: session root resolution, pool root fallback, pre-fix regression, T6 root check). specs/008 T6 note added. Focused tests 12/12 green, full suite 589/589 green, GitNexus impact LOW (exact). LIVE VERIFIED: container rebuilt, discover_spec_kit_feature resolves /workspaces/Thinking-MCP/specs/008-multi-workspace (before: "feature root missing: specs").
- **What's left:** guidance workflow cancelled on user instruction (phase implement, submission was missing the summary field) — review/completion phases skipped; merge to develop + push pending; container runs with the fix (rebuild already done).
- **Current State:** SKP-1 (HIGH) implemented + live verified; finding tracked in remaining-work-plan.md, resolution to be closed there after the merge.

## 2026-10-04: SKP-3 C-full completed (feature/speckit-artifact-discovery-integration, session-1bdb6fee)
- **What works:** discoverArtifacts (previously dead code, never wired since 33255fa) fully integrated into importArtifacts: shared isInsideWorkspace helper (both separators — SKP-3 bug + drift pattern fixed), unified traversal (inline loop + ad-hoc contracts walk removed), checklists/** now imported (gap in DEFAULT_ARTIFACTS closed), config-dir patterns functional, relativePath to real paths (no snapshot migration needed). 15 new tests; suite 606/606 green; workflow completed (all gates: lint, build, final-review 0 HIGH/CRIT, index-freshness, capture-lessons).
- **What's left:** merge to develop + push after user approval (branch feature/speckit-artifact-discovery-integration, HEAD 7884ba4, 5 commits on 4af45d1).
- **Current State:** SKP-3 closed; residuals SKP-3a..SKP-3e (LOW, with trigger points) tracked.

## 2026-10-04 — specs/016 Async Transitions & Progress (session-62689b13, feature/016-async-transitions-progress)

- **What works:** Stage 2 async acceptance (opt-in `_meta.async` / `GUIDANCE_ASYNC_ACCEPTANCE=1`, synchronous default), idempotent in-flight retry (atomic registry begin, sessionId+tool key), outcome retrieval via `get_workflow_state.asyncOperations` incl. failures + restart-reclassification; stage 3 SSE progress (progressToken-keyed upgrade, per-gate notifications with cumulative monotonic progress, 15s keepalives, redaction-safe). All ACs (AC1–AC5) covered by 7 new contract tests; full suite 613/613; build/lint/typecheck green (typecheck has only the pre-existing tracked error).
- **What's left:** Adoption in insight/clear-thought (S016-ADOPT), N1 registry reconcile-mutex, N2 mutex eviction, N3 restart/multi-group coverage tests, S016-RETRY-OP — all tracked in remaining-work-plan.md with trigger points.
- **Current State:** MERGED (2026-10-04, user approval): fast-forward merge to develop (c544701..8ea8f80, 6 commits), feature branch deleted, focused tests on develop 15/15 green. Push pending — no SSH key in the shell context (known trap), develop is 6 commits ahead of origin/develop; push to be followed up by the user with credentials. Then: S016-ADOPT (extraction scope for insight/clear-thought).

## 2026-10-04 — S016-ADOPT (feature/016-adopt-async-sse, session-7e49befd)

### What works
- servers/shared-workflow: canonical spec-016 modules (transition-protocol + operation-registry) with reconcile-under-mutex (N1), mutex eviction (N2), restart fixture, multi-group monotonic progress fixture; 12/12 tests green.
- Vendoring via sync script + per-server hash-consistency guards (all 6 copies byte-identical, LF).
- server-insight: async acceptance (experience_seed_lessons/experience_finalize; _meta.async or EMMS_ASYNC_ACCEPTANCE=1, sync default), workflow_status carries asyncOperations, SSE progress keyed on _meta.progressToken; 7/7 contract tests green.
- server-clear-thought: async acceptance (session_save/session_load; _meta.async or CLEAR_THOUGHT_ASYNC_ACCEPTANCE=1), session_info carries asyncOperations, SSE transport shares SessionState; 7/7 contract tests green; full suite 187/187.
- server-guidance: consumes shared copies behavior-identically; 615/615.

### What's left
- Merge DONE: feature/016-adopt-async-sse fast-forward-merged into develop (aaffb81), pushed to origin, branch deleted. Review approved, 0 open HIGH/CRIT.
- Tracked: S016-ENV-SQLITE (pre-existing insight test crashes, Node 24/WSL), S016-REVIEW-RESIDUEN F4/F6 (accepted), S016-RETRY-OP, S016-TYPECHECK (pre-existing), S016-CHAIN-PROGRESS.

### Current state
Spec 016 adoption (§6 step 2) implemented on feature branch; independent review re-blessed fix commit ba37e83 with 0 open HIGH/CRITICAL. Guidance session session-7e49befd in completion.

## 2026-10-04 — Guidance schema-drift cleanup (feature/schema-drift-cleanup)

### What works
- Pool root `D:\repos\.guidance` reduced to registry-only `guidance.json` (no `default` entry, no legacy process files).
- Verified live: `default` rejected fail-closed (`workspace_not_registered`) after container restart; registered workspaces unaffected; server health green.
- README + memory-bank documentation updated.

### What's left
- Commit + merge of `feature/schema-drift-cleanup` into develop (after review); reindex via `gitnexus analyze --no-stats` before guidance completion.

### Current state
Runtime drift fixed and verified; documentation in sync; workflow session-d5a440cb in completion.

### 2026-10-04 (Merge): schema-drift cleanup merged to develop
Fast-forward aaffb81..452f1d4 (3 commits), feature branch deleted, develop ahead of origin/develop by 3 — push pending (user-side, known SSH-key trap). GitNexus index refreshed after merge.

## 2026-10-04
- **What works:** registry-only guidance pool starts sessions for ANY registered workspace (alphabetical-first fallback bug fixed, commit 5d1437e on fix/registry-only-default-root-guard); container redeployed and verified live (niyama + thinking-mcp).
- **Open:** branch not yet merged to develop; the Niyama agent can rerun its workflow with workspace "niyama".
- **Current state:** guidance suite 616/616 green; knowledge graph reindexed.

## 2026-10-05 — specs/017 spec-kit mode (feature/017-spec-kit-mode)

### What works
- Workflow selection at session start: `start_workflow {workflowId}` resolves the session definition from `<configDir>/workflows/<id>.json` (per workspace root, pool-compatible); absent workflowId keeps the boot definition byte-identical (FR-1/FR-2/FR-9).
- Per-key `$include` variant loading with fail-closed missing-target, cycle and unknown-phase validation (FR-3/DQ-2); include cycles throw classified `include_cycle` errors.
- `spec-kit-development` variant shipped in `.guidance/workflows/` with artifact-bound phases: commands rendered into phase guidance; fail-closed artifact exit gate reusing `checkArtifactPattern` (same discovery as import); `artifacts_present` skip recorded in session state (FR-4/FR-8).
- Strict batch cadence: batch-scoped implement submissions, `batch_approved_more_pending` loop, all-batches-approved gate for `submission_valid`, per-batch review-round max with user-decision blocker (FR-6).
- Hash-based converge loop: tasks.md snapshot at verify ENTRY, byte-diff classification (DQ-1), refresh-before-loopback guidance, convergence-pass max with blocker (FR-7).
- FR-10 helper `nextFeatureNumber()` aligned with `get_highest_from_specs`.
- Guidance suite 667/668 green (1 pre-existing failure labeled baseline: speckit-pool-mode.test.ts typecheck, commit 7884ba4); 7 new test files cover AC1–AC7.

### What's left
- Commit(s) on feature/017-spec-kit-mode, independent review, merge to develop (rebase), README already updated.

### Current state
Implementation complete on feature branch; session session-c4ddeb4d in verify/complete.

### 2026-10-07 (Verify+Review complete)
- Verify gates lint+build green; convergence converged (tasks.md hash unchanged across the pass).
- Independent reviews (A: registry/config, B: engine) executed; 1 HIGH + 4 medium/low fixed in 9be7c2e, full suite 668/668 green afterwards; 2 low findings classified accepted with trigger points.
- Commits: 1380da2 (feature), 9be7c2e (review fixes). Branch feature/017-spec-kit-mode ready for merge review.

### 2026-10-07 (Merge): specs/017 spec-kit mode merged to develop
Fast-forward 6455cc7..80069f1 (5 commits), feature branch deleted, develop ahead of origin/develop by 5 — push pending (user-side, known SSH-key trap). Guidance suite 668/668 green post-merge; GitNexus index covers new HEAD.

### 2026-10-07 (Chain complete): 017 follow-ups resolved on feature/017-final-review-mediums
- Chain session-3a03faf2 (head: baseline typecheck, RESOLVED 01071e9) -> successor Final#1 (session-012866f1, variant degradation marker, 0babcc6/68e5b1a) -> successor Final#2 (session-1c9082e9, convergence snapshot signal, 02a09cf/92718c8). All sessions completed with green gates (docs-drift, final-review, index-freshness, repository-analysis, capture-session-lessons).
- Suite 674/674 green; typecheck fully clean (baseline eliminated). Open tracked follow-ups: 2 low (Final#1 final review) + 3 low/1 info (Final#2 final review) + FR-10 wiring + include-cycle spec note — all with trigger points in remaining-work-plan.md.
- Next: merge review of feature/017-final-review-mediums into develop, push (user-side SSH).

### 2026-10-07 (Merge): 017 follow-ups chain merged to develop
Fast-forward 18eaa2b..e3e5221 (10 commits: baseline typecheck fix, Final#1 degradation marker, Final#2 convergence snapshot signal, memory-bank lifecycle), feature branch deleted, develop ahead of origin/develop by 7 — push pending (user-side SSH). Suite 674/674 green, typecheck fully clean (baseline eliminated), index covers new HEAD.

## 2026-10-08 — Form-B chain fix (feature/form-b-chain-fix, from develop@c8e0f47)

**What works:**
- Checkbox mapping on import (`checkboxChecked` -> `status:"completed"`); deviation from SC-011 documented (code, README, test; spec follow-up tracked CHFIX-1).
- Spec-Kit state inheritance to chain successors + bridge pass-through to child engines (`childBridges`) — Form B now also works in pool operation.
- Start-time depth pre-check with non-blocking `warnings[]` output + per-manifest `maxChainDepthOverride` (1..512); config cap 64->512; `buildReconciledState` respects import status.
- Validation: typecheck clean, targeted 65/65, full suite 679/680 (1 environmental timeout, CHFIX-5), prettier clean, detect_changes clean.

**What's left:**
- Commit on feature/form-b-chain-fix (pending, user decision).
- Solution proposals for the remaining long-chain hurdles formulated in chat, NOT commissioned (CHFIX-2 index gate, CHFIX-3 recovery, CHFIX-4 phase boundaries).
- Merge to develop + rebase/review per branch rules; the specs/018 chain can then use Form B (earlier F1 workaround becomes obsolete).

**Current State:** Form-B chains are usable for long sequential runs; user-decision gates stop deliberately. The running specs/018 branch (feature/018-wp01-adapter-core) is independent of this fix and can be switched to Form B after the merge.

## 2026-10-08 — CHFIX-2/3/5 session (session-78776317, feature/form-b-chain-fix)

**What works:**
- CHFIX-5: FR-004 per-test timeout 60s; full suite 683/683 green including FR-004 under load.
- CHFIX-2: index-freshness gate fails loudly with agent-facing REMEDY (exact host-side wsl.exe reindex command) on stderr -> exposedOpResult.errors[0].message; 3 spawn-based regression tests.
- CHFIX-3: chain-recovery recipe in README (incl. sessionId-discovery fallback) + AGENTS.md pointer; AGENTS.md.bak refreshed.
- Independent final review (sub-agent 8cc483f1): 0 open HIGH/CRITICAL; 3 non-critical findings tracked as CHFIX-6/7/8.

**What's left:**
- CHFIX-6 (MEDIUM): REMEDY hardcodes this repo's reindex path — pool-wide misdirection for other workspaces; fix when a second workspace uses the gate.
- CHFIX-7 (LOW): AGENTS.md still contains an older mixed-case reindex command (KA-4 trap) next to the correct lowercase one; unify on next AGENTS.md edit.
- CHFIX-8 (LOW): README recovery step 1 imprecise for 'activating' successors (get_workflow_state throws instead of showing status); refine on next README edit.
- Merge feature/form-b-chain-fix to develop (rebase) + guidance container rebuild.

**Current State:** Form-B chains viable end-to-end (fix committed ba6ecc1) + hardened (this session); remaining long-chain risks are tracked, none blocking.

## 2026-10-08 — Session 78776317 completion aftermath (update)

**Correction:** The session could NOT be formally completed. After index-freshness healed (reindex + retry_operation, REMEDY verified live), repository-analysis failed with downstream_capability_changed (gitnexus:check pin drift after reindex/server-restart). Pin reset required a guidance container restart, which orphaned the session (sessions are workflow-run-scoped, do not survive server restarts despite on-disk JSON). All engineering work was already committed (6128cd8); the workflow completion itself is orphaned. Tracked as CHFIX-9 (HIGH). 4 lessons seeded to EMMS. Documentation deltas (CHFIX-9 README precision) are uncommitted, awaiting user decision.

**Current State:** feature/form-b-chain-fix holds two commits (ba6ecc1 Form-B fix, 6128cd8 chain hardening), full suite green, 0 open HIGH/CRITICAL from independent review. Next candidates: CHFIX-9 (session persistence across restarts / in-process re-pinning), then merge to develop + container rebuild.

## 2026-10-08 — Chain Step 3: documentation consolidation completed (session-b5650a19)

**What works:** topology docs consistently on wsl-writer everywhere (AGENTS.md + backup + contradiction check, responses.json with live-verified config rebind, compose headers, README deployment block + working sample); GND1-DOC-1 resolved; wsl-writer identity lesson documented; docs-drift + full suite + fresh index green.

**What's left:** merge feature/gn-chain-step2 → develop (fast-forward-capable, all 6 commits reviewed); push to origin (user decision); open tracked follow-ups unchanged (GN-D5, GN-2 residual lastCommit, GN-6/7/8, CHFIX-9, GND1-TEST-1/RESIDUALS).

**Current State:** GN triple chain (step 1 identity/port hardening, step 2 tri-state gates + hybrid probe, step 3 documentation consolidation) fully completed — all sessions completed, all gates green, 0 open HIGH/CRITICAL across all three reviews.

## 2026-10-08 — GN-D1 engine scope: tri-state gates + hybrid probe (session-11bb76a9, feature/gn-chain-step2)

**What works:**
- `skipped(capability-absent)` as a third gate state: connection-level transport errors on optionally declared servers → skipped + loud warning (only non-required ops; required fail-closed unchanged); reachable servers with tool errors → failed + `optional_capability_broken` (never-installed and configured-but-broken distinguishable); timeouts/expired sessions count as reachable.
- Hybrid probe (session start + chain successor): declared state vs live ping, fire-and-forget, timeout-bound, off pings only http leftovers, `capability_state_deviation` exactly-once per session+kind (probe + gate-time signal share the guard).
- Additive type extensions (OperationStatus/OperationOutcome/GateEvent.phase + `skipped`), vendored copies synced; minimal-additive config read path for `gitnexus.state`; generator texts updated to the new semantics.
- Full review ceremony: independent review + re-bless + fresh final review, 0 open HIGH/CRITICAL; suite 721/721, tsc clean.

**What's left:**
- GND1-DOC-1 (MEDIUM): topology doc drift (AGENTS.md bullet + responses.json complete instruction still container-writer wording; live = wsl-writer) — chain step 3.
- GND1-TEST-1 (LOW): no dedicated chain successor probe test; GND1-RESIDUALS (INFO): documented residual gray zones (flagless transport errors, stdio spawn for required, restart duplicates, composite-forced-required).
- Merge feature/gn-chain-step2 → develop after chain completion (step 3) + push decision with the user.

**Current State:** chain step 2 (GN-D1) implemented and reviewed; step 3 (documentation consolidation) is spawned automatically as successor. Branch feature/gn-chain-step2 holds all step-2 commits based on develop @ b4a1b8b.

## 2026-10-08 — GitNexus integration: migration + optional decoupling merged

**What works:** develop @ 3b0e631 contains both scopes linearly: (1) GN migration (gitnexus-server as compose container, full pool mount, in-repo storage, live pickup, single index writer, legacy volume deleted); (2) optional-decoupling phase 1 (gitnexus tri-state declaration required/optional/off + mode + reindexCommand in guidance.json, conditional renderings, alone-test, product/deployment split with overlay docker-compose.gitnexus.yml, deployment-agnostic REMEDY). Suite 693/693; two independent reviews per scope, 0 open HIGH/CRITICAL; feature branches deleted after merge.

**What's left:** push to origin (pending, not requested); phase 2 (GN-D1 tri-state gates + hybrid probe); GN-D3/D4 (test gaps, adopt asymmetries); GN-5 (port hardening); Niyama lastCommit populate at the next reindex.

**Current State:** guidance container rebuilt with the new state (healthy, configured, all workspaces reachable); stack 5 containers via base+overlay chain; both completion gates of the decouple session completed green. Compose invocation canonical with -f docker-compose.yml -f docker-compose.gitnexus.yml.

## 2026-10-08 — Chain-head follow-up chain started (session-1fa1ffca, verification-only)

**What works:** chained guidance workflow for 4 tracked follow-ups registered and verified server-side (chainSpec persisted, 4 steps in order): gn-d6-api-reindex → gn-d5-url-topology → gnd1-probe-residuals → chfix-9-session-persistence. The head cycle ran as a pure coordination/verification scope (understand/plan/review with 4 sequential_thinking passes + assumption_xray/argument_map, get_workflow_state proof) without implementing the successor scopes; activeContext.md documents the chain start + successor warnings (parallel agents, restart susceptibility until CHFIX-9).

**What's left:** successor 1 (GN-D6) starts with head completion; then GN-D5, GND1-TEST-1/RESIDUALS, CHFIX-9 (HIGH, last and largest step). Open tracked follow-ups GN-6 (lastCommit residual), GN-7/8, CHFIX-10 remain untouched by this chain (note: lastCommit is GN-6; GN-2 is already solved).

**Current State:** checkout develop @ 3709b1c, tree clean before head work; the head changes only memory-bank files (targeted commit). The chain is susceptible to guidance server restarts until CHFIX-9 is implemented.

## 2026-10-09 — GN-D6 API reindex implemented (chain successor 1, session-7c6ae379, feature/gn-d6-api-reindex)

**What works:** canonical reindex via `scripts/reindex-via-api.sh` (gitnexus HTTP API, submit+poll, ~1–4 min incremental); reindexCommand synced in guidance.json, AGENTS.md (both sections) and responses.json; REMEDY line renders the new command automatically; stats-line restore with mtime preservation keeps AGENTS.md/CLAUDE.md clean AND the freshness gate green; WSL CLI documented as fallback + --force healing; API contract pinned via container source (no no-stats, job dedup per repo).

**What's left:** chain successor 2 (GN-D5 URL topology decoupling), successor 3 (GND1-TEST-1/RESIDUALS), successor 4 (CHFIX-9, HIGH). GN-D6 entry in remaining-work-plan set to resolved.

**Current State:** feature/gn-d6-api-reindex holds the GN-D6 changes (script + config + docs + memory-bank); live verification green (job 0→100 %, INDEX FRESH mtime, identity /mnt/d preserved); waiting for final review + completion.
## 2026-10-09 — GN-D5 URL topology decoupling implemented (chain successor 2, session-a073a6b4, feature/gn-d5-url-topology)

**What works:** gitnexusTopology (compose-dns|host-gateway) as an independent question; gitnexusUrl()/buildPolicies()/containerRoute/egress keyed on topology (no longer on writer mode); adopt derivation from the live reference downstream URL (mixed shape regenerable — acceptance criterion met); F-2 GITNEXUS_URL token render regression-tested; question catalog pins (13->14) updated in test + README. Suite 727/727, tsc clean.

**What's left:** chain successor 3 (GND1-TEST-1/RESIDUALS) and successor 4 (CHFIX-9, HIGH). New engine observation for successor 3: submit_understanding desync (transient required_hook + retry_operation phase skip without submission). /tmp filling by relocated-venv test residues (observed, cleaned up; recurrence possible with frequent full-suite runs). Note: GN-D6 entries in activeContext/progress/remaining-work-plan are on feature/gn-d6-api-reindex (branch-disjunction side); merging both branches unifies the memory-bank diffs.

**Current State:** feature/gn-d5-url-topology (from develop) holds ConfigAssistant + tests + README + memory-bank; feature/gn-d6-api-reindex parallel unmerged (code files disjoint).
## 2026-10-09 - GND1 successor probe test + desync fix (chain successor 3, session-0046f81b, feature/gnd1-probe-residuals)

What works: dedicated chain successor probe test (GND1-TEST-1, plainOps fixture + makeChainedEngine, bounded poll, exactly-once, head/successor independent); GND1-DESYNC-1 fixed: retryOperations guard holds phase transition without recorded submission (complete excepted, GDS-6), regression test in chain.test.ts pins both directions; residuals (a)-(g) re-verified, all 7 accepted unchanged (decision table in activeContext). 37/37 targeted, full suite 723/723, tsc clean.

What's left: chain successor 4 (CHFIX-9, HIGH: session persistence across server restart) — the desync fix touches the lifecycle, but CHFIX-9 remains untouched. Merge order of the 3 feature branches with the user.

Current State: feature/gnd1-probe-residuals (from develop) holds the WorkflowEngine guard + 2 test files + memory-bank; parallel branches gn-d6/gn-d5 unmerged (code disjoint, memory-bank merge conflicts expected and resolvable).

## 2026-10-09 - CHFIX-9 evidence-closure path A (chain successor 4, session-f0015ea9, feature/chfix-9-session-persistence)

What works: CHFIX-9 premise refuted at two levels and pinned as regression tests (engine restart survival + pool restart survival registry-only); README restart semantics refined (file-backed sessions, rebind, in-flight ops->unknown, MCP transport session does not survive, no deletion of session files); CHFIX-11 (in-process re-pin) split off; CHFIX-9 resolved with evidence + user sign-off.

What's left: merge of all four feature branches (gn-d6 -> gn-d5 -> gnd1 -> chfix-9) to develop; container rebuild; path B: live restart experiment with an active session (verifies the restart semantics productively).

Current State: chain 4/5 sessions completed (CHFIX-9 in completion); four feature branches + develop ready for sequential merge; live experiment B after rebuild.

## 2026-10-09 - Chain completion: merges + rebuild + path B verified live

What works: all 4 feature branches merged (gn-d6 -> gn-d5 -> gnd1 -> chfix-9, memory-bank conflicts resolved on both sides, 1 duplicate header cleaned up); branches deleted; full suite on develop 731/731 green; canonical reindex ran productively for the first time via scripts/reindex-via-api.sh; guidance container rebuilt (healthy). PATH B VERIFIED LIVE: throwaway session started, container hard-restarted (docker restart), get_workflow_state afterwards resolves the session completely (active/understand, metadata intact) — active sessions survive real server restarts productively; the incident loss was transport-/composition-related, as analyzed in CHFIX-9.

What's left: push of develop to origin (user decision; locally 7 commits ahead); open follow-ups: CHFIX-11 (in-process re-pin), CHFIX-12 (session_not_found message texts), GN-D6-R1/R2, GN-D5-R1, GND1-RESIDUALS trigger, GN-6/7/8, CHFIX-10.

Current State: develop @ dfd22db (7 commits ahead of origin), chain GN-D6/GN-D5/GND1/CHFIX-9 fully completed with 0 open HIGH/CRITICAL; stack deployed with the new state and verified live.

## 2026-10-09 - CHFIX-10 resolved (chain successor 1, session-a4a78bf2)

What works: 4/4 lessons verified retrievable in the EMMS store (exp_7df8afc9-074, exp_a17de2ca-d59, exp_54d37069-059, exp_c4016589-37f); transported artifact deleted after positive verification; CHFIX-10 RESOLVED with evidence; DEPS-OPS-1 typo corrected; CHFIX-11 user decision (hybrid) recorded for successor 3.

What's left: successor 2 (CHFIX-12 message rewrite), successor 3 (CHFIX-11 hybrid re-pin).

Current State: docs-only commit; no code changes; EMMS store remains the single truth.

## 2026-10-09 - CHFIX-12 resolved (chain successor 2, session-b5a4c381, feature/chfix-12-session-messages)

What works: the four session_not_found message sites state their true PER-SITE conditions (final review caught an initial uniform rewrite: load/resolve = file-not-found with composition-check-first; assertSessionBinding = condition-neutral, anti existence-oracle preserved; touch = TTL expiry with direct start-workflow recovery); error code/leading token/recoverability byte-identical; consumer safety verified experimentally (no prose pins, full suite 731/731 after both rounds, tsc clean).

What's left: successor 3 (CHFIX-11 hybrid in-process re-pin - user decision c recorded).

Current State: code change on feature/chfix-12-session-messages; memory-bank updated; awaiting final review + completion.
## 2026-10-09 - CHFIX-11 resolved (chain successor 3, session-26f47d05, feature/chfix-11-hybrid-repin)

What works: hybrid in-process re-pin (user decision c) — drift fails closed + capability_pin_drift audit (engine-level, pinned+live hashes, schema-drift + tool-missing kinds) + remedy hint in the error; confirm-gated release_capability_pins tool removes pins in-process (remove-semantics persistence) + capability_pins_reset audit; next call re-pins automatically (regression-tested end-to-end, no restart). Tool surface 41, docs-drift green, suite 734/734, tsc clean.

What's left: independent final review + completion of this session; then merges (feature/chfix-12-session-messages and feature/chfix-11-hybrid-repin) — user decision; DEPS-OPS-1 remains tracked.

Current State: CHFIX-10/12/11 all implemented; chain at final successor completion.

## 2026-10-09 - NEW CHAIN HEAD STARTED (verification-only): CHFIX-11-R1 + DEPS-OPS-1 (session-92d3bbfb)

What works: 2-step chain accepted by the guidance server (chainSpec persisted, chainUpNext=0). Step 1 = CHFIX-11-R1: (F-3) documented design decision only (fail-closed semantics for co-running engines over one stateDir; any future multi-engine-per-stateDir wiring remains a BLOCKING re-assessment trigger; no guard code) + (F-2) remove ClientManager.assertNotDrifted incl. unit test. Step 2 = DEPS-OPS-1: parameterize deps-install per-workspace PM config (user choice b). Head preconditions verified read-only: assertNotDrifted exists only as definition (ClientManager.ts L234-238) + test (client-manager.test.ts L73-78), no production caller; remaining-work-plan entries match chain scope; EMMS has no deps-install/PM traps.

Key successor input (head discovery): PM-aware deps-install generation ALREADY EXISTS in ConfigAssistant (question `packageManager`: yarn.lock -> yarn; buildOperations emits PM-specific clean/fallback strategies, yarn 4+ semantics). DEPS-OPS-1 successor should therefore locate the instance-level npm-only operations source for this workspace (list_configured_operations returned [] at head - check instance .guidance config vs scaffolded defaults) and apply/parameterize per-workspace PM (yarn) rather than build PM support from scratch. WF-3: npm must never run at the yarn root.

What's left: successor 1 (CHFIX-11-R1 step), successor 2 (DEPS-OPS-1 step); no parallel writers on this checkout during their completion gates (lesson 2026-09-26).

Current State: head completed verification-only cycle; successors pending.

## 2026-10-09 - CHFIX-11-R1 resolved (chain successor 1, session-fca4ca8f, feature/chfix-11-r1-docs-f2)

What works: (F-3) design decision documented in servers/server-guidance/README.md "Pin persistence and co-running engines (design decision)" — supported wirings, merge-on-save rationale, resurrection hazard, fail-closed direction, CONDITIONAL self-heal, blocking re-assessment requirement for any multi-engine-per-stateDir wiring; no guard code (per user decision). (F-2) ClientManager.assertNotDrifted + FR-042 unit test removed after dual evidence (GitNexus impact upstream: 0 callers, UNKNOWN-risk note honored via repo-wide grep; def+test only). Verification: client-manager.test.ts (19) + capability-repin.test.ts (4) = 23/23 green; tsc --noEmit clean. remaining-work-plan.md reclassified (F-2 fixed, F-3 documented, F-4 unchanged accepted).

What's left: successor 2 (DEPS-OPS-1: parameterize deps-install per-workspace PM — PM generation exists in ConfigAssistant; locate instance npm-only operations source); merge of feature/chfix-11-r1-docs-f2 (user decision).

Current State: code+docs change on feature branch; awaiting review + completion.

## 2026-10-09 - DEPS-OPS-1 resolved (chain successor 2, session-c686501b, feature/chfix-11-r1-docs-f2)

What works: workspace .guidance/operations.json parameterized to the yarn profile (decision DEC-DEPSOPS-1): deps-install = corepack yarn install --immutable → corepack yarn install; deps-reinstall = corepack yarn install. Container-verified: bare yarn shim = 1.22.22 (no --immutable), corepack yarn = 4.6.0 — hence the corepack wrapper. npm never installs at this root (WF-3); EACCES fallback path eliminated; README dependency-bootstrap section generalized to per-workspace PM parameterization. Config loads (guidance calls parse operations.json cleanly post-edit).

What's left: merge of feature/chfix-11-r1-docs-f2 (both successor commits) — DONE: merged to develop as 23d8f77 (no-ff) after full suite 734/734; feature branch deleted; develop ahead 3 of origin (push pending). Optional follow-up: corepack-enable in the container image so plain `yarn` resolves 4+ (tracked in remaining-work-plan.md).

Current State: config+docs change on feature branch; chain complete after this session.

## 2026-10-09 - Import cycle fixed + corepack yarn shim (session-0bebc4bf, feature/cycle-fix-corepack-yarn)

What works: (1) Import cycle config.ts ↔ workspace-registry.ts broken — ConfigurationError moved verbatim to types/errors.ts (leaf module, home of GuidanceError); workspace-registry.ts's config.js import dropped entirely; sole external importer was the cycle partner, no re-export needed. Verified: tsc clean, full suite 734/734; GitNexus repository-analysis gate must re-confirm post-reindex (reindex in completion phase). Impact-gated: upstream impact CRITICAL (hub symbol) resolved via dual evidence (text search: only workspace-registry imports it from config.js) + suite. (2) Dockerfile `corepack enable pnpm yarn` (mirroring the existing pnpm rationale); temp-tag image build + docker run PROOF: bare `yarn --version` = 4.6.0 in /workspaces/Thinking-MCP (was 1.22.22). Running stack NOT recreated (user decision).

What's left: stack recreate to activate the new image; merge decision; push decision. — DONE (2026-10-09): merged to develop as 4e405c9 (pre-merge detect_changes: critical risk classified as verified-safe relocation per Review Evidence Protocol); branch deleted; guidance container rebuilt + recreated (healthy; bare yarn = 4.6.0 live-verified; guidance MCP responsive). Remaining: push (develop ahead of origin) — user decision.

Current State: two scopes implemented on feature branch; verification green.

## 2026-10-09 — GN-D7: Frische-Gate-Skip + Self-Healing-Reindex gemerged

**What works:** develop @ bdc68eb enthält GN-D7 vollständig: generischer SQLite-Sidecar-Skip in der Frische-Gate (beendet die unheilbare REMEDY-Schleife gegen die laufende Insight-DB) + gitnexus-reindex-Auto-Op (Design 1(b), inkrementell, Submit+Poll gegen die gitnexus-HTTP-API aus dem guidance-Container, Stats-Restore + Frische-Stempel gegen EPERM auf root-owned Dateien), beforeExit VOR index-freshness. Bewiesen in drei Ebenen (Unit/Contract-Tests, Container-Exec, agent-seitiger run_operation nach Neustart); zwei Reviews 0 HIGH/CRITICAL; Branch gelöscht.

**What's left:** Push nach origin (3 Commits ahead); WSL-Legacy-Registry-Aufräumarbeiten (optional); GN-D5 (Generator-URL-Topologie) und CHFIX-9 bleiben mit Triggern getrackt.

**Current State:** Guidance-Container lief bereits mit der Op-Komposition (Probe-Session grün); Stack 5 Services über -f-Kette; Frische-Gate grün trotz aktiver Insight-DB.

### 2026-10-07 (Chain complete): followups scope A2/B1/C2 on feature/017-followups
- Session e658e3a5 (head, A2): clarify self-declaration guard — variant understand requires {clarify:{asked, blockerId?}}; asked=true needs an ANSWERED clarify blocker; violations rejected (spec_kit_clarify_declaration_invalid); declarations audited. c754c17/3f408ba.
- Session c8098fa8 (B1): read-only tool next_feature_number (FR-10 wired). f106351/0dfb1f3/1966f88/8005deb.
- Session 5a438c3c (C2): limits fail-closed + bridge diagnostics passthrough + per-entry audit semantics documented. e413e05/1b78cf8/1d774a3.
- All sessions completed with green gates; suite 752/752 green; typecheck clean. A3/B2/C3 tracked as OPEN follow-ups; chain-successor silent-end engine-bug candidate tracked (medium, 2 repros). Next: merge review of feature/017-followups into develop, push (user-side SSH).

### 2026-10-07 (Merge): 017 follow-ups chain (A2/B1/C2) merged to develop
Fast-forward onto linear history (develop had advanced in the meantime; merged clean, no conflicts). Scope: clarify self-declaration guard (A2), next_feature_number tool (B1/FR-10 wiring), limits fail-closed + bridge diagnostics (C2). Suite 754/754 green post-merge, typecheck 0 errors (baseline eliminated earlier in the chain). Branch deleted. Tracked follow-ups: A3/B2/C3 options, chain-successor silent-end engine-bug candidate (2 repros). Push pending (user-side SSH).

### 2026-10-07 (Merge): chain silent-end fix merged to develop
Fast-forward 875e808..12d51e1 (4 commits: finalize hardening [report-loss fix], chain_end_without_successor latched diagnostic, 2 regression tests, memory-bank lifecycle). Root cause empirically pinned: in-process finalize path proven working; production silent end lives in the routed/child-engine topology — instrumented (chain_end_without_successor, latched) and tracked OPEN[medium] until a production occurrence is diagnosed. Suite 756/756 green, typecheck 0 errors post-merge. Branch deleted. Push pending (user-side SSH).
