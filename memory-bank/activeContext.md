# Active Context — Thinking-MCP

> Current work focus, recent changes, next steps.
> Update after every significant change (AGENTS.md → Memory Bank Protocol).

## 2026-10-09: CHAIN SUCCESSOR 2 (CHFIX-12 chain) — session_not_found messages rewritten (session-b5a4c381, feature/chfix-12-session-messages)

- All four message sites now state the true condition (file-backed persistence, composition-check-first guidance, README restart-section reference, new workflow only as last resort); error code/leading token/recoverability byte-identical; consumer-safety assumption verified experimentally (no test pins, full suite 731/731 green, tsc clean).

## 2026-10-09: CHAIN SUCCESSOR 1 (CHFIX-10 chain) — EMMS artifact resolved (session-a4a78bf2)

- All 4 pending-lessons verified retrievable in the EMMS store (distinct experience ids, exact-slug top hits via experience_search); artifact .guidance/state/pending-lessons-chfix235.json deleted after positive verification; CHFIX-10 RESOLVED with evidence in remaining-work-plan.md; DEPS-OPS-1 typo fixed (shared-workspace → shared-workflow, head reviewer's recommendation). User decision recorded for successor 3: CHFIX-11 = HYBRID re-pin.

## 2026-10-09: CHAIN HEAD STARTED — 3-step follow-up chain CHFIX-10/CHFIX-12/CHFIX-11 (session-3e8e7829, verification-only)

- Chain registered and server-side verified (chainSpec persisted, chainIndex 0, no step workflowIds — registry trap avoided): successors in order (1) CHFIX-10 (verify the 4 CHFIX-2/3/5 lessons exist in the EMMS store, then remove the transported artifact .guidance/state/pending-lessons-chfix235.json — file confirmed present), (2) CHFIX-12 (rewrite the three session_not_found message sites that falsely claim sessions 'do not survive a server restart'), (3) CHFIX-11 (in-process capability re-pin; design fork admin-op vs auto-re-pin vs hybrid — head recommendation HYBRID, successor must checkpoint the user via report_blocker if the chat answer is absent).
- Head scope: coordination/verification only — no steps[] implementation.
- CHFIX-11 design fork RESOLVED by the user (2026-10-09, chat): option (c) HYBRID — auto-detect marks the drift + audit event, but the re-pin requires an explicit release/confirmation of the conscious infra event. Successor 3 implements hybrid; the report_blocker checkpoint is obsolete.
- Constraints for all successors: local git only (network git prompts for an SSH passphrase — user directive), index refresh via 'bash scripts/reindex-via-api.sh /mnt/d/repos/thinking-mcp' before complete_workflow, English artifacts, resubmit-on-transient-required-hook-failure (known successor-spawn race).

## 2026-10-09: memory-bank translated to English (user order)

- All six German-language memory-bank files (activeContext, remaining-work-plan, progress, lessonsLearned, decisions, systemPatterns) translated to English via parallel sub-agents with disjoint file scopes; technical invariants (IDs, hashes, commands, paths, quoted error literals) preserved byte-identical; one deliberate exception: the FT-AXRAY-DE entry quotes the German marker keywords that assumption_xray detects (feature documentation, must stay verbatim). Completes the English-only migration alongside the AGENTS.md translation (resolves review finding F3 fully). Line counts within tolerance; structure verified (no split artifacts). Together with the guidance-chain translation convention, future entries are English-only per the existing Language Convention rule.

## 2026-10-09: AGENTS.md translated to English-only (user order)

- The Guidance-MCP-Server deployment section (the only German block) is now English; technical invariants (commands, error codes, paths, mounts) byte-identical; backup protocol followed (AGENTS.md.bak created and removed after verification); clearthought consistency check passed. Resolves the rule-file side of review finding F3 (German memory-bank entries remain grandfathered).

## 2026-10-09: CHAIN SUCCESSOR 1 — GN-D6 API reindex implemented (session-7c6ae379, feature/gn-d6-api-reindex)

- **Implemented:** The canonical reindex was switched to the gitnexus HTTP API (job semantics submit+poll instead of blocking wsl.exe CLI). New `scripts/reindex-via-api.sh` (POSIX sh, suitable for Git Bash and WSL; default server http://127.0.0.1:4747, `GITNEXUS_URL` overridable; 5 s poll, 900 s timeout, fail-loud on unparseable status). `gitnexus.reindexCommand` synchronized across guidance.json, AGENTS.md (Architecture Map + Guidance section) and responses.json (Complete-Instruction); the freshness gate's REMEDY line renders the new command automatically (verified). The WSL CLI remains the documented fallback and the ONLY path for `--force` storage healing.
- **Important side finding (API contract pinning via container source inspection):** The API analyze knows NO no-stats (body fields: path|url, force, embeddings, dropEmbeddings, token, branch) and always writes the symbol/relationship counts line into AGENTS.md/CLAUDE.md. Script fix: line-precise restore of the stats line PLUS mtime preservation (`touch -d @epoch`) after job completion — content restore alone would make the file mtime-newer than the index and inevitably fail the index-freshness gate. Concurrent submits are safe (the server deduplicates running jobs per repo).
- **Verification:** Live run end-to-end (job 0→100 %, exit 0), stats restore automatic, `check-index-freshness.mjs` green (mtime), identity `/mnt/d/repos/thinking-mcp` unchanged, tree contains only the intended changes.
- **Trap born:** write_file produces CRLF in .sh files on this Windows setup → dash throws misleading syntax errors ("word unexpected expecting do/in") — normalize to LF after creation (`sed -i 's/\r$//'`). Recorded in lessonsLearned.md.

## 2026-10-09: CHAIN SUCCESSOR 2 — GN-D5 URL topology decoupled (session-a073a6b4, feature/gn-d5-url-topology)

- **Implemented:** The GitNexus URL topology (reachability: compose-dns|host-gateway) is no longer coupled to the writer mode. New optional question `gitnexusTopology` (default derived from mode, unknown values fail-closed); `gitnexusUrl()`/`buildPolicies()` (downstream URL, containerRoute, egress allowlist) keyed on topology; `deriveAdoptGn` derives the topology in the adopt path from the LIVE reference downstream URL (host.docker.internal/localhost/127.0.0.1→host-gateway, otherwise compose-dns; fallback derived from mode) — the mixed shape (local-cli writer + compose-DNS server, this workspace) is therefore regenerable. F-2 closed: {{GITNEXUS_URL}} token rendering in the adopt path is now regression-tested (pure + mixed + stdio).
- **Deviation:** Phase desync at session start — submit_understanding failed on a transient required_hook, retry_operation advanced understand→plan without an understanding submission (submissions.understand empty); the understanding content was carried fully in the plan (thoughts 1–2). Noted as a possible GND1-near engine anomaly (candidate for the successor-3 look).
- **Environment incident:** /tmp (tmpfs 7.8G) filled up by ~4700 relocated-venv test residues → 5 E2E fails "No space left on device"; scratch cleaned (rm -rf /tmp/relocated-venv-* /tmp/guidance-py-e2e-*), afterwards full suite 727/727 green, tsc clean. The earlier fails were environment-caused, not diff-caused.
- **Branch:** feature/gn-d5-url-topology (from develop; files disjoint from feature/gn-d6-api-reindex — merge order arbitrary, only memory-bank can conflict).

## 2026-10-09: CHAIN SUCCESSOR 4 — CHFIX-9 evidence-closure path A (session-f0015ea9, feature/chfix-9-session-persistence)

- **Premise refuted (2 regression tests):** Sessions survive restarts at the ENGINE and POOL level (SessionRepository file-backed; the registry-only instance re-resolves workspace sessions after a restart simulation). The live loss (session-78776317) lies above that layer (MCP transport 404/-32001 or boot/mount timing) — not reproducible in-process.
- **User decision:** Path A (evidence closure + README refinement) NOW; merge of the four branches in recommendation order gn-d6 → gn-d5 → gnd1 → chfix-9; path B (live restart experiment with an active session) after merge + container rebuild.
- **Implemented (path A):** README recovery recipe extended (restart semantics: what survives / what does not / correct recovery per layer / never delete session files); CHFIX-11 (in-process re-pin) split out as its own follow-up; CHFIX-9 resolved with evidence.
- **Branch:** feature/chfix-9-session-persistence (stacked on the gnd1 tip): 2 restart-survival regression tests + README + memory-bank.

## 2026-10-09: CHAIN SUCCESSOR 3 — GND1 successor probe test + desync fix (session-0046f81b, feature/gnd1-probe-residuals)

- **GND1-TEST-1 solved:** Dedicated chain-successor probe test in capability-skip-semantics.test.ts (plainOps fixture variant + makeChainedEngine): chained head → completeWorkflow → the successor session gets EXACTLY ONE capability_state_deviation {kind required-unreachable, source probe} (bounded poll, no sync assumption), exactly-once via the creation path + manual re-probe, head event independent.
- **GND1-DESYNC-1 FIXED (unplanned, but in scope via a plan qualifier):** Root cause in retryOperations — after green re-run ops the phase advanced UNCONDITIONALLY (selectTransition(true)) without checking whether any submission for the phase had been recorded at all; with an empty beforeExit, retry_operation was a free phase advance. Exactly the live desync from GN-D5 (2 occurrences: submitUnderstanding→required_hook_failed transient, retry→phase skipped with submissions:{}). Fix: a guard holds the transition when there is no phase submission (complete excepted — pendingCompletion is the equivalent there, GDS-6); a regression test in chain.test.ts pins both directions (no advance without submission; a normal submit still advances).
- **Residuals (a)–(g) re-verified — all 7 unchanged, accepted:** (a) flag-less transport errors classify as capability-absent (taxonomy limit, documented in code); (b) stdio spawn of a required server at session start (intended gate symmetry); (c) one duplicate deviation event per process lifetime after a restart (cosmetic, comment at capabilityDeviationsNoted); (d) composite steps force required:true (a future optional composite gate could not skip — trigger remains); (e) consumeApprovals keeps grants on skip (conservative); (f) sticky "unreachable" when losing the timeout race (exactly-once guard, audit-only); (g) the REAL ping test awaited manually — no ordering risk in the test, race only vs the gate detector (documented). No need for code changes.
- **Verification:** 37/37 targeted (chain + capability-skip), full suite 723/723 green, tsc clean.
- **Branch:** feature/gnd1-probe-residuals (from develop; WorkflowEngine guard + 2 test files).

## 2026-10-08: CHAIN HEAD STARTED — 4-step follow-up chain GN-D6/GN-D5/GND1/CHFIX-9 (session-1fa1ffca, verification-only)

- **Chain registered and persisted server-side** (get_workflow_state verified, chainIndex 0): successors in order (1) `gn-d6-api-reindex` (switch the reindex to the gitnexus HTTP API: synchronize reindexCommand/AGENTS.md/REMEDY, wsl CLI as fallback), (2) `gn-d5-url-topology` (decouple URL topology from the writer mode + GITNEXUS_URL render regression test), (3) `gnd1-probe-residuals` (dedicated chain-successor probe test + per-residual decision a–g), (4) `chfix-9-session-persistence` (HIGH: sessions survive a server restart — disk reload/in-process re-pin + README refinement).
- **Head scope:** purely coordination/verification — NO implementation of steps[] scope under the head (duplication trap for successor 1). Checkout develop @ 3709b1c, tree clean.
- **Warning to successors:** parallel-agent risk on this checkout (observed 2026-10-08 on WorkflowEngine.ts) — before starting, check memory-bank/activeContext.md for competing sessions, minimal write scopes, feature branch feature/<id>-… . The chain is vulnerable to a guidance server restart until CHFIX-9 (the last step) takes effect (session-78776317 precedent).
- **Re-registration (session-779d9023):** The first registration (session-1fa1ffca, cancelled) failed only at completion — the chain-step `workflowId` has been resolved as a registry reference since specs/017 and failed closed (`workflow_not_found`); steps now carry NO workflowId (successors inherit standard-development). Lesson recorded in lessonsLearned.md. The head artifacts remain valid: 83945f7 + c9cfb8f (review APPROVED, 0 HIGH/CRITICAL).

## 2026-10-08: CHAIN STEP 3 — documentation consolidation of the wsl-writer architecture (session-b5650a19, feature/gn-chain-step2)

- **Implemented:** Topology documentation unified to the live wsl-writer world — AGENTS.md topology bullet (WSL CLI = single writer, container = read-only dual-mount reader, container analyze forbidden; backup + contradiction check per the rule protocol), .guidance/responses.json Complete-Instruction (wsl.exe reindex instead of container analyze; rebind path verified live), docker-compose.gitnexus.yml header, README (deployment block + working-sample table; the generic container-mode example remains). GND1-DOC-1 resolved; lessonsLearned entry wsl-writer identity unification added; GN-D1/D3/D4/GN-5 resolutions were already committed from step 2.
- **Verification:** docs-drift green, full suite green, fresh wsl.exe reindex after the last commit, final-review ceremony with a fresh sub-agent.
- **Chain:** Step 3 = end of the chain (no further successors). Merging feature/gn-chain-step2 → develop + push is up to the user.

## 2026-10-08: CHAIN STEP 2 — GN-D1 tri-state gates + hybrid probe (session-11bb76a9, feature/gn-chain-step2)

- **Implemented (commits a75a3a6, 44571ae + review-fix commits):** (1) `OperationStatus`/`OperationOutcome`/`GateEvent.phase` additively extended by `skipped` (canonical shared-workflow + 3 vendored copies synchronized, hash tests green); (2) OperationEngine: connection-level transport errors on optionally declared servers → `skipped(capability-absent)` with a loud warning — only NON-required (required fail-closed regression-pinned); timeouts/expired sessions remain failed (review F2); reachable servers with tool errors → failed + `optional_capability_broken`; (3) WorkflowEngine: minimal-additive read path `config.main.gitnexus.state` → `setOptionalCapabilityServers` (local + remote engine); (4) hybrid probe at session start AND chain-successor creation (fire-and-forget, max(5s, handshake+1s), off pings only http leftovers, `capability_state_deviation` exactly-once, gate time signal shared); (5) generator texts (wizard help, advisory description, reindex step) brought onto the new semantics.
- **Verification:** Suite 721/721 (19 new tests: 9 unit + 10 engine-level incl. real-ping live test), tsc clean, detect_changes: CRITICAL expected (engine core) → full review: independent review 1b74ed1e (F1–F9, all fixed/documented/refuted) + re-bless VERIFIED + final review f0532eee **0 open HIGH/CRITICAL**; metacognitive_monitoring 0.86.
- **Important for step 3:** GND1-DOC-1 — the AGENTS.md topology bullet + responses.json Complete-Instruction still describe the old container-writer world; live is wsl-writer (canonical reindex: wsl.exe from guidance.json). Unify in step 3.
- **Chain:** Step 2 complete → the engine spawns step 3 (documentation consolidation) automatically.

## 2026-10-08: GITNEXUS OPTIONAL-DECOUPLING PHASE 1 — Guidance session session-791af4dc, feature/gitnexus-optional-decoupling

- **FINAL:** 4 commits 3ec9b88→ff2177a; FINAL REVIEW PASS (0 HIGH/CRITICAL; mid-session review 1H+3M fixed, final review GN-FR-1/3/4/5 fixed, GN-FR-2/6/7 → GN-D4, F-6 → GN-D3). Suite 693/693, tsc clean, gates green (final-review + index-freshness).

- **Goal achieved:** Guidance as a product is GitNexus-agnostic — tri-state declaration (`gitnexus.state` required|optional|off + `mode` local-cli|compose-container + `reindexCommand`) in guidance.json, asked for/shown by the config assistant; all renderings (responses step, gates, downstream, workflow) conditional; the alone test pins `off` = null GitNexus references; base compose only 3 services, GitNexus in the opt-in overlay `docker-compose.gitnexus.yml`.
- **Deviation from the plan:** The generator does not emit an index-freshness op (was never part of the generator — manual workspace addition); the alone test refers to the four generator artifacts.
- **Incident (lesson!):** DrvFs partial-write incoherence — sed -i from Git Bash produced a file with MIXED states (declaration new, usage old); tsc/vitest saw the incoherence, the esbuild output was correct. Solution: ONE writer (edit_file) + verification with the consumer toolchain.
- **Verification:** Suite 690/690 (6 new tests: alone + matrix 3×2 + REMEDY 4); tsc clean; compose base 3 / merged 5 valid; live REMEDY prints the guidance.json command.
- **Open (phase 2, tracked):** tri-state gate states (skipped-capability-absent) + hybrid probe in the engine — GN-Decouple-P2; optional semantics gap (never-installed vs broken) documented.

## 2026-10-08: GN-MIGRATION IMPLEMENTED (Option A+D) — Guidance session session-67baca0b, feature/gn-gitnexus-compose-integration

- **Implemented:** gitnexus-server + gitnexus-web as compose services (root docker-compose.yml, full `/workspaces` mount, registry on the host side under `D:\repos\.gitnexus-home`); standalone container decommissioned; all three pool repos registered via `docker compose exec gitnexus analyze` with in-repo storage (thinking-mcp 10.380 nodes/480 flows, Niyama 8.782/156, copilot 262/255); live pickup without restart proven (AC-6); legacy volume deleted (Q3); REMEDY/responses/generator/template switched to docker-exec reindex (CHFIX-6+GN-3 co-solved); safe.directory command wrapper against git-dubious-ownership; tests 684/684 green, tsc clean.
- **Reviews:** Mid-session independent review 0 HIGH/CRITICAL (F1/F2/F3/F5 fixed in bd283e1, F4/F6 → GN-7/GN-8 tracked); FINAL REVIEW (fresh sub-agent, develop..HEAD): **PASS, 0 HIGH/CRITICAL** — FR-1 (README operating-notes WSL restart, MEDIUM) + FR-2/FR-3 (operations.json descriptions, LOW) fixed directly in the wrap-up. Metacognition 0.88 (4 documented uncertainties). Verify-gates lint+build green server-side.
- **Commits:** fb47d17 (GN docs) → 787571a (migration) → bd283e1 (review fixes) → wrap-up commit (FR-1..3).
- **Open after session end:** GN-5 (port hardening), GN-6 (lastCommit populate — verifies itself at the wrap-up reindex), GN-7 (nested-worktree REMEDY), GN-8 (ops drift guard), GN-9 (new, from the final review: leftover wording in unchanged README segments was pre-existing — done with the FR-1 fix; no separate entry needed).

## 2026-10-08: GITNEXUS INTEGRATION ANALYSIS — two-registry divergence uncovered (GN-1..GN-4)

- **What happened:** During copilot-repo-template onboarding the `repository-analysis` gate failed twice (first server unreachable, then `Repository not found. Available: thinking-mcp`), although `gitnexus analyze` ran on the WSL side. The fix was a `docker cp` of the repo INTO the gitnexus-server container (/tmp — ephemeral) + an in-container index.
- **Root cause (evidence: docker inspect + both registry files + guidance audit history):** TWO separate GitNexus worlds exist — (a) gitnexus-server container (:4747, mounts only Thinking-MCP → /workspace, own registry /data/gitnexus/registry.json — the thinking-mcp index there STALE since 2026-10-01) and (b) WSL CLI (in-repo .gitnexus + ~/.gitnexus/registry.json). A WSL reindex is invisible to the container. The two completion gates check two different indexes and both report green.
- **Documentation update:** AGENTS.md topology wording refined (containers explicitly named: gitnexus-server container vs. guidance container vs. WSL CLI; two-worlds warning; reindex command unified lowercase — settles CHFIX-7). Backup AGENTS.md.bak updated; Clear-Thought contradiction check (route 3, direct HTTP call after the route-1 404): no contradictions.
- **Open (architecture decision):** Alternatives A (gitnexus-server in root compose with the full D:\repos mount, in-repo storage), B (move the MCP server to WSL), C (status quo + docker-cp procedure — rejected), D (move analyze into the container). Decision pending; see GN-1/GN-2/GN-3 in remaining-work-plan.

## 2026-10-08: CHFIX-2/3/5 SESSION COMPLETED (with an infrastructure incident) — Commit 6128cd8 on feature/form-b-chain-fix

- **Work complete:** CHFIX-2 (REMEDY line in the freshness gate + 3 regression tests, validated LIVE — the gate failed during completion with exactly the right REMEDY), CHFIX-3 (recovery recipe README + AGENTS.md pointer), CHFIX-5 (FR-004 timeout 60 s; full suite 683/683). Final review (sub-agent 8cc483f1): 0 HIGH/CRITICAL, F-1..F-6 → CHFIX-6/7/8 tracked. final-review.json validated (EXIT=0). Commit 6128cd8 (9 files, +227/−21).
- **Infrastructure incident (IMPORTANT):** At completion, `repository-analysis` failed with `downstream_capability_changed` (gitnexus:check schema-pin drift after reindex + GitNexus restart). Pin reset (capability-hashes.json) + guidance restart → **session operationally lost**: sessions are workflow-run-scoped and do NOT survive a server restart (the disk file remains, but is not re-loaded). complete_workflow never formally went green; the session file is an archive. → CHFIX-9 (HIGH) tracked; 4 lessons seeded in EMMS (incl. capability-pin-reset-requires-server-restart).
- **Open:** documentation additions (CHFIX-9 refinement in the README recipe) uncommitted; merge to develop + container rebuild pending.

## 2026-10-08: CHFIX-2/3/5 IMPLEMENTED — Guidance session session-78776317 (feature/form-b-chain-fix)

- **What:** Implemented three tracked follow-ups of the Form-B fix: (CHFIX-2) `check-index-freshness.mjs` fail() now prints an agent-suitable REMEDY line (the exact `wsl.exe … gitnexus analyze --no-stats` command, lowercase-cwd KA-4) to stderr → OperationEngine passes it VERBATIM into exposedOpResult.errors[0].message; chain-driving agents self-heal without an AGENTS.md reminder + `retry_operation`. A server-side reindex was not an option (no gitnexus in the container + KA-4 foreign-path trap). (CHFIX-3) recovery recipe "Recovering a chain after agent/context death" in the README (incl. the discovery fallback via .guidance/state/sessions/ from the plan review) + AGENTS.md pointer (backup protocol followed). (CHFIX-5) engine.test.ts FR-004 per-test timeout 60 s.
- **Validation:** typecheck EXIT=0; full suite 683/683 (88 files) incl. FR-004 under load; 3 new regression tests (stale→REMEDY, no-git→REMEDY, fresh→no REMEDY); prettier clean. Metacognition 0.93, 3 documented residuals.
- **README hygiene touch-up:** removed an internal feature-ID reference ("specs/018 …") from the chain-fix section (rule: behavior instead of process history).
- **Status:** the session's verify phase runs next; commit (T4) after complete_workflow.

## 2026-10-08: FORM-B CHAIN FIX implemented — feature/form-b-chain-fix (from develop@c8e0f47)

- **What:** Fixed three defects that had prevented long unattended Form-B chains: (1) `import_spec_kit_artifacts` now maps `checkboxChecked` → `status:"completed"` (previously: hard `pending` for all 74 tasks → the chain would have run T001 again; DEVIATION from specs/017 FR-066/SC-011, user-approved — the tasks.md checkbox is the cross-session progress interface; `checkboxAtImport` remains the audit trail, `complete_task` itself remains evidence-gated). (2) Spec-Kit state inheritance to chain successors (`inheritSpecKitState` hook in `createChainSuccessorLocked`, factory `createSpecKitBridges` in main.ts) — successors had a new sessionId WITHOUT a state file → the bridge returned [] → silent chain end after 1 task. Additionally: `engineForWorkspace` now passes the bridges on to child engines (`childBridges`) — in pool operation Form B was therefore STRUCTURALLY dead. (3) Start-time depth pre-check: `start_workflow` counts unchecked tasks in tasks.md and warns non-blockingly (`warnings[]` in StartResult) when `maxChainDepth < unchecked+1`; per-manifest `chain.maxChainDepthOverride` (int 1..512) as a temporary adjustment; config cap 64→512 (specs/018: 74 tasks). `buildReconciledState` now respects the import status of new tasks instead of hard pending.
- **User decisions:** user-decision gates stop the chain (intended); a sequential chain suffices (no parallel agents); the context-drift objection was dismissed — guidance injects tightly guided prompts per phase (the planned usage scenario).
- **Validation:** typecheck EXIT=0; targeted vitest 65/65 (chain+speckit); full suite 679/680 — 1 pre-existing/environmental timeout (engine.test FR-004, 25s green in isolation, 30s limit under full-suite load on WSL//mnt/d); prettier clean; detect_changes: 9 files/12 symbols, only intended changes. WF-1 evidence: all 3 CT routes failed once each (editor MCP 404, call_downstream without a session unsuitable, curl parse error) — inline planning documented.
- **Open (solution proposals in chat, not yet commissioned):** automate the index-freshness gate (reindex op in the completion lifecycle), chain recovery docs/tooling after an agent crash, phase-boundary filter (F1 from the 018 context), follow up the SC-011 deviation in the specs/017 docs. Commit still pending (not explicitly commissioned).

## 2026-10-07: Phase 0 (M0) COMPLETED — all decisions approved (DEC-GBEA-M0)

- **What:** The user approved all M0 proposals unchanged (after the ADR-1 explanation in chat). Decisions recorded as **DEC-GBEA-M0** in `memory-bank/decisions.md` (ADR 1–8 + proof signing Ed25519 + config default). The three M0 documents in `specs/018-guidance-beads-execution-adapter/` flipped from PROPOSED to **ACCEPTED** (m0-adr-proposals.md, m0-implementation-contract.md — now binding for AC-A3, m0-beads-v1.3-baseline.md — binding for mapping v1 + golden fixtures). Tasks T001–T005 checked off in tasks.md. M0 exit reached: ⏳ADR gates (T013/T024/T066) unblocked, phase 1 (WP-01 adapter core) can start.
- **Status:** Phase 0 complete, everything uncommitted. **Next:** commit decision (SDD trilogy + M0 documents + decisions.md); then phase 1 start (feature branch `feature/018-wp01-adapter-core`).

## 2026-10-07: Phase 0 (M0) started — decision templates created, waiting for user approval

- **What:** Phase 0 of the specs/018 tasks started. Three M0 artifacts under `specs/018-guidance-beads-execution-adapter/`: (1) `m0-adr-proposals.md` — ADR 1–8 + proof signing (Ed25519, SQLite nonce store) + config default, each with options, RFC constraints, recommendation and repo evidence; (2) `m0-implementation-contract.md` — shared rules + 22 methods (9 agent-facing, 13 admin) with authn/authz/idempotency/error-codes/audit events and WP ownership; (3) `m0-beads-v1.3-baseline.md` — Beads-1.3.0-conformance baseline (statuses/types/priorities/dependencies/metadata/store/stealth) + golden-fixture checks.
- **Evidence gathered:** server-guidance persists JSON files (SessionRepository/AuditRepository), no SQLite/crypto/canonicalization present; `bd` is NOT installed on the host (real-backend tests need a pinned 1.3.x installation).
- **Status:** all three documents PROPOSED; T001 waits for user approval of the ADR decision matrix, then transfer into `memory-bank/decisions.md` + status flip to ACCEPTED. **Next:** user decision on ADR 1–8/T003/T005.

## 2026-10-07: specs/018 tasks.md created — task breakdown (speckit.tasks)

- **What:** `/speckit.tasks` for spec 018: `specs/018-guidance-beads-execution-adapter/tasks.md`. 74 tasks (T001–T074) in 6 phases (M0–M5), a complete 1:1 mapping of all plan tasks (WP-00..WP-10, T00.1–T10.11); every task with an `[WP-x.y]` back-reference, RFC § anchor and `Verify:` gate (§26 suite/§25 criterion). ⏳ADR gates: T013 (ADR-6), T024 (ADR-3), T066 (ADR-7). Completion gate = RFC §29 DoD.
- **Status:** SDD trilogy spec.md/plan.md/tasks.md complete, uncommitted. **Next:** user review; then start with phase 0 (WP-00, ADR decisions with user approval) — e.g. via the guidance workflow (`start_workflow` workspace `thinking-mcp`) with batch release per phase.

## 2026-10-07: specs/018 plan.md created — implementation plan (speckit.plan)

- **What:** `/speckit.plan` for spec 018: `specs/018-guidance-beads-execution-adapter/plan.md`. 11 work packages: WP-00 (M0 decisions: ADR 1–8, implementation contract, proof signing, Beads v1.3 baseline) + the 10 required packages — adapter core, mapping engine, bindings (incl. persistence + operation journal), projection (incl. ingestion delta), claim coordination (incl. readiness/cache/proofs/marker), validation workflow (completion state machines, receipts, blocker/amendments), reconciliation (M2 detection + M5 resolution workflow), snapshots (event log, ordering, cursor, retention), observability, testing (fake backend, second test adapter, all 10 RFC §26 suites + scale tier).
- **Traceability:** the MUST/SHALL compliance matrix (plan §4) maps every RFC area (§4–§29) to exactly one primary package + tasks; milestone mapping (plan §3) onto M1–M5 per spec 018 §4; ⏳ADR markers for ADR-dependent tasks (T02.1, T03.1, T08.5).
- **Status:** plan.md written, uncommitted. **Next:** user review of the plan; then the speckit breakdown (tasks) respectively start with WP-00 (ADR decisions).

## 2026-10-07: specs/018 created — GBEA implementation spec (speckit.specify)

- **What:** `/speckit.specify` for the Guidance Beads Execution Adapter per RFC GBEA-SPEC-001 v0.6.1-draft. New spec at `specs/018-guidance-beads-execution-adapter/spec.md`: implementation scope (S1–S6), milestones M0–M5 (M0 added as ADR/implementation-contract gate in front of RFC §27 M1), 27 deliverables, acceptance-criteria traceability table (RFC §25.1–25.7 + additive AC-A1..A4), testing strategy mapping all ten RFC §26 suites to vitest layers, 8-stage rollout plan (R0–R5, disabled-by-default, config-reversible), risks (GBEA-F016, Beads version drift, Windows/WSL store-root canonicalization). Precedence rule: RFC wins on any conflict; no normative restatement.
- **WF-1 incident (evidence table):** all three clear-thought routes failed once each in this session — (1) direct MCP tool: "MCP session no longer valid (HTTP 404)" (stale session, known); (2) container route structurally unavailable (no Guidance sessionId in this ad-hoc specify task); (3) direct HTTP `localhost:3000/mcp`: "initialize required". Structured planning continued with documented internal reasoning.
- **Status:** spec.md written, uncommitted. **Next:** user review/approval of spec 018; then speckit plan phase (M0 ADR decisions first).

## 2026-10-07: GBEA review round 5 (minor corrections) applied → v0.6.1-draft

- **What:** External review of v0.6.0 verdict READY FOR IMPLEMENTATION WITH MINOR CHANGES (0 Critical, 2 High, 6 Medium remaining). Evidence-verified: 6 fixed, M-002 false positive (mermaid fence exists), M-006 = documented §28 deferral. Spec at v0.6.1-draft.
- **Lesson (round-4 residue):** H-001 showed that a normative text addition ("blocker reports MUST present fencing token") without the corresponding interface field slips through — when adding requirements to prose, always update the matching TypeScript interface in the same edit.
- **Status:** Spec updated, uncommitted. **Next:** user decision on commit.

## 2026-10-07: GBEA review round 4 (CHANGES REQUIRED) applied → v0.6.0-draft

- **What:** External reviewer findings (4 Critical, 9 High, 11 Medium) verified against v0.5.0 with evidence table; user approved one-round implementation incl. H-009 method renames, and M-010 deferral. All 24 findings resolved (details in progress.md); spec at v0.6.0-draft, 1.974 lines.
- **Note:** Two reviewer claims were partially pre-addressed (C-002 crash-safety detection, H-03 inspect_drift existed) — residual mechanism gaps closed via claim markers and resolve API.
- **Status:** Spec updated, uncommitted. **Next:** user decision on commit (pattern: direct on develop). GBEA-F016 (partitioning deferral) remains the only tracked follow-up.

## 2026-10-07: GBEA external review round 3 applied → v0.5.0-draft

- **What:** External reviewer findings for v0.4.0 (F-013–F-018 + M-001/M-002; all non-blocking) verified against v0.4.1 and applied per user decisions: F-013 version negotiation (§19 + `transport.supportedBackendVersionRange`), F-014 mapping migration procedure (§9.7, receipts immutable), F-017 policySetDigest (package/receipt/readiness/validation), F-015 snapshot chaining SHOULD + anchoring caveat, F-018 **Variant A** (receipts bind to acceptance event, no full chain), F-016 scalability targets §21.2 + partitioning deferred (tracked as GBEA-F016 in remaining-work-plan.md), M-001/M-002 deferred to v1.0 editorial pass (noted §28).
- **Status:** Spec v0.5.0-draft, uncommitted. **Next:** user decision on commit.

## 2026-10-07: GBEA-SPEC-001 v0.4.0 reviewed, fixed → v0.4.1, file replaced

- **What:** Review of the externally revised v0.4.0 draft (13 findings, evidence-verified against Beads v1.3 docs incl. fresh `bd statuses` fetch); user approved all fixes + file replacement. All fixes applied, version bumped to 0.4.1-draft, the version-suffixed file was moved over the canonical `SDD/guidance-beads-adapter-specification-en.md` (old v0.3.0 content deleted; SDD now has exactly one GBEA file).
- **Key facts verified:** Beads statuses are `open/in_progress/blocked/closed` (`done` is a category); worktrees share one `.beads` store; `BEADS_DIR` supports external/shared stores — both broke the v0.4.0 identity formula that hashed the workspace root.
- **Status:** Spec v0.4.1-draft in place, uncommitted. **Next:** user decision on commit (pattern so far: direct on develop).

## 2026-10-07: GBEA-SPEC-001 review round 2 (external reviewer) fixed → v0.3.0-draft

- **What:** External review (6 findings) verified against v0.2.0 with evidence table; user approved fixes incl. Finding 3 = Option A (technology-neutral persistence requirements, tech choice stays ADR 4). Mapping grounded against real Beads v1.3 docs (issues/metadata/labels/dependencies/events-journal pages fetched; facts: types bug/feature/task/epic/chore/gate, priorities 0–4, dependency types incl. blocking vs non-blocking, human gates, metadata reserved prefixes `bd:`/`_`, per-replica at-least-once journal).
- **Added:** §6.6 (schema versioning), §9.6 (mapping spec), §11.3 restart semantics, §16.4/16.5 suspension scopes, §18.1 (event ordering model), §21.1 (persistence requirements); §25.2/25.5 criteria; ADR 2/4/5 narrowed.
- **Bug fixed:** stray code fence in §18 (from round-1 edit) had unbalanced the markdown and hidden §19 from the outline parser — removed; lesson: edit_file old_text must include the full fence context when inserting blocks after code.
- **Note:** grep tool does not index `SDD/` (local exclude) — verify spec content via read_file outline, not grep.
- **Status:** Spec updated to 0.3.0-draft, uncommitted. **Next:** user decision on commit (previous rounds: direct on develop).

## 2026-10-07: GBEA-SPEC-001 reviewed and fixed (SDD, uncommitted)

- **What:** Review of `SDD/guidance-beads-adapter-specification-en.md` produced 13 findings (F1–F13); user confirmed decisions: F2 = Option A (no acceptance revocation), F11 = define stealth from real Beads feature (`bd init --stealth` → `no-git-ops: true`), F1 = full Appendix A, F13 = verify URLs online. All fixes applied to the spec in place; version bumped to 0.2.0-draft.
- **Verification:** grep confirms no stale references (`reopenOnAcceptanceRevocation`, optional `sequence?`, old §25.6 wording); Beads URLs fetched and verified (github.com/gastownhall/beads active, beads.gascity.com at v1.3.0, stealth semantics confirmed from README).
- **Status:** Spec updated, not committed (doc-only change, no branch created — user did not request commit).
- **Next:** User decision on commit/branch; §28 ADRs remain open for the implementation project.

## 2026-10-02: MCP HTTP Keep-Alive-Timeout raised from 5 s to 65 s (feature/mcp-keep-alive-timeout)

- **Symptom:** All MCP HTTP servers advertised `Keep-Alive: timeout=5`; client/agent connections stalled and dropped constantly.
- **Root cause:** All four servers start via Express `app.listen()` → Node `http.Server`. Since Node 19, `keepAliveTimeout` defaults to 5000 ms and Node emits that value in the `Keep-Alive` response header, destroying idle sockets after 5 s.
- **Fix:** In each `servers/*/src/server.ts` listen callback: `server.keepAliveTimeout = 65000` (env-overridable via `KEEP_ALIVE_TIMEOUT_MS`), `server.headersTimeout = +5000`. 65 s sits above common proxy idle timeouts (60 s).
- **Verification:** tsc --noEmit green on all four servers; isolated Node 24 repro on same build: `keepAliveTimeout=65000` → `Keep-Alive: timeout=65`. Local WSL end-to-end run of server dist blocked by known env artifacts (better-sqlite3 dlopen TMPL-2; top-level stdio-import hang in `index.js` when run outside container) — Docker containers must be rebuilt (`docker compose up -d --build`) to pick up the change.
- **Note:** GitNexus + direct Clear-Thought MCP routes both timed out during this session; grep/source verification used as documented fallback (FR-035 pattern).
- **Next:** Commit, then rebuild containers; verify live header via `curl -sI http://localhost:<port>/health`.
- **Review:** independent reviewer (sub-agent, fresh context): **APPROVED, 0 HIGH/CRITICAL**. Snapshot verified (branch, HEAD c64d112, only unstaged diff). Evidence: Node-24 header repro (`keep-alive: timeout=65`) in /tmp, `server.close()` idle-socket repro (1 ms), tsc --noEmit per server exit 0, no tests pin the listen behavior. Residuals tracked as KA-1 (stochastic shutdown asymmetry, LOW), KA-2 (env parse eats 0 values, LOW), KA-3 (container rebuild needed, LOW/ops) in remaining-work-plan.md.
- **Status:** MERGED (fast-forward) into develop @ `1677a9d`, feature branch deleted, review APPROVED (0 HIGH/CRIT). detect_changes before commit: risk `medium`, only expected symbols (startServer/startHttpServer + docs).
- **Status:** DEPLOYED & VERIFIED (2026-10-02). Push, build, deploy by the user; live counter-check: ports 3000/3002/3003 all `Keep-Alive: timeout=65` ✓. Port 3001 (stochastic) is **deprecated** and not deployed — no deployment needed. develop pushed (origin/develop current).
- **Index follow-up KA-4 — SOLVED (2026-10-02):** The root cause was a case mismatch (storage `/mnt/d/repos/thinking-mcp` lowercase vs. mixed-case shell cwd). Reindex with a lowercase cwd succeeded (8.988 nodes / 21.534 edges); detect-changes clean. Rule documented in AGENTS.md (backup `AGENTS.md.bak`). Only the separate MCP timeout problem remains open (GitNexus/Clear-Thought MCP routes time out independently of the index).
- **Open:** MCP timeouts of the direct MCP routes (separate infrastructure topic, not index-related).

## 2026-10-02: REV-RRDO-1/2 processed (Guidance session session-1bb0632b, Commit 9f7bc5f)

- **What:** Closed the coverage gaps from the review of 283fc74: opt-out tool-list test (tools-registration.test.ts — `registryRegister.enabled:false` → `tools/list` excludes `registry_register`, exact surface = WORKFLOW_TOOL_NAMES) + emission assertions (scaffold.test.ts, config-assistant.test.ts AC-6, config-assistant-extensions.test.ts adopt+registry-edit — each `registryRegister: {enabled: true}`). Tests only, no production code change. Full suite 537/537, tsc/prettier green, detect_changes risk low.
- **Note:** the direct Clear-Thought MCP route was again consistently timed out; `reasoning-pass` via the container route (`run_operation`) succeeded — the FR-035 passthrough pattern productively confirmed once more. Final review over the session diff (sub-agent aa18d064): APPROVED, 0 HIGH/CRIT; FR-FINAL-1 (hash ref) corrected hereby, FR-FINAL-2 tracked.

## 2026-10-02: registry_register enabled + profile binding removed (feature/registry-register-default-on)

- **What:** `registryRegister.enabled` is now default-ON with an opt-out (`enabled: false`) instead of default-OFF (config.ts loader, FR-1207); the `spec-kit` profile binding to `registry_register` was removed (ToolHandlers.isRegistryRegisterEnabled, WorkflowEngine.registerWorkspace, register-tools.ts) — rationale: workspace registration is a one-time instance/infrastructure concern, while the workflow type is chosen per `start_workflow`; the profile binding mixed these levels. Both templates emit `registryRegister: { enabled: true }` (scaffold.ts Scaffold + ConfigAssistant registry-edit). The README "Runtime registry registration" table + tool reference line document the new behavior (default ON, opt-out, profile-independent).
- **Tests:** registry-rebind (opt-out test switched to an explicit `flag: false` + a new default-ON/plain-profile regression test), tools-registration + spec-kit-tools-registration (expected surface extended by `registry_register`), http-transport tool count 23→24. Full suite **535/535 green** (68 files), tsc + prettier clean.
- **detect_changes:** risk `critical` (loadConfig/registerWorkflowTools on every boot flow) — intended behavior change, secured by the full suite.
- **Review:** independent reviewer (sub-agent, post-commit review of 283fc74): **APPROVED, 0 HIGH/CRITICAL, 0 MEDIUM**, 2 LOW coverage gaps + 3 INFO (tracked as REV-RRDO-1..3 in remaining-work-plan.md; 1/2 solved in 9f7bc5f, 4/5 added afterwards). Snapshot verified (branch/HEAD/clean tree, review basis = `git show 283fc74`).
- **Next:** merge to develop; a container rebuild is needed until the tool is visible in the running instance (there is no hot reload).

## 2026-10-02: CT-ARGS-1 implemented (feature/ct-args-passthrough)

- **What:** Guidance workflow session-b0c6df8b — `call_downstream` passthrough tool + `run_operation` arguments parameter (deep merge, agent keys win) + `argumentsLocked` fail-closed flag. New tests `tests/contract/call-downstream.test.ts` (12, in-process HTTP MCP stub); http-transport tool count 22→23. Full suite 516/516 (9 skipped), tsc clean.
- **Review:** independent reviewer (sub-agent): CHANGES REQUIRED (1 HIGH redaction, 2 MEDIUM router-override drop/cancel semantics) → all fixed (d1f0c7d), re-review: **APPROVED, 0 open HIGH/CRITICAL** (residuals tracked as CT-ARGS-2).
- **Live evidence in the workflow:** the direct Clear-Thought MCP route was consistently timed out (4×), the container-route fallback (`reasoning-pass`) succeeded every time — FR-035 behavior productively confirmed; after CT-ARGS-1, parameterized reasoning passes (`assumption_xray` etc.) are usable via `call_downstream`.
- **Next:** merge to develop.

## 2026-10-02: Clear-Thought operations generated for the container route (46 new ops)

- **What:** `.guidance/operations.json` extended with `ct-*` mcpTool operations for ALL Clear-Thought tools (38× `read_only`, 8× `external_write` for session_save/load/import, session/recipe_runner/workflow/stochastic toolsets — not idempotent, therefore deliberately NOT fallback-eligible). Capabilities verified against `server-clear-thought/src/tools/tool-metadata.ts` + toolset slugs; JSON validated via the Node parser (47 Clear-Thought ops incl. reasoning-pass).
- **Finding / runtime limitation:** `run_operation` does NOT accept agent arguments (register-tools.ts L280: only sessionId+operationId); mcpTool ops pull args exclusively from `arguments` (fixed/template). The new ops are therefore immediately functional for parameterless tools (session_info/export, existing_tool_example) — parameterized tools need either fixed args in the op entry or a future downstream passthrough. Tracked as CT-ARGS-1 (remaining-work-plan.md).
- **Next steps:** restart the guidance container / reload the config (`docker compose up -d` respectively re-initialize the session), then smoke test: `run_operation(ct-session-info)` via the container route.

## 2026-09-30: Guidance container start crash fixed (wrong /workspaces mount)

- **Symptom:** Container crashed at startup with `EACCES ... mkdir '/workspaces/.guidance'` (scaffold.js).
- **Root cause:** Outdated container (`thinking-mcp-guidance-1`) with the wrong mount `bind /mnt -> /workspaces` (root-owned, not writable for `USER node`) instead of `D:\repos -> /workspaces` — from an earlier/WSL-side creation. An isolated test with the correct mount confirmed writability as `node`.
- **Fix:** `docker compose up -d --force-recreate` from `servers/server-guidance`; `/health` → `configured:true, reachable:true`. Old container removed via `docker rm -v`.
- **Docs:** Lesson in lessonsLearned.md (2026-09-30) + a new start-discipline rule in AGENTS.md (Guidance section; backup `AGENTS.md.bak` created, Clear-Thought consistency check without conflicts).

## 2026-09-28: Config-Assistant generic patterns (session-2c0c15fe, MERGED: develop @ 42e37bf)

- **Root cause (Niyama follow-up):** the FRESH generator itself was not generic — `buildOperations` (ConfigAssistant.ts) hardcoded the lint op as `npx prettier --check servers/*/src/**/*.{ts,tsx}` (a Thinking-MCP glob) → exit 2 in every repo without a `servers/` layout. Second finding: adopt classification checked genericity only via op NAMES (+ a cryptic `includes('"repo"')` heuristic) — repo-specific args under a generic name escaped the `[adopted]` marker.
- **Implemented:** (1) lint op → `npm run lint` (required:false, aligned with examples/default-guidance); (2) structural genericity rule (after review refinement): preset ops are ALWAYS regenerated from the target-fresh template — divergent ref args produce a loud `REGENERATED … reference args discarded` note instead of a copy; only non-preset ops are copied with an `[adopted — review args/paths]` marker (covers both error directions: glob leak AND scope contamination); (3) tests: fresh args free of repo globs + lint shape pinned; Niyama class (mutated lint args → regenerated + note), builtin convergence + builtin sync pin, preset op without a fresh counterpart → nonGeneric; (4) README: genericity rule + npm/npx/sh convention assumption documented.
- **Validation:** ConfigAssistant suites 57/57 green, tsc --noEmit clean; guidance suite 429/429 green; verify gates: build (required) GREEN, lint fail = pre-existing prettier drift in 5 foreign files (TMPL-1), test fail = better-sqlite3-musl-dlopen in the container (TMPL-2) — both required:false, not caused by this diff. Independent review (sub-agent): 0 HIGH/CRITICAL; GitNexus MCP timeouts (2×) → grep fallback per FR-035.
- **Status:** merged (rebase/fast-forward) into develop @ `42e37bf`, feature branch deleted, index fresh; the Niyama container repair remains with NIY-CFG-1/2, prettier drift with TMPL-1 (remaining-work-plan).
- **Session review findings (3, tracked with evidence in remaining-work-plan):** REV-1 FR-035 fallback order on GitNexus timeouts (container route for gitnexus not configured — only clearthought; clarifying the rule text/route remains open); REV-2 `get_next_task` without a spec-kit import throws `spec_kit_artifact_missing` (reproduced, also post-completion); REV-3 `git diff` without `--no-pager` → terminal hang (AGENTS.md rule violation, lesson added).

## 2026-09-28: Niyama guidance session session-46a43aeb-6a87-4730-ac64-c73e613ae8d9 aborted (infrastructure blocker)

- **Context:** The session reached phase `complete` after task 1 (the entire C0+C1 scope); mandatory verification ops failed for environmental reasons. Our own change (standalone .mjs + markdown) cannot influence build/lint/test.
- **Findings:** (1) lint exit 2 — the pattern `servers/*/src/**/*.{ts,tsx}` does not exist in the repo (verification config copied from a foreign repo layout, presumably the Thinking-MCP `servers/` monorepo); (2) test exit 1 — `Cannot find module @rollup/rollup-linux-x64-musl` (guidance container `/workspaces/Niyama`, pnpm store incomplete/musl-incompatible). Neither op is agent-invocable → could not be re-run.
- **Decision:** `report_blocker` (category infrastructure) set, then `cancel_workflow` (status: cancelled) instead of `complete_workflow` — completion would have been dishonest; the affected tasks NOT marked verified.
- **Follow-ups:** before the next batch session (1) fix the lint glob in the guidance container's verification config, (2) repair the pnpm store/container mount, (3) audit the complete verification config for further foreign repo paths/mounts. After that a fresh session per task batch; the remaining C0 tasks run there (not in the completed session — the lifecycle gates would have been bypassed).

## 2026-09-28: Independent Review RID-1 (develop fbd5bdc) — CHANGES REQUIRED

- Scope: `git show fbd5bdc` (RID-1 requestId replay hardening), amendment 006. Snapshot verified: develop @ fbd5bdc, review basis = commit diff (unstaged: only memory-bank/SDD docs).
- Verified against source: replay marker + clone (cached original never mutated, regression test), replay check before the phase/schema checks in submitLocked AND completeWorkflowLocked (correct: reuse never creates a submission), withLock serialization + MEDIUM-3 successor race unaffected (the clone receives nextSessionId), omitted-config defaults (submission absent → warn; requestPayloadHashes absent → replay without mismatch evaluation), fail-closed policy validation, metric exactly 1×/replay. Tests: requestid-replay.test.ts 8/8 green (re-run locally), tsc --noEmit green.
- Findings: RID-2 MEDIUM (hash poisoning on a failed completion — the first-seen hash stored before the outcome, never overwritten → false payloadMismatch/erroneous rejection of legal retries), RID-3 LOW (metric after throw — payloadMismatches under reject-mismatch always 0), RID-4 LOW (replays unaudited), RID-5 INFO (undefined collision in stablePayloadHash, unreachable on the wire), RID-6 INFO (missing completion replay test confirmed as an accepted deviation). Details + triggers in remaining-work-plan.md.
- Open HIGH/CRITICAL: 0. Verdict: CHANGES REQUIRED (fix RID-2, then re-review).

## 2026-09-28: RID-1 requestId replay hardening implemented (session-dcd3ddc5, develop fbd5bdc)

- **Implemented:** (1) replay marker (replayed/duplicateOf/warning on a cloned result, original never mutated — amendment-002 successor race safe); (2) payload hash (SHA-256 over sorted JSON, session.requestPayloadHashes) + policy policies.submission.requestIdReuse warn|reject-mismatch (fail-closed validation, new error code requestId_reuse_payload_mismatch); (3) metric requestIdReplays {total,payloadMismatches} in get_metrics; (4) 8 contract tests + error-code snapshot; (5) docs: README submit_* + specs/002/amendments/006.
- **Validation:** worktree suite 228/233 green (5 = known final-review-gate worktree artifacts), main checkout after merge full suite green (233/233 real tests), tsc clean.
- **Incident:** A foreign agent reset WorkflowEngine.ts to HEAD in the main checkout during the implementation (RID-1 edits lost) and modified SDD/guidance-mcp-specification-v2.md (foreign change, left untouched). The work was rebuilt isolated in worktree worktrees/rid1 and merged from there — the parallel-work lesson confirmed once more.
- **Limits (amendment 006 §4):** pre-RID-1 sessions without a hash pass through warn without payloadMismatch evaluation; the completion replay test is unreachable in the harness (repository-analysis required:true).

## 2026-09-28: FR-035 container route — review round 1 fixed (worktree fr035-fix, 34b029c)

- Independent review (sub-agent, CHANGES REQUIRED, 1 HIGH): F1 SSRF bypass (stdio + containerRoute skipped the allowlist) → fixed (block before the transport-type continue, 2 regression tests); F4 timeout guard, F5 recordConnection in the fallback path → fixed; F2 → re-scoped to FR-611 on the wisdom baseline (follow-up CR-1 in remaining-work-plan); F3 engine test debt → tracked (CR-2, GDS4 conflict avoidance). Targeted 110/110 green, tsc clean; full suite in the worktree: 7 environment artifacts (final-review-gate vs. the Windows .git file in the container; green in the main checkout).
- **Process note:** the GDS4 agent works in parallel in the main checkout (HEAD on feature/gds4-expose-op-content, uncommitted WorkflowEngine changes) — review fixes deliberately committed in a separate worktree; merge/rebase after GDS4 completion.

## 2026-09-28: FR-035 amendment "Container route before local fallback" (session-1afb793f, feature/fr035-container-route)

- **Scope (user decision):** text rule + machine; FR-035 amended (amendment 005 in specs/002); RID-1 follows separately.
- **Implemented:** (1) FR-035 text in responses-wisdom.json + live .guidance/responses.json to the order retry → container route → local → report_blocker (7 phases per file); (2) `containerRoute` field in downstream-servers.json (fail-closed validation + SSRF allowlist + ${ENV} headers in config.ts), template + live config filled for clearthought; (3) engine fallback: ONE automatic attempt via containerRoute on a read_only timeout (ClientManager.invokeOnTransientHttpRoute + gate in WorkflowEngine.buildInvokerClosure), metric containerRouteFallbacks in get_metrics; (4) tests tests/contract/container-route-fallback.test.ts (11) — suite 221/221 green, tsc clean; (5) docs: README downstream attribute table + specs/002/amendments/005.
- **Confirmed live:** reasoning-pass via the container route succeeded while direct MCP had timed out 2× the day before — the new rule is exactly the proven workaround.
- **Open (next step):** start the RID-1 session after merging this scope; refresh the workspace configs (Niyama) to the new template state.

## 2026-09-28: requestId reuse stall (Niyama session-46a43aeb) — diagnosis + prevention

- **Finding:** `WorkflowEngine.submitLocked` (~L1617) still replays the cached result for an already-registered requestId — 3× `accepted: true` without a phase advance in review_and_adjust_plan. Fix: resubmission with a fresh requestId (`req-plan-review-adjusted-c0c1`) → immediate `implement`.
- **Implemented:** lesson in memory-bank/lessonsLearned.md (Avoid-These-Mistakes + dated entry); hardening plan RID-1 in memory-bank/remaining-work-plan.md; rule set "Submission idempotency …" in both config-assistant templates (examples/default-guidance/responses-wisdom.json + responses.json, all 6 submission phases, JSON validation green).
- **Open:** the live .guidance/responses.json of existing workspaces (incl. Niyama /workspaces/Niyama/.guidance) does not yet contain the rule → regenerate via setup_guidance_generate at the next opportunity or pull it in by hand; implement the server hardening (RID-1), see remaining-work-plan.

## 2026-09-26: Small items L256/L257/L253 (Guidance chain session-3b7f96a5)

- **L256 FTS coverage (SOLVED):** `observations_fts` (FTS5, 500-character cap) + insert trigger + count-guard backfill in `SqliteAdapter.init()`; `searchFullText` matches both indexes (dedupe on dual match). Tests `tests/contracts/fts-observation-coverage.test.ts` (7).
- **L257 Postgres FTS parity (SOLVED, contract level):** `searchFullText` → sanitized AND-`tsquery` over goal_summary + observation excerpts, INNER→**LEFT** JOIN signatures (the 2026-09-22 bug class fixed in the second backend), GIN expression indexes; SQL contract pinned in `tests/contracts/postgres-fts-parity.test.ts` (5). Open: live smoke test at the first `EMMS_STORAGE_BACKEND=postgres` activation.
- **L253 prompt sync (closed as OBSOLETE, user decision option 3):** no target repos with copies/references exist; distribution via package/Smithery.
- Verification: 118/118 tests, tsc, build green. Independent review (sub-agent): APPROVED, 0 HIGH/CRIT; MED (backfill cost) + 2 LOWs fixed in review; F3–F6 as tracked follow-ups. GitNexus index fresh (analyze --no-stats). Lessons seeded (`.guidance/state/session-lessons.json`): pg-search-fulltext-ilike-inner-join-parity-trap, sqlite-fts-backfill-per-init-quadratic-cost.
- **Final review (fresh sub-agent dd5ee20f, after the parallel agent finished):** APPROVED, **0 HIGH/CRITICAL**, 12/12 focus tests; session code committed in the meantime (HEAD 60b2eddf); a new F1-LOW (orphan observation → count divergence) persisted together with F2/F4–F6 as tracked follow-ups. The index-freshness race with parallel work tracked as a process follow-up.
- **Process rule anchored (2026-09-26):** "Completion gate vs. parallel work" added in AGENTS.md (Guidance section) — backup `AGENTS.md.bak`; the Clear-Thought consistency check was attempted 3× (server timeouts) → manual check documented (complementary to the GitNexus/branch/memory-bank rules, purely restrictive). Tracked follow-up closed.
- Context: the session ran on `feature/production-hardening` — the dirty files under `servers/server-guidance` belong to a PARALLEL work stream and were not touched.

**Last updated:** 2026-09-26

## 2026-09-26: Final review feature 003 (develop @ ec924f6, complete session diff 16c6f1e..ec924f6)

- Snapshot: develop @ ec924f6, clean (except this review note); the diff of
  4 commits read (77fa854/a457329/b6edcee/ec924f6) + current source.
- Verification: suite 268/268 (RUN_PY_E2E=1) ✓, tsc clean ✓, build OK ✓.
- Fix commit b6edcee checked: R-004 stale-lock recovery present, but with
  a new MEDIUM R-011 (steal TOCTOU, non-atomic unlink+recreate) and LOW
  R-012 (TTL vs timeout, EACCES code, test gaps of the new code) — tracked
  in remaining-work-plan.md. R-005 (denial audit) correct, SC-002 satisfied;
  R-009 README consistent with PolicyEngine; R-007/R-007-fix (merge +
  memory-bank) done.
- Open: 0 CRITICAL, 0 HIGH, 1 MEDIUM (R-011), 3 LOW (R-012a-c). No reviewed
  code changed.

## 2026-09-26: Post-commit review 77fa854+a457329 (independent, spec 003)

- Snapshot: feature/guidance-toolchain-bootstrap @ a457329, clean; review basis
  git show of both commits + current source. Suite 267/267 confirmed in the
  guidance-bootstrap-test image; RUN_PY_E2E=1 4/4; tsc clean,
  build OK; manual uv-sync-0.12.19 repro OK.
- Result: 0 CRITICAL, 1 HIGH (R-004 stale workspace lock without recovery),
  3 MEDIUM (R-005 SC-002 denial audit, R-006 E2E coverage vs T008,
  R-007 T013 checkbox premature), 2 LOW (R-008, R-009) — details + triggers
  in remaining-work-plan.md ("Tracked follow-ups 2026-09-26, post-commit
  review 77fa854+a457329"). No code changed.

## 2026-09-26: Workflow configuration — mandatory final review in the complete phase

- `.guidance/responses.json` (complete): a mandatory final review over
  ALL tasks of the session in a fresh, authorship-excluded
  sub-agent (evidence table per finding, explicit HIGH/CRITICAL count,
  focus cross-task/spec conformance/fail-closed/boundary/coverage).
  HIGH/CRITICAL → fix before completion; the rest → findings-lifecycle
  persistence; reference the outcome in the completion report. Backup:
  `responses.json.bak`. Container restarted (/health ok). Clear-Thought
  server timeouts — compatibility check documented manually (deviation).

## 2026-09-26: Final Comprehensive Review CHN-1..6 (bb37f6c) — APPROVED, 0 HIGH/CRIT

- Authorship-excluded review over eb99873..bb37f6c (4 commits, develop).
  Snapshot: develop @ bb37f6c, ahead 5, working tree clean except for the
  intentional `.guidance/responses.json.bak` (backup protocol).
- Verification: 251/251 tests green (incl. chain.test.ts 18/18, WSL/nvm);
  CHN-1..6 fixes individually verified against the source code; spec v1.1
  FR-110..FR-119 + §12 checked end-to-end; fail-closed invariants intact
  (`getSession` throws chain_activation_incomplete; recovery only via
  retry_operation with full activation — no gate bypass).
- Cross-task interactions checked: CHN-1 × CHN-5 (both paths hang on the
  successor lock + status==='activating' recheck ⇒ no double activation);
  CHN-3 cursor semantics (upNext=steps.length) consistent; CHN-4 chain_end
  audit only at the silent Form-B end, no overlap with chain_failed.
- 0 HIGH/CRITICAL open. 4 new acceptances/NITs tracked: CHN-R2-1 (LOW,
  replay staleness 'activating' entry), CHN-R2-2 (LOW, test gap mixed in
  plain), CHN-R2-3 (NIT, recovery without FR-043 reconciliation), CHN-R2-4
  (NIT, memory-bank hygiene) → remaining-work-plan.md.
- Merge recommendation: develop ready; for main later repeat
  squash + container image rebuild in lockstep with guidance.json
  (CHN-2 lesson).
- CHN-R2-2 closed IMMEDIATELY (commit `7cb55be`): test "mixed manifest in
  plain profile rejected entirely" (chain.test.ts 19/19). CHN-R2-1/3/4
  remain accepted and tracked. Series conclusion: 4 guidance workflows
  (CHN-1, CHN-2, CHN-3, CHN-4/5/6) all completed, merged, branches
  deleted; develop ahead 6.

## 2026-09-26: Independent review CHN-3 (mixed manifests) — 1 HIGH open

- Authorship-excluded review pass over the uncommitted diff (scope:
  register-tools.ts chainManifest, WorkflowEngine.ts validateChainManifest /
  resolveChainStep / completeWorkflowLocked, spec §12/FR-119, README,
  chain.test.ts). Snapshot: feature/chn-3-mixed-chains, HEAD == develop
  49a18bc, the branch has ZERO commits — everything uncommitted.
- **1× HIGH (CHN-3-R1):** a Form-B step resets the Form-A cursor
  (`upNext: 0` → `chainUpNext = 1`): with `steps.length >= 2` + `source`,
  `steps[1]` is executed again after every task until
  `chain_depth_exceeded`. Reproduced (temporary vitest, removed
  afterwards); the existing mixed test uses only 1 step ⇒ bug invisible.
  Details + fix direction: remaining-work-plan.md [CHN-3-R1].
- **1× MEDIUM (CHN-3-R2):** review scope deviation — 25 further files
  with substantial uncommitted changes outside the declared
  scope (incl. SpecKitEngine.ts +755). Tracked in remaining-work-plan.md.
- LOW (observed, not tracked as a blocker): the engine accepts
  `steps: []` (silently as pure Form B), while the Zod schema
  rejects it via `.min(1)` — reachable only via a direct engine call;
  the README guardrail line maxStepsPerManifest mentions only Form A.
- Verification: chain.test.ts 16/16 green; overall suite 249 passed
  (250 with the review repro) — the 249/249 claim confirmed;
  `npm run build` green.

## 2026-09-25: Pre-merge review workflow chaining (0 HIGH/CRITICAL open)

- Fresh review agent over the semantic diff: 3×MEDIUM, 3×LOW, 1×NIT;
  **0 HIGH/CRITICAL**. Verified against source, four fixed (with
  regression tests, chain.test.ts now 12 tests / 245 overall green):
  MEDIUM-1 (Form-B featureId discarded from the task list), MEDIUM-3
  (concurrent replay double activation → successor lock + in-lock recheck),
  LOW-4 (depth gate before exhaustion → false chain_depth_exceeded),
  LOW-5 (Zod max(16) hardcoded → engine gate authoritative).
- Accepted + tracked (remaining-work-plan): CHN-4 (silent Form-B bridge),
  CHN-5 (replay cache without a chain entry in the crash window), CHN-6
  (pre-activation guidance snapshot).

## 2026-09-25: GUID-3/4/5 workflow (first run with the feature-branch policy, completed)

- First workflow run with the new implement rule: branch check +
  feature branch `feature/guid-345-template-env-shell` (without a worktree),
  commits per task, ff merge to develop, branch deleted — the commit policy
  applied productively for the first time.
- GUID-3 CLOSED: template resolution in OperationEngine (`ctxFor` →
  templateVars session.request/project.name, deep ${token} resolution,
  fail-fast on unknown tokens; mode:fixed literal; behavior change
  documented in the README).
- GUID-5 CLOSED: env + shell for process operations (spawnSync, validation
  in config.ts); our own operations.json switched to env (sh -c dropped).
- GUID-4 CLOSED: schema-load regression via the public API + source scan
  against bare-require (2 new test files). Verification: 230/230 + 9 new = green,
  detect_changes classified critical (startup paths).
- GUID-7 NEW: switchable workspaceRoot (worktree gates) tracked.
- Live insight: an image rebuild is needed after engine changes — the old
  image ignored env fields (capture gate localhost fail), green after
  the rebuild.

## 2026-09-25: Workflow chaining spec (Amendment 002, APPROVED)

- Design session "Chaining without user input" completed: the analysis showed
  that phase chains in the plain profile already run autonomously today, but
  workflow-to-workflow chains are missing.
- Draft persisted as
  `specs/002-guidance-workflow-server/amendments/002-workflow-chaining.md`
  (status APPROVED, FR-110…FR-116, Q1–Q3 decided by the user).
- Core: `chain` manifest at `start_workflow`, lazy successor creation in
  `completeWorkflowLocked`, response fields `nextSessionId`/`chain`;
  head copy of the remaining chain (Q2); template error ⇒ no successor
  creation, the predecessor remains completed (Q1 refinement).
- **Q3 revised (user):** `spec-kit` does NOT reject `chain` — the new
  Form B `chain.source: "spec_kit_tasks"` (FR-117/FR-118, §11): a
  dependency-ordered task list from `speckit.tasks` as the chain source,
  one full workflow (with verify gates) per task; state bridge via an
  optional `specKitTasks` EngineDeps callback.
- Implementation NOT yet started; touchpoints in spec §8 (WorkflowEngine,
  types, config, template-resolver, register-tools, tests, docs).

## 2026-09-25: Asking-questions culture (3rd guidance workflow, completed — full duty compliance)

- Session `session-58872e83…` → **completed**; first run with ALL four
  Clear-Thought duties envelope-mandatory and fulfilled (sequential_thinking,
  issue_tree + decision_framework, assumption_xray + probing,
  metacognitive_monitoring 0.85).
- responses.json: core sentence (chat questions before submitting + field
  reference + blocker rule of thumb) in all 6 non-verify instructions; field
  mapping: understand/plan→openQuestions, review_plan→remainingConcerns,
  implement→unresolvedIssues+deviations, review_impl→unresolvedFindings,
  complete→deferredWork/nextSteps. verify deliberately exempted.
- plan.schema.json: openQuestions added. README: operating note 'Asking
  questions' (Commit 0b3fd42).
- New EMMS episodes (seeded via the capture gate):
  gitnexus-detect-changes-misses-fresh-edits (detect_changes anomaly
  observed, compensated), guidance-schema-validator-caches-per-session.

## 2026-09-25: Capture-lessons integration (2nd guidance workflow, completed)

- Session `session-1bb1d9c2…` → **completed**; the `repository-analysis`
  gate green productively for the second time.
- `store-completion-insight` removed (GUID-2 → subsumed); new:
  **`capture-session-lessons`** (blocking process gate, sh -c +
  seed-lessons.mjs against insight, idempotent) — lessons file contract:
  the agent writes `.guidance/state/session-lessons.json` BEFORE
  complete_workflow (empty array = no-op; redaction at the agent).
- Plan deviation documented: OperationEngine spawnSync has no env
  option → sh -c inline ENV; tracked as GUID-5 (env field + test).
- Verified: live seed 2/2 + idempotency (2 duplicate, 1 seeded, exit 0),
  experience_search round trip, 4× JSON validation, build gate green
  (lint/test optional-failing for known reasons).
- Commits: `2e72c9a` (config + README). New EMMS episodes:
  guidance-config-snapshot-per-session, guidance-template-placeholders-
  unresolved, guidance-process-operations-no-env-support.

## 2026-09-25: GUID-1 run — gates productive, 2 real bugs uncovered

- First real workflow run (Zed agent, docs change): **build gate green**
  after the container deps install (`npm install --include=dev
  --ignore-scripts --script-shell=/bin/true` in the isolated volume;
  corepack-yarn crashes on alpine, NODE_ENV=production skipped
  devDeps, prepare scripts run despite ignore-scripts). lint/test
  (optional) fail known/tolerated (prettier pre-existing;
  @rollup/rollup-linux-x64-musl optional-deps bug).
- **Bug 1 (fixed, `5316c88`)**: bare `require` in `createRequireShim()`
  (ESM) — ReferenceError on every submit_*; static createRequire import;
  215/215 tests; recurring lesson documented; regression coverage
  open → GUID-4.
- **Bug 2 (tracked, GUID-3)**: template placeholders (`${project.name}`
  etc.) are never resolved — the gate ran with the literal repo name.
  Workaround: hardcoded in operations.json (backup .bak), takes effect
  only after a container restart (config snapshot in the session state).
  Restart done.

## 2026-09-25: WORKFLOW COMPLETED — GUID-1 closed

- Final green complete run: `repository-analysis` **succeeded**
  (check `{repo:"thinking-mcp"}` after the GUID-3 workaround + container
  restart). Session `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` →
  **completed**.
- Scope: README.md quick-start section improved (docs-only, lines 17–45).
- `store-completion-insight` failed (not required, tolerated) — see GUID-2.
- Open: GUID-3 (template engine fix), GUID-4 (regression test), GUID-2
  (store-completion-insight args).

## 2026-09-25: GUID-1 preparation — GitNexus Docker (:4747) connected to the repo

- Created
  `C:\Users\AlexanderPaschold\source\repos\GitNexus\docker-compose.override.yaml`:
  repo RO under `/thinking-mcp`, only `.gitnexus/` RW (shared store
  with the WSL CLI, both 1.6.8). Pitfalls: the `/workspace` base mount
  is RO → no sub-mount possible; the MCP HTTP server exposes **no
  analyze tool** (query tools only); indexing runs via the CLI in the
  container (`gitnexus analyze --no-stats`, once + on demand on the
  host side).
- Initial indexing successful: 4.506 nodes / 10.117 edges / 199 clusters.
  `check {repo:"thinking-mcp"}` verified over HTTP (side finding: 1
  import cycle lesson-service.ts ↔ adapter.ts in server-insight,
  pre-existing).
- Gate `repository-analysis` switched: composite firstAvailable —
  (1) mcpTool `check` {repo:${project.name}} (HTTP), (2) process
  fallback `gitnexus analyze --no-stats` (stdio deployments);
  riskClass now read_only; allowlist trimmed to existing tools.
  Commit `5f8b2eb`.
- **Remaining for GUID-1:** the user starts a real workflow run in the
  Zed agent (context_servers entry + a small task); the agent runs the
  phases, `complete` fires the gate productively for the first time.

## 2026-09-25: Merge of both guidance feature branches to develop + review

- Fast-forward merge `7b8e5d5 → 5ced680` (covers
  `feature/guidance-workflow-setup` and `feature/guidance-http-downstream`,
  linear history); develop ahead 3 vs. origin/develop.
- Post-merge review of `e601515` (the only code touch) against the
  current state: config validation (stdio/http union, URL check),
  fail-closed allowlist (mandatory as soon as an enabled http server
  exists), `${ENV}` resolution **after** configVersion hashing
  (secrets outside the hashed area), legacy stdio without
  `type` stays compatible, WorkflowEngine transport selection correct.
- Tests (WSL, nvm node): guidance typecheck green + **206/206**;
  full suite **521/521** (clear-thought 166, guidance 206, insight 106,
  stochastic 43).
- Branches deleted (both merged). Push to origin/develop done
  (2026-09-25). GUID-1/GUID-2 remain tracked.

## 2026-09-24: Guidance set up for the Zed agent (feature/guidance-workflow-setup)

- `.guidance/` created in the repo root (from
  `servers/server-guidance/examples/default-guidance/`,
  version 2, profile `plain`, standard flow understand → … → complete).
- Adjustments: `project.name=thinking-mcp`; gates `lint` (prettier
  --check) and `test` (npm test) to `required:false` (container/Windows
  caveats, see the ops descriptions);
  `repository-analysis` to `required:false` — the downstream MCP is
  **stdio-only** (ClientManager.ts), in the Docker container
  gitnexus/insight are unreachable;
  the downstream servers gitnexus/insight therefore documented
  `enabled:false`.
- `servers/server-guidance/docker-compose.override.yml`: repo mounted
  as `/workspace`, the isolated volume `guidance_node_modules` protects
  the Windows node_modules; no bearer token (loopback, user decision).
- `.gitignore`: `/.guidance/state/` added.
- Verified: `docker compose up -d --build` → `/health`
  `configured:true`, `/mcp` POST → 200, startup log clean.
- **Addendum — HTTP downstream enabled** (after retrofitting
  `transport.type:"http"` in ClientManager): gitnexus
  (host.docker.internal:4747/api/mcp) and insight (:3002/mcp) enabled,
  `policies.egress.httpHostAllowlist` set (fail-closed mandatory),
  `repository-analysis` back to `required:true` (AGENTS.md gate),
  insight ops switched to real tool names (`experience_search` +
  `scope_id` template / `experience_record_observation`). An image
  **rebuild** was necessary (the old image did not know the http branch
  → "not connected"). Verified end-to-end:
  `start_workflow` → `query-project-insights: succeeded`. Open: only a
  first real `complete` pass exercises `repository-analysis` (gitnexus);
  an automated regression test for stateful downstream sessions remains
  a follow-up (CI cannot address the live system). **Tracked:** GUID-1
  (the first real `complete` run exercises the gitnexus gate) and
  GUID-2 (`store-completion-insight` arg completeness) in
  `memory-bank/remaining-work-plan.md`.
- Pending: the user sets the Zed `context_servers` entry (see chat);
  in-container test env optional (`yarn install` in the container);
  downstream activation possible only in stdio mode (limitation
  documented).

## Current Focus

- **RELEASE 0.3.0 SHIPPED (2026-09-14)** — all roadmap main tracks completed
  (A, B1–B5, C, D1–D3, E1–E3). First successful **OIDC trusted publishing**
  run (tokenless, provenance badge) after the 3-rings debug (account 2FA
  mode → package access option → TP stage permission, see lessonsLearned).
  ghcr images 0.3.0 pushed. Registry-verified (`npm view` → latest 0.3.0).
- Next: make the ghcr packages public (if not already done); Smithery re-publish
  (make new tools visible); optional items: D4 (sampling), Tier 2 (LLM evals),
  orchestrated Recipe Runner, Naming-Rename (breaking, ~4 pt).
- Stochastic server fully shipped: merged, pushed, deployed, docker-verified,
  **published on the Smithery registry** (`paschbaer/stochasticthinking`,
  stdio bundle — download/install distribution; run.tools hosting is
  remote-only, RB-8 resolved with evidence). (2026-09-14: all `main` commits
  pushed; RB-7 residual resolved via green CI run.)

## Recent Changes

### 2026-09-29 — Wildcard Container-Route (feature/wildcard-container-route, Guidance-Session session-45abc996)

- Container route now tool-name-agnostic public: `capabilities.allow.tools:
["*"]` (wildcard, only standalone — mixed lists → configuration_invalid)
  for gitnexus/clearthought/insight in `.guidance/` AND
  `examples/default-guidance/`; insight for the first time with `containerRoute`
  (`host.docker.internal:3002/mcp` resp. `localhost:3002/mcp` in examples).
  Enforcement: `ClientManager.assertAllowed` respects "*"; auto-fallback
  remains read_only-restricted (unchanged). Egress allowlist in examples
  policies.json (localhost:3000/3002/4747). Tests: wildcard validation
  - enforcement + full suite 437/437 green. Note: a running Docker container
    needs an image rebuild to accept "*".

### 2026-09-25 — Guidance HTTP-Downstream-Transport (feature/guidance-http-downstream)

- Plan reviewed (Clear-Thought server down ⇒ documented manual fallback
  with findings table), plan v2 extended with egress host allowlist +
  load-time secret resolution + HTTP stub E2E.
- Implemented: `transport.type "http"` in downstream-servers.json
  (`http.url` + `http.headers` with `${ENV_VAR}` resolution, fail-closed);
  `policies.egress.httpHostAllowlist` (mandatory as soon as an enabled server
  uses http — exact host match); `validateDownstreamServers` validates both
  transport types; resolution AFTER configVersion hashing (secrets never in
  the hash); ClientManager: `DownstreamTransportConfig` union +
  `StreamableHTTPClientTransport`; WorkflowEngine passes http/stdio through
  correctly. Disabled servers are skipped entirely.
- Tests: 33/33 focused, 206/206 full guidance suite, tsc green. E2E: real
  Streamable-HTTP handshake against the guidance HTTP app as downstream.
- insights/clear-thought speak stateful streamable HTTP (sessionIdGenerator)
  — SDK client transport manages `mcp-session-id` itself; reconnect = HD-1.
- Node runs in WSL via nvm, but NOT on PATH in `bash -c`; Windows-side
  sh interpolates `$VAR` before wsl.exe (\$-escaping needed).

## Recent Changes

- 2026-09-16: **MG-1 RESOLVED** — stochastic jobs removed from all three
  publish pipelines (`42010d1`) and `@paschbaer/stochasticthinking` deprecated
  (npm registry verified: message live, pointer to clear-thought@>=2.0.0).
  SSH setup in WSL repaired (key copied + .bashrc guard against blocking
  ssh-add prompts in non-interactive shells); push develop = `42010d1`.
- 2026-09-16: **Release 2.0.0 pushed + merged + published (user report)** —
  branch `feature/release-2-0-0` (4 commits: `0fd8410` version bump +
  path fixes, `6ddba51` README user-first, `dd2e00d` Docker/HTTP config,
  `92bde28` memory bank) is on `develop` (`92bde28`, = origin/develop)
  and was merged to `main` by the user + publish triggered.
  Not verifiable locally: `git fetch` fails (permission denied
  publickey — credentials only in the user terminal); origin/main ref
  locally stale (8897280, at 0.3.0). **Registry check: npm `latest` =
  2.0.0 ✓ live.** **The MG-1 trigger is thereby reached**: deprecate
  `@paschbaer/stochasticthinking` + remove stochastic jobs from the three
  publish pipelines (order: first confirm 2.0.0 live).
- 2026-09-16: Root-README reworked user-first (commits `6ddba51` +
  `dd2e00d`, branch `feature/release-2-0-0`): new sections Quick Start
  (npx config), What you get (7-toolset table, individual ≡ toolset
  calls), Using it with your coding agent (agent guide + skill generator
  docs: `npm run sync:skill`/`sync:all`), Docker/MCP-HTTP-client config
  (`http://localhost:3000/mcp`, endpoint verified per server.ts) +
  ghcr image note. Development/Publishing condensed to references to the
  server README.
- 2026-09-16: Release 2.0.0 prepared (branch `feature/release-2-0-0`): version bump
  `@paschbaer/clear-thought` 1.0.0 → **2.0.0** (package.json + factory ServerInfo;
  user decision instead of the planned 1.1.0 — see decisions.md update 2).
  Session export envelope version in SessionState.ts deliberately stays 1.0.0
  (data format version, schema unchanged — bandit runs are not part of the export).
  Typecheck green. Phase 6 released: user merges to main and triggers publish;
  after that MG-1 (deprecation + pipeline cleanup).
- 2026-09-16: Repo moved from `/mnt/c` to `/mnt/d/repos/Thinking-MCP`; paths
  corrected (`scripts/regen-root-agents.ts` + AGENTS.md guide block via
  regeneration + hand-written domain-context line; backup `AGENTS.md.bak`).
  Merge status verified: implementation `1bed87e` + follow-up `039c7e3` already
  on develop (HEAD `df0a84a`). GitNexus index unreachable after the move
  (re-index `node .gitnexus/run.cjs analyze --no-stats` pending).
- 2026-09-15: Smithery CI fix (first pipeline run crashed with ENOENT: the
  script read the local settings.json unconditionally before checking the
  env token) — settings.json is now OPTIONAL; SMITHERY_API_KEY alone
  suffices. Side effect of the local probe run: **clear-thought 0.3.0
  republished on Smithery** (45 tools captured, release 202/SUCCESS).
- 2026-09-14 (VIII): `publish-smithery.yml` (release pipelines completed): both
  servers are republished automatically on release merges (version-guarded via
  registry.smithery.ai record); both publish-smithery.mjs now accept
  SMITHERY_API_KEY env (secret) in addition to the local settings file.
- 2026-09-14 (VII): roadmap track D (branch `feature/track-d`, still 0.3.0): D1
  session resources (4 URIs), D2 workflow prompts (6), D3 persistence
  (session_save/load + dataDir); factory bug fixed (unparsed config →
  immediate cleanup timer); 129/129 tests.
- 2026-09-14 (VI): roadmap track B2–B5 (branch `feature/track-b2-b5`, still
  0.3.0): `argument_map`, `causal_graph`, `fermi_estimate`, `game_matrix` in
  the reasoning toolset; fermi field `operation`→`combine` (reserved toolset
  discriminator); mixed formula for the column player corrected
  ((h−g)/denom); 121/121 tests.
- 2026-09-14 (V): roadmap track C (branch `feature/recipe-runner`, 0.3.0):
  `recipe_runner`
  - `workflow` toolset — 6 guide recipes as data, per-session progress in
    the new `WorkflowStore`, auto start/advance/reset; guide (routing +
    recipe intro) and root AGENTS.md regenerated; 111/111 tests.
- 2026-09-14 (V): Release 0.2.0 via PR `develop → main` (branch protection
  active); GitHub Actions: ghcr images pushed, npm publish blocked by the
  account 2FA mode (auth-and-writes) → 0.2.0 published manually; mode
  switched to "authorization only" (trusted-publisher entries exist for
  both packages) — OIDC test due at the next release.
- 2026-09-14 (IV): roadmap track B1 (branch `feature/risk-family`, 0.2.0):
  risk family `premortem`/`fmea`/`fault_tree` as dual-mode tools via the
  new `risk` toolset; registry metadata for 37 entries; 103/103 tests.
  Public point: guide extension (AGENTS.template.md) for the new family
  done (routing table + dual-mode list).
- 2026-09-14 (III): GitFlow-light CI — `develop` branch created (test
  action there), `publish-npm.yml` (npmjs.com, version-guarded, provenance)
  + `publish-containers.yml` (ghcr.io) for release merges to `main`;
  root-README publishing section extended.
- 2026-09-14 (II): npm publish round (E-Plan Phase 2, branch
  `feature/npm-publish`): package hygiene + dry-run audits; first publish
  0.1.0 (stochastic silently failed); bin-guard bug found via npx
  verification (0.1.0 was a silent no-op through .bin symlinks) and fixed
  (`0c6daca`) → **0.1.1 both live on npm**; READMEs switched to npm-first
  (npx configs); npm-12/GAT-deprecation auth strategy recorded in the plan.
- 2026-09-14: Shipping round — RB-10 branch reviewed + squash-merged
  (`94be80c`: TOOL_METADATA registry 33/33, central loop parametrized, 84/84
  tests incl. metadata suite + audit script); `main` pushed (3 commits) with
  CI `test.yml` GREEN → RB-7 residual resolved; clear-thought re-published
  to Smithery with registry metadata; rescan 96/100 (2026-09-14) → RB-10
  CLOSED.
- 2026-09-13: Real Computing round (feature branch `feature/real-computing-stochastic`,
  commit 0d33ead): new `src/algorithms/*` modules (rng/mdp/mcts/bandit/hmm/
  bayesopt + dispatcher), handler rewired (details payload, per-algorithm zod
  validation, honest annotations idempotentHint=false), bandit run store per
  session (runId continuation, measurable regret); guide chain regenerated
  (AGENTS.template.md ↔ template constant ↔ root AGENTS.md via real tool
  handler ↔ README), functional test on real params + run continuation.
  41/41 tests. Lesson: direct module calls bypass zod defaults (see
  lessonsLearned).
- 2026-09-13: Docs commit fe181f2 on main: extension roadmap (tracks A–E,
  `plans/extension-roadmap.md`) + detailed E-plan
  (`plans/quality-distribution.md`; RB-10 registry → npm publish → eval
  harness).
- 2026-09-13: clear-thought published to Smithery (paschbaer/clear-thought,
  created + released + record patched; 33/33 tools registered). Tooling:
  scripts/build-mcpb.mjs (runtime metadata capture) + publish-smithery.mjs.
  RB-10 tracks the pending score rescan and the annotations/outputSchema
  gap on high-level tools.
- 2026-09-12: First Smithery publish of `paschbaer/stochasticthinking`
  succeeded via the v4 API (correct StdioDeployPayload: type/runtime/
  configSchema + bundle upload; deployment SUCCESS, deploymentId
  `b6e38872-…`). The legacy CLI `deploy` path no longer exists in Smithery
  CLI v4 — workflow deploy job is dead code. Hosted run.tools endpoint 404
  in verification window → RB-8 (dashboard check pending).
- 2026-09-12: Hygiene round (`fix/clear-thought-hygiene`): clear-thought dev
  guard hardened (pathToFileURL; `npm run dev` verified — drvfs cold start
  can take >20 s), npm bin → `dist/dev.js`, README install references
  corrected (RB-6 closed), stochastic package version aligned to 0.1.0.
- 2026-09-12: RB-4 closed: stochastic Docker image built via Docker Desktop
  (WSL integration enabled for the Debian distro); container healthy on
  3002→3000, `/health` + both MCP tools green over the mapped port; container
  cleaned up.
- 2026-09-11: agents_guide parity implemented in the stochastic server (low
  level `Server`): embedded `AGENTS_TEMPLATE` (auto-generated from
  `AGENTS.template.md`, sync-tested), `agents_guide` tool with full/merge
  mode touching only `stochastic-thinking` markers, 24/24 tests; root
  `AGENTS.md` stochastic block regenerated through the real tool handler.
- 2026-09-11: Created `AGENTS.md` via `agents_guide` tool (Thinking-MCP
  context), customized project-specific conventions section.
- 2026-09-11: Created `memory-bank/` with the 8 base files.
- 2026-09-11: Agent-guide parity for stochastic: `AGENTS.template.md` shipped
  (package.json files), README expanded (client config, Agent Guide section),
  root `AGENTS.md` gained an initialized stochastic guide block between
  `stochastic-thinking:agents-guide:start/end` markers (regeneration-safe).
- 2026-09-11: Feature review of `feature/stochastic-http-mcp`: 1 HIGH + 3 MED
  findings fixed (`.dockerignore` ported; dev/server direct-execution guards
  via `pathToFileURL` + `.catch`; smithery `startCommand` → `dist/dev.js` with
  debug configSchema; `app` export + guarded listen enables HTTP unit test —
  16/16 tests green).
- 2026-09-11: Stochastic HTTP-MCP rebuild (phases 0–5) on
  `feature/stochastic-http-mcp`: SDK 1.30 spike, clear-thought parity deps/
  tsconfig/scripts, session factory + config, HTTP server (/health, port 3001,
  graceful shutdown), vitest 15/15 + live functional test 6/6, Dockerfile
  ported (docker verify pending, RB-4), READMEs + root docker script updated.
- 2026-09-11: Removed volatile GitNexus stats from AGENTS.md/CLAUDE.md via
  `gitnexus analyze --no-stats`; `--no-stats` is now the mandatory repo command
  (documented in Architecture Map, techContext, lessonsLearned).

## Next Steps

1. Run docker build/run verification for the stochastic image when a docker
   daemon is available (RB-4 in `remaining-work-plan.md`).
2. Review `feature/stochastic-http-mcp` and merge (squash per AGENTS.md
   branch rules), then delete the branch.
3. Wire memory-bank workflow into daily use: read all files before tasks,
   update `activeContext.md` + `progress.md` + `lessonsLearned.md` at session end.
4. Review open follow-ups in `remaining-work-plan.md` when starting new scopes.
5. Candidate work items: see `progress.md` → "What's left".

## Open Questions

- MCTS "Agent-as-Environment" contract vs. built-in environments only
  (roadmap open question #2).
- Smithery rescan score for the stochastic server after the guide updates.

## 2026-09-15: Architecture Deliberation on Merging Servers

- User question: merge clear-thought + stochasticthinking into one server for
  shared recipe usage? Decision `merge-servers-2026-09-15` (full chain incl.
  MDP): **status quo (B)**, merger coupled to a trigger (stochastic recipes
  in recipe_runner / cross-family session state, setup-friction feedback,
  maintenance pressure → then hybrid instead of a full merge). Details in
  `memory-bank/decisions.md`. No code change.

## 2026-09-15: Eval-Rig Upgrade (Actor/Judge Split + Hard Tasks)

- Branch `feature/harder-evals-actor-judge-split`: `evals/run.mjs` treats
  actor and judge as separate endpoints (`EVAL_ACTOR_MODEL/BASE_URL/API_KEY`,
  `EVAL_JUDGE_*`); legacy vars remain actor defaults, judge inherits.
  Self-bias warning for the same model+endpoint; `config.json` snapshot
  in the report folder.
- `evals/tasks-hard.json` (4 tasks, ground truth via real tool runs):
  fault_tree exactly 0.04148 + contribution ranking; game_matrix iterated
  dominance (exit→hold, chaotic→stable) + 2×2 mix (expand/hold 0.50/0.50,
  aggressive/stable 0.75/0.25, payoffs 3.75/3.0); fermi 993,600 € +
  sensitivity + VoI 63,000 €; bandit (thompson, seed 7) runId continuation
  80+60 pulls → regret 16.14, pulls 31/13/96.
- Runner attached `server-stochasticthinking/dist/dev.js` automatically
  (stateful tools, runId across calls). SDK trap: the constructor option
  is called `defaultRequestTimeoutMsec`, `timeout` only applies per
  request (drvfs cold start!).
- Open: Run 3 with the hard set + independent judge (needs API keys +
  user go).

## 2026-09-15: Post-Commit-Review Eval-Rig (completed)

- Review subagent over 37cc9a6..HEAD: **APPROVE, 0 HIGH/CRITICAL**, 1 MEDIUM,
  5 LOW, 3 NIT. All ground-truth numbers of the hard tasks independently
  hand-verified (incl. pseudo-regret formula 0.46·140 − Σpᵢ·pullsᵢ = 16.14).
- Fixes committed: MEDIUM → pinning test (stochastic, 17/17); LOWs → arg
  guards, judge cap 12000, transport cleanup, rubric dual-dominator.
  NITs/flakes documented as EV-4/EV-5 accepted. bin-invocation failure in
  the full suite = drvfs load flake (green in isolation), not
  diff-caused.

## 2026-09-15: Run 3 executed (hard set, split actor/judge)

- Results (see progress.md): bandit +11 / fault tree +2 / fermi 0 / game
  −4. Rig fixes en route: streaming SSE reassembly, attempt-scaled
  timeouts, thinking per role (actor disabled fixes the reasoning loop),
  .env loader, eval:llm:hard script, final-answer nudge, judge anchors.
- Open for Run 4 (user approved): verbatim-parameter system prompt for
  actor mode, EVAL_MAX_TOOL_ROUNDS, tool-call log in report.json (would
  have shown the game-matrix transcribe error immediately), rounding
  tolerance H1 rubric.
- Newly discovered: scoring display bug — judge sums raw 0-4 per
  criterion (max 16), but the report shows weighted max (40). Deltas
  valid, percentages deflated. Fix: total = Σ score×weight in the
  runner.

## 2026-09-15: Run 4 (hardened rig) — tool-value thesis validated

- 40/40 bandit (Δ+22), 40/40 fault tree (Δ+4); game −6 / fermi −9.
  Tool-call log proves: string-instead-of-object schema flailing (4
  calls) + skipped fermi_estimate. Deltas/cumulative numbers exact
  (16.140 ✓ pinning test values).
- EV-6 (weighted scoring) + EV-7 (operator prompt/log/rounds) RESOLVED,
  committed `2db88c9`. Run-4 report: evals/results/2026-09-15T15-10-16/.

## 2026-09-15: Run 5 — completion of the eval hardening (98.8 %)

- Feature branch `feature/harder-evals-actor-judge-split` fast-forward
  merged to develop (9bd6812) and deleted; parallel-session WIP
  (decisions.md, merge plan) preserved via stash.
- Run 5 (report evals/results/2026-09-15T15-47-23/): server 158/160. EV-8
  RESOLVED — both Run-4 error classes (schema flailing, skipped
  fermi_estimate) no longer occur. Remaining 2-point loss game matrix:
  detail, ∉ blocking. Eval track thereby completed; remaining: git
  push develop (user).
- **MERGE IMPLEMENTED (2026-09-15, branch `feature/merge-stochastic-into-clear-thought`)**:
  Phases 0-5 of the implementation plan (`plans/merge-stochastic-into-clear-thought.md`)
  executed. Port: `src/algorithms/*` (7 modules), `BanditRunStore` in
  SessionState (cleanup-integrated), dual registration
  (`stochasticalgorithm` name/signature unchanged + toolset `stochastic`,
  operation mdp/mcts/bandit/bayesian/hmm), 2 TOOL_METADATA entries
  (stateful:true), tests ported (`algorithms.test.ts`)
  - new merge contracts (`stochastic-merge.test.ts`: parity, bandit runId
    across both call paths, error contracts). Orchestrator: recipe 7
    `decision-under-uncertainty` + stochastic stage in `architecture-decision`
    (STAGE_GUIDANCE reindexed), 7th workflow prompt. Guide: template
    extended, constant regenerated via the new `sync:guide` script; root
    AGENTS.md regenerated via the real handler
    (`scripts/regen-root-agents.ts`) — orphaned
    stochastic-thinking marker block removed (verified: 0 markers,
    recipe 7 visible).
    Docs: root README single-server + migration section; stochastic README
    deprecation banner; MG-1/2/3 tracked in remaining-work-plan. Focused
    tests 30/30 green; typecheck green. Open: full-suite evaluation +
    phase 6 (release 1.1.0 + deprecation, waiting for approval).
    Stale-buffer trap documented (lessonsLearned).

## 2026-09-17: Spec-Review EMMS (specs/001-experience-memory-server)

- Review with clear-thought (structured_argumentation, argument_map 83% completeness, seven-seekers 7 lenses). Result: spec plan-ready, confidence 0.85.
- 5 findings (plan-level, not spec-invalidating), tracked in remaining-work-plan.md: actor model missing; revision/conflict semantics undetermined; eval corpus not defined; guidance object without concrete structure; detection thresholds (duplicates/contradictions FR-021) without a metric.
- Additional observations: fabricated-evidence risk (the agent can invent exit codes; only artifact evidence mitigates) and missing feedback loop for failed guidance paths — narrow these into acceptance criteria during planning.
- Server scaffold: servers/server-experiencememory/ created on branch 001-experience-memory-server (deviation from the feature/ naming convention documented).

## 2026-09-17: Analyze-Remediation EMMS (C1/C2/U1-U5/E1-E4/A1)

- All 12 findings from /speckit-analyze resolved via clear-thought decision (confidence 0.88): spec FR-008/022/SC-001/005/009 sharpened; contracts extended with workflow.abandon + artifact limits (1 MiB, 4 media types); research D6 (ranking defaults + applicability formula); tasks T007/T012/T022/T040 sharpened, T047 (abandon, US2) + T048 (baseline harness, polish) new -> 48 tasks.

## 2026-09-18: EMMS Implementation (T001-T048 completed)

- 58/58 tests green, typecheck clean. All phases (setup, foundational, US1-US5, polish) implemented.
- New files: src/domain/{types,state-machine,revision,errors,normalize}.ts, src/storage/{adapter,sqlite,migrations}.ts, src/evidence/{store,redact}.ts, src/guidance/{envelope,engine,limits}.ts, src/service.ts, src/tools/{register,index}.ts, 13 test files (contract+unit+fixtures).
- Key design decisions while implementing: finalize assessment is read-only (no state mutation on a rejected 'verified'); recordValidationRun transitions automatically SOLUTION_PROPOSED->VALIDATING; a harmful attempt only counts as 'unresolved critical side effect' if no later 'successful' attempt exists; idempotency check BEFORE revision check; schema validation happens at the SDK protocol level (isError), domain concerns at the service level.
- Open: T045 (gitnexus detect_changes), commit approval, full-quickstart run manually.

- 2026-09-18: `agents_guide` tool renamed to `setup_clearthought` (naming
  alignment with experience-memory's `setup_experience_memory`). Historical
  references above remain unchanged (log entries). Files renamed:
  setup-clearthought.ts / -template.ts / test. 142/142 tests green.

## 2026-09-22 — Guidance server Phase 1 (feature/guidance-v2-orchestration)

- Phase 1 scaffold of servers/server-guidance committed (aa80a94) + review-fix commit (8dae32a). T001-T005 [x] in specs/002-guidance-workflow-server/tasks.md; next: Phase 2 foundational (T006-T016).
- Code review (Review Agent) returned 7 findings; F1 (npm test failing) DISPUTED and dismissed with terminal evidence (passWithNoTests present, exit 0); F2-F7 fixed in 8dae32a. Reviewer could not run commands — snapshot verification done by main agent per Review Evidence Protocol.
- Open: orchestration.md checklist 34/34 marked reviewed (user-directed); implementation continues Phase 2 on user go-ahead.

## 2026-09-22 — Guidance Phase 2 complete + reviewed

- Phase 2 foundational (T006-T016) committed (4bdefbe) + review-fix commits (1b54853, 1970d8d). 39/39 tests, typecheck/build clean.
- Phase 2 review (Review Agent): 2 HIGH (spec_kit_feature_in_use missing from ERROR_CODES; non-atomic lock persistence) + useful MEDIUMs (canonical hashing, createRequire order, validator memoization) — ALL FIXED. Verdict was needs-changes; fixes verified on disk via terminal grep after /mnt/d silent-patch no-ops (edit-tool reported success twice but changes absent — always re-verify with grep, patch via terminal python).
- Next: Phase 3 / US1 workflow engine (T017-T028) on user go-ahead.

## 2026-09-22 — Guidance Phase 3 complete (US1 workflow engine)

- Phase 3 (T017-T028) committed (cb38202). WorkflowEngine + WorkflowTools + OperationEngine (process + composite firstAvailable). 52/52 tests.
- Schema example files made realistic (full field sets); transition selection fixed: reason-only transitions only on operation failure; test workspaces get a minimal package.json so verify ops succeed.
- Known limitation: successful `completed` path requires Phase 5 downstream client (or gitnexus CLI present in workspace).
- Next: Phase 4 US2 (T029-T033) then Phase 5 US4 (T034-T049) per tasks.md.

## 2026-09-22 — Guidance Phase 3 review APPROVED

- cb38202 reviewed: APPROVE, 0 HIGH/CRITICAL. F1-F5 persisted as tracked follow-ups in remaining-work-plan.md; F5 (ledger-into-transition) and F7 (missing await) fixed immediately in follow-up commit. Idempotency replay test deferred to next engine scope.

## 2026-09-22 — Guidance Phase 7b/8/9 review APPROVED

- 8658697 reviewed: APPROVED with tracked follow-ups (0 HIGH/CRITICAL; 3 MEDIUM + 5 LOW recorded in remaining-work-plan.md).

## 2026-09-22 — Guidance implementation COMPLETE (all 92 tasks)

- Phases 1-12 implemented on feature/guidance-v2-orchestration; 118/118 tests, typecheck/build clean. Final commit: Phase 10-12 review fix (getSession pure read; locked reconcile in getWorkflowState — MEDIUM resolved).
- Reviews: P1 fixed/approved, P2 fixed, P3 approve, P4 fixed, P5 fixed, P6 fixed, P7a H1 fixed + 7b scope recorded, P7b/8/9 approved w/ follow-ups, P10-12 approved w/ follow-up (write-on-read fixed immediately; ::1 test + Host-header validation recorded).
- Remaining tracked follow-ups in remaining-work-plan.md: Phase 7c SpecKitEngine hardening, Phase 5/6 policy wiring depth, Phase 10-12 LOWs (IPv6 test, DNS-rebinding Host-header validation, perf percentile method), MCP streamable-HTTP adapter mount, bearer-token authN.
- Next: merge flow per constitution (rebase → develop, squash → main) on user approval; /capture_lessons executed for Phases 4-6, 7a, 10-12 lessons (6 lessons seeded).
- 2026-09-22 — Full-codebase review fix round: F1-F4 fixed (commits 8eeba9c, e0b911d, e217ddf, 2054691, a8a5082). F4 tests debugged: second submit on terminal phase returns required_hook_failed (transition_rejected alias), not transition success — assertions must target the transition-carrying submit. Next: findings M2 (requestTimeoutSeconds enforcement), M3 (stale `as never` casts), Spec-Kit 12-tool MCP registration (needs SpecKitEngine wiring design decision).
- 2026-09-23 — M2/M3/F7 completed (commits 7efaa16, 2b7bbb2, 6cdc842, e3bded6, d1cd01b): requestTimeoutSeconds enforced, all `as never` removed, Spec-Kit 12 tools registered profile-gated (option C, lazy engine cache per sessionId + atomic StateStore). Review-HIGH (sessionId path traversal in StateStore) closed immediately. Suite: 136/136. Open: tracked LOWs in remaining-work-plan.md; merge flow (rebase→develop, squash→main) waiting for user approval.
- 2026-09-23 — All tracked LOW findings fixed (ab985b9, 5c34f3d): review-HIGH (missing await → '{}' payloads in 5 mutation tools) found by the reviewer and closed immediately with a regression test. Suite 137/137. Merge flow still waiting for user approval.
- 2026-09-23 — HTTP operation implemented and verified in the container: POST /mcp (streamable, stateless), bearer auth optional, GUIDANCE_BIND_HOST opt-in, Dockerfile+compose (port 3003, /workspace volume). Suite 142/142. Server now ready for use over HTTP as well; develop 2 commits ahead of origin (push via user).
- 2026-09-23 — Docs: server-guidance/README.md rewritten (installation, .guidance/ configuration reference with examples, agent loop with tool examples, Spec-Kit example, env variables); root README extended with a guidance line + short section (b4869af).

## 2026-09-23: SDK-Streamable-Transport-Migration (feature/sdk-streamable-transport-migration)

- clear-thought + insight: @smithery/sdk wrapper removed, direct StreamableHTTPServerTransport (stateful sessions, mcp-session-id, enableJsonResponse). No new dependency, sed patch dropped from both Dockerfiles.
- Container hardening: clear-thought npm ci + compose modernized + CLEAR_THOUGHT_BIND_HOST; insight label path fixed, server-local lockfile + npm ci (LOW resolved).
- Root-cause trap in the migration test: missing await server.connect(transport) — the transport accepted sessions, the server never responded. Only findable via the official SDK client E2E against dist/container (curl SSE artifacts misleading).
- Review (review agent): 2 HIGHs (root compose bind hosts, unbounded session growth) — both fixed in 1caa690; 3 accepted LOW/INFO observations tracked in remaining-work-plan.
- Status: 3 commits on the feature branch (bc5326c, dd065b4, 1caa690), tree clean; merge to develop still open.
- 2026-09-23 — Option D implemented (scaffold-on-first-start, init CLI, configured-aware /health; 4683720). Review-HIGH (scaffolded workflow referenced an undefined repository-analysis op → operation_not_configured at complete) fixed immediately + E2E regression test (scaffold-e2e). TOCTOU via wx flag. Config docs: dependency graph + attribute reference + best-practice order (ec14fe6). Suite 149/149.
- 2026-09-23 — Store reconciliation: the STDIO store (~/.insight, 76 episodes, as of 22.09.) was disjoint from the Docker store (37, today's lessons). migrate-stdio-store.mjs (container stopped, dry run beforehand) → Docker store now 113 episodes, FTS 113/113, container healthy, search verified via HTTP (old STDIO episodes + today's lessons both findable). STDIO store untouched as a backup.

## 2026-09-23: setup_clearthought loop-defense series completed

- Feature branches merged (develop): loop guard (d9d6759), F4 hardening
  (184a7ec), pagination (53f7714/582a9b9), escalation (44063c6),
  compact guide + recipes-on-demand (a5c5c98). Reviews: 0 HIGH/CRITICAL
  each, approved.
- Tracked follow-ups (reviews, trigger = next template/tool change):
  1. Test missing: compact output must contain EXACTLY ONE marker pair
     (a regression would mean double markers -> merge fallback). [R:
     a5c5c98 review #2]
  2. Escalation test via the utility toolset dispatcher (isError
     propagation via toolsets/registry.ts untested). [R: 44063c6 review
     #4]
  3. Observation accepted: section:'recipes' is unguarded (static
     ~2-3KB payload); rate limit only if spam is observed.

## 2026-09-23: Spec-Review Amendment 001-remote-mode (v3)

- Review performed: 0 blockers, 2 MEDIUM (M1 idempotency-vs-multiSession,
  M2 401-vs-session_not_found), 6 LOW. Findings persisted in
  specs/002-guidance-workflow-server/amendments/001-remote-mode-review-findings.md
- Implementation runs IN PARALLEL in a separate chat (already
  src/main.ts composeApplication options). Post-implementation review
  after the merge is mandatory (trigger entered in
  remaining-work-plan.md).
- 2026-09-23 — Remote mode (spec amendment 001) implemented: init_session config upload, pair auth (optional, anonymous fallback), session-bound tools, ClientOpEngine (1a), report_operation_result with auto-retry, TTL 30d, configured-aware /health. Review: 2 CRITICAL (ClientOpEngine never wired — patch loss; lastAttempt only on accepted) + 2 HIGH fixed. 155/155 tests. Branch feature/remote-mode-session-binding, merge to develop open.

## 2026-09-24: Full-Codebase-Review (develop @ 2d580fa)

- Basis: snapshot develop@2d580fa, clean, ahead 4 (fb0a350..2d580fa = remote-mode hardening + memory bank). Merge to develop DONE — "merge to develop open" above is stale.
- Result: 0 HIGH/CRITICAL open; 4 MEDIUM (CB-1 guidance touch() TTL bug; CB-2 guidance quota rollback gap configFiles; CB-3 session orphan pattern insight+clear-thought — re-evaluation of the accepted LOW from review 1caa690; CB-4 compose exposure 0.0.0.0 without insight auth); 9 LOW + 4 INFO — all persisted under "Tracked follow-ups (2026-09-24...)" in remaining-work-plan.md.
- Positively verified: insight FTS5 sanitization + prepared statements + atomic tmp+rename writes + read-hash verification; guidance SESSION_ID_PATTERN, separator-aware path protection, timing-safe pair auth, 401/404 channel separation, loopback fail-closed binding; reaper+MAX_SESSIONS in both HTTP servers.
- Tests NOT run (no Node toolchain in the session; three shells checked) — CI test.yml authoritative.
- Review quality: the c22585a commit message "dbg logs removed" did not hold (1 [dbg] in src L132 remained) → tracked as CB-9.

## 2026-09-26: Feature 003 Toolchain-Bootstrap implemented (chained workflow)

- Spec (16c6f1e on develop) implemented via the Guidance chained workflow (session session-1dcd604f, profile spec-kit active in .guidance/guidance.json, chain depth 16). Branch feature/guidance-toolchain-bootstrap: 77fa854 (implementation) + review-fix commit.
- Core: run_operation tool (only invocableByAgent:true, fail-closed), FR-107 per-session mutex, FR-109 cross-session workspace lock with stale recovery (dead-PID/TTL steal), FR-110 cooperative (spawnSync constraint documented), Dockerfile python3 + uv 0.12.19 pinned, examples/python-guidance (uv sync --locked fail-closed), E2E SC-001..004. Suite 268/268 + tsc + build green (container guidance-bootstrap-test).
- Independent review (subagent): 1 HIGH (stale lock) + MEDIUMs/LOWs — HIGH + denial audit + EACCES + README fixed immediately; rest (R-006 E2E gaps, R-008a global lock, R-010 ERROR_CODES test) tracked in remaining-work-plan.
- Test environment: no Node on the host — suite in a container (repo copy + @rollup/rollup-linux-x64-musl; for E2E the guidance image itself: node+uv combined).

## 2026-09-26: Amendment 003 Final-Review Evidence Gate implemented

- Occasion: a fresh overall review missed at the Feature-003 completion (soft instruction text) → gate made enforceable. Draft ff4fe31, implementation 2983be3 (Q1–Q3 defaults approved by the user).
- check-final-review.mjs (strict schema, HEAD match without a git binary, computed HIGH/CRITICAL), gate op required in scaffold/examples/root workspace (complete.beforeExit), 6 contract tests. 274/274 + tsc + build green.
- Tracked: FR number collision specs/003 vs amendments 001/002; amendment status update DRAFT→APPROVED upon user approval.

## 2026-09-26: Feature 004 Async Operation Execution (chained workflow, feature/async-operation-execution)

- Session session-85c8e497. Async executor (spawn, SIGTERM→SIGKILL, AbortSignal) replaces spawnSync; AbortController registry in WorkflowEngine; cancel_workflow = hard kill (FR-202/110 done); R-006 E2Es closed. stderr redaction for failing ops retrofitted (newly found gap). 290/290 + tsc + build green.

## 2026-09-26: Lock-Hardening (R-011/R-012/R-010, feature/guidance-lock-hardening → develop 61d7399)

- WorkspaceOpLock (src/workflow/workspace-lock.ts): acquire via link() (atomic, double-hold constructively excluded), steal via rename-into-quarantine with verify+restore. TTL = max(120s, 2× max op timeout) ⇒ TTL-stale implies a dead holder (R-012a invariant). New error code workspace_lock_unavailable (R-012b).
- Tests: 6-process race (exactly 1 holder), don't steal from a live owner, ERROR_CODES exact snapshot (R-010). 279/279 + tsc green. Residual micro-window (inspect→rename) documented: never a double-hold, at worst transient contention + quarantine orphan.

## 2026-09-24: Security/Policy verification (Phase 5/6 fixes) + remaining fixes

- User changes verified (code + container tests, node:22-alpine): Phase 6 egress content check (`containsSecretPattern` for restricted), `redactUnknown()` seam on content + protocolMetadata.structuredContent, multi-line redaction, capability-pin persistence across restarts. 192/192 green + tsc clean.
- Remaining fixes implemented: saveCapabilityPins atomic (tmp+rename), pin helpers exported, regression test tests/workflow/capability-pins.test.ts (5 tests: roundtrip/merge/drift/corrupt/atomicity). Suite 197/197 green, tsc clean.
- remaining-work-plan.md synced: L264/L266 (Phase 5/6) + CB-1/CB-2/CB-9 to [x] with evidence; new section "Security/Policy verification". Remaining guidance open points: metrics tool (L260), awaiting_client spec (L305d), remaining LOWs from R-1..R-3 (accepted).
- Test-environment lesson: no Node on the host PATH; container runs need a repo COPY (mount EACCES with npm install) + @rollup/rollup-linux-x64-musl installed afterwards (known native-bindings trap).

## 2026-09-27: Multi-repo capability finding (Guidance, Niyama example)

- User finding verified: guidance is wired single-repo — one workspace root (src/index.ts:15-16), assertWorkspaceInside + spec_kit_feature_outside_workspace reject foreign repos, .guidance/ config+state bound to that one root, deployment 1 container = 1 repo (docker-compose.override.yml).
- Consequence: for a second repo (Niyama) only workarounds are possible today (extra mount + sub-path as workspaceRoot, or a second container instance). Production-ready = a workspace registry concept is needed.
- Tracked as MR-1 (MEDIUM, architecture) + MR-2 (LOW, docs) in remaining-work-plan.md.

## 2026-09-27: MCP-timeout diagnosis (clearthought/gitnexus) — cause client-side

- Recurring `Context server request timeout` errors verified: container healthy, logs 24h without error/timeout/warn, direct curl MCP round trip against :3000/mcp = ~160 ms. Server side exonerated → the cause is the Zed MCP client/HTTP transport (its own, shorter request timeout; an aborted SSE stream cascades).
- Workarounds: heavy GitNexus ops via CLI instead of MCP; after a timeout restart the MCP session in the editor. Lesson documented in lessonsLearned.md (Avoid These Mistakes, 2026-09-27). Finding: :4747 = web UI, no /mcp endpoint.

## 2026-09-27: Spec-009 delta re-review R-1…R-5 (commit 7f9065f, spec-only)

- R-1 solved in spec.md (FR-901/903: copy list = workflow.json + schemas/, policies regenerated via FR-910) — BUT plan.md (L18, L46-47) and tasks.md (T7) still name policies.json as "copied" (contradicts FR-910/T13). → N-D1 (MEDIUM) tracked.
- R-2 solved (FR-902: reference guidance.json readable + profile field evaluable), R-3 solved (AC-3 differentiated golden-file comparison, testable via T5), R-4 solved (pattern "adopt coherence: workflow references unknown op <name>", AC-9), R-5 largely solved (target-.guidance exclusion + symlink rule for schemas/); residual vector: check not specified as realpath/resolve-based → N-D2 (LOW).
- Further: N-D3 (LOW) FR-909 referenced but not defined; N-D4 (INFO) FR-902 sentence break from the R-5 insertion, plan.md typo "und宵".
- Verdict: 0 HIGH/CRITICAL open → spec APPROVED; plan/tasks need a 1-line fix (N-D1) before/at implementation.

## 2026-09-27: Clear-Thought re-routing via the Guidance container (live verified)

- clearthought configured as a downstream server in .guidance (downstream-servers.json: host.docker.internal:3000/mcp, trusted, HD-1 reconnect; policies.json: egress allowlist; operations.json: reasoning-pass mcpTool, invocableByAgent:true). Partially committed by the parallel Spec-009 agent (109d3df/5406875); invocableByAgent flag: d2b394a on feature/clearthought-agent-invocable-pass.
- Live test: run_operation(reasoning-pass) = succeeded, 177 ms server-side (get_metrics), clearthought status ready — vs. timeout on the same editor route. Guidance container restart needed after a config change.
- Intended use: run workflow-mandatory reasoning passes in an orchestrated way; ad-hoc calls stay on the editor route (the new timeout policy in responses.json applies there).

## 2026-09-27: Spec-010 Review (independent spec review, commit 76801a2, develop, tree clean)

- Review object: specs/010-documentation-drift-gate/spec.md (draft, Q1–Q3 decided). Review of spec quality, no implementation exists.
- Snapshot: branch develop, HEAD 76801a2 = review commit, unstaged/staged diff empty at review time. Contexts verified: check-final-review.mjs, check-index-freshness.mjs, .guidance/operations.json + workflow.json (lifecycle.beforeExit), ConfigAssistant QUESTIONS (9 IDs), register-tools.ts (16 SPEC_KIT + 19 WORKFLOW tool names), errors.ts ERROR_CODES (~80), spec 009 (FR-901–910).
- Verdict: NOT APPROVED — 1 HIGH (F-1: FR-954 path-pattern semantics/base undefined, `src/config.ts` etc. do not exist as repo-root paths → gate dead or arbitrary), 5 MEDIUM (F-2 wiring point workflow.json beforeExit missing + gate order, F-3 check-1 "section reference" imprecise + README tool table already 12 vs 16 drifted, F-4 ERROR_CODES anchor does not exist in the README at all, F-5 check-4 heuristic "merge commit" unsuitable/undefined for this repo (rebase/squash) + blocking without an escape rule), 3 LOW, 2 INFO. Details: remaining-work-plan.md section Spec-010.

## 2026-09-27: specs/010 Implementation completed (T5-T10)

- Snapshot: branch develop, HEAD d89bb25 + uncommitted changes (operations.json, workflow.json, SpecKitEngine.ts, lifecycle.test.ts, contract docs, tasks.md 010). Everything verified in the container (344 tests/tsc/build/gate each exit 0).
- docsImpact semantics implemented: substring match against DOCS_RELEVANT_PATTERNS with backslash normalization (Windows paths); practically resolves S10-F1 (pattern as a defined constant with a defined base repo-root-relative changedFiles).
- S10-F2/F6 solved (beforeExit ahead of final-review-gate; contract specs/002 documents docsImpact incl. submission_invalid behavior).
- Open: push + index-freshness at complete_workflow; AD-1/AD-2 (adopt) untouched.

## 2026-09-27: specs/010 completion phase

- Review fixes (3191d05): segment matching + AC-5 test gaps. Final review by a fresh sub-agent: 0 HIGH/CRITICAL unresolved. lint/test ops red = pre-existing non-blocking (docs in remaining-work-plan). final-review.json + session-lessons.json written; index refresh after the last commit.

## 2026-09-27: specs/010 final-review round 2 — 2 HIGH fixed

- An independent final review found: check-1 tool parity was never implemented (no-op) + missing gate tests. Both HIGHs fixed (segment: check-docs-drift.mjs fully rebuilt, tests/scripts/check-docs-drift.test.ts 12 regression tests). MEDIUMs (free-text match, override file, chapter scoping) + LOWs (.bak dirs, digit codes, done>0 guard) also fixed. Gate exit 0 (35 tools on both sides), full suite 357/357, tsc green.

## 2026-09-27: Remaining-findings batch implemented (session-4e4471f2)

- Branch feature/rest-findings-batch. AD-1 semantics: copy instead of discard — non-generic reference ops land in operations.json with a marker; notes text + test AC-9 adjusted (legacy-custom-op now expected).
- Caution: Prettier --write reformats server-guidance/src (ConfigAssistant/SpecKitEngine) — bulk diff contained in this commit (format-only).

## 2026-09-27: AD-1/AD-1a/AD-2 closed (implemented in parallel, live verified) + Guidance workflow restart trap

- AD-1/AD-1a/AD-2 were implemented by the parallel agent (36e6233: non-generic ops are copied with an [adopted] marker instead of discarded; realistic-reference regression test; referencePath help+README document the builtin reference; 798e545: shape validation of copied ops; 4bd2556: [x] close-out with independent final review 0 HIGH/CRITICAL, suite 360/360).
- Independent live verification: guidance image rebuilt, the original repro setup_guidance_generate {referencePath:/examples/default-guidance} now GREEN (9-file payload, final-review-gate/store-completion-insight copied with a review note, coherence check green).
- Workflow session-d57a0bc7 was not resumable after a container restart: (1) restart with the wrong compose file (servers/server-guidance/docker-compose.yml alone — docker compose -f does NOT load the override.yml automatically → wrong /workspace mount, sessions "vanished"); correct: -f docker-compose.yml -f docker-compose.override.yml. (2) Afterwards config drift: session bound to the old configurationVersion (specs/008 AC-5, fail-closed) — restarts after a config change invalidate running sessions in principle.

## 2026-09-27: specs/011-adopt-templates implemented (session-f66c3f62, feature/011-adopt-templates)

- T1–T6 complete: resolveBuiltinReferencePath() (env GUIDANCE_BUILTIN_TEMPLATE_DIR, default PKG_ROOT/examples/default-guidance); validateAdoptReference accepts "builtin" (fail-closed FR-973); generateFiles: adopt without/"builtin" referencePath → builtin (AC-1/AC-2); adoptionBlock source:"builtin"+resolvedPath (AC-3); mounted reference byte-identical (AC-4); README builtin-vs-reference + env override.
- 2 latent 009 bugs fixed along the way (AC-1-e2e uncovered them): (1) mainConfigSchema additionalProperties:false without "adoption" → EVERY adopt config failed at loadConfig; schema extended with adoption:{type:"object"} (config.ts). (2) insight detection only checked "capture-session-lessons", the template uses store-completion-insight → query-project-insights was not regenerated, workflow boot failed operation_not_configured.
- Verification: vitest 369/369 (56 files), tsc --noEmit green, build green, detect-changes 4 files/6 symbols/MEDIUM (only expected).

## 2026-09-28: specs/011 Follow-up — wizard findings from niyama (branch feature/011-adopt-wizard-fixes)

- 3 findings from the wizard run in the niyama repo fixed: (1) sample prompts now enforce waiting for the user's answer ("ask one at a time and WAIT — do not answer on my behalf"); (2) clearthought is part of the default profile: buildDownstream always creates the server (tools allowlist of the reasoning tools referenced in instructions), shipped template downstream-servers.json extended, policies egress extended with :3000; (3) derived questions (profile/insight/gitnexus/gates) are no longer asked in adopt mode (nextQuestion respects DERIVED_IN_ADOPT — answers would have been overwritten by the reference anyway).
- Tests: +4 contract tests (adopt-skip, fresh-still-asks, clearthought fresh+adopt incl. egress, template data check); old config-assistant test (downstream {}) adapted to the default profile. Suite 374/374, tsc/build green, detect-changes 5 files/11 symbols/MEDIUM only expected.

## 2026-09-28: specs/011 Follow-up 2 — Container-only self-containment (niyama finding, branch feature/011-adopt-wizard-fixes)

- Finding: generated ops referenced scripts in the guidance package (servers/server-guidance/scripts/check-final-review.mjs, servers/server-insight/scripts/seed-lessons.mjs) — they do not exist in the target repo → complete phase fails at the final-review-gate. Rule: container-only configs must have NO dependencies outside the target repo.
- Fix: (1) generateFiles embeds both gate scripts as generated files under .guidance/scripts/ (fail-closed if package scripts are missing); (2) zero-dep seeder scripts/embedded/seed-lessons.mjs (MCP Streamable-HTTP via node:fetch instead of @modelcontextprotocol/sdk — the target repo has no SDK), LIVE verified against the EMMS server :3002 (initialize handshake + session id + SEEDED smoke); (3) template final-review-gate + buildOperations capture-session-lessons point to the .guidance/scripts/ copies; capture-session-lessons scope now ${projectName}-lessons (EMMS convention <repo>-lessons instead of the fixed thinking-mcp-lessons); (4) mounted references with old paths → loud WARNING-note (rewrite impossible, detection fail-loud); (5) adoption.resolvedPath remains allowed as provenance metadata (nothing executes it).
- Tests: 3 new self-containment tests (fresh, builtin-adopt, mounted-warning). Suite 377/377, tsc/build green.

## 2026-09-28: specs/012-adopt-response-wisdom implemented (session-3a85d0ce, feature/012-adopt-response-wisdom)

- T1–T8: (1) new dependency-free embedded script check-spec-drift.mjs (generic spec status hygiene: draft vs open checkboxes in tasks.md, FR-951.4 override comment); (2) embedded fileset +3; (3) builtin template: docs-drift op + complete.beforeExit [docs-drift, final-review-gate, repository-analysis, store-completion-insight]; (4) FR-982: validateAdoptReference requiredFiles + responses.json + phase coverage (adopt source: responses missing phase <id>) — BREAKING for old references without responses.json (documented); (5) FR-981: responsesOverride — reference responses copied, instructions.global swapped to the target shell (slot removed on an empty answer), buildResponses now fresh-only; (6) FR-985: referencePath trim + whitespace tests; (7) README: responses adoption + spec-drift gate documented.
- Infrastructure note: the chat-side Clear-Thought MCP transport timed out (2×) → mandatory passes (sequential_thinking understand/plan, assumption_xray review) executed via the container HTTP endpoint (localhost:3000/mcp, fetch + session handshake) — the server itself healthy; throwaway helper deleted after use.
- Verification: suite 384/384, tsc exit 0, build exit 0, detect-changes 5 files/7 symbols/LOW.

## 2026-09-28: specs/012 final review (sub-agent 7d3ca207) — findings balance

- Final review (fresh sub-agent, HEAD a55d381+follow-ups): 0 HIGH/CRITICAL. 2 MEDIUM: F-1 (the FR-981 comment claimed mirror behavior that only applies to responses.json — comment corrected, 011-workflow behavior deliberately untouched), F-2 (golden tests missing → determinism tests fresh+mounted added, timestamps stripped). LOWs: F-3 (spec-without-tasks skip now documented in spec.md), F-4 (duplicate write removed).
- Tracked follow-ups (trigger: next test round on config-assistant-extensions): wisdom-e2e via composeApplication boot with a marker; indented-checkbox test for check-spec-drift; env-override-e2e (011 legacy).
- FR-982 breaking (old references without responses.json) finally confirmed accepted + documented.

## 2026-09-28: specs/013-wisdom-baseline implemented (session-14fd6161, feature/013-wisdom-baseline)

- T1–T7: (1) FR-991 template responses.json synchronized to the buildResponses("") output (was stale-generic without the Clear-Thought sentences — the root of the niyama regression) + drift-guard contract test; buildResponses now exported. (2) FR-992 responses-wisdom.json curated (7 phases from .guidance/responses.json, shell sentences/WSL paths removed, {{CLEARTHOUGHT_URL}}/{{INSIGHT_URL}}/{{PROJECT_NAME}} placeholders + {{#server:NAME}} conditional blocks). (3) FR-993 renderAdoptedResponses (placeholders→transport-dependent URLs, conditional blocks per active server, unknown-token/unbalanced fail-closed, instructions.global slot FR-981 semantics). (4) FR-994 adopt path: builtin → wisdom fail-closed; mounted → wisdom if present otherwise responses.json (012-compatible); coverage check on the file in use. (5) FR-995 anti-drift tests. (6) e2e + README (Two response baselines). (7) Regression.
- Order bug on the first run: enabledServers was built BEFORE the adopt block from the initial insight/gitnexus values (always clearthought-only) → conditional blocks never rendered; fix: build the set only at the render call.
- Verification: suite 393/393, tsc/build exit 0, detect-changes 4 files/5 symbols/LOW.

## 2026-09-28: specs/013 final review (sub-agent fd7b22e1) — findings balance [L755-758]

## 2026-09-28: Guidance `get_downstream_status` structurally always shows "disconnected" on the HTTP transport (diagnosis session, live verified)

- **Finding:** The HTTP endpoint of server-guidance is stateless — a fresh McpServer + WorkflowEngine + ClientManager is built per request (server.ts L170-174: "Stateless streamable HTTP: fresh server+transport per request"). The connection status (`ClientManager.statuses`, in-memory) is discarded after every request. Therefore `get_downstream_status` can never report `ready` or `failed` over :3003/mcp — only the default `disconnected` (WorkflowEngine.getDownstreamStatus L668: `st?.status ?? "disconnected"`). Live verified: `run_operation reasoning-pass` = succeeded, immediately afterwards the status still `disconnected`.
- **Contradiction with the old entry:** The entry 2026-09-27 (L697) reports "clearthought status ready" — not reproducible on the HTTP transport per today's finding (possibly an in-process observation or a different build). The old finding is to be treated as a review-quality issue; the technical content (route works, 177 ms) remains valid.
- **Timeout classification (consequence of the diagnosis):** guidance→clearthought did NOT time out: get_metrics shows reasoning-pass 13/13 succeeded, 0 timedOut, max 177 ms; query-project-insights 22/22, max 258 ms. Observed timeouts originate from a different route — primary suspicion: the direct editor MCP connection (client-side request timeout, consistent with the diagnosis 2026-09-27 L685). Pending: attribute a concrete error message/source to a timeout.
- **Side findings:** (a) Old workflow session IDs from earlier container runs return `session_not_found` on run_operation — a "forced first use" thus fails silently and creates no downstream contact. (b) `get_metrics` counters survive container restarts (persisted in .guidance/state/metrics.jsonl), the connection status does not.
- Final review (fresh sub-agent, HEAD deaa1de): 0 HIGH/CRITICAL. F-1 (LOW, fixed): unknown-token throw + strict-leftover now coupled — wisdom fail-closed, lenient fallback keeps the 012 pass-through (regression test). F-2 (LOW, fixed): GITNEXUS_URL is used in the wisdom (complete phase, gitnexus-conditional). F-3 (LOW, fixed): mismatched-close-tag regression test added. F-4 (INFO, tracked): coverage logic duplicated (generateFiles/validateAdoptReference) — trigger: next change to responses file selection/coverage → extract a shared helper. Further tracked: PROJECT_NAME render assert; AC-6 self-containment scan extended to responses-wisdom.json.
- Implementation review (cb51d48e): F-1 MEDIUM (non-canonical {{…}} leftovers) → strictLeftovers solution; F-2 backreference; F-4 tokens shipped. All referenced in the balance above.

## 2026-09-28: GDS-4 implemented (feature/gds4-expose-op-content) — run_operation forwards complete tool responses

- Fix: exposeOpResult (WorkflowEngine.ts) now returns the exposure-filtered full result (content, data, errors, warnings; redaction stays upstream); new exported type ExposedOpResult; runOperation/StartResult/SubmitResult switched to the broader type.
- Config: .guidance/operations.json — all 10 operations to returnToAgent:"raw" (minimally invasive diff, 10 lines).
- Tests: +2 contract tests (raw forwarded completely incl. warnings; summary_and_errors still stripped, SC-004 preserved), profile-config test switched to objectContaining. Contract suite 206/206 green (2 confirmation runs), tsc --noEmit green.
- Live verification: guidance container rebuilt + deployed; run_operation reasoning-pass via :3003 now delivers the complete sequential_thinking response (content with thought + sessionContext).
- Note: GitNexus impact()/sequential_thinking over the editor route aborted during the session with the known client-side timeout (GDS diagnosis 2026-09-27) — caller analysis done manually via grep, plan documented in the chat instead of in the tool.

### 2026-09-29 — WC-4 Shipped-Config-Contract (feature/wc4-shipped-config-contract, Guidance-Session session-e782866b — COMPLETED, all gates green)

- Fix: tests/contract/shipped-configs.test.ts loads all 5 shipped config sets against loadConfig (only substitution: workspaces[] key; container roots do not exist host-side); egress consistency incl. disabled servers (raw URL.host like the validator) + negative control. 7/7 tests, suite 458/458 green. Independent review APPROVED 0 HIGH/CRIT; F1/F2 fixed post-review.
- Changes UNCOMMITTED on the feature branch; merge to develop outstanding. No new tracked findings (F3/F4 documented as INFO accepted in final-review.json).

### 2026-09-29 — WC-1 Wildcard↔TrustLevel-Coupling (feature/wc1-wildcard-trustlevel-coupling, Guidance-Session session-22e9b598 — COMPLETED, all gates green)

- Fix: validateDownstreamServers rejects wildcard ["*"] at an effective trustLevel != "trusted" fail-closed; non-string trustLevel rejected (review-F1); toTrustLevel extracted to src/trust-level.ts (validator+runtime one semantics). 6 new tests, suite 451/451, independent review APPROVED 0 HIGH/CRIT.
- Open tracked findings from this run: **WC-1-B** (trusted wildcard server + unconfigured destructive tools — runtime hardening, trigger: destructive non-operation tools on gitnexus/clearthought/insight) and **WC-4** (contract test for shipped configs vs. validator) in remaining-work-plan.md.
- Changes are UNCOMMITTED on the feature branch; merge to develop + Docker rebuild outstanding.

### 2026-09-29 — WA-1 Config-Assistant Multi-Workspace (feature/wizard-workspaces)

- Wizard questions `workspaceRoot` + `extraWorkspaces` ("name=path;…") added;
  `generateFiles` emits a workspaces[] block (default entry + extras) only
  when answers are set; generation validation fail-closed (name pattern,
  absolute roots, duplicates; root existence at loadConfig); adopt mode
  NEVER adopts reference workspaces (niyama class). Suite 440/440 green
  (clean full run; the last-flakiness lesson heeded). README updated.
- Final review (independent, session-756c112d): APPROVED, 0 HIGH/CRITICAL open. New tracked LOW follow-ups WW-2 (workspaceRoot without isAbsolute fail-fast at generation) + WW-3 (untested boundary cases: '=' in path, whitespace-only answers) in remaining-work-plan.md. Verification: suite run 2× — run 1: 2 load flakes (timeout errors, 310 s duration), run 2: 440/440 clean (0 failed, JSON report verified).

### 2026-09-29 — specs/014 Config Truth & Composition v2 (feature/config-truth-v2)

- Two-mode model implemented (user decision): workspace-mode instance-
  .guidance = registry only (registryOnly flag in loadConfig, FR-1101);
  cpSync bootstrap removed → missing repo process config fails closed
  workspace_process_config_missing (FR-1102); legacy monolith + dormancy
  boot warnings (src/config-truth.ts, FR-1103/1106); wizard mode-aware
  with target question repo-config|registry-edit (FR-1104/1105, WA-1 emission
  replaced). Suite 468/468 green (clean full run). New error code
  workspace_process_config_missing (docs-drift-conformant).

### 2026-09-30 — CT-1 Constructor Guard (feature/ct1-constructor-guard, 8f588c6, Guidance session session-1070c546)

- Fix: WorkflowEngine constructor now throws configuration_invalid
  (recoverable:false) for registryOnly=false with missing/incomplete
  workflow.file instead of a bare TypeError — structural check on
  workflow.id/initialPhase, since a truthy-empty workflow object would
  have bypassed a pure falsiness check (surfaced by review finding #2, test workflow={}).
  4 regression tests; suite 479/479 green; independent review APPROVED
  0 HIGH/CRIT; README note added. Chain run: steps CT-2, WW-1..3,
  WC-1-B, HR-1-SDD, DB-1-Rest-SDD follow in the same session.
- Infrastructure pattern: Clear-Thought/GitNexus MCP 2× timeout → container
  route (run_operation reasoning-pass) or terminal CLI (gitnexus analyze);
  submit_verification client timeout ≠ server failure (submission was
  accepted, gates ran server-side) — check state instead of retrying;
  container gate failures (lint/test) are environmental (no native
  node_modules in the container, required:false) — TYPE-1/GATE-1 tracked.

### 2026-09-30 — CT-2 Legacy-Monolith-E2E (feature/ct2-legacy-monolith-e2e, 96b0a67, Guidance session session-9e23340f)

- Test gap closed: registry-composition.test.ts extended with an E2E test —
  legacy monolith (full config at the pool root + workspaces[] registry) and
  a registered extra workspace with its own full .guidance: the session is
  composed from the workspace root (persisted session configurationVersion
  === workspace config hash, ≠ pool hash; no config copies). Suite
  480/480 green. No production code needed. Chain continuation as a fresh
  chain (session-9e23340f) due to CHAIN-1 (AC-5 drift of the auto-successor session).

### 2026-09-30 — WW-1 Extra-Root-Default-Dedupe (feature/ww1-extraroot-default-dedupe, 6029007, Guidance session session-58b4d57f)

- parseExtraWorkspaces(value, defaultRoot?): seenRoots seed with
  resolve(defaultRoot) — an extra root that collides with the default
  workspaceRoot fails at generation time (configuration_invalid) instead
  of only at container load; generateFiles passes the trimmed root.
  2 regression tests (incl. resolve-normalized collision);
  70/70 config assistant + 480/480 suite green; prettier green.
  Realpath/case collapse remains load-time (scope boundary documented).
  from already-known code locations instead of full-file reads.

### 2026-09-30 — WW-2 workspaceRoot-isAbsolute (feature/ww2-workspaceroot-isabsolute, 5c06639, Guidance session session-c4d8dba2)

- generateFiles (registry-edit): isAbsolute fail-fast for the default
  workspaceRoot after the empty check — consistent semantics with the
  extras (parseExtraWorkspaces); a relative path now fails at
  generation instead of only at container load. 1 regression test;
  focused 71/71; full run effectively 481/481 (2 known timeout flakes
  green on re-run); prettier green. Chain continuation as a fresh chain
  (CHAIN-1 workaround).

### 2026-09-30 — WW-3 extraWorkspaces-Boundary-Tests (feature/ww3-extraworkspaces-boundary-tests, 101306c, Guidance session session-46674965)

- Both tracked boundary cases regression-secured: '=' in the root
  (indexOf split, remainder = root) and whitespace-only ≡ omitted.
  E2E assertions on the generated guidance.json; no production code
  needed. Suite 482/482 green, prettier green.

### 2026-09-30 — specs/015 SDD: Registry-Hot-Reload + Dependency-Bootstrap (feature/015-sdd-registry-hot-reload-deps, Guidance session session-7980b278)

- SDD artifacts in draft status (NO implementation, per the rule):
  spec.md (US1 HR-1 with open design decision Watch-vs-Register +
  AC-1…AC-6, US2 DB-1-Rest deps-install/deps-reinstall with AC-7…AC-12,
  FR-1201+ namespace), plan.md (R1/R2 open points, technical approach,
  test strategy), tasks.md (4 phases, T001…T014). specs/008 tension
  anchored as a rejection criterion; config flag "Default off" as
  the safe mode. Memory-bank: HR-1/DB-1 set to SDD-complete,
  implementation pending.

### 2026-09-30 — WC-1-B Wildcard-Approval-Hardening (feature/wc1b-wildcard-unconfigured-approval, e5408c1, Guidance session session-b470f696)

- Option B (user decision in chat, alternatives A/C weighed):
  PolicyEngine.assertUnconfiguredWildcard — unconfigured tool on
  a wildcard server → recoverable authorization_required (instead of
  silently passing through without riskClass); wired in buildInvokerClosure after
  assertAllowed/opForEgress, before evaluateEgress. Real scope of
  application above all child/downstream engine wiring (parent closure +
  foreign operations stock). Configured tools byte-identical. 4 new
  PolicyEngine tests; suite 483/483 green; README wildcard section
  added. YAGNI note: config knob (option C) can be added later without a
  breaking change.

## 2026-09-30: Language Convention (communication German / artifacts English)

- User established a persistent language convention: chat communication in
  German, all generated artifacts (code, comments, documentation, commit
  messages, memory-bank entries) in English.
- Rule added to `AGENTS.md` under "User Preferences & Persistent Memory";
  backup created as `AGENTS.md.bak` beforehand per Rule Update & Backup
  Protocol. Convention also noted in `memory-bank/lessonsLearned.md`.

### 2026-09-30 — New machine: Guidance registry re-established

- Pool registry `/workspaces/.guidance/guidance.json` (host `D:\repos\.guidance`):
  workspace **thinking-mcp** → `/workspaces/Thinking-MCP` registered (alongside default).
  Old container `server-guidance-guidance-1` (wrong context, port drift,
  foreign `/workspace` volume) removed; restart from the root compose
  (`thinking-mcp-guidance-1`, mount `D:\repos -> /workspaces`).
- Repo `.guidance/guidance.json` corrected machine-specifically (UNCOMMITTED,
  goes into the next feature branch commit): `thinking-mcp.root` `/workspace` →
  `/workspaces/Thinking-MCP`; `niyama` entry removed (repo not present
  on this machine; re-register when a clone exists).
- Chained workflow started: session-77a51a32-ac77-413e-9339-e37fec32700f,
  4 steps (TYPE-1 → WC1B-F3 → GATE-1 → CHAIN-1). specs/015 implementation as a
  separate chain after the R1/R2 user decision.

### 2026-09-30 — TYPE-1 solved (feature/type1-ts2532, Guidance session session-77a51a32, chain step 1/4)

- TS2532 in tests/contract/shipped-configs.test.ts(125) fixed: `CONFIG_SETS[1]!.dir`
  (consistent with the `[0]!` idiom in the same file). Also normalized the file to LF —
  root-cause finding: the file entered the repo in WC-4 (235e9e6) with CRLF line endings AND the
  unchecked index access; every tsc run with tests/ since 235e9e6 had to
  report the error ("previously green" = a run before 235e9e6 or without typecheck over tests).
  CRLF additionally caused a prettier --check failure (endOfLine lf) — GATE-lint context.
- Verification (WSL, Node v24.21.0, tsc 5.9.3): typecheck green, prettier green,
  focused 7/7, full run 474 passed / 9 skipped (63 files).
- Observation: ~10 further test files contain CR (strings/fixtures), prettier-green;
  not part of TYPE-1.

### 2026-10-01 — TYPE-1 merged; cleanup chain restarted

- feature/type1-ts2532 fast-forward merged into develop (58faa7e…e0b2f60,
  develop ahead 6 of origin — push waiting on user), branch deleted.
- New chain session-293a251f-77ef-4ea1-a20d-f7587b926663 started:
  3 steps (WC1B-F3 → GATE-1 → CHAIN-1-Evidence). CONSTRAINT per step: no
  .guidance config changes mid-session (CHAIN-1 workaround).

### 2026-10-01 — WC1B-F3 solved (feature/wc1b-f3-integration-test, Guidance session session-293a251f, chain step 1/3)

- Integration test in tests/contract/tools-run-operation.test.ts: wildcard server
  (stdio, never spawned — policy throws before ensureReady) + composite operation with
  mcpTool step (server=wildcard, capability=unlisted-tool) → run_operation returns
  status "failed" with recoverable authorization_required (server/tool naming),
  no downstream contact. Semantics learned: firstAvailable composites report
  step failures as a result (status failed + errors), they do not throw — exactly the
  live picture of the repository-analysis gate (CHAIN-1 context).
- Focused 20/20, full run 475 passed / 9 skipped (63 files), prettier green.

### 2026-10-01 — GATE-1 evidence note (feature/gate1-evidence, Guidance session session-a0577447, chain step 1/2)

- Classification confirmed: container verify gates (lint=prettier --check,
  test=root npm test --workspaces) remain environmental — the guidance container
  has no Linux-native node_modules (DB-1 context, specs/015 US2 resolves it).
- Evidence from the session-293a251f completion (2026-10-01): executed completion hooks
  were exclusively script-based (docs-drift, final-review-gate, index-freshness,
  repository-analysis, capture-session-lessons — all green); lint (required:false)
  was skipped; test/build did NOT run in the completion flow. The authoritative
  verification route was WSL (full run 475 passed / 9 skipped, prettier green).
- Consequence: do NOT move gates to required:true, do not install native node_modules in
  the container — both only with DB-1 (deps-install). Hardening remains
  blocked until then; GATE-1 remains an OBSERVATION with extended evidence.

## 2026-10-01 — specs/015 implementation started (feature/015-us1-registry-register, Guidance session session-7e69dcdd, step 1/4)

- T001 done: spec checked against the codebase (WorkflowEngine/PolicyEngine/
  specs/014 registry; GDS-6 referenced as a related WorkflowEngine defect).
- T002 done: FR-1201…1210 (US1, alternative B) and FR-1211…1216 (US2)
  anchored in spec.md; R1/R2 decisions recorded as decided.

## 2026-10-01 — specs/015 chain: step 1 complete, US1 session in plan phase (HANDOVER)

- Chain session-7e69dcdd: step 1/4 (phase 1, T001/T002) COMPLETED (9dcca90,
  FR-1201..1216 anchored, review APPROVED). Successor born-invalid (AC-5) →
  tracked + cancelled; remaining chain started as a FRESH chain:
  **session-b045ff14-273c-4c66-a85e-1a588de02d64** (US1, T003..T006) —
  status: phase=plan (understanding submitted), branch feature/015-us1-registry-register.
- **US1 root-cause refinement (source-verified):** dual-engine hashes —
  boot parent = POOL config hash (8cf5be36), lazy child = REPO config hash
  (cacb2274) (engineForWorkspace, WorkflowEngine.ts:593-606). The successor inherits
  the session hash (~L2384) and, depending on the route, is checked against AC-5
  at the WRONG instance (L641-648) → born-invalid. Fix scope AC-16: bind the successor
  to its own workspace root hash + consistent routing; afterwards rebind
  semantics AC-13..17 on the same guard; registry-register tool (FR-1201..10,
  flag default OFF).
- Next steps (continuation): T003 failing regression test FIRST
  (successor composition/routing), then fix, registry-register, T005/T006.
  Completion protocol: analyze --no-stats --force LAST, pre-check gates,
  first-try complete (GDS-6!).

### 2026-10-01 — specs/015 US1 implemented (T003..T006, Guidance session session-b045ff14)

- **AC-16 fix (CHAIN-1):** after probe routing, getWorkflowState delegates the
  ENTIRE AC-5 guard to the routing engine (WorkflowEngine.ts) — workspace
  sessions are no longer measured against the pool hash. Successor born-invalid
  thus fixed (regression test: fresh-parent access).
- **Rebind semantics AC-13..17:** completed survives; active/blocked rebind
  after successful fresh-composition re-validation (session_rebound audit);
  invalid config remains fail-closed. specs/008 multi-workspace test updated to the
  new semantics (OLD fail-closed case → AC-15 test in
  registry-rebind.test.ts).
- **registry_register (FR-1201..1210):** profile+flag-gated (spec-kit +
  registryRegister.enabled, default OFF), WorkspaceRegistry.build-exclusive,
  atomic guidance.json write, registry_changed audit, new
  configurationVersion, childEngines invalidation. README tool reference +
  runtime registration rules added.
- Tests: registry-rebind.test.ts 8 (AC-13/14/15/16/17, flag, persistence,
  remove, FR-1208 onboarding), full run 483 passed / 9 skipped (64 files),
  typecheck + prettier green.

## 2026-10-01 — Re-review fix commit 04a2b4c (F1-F5) — CHANGES REQUESTED (1 new HIGH)

- F1-F5 fixes verified in source (sessionRoutes purge, fingerprintConfigDir drift probe before AC-5 guard, registryWriteLock serialization, configuration_invalid wrapper + tmp cleanup, engine-level profile gate).
- [REV-04a2b4c-1] HIGH (new, introduced by the fix commit): register-tools.ts L320-328 — the registry_register handler now passes the async registerWorkspace() promise UN-awaited through to toJson(); JSON.stringify(Promise) → "{}". The tool response loses configurationVersion/registry; on rejection (e.g. flag off, invalid root) the promise floats as an unhandled rejection instead of an MCP tool error. Fix: `await tools.registerWorkspace(...)` in the handler (pattern exists: getDownstreamStatus L301). Repro: registry_register tool call → response content "{}".
- [REV-04a2b4c-2] MEDIUM (coverage): no test exercises the fingerprint drift probe on a LIVE engine — AC-13/14/15 each use a fresh engine2 after touchConfig(); the claim "existing AC-14 test now exercises a live-engine path" does not hold. Missing: touchConfig() → engine1.getWorkflowState() → rebind.
- [REV-04a2b4c-3] MEDIUM (coverage): the F1 purge loop (sessionRoutes on childEngines invalidation) has no regression test (FR-1208 tests register→serve, not remove→stale-route-purge).

## 2026-10-01 — specs/015 US2 implemented (feature/015-us2-deps-operations, Guidance session session-2184b012)

- deps-install (composite firstAvailable: npm ci → npm-install fallback, audit via data.via capability label npm-ci-lockfile/npm-install-fallback), deps-reinstall (single process step: node -e rm node_modules + spawnSync npm install — firstAvailable stops at the first success, hence no 2-step composite). Templates: scaffold.ts (node block), ConfigAssistant.buildOperations, examples/default-guidance.
- Reactive detection (AC-9): OperationEngine appends node_deps_hint warnings on process failures containing "Cannot find module" or ERR_DLOPEN_FAILED (deps-install resp. deps-reinstall). Proactive probe (AC-10): guidance.json flag nodeDeps.proactiveProbe (default OFF) switches warnNodeDeps to operational wording (pointing to the ops).
- T007 contract tests FIRST (11 tests, real offline npm installations with file: dependency — zero-dep packages produce no node_modules at all). Full run 496 passed / 9 skipped; tsc/prettier/docs-drift green; commit e5780fc.
- Independent sub-agent review: APPROVED, 0 HIGH/CRIT; F1 (MEDIUM, AC-11 approval deviation: FR-053 gate fires only on destructive/credential_sensitive) + F2 (MEDIUM, fallback doc vs. real firstAvailable semantics) + F3-F6 (LOW) as tracked follow-ups in remaining-work-plan.md.
- Open: deploy after the chain (docker compose build guidance insight && up -d --force-recreate, ONLY outside sessions) + extend the instance .guidance/operations.json with the deps ops only THEN (AC-5 fingerprint — deliberately not changed mid-session); push only on user instruction.

### 2026-10-01 — specs/015 US2 COMPLETED (Guidance session session-a0feb195, 3rd attempt)

- Guidance completion achieved after two infrastructure wedges: (1) the session-2184b012 verify gate wedged on the container test timeout (19 min, GATE-1) + a leaked test fixture process → cancelled; (2) session-a1afbe61 died on a guidance container restart (sessions are workflow-run-scoped, they do not survive a restart). session-a0feb195 ran through completely: all completion gates green (docs-drift, final-review-gate, index-freshness, repository-analysis, capture-session-lessons).
- Merge: feature/015-us2-deps-operations fast-forward into develop (e5780fc + 06cf335), branch deleted. Push still only on user instruction.
- Infrastructure lessons (see lessonsLearned.md): gitnexus -32001 "Session not found" is NOT re-initialized by the ClientManager → a gitnexus server restart alone does not help because guidance sessions are in-process; repo-root /tmp scratch files must never be younger than the gitnexus index (the index-freshness gate counts them as sources) — write diagnostic output exclusively to /tmp.

## 2026-10-01 — REV-04a2b4c-1 completed (Guidance session session-b568d084)

- The await fix was already in develop (b09f74b, incl. F1/F2 regression tests); the remaining gap was the missing tool-level response shape test. Added in registry-rebind.test.ts ('review F-handler'): a stub MCP server intercepts the registry_register handler, real WorkflowTools over the pool engine; asserts configurationVersion + registry in the serialized body (not a Promise-'{}') + fail-closed rejection /root does not exist/. Focused 12/12, tsc/prettier green.
- Merge: feature/rev04a2b4c1-registry-await-test → develop (9b07627, fast-forward), branch deleted. Independent reviewer sub-agent (fc79ecb9): APPROVED, 0 HIGH/CRIT.
- Infrastructure findings: (1) Clear-Thought MCP server timeouts throughout (sequential_thinking/metacognitive_monitoring) — FR-035 escalation + chat analysis fallback; container thinking-mcp-clear-thought-1 is running but not responding → check. (2) GDS-7 concretization: the repo-local .gitnexus belongs to the identity /mnt/d/repos/thinking-mcp (lowercase) — WSL analyze from /mnt/d/repos/Thinking-MCP (uppercase) fails with 'foreign'; fix: run analyze from the lowercase path. gitnexus-server analyze writes to its own /data storage, NOT repo-local → useless for the index-freshness gate. (3) gitnexus analyze WITHOUT --skip-skills rewrites AGENTS.md/CLAUDE.md (CLI section removed) — reverted; always use --skip-skills from now on. (4) GDS-6 confirmed live: after required_hook_failed → retry_operation success, the server does not finalize (phase complete, status stays active, no terminal transition) — exactly the tracked defect picture.

## 2026-10-01 — GDS-6 + CHAIN replay closed, CHAIN-1/US1 verified as implemented (Guidance session session-310b5d4a)

- Scope reassess against develop 9b07627: specs/015-US1 (R1=B, R2 rebind AC-13..17, successor rebind) already implemented (a40f485/04a2b4c/b09f74b) with 12 regression tests — no re-implementation needed.
- GDS-6 fixed (WorkflowEngine): hook failure persists pendingCompletion {report, requestId}; retryOperations now finalizes completely when the phase is complete (status=completed, completedAt, workflow_completed audit, chain successor from the retained report, requestId cache). New helpers createChainSuccessorLocked/activateSuccessor shared with completeWorkflow. Live repro was session-b568d084 (same defect picture).
- CHAIN replay fixed: start_workflow rejects top-level request == steps[0].request (trimmed) fail-closed with configuration_invalid (step-0 double execution); generic context chains remain valid.
- Tests: tests/workflow/retry-finalize.test.ts (4 tests; deterministic hook failure via a ws-local .guidance with a composite of two analyze-mcpTool steps + capability-dependent invoker — the template fallback process would make a through-installed gitnexus green in WSL). Focused 35/35 (incl. chain.test.ts + registry-rebind), full run 502 passed / 9 skipped, tsc/prettier green.
- README: chain semantics added (duplicate step-0 rule, retry finalization).

## 2026-10-01 — Independent Review eedb7bb (feature/gds6-chain-replay-hardening): APPROVED, 0 HIGH/CRITICAL

- Basis: HEAD eedb7bb == review commit, working tree clean; diff vs develop 9b07627 read; WorkflowEngine.ts touchpoints + types verified in the current source.
- Refactor equivalence confirmed: sessionId→session.sessionId / result.sessionId are value-identical; audit events (chain_end/chain_failed/chain_successor_created/session_started), requestIds caching and chainUpNext advancement unchanged.
- State machine: lock discipline correct (successor creation under the predecessor lock, activation under the successor lock with re-check); 'complete' phase has a success transition → retry-finalize fires; requestId replay returns the final result; complete_workflow afterwards → workflow_already_completed; 'activating' recovery path untouched.
- Defect pinning hard-proven: ran the test file against the pre-fix src (9b07627) → 3/4 tests fail (both GDS-6 tests + duplicate rejection), the negative control stays green. Post-fix: retry-finalize 4/4 + chain.test.ts 19/19 green. Temporary worktree/checkout swap fully rolled back (tree clean again at eedb7bb).
- Findings: 0 HIGH/CRITICAL; 1 LOW code (requestId cache in retry-finalize not refreshed post-activation), 1 LOW test hygiene (orphan comment), the rest info — all tracked as REV-eedb7bb-* in remaining-work-plan.md.

## 2026-10-01 — REV-US2-F2/F3/F4 closed (Guidance session session-12d087d8)

- F2: deps-install description in all three catalogs (scaffold.ts, ConfigAssistant.ts, examples/default-guidance/operations.json) + README switched to the real firstAvailable semantics (fallback on EVERY npm-ci error, node_modules deletion caveat). Decision: doc alignment instead of a condition field.
- F3: OperationEngine composite failure merge carries step warnings along (node_deps_hint survives); a new test pins this.
- F4: three catalogs field-identical (canonical: protocolRequestMustSucceed + summary_and_errors + 'Runs in the workspace root' phrase); a drift guard test compares scaffold generation vs. ConfigAssistant-generateFiles vs. shipped example across 10 fields.
- Independent review (036a6d4d): APPROVED, 0 HIGH/CRIT; follow-ups REV-F2F3F4-1/-2 accepted+tracked (exposure filtering: merged warnings agent-invisible under summary_and_errors), -3 (join separator) fixed in 3ed06b9.
- Full run 504 passed / 9 skipped; tsc/prettier green. Commits 7edef62 + 3ed06b9 on feature/rev-us2-f2f3f4; merge into develop after completion.

## 2026-10-02 — Independent Review 5d782c9 (feature/fr053-approval-gate) — APPROVED (0 HIGH/CRIT open)

- Snapshot: branch feature/fr053-approval-gate @ 5d782c9, basis origin/develop 5a0a3b6, clean tree. Tests: approval-gate/policy-engine/exposure-wiring/deps-operations — 26/26 green (WSL vitest).
- Gate wiring semantically verified: 8 assert/consume pairs (runOperation, activateSession, runAfterEnter, submitLocked beforeExit/beforeEnter/afterExit, completeWorkflowLocked, retryOperations); assert before ANY execution, consume only on status=succeeded; replay check (requestIds) BEFORE assert → replay does not re-execute ops; runningOps/workspace lock closes the TOCTOU window; routedFor delegates completely to the child engine, which reads the same session file (incl. grants). Exposure: warnings under summary_and_errors now redacted-at-source (stderr → redactor), errors already carried redacted stderr before — no new leak class. Harness rewrites (replay/e2e) no weakened assertions, all SC cases preserved.
- New tracked findings: REV-F053-1 (LOW, hook lists op-by-op instead of batch assert — re-approval after retry), REV-F053-2 (LOW, declarative riskClass trust for composites — accepted), REV-F053-3 (INFO, consume lost-update window — unreachable, accepted). Details in remaining-work-plan.md.

## 2026-10-02 — FR-053 approval gate wired (Guidance session session-01df2607, remaining backlog)

- ESCALATION: requiresApproval had NO runtime consumer — the FR-053 gate was completely unwired (F1 finding sharper than tracked).
- Implementation (scope A user decision): requiresApproval + workspace_write; assertApprovals on all 8 execution paths (runOperation + lifecycle); grants via approval ceremony (report_blocker category approval + resume "approve <op>", session.approvedOperations, success-based single consumption); audit approval_required/granted/consumed.
- REV-F2F3F4-1: applyExposure summary_and_errors lets warnings through (node_deps_hint agent-visible).
- F5: platform note (deps ops Linux/container-only) in README + 3 catalogs; F6: require→import.
- Python profile: toolchain-sync removed from understand.afterEnter (auto workspace write incompatible with the ceremony; E2E uses run_operation).
- Independent review (d6994259): APPROVED, 0 HIGH/CRIT; bypass analysis (routed engines, argumentOverrides, TOCTOU, replay) clean; REV-F053-1 (over-approval on multi-gate hook lists) tracked, -2/-3 accepted.
- Full run 530/530; tsc 0 errors; prettier green. Commit 5d782c9 on feature/fr053-approval-gate.
- Deployment note: the running container enforces the gate only after the next rebuild/redeploy.

## 2026-10-02 — FR-053-Batch deployed

- develop → origin/develop pushed (5d782c9 + 46a3afa); container rebuilt (image 2026-10-02T13:08Z) and restarted (healthy). The FR-053 approval gate (scope A), GDS-6 retry finalization and CHAIN replay protection are thus active in the running instance.
- Operations note: first execution of a workspace_write/destructive/credential_sensitive op per run → authorization_required → approval ceremony (report_blocker category approval + resume "approve <op>"), see README "FR-053 approval ceremony".

## 2026-10-02 — Independent Review 588fa62 (feature/f0531-gds7-cleanup) — APPROVED (0 HIGH/CRIT open)

- Basis: 588fa62 vs. origin/develop 46a3afa; 34/34 tests green (approval-gate, deps-operations, engine, lifecycle-points).
- REV-F053-1 verified as RESOLVED: all four loops (activateSession beforeEnter, runAfterEnter, submitLocked beforeEnter, afterExit) hoist resolution + assertApprovals before the first execution; consumeApprovals remains success-based per op; batch sites (completeWorkflowLocked, retryOperations, runOperation, submit gates 2491/2832/3122) unchanged; audit rename id → op.operationId is neutral (operationId = config key, WorkflowEngine.ts:330).
- New tests pin the defect: pre-loop denial names repository-analysis, NO approval_consumed in history, build grant intact — on pre-fix code (per-op assert) the test would fail (an earlier op ran + consumed the grant).
- New tracked finding: REV-F053-1b-1 (INFO, cosmetic — comment text indentation WorkflowEngine.ts:2622). Details in remaining-work-plan.md.

## 2026-10-02 — REV-F053-1 all-or-nothing + GDS-7 docs + F2F3F4-2 (Guidance session session-a6005ca0)

- The four op-by-op lifecycle loops (activateSession-beforeEnter, runAfterEnter, submitLocked-beforeEnter/afterExit) now validate the entire hook list before the first execution (all-or-nothing); consumption success-based per op. Audit events id→op.operationId (value-identical).
- Regression tests (approval-gate.test.ts, plan.beforeEnter multi-gate list [ungated, build, RA]): denial at the last gated op BEFORE any execution, no approval_consumed, earlier grant intact; happy path consumes exactly 2 grants.
- GDS-7: dual-index procedure anchored in README (lowercase path, --skip-skills, --force on 'Already up to date', container /data split). F2F3F4-2: via label 'visible in run history' in 3 catalogs.
- Review (980283a0): APPROVED, 0 HIGH/CRIT; REV-F053-1b-1 (INFO, indentation) fixed in 10cc5a9. Full run 532/532; tsc/prettier green.

## 2026-10-02 — approval policy config (unattended rework, session-0861a7b4)

- User design correction: workflows must run unattended — per-execution approvals (scope A) contradicted that. Trust decision moved into the configuration: policies.approvals (riskClass → allow|require, RID-1-style fail-closed validated); defaults: destructive/credential_sensitive → require (ceremony remains fully intact), all others → allow (unattended).
- Bug found + fixed en route: validatePolicies early-returned on a missing submission section and skipped approvals validation — a fail-closed test pins the fix (fails under old code).
- requiresApproval(config, approvals) resolves entry ?? default; assertApprovals/consumeApprovals pass config.approvals (child engines use their workspace config); the configVersion hash covers policies incl. approvals.
- Test rework: scope-A harness grants removed in 6 suites (redundant), approval-gate.test.ts switched to require-policy fixtures + default-unattended test + config validation fail-closed test. Full run 534/534.
- Review (b0690aa5): APPROVED, 0 HIGH/CRIT; REV-APPCFG-1 (LOW, composite riskClass claim check re-scheduled), REV-APPCFG-2 (INFO) tracked.
- Deployment: a new build is needed; afterwards operation is unattended — the ceremony only applies to destructive/credential_sensitive (currently no such op in the profiles).

## 2026-10-02 — Registry hot-reload + deps pre-flight (Guidance session session-fae2aa34, feature/guidance-registry-hot-reload-deps-preflight)

- Bug 1 (workspace_not_registered after registry_register): root cause was a WorkspaceRegistry handle frozen at boot time in the start_workflow closure (registerWorkflowTools param 4), while registerWorkspaceLocked had long recomposed the engine config (incl. registry) live. Fix 1A: registerWorkflowTools now takes a provider () => WorkspaceRegistry; ComposedApp carries engine; composeApplication returns workspaces as a live getter (also fixes stale /workspaces listings). Regression: register → start_workflow in the same process (registry-rebind.test.ts, +2 tests).
- Bug 2 (niyama without node_modules): user decision 2B — automatic pre-flight. config.preFlight.enabled (default ON, opt-out); before required lifecycle gates (beforeEnter/beforeExit) the WorkflowEngine checks the deps state (node_modules missing = deterministic; mtime best-effort) and calls the configured deps-install operation, serialized per workspace root, fail-open, audit deps_preflight. ABI mismatch deliberately remains reactive (deps-reinstall/nodeDepsHints).
- Verification: tsc green; registry-rebind 15/15; deps-preflight 8/8; full run server-guidance 69 files / 547 tests green (in the guidance container). gitnexus analyze --no-stats (reindex, exact path /mnt/d/repos/thinking-mcp) + detect-changes --scope all: only server-guidance symbols affected, no surprises.
- Deployment note: the running container still runs the old build — docker compose build guidance && docker compose up -d before the niyama dummy workflow with the new fixes (see remaining-work-plan PREFLIGHT-DEPLOY).
- Final review (sub-agent 4ab6fa12, over the full session diff beaf503..9e39159): APPROVED — 0 open HIGH/CRITICAL; 3 LOW + 1 INFO tracked as REV-FINAL-PF-1..3 (remaining-work-plan.md). Verify gates after format fix: prettier --check green, build green, focus suites 24/24, full run 548/548.
- 2026-10-02, close: PREFLIGHT-DEPLOY executed by user (container recreate) — both fixes are live. Live verification (niyama dummy workflow: register → start_workflow without restart, automatic deps-install before the first gate) is done by the user; result pending.

## 2026-10-03: WIZ series tracked — config assistant rework (planning session)

- User tasks tracked as WIZ-0..WIZ-4 in remaining-work-plan.md (implementation not yet started):
  WIZ-1 target mode rework (`extraWorkspaces` question dropped, derivation automatic), WIZ-2 projectName auto-suggestion, WIZ-3 remove profile `plain/spec-kit` + register all tools by default, WIZ-4 workspaceRoot default from GUIDANCE_WORKSPACE_ROOT.
- The open requirement questions are noted per entry in the remaining-work-plan; the user must clarify them before implementation starts (suggested order WIZ-4/2 → WIZ-1 → WIZ-3, branch strategy open = WIZ-0).
- Meta: the clear-thought server ran with request timeouts during planning (2× sequential_thinking) — planning done inline; hint documented in WIZ-0.
- 2026-10-03, addendum: WIZ-1 requirements clarified by user (one pass = repo config + registry entry; agent performs the merge; path existence is checked; yes/no question for initial registry creation) — entry set to "ready for implementation" in the remaining-work-plan. Open: WIZ-2 (questions 4-5), WIZ-3 (questions 6-8), WIZ-4 (detail question).
- 2026-10-03, addendum 2: WIZ-2 requirements clarified — path (b) server-side start parameter workspaceNameHint + mandatory confirmation (user can override); kebab-case normalization via WIZ-1 dual use (project.name + registry name) documented as an additional requirement. Open: WIZ-3 (questions 6-8), WIZ-4 (detail question).
- 2026-10-03, addendum 3: WIZ-3 requirements clarified — drop the profile field entirely (schema exit, load legacy files with tolerance), always allow chain forms A+B when chain.enabled (the form decides per chain via the manifest), all spec-kit tools registered unconditionally. WIZ series now only open with the WIZ-4 detail question.
- 2026-10-03, addendum 4: WIZ-4 clarified (variant ii — default = GUIDANCE_WORKSPACE_ROOT + / + workspaceNameHint when both present; otherwise no default; no plausibility logic). WIZ SERIES FULLY SPECIFIED: WIZ-1..4 all ready for implementation. Pending: user decision on branch strategy (current branch feature/guidance-registry-hot-reload-deps-preflight has open work; suggestion: feature/wiz-config-assistant-rework, order WIZ-4 → WIZ-2 → WIZ-1 → WIZ-3, if needed in a worktree).
- 2026-10-03, independent review fe25128 (WIZ-4 workspaceNameHint, feature/wiz-config-assistant-rework): APPROVED — 0 open HIGH/CRITICAL. Verified: git show --stat, full diff per file, ConfigAssistant source (nextQuestion/requireCompleted/generateFiles paths untouched — catalogOverview default {} inert), contract suite 36 files / 314 tests green. Findings REV-WIZ4-1..4 (2 LOW, 2 INFO) tracked in remaining-work-plan.md.

## 2026-10-03, evening: WIZ-4 completed, chain aborted (user instruction), 6 workflow follow-ups tracked

- WIZ-4 DONE: feature/wiz-config-assistant-rework (fe25128 + 0f829ed), session-b1c62520 completed (all gates green: docs-drift, final-review, index-freshness, repository-analysis, capture-session-lessons).
- Successor cycle (session-b22053ef, steps[0] duplicate WIZ-4) CANCELLED on user instruction — WIZ-2/1/3 still outstanding (resumption structure = WF-6, user decision).
- All workflow problems tracked as WF-1..WF-6 in the remaining-work-plan (Clear-Thought timeouts, state-transition timeouts, root build/tsc bins + yarn.lock collateral, stale final-review evidence, index-freshness vs. vitest artifacts, chain-head scope trap); lessons in lessonsLearned.md.

## 2026-10-03, night: WIZ series COMPLETE (chain session-7876f096: WIZ-2 head + WIZ-1 + WIZ-3 successors)

- All four WIZ tasks implemented and accepted via guidance cycles (0 HIGH/CRITICAL in all independent reviews): WIZ-4 (b1c62520), WIZ-2 (7876f096 head), WIZ-1 (abe752d7), WIZ-3 (57412c1b). Final review 4600e5bb over the total diff: 0 HIGH/CRITICAL; F1 (docs-drift camelCase regex) + F2 (README counters) fixed (1957ec9); F3/F4/F5 LOW tracked.
- Branch feature/wiz-config-assistant-rework: 12 commits (fe25128..1957ec9), full run 572/572, tsc/prettier/docs-drift green. Open: merge into develop, push, container rebuild.
- final-review.json headCommit 1957ec9 (gate script green); session-lessons.json written with 5 lessons; chain ends after WIZ-3 (last step).

## 2026-10-03, late: WF follow-up resolution (feature/wf-followups, session-cc9b8326)

- WF-1 SOLVED (docs): the container route is the sanctioned Clear-Thought path; attribution to the editor client layer documented as an inference (AGENTS.md, backup .bak exists, generated block untouched).
- WF-2 SOLVED: submit-once-then-poll in responses.json verify/complete (instance + example) + README section.
- WF-4 SOLVED: the complete phase carries an explicit final-review.json mandate (required fields, 40-hex, headCommit==HEAD, re-bless after late commits, checker command) + requiredAction.
- WF-5 SOLVED (code fix chosen): check-index-freshness.mjs SKIP_DIRS on all path segments; touch verification; README note.
- WF-6 SOLVED (closeout): WIZ chain complete; lesson verified in lessonsLearned.md; entries resolved.

## 2026-10-03, addendum: WF-6 trap constructively hardened (session-2f55537b, feature/wf-followups)

- Level 1 already in place (CHAIN replay guard, startWorkflow: request === steps[0].request → configuration_invalid fail-closed; tests in retry-finalize.test.ts) — verified instead of newly implemented.
- New: CHAIN HEAD SCOPE annex in guidanceFor for chained heads (chainFrom === null + steps): warns the head agent not to implement steps[] scopes under the head session (discipline form of the trap); successors/form-B/non-chained do not carry the annex. 4 new tests, 8/8 green.
- Templates deliberately unchanged (conditional engine-side instead of a static template sentence — assumption documented in the plan review).

## 2026-10-03 (fault_tree top-gate fix, feature/fix-fault-tree-top-gate, session-a9c2d5b6)

- Implemented: fault_tree top-gate resolution from top_event (id → unique name → unique unreferenced non-basic gate → legacy last-element fallback); top_gate_type flag for basic tops; assumption_xray no_marker note with English-only hint; 12 new regression tests (3 report vectors across multiple array orders).
- Verification: 178/178 suite, typecheck clean, prettier/build gates green, GitNexus reindex. Independent review (sub-agent): approve, 0 HIGH/CRITICAL; 2 MEDIUM + 2 LOW fixed in-review (ID precedence before name ambiguity, multi-top fallback pinned, basic-by-name test).
- Open (tracked in the remaining-work-plan): FT-AXRAY-DE (German markers), FT-FT-F1 (multi-root fallback transparency), FT-CHAIN-DUP (successor duplication risk), merge/push after user approval.

## 2026-10-03 (severity gate review findings, feature/severity-gate-review-findings, session-4e869880)

- Analyzed: the review reason transitions (implementation_changes_required / major_plan_revision_required) were dead code in the engine — selectTransition matched reasons only via the hardcoded verification_failed; policy reviewFindings.blockingSeverities was consumed nowhere.
- Implemented: new helper module src/workflow/review-findings.ts (evaluateReviewFindings: blocking iff severity ∈ blockingSeverities AND status ∉ {fixed,tracked,accepted} — semantics like check-final-review.mjs); gate in submitLocked (after validation, before transition selection, deterministic for replay); selectTransition extended with a gateReason parameter (verification_failed precedence unchanged); audit event review_findings_gate_triggered; loop counter session.reviewGateLoops[phase] (option A, no hard cap), aggregated in guidanceFor as a SEVERITY GATE LOOP note.
- Schemas (F2 strict): review-implementation + review-plan each require per finding severity (enum) + optional status (fixed|tracked|accepted); mirrored in examples, test fixtures and scaffold.ts inline schemas. F1: gate applies to BOTH review phases. Without a policy lenient (gate off).
- Verification: 585/585 tests (71 files) green, typecheck clean. User decisions F1=both, F2=strict schemas, F3=option A confirmed in chat beforehand.

## 2026-10-03 (after merge 6b5fb3b): FINAL-REVIEW-RELOOP tracked as a design gap

- User decision: the absence of a re-review cycle for fixes in the completion phase is a problem. The final-review gate blocks open HIGH/CRITICAL (no status fix → no completion), but there is no reason transition back from `complete` — fixes run without another review phase, integrity hangs only on gate strictness (FR-122 + recomputed openHighCritical).
- Tracked in memory-bank/remaining-work-plan.md (FINAL-REVIEW-RELOOP): proposed design = reason transition final_review_changes_required → implement, driven by the same blockingSeverities evaluation as the review gate (feature 6b5fb3b); full cycle implement → review → verify → complete for the fixes. Trigger: next scope on completion phase/state machine/gate semantics.

## 2026-10-03 (YARN-LOCK-TRAP Guard, feature/yarn-lock-guard, session-22f8339b)

- Implemented: pre-commit/pre-push guard `scripts/check-yarn-lock.sh` (POSIX sh, no Node dependency) via versioned `.githooks/` + `core.hooksPath` (activated on this checkout). Blocks: Yarn-v1 lockfile, unrecognizable format (positive/negative detection: v1 header OR missing Berry markers `__metadata:`/generator header — hardened from assumption_xray falsification), staged deletion, pruned root tree (fresh-clone-safe).
- Tests: `sh scripts/test-yarn-lock-guard.sh` — 7/7 green. Docs: AGENTS.md WF-3 extended (backup AGENTS.md.bak before edit), README section "Repository guards". Tracking YARN-LOCK-TRAP resolved (fixed with coverage).
- Lessons: test-harness CWD trap (the guard ran in the wrong directory → expect_in fix) and CRLF trap (write_file writes CRLF, sh needs LF → sed before commit).

## 2026-10-03 (evening): YARN-LOCK-GUARD review round — H-1 bypass + fail-closed fixed

- Independent review (session-227c65a1) reported 1 HIGH + 3 MEDIUM + 2 LOW. All fixed:
  H-1 (git add -N + commit -a bypass past the index) → guard additionally checks the working-tree yarn.lock; M-1 (git-diff error fail-open) → fail-closed with a block message; M-2 (subdir invocation checked the wrong file) → cd toplevel at script start; M-3 (pre-push hook pointless: index empty at push time) → guard now checks HEAD:yarn.lock (push tip), catches --no-verify/hookless commits; L-1 (missing exec bits in the index) → chmod +x committed; L-2 (vacuous test harness) → setup abort on fixture failure + 4 new cases (worktree-v1, subdir, index-failure, committed-tip).
- Tests: 11/11 green (previously 7/7). Docs (AGENTS.md/README/pre-push comment) corrected to the real push check.

## 2026-10-03 (evening): spec-kit pool mode wiring gap discovered (specs/008 T6 discrepancy)

- **Finding (HIGH, behavior):** `discover_spec_kit_feature` fails in HTTP pool mode with `spec_kit_feature_not_found: feature root missing: specs` although `/workspaces/Thinking-MCP/specs` exists (16 features). Root cause (verified against the running container + source code): `registerSpecKitTools` in `servers/server-guidance/src/server.ts` (HTTP entry, ~L101-113) does NOT pass `getSessionWorkspace`; the stdio entry `src/index.ts` (L43-49) has it correctly. Consequence: `SpecKitEngineResolver.resolve()` falls back to the pool root `/workspaces` instead of the session root `/workspaces/Thinking-MCP` (`register-spec-kit-tools.ts` L138-144). specs/008 T6 is marked [x] in tasks.md but implemented only in stdio mode — T6 discrepancy.
- **Status:** tracked as SKP-1 in `remaining-work-plan.md`; implementation ran as guidance workflow session-896320f1 — IMPLEMENTED (255bfd2, feature/speckit-pool-mode-wiring): server.ts passes getSessionWorkspace (composeApplication creates the engine instance once, registry_register recomposes engine.config in place — the copied engine field is live-safe); contract tests speckit-pool-mode.test.ts (session root resolution / pool fallback / pre-fix regression / T6 outside-workspace check); T6 note in specs/008. Verification: focused 12/12, full suite 589/589, LIVE in the container: discover_spec_kit_feature → /workspaces/Thinking-MCP/specs/008-multi-workspace. Workflow cancelled on user instruction (remaining phases review/completion skipped).
- **Independent review (2026-10-03, sub-agent bd833a54, fresh context):** APPROVED, 0 unresolved CRITICAL/HIGH. Stale-closure claim verified against main.ts L128 + WorkflowEngine.ts L764 (in-place `this.config = loadConfig`); remote path untouched; T6 checks intact (tests independently reproduced by the reviewer 4/4). Residual tracked: SKP-2 (MEDIUM, test depth: direct registerSpecKitTools wiring does not cover a server.ts revert) + SKP-3 (LOW, pre-existing Windows separator in discoverArtifacts) — see remaining-work-plan.md.
- **2026-10-04 (session-8a3f5bf4):** SKP-1 + SKP-2 completed: end-to-end wiring test (8c41768, revert drill), full suite 591/591 green, LIVE pool mode proof on the newly built container (root compose), fast-forward merge into develop (develop == merge-base d44fc34), feature branch deleted. Merge safety checked only against the local develop ref (no SSH key in the shell context, no fetch) — push reveals remote drift. Remaining: SKP-3 (LOW).
- **2026-10-04 (session-1bdb6fee):** SKP-3 — impact analysis exposed discoverArtifacts as dead code (never wired since 33255fa); the tracked failure mode could not occur. Joint intention evaluation with user → decision **C-Full**: full integration into importArtifacts (traversal unified, checklists/** becomes importable, config-dir patterns functional, relativePath unified onto real paths — no snapshot migration needed) instead of deletion. Shared isInsideWorkspace helper fixes the separator bug + drift pattern. 15 new tests (tests/speckit/artifact-discovery.test.ts), suite 606/606 green. User rule noted: ASK when alternatives are unclear (followed for the C-Full scope — level-2 migration question verified beforehand instead of assumed).

## 2026-10-04: specs/016 levels 2+3 implemented (feature/016-async-transitions-progress, Guidance session session-62689b13)

- **Scope:** reference implementation in `servers/server-guidance` (insight/clear-thought adoption = follow-up). Level 2: async acceptance for `submit_*`/`complete_workflow`/`run_operation` — opt-in via `_meta.async` (per request) or `GUIDANCE_ASYNC_ACCEPTANCE=1` (server default), synchronous remains DEFAULT (FR-4/FR-10). Persisted operation registry (`state/operations/<session>.json`, key `sessionId+tool` — decision 016-idempotency-key: requestId/arg hash as key discarded, arg hash only a diagnostic fingerprint), in-flight retry idempotent (FR-2), outcome incl. gate results/failures via `get_workflow_state.asyncOperations` (FR-3). Level 3: SSE upgrade on `Accept: text/event-stream` + `_meta.progressToken`, `notifications/progress` per gate (started/succeeded/failed, monotonic, total, message; gate observer in `OperationEngine.executeRequired` — no gate semantics change), keepalives (`: keepalive`, default 15 s, `GUIDANCE_SSE_KEEP_ALIVE_MS`), FR-8: messages only gate name/status.
- **Critical design finding:** streamable HTTP ALWAYS requires both Accept types on POST (SDK 406 otherwise, register-tools line 470 webStandardStreamableHttp). Therefore the SSE switch is keyed on the progressToken opt-in, NOT on Accept alone — otherwise existing clients break (FR-9/AC4).
- **New files:** `src/workflow/transition-protocol.ts`, `src/workflow/operation-registry.ts`, `tests/contract/async-transition.test.ts`, `tests/contract/sse-progress.test.ts`, fixture `tests/workflow/fixtures/guidance-slow/` (slow gate node-sleep 1.2 s).
- **Changed:** `server.ts` (enableJsonResponse/keepAliveMs per request), `register-tools.ts` (`_meta`→TransitionContext), `ToolHandlers.ts` (wrapper/registry/getWorkflowState merge), `WorkflowEngine.ts` (TransitionHooks param on submit/completeWorkflow/retryOperations), `OperationEngine.ts` (observer param executeRequired), `main.ts` (stateDir to WorkflowTools), README (new section "Async acceptance and progress notifications").
- **Verification:** 6 new contract tests green (AC1 <1 s acceptance, AC2 idempotent retry + single-execution proof, AC3 progress/keepalive/no-secrets, sync default, FR-9 JSON); FULL suite 612/612 green (AC4, no pre-existing failures); typecheck: only the already-tracked pre-existing error (speckit-pool-mode.test.ts, commit 7884ba4).
- **detect_changes:** risk CRITICAL (breadth: 41 symbols, 63 processes — expected on an engine touch), NO partial/truncated. Evidence classification: CRITICAL covered by full regression (612/612) + default path unchanged (all legacy suites green) + additive optional parameters covered.

### Review round (independent sub-agent, session 6660c9eb) + fixes

- Independent review reported 2 HIGH / 3 MEDIUM / 3 LOW. Fixed (fix commit): F1 TOCTOU race in the idempotency core → `registry.begin()` atomic (per-session mutex, check+register in one step, `created` flag); F2 permanent in_flight latch after crash → bootId stamp + reclassification `failed/operation_interrupted` on first read after restart; F3 progress only for beforeExit → cursor observer with cumulative indices across beforeExit/beforeEnter/afterExit (monotonic); F4 non-atomic registry writes → tmp+rename; F5 foreign payload swallowed in-flight → fingerprint comparison, mismatch → `operation_in_progress` (error, no retry); F7 potential unhandled rejection → terminal `.catch`; F8 keepAliveMs env validation (`> 0`). F6 (retry_operation without ctx/hooks) left open per spec → tracked as S016-RETRY-OP.
- Tests: 7/7 contract tests (new: F5 mismatch case), full suite 613/613 green; typecheck only pre-existing (7884ba4).

## 2026-10-04: specs/016 S016-ADOPT implemented (feature/016-adopt-async-sse, Guidance session session-7e49befd)

- **Scope:** adoption of the async acceptance + SSE progress pattern (spec 016 §6 step 2) in `server-insight` and `server-clear-thought`; `server-guidance` switched behavior-identically onto the shared implementation.
- **Architecture decision (R1, review HIGH):** NO yarn-workspace package as a dependency — the insight Dockerfile runs `npm ci` in an isolated server-dir context (workspace: deps not resolvable; MCPB/Smithery likewise). Instead: `servers/shared-workflow` = CANONICAL SOURCE OF TRUTH (own tests), vendored copies per server under `src/workflow/` via `scripts/sync-shared-workflow.mjs` + hash consistency tests per server (drift guard). yarn.lock untouched (WF-3).
- **New:** `servers/shared-workflow/` (transition-protocol.ts with new `createCumulativeGateObserver` for multi-group monotonicity; operation-registry.ts with S016-N1 fix: get()/allFor() reconcile UNDER the session mutex, now async; S016-N2 fix: mutex eviction in the idle case), sync script, 12 unit/fixture tests incl. restart fixture (S016-RESTART-TEST) and multi-group monotonicity fixture (S016-N3).
- **SDK spike (T1):** repo-wide uniform SDK 1.30.1 (hoisted); `extra._meta` reaches the handler fully, `extra.sendNotification` works (InMemory spike SPIKE-PASS); `keepAliveMs` present in StreamableHTTPServerTransport. Design finding: progress notifications ONLY while the request is open — AC3 SSE is the sync path; after the acceptance response the transport discards notifications.
- **insight:** wrapper at the `registerTool()` choke point (`_meta.async` / `EMMS_ASYNC_ACCEPTANCE=1`, sync DEFAULT); wrapped set `experience_seed_lessons` + `experience_finalize`; `workflow_status` merges `asyncOperations` (also in error envelopes, only when ops exist); SSE per request transport in `server.ts` (shares storage, keyed on progressToken); fixture hook `EMMS_ASYNC_TEST_MIN_DURATION_MS`; README section. 7/7 contract tests green.
- **clear-thought:** wrapper at the central `tool.update()` callback in `index.ts` (`_meta.async` / `CLEAR_THOUGHT_ASYNC_ACCEPTANCE=1`); wrapped set `session_save` + `session_load` (infrastructure adoption, honestly documented); `session_info` merges `asyncOperations`; SSE via a transient `createSessionMcpServer` that SHARES the SessionState; acceptance responses with `structuredContent` (SDK requirement with outputSchema). 7/7 contract tests green; full suite 187/187.
- **Verification:** guidance 615/615 (613 + 2 hash tests, NULL test modifications), insight: all files green that were green at baseline (AC4), clear-thought 187/187; typecheck clean (guidance only pre-existing S016-TYPECHECK).
- **Pre-existing env finding (newly tracked):** better-sqlite3 native crash on worker exit (Statement::~Statement, Node 24/WSL) in insight `tests/contracts/evaluation.test.ts` + `mcp-surface.test.ts` (+ flaky `seed-lessons` under full load) — NOT caused by this scope (branch unchanged vs. develop reproduces); single run mcp-surface crashes also singleFork.
- **Final review (fresh sub-agent 5eb3da64):** 0 open HIGH/CRITICAL. R1 (MEDIUM) FR-3 scope gap in the insight SSE path fixed (AsyncLocalStorage session scope + regression test SSE-async → JSON-poll); R2/R4/R5 accepted as documented, R3 tracked (S016-FINAL-REVIEW in the remaining-work-plan).

## 2026-10-04: Guidance schema-drift cleanup (feature/schema-drift-cleanup, session-d5a440cb)

- Removed the `default` workspace entry from the pool-root `D:\repos\.guidance\guidance.json`; deleted the legacy instance files (workflow.json, responses.json, operations.json, policies.json, downstream-servers.json, schemas/, state/) — pool root is now registry-only.
- Container recreated from the ROOT compose context; `/health` lists only `niyama` + `thinking-mcp`; fail-closed probe: `start_workflow` with workspace `default` → `workspace_not_registered`.
- Root cause of the original `summary`-required submission error: the legacy pool-root instance config's `implement.schema.json` governed `default`-workspace sessions; repo schema only requires `implementedTasks`.
- README (server-guidance): documented no-implicit-fallback, registry-only-instance rule, boot-only registry + restart-kills-sessions.

- Review follow-up (independent pass): (1) the first registry rewrite still carried file references to the deleted process files — `loadConfig` fails at boot on a missing referenced file, so the refs were removed (true registry-only now); (2) `niyama` had disappeared from the registry through an external edit and was restored; (3) README restart/hot-reload wording corrected against source (registry boot-loaded for new sessions; `registry_register` is the runtime path; workspace sessions persist on disk and rebind after restart).
- Final review re-blessed (commit 5bfb0e0): 0 open HIGH/CRITICAL; remaining F1 (low, pre-existing spec-literal gap) tracked in remaining-work-plan.md.

## 2026-10-04 — Fix: registry-only start blocked for alphabetically-first workspace (feature/fix-registry-only-default-root-guard, commit 5d1437e)
- Root cause: `WorkspaceRegistry.default` falls back to the first alphabetical registered entry, so `defaultRoot` was `/workspaces/Niyama`; the `engineForWorkspace` pool-root guard threw `workspace_process_config_missing` for exactly that workspace. Empirically confirmed: `niyama` failed, `thinking-mcp` started.
- Fix: engineForWorkspace composes a child engine for a defaultRoot that carries a full `.guidance/guidance.json`; explicit fail-closed (`workspace_process_config_missing`) for registry-only child configs; `probeWorkspaceRoutes` no longer skips a defaultRoot that is a registered workspace (try/catch around routing).
- Suite 616/616 green (incl. new regression test), container rebuilt, `start_workflow workspace:"niyama"` verified live, gitnexus reindexed (--no-stats).

## 2026-10-04 — Fix: stale clear-thought MCP session stranded the client (fix/stale-session-404-recovery, commit 7949329)
- Symptom: Niyama agent got "MCP session no longer valid (HTTP 400)" on clear-thought calls; container healthy, fresh sessions fine.
- Root cause: CB-3 early-reject answered 400 for POSTs carrying a session id the server no longer knows (1h idle TTL / MAX_SESSIONS eviction). The official MCP SDK client re-initializes ONLY on 404 — 400 stranded it permanently.
- Fix: unknown session id WITH header -> 404/-32001 (client auto-recovers); no header -> 400 unchanged (CB-3 orphan protection intact). Regression test in tests/http-transport.test.ts; suite 188/188 green; container redeployed, 404 verified live.

## 2026-10-04 — Stale-session recovery extended to insight + guidance (commit 767a940, branch fix/stale-session-404-recovery)
- server-insight: same /mcp 404 gate as clear-thought (unknown session id -> 404/-32001; missing header stays 400). Live-verified on :3002.
- server-guidance: HTTP transport is stateless (no fix needed there); downstream ClientManager now detects stale downstream sessions (StreamableHTTPError .code===404 — the status is NOT in its message — or -32001 body) and replays ONCE on a fresh connection even without an explicit reconnect policy (side-effect-safe: the request never reached the tool). HD-3 test now asserts recovery. Guidance + insight suites green (616/616; insight 121/133 with pre-existing better-sqlite3 worker-teardown crashes — baseline-verified same loss without the change).
- Containers rebuilt: clear-thought/insight/guidance all healthy; /health checks green.

## 2026-10-04 — Feature: pool-mode downstream status visibility (feature/downstream-status-visibility, 66b0851+998bfdc, session-7de6e13f)
- get_downstream_status now: sessionId-routed live status + instance-level declared-state per registered workspace (read-only, redacted declaredError, disabled servers omitted); monolith wire contract preserved (flat array).
- Independent review verdict: approve, 0 HIGH/CRITICAL. Fixed: F1 monolith envelope compat, F3 routed-session test, F4 redaction, F7 README/test disabled-filter. Tracked below: F2, F5, F6.
- Guidance suite 78/621 green; typecheck clean (except pre-existing F6).

## 2026-10-05 — Feature: package-manager-aware config assistant (feature/pm-aware-config-assistant, session-b6820e9b)
- New optional wizard answer packageManager (npm|pnpm|yarn, default npm; agent-side lockfile detection encoded in help text); generated gates + deps ops per PM; unknown values fail closed; npm output preserved byte-identically (template sync pins).
- Guidance suite 79/628 green; independent review approved (0 HIGH/CRITICAL); review fixes: adopt-mode re-throw of answer-validation errors, empty-string fallback consistency, normalization tests.
- Tracked: F-4-style gate-description wording drift vs scaffold/example (cosmetic, pre-existing pattern); remote/divergence items from previous session remain open.

## 2026-10-05 — specs/017 spec-kit mode (feature/017-spec-kit-mode)
- Implemented FR-1..FR-10 on feature/017-spec-kit-mode (see progress.md entry); guidance suite 667/668 green (baseline: speckit-pool-mode.test.ts typecheck, 7884ba4).
- Open follow-ups recorded in remaining-work-plan.md (include-cycle spec amendment note; FR-10 helper wiring).
- Pending: commits, independent review, GitNexus reindex, merge.
- 2026-10-07: session-c4ddeb4d in complete phase; all HIGH/CRITICAL findings fixed (9be7c2e); remaining-work-plan carries 3 tracked follow-ups (include-cycle spec note, FR-10 wiring, R-B5 accepted lows).
- 2026-10-07: chain session-3a03faf2 (head) resolved the tracked baseline typecheck (01071e9); Final#1/Final#2 owned by chain successors. Final review 11f1fef2: 0 HIGH/CRITICAL.
- 2026-10-07: chain successor 1 (Final#1) complete — degradation marker implemented + reviewed (0 HIGH/CRITICAL, final review 96ebe53c); successor 2 (Final#2) next in chain feature/017-final-review-mediums.

## 2026-10-08: CHAIN STEP 1 — wsl-writer formalization + GN-5/D3/D4 (session-83693944, feature/gn-chain-step1)

- **Implemented:** (1) pool-wide identity unification on /mnt/d (Niyama + copilot via WSL --force + registry rewrite; all checks/queries green); (2) GN-5 port hardening: 127.0.0.1 binding + compose DNS (pre-probe 200), egress + 3 pool workspace configs switched; (3) GN-D4: refGn.state unknown throw, reindexCommand trim, parse/validate split; (4) GN-D3: guidance.json blob scan + AC-1b ops drift guard. Suite 696/696, tsc clean.
- **Chain:** head green (session-928fa08c); step 2 (phase-2 tri-state gates + hybrid probe) and step 3 (docs consolidation) follow automatically.

## 2026-10-08: WF-1 simplified — clear-thought back on the default route

User decision: clear-thought tools, like ALL other tools, are initially called DIRECTLY (editor MCP); call_downstream/container-route/curl only as a fallback, once per route. The earlier WF-1 special rule (primary route + chain) had in practice led agents to use call_downstream as the standard. Backup AGENTS.md.bak updated; contradiction check (route 3) without conflicts. Also applies to the running chain (step 2/3).

## 2026-10-08: WF-1 fully removed (user decision)

Instead of the simplification, the dedicated clear-thought rule was COMPLETELY dropped — clear-thought now follows default tool routing like any MCP server. The valuable knowledge (404/-32001 = evicted session, reconnect heals, do not repeat the route) was preserved as a GENERIC MCP lesson in lessonsLearned.md (applies equally to clear-thought, gitnexus and all HTTP MCP servers). Backup AGENTS.md.bak exists. Handover prompt corrected accordingly.

## 2026-10-08: GN-D6 tracked — API-based reindexing (verified), agent retreat from the checkout

- **GN-D6 (remaining-work-plan):** POST /api/analyze {"path":"/mnt/d/repos/<repo>"} + GET /api/analyze/<jobId> (poll until complete) — verified live on 2026-10-08 (job 0→100 %, identity /mnt/d preserved). Recommended replacement of the wsl.exe reindexCommand; the switch belongs to the running chain (step 3 or the next trigger).
- **Parallel-work observation:** WorkflowEngine.ts changed at 19:06 through another session (presumably chain step 2 active with the handover prompt). This agent (sessions head+step1+docs) retreats from the checkout — the last write action is this memory-bank entry (targeted commit of only the two memory-bank files).
