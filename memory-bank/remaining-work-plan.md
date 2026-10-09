# Remaining Work Plan — Thinking-MCP

> Tracked follow-ups. Every unresolved review finding (any severity) must be
> persisted here AND in `activeContext.md` before a scope is closed
> (AGENTS.md → Findings Lifecycle Rule).
>
> Entry format:
> `[ID] severity | finding | trigger point | status (action required / accepted with rationale)`
>
> **Batch status 2026-09-29:** TMPL-1 ✅, TMPL-2 ✅ (glibc base, commit
> 8134a46), TMPL-3 ✅ (divergence fingerprint, 81faece+4da7f44), REV-2 ✅
> (03952b3) — all four scopes of the evening of 2026-09-29 completed and on
> develop; open: CHAIN-1 (Guidance server defect), TMPL-4 (accepted),
> REV-1-HISTORIE/REV-3 (rule/behavior), CHN-/R series (accepted),
> NIY-CFG-3/NIY-side (Niyama owner).

## Tracked Follow-ups

- [GN-D6] MEDIUM (2026-10-08, live-verified, recommendation) — **RESOLVED (2026-10-09, Chain Successor 1, feature/gn-d6-api-reindex)** | The canonical reindex now runs via `scripts/reindex-via-api.sh` (submit+poll against the gitnexus HTTP API; reindexCommand/AGENTS.md/responses.json in sync, REMEDY renders automatically, WSL-CLI documented as fallback + --force healing). API contract pinned via container source: no no-stats — the script restores the stats line + mtime after job completion (otherwise index-freshness fails). Live verified: job 0→100 %, freshness gate green, identity /mnt/d preserved. | resolved

- [DEPS-OPS-1] RESOLVED (2026-10-09, chain successor 2 session-c686501b, feature/chfix-11-r1-docs-f2) | Root cause: deployed .guidance/operations.json predated PM-aware generation (npm-only deps-install/deps-reinstall). Fix (user choice b, decision DEC-DEPSOPS-1): workspace operations.json now carries the yarn profile — deps-install = corepack yarn install --immutable → corepack yarn install fallback (capabilities yarn-install-immutable / yarn-install-fallback); deps-reinstall spawns corepack yarn install. corepack wrapper verified necessary AND working in the guidance container (bare yarn shim = 1.22.22 without --immutable; corepack yarn = 4.6.0 from packageManager). npm is never invoked for installs at this root (WF-3); EACCES npm-fallback path eliminated; pre-flight inherits the config. README dependency-bootstrap docs generalized (per-workspace PM parameterization). | Trigger: none — resolved with evidence. Container-image follow-up (optional): make corepack-enable/yarn4 the default shim so plain `yarn` resolves 4+ (observed 1.22.22).

- [CHFIX-11-R1] PARTIALLY RESOLVED (2026-10-09; F-2 + F-3 resolved in successor session-fca4ca8f, feature/chfix-11-r1-docs-f2) | (F-2) FIXED: ClientManager.assertNotDrifted removed (method + FR-042 unit test) after dual evidence — GitNexus impact upstream 0 callers (UNKNOWN risk note) + repo-wide grep (def+test only); drift enforcement remains in the invoker closure (capability-repin.test.ts covers it); focused suites 23/23 green, tsc clean. (F-3) DOCUMENTED: design decision recorded in servers/server-guidance/README.md ("Pin persistence and co-running engines") — supported wirings (pool = one boot composition per stateDir; remote = isolated per-session stateDir), merge-on-save rationale, resurrection hazard (in-process remove vs co-running engine's stale in-memory set), fail-closed direction, CONDITIONAL self-heal (only when a call routes through the stale engine), and the blocking re-assessment requirement for any future multi-engine-per-stateDir wiring (per-engine ownership markers or single-writer lock instead of blind merge-on-save). (F-4) UNCHANGED accepted observation: drift audit appends one event per failed call — retry loops can spam capability-pins.jsonl (bounded by agent behavior, acceptable). | Trigger: any multi-engine-per-stateDir design (F-3 decision — re-assess persistence contract BEFORE implementation); F-4 re-check if audit volume becomes a problem. | F-2/F-3 resolved with evidence; F-4 accepted with rationale.

- [GN-D6-R1] LOW (2026-10-09, Final Review GN-D6 F2/F4/F8 — accepted) | (F2) `field_string`/`field_number` parsing in the reindex script is greedy (last match) — wrong only with nested duplicate keys, not the pinned API contract. (F4) The mtime rollback after the job could conceal a competing foreign change to AGENTS.md/CLAUDE.md within the job window from the freshness gate (narrow race; repo policy forbids parallel writers anyway). (F8) The server job dedup assumption stands alone (no client-side lock); verified author-side via container source + live run, not re-verified in the review. | Trigger: next change to scripts/reindex-via-api.sh or the first suspected double-submit. | Accepted with rationale.
- [GN-D5-R1] LOW (2026-10-09, Final Review GN-D5 F-1/F-2/F-3 — accepted) | (F-1) Host extraction in deriveAdoptGn classifies exotic URLs (IPv6-[::1], userinfo, uppercase, non-http) as compose-dns — deterministically wrong, no silent passthrough; generator URLs (3 literal hosts) correct. (F-2) topology is not persisted in guidance.json (only state/mode/reindexCommand) — guided setup re-runs must re-answer the topology; functionally inconsequential. (F-3) No E2E test of the adopt chaining (generateFiles adopt + compose-DNS ref URL -> downstream-servers.json); pinned at the deriveAdoptGn level, the chaining is 3 lines of straight-line code. | Trigger: next generator/adopt change to the URL derivation; F-2 additionally on a future guidance.json round-trip requirement. | Accepted with rationale.

- [GN-D6] MEDIUM (2026-10-08, live-verified, recommendation) | **Switch the reindex to the gitnexus HTTP API** instead of the wsl.exe CLI: `POST /api/analyze` with `{"path":"/mnt/d/repos/<repo>"}` returns a jobId, `GET /api/analyze/<jobId>` polls progress/phase until "complete" — real job semantics (submit→poll, read-only polling, no timeout risk, no nvm). Fully verified on 2026-10-08: the job ran to completion (0→100 %), meta.repoPath stayed `/mnt/d/repos/thinking-mcp` (identity-faithful, coexistent with the WSL-CLI world). Migration: gitnexus.reindexCommand in guidance.json to the curl form (submit + poll note), synchronize the AGENTS.md rule + REMEDY text; the endpoint exists since 1.6.12 (api.js L1392ff, `requireTrustedOrigin` lets curl requests without an Origin through; server loopback-bound). | Trigger: ongoing chain step 3 (documentation consolidation) or the next reindex adjustment. | Action required at trigger.

- [GN-D5] MEDIUM (2026-10-08, Final Review Chain Step 1 F-1/F-2) — **RESOLVED (2026-10-09, Chain Successor 2, feature/gn-d5-url-topology)** | URL topology (compose-dns|host-gateway) decoupled from the writer mode as its own optional question `gitnexusTopology` (default mode-derived, fail-closed on unknown values); gitnexusUrl/buildPolicies keyed on topology; Adopt derives from the live reference downstream URL (mixed shape regenerable); F-2 GITNEXUS_URL token rendering regression-tested. Suite 727/727, tsc clean. | resolved

- [GN-D4] MEDIUM (2026-10-08, Final Review Decouple-Session GN-FR-2/6/7) — **RESOLVED (2026-10-08, Chain Step 1, feature/gn-chain-step1)** | Adopt asymmetries closed: unknown non-empty refGn.state throws configuration_invalid; refGn.reindexCommand is trimmed (whitespace-only falls through the cross-checks); parse/validate split with validateGnSetup as the single checking point AFTER the adopt derivation — leftover responses can no longer be misdirected in adopt mode. Unit tests for all paths; suite 696/696. | resolved

- [GN-D3] LOW (2026-10-08, Review F-6 of the decouple session) — **RESOLVED (2026-10-08, Chain Step 1)** | The alone test now also scans the complete guidance.json blob; a new AC-1b ops drift guard pins every generator op against the template (carry-ops final-review-gate/docs-drift checked for existence). | resolved

- [GN-D1] MEDIUM (new, 2026-10-08, Decouple-Session session-791af4dc) — **RESOLVED (2026-10-08, Chain Step 2, feature/gn-chain-step2, commits a75a3a6+44571ae+fix commits)** | Phase 2 engine scope implemented: three-valued gate states — mcpTool gates on state=optional servers report `skipped(capability-absent)` with a loud warning on connection-level transport errors (only NON-required; required fail-closed unchanged, regression-pinned); reachable-but-failing servers remain `failed` + `optional_capability_broken` warning; timeouts/expired sessions count as reachable (review F2). Hybrid probe: declared state vs. live availability at session start AND chain-successor creation, fire-and-forget, timeout-bounded (max(5s, configured handshake+1s)), the off-case pings only http leftovers (no stdio spawn), audit event `capability_state_deviation` exactly-once per session+kind (probe and gate share the guard; per-process restart duplicates documented). Minimal-additive config read path (config.main.gitnexus.state), GateEvent.phase/OperationStatus/OperationOutcome additively extended with `skipped`, vendored copies synchronized. Suite 721/721, tsc clean; Independent Review (1b74ed1e) + re-bless + Final Review (f0532eee): 0 open HIGH/CRITICAL. | resolved

- [GND1-DOC-1] MEDIUM (2026-10-08, Chain Step 2 session observation) — **RESOLVED (2026-10-08, Chain Step 3, feature/gn-chain-step2)** | Topology documentation drift unified on the wsl-writer world: AGENTS.md topology bullet (WSL CLI = single index writer, container = read-only dual-mount reader, container analyze forbidden + --force healing, both gitnexus.mode documented neutrally, backup AGENTS.md.bak updated + Clear-Thought contradiction check without conflicts); the .guidance/responses.json complete instruction now carries the wsl.exe reindex (surgical sentence replace, rebind path live verified — the session survived the config change); docker-compose.gitnexus.yml header brought to reader/writer roles by mode; README deployment block + working-sample table switched to wsl-writer (the generic container-mode example remains). Consistency grep: no unwanted stale claims. | resolved

- [CHFIX-9] HIGH (2026-10-08, live validated, session-78776317 loss) — **RESOLVED with evidence (2026-10-09, Chain Successor 4, feature/chfix-9-session-persistence; user sign-off A+B)** | Premise refuted on both levels: SessionRepository is purely file-backed (no in-memory map), a fresh engine over the same stateDir loads active sessions (regression test 1), and even the pool topology (registry-only instance + registered workspace + restart simulation) re-resolves sessions from disk (regression test 2). The live loss originates from a layer above (MCP transport session 404/-32001 or boot/mount timing of the instance composition) — not reproducible in-process. Completion path A: README recovery recipe made precise (what survives: sessions/chain/phases file-backed + rebind; what does not: MCP transport session, in-flight ops → unknown/retry_operation; session_not_found despite an existing file = composition problem, never delete files). Path B (live restart experiment after merge + rebuild) commissioned. | resolved with evidence; live experiment pending

- [CHFIX-12] MEDIUM (2026-10-09, Final Review CHFIX-9 F-1) — **RESOLVED (2026-10-09, chain successor session-b5a4c381, feature/chfix-12-session-messages)** | The four session_not_found sites now state their TRUE per-site conditions (final review caught an initial mechanical uniform rewrite): SessionRepository.load + remote resolve = file-not-found (composition-check-first guidance, README reference); assertSessionBinding = condition-neutral (binding/auth failure or gone — anti existence-oracle); touch = TTL expiry (session legitimately gone, start new workflow). Error code, leading token and recoverability unchanged; no test pinned the old prose; suite green, tsc clean. | resolved

- [CHFIX-11] MEDIUM (2026-10-09, split out of CHFIX-9 C-T4) — **RESOLVED (2026-10-09, chain successor session-26f47d05, feature/chfix-11-hybrid-repin; user decision: hybrid)** | Hybrid in-process re-pin implemented: drift (schema-drift AND previously unclassified tool-missing) fails closed, audits capability_pin_drift (engine-level file, pinned+live hashes), error message names the remedy; new confirm-gated MCP tool release_capability_pins removes pins in-process (saveCapabilityPins remove-semantics keeps co-running engines' pins), audits capability_pins_reset, next successful call re-pins automatically — no server restart. Tool-count pin updated (40→41), docs-drift green (37 tools), suite 734/734, tsc clean. | resolved

- [GND1-R2] MEDIUM/LOW (2026-10-09, Final Review session-0046f81b F-1/F-2 — accepted) | (F-1, MEDIUM, pre-existing, newly observed) The desync guard checks submission PRESENCE, not freshness: in re-entered phases (verification_failed loops, e.g. verify→review_implementation) the round-1 submission remains — a failed resubmit + a green retry advance on stale content. The guard shrinks the free-advance class, it does not close it; add the documenting test when tracking it (pin round-2 advance without a round-2 submission). (F-2, LOW, pre-existing) The complete-exemption finalizes even without a complete_workflow call (phase complete reachable via the verify submit; retry with green completion ops + pending===undefined finalizes without a report) — in practice presumably blocked by store-completion-insight context dependence (unverified). | Trigger: next touch of retryOperations/submissions semantics; F-2 additionally on completion-finalize anomalies. | Accepted with rationale.

- [GND1-R1] LOW (2026-10-09, Independent Implementation Review b97d208 F1/F2/F3 — accepted) | (F1, new) The hold path of the desync guard is not machine-readably signaled in the response (accepted:true + phase unchanged, reason only in the audit event transitionHeld) — ergonomics, no state damage. (F2, pre-existing) failed submits append submission_received even though the submission is never persisted (persistence happens only in the success update) — misleading audit. (F3, pre-existing) the retry advance runs without the target phase's beforeEnter/afterEnter — a transition blocked by beforeEnter could be jumped over via retry. | Trigger: next touch of retryOperations/response shapes/hook semantics. | Accepted with rationale.

- [GND1-TEST-1] LOW (2026-10-08, Final Review Finding 1, remainder) — **RESOLVED (2026-10-09, Chain Successor 3, feature/gnd1-probe-residuals)** | Dedicated chain-successor probe test in capability-skip-semantics.test.ts: the successor gets exactly one probe event (bounded poll), exactly-once across creation + manual re-probe, head event independent. | resolved

- [GND1-RESIDUALS] INFO (2026-10-08, Reviews 1b74ed1e/f0532eee, all accepted) — **RE-CONFIRMED (2026-10-09, Chain Successor 3; all 7 unchanged accepted, decision table in activeContext)** (a) transport errors WITHOUT flags classify as capability-absent; (b) stdio spawn of required servers at session start; (c) deviation duplicate per process lifetime after restart; (d) composite forces required; (e) grants on skip; (f) sticky unreachable; (g) REAL ping ordering. Trigger unchanged: (d) at the first optional composite gate; (f)/(g) on flakiness/false-alarm reports. | Accepted with rationale.

- [GND1-DESYNC-1] — **RESOLVED at creation (2026-10-09, Chain Successor 3)** retryOperations advanced phases without a recorded submission (free advance with an empty beforeExit; live desync 2x on 2026-10-09). Guard + regression test in chain.test.ts. | resolved

- [GN-D2] LOW (2026-10-08) | Config assistant: adopt mode derives the GitNexus mode only from refGuidance.gitnexus, NOT from refOpsMap heuristics (e.g. op descriptions indicating compose). Builtin template → local-cli. | Trigger: first mounted adopt of a container-deployment reference without a gitnexus block. | Accepted observation.

- [GN-1] HIGH (2026-10-08, evidence: docker inspect + `/data/gitnexus/registry.json` + guidance audit session-bbbf628c/bdb24391) — **RESOLVED (2026-10-08, feature/gn-gitnexus-compose-integration)** | Two diverging GitNexus registries: the old standalone gitnexus-server container served a stale thinking-mcp index (2026-10-01), the WSL-CLI index was current, the gates blind to this. Fix: compose-managed gitnexus-server with a full `/workspaces` mount + in-repo storage; thinking-mcp freshly indexed in the container (10,380 nodes / 480 flows), the MCP check returns real graph answers. Both gates now check the same index stock.

- [GN-2] HIGH (2026-10-08) — **RESOLVED (2026-10-08, feature/gn-gitnexus-compose-integration)** | Pool onboarding of new repos was invisible to the gitnexus-server container (docker cp to /tmp as a workaround). Fix: all three pool repos (thinking-mcp, copilot-repo-template, Niyama) registered via `docker compose exec gitnexus analyze` with in-repo storage path; MCP check green for all three; `--force` bypasses the foreign-state lock on WSL-preloaded .gitnexus directories. Canonical reindex command documented in AGENTS.md + REMEDY line.

- [GN-3] MEDIUM (2026-10-08) — **RESOLVED (2026-10-08)** | The dead `spawn gitnexus` fallback step in the `repository-analysis` composite was removed: the operation is now a direct mcpTool (check) in `.guidance/operations.json` AND synchronized in the generator (ConfigAssistant.ts) + template (examples/default-guidance) — template/generator sync pin green.

- [GN-7] LOW (2026-10-08, Review F4, feature/gn-gitnexus-compose-integration) | The REMEDY derivation `basename(resolve(repoRoot))` in `check-index-freshness.mjs` yields, for a repoRoot that is a worktree INSIDE a pool repo (`/workspaces/<repo>/worktrees/wt1`), a `-w /workspaces/wt1` that does not exist in the container. The failure remains loud and thus agent-recoverable; pool-root workspaces (the normal case) correct. Fix idea: worktree detection (.git is a file) and derivation of the parent pool repo. | Trigger: first guidance session operation in a nested worktree. | Action required at trigger.

- [GN-8] LOW (2026-10-08, Review F6) | For `repository-analysis` there is no dedicated generator↔template drift guard (the AC-1 guard only covers responses.json byte-identical; ops lockstep currently verified manually). | Trigger: next change to buildOperations for repository-analysis. | Accepted observation with action obligation at trigger.

- [GN-5] LOW (new, 2026-10-08) — **RESOLVED (2026-10-08, Chain Step 1)** | gitnexus-server now `127.0.0.1:4747:4747` (loopback-only); the guidance container reaches it via compose DNS `http://gitnexus-server:4747` (same project network via the -f chain; DNS pre-probe 200 BEFORE the rework). Egress allowlist (`gitnexus-server:4747`) + all pool workspace configs (thinking-mcp, Niyama, copilot-repo-template: downstream-servers + policies) switched; host access (editor) remains via 127.0.0.1. Documented: the -f chain is mandatory as long as the overlay is active (the DNS name exists only with both files). | resolved

- [GN-6] LOW (new, 2026-10-08) | `lastCommit` in registry/meta.json stays "" when git in the container cannot read the repo; fixed via a `safe.directory` command wrapper in the compose service (glob '*' in the disposable analyze container). Populate confirms itself only at the NEXT analyze (the transition analyze ran before the fix). The commit coverage signal of check-index-freshness is inactive until then — the mtime signal applies. | Trigger: next reindex; verification that lastCommit == HEAD. | Action required at trigger.

- [GN-4] LOW (2026-10-08) — **RESOLVED (2026-10-08, rule edit with backup `AGENTS.md.bak`, Clear-Thought contradiction check: no contradictions; 2026-10-08 the topology section brought up to the one-world architecture)** | The AGENTS.md topology wording was misleading. Architecture decision A+D implemented.

- [CHFIX-9] HIGH (2026-10-08, live validated, session-78776317 loss) | Guidance sessions are workflow-run-scoped and do NOT survive a guidance server restart (error: "sessions are workflow-run-scoped and do not survive a server restart"), even though the session JSONs persist on disk. Two consequences: (1) The CHFIX-3 recovery recipe applies ONLY to agent restarts — on a guidance server restart the chain/session is operationally lost (the disk file is archive only); the README section must make that precise. (2) Capability pin resets (downstream_capability_changed after infra events like reindex+GitNexus restart) currently require a file edit + guidance restart = session loss mid-completion. Fix options: (a) re-load sessions from disk at boot (engine-side), (b) in-process re-pin (admin op or an automatic re-pin prompt on detected drift with a deliberate infra event), (c) at minimum a documentation warning in the recovery recipe. **Trigger:** EVERY future guidance container restart with running sessions; at the latest before the first long-term chain run. Action required.

- [CHFIX-10] LOW (2026-10-08) — **RESOLVED (2026-10-09, chain successor session-a4a78bf2)** | All 4 lessons verified retrievable in the EMMS store via experience_search (scope thinking-mcp-lessons): gate-remedy-via-script-stderr → exp_7df8afc9-074, per-test-timeout-over-global-raise → exp_a17de2ca-d59, recovery-branch-before-state-read → exp_54d37069-059, capability-pin-reset-requires-server-restart → exp_c4016589-37f. Artifact .guidance/state/pending-lessons-chfix235.json deleted after positive verification (user-approved via chain order). | resolved

- [CHFIX-6] MEDIUM (2026-10-08, independent final review F-1, session-78776317) — **RESOLVED (2026-10-08, feature/gn-gitnexus-compose-integration)** | The REMEDY line in `check-index-freshness.mjs` is now repo-specific (workdir `-w /workspaces/<basename-of-repoRoot>`), a regression test covers differing repoRoots (index-freshness-remedy.test.ts, 4 tests green).

- [CHFIX-7] LOW (2026-10-08, final review F-2, pre-existing) — **RESOLVED (2026-10-08, together with the GN-4 rule edit)** | AGENTS.md contained TWO diverging reindex commands (mixed-case vs. lowercase). The remaining mixed-case bullet was unified to lowercase `/mnt/d/repos/thinking-mcp` as part of the GN-4 topology clarification; backup `AGENTS.md.bak` updated.

- [CHFIX-8] LOW (2026-10-08, final review F-3) | README recovery step 1 is imprecise for an `activating` successor: `get_workflow_state` throws fail-closed `chain_activation_incomplete` for activating sessions (points directly to retry_operation), so it shows no status. Recovery still works; sharpen the wording (activating → retry_operation directly; status readable via the sessions-dir JSON). **Trigger:** next README change to the chain section. Action required at trigger.

- [CHFIX-1] MEDIUM (2026-10-08, Form-B chain fix, feature/form-b-chain-fix) | Document the SC-011 deviation: `import_spec_kit_artifacts` now maps checked checkboxes to `status:"completed"` (revokes specs/017 FR-066/SC-011 "checkbox alone never completes"). Code comment + README + adapter test document the deviation; the specs/017 spec itself (specs/017-spec-kit-mode/) has NOT yet been updated. **Trigger:** next change to specs/017 or its review. Action required at trigger.

- [CHFIX-2] MEDIUM (2026-10-08) — **RESOLVED (2026-10-08, session-78776317, feature/form-b-chain-fix)** | Index freshness gate: instead of a server-side reindex (impossible — no gitnexus binary in the container, KA-4 foreign-storage trap) the gate now fails loudly with an agent-suitable REMEDY line (the exact wsl.exe reindex command) in the stderr of `check-index-freshness.mjs` → lands VERBATIM via OperationEngine in exposedOpResult.errors[0].message; AGENTS.md rule added (retry instead of session restart). Regression test: tests/workflow/index-freshness-remedy.test.ts (3 tests). Residual: executing the REMEDY remains agent discipline (worst case = a loud failure as before).

- [CHFIX-3] LOW (2026-10-08) — **RESOLVED (2026-10-08, session-78776317)** | Chain recovery recipe documented: README section "Recovering a chain after agent/context death" (session discovery via nextSessionId/.guidance/state/sessions/, activating→retry_operation, active→phase loop, NO head restart, chainSpec.chainedTaskIds as the progress carrier) + pointer in AGENTS.md (rule-update protocol, backup updated). A dedicated chain_status tool deliberately remains out of scope.

- [CHFIX-4] LOW (2026-10-08) | Phase boundaries in Form B (active context F1 from 018, 2026-10-07): the chain hands tasks across phases (after T018 → T019+). Defused with the checkbox mapping (checked tasks are skipped), but a `taskFilter` by phase/section does not exist. **Trigger:** if specs/018 phases are to be separated with gate reviews again. Accepted observation until then.

- [CHFIX-5] LOW (2026-10-08, environmental) — **RESOLVED (2026-10-08, session-78776317)** | engine.test.ts FR-004: explicit per-test timeout 60,000 ms (instead of the 30s default); full suite 683/683 green incl. FR-004 under load (previously 25s isolated / 30s limit). The global testTimeout deliberately NOT raised (the hang signal for ~680 other tests stays sharp).

- [GBEA-F016] MEDIUM (2026-10-07, external review v0.4.0, findings doc `SDD/guidance-beads-adapter-review-findings-v0.4.0.md`) | Independently reconcilable execution partitions for the Beads adapter (50k–100k+ work items, partition-local checkpoints, partition-aware readiness, parallel reconciliation) deliberately NOT adopted in spec v0.5.0 — normative scalability targets fixed instead (GBEA §21.2: 100k items, full recon < 30 min, incremental < 5 min, readiness p95 < 2 s). **Trigger:** production evidence that §21.2 targets are missed, or a Guidance deployment planning single executions beyond ~100k work items. Constraint on any future design: MUST preserve per-execution total event order (§18.1) and suspension scopes (§16.4). Action required at trigger; until then accepted with rationale (partitioning conflicts with current ordering/suspension model).

- [KA-4] LOW (2026-10-02) — **RESOLVED (2026-10-02, Option 1 + 4)** | `gitnexus analyze` aborted with storage status `foreign` — root cause: case mismatch, storage registered as `/mnt/d/repos/thinking-mcp` (lowercase), the shell cwd was `/mnt/d/repos/Thinking-MCP`. Fix: reindex with an exactly lowercase cwd — successful (8,988 nodes / 21,534 edges, 177 s). detect-changes: "No changes detected"; the `foreign` warning on read-only checks is cosmetic (the CLI canonicalizes the storage path anyway). Rule documented in AGENTS.md (backup `AGENTS.md.bak`): from now on run every reindex with `cd /mnt/d/repos/thinking-mcp`.

- [KA-1] LOW (2026-10-02, Review feature/mcp-keep-alive-timeout, APPROVED 0 HIGH/CRIT) | The server-stochasticthinking SIGTERM/SIGINT handlers lack a `setTimeout(process.exit, 5000).unref()` fallback (asymmetry vs. clear-thought/insight). Empirically harmless: Node ≥19 `server.close()` closes idle keep-alive sockets itself (repro: 1 ms). **Trigger:** next change to the shutdown path of server-stochasticthinking. Accepted observation.

- [KA-2] LOW (2026-10-02, Review feature/mcp-keep-alive-timeout) | `Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65000` swallows deliberate `0` values (""/"0" → fallback 65000). No valid use case for a server; chosen deliberately. **Trigger:** if a deliberate opt-out (`KEEP_ALIVE_TIMEOUT_MS=0`) is needed → explicit `!== undefined` handling. Accepted with rationale.

- [KA-3] LOW (2026-10-02, ops) — **RESOLVED (2026-10-02)** | Container rebuilt + restarted; live verification: port 3000 (clear-thought), 3002 (insight), 3003 (guidance) all `Keep-Alive: timeout=65` ✓. Port 3001 (stochastic) not deployed — **the server is deprecated**, no rebuild/re-deploy needed (the fix stays in the source in case of reactivation).

- [CT-ARGS-2] INFO (2026-10-02, re-review affa7f0, APPROVED) — two non-blocking observations from the independent re-review: (1) `callDownstream` checks `outcome.structuredContent` by truthiness instead of `!== undefined/null` (structured content `0`/`""`/`false` would be discarded — always an object per the MCP protocol, practically irrelevant); (2) no dedicated cancel_workflow-during-callDownstream test (the code path mirrors runOperation). **Trigger:** next change to WorkflowEngine.callDownstream. Accepted observation.

- [CT-ARGS-1] MEDIUM (2026-10-02) — **RESOLVED (feature/ct-args-passthrough, 2026-10-02)** | `call_downstream` passthrough + `run_operation` arguments parameter implemented: (1) `WorkflowEngine.callDownstream(sessionId, serverId, toolName, args)` — session-routed, same single-flight/workspace lock as runOperation, runs through the shared `agentInvoker` closure (WC-1 allowlist, WC-1-B wildcard rejection, FR-053 egress, capability pin, container-route fallback read_only), GDS-5 raw exposure, audit `operation_invoked/denied` via `call_downstream`; (2) `run_operation(…, arguments?)` — deep-merge agent keys > fixed/template-resolved args (mcpTool only; process/composite ignore with an `argument_overrides_ignored` warning, no argv injection), the new `argumentsLocked` flag rejects overrides fail-closed (review F2 against template-pin spoofing); (3) the metrics wrapper passes the 5th parameter through. Tests: `tests/contract/call-downstream.test.ts` (9, a real in-process HTTP MCP stub) + http-transport tool count 22→23. Full suite 513 passed / 9 skipped, tsc clean. Args are NOT schema-validated (input validation stays with the downstream tool, documented in the README).

- [CHAIN-1] MEDIUM — **RESOLVED (US1 implemented a40f485/04a2b4c/b09f74b on develop; remainder scopes GDS-6 + CHAIN replay via feature/gds6-chain-replay-hardening)** | Rebind semantics AC-13..17 in getWorkflowState (R2: completed survives, active/blocked rebind + re-validation, session_rebound audit, AC-15 fail-closed), registry_register (R1=B), successor-born-invalid via probe-routing delegation (AC-16) — regression protection registry-rebind.test.ts (12 tests). Mid-session config changes no longer invalidate sessions (rebind); chained workflows fully usable again.

- [REV-1] LOW (Session-Review 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-28) |
  FR-035 timeout fallback for GitNexus: gitnexus had no container route
  → FIXED: `containerRoute` defined for gitnexus (live
  .guidance/downstream-servers.json + template + buildDownstream generator;
  endpoint `:4747/api/mcp`, verified via initialize probe; the egress
  allowlist :4747 already existed; live config validated in the container via
  loadConfig; regression test for both transports; suite 430/430).
  Commit ff3dc1d. The rule-text clarification (report_blocker vs. CLI fallback
  after the 2nd timeout) remains as an accepted remark in REV-1-HISTORIE — the
  practical case (route unavailable → local) is now obsolete.
  | — | resolved
- [REV-1-HISTORIE] LOW (Session-Review 2026-09-28, session-2c0c15fe, accepted
  with rationale) | FR-035 timeout fallback order: after 2× timeout of the
  GitNexus-MCP `impact` go directly to grep/terminal-CLI instead of
  report_blocker/container route. Source location see REV-1 (resolved).
  | — | resolved
  (subsumed)
- [REV-2] LOW (Session-Review 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-29) |
  `get_next_task` without imported Spec-Kit artifacts throws
  `spec_kit_artifact_missing` with a misleading import-only hint —
  FIXED (commit 03952b3): the message now names both ways (import for
  task tracking OR avoid the task tools → plan-level submissions);
  a contract test (tests/speckit/state-store-message.test.ts) pins code +
  recoverable + both markers; the README Spec-Kit bullet documents the
  two-way behavior. main.ts CHN-4 (silent on this code) unaffected.
  | — | resolved
- [REV-2-ALT] LOW (Session-Review 2026-09-28, session-2c0c15fe, action
  required) | Original description (mis-invocation context, also reproduced
  post-completion) — see REV-2 (resolved). | — | resolved
  (subsumed)
- [REV-3] LOW (Session-Review 2026-09-28, session-2c0c15fe, action
  required — rule violation) | `git diff --stat` without `--no-pager` in WSL
  hung the terminal (the user had to abort); the retry with `--no-pager`
  was immediately green. Violation of the AGENTS.md terminal rule ("read-only
  git commands MUST include --no-pager"). Reproducible: the pager starts on a
  long diff in the non-interactive pty.
  | Trigger: from now on EVERY git read command with `--no-pager` (already
  stated in AGENTS.md); lesson added to lessonsLearned.md. | action required
  (behavior rule, no code fix).

- [TMPL-1] LOW (Guidance session 2026-09-28, session-2c0c15fe, RESOLVED 2026-09-29) |
  Prettier drift in 5 files (src/config.ts, metrics/MetricsRepository.ts,
  remote/remote-session-manager.ts, state/SessionRepository.ts,
  workflow/WorkflowEngine.ts) — the lint gate (required:false) failing since
  the container run. None of these files is part of the genericity diff.
  | Trigger: next touch of any of the 5 files OR a cleanup pass —
  targeted `npx prettier --write` on exactly these 5 files — done
  (commit on feature/tmpl1-prettier-drift; check green across src, tsc
  clean, suite 430/430). Root cause (floating ^3.1.0) noted as a
  pin follow-up candidate. | resolved
- [TMPL-2] MEDIUM (Guidance session 2026-09-28, same session,
  RESOLVED 2026-09-29) | The server-insight tests failed completely in the
  guidance container (72 failures): better-sqlite3 glibc/musl dlopen — FIXED
  (commit 8134a46, TMPL-2 session 5cc970dd): image to node:24-trixie-slim
  (glibc 2.41 = host, node 24 = ABI 137 = host toolchain); in-container
  insight 118/118 (previously 72), guidance 430/430, clear-thought 166/166,
  stochastic 43/43; procps added (FR-202 ps ax). The determination was
  empirically two-step: musl → ABI mismatch → procps. Permanently baked into
  the image.
  | — | resolved
- [TMPL-3] LOW (Round-2 review 2026-09-28, session-2c0c15fe,
  RESOLVED 2026-09-29) |
  Divergence detection limited to top-level args — FIXED (commits
  81faece + 4da7f44): fingerprint over {type, server, capability, args,
  arguments, steps} with ${project.name} normalization; divergentOps
  machine-readable in the adoption block (guidance.json); note text
  generalized ('reference invocation details'). The fingerprint immediately
  caught 3 real builtin template drifts (repository-analysis analyze→check +
  noStats→repo, query-project-insights query_insights→experience_search +
  scope→scope_id) — template aligned, the builtin sync pin asserts
  divergentOps [] (review F-1). F-3 (nested key-order advisory
  false positives, by design) + F-4 (description outside the fingerprint)
  accepted. Semantics unchanged (preset ops always regenerate).
  | — | resolved
- [TMPL-5] LOW ( TMPL-3 follow-up 2026-09-29, action required → partially done) |
  Dead insight tool names in the builtin template: `store-completion-insight`
  called `store_insight` (the tool no longer exists — the insight server
  exposes only experience__/lesson__/workflow__/validation__), the downstream
  allowlist + fixtures carried `store_insight`/`query_insights`.
  FIXED: op + beforeExit reference removed from the template (capture-session-
  lessons is the modern replacement, comes via buildOperations), downstream
  → [experience_search, experience_record_observation], fixtures aligned;
  independent review 6cab6fbe: 0 HIGH/CRIT, 55/55 targeted, 432/432 settled.
  REMAINDER (LOW, accepted with trigger): the SDD/specs-002 baseline
  documents still mention store-completion-insight/store_insight (historical
  records — update when the 002 docs are next in scope); a stale test comment
  fixed.
  | Trigger: 002 documentation refresh. | partially resolved, remainder accepted.
- [TMPL-4] LOW (Round-1/2 reviews, accepted with rationale) | catch→
  freshOpsMap={} fallback and empty-refOpsMap adopt untested (by-inspection
  correct + conservative); the capture-session-lessons divergence and the
  mcpTool-arguments adopt path only covered transitively.
  | Trigger: next test expansion on config-assistant-extensions.test.ts.
  | accepted with rationale.

- [NIY-CFG-1] MEDIUM (infrastructure blocker 2026-09-28, session-46a43aeb-6a87-4730-ac64-c73e613ae8d9,
  RESOLVED 2026-09-29) |
  Lint glob in the Niyama .guidance/operations.json
  (`servers/*/src/**/*.{ts,tsx}`) → replaced with `npm run lint` (Niyama
  has a real lint script `eslint .`). Remaining config checked: build/test/
  repository-analysis generically correct. The cause class generally fixed
  by the config assistant fix 709ed15 (Thinking-MCP develop). The Niyama
  repo has uncommitted changes (task-1 scope + this fix) — committing
  is up to the Niyama owner. | — | resolved
- [NIY-CFG-2] MEDIUM (infrastructure blocker 2026-09-28, same session,
  RESOLVED 2026-09-29 with a durability reservation) |
  Test runtime repaired in the guidance container (`server-guidance-guidance-1`,
  Niyama under /workspaces/Niyama): corepack-pnpm 12.4.2
  activated + `pnpm install --frozen-lockfile` (36.7s); afterwards
  `apk add git bash` still necessary (Niyama tests spawn git init / bash —
  the Alpine image had neither; 10 → 0 failures). Baseline in the
  container: build ✅, lint ✅ (0 errors), test 440/440 ✅.
  | Residual risk/trigger: apk/corepack/node_modules are container RUNTIME
  state — PERMANENTLY FIXED 2026-09-29: the guidance Dockerfile now bakes
  in git + bash + a corepack-pnpm shim (commit cecc9da, `build(guidance):
  bake workspace toolchain into the image`); the shim resolves each
  workspace's packageManager pin (Niyama 12.4.2 verified via a real mount).
  node_modules per workspace remain workspace state (pnpm install after
  rebuild/first mount — frozen-lockfile). TMPL-2 (better-sqlite3) since
  2026-09-29 solved by the glibc base itself. | resolved (with
  Dockerfile follow-up)
- [NIY-CFG-3] INFO (same cause complex, accepted with rationale) |
  The remaining C0 tasks (task 1 was completed) run in a FRESH
  guidance session per batch, not in the aborted one — the session was
  already in phase `complete`; continued operation would bypass the
  lifecycle gates (release_batch/start_task/verify_task).
  | Trigger: start of the next C0 batch. | accepted with rationale.

- [CHN-R2-1] LOW (Final Comprehensive Review 2026-09-26, bb37f6c, accepted) |
  Replay staleness from the CHN-5 fix: if the wrapper crashes AFTER successor
  activation but BEFORE re-caching the requestIds result, a replay of
  complete_workflow returns the cached chain entry with status
  'activating' even though the successor is long active/blocked (the wrapper
  skips the update when status != activating, WorkflowEngine
  ~L1311). Purely informational — the client loop follows nextSessionId and
  fetches the real status via get_current_guidance. | Trigger: next touch of
  `completeWorkflow` — finalize the entry status in the replay branch or
  document it. | accepted with rationale (replaces the outdated
  description in [CHN-5] LOW-6 below).
- [CHN-R2-2] RESOLVED 2026-09-26 (Final Comprehensive Review, was LOW/accepted) |
  Test gap FR-119 closed: test "CHN-R2-2 mixed manifest (steps +
  source) in plain profile rejected entirely" in chain.test.ts (19
  chain tests). Commit 7cb55be. | — | resolved
- [CHN-R2-3] NIT (Final Comprehensive Review 2026-09-26, bb37f6c, accepted) |
  CHN-1 recovery reactivates without FR-043 reconciliation: `retryOperations`
  loads raw (`sessions.load`) and calls `activateSession` again — hooks that
  already ran before the crash are executed completely anew;
  `reconcileRunningOperations` does not apply here (only in getWorkflowState).
  Identical semantics to the established FR-040 retry path, no regression —
  the residual risk lies only in the double-crash window (crash mid-hook on
  an activating successor). | Trigger: if required hooks become state-changing.
  | accepted with rationale.
- [CHN-R2-4] NIT (Final Comprehensive Review 2026-09-26, bb37f6c) |
  memory-bank hygiene: the superseded CHN-4/5/6 original entries (below,
  'accepted/action required') carry no back-reference to the RESOLVED
  entries above (only CHN-3-R1/R2 have -HISTORIE aliases). | Trigger:
  next cleanup pass of remaining-work-plan.md. | accepted with
  rationale.

- [CHN-4] RESOLVED 2026-09-26 | The Form-B silent end now audits
  `chain_end {reason: no_pending_tasks, chainedCount}` (only when source
  is set; pure Form-A exhaustion stays silent, §3.2); bridge errors in
  composeApplication go to stderr instead of disappearing silently
  (behavior [] unchanged). | — | resolved
- [CHN-5] RESOLVED 2026-09-26 | completeWorkflowLocked caches the
  successor result within the lock with a complete chain entry (status
  'activating'), the wrapper finalizes — crash replays always have a
  complete chain entry (test CHN-5). | — | resolved
- [CHN-6] RESOLVED 2026-09-26 | startWorkflow reloads the session fresh
  after activateSession (sessions.load) for guidance + status — no more
  pre-activation snapshot (NIT-7 addressed). | — | resolved
- [CHN-3-R1] RESOLVED 2026-09-26 (was HIGH) | Form-B cursor reset
  (details of the finding see the history below): FIXED — the Form-B branch
  returns `upNext: steps.length` (successor chainUpNext ≥ steps.length,
  inert for pure Form B); regression test "CHN-3 HIGH-1 regression"
  (2 Form-A steps + source + 1 task → after T001 a silent end, no
  step-two re-run). 17 chain tests / 249 total green. | — | resolved
- [CHN-3-R2] RESOLVED 2026-09-26 (was MEDIUM) | Scope deviation
  verified and resolved: the 25 out-of-scope files were pure Prettier
  reformatting (LF/line wrapping) from a `prettier --write` run that was too
  broad over the whole src directory — `git checkout --` on all unintended
  files, the diff again limited to the 7 intended files. Lesson: never run
  prettier more broadly than the intended files. | — | resolved (reverted)
- [CHN-3-R1-HISTORIE] HIGH (CHN-3 review, 2026-09-26) | Mixed-chain Form-B
  cursor reset: `resolveChainStep` returns `upNext: 0` for Form-B steps
  (WorkflowEngine.ts:743), `completeWorkflowLocked` derives
  `chainUpNext = upNext + 1 = 1` from it (WorkflowEngine.ts:1543). For
  manifests with `steps.length >= 2` + `source` the cursor thus points BACK
  into Form A: after EVERY Form-B task `steps[1]` runs again until the
  depth gate (`chain_depth_exceeded`) strangles the chain — a violation of
  §12. Reproduced by the reviewer; the regression test
  "CHN-3 HIGH-1 regression" supplied afterwards → see CHN-3-R1 RESOLVED
  above.
  | — | resolved (fixed)
- [CHN-3-R2-HISTORIE] MEDIUM | Scope deviation: 25 files reformatted
  (prettier run too broad) — see CHN-3-R2 RESOLVED above (reverted).
  | — | resolved (reverted)
- [CHN-3-R2] MEDIUM (CHN-3 review, 2026-09-26) | Review scope deviation:
  the declared review scope (register-tools.ts, WorkflowEngine.ts,
  README, Spec §12, chain.test.ts) covers only part of the actual
  uncommitted diff — 25 further files with substantial changes
  (including SpecKitEngine.ts +755 lines, ConfigAssistant.ts, remote-tools.ts,
  server.ts) are unreviewed; the feature branch has ZERO commits
  (HEAD == develop 49a18bc). Additionally the existing entry
  [CHN-3] is marked "RESOLVED" — with CHN-3-R1 open that needs to be made
  precise.
  | Trigger: commit/PR creation of the branch — either separate the
  out-of-scope diff, review it afterwards, or explicitly declare it a
  separate scope.
  | action required
- [CHN-3] RESOLVED 2026-09-26 | Mixed manifests (Q-B revised):
  `steps` + `source` combinable (Spec Amendment 002 v1.1, §12/FR-119);
  engine resolveChainStep two-phase (Form A to exhaustion, then Form
  B), chainedTaskIds advanced only by task steps, plain + source
  rejected. Tests: mixed happy path + validation + HIGH-1 regression
  (17 chain tests / 249 total). | — | resolved
- [CHN-2] RESOLVED 2026-09-26 | Dogfooding activated: `chain: {enabled:
  true, maxChainDepth: 8, maxStepsPerManifest: 16}` in
  `.guidance/guidance.json` (plain profile ⇒ Form A). CRITICAL note:
  activation WITHOUT an image rebuild would break the next container
  restart (the old boot validation does not know 'chain',
  additionalProperties:false) — the image was rebuilt in the same step
  (`docker compose build && up -d`, /health ok). loadConfig smoke +
  247/247 tests green. | — | resolved
- [CHN-1] RESOLVED 2026-09-26 | Re-activation path implemented:
  `retryOperations` intercepts status `activating` (before the
  `chain_activation_incomplete` throw from getSession), runs
  `activateSession` again — success → active + audit
  `chain_activation_recovered`, FR-040 failure → blocked + recoverable
  `required_hook_failed`. Tests §10.11b/§10.11c in chain.test.ts
  (14 chain tests / 247 total green). | — | resolved
- [CHN-7] LOW (CHN-1 review #3, accepted) | Response contrast: the new
  recovery fail path in `retryOperations` returns `status` (like
  reportBlocker/resumeWorkflow), the existing FR-040 retry fail path
  omits it; recovery success has no `previousPhase` (no phase
  transition). Loose SubmitResult union ⇒ no consumer break.
  | Trigger: next touch of `retryOperations`. | accepted with rationale
  (optional alignment follow-up).
- [CHN-4] MEDIUM (post-merge review MEDIUM-2, accepted) | The Form-B bridge
  (specKitTasks callback in `composeApplication`) catches every exception as
  `[]` — a broken Spec-Kit state ends the chain "regularly silently"
  (FR-117 silent end) instead of being diagnostically distinguishable.
  | Trigger: productive use of Form B or the next touch of the bridge.
  | action required: distinguish load errors from an empty list or add
  a `chain_end` audit event with the bridge status.
- [CHN-5] LOW (post-merge review LOW-6, accepted) | Crash after successor
  activation but before re-caching the requestIds result: the replay returns
  `nextSessionId` without a `chain` entry (purely informational; the client
  loop follows nextSessionId). | Trigger: next touch of `completeWorkflow`.
  | accepted with rationale.
- [CHN-6] NIT (post-merge review NIT-7, accepted) | `startWorkflow` builds
  the response guidance from the pre-activation snapshot (a locally
  stale session object); currently ineffective since `guidanceFor` reads
  only static texts + chainTaskScope. | Trigger: if `guidanceFor`
  ever includes dynamic session state. | accepted with rationale.
- [CHN-1] MEDIUM | Workflow chaining (Amendment 002, implemented on
  `feature/workflow-chaining`): an `activating` session left behind in the
  crash window is rejected fail-closed (`chain_activation_incomplete`),
  but `retry_operation` does not automatically resume it (re-activation
  requires manual intervention/restart). Fail-closed prevents every
  gate bypass; the convenient resumption is missing. | Trigger: the next
  touch of `WorkflowEngine.retryOperation` or chaining feedback from
  productive use. | action required: add a re-activation path
  (retry_operation or startup recovery) + test.
- [CHN-2] LOW | Chain dogfooding: `chain` is implemented but not yet
  activated in the repo's own `.guidance/guidance.json` (default
  `enabled:false`, working assumption Q-A). | Trigger: merge of
  `feature/workflow-chaining` to develop. | action required: user
  decision — set `chain.enabled: true` or deliberately leave it disabled.
- [CHN-3] LOW | A mixed-chain manifest (Form A steps + Form B source
  combined) is currently rejected as exclusive (z.union) (working
  assumption Q-B). | Trigger:
  if a use case "first steps, then task-derived" arises.
  | accepted with rationale; possibly follow-up work in the spec.

- [GUID-6] CLOSED 2026-09-25 | Freshness check deterministic in the gate:
  the new blocking operation `index-freshness` (script
  `servers/server-guidance/scripts/check-index-freshness.mjs`, pure Node
  without a git binary) compares `.gitnexus/branches/*/meta.json` (lastCommit)
  against git HEAD (loose ref + packed-refs fallback, detached-HEAD tolerant)
  and fails on staleness with the difference detail — live demonstrated:
  commit `4ee166e` after the last analyze → gate fail "no index covers HEAD",
  after `gitnexus analyze --no-stats` → green. The root meta.json is NOT a
  freshness indicator (incremental analyze updates only branches/_).
  Remainder: a gitnexus-native staleness API remains nice-to-have (the script
  makes it superfluous as long as branches/_ is reliably maintained).
  | — | resolved
- [GUID-3] CLOSED 2026-09-25 | Template placeholders are now resolved:
  `OperationContext.templateVars` (populated by `WorkflowEngine.ctxFor` with
  `session.request` + `project.name`), deep `${token}` resolution for
  `mode: "template"` in OperationEngine (fail-fast `operation_arguments_invalid`
  on unknown tokens — literal passthrough excluded); `mode: "fixed"`
  stays literal. Regression tests in
  tests/orchestration/operation-engine-env-template.test.ts. | — | resolved
- [GUID-4] CLOSED 2026-09-25 | Regression coverage for the ESM
  createRequire fix supplied afterwards: (a) schema load via the public API
  (`submit` understand→plan, valid + invalid through the real validatorFor
  path), (b) source-scan test against a bare-`require("…")` recurrence in
  WorkflowEngine.ts
  (tests/workflow/schema-load-regression.test.ts). | — | resolved
- [GUID-7] CLOSED 2026-09-25 | Switchable `workspaceRoot` per session —
  not needed as a server feature: `start_workflow` already accepts
  `workspaceRoot` per session (`assertWorkspaceInside` accepts anything
  under `/workspace`), and `docker-compose.override.yml` has mounted
  `D:/repos/Thinking-MCP-worktrees` to `/workspace/worktrees` since today.
  Pattern: `git worktree add` on the host under Thinking-MCP-worktrees, then
  `start_workflow` with `workspaceRoot: /workspace/worktrees/<name>` — all
  gates (incl. index-freshness via the worktree's own .gitnexus) run in the
  worktree; run `npm install` once in the worktree for the build/test gates.
  Live verified: start_workflow with a worktree root → accepted.
  | — | resolved (deployment pattern instead of a server feature)
- [GUID-1] CLOSED 2026-09-25 | The gate fired productively in the complete
  run and went green: `repository-analysis` succeeded (check `{repo:"thinking-mcp"}`
  after the GUID-3 workaround + container restart). Session
  `session-7192a3e7-fcbf-4f01-b297-93efc2da9d9d` completed. The residual
  risk documented in activeContext (Docker mounts vs. index state, cf. HD-4)
  remains an observation point for future runs. | resolved (green run)
- [GUID-2] CLOSED 2026-09-25 (subsumed) | `store-completion-insight` args
  incomplete — the operation was **completely removed** as part of the
  capture-lessons integration and replaced by `capture-session-lessons`
  (process gate, seed-lessons.mjs, idempotent, blocking; commit `2e72c9a`).
  The original trigger no longer exists. Duplicate entry consolidated.
  | — | resolved (subsumed)
- [x] HD-2 | LOW | `connection.startupTimeoutSeconds` was not wired —
      `ClientManager.handshakeTimeoutMs` hardcoded 10 s. RESOLVED (commit "wire
      per-server handshake timeout"): `ensureReady` takes
      `connection.handshakeTimeoutSeconds` (from `startupTimeoutSeconds`) per
      server; config validation positive-finite; invalid value ⇒ failed status
      (no crash); a test with a hanging transport proves the wiring (fail ~200
      ms with the default 10 s). detect-changes: risk MEDIUM, only expected
      symbols. | — |
      resolved
- [GUID-2] CLOSED 2026-09-25 (subsumed) | `store-completion-insight` args
  incomplete — the operation was **completely removed** as part of the
  capture-lessons integration and replaced by `capture-session-lessons`
  (process gate, seed-lessons.mjs, idempotent, blocking; commit `2e72c9a`).
  The original trigger no longer exists. | — | resolved (subsumed)
- [GUID-5] CLOSED 2026-09-25 | `env` and `shell` options for process
  operations implemented (OperationConfig + spawnSync: env merge over
  process.env, shell boolean|string; validation in config.ts; unit tests
  incl. a negative proof without env). Own operations.json switched to env
  (the sh -c wrapper dropped). Remainder: switchable workspaceRoot → GUID-7.
  | — | resolved
- [GUID-5] CLOSED 2026-09-25 | `env` and `shell` options for process
  operations implemented (OperationConfig + spawnSync: env merge over
  process.env, shell boolean|string; validation in config.ts; unit tests
  incl. a negative proof without env). Own operations.json switched to env
  (the sh -c wrapper dropped). Remainder: switchable workspaceRoot → GUID-7.
  | — | resolved
- [HD-3] CLOSED 2026-09-25 | Stateful downstream regression automated:
  tests/orchestration/client-manager-http-stateful.test.ts — an in-process
  stateful MCP HTTP server (real StreamableHTTPServerTransport with
  sessionIdGenerator + mcp-session-id); ClientManager via the HTTP branch
  of transportFor. Covered: ensureReady/discovery in session, invokeTool
  success + server-side session-header proof, lost session →
  deterministic transport classification (server 404 counter). 3/3 tests
  green. Documented boundary: the stub answers JSON instead of SSE
  (the live server response format) — remainder as a coverage note in the
  entry. | — | resolved
- [HD-1] MEDIUM | HTTP downstream reconnect missing: `connection.reconnect`
  was documented but not implemented. RESOLVED (commit "feat(guidance):
  reconnect downstream after transport failures"): ClientManager remembers
  the transport/handshake parameters per server; after a transport failure
  the dead client is discarded, the handshake retried up to
  `maximumAttempts` times (`delayMilliseconds` in between) and the call
  executed again. Invalid config (e.g. requestTimeoutSeconds) is NEVER
  retried. Validation: reconnect = object with enabled:boolean,
  maximumAttempts: positive int, delayMilliseconds: non-negative int
  (fail-closed). Tests: reconnect-after-death, exhausted-attempts
  ("reconnect attempt 2/2"), disabled/unconfigured,
  invalid-timeout-no-retry. Remainder: a backoff strategy
  (exponential/jitter) deliberately not implemented — fixed delay,
  documented.
  **Review follow-up (2026-09-25): F1 (MEDIUM, fixed):**
  Reconnect initially also applied to request timeouts — the call had
  already gone downstream (no AbortSignal) and would have been repeated
  automatically ⇒ duplication risk for non-idempotent tools, contradiction
  with FR-035.
  Fix: transport failures now carry `timedOut: true` and are explicitly
  excluded from reconnect (regression test: transport factory called
  exactly 1× after a timeout). **F2 (LOW, fixed):** the README clarifies
  that `maximumAttempts` is required to take effect. | — | resolved
- [HD-2] LOW | `connection.startupTimeoutSeconds` is not wired —
  `ClientManager.handshakeTimeoutMs` is hardcoded 10 s (pre-existing, more
  relevant for cold-starting HTTP downstreams). | Trigger: next touch of
  ClientManager.ensureReady. | accepted with rationale (small, deliberately
  deferred)
- [HD-3] LOW | The HTTP E2E test covers only a stateless downstream
  (guidance createHttpApp); the stateful session behavior of the
  StreamableHTTPClientTransport against insight (sessionIdGenerator) is not
  tested automatically. | Trigger: insight productively set as a
  downstream in a guidance config. | RESOLVED (2026-09-25, manually
  verified): live check with a real ClientManager against the stateful
  servers — insight: ready, 20 tools, invoke → tool_reported (correct
  error classification without args); gitnexus :4747/api/mcp: ready, 17
  tools, invoke list_repos → success. Session handling (mcp-session-id)
  confirmed by the SDK client. Regression protection as an automated test
  remains open — the live system is not addressable from CI; substitute
  via a stateful in-process HTTP stub at the next touch of the test.
  | action required
  (only the automated test)
- [x] HD-4 | INFO | MCP tool access 2026-09-25: (a) clear-thought/GitNexus
      context server timeouts (impact substituted with grep). (b) Docker MCP
      (:4747) has its own empty registry (sees only …\GitNexus\workspace) — the
      WSL CLI is a separate truth space. (c) The WSL index was inconsistent
      (quarantined WAL, /mnt/c duplicate). RESOLVED: gitnexus remove /mnt/c
      duplicate + clean + analyze --no-stats → detect-changes runs fully (11
      files, 41 symbols, risk HIGH — expected: loadConfig/WorkflowEngine are
      startup-critical; changes additive/backward-compatible, 206/206 tests +
      tsc green as compensation). Open (accepted): Docker MCP does not see
      D:\repos — an additional container mount would be needed for MCP-side
      tools; until then the CLI (WSL) as the source. | Trigger: use of the
      GitNexus MCP tools for this repo. | resolved (remainder: accepted with
      rationale)

- [RB-10] LOW (pending rescan) | clear-thought published to Smithery:
  paschbaer/clear-thought created (PUT /servers 201), release 954d7892
  (202/SUCCESS), record PATCHed; registry lists 33/33 tools with
  descriptions. Quality score: first rescan 2026-09-13 = 75/100. Capability round shipped
  2026-09-13 (release 4b0dfb6a): central tool.update() enhancement adds
  annotations + passthrough outputSchema + structuredContent to all tools;
  param descriptions completed (33/33). Expected score after rescan: ~96/100. (Descriptions 33/33,
  Metadata 35/35, Config 25/25; params 15/33, outputSchemas 0/33,
  annotations 0/33 — the quantified RB-10 gap). Known gap vs 100/100:
  annotations + outputSchemas are not set on the 33 high-level tools (code
  change across ~25 register calls); 8 tools have params without
  descriptions. | trigger: next Smithery dashboard visit | action required:
  read the rescan score; decide whether to add annotations/outputSchemas to
  all tools. Detailed elaboration: `plans/quality-distribution.md` (Phase 1;
  chosen strategy: central metadata registry — decisionframework
  `rb10-schema-strategy-2026-09-13`, Option B).
  UPDATE 2026-09-14 (branch `feature/rb10-typed-output-schemas`, commit
  17c3f76): code gap CLOSED via the central metadata registry
  (`src/tools/tool-metadata.ts`, 33/33 entries — human-readable titles, typed
  output schemas with evidenced optional top-level fields + passthrough,
  honest idempotentHint=false for 16 stateful tools) applied by the central
  `tool.update()` loop. Audit script (`scripts/audit-tool-metadata.ts`):
  generic titles 33→0, passthrough outputs 33→0, undescribed params 0→0.
  Completeness/round-trip tests added; 84/84 green.
  UPDATE 2026-09-14: squash-merged to `main` (`17c3f76`) and re-published to
  Smithery (user-confirmed via scripts/publish-smithery.mjs). Remaining to
  close: dashboard rescan score → record it here.
  RESOLVED 2026-09-14: rescan score **96/100** (was 75 at the 2026-09-13
  first rescan). Capability 36/40 — Descriptions 33/33 (10.37pt), Param
  descriptions 33/33 (8.89pt), Output schemas 33/33 (10.37pt, was 0),
  Annotations 33/33 (5.93pt, was 0), Naming 4.44pt; Server Metadata 35/35;
  Config UX 25/25. Residual ~4pt = Naming (snake_case tool names, breaking
  rename deferred — tracked in RB-9-history). RB-10 CLOSED.
- [RB-9] RESOLVED 2026-09-13 | Smithery quality score reached 100/100 (was
  28/100): Capability 40/40, Server Metadata 35/35, Configuration UX 25/25.
  Fix chain: full tool metadata in code + serverCard publishing + server
  record PATCH (displayName/homepage/iconUrl/license). Reusable publisher:
  scripts/publish-smithery.mjs (record PATCH included).
- [RB-9-history] LOW | Smithery capability score 68→40/40 capability achieved via
  serverCard publishing; server record metadata (displayName, homepage,
  iconUrl, license) set 2026-09-13 via PATCH /servers/{qn} (card-only fields
  did not move the metadata score). Awaiting quality rescan. Reusable
  publisher: scripts/publish-smithery.mjs. Remaining gap: Naming ~6pt
  (agents_guide snake_case, breaking rename deferred).
  UPDATE 2026-09-15: rename EXECUTED in 1.0.0 (all 12 compact-lowercase names
  → snake_case, branch feature/snake-case-rename merged to develop) and
  published — rescan result: **Naming STILL 4.44pt (unchanged)**. Hypothesis
  "snake_case closes the gap" FALSIFIED; scoring rule unknown. RESOLVED AS
  ACCEPTED: 96/100 is the practical ceiling without another breaking rename
  toward an unknown target — do not retry.
- [RB-2] LOW | `AGENTS.md` root file mixes hand-written project rules and the
  generated guide; regeneration via `agents_guide` merge mode must be used to
  avoid losing hand-written sections | trigger: any template change in
  `src/tools/agents-guide-template.ts` | action required: regenerate via
  merge mode, never overwrite manually.
- [RB-3] MED | GitNexus-generated "Index stale?" hint inside the
  `<!-- gitnexus:start/end -->` block of AGENTS.md/CLAUDE.md recommends
  `node .gitnexus/run.cjs analyze` WITHOUT `--no-stats`; an agent following it
  verbatim reintroduces volatile counts (post-commit review 328ca16,
  pre-existing/tool-generated). Mitigated by the Architecture Map mandate +
  lessonsLearned entry. | trigger: any future `gitnexus analyze` run or GitNexus
  CLI upgrade | accepted observation with mitigation; optional hardening:
  wrapper in `.gitnexus/run.cjs` that injects `--no-stats`, or upstream
  flag support.
- [RB-8] RESOLVED 2026-09-12 | First Smithery publish of
  `paschbaer/stochasticthinking` succeeded (API: PUT /releases, stdio/node,
  deploymentId `b6e38872-…`, status SUCCESS, mcpUrl
  `https://stochasticthinking--paschbaer.run.tools`) but the hosted endpoint
  returned 404 | verified via API: `remote: false`, `deploymentUrl: null` —
  stdio MCPB bundles are download/install-only on Smithery; the run.tools
  hosted path applies to remote/URL servers only. 1 connection already
  exists. Note: v4 CLI has no `deploy` command (dashboard/API publishing
  only); workflow smithery.yml deploy job is therefore dead code (see RB-7).
- [RB-7] LOW (residual) | CI: `test.yml` added 2026-09-12 (node 20, immutable
  install, build + test across workspaces). The `smithery.yml` deploy workflow
  was REMOVED 2026-09-13 (revert `ci/retire-smithery-deploy` to restore): the
  v4 CLI has no `deploy` command, `auth login` is a browser-interactive flow
  (CI log: auth_url + Session expired) and the SMITHERY_TOKEN secret is unset
  — the job could never succeed. Publishing happens via
  scripts/publish-smithery.mjs against the documented API. Remaining: verify
  `test.yml` runs green in the Actions tab after the next push. | trigger:
  next `git push` | action required: check the Actions tab for test.yml and
  the Smithery deploy run.
  UPDATE 2026-09-14: RESOLVED — `main` pushed (head `17c3f76`); user
  confirmed `test.yml` GREEN in the Actions tab.

## Resolved / Reclassified

- [RB-11] RESOLVED 2026-09-13 | stochastic migrated to the high-level
  McpServer API (squash 0fae6d4): zod shapes as single source of truth
  (validation/JSON schema/typed args), registerTool with annotations +
  outputSchema + structuredContent, declarative agents-guide registration,
  scripts capture tool metadata at runtime; tests updated to the SDK
  validation-error convention (isError results, not rejections); release
  381e940e republished (SUCCESS). Verified: typecheck, build, 24/24 tests.
- [RB-6] RESOLVED 2026-09-12 | stale npm/Smithery references in the
  clear-thought README (badge `@waldzellai/clear-thought`, npm/npx install for
  a 404 scope) | fact check like RB-5; README now documents from-source
  install + planned publishing. Related hardening in the same round:
  `src/dev.ts` guard switched to `pathToFileURL` (robust against relative
  argv paths incl. tsx; `npm run dev` verified to start — drvfs cold start
  can take >20 s) and npm bin corrected to the stdio entry (`dist/dev.js`).
- [RB-5] RESOLVED 2026-09-12 | stochastic README referenced stale npm/Smithery
  scopes | fact check: npm `@paschbaer/stochasticthinking` = 404,
  `@waldzellai/stochasticthinking` = 0.0.1 (stale upstream), Smithery has no
  server page under either scope | README reworked: dead badge, Smithery
  install command and npm/npx instructions removed; from-source install added
  as the only documented path; publishing declared as planned (npm `@paschbaer`
  scope + `npm run deploy`); stdio MCP client example switched to a local
  `node dist/dev.js` path.
- [RB-4] RESOLVED 2026-09-12 | Docker build/run of the stochastic HTTP image
  was unverified | verified via Docker Desktop after enabling WSL integration
  for the Debian distro: image build ok, container on `-p 3002:3000` healthy
  (docker HEALTHCHECK, 0 failing streaks), `/health`, initialize, session
  header, `tools/list` (both tools), `agents_guide` full mode and
  `stochasticalgorithm` round-trip green over the mapped port. Container
  cleaned up afterwards.
- [RB-1] RESOLVED 2026-09-11 | stochastic server was a skeleton (`src/index.ts`
  only, no tests, no HTTP) | fixed by the HTTP-MCP rebuild on
  `feature/stochastic-http-mcp` (phases 0–5): factory + zod config, stdio dev
  entry, Streamable HTTP server with /health, vitest suite (15 tests), live
  smoke test (6 checks), Docker recipe ported from clear-thought.

- [EV-1] MEDIUM | Eval Run 2 (easy tasks, glm-5.3 Actor+Judge): all tasks
  Δ = 0 — self-bias confounder + tasks too easy | trigger: next eval
  measurement | action required: Run 3 with `evals/tasks-hard.json`
  (ground-truth rubrics) and an independent judge (`EVAL_JUDGE_MODEL` +
  `EVAL_JUDGE_BASE_URL`/`EVAL_JUDGE_API_KEY` on another provider); the rig is
  built (branch `feature/harder-evals-actor-judge-split`), needs API keys +
  go.

- [EV-2] FIXED 2026-09-15 (review finding, was MEDIUM) | Bandit rubric
  constants (regret 16.14, pulls 31/13/96, mean 0.271) were seed-locked without
  regression protection — an RNG change would silently invalidate the rubric
  | **Fixed with a pinning test**
  `tests/algorithms.test.ts` (thompson/seed 7, 80+60 via createBanditRun/runBanditCall,
  exact assertions; 17/17 green). Trigger if it turns red: regenerate the rubric
  ground truth in tasks-hard.json from real tool runs before an eval run is
  scored.
- [EV-3] FIXED 2026-09-15 (review findings, LOW) | Runner argument guards
  (`--max-tasks` NaN → exit 2 instead of silently "all tasks"; `--tasks`
  without a value → exit 2 instead of TypeError), judge answer cap
  6000→12000 characters, stdio transport cleanup on a failed connect,
  game-matrix rubric: `chaotic` is also dominated by `aggressive`
  (both justifications now accepted as correct).
- [EV-4] ACCEPTED with rationale (review NIT) | The self-bias warning compares
  full URLs — the same model behind a URL alias/proxy is not detected;
  documented heuristic behavior. `chat()` returns undefined for attempts<=0 —
  unreachable with the current call sites (3/1), a latent contract waiting
  state. | trigger: if proxy-based judge setups are used, extend the
  heuristic to host normalization.
- [EV-5] ACCEPTED with rationale (infra, pre-existing) |
  `bin-invocation.test.ts` (npx symlink startup probe) is load-sensitive on
  drvfs: green in isolation (58.5 s test time — the probe window is tight),
  in the full suite under parallel load 2× red.
  Not caused by this diff (no src/dist change). | trigger: if it turns red
  in CI (native Linux, no drvfs) → investigate for real; locally: re-run
  focused before assuming a regression.

- [EV-1] RESOLVED 2026-09-15 | Run 3 with tasks-hard.json + an independent
  judge (glm-5.3-flash Actor [thinking off] ↔ glm-5.3 Judge) executed:
  Δ +11 bandit / +2 fault-tree / 0 Fermi / −4 game (transcribe slip). The
  hard set differentiates as designed — the stateful bandit task is the
  cleanest tool-value proof.
- [EV-6] MEDIUM (new, Run 3) | Scoring display bug: the judge raw sum (max 16
  for 4 criteria) is written into the report against the weighted rubricMax
  (40) — percentages deflated, the deltas remain valid | trigger: before
  Run 4 | action required: compute total = Σ score×weight in the runner; note
  the compatibility with old reports in the README.
- [EV-7] MEDIUM (approved) | Run-4 hardening: verbatim-parameter system prompt
  for server mode (fixes the game-matrix transcribe error class),
  EVAL_MAX_TOOL_ROUNDS (default 8), tool-call log (args + result preview) in
  report.json, rounding tolerance/equivalence in the H1 rubric | trigger:
  after EV-6, then Run 4.

- [EV-6] RESOLVED 2026-09-15 | Weighted scoring in the runner (total = Σ
  score×weight, clamp 0-4), the report scale is now consistent (40) — old
  reports (raw sums) are not comparable, README docs on it.
- [EV-7] RESOLVED 2026-09-15 | Operator prompt (verbatim params, runId reuse,
  full precision), EVAL_MAX_TOOL_ROUNDS (8), tool-call log in report.json,
  judge equivalence rule, H1 rounding tolerance. Effect: bandit/fault-tree
  40/40.
- [EV-8] OBSERVATION (Run 4, no immediate action needed) | Tool-schema
  flailing: flash-no-think sent payoff_matrix 4× as string arrays instead of
  {row,col} objects (first-call format error, budget loss), afterwards adopted
  the full-game dominance output unfiltered instead of following nextSteps
  ("aggregating strategies to reach a 2×2 form"). | trigger: if game_matrix
  mis-calls reappear | action: payoff_matrix example JSON in the tool
  description; check nextSteps prominence. Fermi task: fermi_estimate
  was skipped (VoI mis-parameterized twice) — an operator-prompt variant
  "compute every requested number WITH the matching tool" is conceivable.

- [EV-8] RESOLVED 2026-09-15 | payoff_matrix example in the game_matrix
  schema description (commit 9bd6812, dist rebuilt) + operator prompt
  "matching tool / real JSON objects". Run 5: both Run-4 error classes gone
  (game 38/40 with clean calls, Fermi 40/40 using fermi_estimate).
  No further action needed; a rig freeze at the Run-5 state recommended.

## Tracked Follow-ups (appended 2026-09-15, merge implementation)

- [MG-1] RESOLVED 2026-09-16 | Merge phase 6: stochastic jobs removed from
  `publish-npm.yml`, `publish-containers.yml`, `publish-smithery.yml` (commit
  `42010d1`, pushed) + `npm deprecate @paschbaer/stochasticthinking` executed
  and verified via `npm view` (deprecation message live, reference to
  `@paschbaer/clear-thought@>=2.0.0`, version 0.1.1 remains installable).
  Origin: merge phase 6 pending …
  UPDATE 2026-09-16: release version set by the user to 2.0.0 (decisions.md
  update 2); the merge branch contents are already on develop — the release
  trigger is now the PR `develop → main`. Version bump on
  `feature/release-2-0-0`.
  UPDATE 2026-09-16 (II): trigger REACHED — the user merged develop → main
  and initiated the publish (2.0.0). Action now due: verify 2.0.0 on
  npm/ghcr/Smithery, then `npm deprecate @paschbaer/stochasticthinking`
  (reference to `@paschbaer/clear-thought@>=2.0.0`) + remove the stochastic
  jobs from `publish-npm.yml`, `publish-containers.yml`,
  `publish-smithery.yml`.
- [MG-2] LOW | `servers/server-stochasticthinking/` stays in the repo until
  further notice (CI `test.yml` builds both workspaces); archive the folder
  later and remove it from the CI matrix | trigger: after MG-1 + a
  deprecation period | accepted with rationale: the README serves as a
  parameter reference.
- [MG-3] LOW | `scripts/funktionstest.mjs` (clear-thought) still uses the
  pre-1.0.0 compact names for the legacy tools — live checks against a
  current server fail for those; the new stochastic checks (2026-09-15)
  use the current names | trigger: next maintenance round | action required:
  lift the names and verify against a running server.
- [MG-4] LOW | `evals/run.mjs` (clear-thought) still attaches the deprecated
  sibling `../server-stochasticthinking/dist/dev.js` for LLM evals (if
  present) | evidence: run.mjs line ~291, `existsSync`-guarded, "first server
  wins"-routing makes the attach redundant (the merged server is the first
  client) | trigger: MG-2 (folder archival) or the next eval harness
  maintenance | accepted with rationale: harmless — routing goes to the
  merged server; after archival the existsSync fallback applies silently.
  UPDATE 2026-09-16: RESOLVED — attach block + doc spots removed
  (review fix F3, branch feature/skill-generator-docs); entry obsolete.

## EMMS Spec Follow-ups (Review 2026-09-17, spec 001-experience-memory-server)

Trigger: /speckit-plan for 001-experience-memory-server

1. Define the actor/identity model (what is an actor in the local MVP?) | required
2. Define revision semantics + conflict response (concretize FR-029) | required
3. Define the eval corpus for SC-001/SC-006/SC-009 (minimum scope, golden paths) | required
4. Sketch the guidance object schema (FR-010/011 before implementation) | required
5. Define measurable thresholds for FR-021 (duplicate/contradiction detection) | required
6. Fabricated-evidence mitigation — RESOLVED 2026-09-18: anchored as FR-008a in the spec (MVP limit: artifact hash verification at finalize; cryptographic attestation explicitly a team phase). Acceptance criterion: a deleted/modified artifact between record_run and finalize MUST make finalize fail (ARTIFACT_HASH_MISMATCH / MISSING_REQUIRED_EVIDENCE). Implementation: finalize(verified) now reads EVERY evidence artifact via EvidenceStore.read (hash verification); a tampered artifact between record_run and finalize blocks with ARTIFACT_HASH_MISMATCH. Contract test in capture.test.ts. Commit 1027a21. CLOSED.
7. Export format for episodes (portable, future-proof) | accepted observation, rationale: nice-to-have, not MVP-blocking

## 2026-09-19 — Verify: addendum revision conflict on episode-extend

- **Finding** (Niyama report): An addendum to episode `exp_160d2db7-4d8` (niyama-lessons, Docker store) should have attached to the current episode revision (Rev 6) but landed as Rev 3 on the older workflow of the same episode. Content is persistent server-side, but the revision reference is presumably miswired.
- **Trigger point:** Next scope work on the episode-extend/addendum flow (`record_observation` against an existing episode / the finalize addendum path in `src/service.ts`).
- **Action required:** ~~open~~ **RESOLVED 2026-09-19 (commit see git log: fix(emms) replay revision)**: the root cause was the idempotency replay of `workflow_start` (FR-028) — it returned the ORIGINAL result with the then-current revision; addendum runs computed from Rev 1 and crashed with STALE_REVISION. Fix: replay patches to the current workflow revision + a `replayed: true` flag; regression test `tests/contracts/replay-revision.test.ts`, suite 95/95.

## Tracked follow-ups (2026-09-22)

- [x] Golden test flake: FIXED (2026-09-22) — the cause was the vitest threads pool (napi instability with better-sqlite3, also as a silent FTS failure) plus a too-tight 5s timeout. Fix: `pool: 'forks'` + `testTimeout: 30_000` in `servers/server-insight/vitest.config.ts`. Suite: 99/99. Action done.
- [x] Sync prompt copies of `.github/prompts/capture-lessons.prompt.md` in other repos from the master — CLOSED AS OBSOLETE (2026-09-26, user decision option 3): distribution runs via package/Smithery or the master prompt; no repo copies needed. Verified: no other repo under D:/repos ever contained a copy/reference (grep 0 hits). Action done (obsolete).
- [x] Rebuild + deploy the Docker image (VERIFIED 2026-09-24: HTTP server runs on :3002, experience_seed_lessons successfully used via HTTP — tool available). Action done.
- [x] FTS retrieval ineffective (discovered 2026-09-22, fixed immediately): missing `episodes_fts` writer (trigger + backfill in the `sqlite.ts` init), INNER JOIN on `signatures` in `searchFullText` → LEFT JOIN, FTS-hit bonus (+0.30) in the relevance scoring. Live verified: the slug search returns the target episode at rank 1 (rel 0.55). Action done.
- [x] FTS index covers only `goal_summary` — RESOLVED (2026-09-26, L256): new FTS index `observations_fts` (insert trigger + idempotent backfill in `SqliteAdapter.init()`, 500-character cap per observation); `searchFullText` matches both indexes. Regression tests `tests/contracts/fts-observation-coverage.test.ts` (trigger, backfill, scope filter, cap, CB-12 parity). Suite 116/116. Action done.
- [x] Postgres adapter: FTS parity with SQLite — RESOLVED (2026-09-26, L257): `searchFullText` now a sanitized AND-joined `tsquery` over goal_summary + the first 500 characters of the observations, **LEFT JOIN** signatures (INNER-join bug class 2026-09-22 fixed), GIN expression indexes in the migration; tests `tests/contracts/postgres-fts-parity.test.ts` (SQL contract pinned, mocked pg client). Open: a live smoke test at the first activation of EMMS_STORAGE_BACKEND=postgres (see the trigger below). Action done (contract level); live verification tracked.
- [x] Global `testTimeout: 30_000` (vitest.config.ts) can mask performance regressions: ACCEPTED as a risk (2026-09-22, baseline review). Trigger for re-evaluation: the next suite tuning round (per-test timeouts for load/golden, global toward 10s). Accepted observation.
- [x] Guidance (specs/002): bearer token authN RESOLVED (2026-09-24 inventory): GUIDANCE_AUTH_TOKEN + timing-safe authHeader middleware implemented (server.ts, tested in http-transport.test.ts; see the L280 entry). Trigger obsolete.
- [x] index-freshness race with parallel work (2026-09-26, guidance completion gate): CLOSED — process rule anchored in AGENTS.md (section "Guidance MCP Server (Docker deployment)", bullet "Completion gate vs. parallel work"): before complete_workflow no parallel writers on the checkout, worktree isolation as an alternative, meta updates before the final analyze, classify foreign gate failures as out of scope (report_blocker instead of a reindex loop). Backup: AGENTS.md.bak. Action done.
- [ ] L256/257 review follow-ups (independent reviews 2026-09-26, APPROVED 0 HIGH/CRIT): (F1-LOW, final review) an observation with an ORPHAN episode_id (no FK on observations.episode_id) → the trigger inserts 0 FTS rows → count divergence → backfill scan on every init without convergence (no retrieval loss; the service layer creates episodes first) — candidate: FK or a trigger guard. (F2-LOW) SQLite backfill idempotency keyed on (episode_id, content-prefix) — two observations with an identical first 500 characters → counting divergence fts↔observations (no retrieval loss). (F4-LOW) signatures without UNIQUE(episode_id) in both adapters → LEFT-join row multiplication on double signing; DISTINCT/UNIQUE at the next retrieval touch. (F5-INFO) observations_fts has only an insert trigger — with future scope_id mutability the index goes stale (trigger obligation in every scope-update scope). (F6-INFO) Unicode sanitization ([\w\s] is ASCII) — Unicode-only queries return []; in the future \p{L}\p{N} in BOTH adapters together. (MED backfill solved via a count guard; live Postgres smoke test see the trigger above.) Trigger: see the respective remark; F4/F6 at the next retrieval-quality scope. Action required.
- [x] Guidance (specs/002): implement an administrative metrics tool (operation counts/durations/error rates, connection health over time) — FR-059 scope team decision: only logs + status tools in this iteration. Trigger: first production use of guidance or an operations monitoring round. Action required. Source: /speckit-clarify 2026-09-22 (user: "B, but track C for later").

- [ ] Guidance (specs/002) Phase 3 review follow-ups (APPROVE, 0 HIGH/CRIT): F1 completeWorkflow requestId ledger check must move ABOVE status checks (replay-after-completion should return recorded result, not workflow_already_completed) — trigger: next engine-touching scope or Phase 5 wiring. F2 submission_received audit/accept-persist ordering on op failure — same trigger. F3 stale-copy reassignment pattern in submitLocked (partially fixed via targeted mutation) — audit remaining sites next scope. F4 GuidanceErrors thrown past public methods need structured-response shim at MCP dispatch — trigger: Phase 5 tool registration. F6 in-process-only mutex — trigger: any multi-process/CLI scope. F7 requestId replay test still to add — trigger: next engine-touching scope. Action required. Source: Phase 3 review 2026-09-22.

- [x] Guidance (specs/002) Phase 5 review follow-ups RESOLVED (2026-09-24, code+test verification in the container, 197/197 green): (a) capability hash pinning now persists across restarts (`loadCapabilityPins`/`saveCapabilityPins` in stateDir/capability-hashes.json, merge-on-save, corrupt file → re-pin; regression test tests/workflow/capability-pins.test.ts, 5 tests incl. restart semantics — the L264 test gap closed); the write is atomic (tmp+rename). (b) Sanitization seam: `redactUnknown()` deep walk redacts downstream `content` AND `protocolMetadata.structuredContent` before agent-facing use (OperationEngine.ts, test redaction-seams.test.ts). (c) Redaction covers multi-line quotes ([\s\S]*? value alternation, test "previously missed"). Source: Phase 5 review 2026-09-22.

- [x] Guidance (specs/002) Phase 6 review follow-ups (F4/F5, MEDIUM) RESOLVED (2026-09-24, code+test verification, 197/197 green): (F4) Egress content check for restricted servers — `containsSecretPattern` (SECRET_VALUE_PATTERNS: private keys, AWS/GH/OpenAI/Slack keys, JWT) blocks scalar credential values with `data_egress_denied` (PolicyEngine.ts L44-47, test redaction-seams.test.ts "egress content-level secret rejection"). (F5) Raw/normalized exposure paths: protocolMetadata.structuredContent runs through `redactUnknown()` before agent-facing use (OperationEngine.ts L133-144, test "OperationEngine sanitization seam"). Remaining marginal note (accepted): secret value detection deliberately kept narrow (false-positive balance); the egress content check only for restricted — consistent with FR-052. Source: Phase 6 review 2026-09-22.

- [ ] Guidance (specs/002) Phase 7a review follow-ups (NOT APPROVED → H1 fixed; remaining MEDIUM deferred to Phase 7b): snapshot chaining (previousSnapshotId hardwired null, no refresh API); staleness machinery (evaluateCompletionInvariants takes caller-supplied snapshotCurrent — must recompute hashes); SpecKitState persistence of task lifecycle across restarts; PlanChange approve/apply methods (hasPendingPlanChanges currently blocks on permanently-pending changes); applyReconciliation unimplemented (pure diff only); parser dead code (TASK_LINE/ID_TOKEN/hasSection usage, requireFs in ESM); criteria parser only matches bold SC lines; batch cap/phaseGroup edges; maxEntities/maxExcerptBytes/requireUniqueMatch unused. Action required (Phase 7b). Source: Phase 7a review 2026-09-22.

- [ ] Guidance (specs/002) Phase 7b/8/9 review follow-ups (APPROVED, 0 HIGH/CRIT): M1 contracts artifacts store absolute relativePath (relocation breaks staleness falsely conservative); M2 glob relativePath trap; M3 removed-task reconciliation lacks superseded marker/audit + dead `superseded` binding, buildReconciledState has no src caller yet; F4 previousSnapshotOverride dead field (chain not consumed at persist); F5 waiver audit uses plan_change_approved event instead of dedicated spec_kit_criterion_waived; F6 plan-change lifecycle unguarded (approve/reject terminality, markPlanChangeApplied unknown-id TypeError); F7 dead conjunct in coverageSummary; F8 test gaps (contracts artifact, removed-task, terminality, waiver audit fields). Trigger: Phase 7c/next SpecKitEngine maintenance. Action required. Source: Phase 7b/8/9 review 2026-09-22.

- [ ] Guidance (specs/002) Full-codebase review follow-ups: F1 composition root FIXED (8eeba9c), F2 audit redaction FIXED (e0b911d), F3 exposure FIXED (e217ddf), F4 beforeEnter/afterExit FIXED (2054691 + a8a5082 incl. review MEDIUMs: requiredFailed over afterEnter-only, start-path downstream state, status field). Remaining from F4 review (LOW): blocked-start session continues afterEnter ops (asymmetric vs submit early-return — decide: break loop + skip afterEnter, or document); operation_not_configured thrown mid-submit leaves partial state (afterExit variant transitions first, hook never runs); test 1 lacks ordering assertion; test 4 lacks hook_failed-audit + start.operations assertions. Trigger: next lifecycle/engine maintenance scope. Action required (or accepted-observation with rationale). Source: F4 review 2026-09-22.

- [ ] Guidance (specs/002) M2/M3 review follow-ups (both APPROVED, 0 HIGH/CRIT): M2 fixed in 7efaa16 + 2b7bbb2 (requestTimeoutSeconds enforced as transport failure; unhandled-rejection guard; validation finite>0; stub timeout mode + unref). Remaining LOWs: (a) downstream request NOT cancelled on timeout (MCP callTool has no AbortSignal) — retry after timeout may duplicate side effects on non-idempotent tools; revisit if SDK adds signal support; (b) invalid trustLevel fails open to "trusted" without warning log — add warn on unknown values; (c) timeout validation after clientFor: unknown server + invalid timeout reports connection error (cosmetic); (d) requestTimeoutSeconds not yet covered by schema-validator (validate there too). M3 fixed in 6cdc842 (all `as never` removed; toTrustLevel normalizer — eliminates silent no-op egress mode for invalid trustLevel). Trigger: next MCP-SDK upgrade / policy maintenance scope. Source: M2/M3 reviews 2026-09-23.

- [x] Guidance (specs/002) Finding 7 (Option C) follow-ups RESOLVED (2026-09-24 inventory, code verification): (a) withState runs under the per-session mutex `withLock` (register-spec-kit-tools.ts L123-148, lost-update protection also for async handlers); (b) a registration test with exact surface equality incl. duplicate detection exists (L278, commits ab985b9/5c34f3d).

- [x] Guidance (specs/002) Remaining LOW findings RESOLVED (commits ab985b9 + 5c34f3d, review APPROVED 0 HIGH/CRIT): trustLevel warn-once per (serverId,value); requestTimeoutSeconds validated at config load (validateDownstreamServers) + invokeTool-before-clientFor; startWorkflow fail-fast (break + skip afterEnter when blocked, symmetric to submit); Spec-Kit withState under per-session mutex; test 1 audit-ordering assertion; test 4 hook_failed-audit + start.operations assertions; registration test exact-surface equality incl. duplicate detection; withState payload regression test (caught the missing-await '{}' HIGH immediately). Accepted observations (no action): operation_not_configured mid-submit partial state (pre-existing consistent pattern, error contract unchanged); AbortSignal non-cancellation (SDK limit); sessionLocks map entries per session (negligible). Source: LOW-fix round 2026-09-23.

- [x] Guidance (specs/002) HTTP operation implemented (c5495b2 + review fix e0b4d6d, APPROVED): streamable HTTP stateless at POST /mcp, GET/DELETE 405; GUIDANCE_AUTH_TOKEN bearer (timing-safe, 401); GUIDANCE_BIND_HOST explicit opt-in for containers (the FR-027 default loopback fail-closed remains); GUIDANCE_WORKSPACE_ROOT; Dockerfile/compose following the clear-thought/insight pattern (node:22-alpine, healthcheck, non-root, /workspace volume, 3003). Review HIGHs closed immediately: (1) client workspaceRoot containment (resolve+prefix, regression test + container verification), (2) composition hoisted (SessionRepository locks intact). Remaining LOWs accepted/tracked: npm install without a lockfile in the Dockerfile (workspaces hoist the lockfile into the repo root — supply-chain note), /health open (deliberate, no sensitive data), bind-host test only at unit level. Trigger: HTTP/deployment maintenance. Source: HTTP review 2026-09-23.

- [x] Insight (EMMS) Dockerfile LOW (npm install without a lockfile, supply chain) RESOLVED: a server-local package-lock.json committed (force-add, the root .gitignore ignores package-lock.json globally — precedent server-clear-thought), the Dockerfile switched to npm ci; Docker build + container health verified (dd065b4).
- [x] HTTP transport migration clear-thought+insight (bc5326c, dd065b4, 1caa690) review HIGHs RESOLVED: (1) the root docker-compose.yml now sets CLEAR_THOUGHT_BIND_HOST/EMMS_BIND_HOST=0.0.0.0, (2) an idle session reaper (TTL 60min, sweep 5min, unref'd) + MAX_SESSIONS=500 LRU eviction bounds session growth. Tests 152+99 green, container E2E re-verified.
- [ ] Accepted observations from review 1caa690: (a) RESOLVED (batch B: malformed JSON → 400/-32700), (b) RESOLVED (batch B: CB-3 early reject, c416bba), (c) Smithery remnants: build:smithery/deploy scripts + smithery.yaml in FOUR servers (incl. guidance!) — cluster 3 of the inventory plan, trigger: Smithery decision + discovery check (build path without @smithery/sdk). (INFO).
- [x] Guidance (EMMS template) Dockerfile LOW (npm install without a lockfile) RESOLVED (632b31e): a server-local package-lock.json force-added, the Dockerfile switched to npm ci + COPY package*.json; Docker build + health + MCP initialize (200) verified against a mounted example workspace. All three servers are thereby deterministic.

## Tracked Follow-ups (2026-09-23, setup_clearthought)

- [x] DONE. (develop 024ddf4) Test marker-pair uniqueness in the compact
      output (doc.split(START).length-1 === 1). Trigger: every future
      template change on setup-clearthought-templates.ts. [Review a5c5c98 #2]
- [x] DONE. (develop 024ddf4) Test escalation (isError) via the utility
      toolset dispatcher. Trigger: the next change to toolsets/registry.ts or
      the loop guard. [Review 44063c6 #4]
- [x] Accepted observation: section:'recipes' without a guard (static,
      ~2-3KB) - only add a rate limit if spam is observed.

## Post-Implementation-Review Trigger: Remote-Mode (Amendment 001)

Findings are in specs/002-guidance-workflow-server/amendments/
001-remote-mode-review-findings.md (2 MEDIUM, 6 LOW). The implementation is
running in parallel in a separate chat. Trigger: as soon as the remote-mode
implementation is merged/committed, the post-implementation review MUST check
every line of the findings file against the code ([x] + code reference)
before the scope is closed. In particular M1 (init_session idempotency vs.
multi-session) and M2 (401 vs. session_not_found channel separation) are
merge-blocker candidates.

- [ ] Guidance remote mode (spec amendment 001) — implemented on feature/remote-mode-session-binding (7327349 + review fixes 877d89e, 2 CRITICAL + 2 HIGH fixed, ClientOpEngine wiring, TTL, list_sessions restriction, path protection). Tracked remaining follow-ups: (a) M2 restart persistence — idempotency/per-key limit/workflowToRemote are cache-only; after a container restart init_session duplicates and workflow sids lose their binding (meta.json should carry the canonical + a key→sessions index); (b) M3 — the per-key limit counts only the cache and has an off-by-one (check before insert); anonymous sharing can exhaust the global budget; the error code should be quota-domain; (c) M4 — the init_session rate limit 20/min (Q4 decision) NOT yet implemented; (d) MCP downstream ops in remote mode run as awaiting_client (documented v1 limitation — re-spec downstream support); (e) client reports = trust anchor (FR-104.5) — no integrity check possible. Tests: 155 green incl. FR-104 gate flow E2E. Trigger: remote-mode production adoption. Source: remote-mode review 2026-09-23.
- [x] Remote-mode hardening implemented (feature/remote-mode-hardening, fb0a350 + a69b699 + c22585a, review APPROVED 0 HIGH/CRIT): M2 restart persistence (canonicalHash in meta.json, index rebuild), M3 (disk count, >=-boundary, quota_exceeded), M4 (rate limit 20/min per IP, 429), N1 (quota rollback on invalid config + orphan cleanup), dbg logs removed. 160/160 tests. Merged to develop (FF).
- [x] Fix review 877d89e (2nd round, APPROVED, 0 HIGH/CRIT): C1/C2/H1/H2 genuinely verified. New findings F1-F3 fixed immediately (9aa944e): F1 the retry phase derived from result.currentPhase (hard review phase mismatch); F2 path protection genuinely separator-aware; F3 gcg-dbg removed. F4 (lastAttempt also set on submission_invalid — harmless) documented. Merge to develop approved (the remaining follow-ups above stay tracked).

## Tracked Follow-ups (2026-09-24, Full-Codebase Review develop 2d580fa)

Source: review evidence protocol pass; snapshot develop@2d580fa (clean, ahead 4). Tests not executable in the session (Node toolchain missing) — CI authoritative. 0 HIGH/CRITICAL open. CB-1 pre-existing (identical in origin/develop), the CB-2 gap only became relevant with the c22585a rollback.

- [x] CB-1 MEDIUM Guidance RESOLVED (2026-09-24 verified): `remote-session-manager.ts` `resolve()` now calls `this.touch(effectiveId)` (with the comment "CB-1-Fix", ~L298) in both paths (cache + restore-from-disk). TTL check/lastAccessAt refresh intact.
- [x] CB-2 MEDIUM Guidance RESOLVED (2026-09-24 verified): initSession performs the file writes (configFiles) INSIDE the rollback try (comment "CB-2-Fix", ~L196) — the quota slot + orphan directory are released on invalid content/path escape/fs error.
- [x] CB-3 MEDIUM (re-evaluation of the accepted LOW from L284b, RESOLVED c416bba): insight + clear-thought POST /mcp early reject — without a known session id only real initialize requests create a server+transport; garbage/batch/non-initialize → 400/-32600. Additionally 1caa690(a) covered: malformed JSON → 400/-32700 instead of 500. Tests: http-transport.test.ts per server (4 tests).
- [x] CB-4 MEDIUM Deployment (RESOLVED a17be38, Option B): the root compose binds 3000+3002 to 127.0.0.1 — no more LAN access to the unauthenticated endpoints. Option A (auth) remains future work for remote access.
- [x] CB-5 LOW (RESOLVED b2aa1bc): stochastic `app.listen(PORT, HOST)` with the `STOCHASTIC_BIND_HOST` pattern (loopback default like the other servers); the Dockerfile sets ENV 0.0.0.0 for port mapping. npm deprecate per user decision NO.
- [x] CB-6 LOW (RESOLVED 04c6b13): `publish:insight`/`npm:publish:insight` now point to `servers/server-insight`.
- [x] CB-7 LOW (RESOLVED 10d0c3f): `emms-store.db-wal` removed from the index (the file stays local); the `.gitignore` entry applies from now on.
- [x] CB-8 LOW (RESOLVED 66d3d8a): the guidance POST handler rejects batch/array bodies with 400/-32600 BEFORE the pre-checks (defense in depth; the SDK still discards batches before dispatch).
- [x] CB-9 LOW RESOLVED (2026-09-24 verified): no more `[dbg]` occurrences in server-guidance/src (grep 0 hits).
- [x] CB-10 LOW (RESOLVED 66d3d8a): initSession writes meta.json ONCE including canonicalHash — the crash window without an M2 rebuild key closed.
- [x] CB-11 LOW (RESOLVED c416bba): `pathFor()` validates `^[a-f0-9]{64}$` before `join()`; `read()` resolves the path BEFORE the read-miss catch so that the malformed error is not swallowed. Test: traversal/malformed/non-hex-64 → ARTIFACT_REJECTED "Malformed artifact hash".
- [x] CB-12 LOW (RESOLVED c416bba): verified AND fixed — bare operators (NOT/AND/OR/NEAR) survived the sanitization and threw raw FTS5 syntax errors. Fix: tokens are quoted as FTS5 string literals (after sanitization only \w characters remain → unambiguous). Test: searchFullText('NOT'|'AND OR NEAR'|'install not dependencies') → [].
- [x] CB-13 LOW (RESOLVED 04c6b13): README duplicate removed; root `engines.node` raised to `>=20` (align with the servers + README; yarn immutable check green).
- [x] L305(a) restart persistence (RESOLVED 7dbfa92): workflowToRemote bindings + ClientOpLedger + lastAttempt survive restarts via state.json per session (formatVersion 2, written on registration/reports/submits, rebuilt at boot alongside the canonicalIndex). v1 sessions without state.json migrate tolerantly. Tests: restart between start_workflow and a follow-up tool + v1 tolerance (164/164, tsc, yarn build green). REMAINDER: L305(d) awaiting_client downstream spec (optional for production adoption) + FR-104.5 (accepted).
- [ ] R-1..R-3 LOW (post-commit review 7dbfa92, APPROVED 0 HIGH/CRIT — accepted observations with option): (R-1) registerWorkflowSession persists only on a cached session — implicit contract "always after resolve"; make it hard (minimal state also uncached OR throw) at the next touch of the file. (R-2) crash window ≤1 event between the in-memory mutation and persistSessionState (same risk as the existing meta writes — documented accepted). (R-3) ledgerReports unbounded + full rewrite per persist (O(n)) — cap or incremental append if growth is observed. Trigger: next change to remote-session-manager.ts / remote-tools.ts. Accepted observations with rationale.

## Tracked Follow-ups (2026-09-26, Lock Hardening R-011/R-012/R-010 — RESOLVED)

Feature branch feature/guidance-lock-hardening, suite 279/279 + tsc green (container).

- [x] R-011 MEDIUM (steal TOCTOU) RESOLVED: new class WorkspaceOpLock (src/workflow/workspace-lock.ts) — acquire via link() (atomic create-if-absent, double-hold constructively excluded), steal via rename() into quarantine with verify+restore (link back / deferral). Multi-process race test (6 processes on a dead lock → exactly 1 holder, 5 contention, no residues) tests/workflow/workspace-lock.race.test.ts.
- [x] R-012a LOW RESOLVED: TTL = max(120s, 2× the longest configured op timeout) — a live holder can principally not exceed the TTL (an invariant instead of an assumption); PID liveness is additionally checked before the TTL.
- [x] R-012b LOW RESOLVED: a non-EEXIST error on lock create → its own error code workspace_lock_unavailable (recoverable), no more contention obfuscation.
- [x] R-012c LOW RESOLVED: test coverage added (do not steal a live owner, dead-PID steal, multi-process race); the EACCES path covered via code differentiation (implicitly).
- [x] R-010 LOW RESOLVED: tests/contract/error-codes.test.ts with an exact ERROR_CODES snapshot (equality), duplicate check, isErrorCode roundtrip.

## Tracked Follow-ups (2026-09-26, Feature 005 Production Hardening — Tracks RESOLVED)

Branch feature/production-hardening. Suite 302/302 + tsc + build green (container).

- [x] PLAN-CLEANUP RESOLVED (T001): stale entries [x], duplicates identified, hygiene rule in systemPatterns.md.
- [x] L260/FR-059 RESOLVED (T003–T005): get_metrics + MetricsRepository (JSONL stateDir/metrics.jsonl, replay) + hooks in WorkflowEngine/ClientManager.
- [x] FR-104.5 RESOLVED (T006–T007): one-time opToken binding (client_report_invalid on mismatch/replay), burn-on-accept, persistence of the pending tokens. Residual LOW: the HMAC variant deferred (the transport is already key-authenticated) — documented.
- [x] TRACK-Venv-C RESOLVED (T008): UV_PROJECT_ENVIRONMENT + named-volume example (compose/Dockerfile comments, README) + E2E relocated venv.
- [x] TRACK-NS RESOLVED (T002): specs/003 → FR-301…315/SC-301…305 + alias table (SC-403 grep clean).
- [x] TRACK-Scaffold RESOLVED (T009): pyproject.toml detection generates a uv op set, tests for both variants.
- [ ] R-006-Residual LOW (stays tracked): the SIGKILL escalation is not directly observed by any test (only SIGTERM settle); pid-liveness assertions missing. Trigger: next executor touch.
- [ ] R-008a LOW (stays tracked): lock global per stateDir instead of per workspaceRoot.
- [x] Tracking-NS remainder DONE.: a convention note exists in systemPatterns.md (FR namespace convention, feature 005). Document "new feature specs number FR-4xx/5xx+ sequentially" in systemPatterns.md. Trigger: next new feature spec. Action required (small).

## Tracked Follow-ups (2026-09-26, Feature 004 Async Execution — R-006/FR-110 RESOLVED)

Branch feature/async-operation-execution (0c01c01 spec, d606ee2 docs, 8a8abc0 impl). Suite 290/290 + tsc + build green (container).

- [x] R-006 RESOLVED: OperationEngine executes process ops async (spawn, SIGTERM→SIGKILL escalation, AbortSignal); real cross-session-contention, cancel-kill, denial and SC-004-secret E2Es in python-toolchain.e2e.test.ts. Additionally: the stderr of failing ops is now redacted (previous redaction gap, SC-004 seam).
- [x] FR-110 hard kill RESOLVED: cancel_workflow/timeout aborts active executions (AbortController registry per session; SIGTERM→SIGKILL after a 5s grace), lock released, result discarded/audited as cancelled. The cooperative limitation is thereby obsolete (README/docs updated).
- [ ] Residual LOW (documented): stdout/stderr interleaving may differ minimally sync→async (the tests assert the result shape, not byte order); SIGKILL semantics authoritative only in the container (Windows dev excluded).

## Tracked Follow-ups (2026-09-26, Amendment 003 + Number Collision)

- [x] Amendment 003 "Final-Review Evidence Gate" IMPLEMENTED (2026-09-26, draft Q1–Q3 defaults approved by the user): scripts/check-final-review.mjs (strict schema, HEAD comparison without a git binary, computed openHighCritical), gate op in scaffold + examples/default + examples/python + root .guidance (complete.beforeExit, required), 6 contract tests. Suite 274/274 + tsc + build green. Open: amendment status Draft → set to APPROVED after feedback; the number collision follow-up below remains.
- [x] FR number collision RESOLVED (feature 005 T002): specs/003 → FR-301…315 + alias table; convention in systemPatterns.md.
- [x] responses.json complete instruction extended with a reference to the amendment-003 gate (2026-09-26, together with the implementation).
- [x] Amendment status update DONE. (2026-09-26): 003 set to APPROVED (user approval; gates verified in production).

## Tracked Follow-ups (2026-09-26, Final Overall Review 16c6f1e..ec924f6)

Source: fresh final-reviewer subagent over the full session diff incl. review-fix commits. Result: 0 HIGH/CRITICAL; suite 268/268 + tsc + build reproduced in the container. Denial audit (R-005) and the README fix (R-009) confirmed cleanly closed.

- [x] R-011 MEDIUM: stale-lock steal has a TOCTOU window in multi-process operation — two processes can simultaneously read the same stale lock, unlink it and each create their own new lock → both hold the lock (the FR-109 invariant violated only for ≥2 processes on a shared stateDir; single process protected by the in-memory guard). Fix direction: atomic steal via renameSync or PID content verification after acquire. Trigger: multi-process/multi-container operation on a shared stateDir or the next lock touch. Action required.
- [x] R-012a LOW: TTL steal (30 min) checks no PID liveness — a live lock with timeoutSeconds > 1800 could be stolen mid-run; the invariant is not enforced via config validation. Trigger: op configs with timeoutSeconds > TTL. Action required (extend the TTL check with liveness or validation).
- [x] R-012b LOW: EACCES on lock acquire differentiates only the message, not the error code/recoverable — permission problems remain classified as contention code-wise. Trigger: next lock touch (with R-011). Action required.
- [x] R-012c LOW: new steal logic incompletely tested (only the dead-PID path); missing: do-not-steal-live-owner, the TTL path, EACCES, concurrent steal. Trigger: next lock touch (with R-011). Action required.
- [x] R-013 INFO: `operation_invocation_denied` missing as an audit event type in specs/003 data-model.md (only `operation_invoked` defined; the implementation uses a freeform eventType + redaction hook). Trigger: next data-model change of the spec. Action required (docs follow-up).

## Tracked Follow-ups (2026-09-26, Post-Commit Review Feature 003, Reviewer Subagent)

Source: independent review over 77fa854+a457329 (268/268 green). R-004 (HIGH, stale-lock recovery), R-005 (denial audit), R-008a-c (EACCES differentiation, release guard) FIXED IMMEDIATELY in the review-fix commit; R-009 (README approval claim) corrected.

- [x] R-006-Residual RESOLVED (feature 006 T004): escalation test (SIGTERM-deaf → SIGKILL after grace, timed_out <15s) + ps-marker liveness after cancel (SC-501).
- [x] R-008a RESOLVED (feature 006 T003): WorkspaceOpLock per workspaceRoot (sha256-16hex suffix, workspace-lock.ts workspaceLockFile), SC-503 parallelism test; residue: lock key without realpathSync (L-4 LOW, tracked at the next lock touch).
- [x] R-010 LOW: the ERROR_CODES array has no exact equality test (only behavioral coverage of the new codes). Trigger: next errors.ts change. Action required.
- [x] R-011 MEDIUM (final review ec924f6, 2026-09-26): stale-lock steal TOCTOU — unlink+recreate in acquireWorkspaceOpLock is not atomic; two processes simultaneously stealing the same stale lock can delete each other's freshly created lock → both hold (mutex violated). Also: the check-read-old-PID + probe-after-release can steal the live lock of a third-party acquirer started in between. Precondition: ≥2 processes on a shared stateDir (single-process deployment not affected — the in-process guard applies). Fix direction: atomic rename steal (renameSync lock→lock.<pid>, then recreate with wx) or lock verification after acquire (content == own PID). Trigger: multi-process/multi-container operation or the next lock touch. Action required.
- [x] R-012 LOW (final review ec924f6): (a) TTL steal (30 min) ignores liveness — an invocable op with timeoutSeconds > 1800 loses its live lock mid-run; no config constraint couples timeoutSeconds ≤ TTL (pilot ops ≤ 900 consistent, but the invariant unenforced). (b) Non-EEXIST errors (EACCES) still carry the code operation_in_progress/recoverable — the message differentiated, the code not. (c) Test gaps of the NEW code: only dead-PID steal tested; TTL steal, do-NOT-steal-live-owner, the EACCES path, concurrent steal untested. Trigger: like R-011. Action required.
- [x] R-007 (T013 prematurely marked [x] before merge/memory bank): updated with this commit cycle — merge to develop + activeContext/progress follow in this closeout.

## Tracked Follow-ups (2026-09-24, Feature 003 Toolchain Bootstrap)

- [ ] Scaffold language detection: `scaffold.ts` generates npm-flavored default operations; with `pyproject.toml` in the workspace a Python variant should be generated in the future. Trigger: next scaffold change or a second language pilot. Action required (enhancement).
- [ ] Named-volume venv persistence (Option C): persist venvs outside the workspace mount to eliminate host incompatibility (Linux binaries on a Windows mount). Trigger: observed host venv confusion or multi-workspace operation. Action required (enhancement).
- [x] FR-110 hard kill: `run_operation` aborts cooperatively (result discard + timeout SIGTERM); a hard kill mid-run requires async spawn instead of spawnSync in OperationEngine. Trigger: the next OperationEngine architecture change. Action required (documented limitation, README section "Verification in other languages").

## Tracked Follow-ups (2026-09-26, Post-Commit Review 77fa854+a457329, independent review)

- [x] R-004 HIGH — stale workspace lock without recovery: a crash of the guidance process during run_operation leaves behind `stateDir/workspace-ops.lock`; afterwards `openSync(file,"wx")` fails permanently → all sessions get `operation_in_progress` (falsely recoverable:true), manual deletion needed. No PID/TTL/liveness check. Repro: create the lock file manually → run_operation. WorkflowEngine.ts acquireWorkspaceOpLock (~L497ff). Trigger: next change to run_operation/WorkflowEngine or before production adoption. Action required.
- [x] R-005 MEDIUM — SC-002 audit on denial missing: agent_invocation_denied/operation_not_configured/operation_in_progress generate no audit event (only "no executions event" is tested, tools-run-operation.test.ts L89-96); SC-002 demands "audit event recorded". Clarify: a denial audit event (e.g. status "denied") or a spec clarification. Trigger: next audit/run_operation change. Action required.
- [x] R-006 MEDIUM — E2E/task coverage over tasks.md T008 over-marked: FR-109 cross-session contention and SC-004 (secret in pytest output) are missing in python-toolchain.e2e.test.ts (only unit level, node echo instead of pytest); the E2E test "SC-002" (L121-126) checks operation_not_configured, not invocableByAgent denial. The commit message "E2E covers SC-001..004" exaggerated. Trigger: next E2E expansion. Action required.
- [x] R-007 MEDIUM — T013 checkbox [x] without proof of fulfillment: branch not merged to develop (HEAD a457329 on the feature branch), memory-bank/activeContext.md + progress.md not updated in either commit. Trigger: merge preparation. Action required.
- [x] R-008 LOW (inactive-session audit + lock comment + global-lock docs done via 8fa8125; R-008a global lock remains separately open) — inactive-session path without audit: runOperation returns {status:"failed"} for session.status!=='active' without an operation_invoked event (audit gap); the releaseWorkspaceOpLock comment about "wx + same process" is wrong (wx fails on an existing file regardless of the creator); the lock is global per stateDir, not per workspaceRoot (FR-109 wording "workspace-level"). Trigger: like R-004. Accepted observation / handle together with the R-004 fix.
- [x] R-009 LOW/INFO — the README claim "toolchain-sync ... can be made approval-gated via policies.json" unverified: PolicyEngine.requiresApproval covers only destructive/credential_sensitive, not workspace_write; a terminal outage prevented the final verification of the call sites. Trigger: next policy/README change. Verify and correct the README if needed.

## Tracked Follow-ups (2026-09-24, Security/Policy Verification + Remaining Fixes)

- [x] Capability pin residual LOW (test gap + non-atomic write) RESOLVED:
      saveCapabilityPins writes atomically (tmp+rename, WorkflowEngine.ts),
      the persistence helper exported; new regression test
      tests/workflow/capability-pins.test.ts (roundtrip, merge, drift
      overwrite, corrupt file, no .tmp residue). Suite 197/197 green, tsc
      clean. Verification context: no Node on the host PATH — tests in the
      container (node:22-alpine, repo copy + @rollup/rollup-linux-x64-musl,
      the known docker-native bindings trap, no host change).

## Inventory of Existing Follow-ups (2026-09-24, Phase 0.1)

Code verification of all open lines. Results:

- CLOSED (de facto done, marked [x] above): bearer authN (L259),
  Docker deploy (L254), Finding-7-LOWs (L276 a+b), 1caa690 (a)+(b) (L284),
  L274 (b)+(d) (trustLevel-warn + timeout validation, as reported in L278).
- CONFIRMED OPEN: L305(a) workflowToRemote/ledger cache-only (cluster 1a,
  a production-adoption blocker; importArtifacts hard-sets previousSnapshotId
  to null — snapshot chaining open); L305(d) awaiting_client (spec needed);
  Phase 6 egress checks check only structure, not content (PolicyEngine
  evaluateEgress) → L266 open; Phase 5/7a/7b items (L264/L268/L270)
  unchanged open; metrics tool (L260); ~~FTS coverage (L256)~~ RESOLVED
  2026-09-26; ~~Postgres parity (L257)~~ RESOLVED 2026-09-26 (live smoke
  test open); Smithery remnants now in FOUR servers (L284c → cluster 3).
- L253 (prompt copy sync): CLOSED AS OBSOLETE (2026-09-26, user decision —
  distribution via package/Smithery, no copies needed).
- The phase-3 line (L262) marked STALE: several items covered by
  L272/278 — remaining verification in package 2b (state machines).
  Sequence confirmed: 2d→2e→2c→2a→2b trigger-free; cluster 1a after
  the production-adoption decision; cluster 3 after Smithery discovery.

## Cluster 2a (RESOLVED 27df359, 2026-09-24; review APPROVED 0 HIGH/CRIT)

- [ ] R-11..R-14 LOW/INFO (post-commit review 27df359 — accepted observations): (R-11) the snapshot chain grows unboundedly (a refresh without drift still creates a snapshot + dir) — a retention cap (e.g. max 20) or skip-if-!stale at the next touch. (R-12) a blocking refresh keeps the active batches/plan changes of the old state on invalid marking (deliberate — preserve work; the invariants apply). (R-13) tool schema without snapshotCurrent: old clients compatible (zod strips). (R-14) 2b MUST use importArtifacts(feature, previous) when wiring buildReconciledState, otherwise states without a chain. Trigger: next Spec-Kit engine change or 2b.
- [x] Snapshot chaining (Phase 7a M4): importArtifacts(feature, previous?)
      chains snapshots (previousSnapshotId) and preserves the history; a
      refresh's blocking fail path no longer overwrites the chain
      (previously: history wipe) but only marks invalid. refresh_spec_kit
      passes the previous state through.
- [x] Staleness machinery (Phase 7a M4): evaluateCompletionInvariants
      computes snapshotCurrent internally (hash comparison via
      isSnapshotStale) instead of trusting the caller-supplied flag; the
      tool schema (snapshotCurrent removed) + tests adjusted.
- [x] previousSnapshotOverride dead field removed — chaining is now
      consumed at import. 5 new tests (snapshot-chain.test.ts).
      181/181 + tsc + build green.

## Cluster 2c (RESOLVED 9bcc6c6, 2026-09-24; review APPROVED 0 HIGH/CRIT)

- [ ] R-6..R-8 LOW/INFO (post-commit review 9bcc6c6 — accepted observations): (R-6) the downstream error message paths (tool_reported/transport) carry messages unredacted through errors[] — redact at the next touch of OperationEngine. (R-7) secret value patterns without a word boundary → possible false-positive blocks in restricted mode (fail-closed, accepted); boundary refinement optional. (R-8) redactUnknown assumes acyclic (JSON-derived) structures — document in the docstring. Trigger: next change to OperationEngine/redaction.ts. Accepted observations with rationale.
- [x] Egress content checks (Phase 6 MEDIUM): evaluateEgress (restricted/
      validated_inputs_only) discards scalar args with high-confidence
      credential values (private keys, AKIA/ghp_/github_pat_/sk-/JWT/xox
      patterns) via data_egress_denied. Trusted/privileged remain structural
      (documented).
- [x] protocolMetadata reddening (Phase 6 MEDIUM): mcpTool results run
      through redactUnknown — content AND structuredContent are redacted
      before the agent-facing return (previously verbatim).
- [x] Multi-line redaction (Phase 5 LOW): the value alternation now
      matches multi-line quoted values ([\\s\\S]*?, non-greedy).
- [x] Sanitization seam: redactUnknown (deep walk + key-based redaction) in
      redaction.ts as a documented extension point; 7 new tests
      (tests/policy/redaction-seams.test.ts). 176/176 + tsc + build green.
      Known residual weakness: the default patterns do not match snake_case
      keys (api_token) (\\b boundary) — an enhancement candidate.

## Cluster 2b (RESOLVED 29b22c2 + review fixes f8d91b6, 2026-09-24; review APPROVED 0 HIGH/CRIT)

- [x] R-15 MEDIUM (found in review + fixed IMMEDIATELY f8d91b6): superseded
      tasks keep required=false (they blocked required_tasks_incomplete
      forever); test: the violation set identical with/without the
      superseded task.
- [x] R-16 LOW (fixed f8d91b6): buildReconciledState merges
      previous.planChanges — open changes survive the refresh.
- [x] R-17 LOW (documented + test): a re-decision before apply
      (approved→rejected) is intended; terminal after apply (F6 guard).
- [x] R-18 INFO: remote approve/apply is subject to the FR-104.5
      session trust model (consistent with all tools).
- [x] R-19 INFO: migration — changes stuck in status
      artifact_update_required under old code need a re-approve after the
      upgrade (sets "approved"), then apply.
- [x] F6: the plan change lifecycle guarded — approve/reject terminal,
      apply only after approval, unknown ids throw GuidanceError; approved
      changes now carry the status "approved" (instead of reusing
      artifact_update_required). The refresh test adjusted to the
      corrected flow.
- [x] F5: waiveCriterion emits spec_kit_criterion_waived.
- [x] M3: removed unfinished tasks are retained as cancelled +
      spec_kit_task_superseded audit; the dead superseded debris removed.
- [x] M1: contracts artifacts store relative paths (relocation no longer
      breaks staleness — test: move to a new root → not stale).
- [x] 7a M applyReconciliation: refresh_spec_kit_artifacts applies
      buildReconciledState — task progress survives a refresh.
- [x] 2 new tools: approve_plan_change + apply_plan_change (were
      engine-only, never reachable remotely — the permanent-pending gap
      closed); SPEC_KIT_TOOL_NAMES + the registration test updated.
- [x] Inventory finding: "SpecKitState persistence across restarts" (7a)
      was already implemented (SpecKitStateStore, disk-backed, atomic
      tmp+rename) — a stale entry, no action.
      189/189 tests + tsc + yarn build green. Still open in the inventory:
      only cluster 3 (Smithery decision + discovery), 1b (downstream
      spec), CB-4-Option-A, L253/256/257 (small items) + INFO positions.

## Cluster 2e (RESOLVED ffdf393, 2026-09-24)

- [x] Capability hashes across restarts: capability-hashes.json in the
      stateDir (merge-on-save, tolerant load); drift after a restart is now
      DETECTED (downstream_capability_changed) instead of silently
      re-pinned — an intentional behavior change.
- [x] F8 waiver audit: the audit entry now carries approvedBy + at (the
      dedicated event type spec_kit_criterion_waived remains F5/2b).
- [x] F8 test gaps closed (f8-gaps.test.ts, 4 tests): contracts
      artifacts (hash, content deliberately not kept in state — documented
      in importArtifacts), removed-task reconciliation (removed flagged,
      completed retained), the plan-change terminality flow,
      waiver audit fields. 169/169 + tsc + build green.

## Cluster 2d (RESOLVED 18b27cf, 2026-09-24)

- [x] Parser dead code: TASK_LINE/ID_TOKEN removed; hasSection (an export
      without a single call) removed; the dead duplicate import readdirSync +
      readdirRecursive2 debris at the end of the file removed.
- [x] Latent ESM crash: readdirSyncSafe used require("node:fs") —
      a ReferenceError as soon as the candidate discovery (mostRecentlyModified/
      singleCandidate strategies) runs. Now a static readdirSync import.
- [x] Criteria parsing bold-only (parseTasks AND parseCriteria): now also
      the plain list form (- AC-002: …), mirrored from the requirements
      pattern. Regression test in parser.test.ts.
- [x] F7: the dead `&& state.tasks` conjunct removed from coverageSummary.
- [x] requireUniqueMatch/maxEntities/maxExcerptBytes: documented as
      "reserved" in the interface (enforcement would silently drop
      criteria = coverage corruption — belongs with validation warnings in
      2c/2a); previousSnapshotOverride documented as "reserved for 2a
      snapshot chaining" (not removed — 2a consumes it).
- INFO (accepted, no action): the root tsconfig covers only 2/4 servers;
      mixed package managers (yarn@4 root + server-local npm lockfiles) is
      intentional (Docker/publish determinism); ClientOpLedger only per
      operationId (v1 docs, FR-104.5 trust model); cache-only
      workflowToRemote/ledger/lastAttempt already tracked in the
      remote-mode follow-up (a) at L305.
- [x] CB-14 HIGH candidate (discovered 2026-09-24, RESOLVED 3fb48ba):
      yarn.lock regenerated to Yarn Berry format (v8) with yarn 4.6.0
      (+ the package.json normalization of the servers committed). CI
      parity verified: `yarn install --immutable` (exit 0, no changes),
      `yarn build` + `yarn test` green across all 4 workspaces
      (166+162+105[4 skipped=embeddings]+43).
- [x] CB-15 LOW (discovered 2026-09-24, RESOLVED 373ade5): `develop` added
      to the push branches in test.yml — develop pushes now trigger CI
      directly.

## Cluster 3 — Smithery (DECISION A taken, IMPLEMENTED d566d94, 2026-09-24)

Discovery findings (before the decision):

- clear-thought: smithery.yaml = only `runtime: typescript` (legacy
  auto-build, no startCommand); @smithery/sdk long removed; stdio entry
  present (dist/dev.js, bin-invocation.test.ts); publishing historically
  via scripts/publish-smithery.mjs (API), the `deploy` script dead
  (v4 CLI, RB-7).
- insight: same (yaml only the runtime line, no SDK, stdio entry present).
- stochasticthinking: COMPLETE Smithery integration (yaml with Dockerfile
  build + stdio startCommand, @smithery/sdk in the code, release b6e38872
  on Smithery; RB-8: stdio/MCPB = install-only) — left untouched.
- guidance: never Smithery-published, clean.
  Implementation (Option A):
- [x] clear-thought/insight: smithery.yaml modernized to a real stdio
      startCommand (dist/dev.js; insight maps an optional storagePath →
      EMMS_STORAGE_PATH).
- [x] Dead deploy scripts (v4 CLI) removed in all three servers;
      clear-thought build:smithery removed together with the SDK removal;
      stochastic build:smithery (live) untouched. publish-smithery.mjs
      remains the publishing tool.
- The next Smithery publish checks the new yamls in practice
  (compare the rescan score against the RB-10 history).

## Decisions (user, 2026-09-24) + new packages

1. Smithery: NOT "leave dead" — active maintenance (Option A already
   implemented).
2. CB-4 Option A: YES — insight becomes remotely usable → EMMS_AUTH_TOKEN.
3. 1b downstream spec: YES — remote mode will be extended with downstream
   MCP support.

- [x] CB-20 MEDIUM (decision 2, RESOLVED 3c4f36f): EMMS_AUTH_TOKEN
      implemented (timing-safe bearer on /mcp POST/GET/DELETE; unset =
      open, the loopback default remains the basic protection; /health
      open; compose passthrough + README docs).
      Test: 401 without/wrong, 200 correct, /health 200. 106/106 + tsc +
      build green. Position closed — insight is remote-capable (set the
      token + adjust EMMS_BIND_HOST if needed).
- [ ] CB-21 MEDIUM (decision 3): remote mode downstream support — (1) a
      spec amendment to specs/002 (downstream ops instead of
      awaiting_client; clarify the interaction with FR-104.5/trust),
      (2) implementation in the OperationEngine stack.
      Effort: spec ½ day, dev separately. Trigger: the next remote-mode
      scope.
- [ ] CB-22 LOW (decision 1, active maintenance): at the next release
      publish via publish-smithery.mjs (validates the new stdio yamls
      practically) + document the rescan score against the RB-10 history
      (96/100) here.
      Trigger: next release.

## Review d566d94 (Smithery Option A, 2026-09-24; APPROVED 0 HIGH/CRIT)

- [ ] R-20/R-21 INFO/LOW: YAML parser validation not possible locally —
      practical validation at the next publish (CB-22). R-21: clear-thought
      exposes an empty configSchema (properties: {}) — a rescan could lose
      Config-UX points (historically 25/25); optionally expose a debug
      flag. Evaluation together with the CB-22 rescan. Trigger: next
      release/publish.

## Tracked Follow-ups (2026-09-27, Feature 007 Remote Downstream Execution — LOW Remainders RESOLVED)

Branch feature/remote-downstream-execution. Suite 312/312 + tsc + build green (container).

- [x] F3 RESOLVED (FR-704): recordConnection after every downstream invoke (status + lastSuccessfulRequestAt); ConnectionSnapshot extended; get_metrics merges live + persisted.
- [x] F5 RESOLVED (wording): spec-005 FR-404 names an opaque token; HMAC dropped (the transport is key-authenticated) — optional hardening tracked.
- [x] F7 RESOLVED by design: FR-501 (check/burn separated + persisted report token) + the SC-502 test cover the crash window; the plan entry references it.
- [x] L-2 RESOLVED: ps/escalation tests polling-based (≤5s), escalation lower bound 5.5s.
- [x] L-4 RESOLVED: lock key via realpathSync (fallback resolve).
- [x] L-5 RESOLVED: workspaceLocks cap 64 with eviction of the oldest unheld entry.
- [ ] Residual LOW: the SIGKILL observation happens indirectly (SIGTERM-deaf child + time window) — a direct pid assertion in the escalation test is possible. Trigger: next executor touch.

## Tracked Follow-ups (2026-09-26, Feature 005 Final Review — Remainders)

Final review (fresh subagent 35f63807) over f300cf9..98c4d62: 1 HIGH (F1 metrics.jsonl exponential growth through replay re-persist) — FIXED (replaying flag) + a replay-size regression test; F2 SC-401 integration test supplied; F6 catch recording; F9 defensive copies. 0 HIGH/CRITICAL open after fixes (304/304 + tsc green).

- [x] F3 RESOLVED (feature 007, d19fdc4/9434e54): recordConnection after every downstream invoke; ConnectionSnapshot.lastSuccessfulRequestAt + the live-merge fix (L1 in the 007 final review).
- [x] F5 RESOLVED (feature 007 final review M1, 9434e54): the FR-404 wording in specs/005 adjusted (opaque token; optional hardening tracked).
- [x] F7 RESOLVED by design (see the feature-006 section): FR-501/SC-502 cover the crash window.
- [ ] F8 LOW: scaffold detection false positive (pyproject.toml in a JS monorepo). Accepted spec-conformant; trigger: feedback from practice.
- [x] F4 MEDIUM: the tasks.md checkboxes set with this commit (hygiene rule).

## Tracked Follow-ups (2026-09-27, Multi-Repo Capability Guidance)

Occasion: a user finding on the Niyama example — guidance is currently single-repo wired and thus not production-ready for multiple repos.

- [ ] MR-1 MEDIUM: the workspace concept is singular — `composeApplication(workspaceRoot, …)` binds ONE root (`src/index.ts:15-16`); `assertWorkspaceInside` (`src/mcp-server/register-tools.ts:82-98`) and `spec_kit_feature_outside_workspace` (`SpecKitEngine.ts:116-120`) reject everything outside the ONE mount; `.guidance/` (config+state) necessarily lives in the workspace root. No repo registry/workspace registry concept. Trigger: specs/008-multi-workspace (spec.md + plan.md + tasks.md created; Q1–Q5 decided by the user 2026-09-27: 1 container + registry, workspaces[] in guidance.json, static without runtime tools, state in the repo, per-workspace lock). Action required: implementation P1–P7.
- [ ] MR-2 LOW: the deployment assumption "1 container = 1 repo" (docker-compose.override.yml mount + GUIDANCE_WORKSPACE_ROOT) is undocumented as a production restriction. Trigger: README/documentation update. Action required.

## Addendum Feature 007 Final Review (0 HIGH/CRIT; 2 MEDIUM fixed immediately)

- [x] M1 RESOLVED: the F5 wording actually adjusted (specs/005 FR-404: opaque token, HMAC dropped/optional tracked); the false RESOLVED claim from d19fdc4 corrected.
- [x] M2 RESOLVED: remote metrics gap executeRequired — downstreamEngine.execute is wrapped with metrics recording (lifecycle/composite now counts remote).
- [x] L1 RESOLVED: the getMetrics live merge receives lastSuccessfulRequestAt (no longer overwritten with undefined).
- [x] L2 RESOLVED (LR-3, 56ecf1d): FR-705 made precise on soft-cap semantics (held never evicted, temporary exceeding under contention documented).
- [x] L3 RESOLVED (LR-2, 8afc15f): router as a proxy instead of a cast — unknown members function-bound to the downstream engine, a regression test present.
- [ ] L4 INFO: SC-604 remote parallelism only tested locally (SC-503); a remote-level parallelism test if needed. The SIGKILL observation stays tracked (see the feature 004 remainder).

## Tracked Follow-ups (2026-09-27, Feature 008 LOW-Residue Closure — RESOLVED)

> Namespace cleanup (2026-09-27): the original labels FR-801…804
> collided with specs/008 (FR-801…808) and were relabeled to
> **LR-1…LR-4** (code comments, test names, prompt headers included).
> Branch feature/low-residue-closure. Suite 314/314 + tsc + build green
> (container).

- [x] Interleaving parity RESOLVED (LR-1, docs+test): separate stream capture documented (no cross-stream ordering guarantee, POSIX); pinning test (an alternating out/err child) in operation-engine-async.test.ts.
- [x] Router cast robustness RESOLVED (LR-2): router as a proxy — unknown members are forwarded function-bound to the downstream engine; then/catch/finally + target properties excluded; a regression test in tools-run-operation.test.ts.
- [x] Lock cap wording RESOLVED (LR-3): specs/007 FR-705 = soft cap 64, held never evicted, temporary exceeding under contention possible; the memory bank L-2 remainder synchronized.
- [x] L253 replacement RESOLVED (LR-4): prompts/capture-lessons.prompt.md in the package (files entry, master-header reference), README usage section. L253 remains obsolete-closed with a reference to LR-4.

## Tracked Follow-ups (2026-09-27, P2 Review Gate specs/008 Phase 1 — GATE PASSED, 0 HIGH/CRIT)

A fresh reviewer subagent over feature/multi-workspace a5f8f26 vs. develop (snapshot table + evidence table in the gate report, session bb85853a).

- [ ] F1 LOW (accepted): sub-path rejection = deliberate hardening vs. the old prefix check (assertWorkspaceRegistered) — documented in the AC-2 matrix (workspace-binding.test.ts). Trigger: user feedback from practice.
- [ ] F2 LOW (accepted): the implicit default entry tolerates a missing root (remote-sentinel boot) — a documented exception, explicit entries strictly validated. Trigger: if remote-boot hardening is demanded.
- [ ] F3 LOW (accepted): session-scoped SpecKitEngines are not cached (only the default root) — pure performance, correct. Trigger: measurable latency on Spec-Kit ops.
- [ ] F4 LOW (tracked): the release_batch/verify_task lifecycle fix lies formally outside T1–T7 of spec 008 — documented as an independent fix on feature/release-batch-tool (b841d38, 0aad3ed); merge to develop still open. Trigger: merge of the two branches.

## specs/008-multi-workspace — RESOLVED (2026-09-27)

- [x] MR-1 RESOLVED: multi-workspace implemented (feature/multi-workspace, T1–T17 completed). WorkspaceRegistry (realpath fail-closed), name-based session binding, per-workspace compositions with state isolation, lock scoping verified, gates per session workspace, health/metrics observability. Evidence: commits e9c503c..73e2b42, suite 326 passed (5 pre-existing), tsc+build clean. P2 review gate: 0 HIGH/CRIT.
- [x] MR-2 RESOLVED: README chapter multi-workspace + a docker-compose example (second mount), the .guidance/state gitignore obligation documented (FR-807).
- Remaining (from the phase-2 implementation): an observability per-workspace detail test, the Spec-Kit chaining bridge for non-default workspaces (documented limitation), merges feature/multi-workspace + feature/release-batch-tool → develop (open, user decision).

## Spec-009 Delta Re-Review 2026-09-27 (7f9065f) — tracked findings

- [x] N-D1 (MEDIUM): plan.md L18/L46-47 + tasks.md T7 list policies.json as "copied" — a contradiction with FR-910/T13 (regenerated). Trigger: fix before the implementation start of P3/T7 (copy list = workflow.json + schemas/). Action required.
- [ ] N-D2 (LOW): the FR-902 path safety check (reference outside the target .guidance) is not specified as realpath/resolve-based — a symlinked reference path that is lexically outside but really inside the target .guidance remains a theoretical escape. Trigger: implementation of FR-902 (T6) — check over resolved paths; an optional spec addendum. Action required (implementation detail) or accepted with the realpath rule.
- [x] N-D3 (LOW): FR-901 references FR-909 (downstream-servers.json), FR-909 is not defined in the spec (only plan/tasks T13). Trigger: next spec-009 touch — add the FR-909 block or change the reference to N-1. Action required (editorial).
- [x] N-D4 (INFO): the FR-902 sentence structure broken by the R-5 insertion ("fail-closed path safety (R-5): … `configuration_invalid`"); plan.md L5 typo "und宵". Trigger: next editorial revision. Accepted observation.

## Spec-010 Documentation Drift Gate — Review Findings (2026-09-27, commit 76801a2)

- [ ] S10-F1 (HIGH): FR-954 path patterns without matching semantics (prefix/suffix/glob) and path base; `src/config.ts`/`src/types/errors.ts` do not exist as such (real: `servers/server-guidance/src/...`); `README.md` ambiguous vs. out-of-scope (`servers/server-guidance/README.md`). Trigger: before the plan phase of spec-010 — specify the patterns as glob/suffix with a defined base. Action required.
- [ ] S10-F2 (MEDIUM): FR-952 names only operations.json; the actual gate point is `workflow.json` → `phases.complete.lifecycle.beforeExit` + the transition `required_operations_succeeded`. Specify the complete op definition (args/timeout/validation analogous to final-review-gate) + the position in beforeExit (before final-review-gate — doc-fix commits invalidate its headCommit). Trigger: plan phase spec-010. Action required.
- [ ] S10-F3 (MEDIUM): check-1 "README entry (tool table + section reference)" not machine-precise (AND/OR?); baseline: SPEC_KIT_TOOL_NAMES=16 vs. README table=12 (verify_task, propose/approve/apply_plan_change missing). Extend the Q3 cleanup list with the README tool table + ERROR_CODES. Trigger: first gate run / plan phase. Action required.
- [ ] S10-F4 (MEDIUM): the check-3 anchor does not exist — the README documents NO ERROR_CODES structure (0 hits). Define the anchor format (e.g. a codes table; check against the table, not a free README substring — otherwise false positives from example text like `submission_invalid`). Trigger: plan phase. Action required.
- [ ] S10-F5 (MEDIUM): check-4 "merge commit in the log" for this repo (rebase/squash practice, direct commits on develop like 76801a2 itself) presumably never firing / firing incorrectly; "open mandatory checkboxes" not machine-recognizable. A more precise rule needed (e.g. merge via `git log --merges <ref> -- specs/<id>/` or ref-based) + an exit rule/override, since blocking (Q1) hard-punishes false positives. Trigger: plan phase. Action required.
- [ ] S10-F6 (MEDIUM): evidence contract: `specs/002/contracts/upstream-mcp-tools.md` lists evidence fields — the update to `docsImpact` in the spec is not mentioned. The zod schema stays `z.record(z.unknown())` (no tool schema change), the SpecKitEngine signature changes; existing tests (lifecycle/state-machines) pass no docsImpact — green with the F-1 fix (no substring match on `a.ts`), check for regressions. Trigger: implementation T-? spec-010. Action required.
- [ ] S10-F7 (LOW): FR-953: define the stdout/stderr assignment (reference pattern: errors on stderr) + field grammar (no newlines in fields). Trigger: plan phase. Action required.
- [ ] S10-F8 (LOW): AC numbering inconsistent ("AC-10" before AC-1); strike the "Decisions (open — historical)" section with "[recommendation]" remnants. Trigger: editorial revision spec-010. Action required (editorial).
- [ ] S10-F9 (LOW): missing ACs: behavior on a missing README / missing specs directory / missing .git (fail-closed vs. skip) + explicitly exclude backup files (`README.md.bak`) from parsing. Trigger: plan phase. Action required.
- [ ] S10-F10 (INFO): the adoption block (spec 009 FR-906) lives in hashed guidance.json — untouched by the docs gate, no interaction; the `docs-drift` op is repo-specific → lands on the FR-903 adjustment list in future adopts (document). Accepted observation.
- [ ] S10-F11 (INFO): the pattern `specs/` ⇒ every tasks.md maintenance enforces docsImpact (conservative, in the fail-safe direction, accepted); `tests/` is not patterned → no _tests/setup_ false-positive risk. Accepted observation.

## Adopt-Mode Findings (2026-09-27, empirically via setup_guidance_generate against /examples/default-guidance)

- [x] AD-1 (HIGH): adopt fails the FR-901 coherence check when the reference workflow.json references non-generic ops (e.g. final-review-gate/index-freshness in beforeExit) — genericPreset (ConfigAssistant.ts) does NOT regenerate these, the coherence check throws configuration_invalid. Affects ALL "proven references" incl. the shipped examples/default-guidance and this repo itself. Repro: setup_guidance_generate {configSource:adopt, referencePath:/examples/default-guidance, transport:http-docker, projectName:x, profile:plain, gates:standard, insight:yes, gitnexus:yes}. Trigger: next spec-009 contact — fix: take over non-generic ops with copy + adaptation note into operations.json (instead of discarding) OR run the coherence check over the reference ops instead of only genericPreset; sharpen spec FR-901/FR-906. Action required.
- [x] AD-2 (MEDIUM): adopt is undocumented/unreachable in the container-only case: the referencePath help mentions only /workspace/.guidance; the reference present in the image (/examples/default-guidance) is documented nowhere. Trigger: together with AD-1 — either a builtin alias (referencePath "builtin:default") or extend the docs with the image path. Action required.
- [x] AD-1a (supplement to AD-1, 2026-09-27): test-gap verification — config-assistant-extensions.test.ts: the happy-path fixture (makeReference, L140-158) writes the same JSON into all 5 reference files; the reference workflow.json contains NO phases object, the coherence check runs empty. The N-2 test (L197) covers only completely missing ops, not "present in reference-operations.json, but not in genericPreset". Adopt was thus never tested against a realistic reference setup — a test gap from the start, no regression. Trigger: with AD-1 — add a regression test with a realistic reference (phases.complete.beforeExit incl. final-review-gate).

## Spec-010 Findings — Resolution (2026-09-27, implementation completed)

- [x] S10-F1 (HIGH): resolved — DOCS_RELEVANT_PATTERNS as an exported constant in SpecKitEngine.ts (defined semantics: substring match against repo-root-relative, backslash-normalized changedFiles); the docsImpact obligation with submission_invalid, regression in tests/speckit/lifecycle.test.ts (3 tests). Remaining nuance: the README.md pattern also matches servers/*/README.md (conservative, accepted).
- [x] S10-F2 (MEDIUM): resolved — the docs-drift op completely in operations.json (node, args ['.'], read_only, timeout 60, required) + workflow.json complete.beforeExit BEFORE final-review-gate (headCommit protection).
- [x] S10-F3 (MEDIUM): resolved in T1/T4 — tool parity machine-checked (tool id at the start of table rows), README sanitized (35 tools, gate exit 0).
- [x] S10-F4 (MEDIUM): resolved in T2 — an ERROR_CODES table (80 codes) created, the check against table rows (code at line start).
- [x] S10-F5 (MEDIUM): resolved in T3 — file-based status hygiene instead of the merge-commit heuristic + the override comment <!-- docs-drift: status ok --> as the exit rule.
- [x] S10-F6 (MEDIUM): resolved — the contract specs/002/contracts/upstream-mcp-tools.md documents docsImpact (mandatory on a pattern match, submission_invalid otherwise, default none); existing tests green (344/344).
- [x] S10-F7 (LOW): resolved — findings line-by-line on stderr ("docs drift: ..."), exit 1; stdout only the summary (the pattern of the reference gates).
- [x] S10-F8 (LOW): handled editorially by the spec/plan phase of the predecessor sessions (accepted in the implementation context, gate/tests define the governing semantics).
- [x] S10-F9 (LOW): resolved in T4 — a missing README fail-closed, an empty specs tree silently skipped, no .git file-based, .bak excluded.
- [x] S10-F10 (INFO): accepted observation (stays, the FR-903 adjustment list documented).
- [x] S10-F11 (INFO): accepted observation (conservative fail-safe, as decided in the spec).

## Spec-010 Final Review (Completion, 2026-09-27)

- [x] S10-FR1 (MEDIUM, fixed commit 3191d05): substring matching → segment-boundary matching (matchesDocsPattern); regression: a near-miss test (docs/myspecs/a.md, src/config.tsx → none).
- [x] S10-FR2 (MEDIUM, fixed commit 3191d05): the AC-5 gaps closed — bare 'none' rejected, 'updated:' tested on a real match (4 docsImpact tests, 53/53 green).
- [x] S10-FR3 (LOW, accepted + documented): a non-validated docsImpact is persisted unchanged on a non-match; case sensitivity + segment semantics documented in the specs/002 contract.
- [x] S10-FR4 (INFO, verified contained): partial loop mutation on a multi-evidence throw — withState persists only on success, no corruption.
- [ ] lint/test ops non-blocking red (pre-existing: CRLF format server-clear-thought; Windows node_modules in the container) — the full suite manually green in the container (344/344). No action needed for 010; trigger: ops.json file tightening (test required:true after an in-container install).

## Spec-010 Final Review Round 2 (Completion Gate, 2026-09-27) — 2 HIGH found and fixed

- [x] FR2-H1 (HIGH, fixed): check 1 tool parity was a no-op (allTools only in the summary line) — both directions implemented (forward: a README tool row per registered tool; reverse: a README tool row without a server.tool registration in src, scoped to "## Tool reference"); regression: tests/scripts/check-docs-drift.test.ts. The gate thereby found real residual drift (4 missing README rows) → sanitized.
- [x] FR2-H2 (HIGH, fixed): the T10 evidence claimed tests for AC-1..4/N-AC — there were none. New: tests/scripts/check-docs-drift.test.ts (12 tests, AC-1 both directions, AC-2 chapter scoping, AC-3 table-row free-text exclusion + digit codes, AC-4 draft/override, N-AC-1/2/4; N-AC-3 = the script is purely file-based, never git).
- [x] FR2-M1..M3 (MEDIUM, fixed): the ERROR_CODES check at the start of table rows instead of free text; the override comment in spec.md instead of tasks.md (spec conformity); the question ids scoped to the assistant chapter. Additionally LOWs: the done>0 guard removed (spec-conformant), .bak directories excluded, digits in the ERROR_CODES regex, an empty "updated:" suffix rejected... (the latter: the engine docsImpact validation unchanged allows "updated:" with an empty rest — see FR2-L1.)
- [x] FR2-L1 (LOW, accepted): docsImpact "updated:" with an empty tail passes the prefix check. Trigger: next SpecKitEngine touch — add a rest-length check. Accepted observation (documentation value near zero, no functional risk).
- [ ] FR2-L2 (LOW, accepted): README tool-row matching case-sensitive and bound to exact table syntax. Trigger: if the README format changes. Accepted observation.

## Rest-Findings-Batch Review (session-4e4471f2, 2026-09-27)

- [x] RV-M1 (MEDIUM): reference ops are now minimally shape-validated in the adopt merge (type: string non-empty, otherwise configuration_invalid fail-closed).
- [x] RV-L1 (LOW): the leading space in the adoption marker fixed (separator only when a description exists).
- [x] RV-I1 (INFO, accepted): near-miss prefixes ("Updated: x", "none:updated:x") behave leniently as documented — no change.

## Rest-Findings-Batch Final Review Closeout (session-4e4471f2, 2026-09-27)

- Final review (sub-agent 692cabd0): 0 HIGH/CRITICAL. F-4 (MEDIUM, doc-only): the AD-1/AD-2/AD-1a/FR2-L1/N-D1/N-D3/N-D4 entries above set to [x] (treatment + evidence in the rest-findings-batch sections). F-3 (LOW): a regression test for the RV-M1 shape validation added (a reference op without type → configuration_invalid), 12/12 green.
- Next trigger: the AD-2 docs mention the builtin reference — when using examples/default-guidance as referencePath in the container the path is /workspace/servers/server-guidance/examples/default-guidance.

## 2026-09-27: specs/011 Final Review — accepted LOW observations (session-f66c3f62)

- FR3 (LOW, accepted): the builtin template op store-completion-insight gets an [adopted] marker + review note, although the template has 0 repo-specific args (verified). Trigger: when the adopt marker text is touched (new specs on the ConfigAssistant) → output the builtin case without marker/review note. Action required at that trigger.
- FR5 (LOW, accepted): three near-duplicate builtin conditions (generateFiles isBuiltin, the resolution if, the validateAdoptReference "builtin" check) can drift; the referencePath==="" arm at the call site is dead (defensive). Trigger: next change to resolveBuiltinReferencePath/the adopt entry gate → consolidate to one central isBuiltinReferencePath() constant. Action required at that trigger.
- FR7 (LOW, accepted): test gaps — the env override GUIDANCE_BUILTIN_TEMPLATE_DIR is not e2e-tested through generateFiles (only a resolver unit test); no byte-diff golden test for mounted adopt. Trigger: the next test round on config-assistant-extensions.test.ts → add both tests. Action required at that trigger.
- Final-review status: gate OK (HEAD db494f2, 8 findings, 0 open HIGH/CRITICAL). Deviation documented: the mandatory final-review sub-agent was aborted by the user; the final pass was executed as an evidence-based author self-check (the implementation review remained independent via sub-agent cbebdfc5).

## 2026-09-28: specs/011 Re-Review (fresh sub-agent f8441944, user order after the aborted first final review)

- Re-review result: 0 HIGH/CRITICAL. Focus tests 21/21 (executed by the sub-agent), tsc exit 0. Confirmed: FR-971..974 ✓, mounted-AC-4 unchanged, three builtin conditions consistent.
- F-01 (MEDIUM, fixed): schemasDir in generateFiles hardcoded PKG_ROOT/examples/default-guidance and ignored GUIDANCE_BUILTIN_TEMPLATE_DIR → the env override did not apply to embedded schemas (a 4th inconsistent builtin path). Fix: schemasDir = join(resolveBuiltinReferencePath(), "schemas") + a new test (env-override schemas are embedded). Suite 370/370, tsc/build green.
- F-02 (LOW, accepted): the referencePath answer is not trimmed (env is trimmed) → a whitespace answer fails closed with the raw path; correct outcome, inconsistent mechanism. Trigger: the next change to the answers coercion → also trim referencePath + a test.
- F-03 (LOW, accepted): the whitespace-env case untested. Trigger: the next test round → add the test.
- F-04 (LOW, accepted): the adoption schema slot permissive ({type:"object"}, no additionalProperties:false). Deliberate: audit field, no downstream consumer; consistency with the strict project schema is missing. Trigger: if a consumer ever reads adoption → tighten the schema.
- F-05 (INFO): a duplicate builtin condition (covers FR5, stays triggered). F-06 (INFO): source stays "builtin" even on override — correct, documented as audit-relevant. F-07: README accurate.
- Gate re-anchored: final-review.json headCommit to the new HEAD, 0 open HIGH/CRITICAL.

## 2026-09-28: specs/012 Final Review (sub-agent 7d3ca207) — findings balance

- Final review (fresh sub-agent, HEAD a55d381+follow-ups): 0 HIGH/CRITICAL. 2 MEDIUM: F-1 (the FR-981 comment claimed mirror behavior that applies only to responses.json — comment corrected, the 011-workflow behavior deliberately untouched), F-2 (golden tests missing → determinism tests fresh+mounted added, timestamps stripped). LOWs: F-3 (the spec-without-tasks skip now documented in spec.md), F-4 (a duplicate write removed).
- Tracked follow-ups (trigger: the next test round on config-assistant-extensions): a wisdom e2e via composeApplication boot with a marker; an indented-checkbox test for check-spec-drift; an env-override e2e (011 legacy).
- FR-982 breaking (old references without responses.json) finally confirmed accepted + documented.

## 2026-09-28: specs/013 Final Review (sub-agent fd7b22e1) — findings balance [L978-981]

## Tracked Follow-ups (2026-09-28, FR-035 Container Route Review Round 1, session-1afb793f)

- [CR-1] MEDIUM | FR-035 timeout policy missing in the fresh baseline: `buildResponses` (ConfigAssistant.ts) historically contains no FR-035 sentence — only the wisdom baseline + derived workspace configs carry the amended order. Review F2: the drift guard AC-1 is therefore no FR-611 proof. | Trigger: the next scope that touches `buildResponses` or the `responses.json` of the fresh baseline — add the FR-035 sentence (amended version, 7 phases) to buildResponses and regenerate the template (the drift guard enforces byte equality). | action required
- [CR-2] MEDIUM | engine gating test debt: the FR-613 fallback gate in `WorkflowEngine.buildInvokerClosure` (only on timedOut + riskClass read_only + a configured route, exactly 1 attempt, metric) is only secured by static simplicity + ClientManager-level tests, not by an engine-level contract test (4 cases per review F3). | Trigger: the next touch of `buildInvokerClosure` — note: the GDS4 agent is working in parallel on WorkflowEngine.ts (uncommitted in the main checkout); add the engine test only after the GDS4 merge on a fresh basis. | action required

## Tracked Follow-ups (2026-09-28, Diagnosis Session guidance→clearthought)

- [GDS-1] MEDIUM — RESOLVED (2026-09-28, feature/gds1-status-probe, merged develop): getDownstreamStatus probes enabled http transport servers on demand (handshake min(5s,startupTimeoutSeconds)) and reports the real state incl. the error field; non-http is not probed; regression: downstream-status.test.ts (3 tests). Live verified: all 3 servers ready with lastSuccessfulRequestAt. Side effect documented: the probe costs up to 5s per unreachable server.
- [GDS-2] LOW | stale session ids: `run_operation`/`get_workflow_state` with workflow session ids from earlier container runs answer `session_not_found` — a deliberate "forced first use" of a downstream server fails silently (no ensureReady, no log entry), which encourages misdiagnoses (experienced in practice today). | Trigger: the next touch of `RemoteSessionManager.resolve`/session restore — on `session_not_found` include a hint about recreation via start_workflow in the error message; optionally mark orphaned session files in `.guidance/state/sessions` as doc-based. | action required
- [GDS-3] LOW | contradictory old finding: the 2026-09-27 entry in activeContext.md ("Clear-Thought re-routing", L697) claims "clearthought status ready" — not possible on the HTTP transport per today's evidence (GDS-1). The observation was presumably in-process or an old build; the technical core (the route works, 177 ms) remains valid. | Trigger: the next maintenance of activeContext.md — correct the old entry with a reference to GDS-1. | accepted with rationale (correction covered by the GDS-1 documentation)
- [GDS-4] HIGH | `run_operation` discards the tool content of downstream calls: `WorkflowEngine.exposeOpResult` (WorkflowEngine.ts L1602-1641) computes `policyEngine.applyExposure` correctly — for `returnToAgent: "normalized"/"raw"` `content` is preserved (PolicyEngine.ts L115-116, default branch) — but the return value is hard-limited to `{ id, status, summary }` and takes only `exposed.summary`; `exposed.content`/`exposed.data` are discarded. Consequence: the orchestrated `reasoning-pass` delivers no `sequential_thinking` answer to the agent — the workflow instructions ("reference its conclusions in the submission") are unfulfillable via this route. Live verified 2026-09-28: response = `{id, status:"succeeded", summary}` without content, although OperationEngine.content was populated (OperationEngine.ts L275-285). Fix: extend the return type of exposeOpResult with `content`/`data` (exposure-filtered); add tests for all returnToAgent modes. | Trigger: the next scope that touches `exposeOpResult`, `run_operation` or the orchestration result schema — or as soon as reasoning-pass is to serve as the basis for a submission in a real workflow run. | action required
- Final review (fresh sub-agent, HEAD deaa1de): 0 HIGH/CRITICAL. F-1 (LOW, fixed): the unknown-token throw + strict leftovers now coupled — wisdom fail-closed, the lenient fallback keeps the 012 pass-through (regression test). F-2 (LOW, fixed): GITNEXUS_URL is used in the wisdom (complete phase, gitnexus-conditional). F-3 (LOW, fixed): a mismatched-close-tag regression test added. F-4 (INFO, tracked): coverage logic duplicated (generateFiles/validateAdoptReference) — trigger: the next change to responses-file selection/coverage → extract a shared helper. Further tracked: a PROJECT_NAME render assertion; extend the AC-6 self-containment scan to responses-wisdom.json.
- Implementation review (cb51d48e): F-1 MEDIUM (non-canonical {{…}} remnants) → strictLeftovers solution; F-2 backreference; F-4 tokens shipped. All referenced in the balance above.

## Tracked Follow-ups (2026-09-28, requestId Reuse Stall Niyama session-46a43aeb)

**RESOLVED 2026-09-28 (develop fbd5bdc, session-dcd3ddc5):** replay markers (replayed/duplicateOf/warning), payload hash + the policy policies.submission.requestIdReuse (warn default, reject-mismatch → requestId_reuse_payload_mismatch), the metric requestIdReplays in get_metrics, 8 contract tests + error-code snapshot, docs (README + specs/002/amendments/006). The original plan entry (below) is thereby implemented; details + limits in activeContext.md and amendment 006.

- [RID-1] MEDIUM | `WorkflowEngine.submitLocked` (src/workflow/WorkflowEngine.ts ~L1617) and `completeWorkflowLocked` (~L1925) silently replay the cached `SubmitResult` on an already-registered requestId — no `replayed` marker, no log, no metric. An agent reusing the same requestId sees `accepted: true` any number of times without a phase advance (live: 3× accepted in review_and_adjust_plan). | Trigger: the next scope that touches `WorkflowEngine.submit*`/`completeWorkflow*` or the submit paths in `register-tools.ts`/`remote-tools.ts` — implement the hardening plan below. | action required

### Server-side hardening (plan, to implement at the RID-1 trigger)

1. **Replay markers (additive, no breaking change):** in `submitLocked`/`completeWorkflowLocked` on a replay hit, clone the cached result and enrich it with `{ replayed: true, duplicateOf: requestId, warning: "requestId already used — phase unchanged; issue a fresh requestId per phase submission" }`. Additive fields flow unchanged through register-tools.ts/remote-tools.ts (passthrough).
2. **Payload hash check (optional, strict):** store a hash over `JSON.stringify(payload)` at the first submit; on a replay with a differing hash instead throw `GuidanceError("requestId_reuse_payload_mismatch")` (recoverable) — the same payload = a deliberate idempotency retry, the marker suffices. Switchable via `policies.json` (`submission.requestIdReuse: "warn" | "reject-mismatch"`), default `warn`.
3. **Observability:** operation counter `guidance_requestid_replay_total` (count after the marker field/warning output); echo in `get_metrics`.
4. **Template rule:** the config assistant templates (`examples/default-guidance/responses-wisdom.json` + fallback `responses.json`) get one sentence in every submission-phase instruction: "Submission idempotency (FR-036): never reuse a requestId across submissions — each phase advance requires a fresh requestId; on `accepted` with unchanged phase, check `get_workflow_state` requestIds instead of retrying." (FR number assigned by the spec writer, proposal FR-036/075 — use the next free slot.)
5. **Tests:** (a) the replay returns the marker + the same phase; (b) a new requestId with the same payload triggers the advance; (c) the reject-mismatch path; (d) the amendment-002 race (successor activation via replay) stays green — the cached-result clone must not break reference equality; (e) template regression: the wisdom render fail-closed with the new sentence.
6. **Docs:** extend the README tool-reference line for submit_* with the replay behavior; extend SDD guidance-mcp-specification.md §19 (phase submission tools) with the FR entry.

- [RID-2] MEDIUM (review fbd5bdc, 2026-09-28) | `completeWorkflowLocked` (WorkflowEngine.ts ~L2059): the first-seen hash is stored BEFORE the phase/status/schema/hook check and NEVER overwritten on retry (`requestPayloadHashes?.[requestId] === undefined` guard). A failed completion attempt 1 (e.g. invalid_active_phase / required_hook_failed) poisons the hash: attempt 2 with a corrected payload registers successfully, but the stored hash remains that of attempt 1 → later replays of the successfully accepted payload are falsely `payloadMismatch:true`; under `reject-mismatch` the legal retry replay is falsely rejected with `requestId_reuse_payload_mismatch`. Also contradicts the test comment "failed completions intentionally do NOT register the requestId (retry after fixing must stay legal)" — the hash store violates exactly that intention. Fix: store the hash analogously to `submitLocked` at the success-registration sites of the `successResult` (or remove the guard and overwrite on every non-replay) + a regression test (failed completion → corrected completion with the same requestId → replay without payloadMismatch). | Trigger: the next scope that touches `completeWorkflowLocked`/`replaySubmitResult`/`requestPayloadHashes`. | action required
- [RID-3] LOW (review fbd5bdc) | `replaySubmitResult` (WorkflowEngine.ts ~L1700): `metrics.recordRequestIdReplay` runs only AFTER the reject throw — under `reject-mismatch` rejected mismatch replays are invisible and `payloadMismatches` is structurally always 0. Fix: record the metric before the policy throw (payloadMismatch=true) or document the behavior. | Trigger: with RID-2. | action required
- [RID-4] LOW (review fbd5bdc) | replays are not audited (no audit.append in `replaySubmitResult`) — the persistent audit trail cannot distinguish replay traffic from missing submissions; the metric counter is in-memory and does not survive a restart (inconsistent with the persisted metrics.jsonl path). Fix: an audit event `request_replayed` (with payloadMismatch) in `replaySubmitResult`. | Trigger: with RID-2. | action required
- [RID-5] INFO (review fbd5bdc) | `stablePayloadHash`: JSON.stringify discards properties with the value `undefined` — `{a:undefined}` collides with `{}`. Not reachable over the MCP wire (JSON-parsed), relevant only for in-process callers; no action needed, keep in mind for future in-process use of the engine. | Trigger: if WorkflowTools/engine are called internally with undefined-bearing payload objects. | accepted with rationale
- [RID-6] INFO (review fbd5bdc) | known deviation confirmed: no engine-level completion replay test (the harness cannot satisfy `repository-analysis required:true`). The complete replay path shares `replaySubmitResult` (covered); cache sites via the successor race suite. Classified as accepted; the RID-2 regression test should still cover the completion path directly (consider a fixture with the required op disabled). | Trigger: with RID-2. | accepted with rationale

## 2026-09-28 (afternoon): GDS-4 RESOLVED — run_operation forwards complete tool responses

- [GDS-4] HIGH (2026-09-28, tracked in the morning; the original entry was lost from the working tree by the foreign commit 025b682 — parallel-work incident, see the note below) — RESOLVED on `feature/gds4-expose-op-content`:
  - Fix: `WorkflowEngine.exposeOpResult` now returns the exposure-filtered full result (`content`, `data`, `errors`, `warnings`); new exported type `ExposedOpResult`; `runOperation`/`StartResult`/`SubmitResult` switched to the wider type. Redaction stays upstream (OperationEngine), the exposure semantics per `returnToAgent` unchanged.
  - Config: `.guidance/operations.json` — all 10 operations to `returnToAgent: "raw"` (user request: the complete tool response for all tools).
  - Regression coverage: +2 contract tests (raw forwarded content/data/warnings complete; `summary_and_errors` still stripped — SC-004 preserved); the profile-config test switched to objectContaining. Contract suite 206/206 (2 confirmation runs), `tsc --noEmit` green.
  - Live verified: the guidance container rebuilt/deployed; `run_operation reasoning-pass` via :3003 delivers the complete `sequential_thinking` response (thought + sessionContext) in the `content` field.
- Parallel-work incident (2026-09-28): commit 025b682 (13:55, a Niyama session on develop) swept up uncommitted memory-bank changes of this agent (the GDS-1..3 addendum + activeContext/progress/lessons); the GDS-4 entry written later was lost in the process. Finding documented; matches the completion-gate lesson (2026-09-26, session-3b7f96a5): parallel agents on the same checkout need worktree isolation or strict file responsibility. | Trigger: the next parallel-work scope — agree on file responsibility (memory bank) per agent or commit memory-bank edits immediately. | accepted with rationale (incident documented; the technical consequence GDS-4 is fixed by the new entry)

## RF-2 — RESOLVED (2026-09-28, docs/rf2-fr981-merge)

- [RF-2] LOW — RESOLVED: the FR-981 semantics change (replace → merge for
  the `instructions.global` slot, GDS-5) is documented: an amendment note in
  `specs/012-adopt-response-wisdom/spec.md` (FR-981) with references to the
  implementing sites (`ConfigAssistant.generateFiles`,
  `renderAdoptedResponses`) and the encoding contract tests. SDD v2
  does not describe the replace semantics (checked, 0 hits) — no
  update needed. Regression: the contract tests
  `config-assistant-extensions.test.ts` encode the merge expectation;
  docs-drift green at the workflow closeout.

## Tracked Follow-ups (2026-09-29, Config Assistant Multi-Workspace Gap)

Occasion: the user wanted to start a workflow in a fresh repo ("zed") and received `workspace_not_registered` ("D:\\repos\\zed"). Cause: the registry is fail-closed (`src/workspace-registry.ts`); a second repo requires manually editing `guidance.json` (workspaces[]) + a container mount.

- [x] WA-1 LOW — RESOLVED (2026-09-29, feature/wizard-workspaces 187f93c): the config assistant (setup_guidance_start/answer/generate, `src/setup/ConfigAssistant.ts`) does not interview for additional workspaces — `generateFiles` emits no `workspaces[]` block (0 hits in `src/setup/`). The plain scaffold (`src/scaffold.ts` L139-149) writes only the single launch root as `workspaces: [{name:"default", …}]`. Adding another repo (specs/008 registry) thus remains purely manual work, although the initial registration (MR-1) was supposed to be assistant-driven. Trigger: the next specs/008 consideration or an assistant feature scope. Action required: a wizard question "additional workspaces?" + the emission of further `workspaces[]` entries in `generateFiles` incl. contract tests (name pattern `^[a-z][a-z0-9-]{0,63}$`, absolute existing roots, duplicate roots).

## Tracked Follow-ups (2026-09-29, WA-1 Wizard-Workspaces Review — session-756c112d)

- [WW-1] LOW | generation-time dedupe in parseExtraWorkspaces covers duplicates only within the extras — a duplicate extra root vs. the workspaceRoot (default entry) and realpath/case collapse are only recognized fail-closed at loadConfig (WorkspaceRegistry.build). Correct, but late. | Trigger: the next change to parseExtraWorkspaces/the generateFiles workspaces emission. | Action required: seed seenRoots with resolve(workspaceRoot) OR extend the help text with the load-time dedupe.
- [WW-2] LOW | `workspaceRoot` is only trimmed at generation, not checked for absoluteness — extras get the `isAbsolute` fail-closed, the default root only at loadConfig (registry isAbsolute). Inconsistent fail-fast; a relative path is immediately fixable. | Trigger: the next change to the generateFiles workspaces emission. | Action required: add the `isAbsolute(workspaceRoot)` check analogous to the extras + a test.
- [WW-3] LOW | test coverage: no test for `name=path=with=equals-sign` (the indexOf separation correct, untested); no test for whitespace-only answers (" ; " ≡ omitted — the behavior correct, untested). | Trigger: the next touch of the WA-1 tests. | Action required: add both boundary cases in tests/setup/config-assistant.test.ts.

## Tracked Follow-ups (2026-09-29, Wildcard Container Route Review — session-45abc996)

- [WC-1] MEDIUM — **RESOLVED 2026-09-29 (feature/wc1-wildcard-trustlevel-coupling, guidance session session-22e9b598)** | wildcard `["*"]` + a tool NOT configured in operations.json → `opForEgress` undefined → `riskClass` undefined → the approval gate can never fire. Fix: `validateDownstreamServers` (config.ts) rejects wildcard allowlists for servers with an effective trustLevel != "trusted" (`configuration_invalid`, the server id in the message); `toTrustLevel` extracted to `src/trust-level.ts` (validator+runtime share one semantics; absent/unknown → "trusted"). Regression tests in tests/contract/config-loader.test.ts (4 cases); suite 449/449 green; README updated.
- [WC-1-B] LOW (deferred) — **RESOLVED 2026-09-30 (feature/wc1b-wildcard-unconfigured-approval, e5408c1, guidance session session-b470f696; strategy Option B per user decision)** | residual gap: a TRUSTED wildcard server could host destructive tools without an operations.json entry (opForEgress undefined → the FR-053 gate never fired) — especially via the child/downstream engine wiring that uses the parent closure with the parent operations stock. Fix: PolicyEngine.assertUnconfiguredWildcard — an unconfigured tool on a wildcard server → recoverable authorization_required (server + tool named, resolution hint 'add an operation entry'); configured tools byte-identical; assertAllowed and the WC-1 coupling unchanged; container-route fallback (read_only-only) untouched. 4 PolicyEngine unit tests; suite 483/483 green; README wildcard section added.
- [WC1B-F3] LOW | integration test gap (from the WC-1-B review, sub-agent 028b2135): no end-to-end case 'wildcard server + unconfigured tool via run_operation/closure' — the wiring in buildInvokerClosure is currently only secured via the PolicyEngine method's unit test + configured paths (tools-run-operation 19✓). | Trigger: the next touch of tools-run-operation.test.ts OR buildInvokerClosure. | Action required: add an integration test (wildcard config + an operation on another server → a closure call of the unconfigured tool → authorization_required) as regression protection against wiring drift.

- [WC-4] LOW — **RESOLVED 2026-09-29 (feature/wc4-shipped-config-contract, guidance session session-e782866b)** | no test loaded the shipped config files against loadConfig. Fix: tests/contract/shipped-configs.test.ts — loads all 5 config sets (repo .guidance + examples/{default,python,csharp,rust}-guidance) directly; the only substitution: the workspaces[] key in a tmp copy (the container roots do not exist host-side; the implicit default workspace tolerates that by design). Assertions: a full loadConfig run, egress consistency (transport.http + containerRoute hosts ⊆ httpHostAllowlist, all servers incl. disabled), a negative control (an unallowlisted host → fail). 7 tests, suite 458/458 green.

## Tracked Follow-ups (2026-09-29, Multi-Repo Config Truth Audit — session f955a76e, 4 HIGH)

- [MC-1] HIGH | no truth documentation: README/specs/008 nowhere say which .guidance is authoritative when repo-local, pool-level and served copies coexist (README:3-7,115-134,1840-1915). | Trigger: the next multi-workspace docs/feature scope. | Action required: a normative statement + /health config.source.
- [MC-2] HIGH | no dormancy diagnostics: boot//health detect neither shadowing .guidance in registered roots nor unregistered pool repos with .guidance; worse: WorkflowEngine.ts:537-549 silently copies the boot config into workspaces without .guidance (cpSync) — divergence from day 1, never reconciled. | Trigger: the next touch of engineForWorkspace/boot. | Action required: the P0 items 2+3 (warning + explicit adoption instead of a silent copy).
- [MC-3] MEDIUM | the wizard is not deployment-aware: the generateFiles notes do not say WHERE the file set must be written (served root vs. repo-local) and that remote mode needs init_session; the README prompts say blanketly "project root" (ConfigAssistant.ts:933-1056, README:362-404). | Trigger: the next wizard change. | Action required: a mode-aware note (P1 item 6).
- [MC-4] HIGH | path domain mismatch: guidance init (init.ts:9-10) bakes execution-environment paths (host-WSL /mnt/d/...) into workspaces[].root (scaffold.ts:116-151) — in the container it fails closed only at load time, after a seemingly successful init. | Trigger: the next scaffold/init change. | Action required: a path domain warning/placeholder form (P1 item 4).
- [MC-5] HIGH | gate presets do not fit non-Node workspaces: only npm (+uv), no Cargo etc.; ops are per-config, not per-workspace — zed inherits npm gates (test required:true) and fails guaranteed (ConfigAssistant.ts:180-187,517-542; scaffold.ts:336-384; WorkflowEngine.ts:537-549). | Trigger: registration of a non-Node repo (now relevant: zed). | Action required: a per-workspace gate/preset override (P1 item 5).
- [MC-6] MEDIUM | cross-server lock safety: lock files live per stateDir → a pool server and a repo-local server do not exclude each other; isStale via process.kill(0) is unreliable across PID namespaces (workspace-lock.ts:40-55,220-230). | Trigger: operating several guidance instances over the same mounts. | Action required: P2 item 7 (document/fail-fast the single-server assumption).

## Tracked Follow-ups (2026-09-29, specs/014 Review — session-1b537de7)

- [CT-1] LOW | pre-existing: a schema-valid guidance.json with operations.file but WITHOUT workflow.file → registryOnly=false → the WorkflowEngine constructor throws a naked TypeError instead of configuration_invalid (WorkflowEngine.ts ~L285). More likely due to FR-1101 (missing refs legitimate). | Trigger: the next config-schema/constructor change. | Action required: a constructor guard fail-closed with configuration_invalid.
- [CT-2] LOW | test gap: a legacy monolith E2E (full config at the instance root + a registered extra workspace WITH its own .guidance, then startWorkflow child composition) not explicit in registry-composition.test.ts — the behavior correct per code read. | Trigger: the next touch of registry-composition.test.ts / composition v2. | Action required: add an E2E test.

## Tracked Follow-ups (2026-09-30, Registry Hot-Reload — user request)

- [HR-1] LOW — **SDD COMPLETED 2026-09-30 (specs/015-registry-hot-reload-deps, feature/015-sdd-registry-hot-reload-deps, guidance session session-7980b278)** | spec.md/plan.md/tasks.md created in draft status: US1 registry hot-reload with BOTH concept alternatives (config-watch + atomic swap vs. registry-register tool) as an open design decision (R1 in plan.md, recommendation: B first), AC-1…AC-6 incl. fail-closed reuse, audit events, configurationVersion semantics (the R2 matrix as a blocking open point) and the WC-1/WC-1-B coupling. The specs/008 tension anchored as an explicit rejection criterion. Implementation pending (phase-1 tasks T001/T002: close R1/R2 with the user).

## Tracked Follow-ups (2026-09-30, Dependency Bootstrap Node Repos — user request)

- [DB-1] MEDIUM — **SDD COMPLETED 2026-09-30 (specs/015-registry-hot-reload-deps US2, feature/015-sdd-registry-hot-reload-deps, guidance session session-7980b278)** | the open remainder (deps-install/deps-reinstall) is now specified: spec.md US2 (AC-7…AC-12: npm ci clean semantics + lockfile fallback with an audit note, deps-reinstall workspace-scoped, reactive detection via gate error patterns + an optional proactive probe, riskClass workspace_write + approval, container installation); plan.md technical approach + test strategy; tasks.md phase 3 (T007…T010). Implementation pending — afterwards also resolves GATE-1 (the container gates become reliable).

## Tracked Follow-ups (2026-09-30, CT-1 Constructor Guard — guidance session session-1070c546)

- [CT-1] LOW — **RESOLVED 2026-09-30 (feature/ct1-constructor-guard, 8f588c6, guidance session session-1070c546)** | naked TypeError in the WorkflowEngine constructor on a schema-valid guidance.json with operations.file but without workflow.file (registryOnly=false). Fix: a fail-closed guard with configuration_invalid, a structure check workflow.id/initialPhase (a truthy-empty workflow object would otherwise have slipped through — covered by the test case workflow={}; there loadConfig additionally applies with a ConfigurationError). 4 regression tests (tests/workflow/ct1-constructor-guard.test.ts), suite 479/479 green, independent review APPROVED 0 HIGH/CRIT, README note added.
- [TYPE-1] LOW | pre-existing typecheck error tests/contract/shipped-configs.test.ts(125) TS2532 (CONFIG_SETS[1] under noUncheckedIndexedAccess). File unmodified, not caused by CT-1. | Trigger: the next change to shipped-configs.test.ts or tsconfig (noUncheckedIndexedAccess). | Action required: use `CONFIG_SETS[1]!.dir` or destructuring access + check why the error is reproducible at the baseline HEAD (ea582f8) although earlier runs reported typecheck-green (TS version drift? check the tsc version via nvm).
- [GATE-1] OBSERVATION | the verify gates lint (prettier --check) and test (root npm test --workspaces) fail closed in the guidance container (no Linux-native node_modules — the DB-1 remainder context); both required:false, the phase advanced anyway. The authoritative verification route remains WSL (npm test in servers/server-guidance, prettier locally). | Trigger: when the container gates are pulled to required:true OR the DB-1 remainder (deps-install) is implemented. | Action required: install the container node_modules natively (the convergence path from operations.json), then tighten the gates — not before.
- [CHAIN-1] LOW | chain continuation via the auto-created successor session fails at AC-5: after completion of session-1070c546 the successor session (session-ec74b6ba) reported `configuration_invalid: bound to e192bb…, current configuration 39e5a3…` — the successor session was bound at chain start to the THEN-current configurationVersion, and the hash had changed by activation (cause unclear: the repo .guidance is byte-identical to develop, no hashed inputs recognizably changed; suspicion: the instance/registry side in the container or the context of the hash determination — workspaces[] serialization, ENV-dependent defaults). Additionally the chain showed the same CT-1 request for the successor session (the step index not advanced?). | Trigger: the next chained guidance workflow OR a change to chain activation/getWorkflowState AC-5 check. | Action required: clarify the root cause of the hash drift between chain start and successor activation (check the loadConfig hash inputs deterministically against the instance registry; possibly bind the successor session to the current configuration only at activation, or rebind with re-validation). Until then: run chained workflows per step group with a fresh start_workflow chain (the proven pattern from earlier chains).

## Tracked Follow-ups (2026-09-30, CT-2 Legacy Monolith E2E — guidance session session-9e23340f)

- [CT-2] LOW — **RESOLVED 2026-09-30 (feature/ct2-legacy-monolith-e2e, 96b0a67, guidance session session-9e23340f)** | the legacy monolith E2E test gap closed: registry-composition.test.ts extended with describe 'legacy monolith child composition (CT-2)' — full config at the pool root (workspaces[] registry) + an extra workspace with its own full .guidance → startWorkflow({workspace:'zed'}) composes from the workspace root: the persisted session configurationVersion === the workspace config hash (from zed/.guidance/state/sessions/<id>.json) AND ≠ the pool instance hash; no config copies into the workspace. 15/15 registry-composition, suite 480/480 green, prettier green. No production code needed — the workspace routing in monolith mode is correct (the plan's residual risk refuted).

## Tracked Follow-ups (2026-09-30, WW-1 Extra-Root Default Dedupe — guidance session session-58b4d57f)

- [WW-1] LOW — **RESOLVED 2026-09-30 (feature/ww1-extraroot-default-dedupe, 6029007, guidance session session-58b4d57f)** | parseExtraWorkspaces(value, defaultRoot?): seenRoots is seeded with resolve(defaultRoot) — an extra root that would resolve to the default workspaceRoot now already fails at generation time with configuration_invalid ('duplicate root', pseudo-name 'default (workspaceRoot)') instead of only at container load. generateFiles passes the trimmed workspaceRoot. 2 regression tests (the exact collision + a resolve-normalized collision via a trailing separator); 70/70 config assistant tests, suite 480/480 green, prettier green. Realpath/case collapse deliberately stays load-time (WorkspaceRegistry.build) — the WW-1 scope was the follow-up wording (the default-root duplicate).

## Tracked Follow-ups (2026-09-30, WW-2 workspaceRoot-isAbsolute — guidance session session-c4d8dba2)

- [WW-2] LOW — **RESOLVED 2026-09-30 (feature/ww2-workspaceroot-isabsolute, 5c06639, guidance session session-c4d8dba2)** | isAbsolute fail-fast for the default workspaceRoot in generateFiles (registry edit): after the empty check a relative path now throws configuration_invalid ('must be an absolute path: …', analogous to the extras check) instead of failing only at loadConfig. 1 regression test; focused 71/71; full run effectively 481/481 (2 timeout flakes metrics/engine green on re-run — the known WSL load flakiness, not diff-related); prettier green. Consistent fail-fast semantics for the default root AND the extras at generation level; existence/realpath checks stay load-time by design.

## Tracked Follow-ups (2026-09-30, WW-3 Boundary Tests — guidance session session-46674965)

- [WW-3] LOW — **RESOLVED 2026-09-30 (feature/ww3-extraworkspaces-boundary-tests, 101306c, guidance session session-46674965)** | both tracked boundary cases regression-secured in tests/setup/config-assistant.test.ts: (1) a root with an '=' sign ('zed=/w/zed=path=with=equals-sign') — the indexOf separation takes the first '=', the rest lands fully in the registry entry; (2) whitespace-only answers (' ; ') ≡ omitted — only the default entry. Assertions E2E over the generated guidance.json (template AC-6 test). No production code needed — the behavior was correct, only untested. Suite 482/482 green, prettier green.

## Tracked Follow-ups (2026-09-30, specs/015 R1/R2 decisions — user)

- [SPEC015-A] LOW | alternative A (config-watch + atomic registry swap) was deferred as the US1 design in favor of alternative B (registry-register tool) (user decision 2026-09-30, specs/015-registry-hot-reload-deps/plan.md R1). | Trigger: after the implementation and stabilization of US1/B, if file-edit workflows dominate (operator feedback) or on explicit user request. | Action required: plan US1-Alt-A as its own spec extension (watcher lifecycle, races, ordered session invalidation per the R2 decision).
- [NIYAMA-REG] OBSERVATION | the Niyama workspace entry was removed from .guidance/guidance.json (the repo not present on the new machine; the user clones it here and continues). | Trigger: as soon as D:\repos\Niyama exists. | Action required: re-add the workspaces[] entry { name: niyama, root: /workspaces/Niyama, projectName: Niyama }; the GATE-1 context (container gates) remains environment-dependent until DB-1 (specs/015 US2).

**R1/R2 status (2026-09-30):** R1 = alternative B (registry-register tool), A tracked as SPEC015-A. R2 = continuation with re-validation (completed survives; active/blocked with rebind + re-validation, otherwise fail-closed). The specs/015 implementation thereby unblocked — its own chain after completion of the cleanup chain session-77a51a32.

## Tracked Follow-ups (2026-09-30, TYPE-1 Resolution — session-77a51a32)

- [TYPE-1] LOW — **RESOLVED 2026-09-30 (feature/type1-ts2532)** | TS2532 in shipped-configs.test.ts(125) fixed via `CONFIG_SETS[1]!.dir`; the file normalized to LF. Root cause: CRLF + unchecked access since the WC-4 commit 235e9e6 (earlier green runs predate the commit or did not check tests/). typecheck/prettier/focused 7/7/full run 474+9 skip green. | Follow-up observation: a CR inventory of further test files (strings/fixtures, prettier-green) — only touch them if prettier fails there in the future.

## 2026-10-01: CHAIN-1 Root Cause EVIDENCED (live reproduction in session-77a51a32)

- [CHAIN-1] MEDIUM — **ROOT CAUSE CLARIFIES THE MECHANISM (live reproduction 2026-10-01)** | session-77a51a32 (TYPE-1, chain step 1/4) ran to phase complete (all submission phases accepted, local gates green). The necessary mid-session config change (the operations.json `gitnexus-check` entry as the WC-1-B remedy, commit 8e7ac24) + container restart (config snapshot, no hot-reload) led to `configuration_invalid: session bound to sha256:2141c4a9… != current sha256:8cf5be36… (registry/config changed; specs/008 AC-5)` — the session cancelled, TYPE-1 completed outside the guidance ceremony (all verification artifacts exist). | **Root:** AC-5 binds the session fail-closed to the config hash AT SESSION START; any config change during the session (registry OR operations.json) invalidates it. For chains the same hits the auto-created successor session (bound to the hash at chain start). | **Fix = R2 decision (specs/015 US1):** continuation with re-validation (rebind to the current config at activation/state read + re-validation, completed survives). Until then the workaround: NO config changes between start_workflow and complete_workflow; fresh chains per step group. | Trigger for the remainder: the specs/015 US1 implementation (R1=B decided). | Action required: the US1 implementation closes CHAIN-1; regression test: mid-session registry change → an active session re-validated instead of configuration_invalid.
- [TYPE-1] — **COMPLETION OK OUTSIDE GUIDANCE:** 58faa7e+8e7ac24 on feature/type1-ts2532; tsc/prettier/focused 7/7/full run 474+9skip green; independent review APPROVED 0 HIGH/CRIT (sub-agent 3c0327e2); final-review.json + final-review-gate green (HEAD 8e7ac24); gitnexus analyze --no-stats @HEAD; docs-drift green. Only the server-side completion stamp is missing (see above).

## Tracked Follow-ups (2026-10-01, WC1B-F3 Resolution — session-293a251f)

- [WC1B-F3] LOW — **RESOLVED 2026-10-01 (feature/wc1b-f3-integration-test)** | integration test "WC-1-B (WC1B-F3)" in tools-run-operation.test.ts: wildcard server + unconfigured tool via a composite mcpTool step → the closure returns recoverable authorization_required without downstream contact. Regression protection against wiring drift in buildInvokerClosure. Focused 20/20, full run 475+9skip green.

## Review Quality (2026-10-01, WC1B-F3 review c31e517c)

- MEDIUM "commit scope + AGENTS.md.bak in the repo": fixed — the branch rewritten locally; the scope commit 5f124f1 (test + memory bank) separated from 2ee..b2ee2db (skill docs/meta blocks); AGENTS.md.bak deleted (the backup content reproducible via git history). Reviewer verdict before CHANGES REQUESTED (0 HIGH/CRIT, 1 MEDIUM) → after the fix approvable; the fix in the same scope, the test unchanged (5f124f1 = 588eef7 content, cleaned).

## Tracked Follow-ups (2026-10-01, Guidance Finalization after Retry — session-293a251f)

- [GDS-6] MEDIUM — **RESOLVED (feature/gds6-chain-replay-hardening)** | retryOperations finalizes after a hook failure → the retry success is now complete: pendingCompletion {report, requestId} is persisted on the session at the hook failure; a retry success in phase complete sets status=completed + completedAt, audits workflow_completed (finalizedBy=retry_operation), creates the chain successor from the retained report (the extracted createChainSuccessorLocked/activateSuccessor helpers, shared with completeWorkflow) and caches the result under requestIds. The defensive path without pendingCompletion finalizes without a successor (visible in the audit). Regression tests tests/workflow/retry-finalize.test.ts (4 tests: plain finalize + replay, chained finalize + requestId replay).
- [GDS-7] LOW — **DOCUMENTED (feature/f0531-gds7-cleanup)** | a deterministic dual-index procedure anchored in servers/server-guidance/README.md: refresh of the gate-relevant repo-local index via WSL from the exact (lowercase) path identity with --skip-skills; --force on 'Already up to date'; the gitnexus-server container refreshes only its own /data storage; AGENTS.md noise pattern. No compose change needed (no GITNEXUS_* env present; the container storage from image defaults).

## 2026-10-01: CHAIN-1 — source verification + R2 ACs anchored (feature/chain1-ac5-evidence)

- Root cause verified against source: WorkflowEngine.ts:639-648 (fail-closed,
  recoverable:false, on EVERY session access with hash divergence).
- The R2 decision anchored as AC-13…AC-17 (rebind with re-validation; completed
  survives; chain-successor rebind; audit event session_rebound) in
  specs/015 spec.md addendum. Implementation = US1 (R1=B).
- CHAIN-1 stays tracked until the US1 implementation (the AC-16 regression
  test is the completion criterion); the symptom mechanism is thereby fully
  explained and specified.

## 2026-10-01: CHAIN-1 refinement — successor born-invalid (defect hypothesis made precise)

- [CHAIN-1] supplement: sessions created via start_workflow bind correctly (three sessions ran through completely: 293a251f, a0577447, 7e69dcdd — configurationVersion cacb2274 consistent). Server-side CREATED chain successors bind the same cacb2274 hash, but get_workflow_state compares against 8cf5be36 → successor born-invalid (affected: 78cad869, b0ae5c2a; cancelled). | Hypothesis: successor creation composes the config over the DEFAULT workspace root (/workspaces) instead of the repo root (/workspaces/Thinking-MCP) → different registry/hash inputs than the start path. | Trigger: the specs/015 US1 implementation (AC-16 rebind + successor binding) — the regression test must cover both paths (start vs. successor) with an identical hash. | Until then: a fresh start_workflow session per step (the proven pattern), cancel the successor.

## Tracked Follow-ups (2026-10-01, Re-Review 04a2b4c — session 5c4f1e44 follow-up review)

- [REV-04a2b4c-1] HIGH — **RESOLVED (await fix: b09f74b; tool-level test: feature/rev04a2b4c1-registry-await-test)** | the handler serialized the un-awaited registerWorkspace() promise as "{}". The await fix + F1/F2 regression tests already in b09f74b (develop); the missing tool-level response-shape test supplied: registry-rebind.test.ts 'review F-handler' — a stubbed MCP server intercepts the registry_register handler, real WorkflowTools via the pool engine; asserts configurationVersion + registry in the serialized body (not "{}") and the fail-closed rejection (/root does not exist/) instead of an un-awaited body. The SDK zod layer deliberately out of scope (stub). Focused 12/12, typecheck + prettier green.
- [REV-04a2b4c-2] MEDIUM — **RESOLVED b09f74b** | the fingerprint drift probe supplied as a live engine test (registry-rebind.test.ts 'review F2': engine1 queried after touchConfig(), session_rebound audited).
- [REV-04a2b4c-3] MEDIUM — **RESOLVED b09f74b** | the F1 purge regression test supplied (registry-rebind.test.ts 'review F1': route a session → registerWorkspace remove → getWorkflowState fail-closed instead of a stale route).

## Tracked Follow-ups (2026-10-01, specs/015 US2 Review — session 28f04594, commit e5780fc)

- [REV-US2-F1] MEDIUM — **RESOLVED — REWORK c371f7e (feature/approval-policy-config, user design correction: unattended operation)** | originally scope A (interactive grants per execution) collided with the unattended philosophy. Now: a trust act in the configuration — policies.json → policies.approvals (riskClass → allow|require, fail-closed validated; defaults: destructive/credential_sensitive → require (the ceremony remains), workspace_write/external_write/read_only → allow (unattended)). validatePolicies bugfix: the approvals validation previously skipped the early return on a missing submission section (covered by the fail-closed test that fails under the old code). Ceremony/assert/consume/all-or-nothing unchanged for the require classes; the gate on all 8 paths; the configVersion hash covers approvals (a change revaliduates sessions). Full run 534/534. See also REV-APPCFG-1/-2.
- [REV-US2-F2] MEDIUM — **RESOLVED (feature/rev-us2-f2f3f4)** | descriptions in all three catalogs + the README line for deps-install switched to the real firstAvailable semantics (fallback on EVERY npm-ci error; the node_modules deletion caveat). Decision: doc alignment instead of a condition field (the engine has no per-step conditions; that would be a new feature).
- [REV-US2-F3] LOW — **RESOLVED (feature/rev-us2-f2f3f4)** | the composite failure merge now carries the step warnings (node_deps_hint survives); test 'REV-US2-F3: a failing composite gate keeps its step warnings'. Hint-on-every-process-fail remains accepted noise.
- [REV-US2-F4] LOW — **RESOLVED (feature/rev-us2-f2f3f4)** | the three catalogs field-identical for deps-install/deps-reinstall (canonical: protocolRequestMustSucceed + summary_and_errors + a unified description incl. 'Runs in the workspace root'); a new drift-guard test 'REV-US2-F4: the three deps-op catalogs are field-identical'.
- [REV-US2-F5] LOW — **RESOLVED (feature/fr053-approval-gate)** | a platform constraint in the deps-reinstall description (all 3 catalogs, drift-guard-tracked) + README documented.
- [REV-US2-F6] LOW — **PARTIALLY RESOLVED (feature/fr053-approval-gate)** | require("node:fs") → switched to an import. The lockfile flakiness residual risk stays tracked (trigger: an npm major update OR flakiness occurs).
- [DEPLOY-015] OBSERVATION | ~~the instance .guidance/operations.json deliberately does NOT contain the deps ops~~ **DONE 2026-10-01 (commit 0837069):** deps-install/deps-reinstall in the instance config, the `test` gate pulled to required:true, the GATE-1 disclaimer removed; the container healed (npm ci + install-script approvals), lint/test green in the container. | **[DEPLOY-015b] ~~MEDIUM~~ DONE 2026-10-01 (feature/015-deploy-015b-image-tools):** make + g++ added to the apt layers of servers/server-guidance/Dockerfile (the complete node-gyp toolchain: python3/make/g++/gcc/libc6-dev); additionally the duplicated unconditional dotnet install block removed (INSTALL_CSHARP=false was ineffective, the .NET SDK was always installed — image bloat). Verified: `docker compose build guidance` green; a throwaway probe on the new image: make/g++/python3 present, dotnet absent. Rollout (`up -d --force-recreate`) after session completion — afterwards deps-reinstall works in a fresh container without manual apt follow-up. The npm-≥11.19 allowlist (`allowScripts` in package.json, commit 0837069) remains as the second half of the fix. |

## Tracked Follow-ups (2026-10-01, Independent Review eedb7bb — feature/gds6-chain-replay-hardening)

- [REV-eedb7bb-1] LOW — **RESOLVED (follow-up commit on feature/gds6-chain-replay-hardening)** | retryOperations now propagates pending.requestId to activateSuccessor → the cache is refreshed post-activation with the final chain[0].status (a mirror of the complete path).
- [REV-eedb7bb-2] INFO | Pre-upgrade retry-wedged sessions (status=active, currentPhase='completed', no pendingCompletion) remain unrecoverable: retry_operation hits the terminal phase (no beforeExit ops, no transition), complete_workflow fails invalid_active_phase. Pre-upgrade hook-failure wedges (still at phase 'complete') ARE recovered by the new finalize path. No migration provided. | Trigger: any operator report of a session stuck active/completed from before eedb7bb. | Accepted observation: cancel_workflow + fresh start is the documented recovery.
- [REV-eedb7bb-3] INFO | pendingCompletion persists the FULL completion report in the session JSON (new retention that did not exist before — failure/success paths never stored the report). Size/sensitivity bounded by report content; survives resume/reportBlocker paths until finalize or cancellation. | Trigger: next touch on session persistence/retention or sensitive-data policy. | Action required: consider clearing pendingCompletion on cancel_workflow and documenting retention in README.
- [REV-eedb7bb-4] INFO | Concurrency paths (concurrent retry+complete, double retry) are untested; analysis shows they are safe via session-lock serialization (second complete → workflow_already_completed; second retry → non-mutating workflow_blocked). Retry success in phase 'complete' WITHOUT prior complete_workflow call is also untested (skips report schema validation; finalize without successor if pendingCompletion absent). | Trigger: next touch on retryOperations. | Action required: add a double-retry and a no-pendingCompletion retry-finalize test.
- [REV-eedb7bb-5] INFO | Fail-closed duplicate check rejects manifests where the head intentionally re-states step 0 scope (trimmed equality). Recoverable configuration_invalid with remediation hint; README documents the rule. | Accepted observation (intentional fail-closed design per remaining-work-plan L19-34).
- [REV-eedb7bb-6] LOW — **RESOLVED (follow-up commit)** | the orphaned duplicated doc-comment block above wsGuidance() removed.

## Tracked Follow-ups (2026-10-02, Independent Review 7edef62 — feature/rev-us2-f2f3f4, REVIEW APPROVED, 0 HIGH/CRIT)

- [REV-F2F3F4-1] LOW — **RESOLVED (feature/fr053-approval-gate)** | applyExposure summary_and_errors now lets warnings through (content/data still suppressed; status_only/summary/none unchanged) — node_deps_hint reaches the agent; a PolicyEngine test + a composite end-to-end in approval-gate.test.ts.
- [REV-F2F3F4-2] LOW — **RESOLVED (feature/f0531-gds7-cleanup)** | the description in all three catalogs made precise: the via-label '(audit note; visible in run history)' — drift-guard-tracked.
- [REV-F2F3F4-3] INFO | an uncommented cosmetic change in the commit: the composite failure summary join changed from `errors.join("; ")` to `errors.join(";")` (OperationEngine.ts:204) — no test pins the format, no consumer impact. | Trigger: none. | Accepted.

- [DEPLOY-015c] MEDIUM (NEW 2026-10-01): the container test suite crashes at vitest worker teardown: a `node::RemoveEnvironmentCleanupHook` assert (`env != nullptr`), 2–5 workers per run, deterministic (forks/threads, with/without file parallelism affected respectively; the tests themselves 108–113/118 green). Suspicion: the node 24.21 container binary × a native addon (better-sqlite3/sharp) teardown. Consequence: the `test` gate moved back to required:false, the WSL suite remains authoritative. | Trigger: the next container/node upgrade cycle OR a debug session for the teardown crashes. | Action required: narrow the cause (which addon registers the cleanup hook; a node version bisect; possibly a vitest pool config in the repo) and then pull test back to required:true. |

## Tracked Follow-ups (2026-10-02, Independent Review 5d782c9 — feature/fr053-approval-gate, APPROVED, 0 HIGH/CRIT)

- [REV-F053-1] LOW — **RESOLVED (feature/f0531-gds7-cleanup)** | the four op-by-op lifecycle loops (activateSession beforeEnter, runAfterEnter, beforeEnterIds, afterExitIds) now validate the ENTIRE list before the first execution (all-or-nothing); consumption remains success-based per op. Regression tests: the pre-loop denial names the later gated op, no op runs, earlier grants are preserved.
- [REV-F053-1b-1] INFO (Independent Review 588fa62 — feature/f0531-gds7-cleanup, APPROVED, 0 HIGH/CRIT) | cosmetics: the comment text of the REV-F053-1 marker in the afterExit loop is wrongly indented (WorkflowEngine.ts:2622 — 8 spaces instead of 4, introduced in the fix commit). purely optical, no behavior or lint impact. | Trigger: the next touch of the afterExit block in WorkflowEngine.ts. | Action required: correct the indentation to 4 spaces.
- [REV-F053-2] LOW — ACCEPTED (observation) | the gate trusts the declared riskClass of the operation config: a profile author can declare workspace-writing composite steps as read_only and thereby bypass the ceremony. Config authoring is the established trust boundary (the same assumption as invocableByAgent/required). | Trigger: the next change to the composite schema or the gate logic. | Action required (optional): check composite steps against a declarative step riskClass (max over steps) instead of only the op level.
- [REV-F053-3] INFO | consumeApprovals writes approvedOperations back from the array loaded at call start (update loads fresh but replaces the field). A parallel approval_granted during a running run would be a lost update — practically unreachable since grants require status=blocked and ops status=active (the runningOps lock). | Trigger: if the status check in resumeWorkflow is ever relaxed. | Accepted observation.

## Tracked Follow-ups (2026-10-02, Independent Review c371f7e — feature/approval-policy-config, APPROVED, 0 HIGH/CRIT)

- [REV-APPCFG-1] LOW — ACCEPTED (re-scheduled) | the REV-F053-2 trigger FIRED with c371f7e (this commit changes the gate logic: requiresApproval resolves from policies.approvals), but the optional action (check composite steps against a declarative step riskClass — max over steps instead of only the op level) was NOT implemented. The gate still trusts only the op-level riskClass; under the default 'allow' for workspace_write the impact of a wrongly declared composite step riskClass does not increase further (the profile author could already declare the op level before — config authoring remains the trust boundary). | Trigger: the next change to the composite schema, the gate logic OR when a 'require' default for workspace_write is reintroduced. | Action required (optional): derive max(step riskClasses) as the effective op riskClass or explicitly and finally accept with rationale.
- [REV-APPCFG-2] INFO | the workflow-level ceremony coverage pins the 'require' path only via the riskClass workspace_write require fixture; destructive/credential_sensitive are not covered at workflow level by a require-node fixture (only unit level via policy-engine.test.ts defaults + fallback assertions). Since assertApprovals runs class-agnostically over the resolved approvals map, the coverage is sufficient. | Trigger: the next change to assertApprovals/ceremony. | Accepted observation.

## Tracked Follow-ups (2026-10-02, Independent Review 283fc74 — feature/registry-register-default-on, APPROVED, 0 HIGH/CRIT)

- [REV-RRDO-1] LOW — RESOLVED (9f7bc5f) | no test asserted that `tools/list` EXCLUDES `registry_register` when `registryRegister.enabled: false` — the tool-list gate branch (register-tools.ts, isRegistryRegisterEnabled) is covered only indirectly via the engine level; with the default flip the negative branch is now the non-default one. | Trigger: the next change to register-tools.ts / ToolHandlers.ts. | Action required (optional): add an opt-out tool-list assertion in tools-registration.test.ts.
- [REV-RRDO-2] LOW — RESOLVED (9f7bc5f) | no test asserted that the scaffold (scaffold.ts) and the config assistant registry edit (ConfigAssistant.ts) emit `registryRegister: { enabled: true }`; the shipped-configs tests check only loadability. | Trigger: the next change to scaffold.ts / ConfigAssistant.ts. | Action required (optional): add an emission assertion (a regression would currently only show indirectly via tool-surface tests).
- [REV-RRDO-3] INFO | HTTP exposure of registry_register is now the default on all instances (loopback, without auth) — deliberate, bound to isChild/flag/build validation; the local threat model unchanged (a direct guidance.json edit is equivalent). | Trigger: if loopback endpoints are ever exposed auth-free beyond the container. | Accepted observation.
- [REV-RRDO-4] INFO | the opt-out test (tools-registration.test.ts) does not close the optOutServer in the finally (only the client) — pattern-consistent with the unclosed modular beforeEach server; in-memory transport, no cross-test state observed. | Trigger: if a vitest teardown crash (the DEPLOY-015c pattern) strikes here. | Accepted observation.
- [REV-RRDO-5] INFO | `not.toContain("registry_register")` in the opt-out test is redundant to the exact equality assertion — deliberately left as intent documentation. | Trigger: n/a. | Accepted observation.
- [x] FR-FINAL-1 LOW — RESOLVED (the hash fix commit, this one) | the final review (sub-agent aa18d064, APPROVED 0 HIGH/CRIT) found: activeContext/remaining-work-plan referenced the pre-amend hash 98cb690 instead of the predecessor hash 9f7bc5f (reachable only via the reflog). Hash references corrected; the factual content of the claims was correct.
- [x] FR-FINAL-2 INFO — RESOLVED (committed on user instruction, without an extra review) | `AGENTS.md`/`CLAUDE.md` in the main checkout modified uncommitted (an identical +11-line block "## CLI" with a GitNexus skill table — presumably a byproduct of a gitnexus/AGENTS-guide merge). Outside the session scope; clean up before the next commit (commit or discard). | Trigger: the next meta-docs commit or a user instruction. | Action required: user decision.
- [x] FR-FINAL-3 INFO — ACCEPTED | Prettier reformat churn in scaffold.test.ts (~80 of 109 lines, purely formatting) — consistent with the mandatory prettier rule, no behavioral difference.

## Tracked Follow-ups (2026-10-02, session-fae2aa34 — feature/guidance-registry-hot-reload-deps-preflight)

- [x] PREFLIGHT-DEPLOY MEDIUM — RESOLVED (recreated by the user, 2026-10-02) | the running guidance container still runs on the old build (dist); both fixes (the registry live provider, the deps pre-flight) only take effect after `docker compose build guidance && docker compose up -d`. | Trigger: before the next Niyama dummy workflow or the next deployment window. | Action required: rebuild + recreate, then a live check (registry_register → start_workflow without a restart).
- [PREFLIGHT-SCOPE] INFO | the pre-flight hooks only at the two WorkflowEngine lifecycle gate sites (beforeEnter activation, beforeExit submit); run_operation/agent-initiated ops deliberately run without an auto pre-flight (the agent sees deps hints reactively). | Trigger: if gates ever run over further paths (e.g. a new executeRequired call site). | Accepted observation.
- [REV-PREFLIGHT-1] MEDIUM→RESOLVED (this commit) | Independent Review 1eb58118: no fail-open regression test; composedView.workspaces in server.ts still held a frozen snapshot (unused for reading, but treacherous). Fixed: a live getter + a fail-open test (deps-preflight.test.ts, failing deps-install → resolves, the audit failed:true). | Trigger: n/a (resolved). | —
- [REV-PREFLIGHT-2] LOW | preflightLocks: serialization only per process — a stdio and an HTTP instance can theoretically run npm in parallel into the same tree; no workspace-lock.ts file lock integrated. | Trigger: if guidance ever runs per workspace in several processes. | Action required (optional): WorkspaceOpLock integration or a documented single-process guarantee.
- [REV-PREFLIGHT-3] LOW | no test for two simultaneous runDepsPreflight calls on the same root (chaining logically verified, not pinned). | Trigger: the next change to runDepsPreflight/preflightLocks. | Action required (optional): a Promise.all test with an execution counter.
- [REV-PREFLIGHT-4] LOW | beforeExit marks gate ops as "running" BEFORE the pre-flight — a long npm install shows the gates as running; the lockfile heuristic knows only package-lock.json (yarn/pnpm/bun remain reactive). | Trigger: the next change to the submit gate order or lockfile support (npm-only per the scope decision). | Accepted observation + an optional order harmonization.
- [REV-FINAL-PF-1] LOW | the lock body of runDepsPreflight does not re-check nodeDepsStale — N gates on the same root run N× deps-install sequentially (correct, but redundant). | Trigger: the next change to runDepsPreflight. | Action required (optional): double-checked locking (a re-check in the body).
- [REV-FINAL-PF-2] LOW | the preflightLocks map is never emptied (growth per distinct root over the process lifetime, practically small). | Trigger: the next change to preflightLocks. | Action required (optional): a settle-and-delete-current cleanup.
- [REV-FINAL-PF-3] INFO | the automatic pre-flight is a scope extension vs. specs/015 US2 (there only operations + reactive hints); README-documented, a spec addendum recommended. | Trigger: the next specs/015 edit. | Action required (optional): add an AC addendum "automatic pre-flight".
- [REV-FINAL-PF-4] LOW | deps_preflight audit asymmetry: success leaves only the start event (the outcome is in recordDownstreamState), failure additionally a failed:true event; the README documents only the failure event. | Trigger: the next change to the pre-flight audit or the README section "Automatic dependency pre-flight". | Action required (optional): a terminal status event also on success + a README sentence.

## Tracked Follow-ups (2026-10-03, Independent Review fe25128 — WIZ-4 workspaceNameHint)

> Review of commit fe25128 (feature/wiz-config-assistant-rework). Verdict: APPROVED,
> 0 open HIGH/CRITICAL. The following LOW/INFO findings are tracked as follow-ups.

- [REV-WIZ4-1] LOW — RESOLVED (review-fix commit, same branch) | a duplicated assertion + a misleading comment in the test "injects the composed default..." removed; only one nextQuestion assertion remains. | — | resolved
- [REV-WIZ4-2] LOW — RESOLVED (review-fix commit, same branch; the expected behavior empirically clarified) | test added: callTool WITHOUT an arguments field → the SDK layer (protocol validation, before our zod schema) answers isError:true + "MCP error" — prior behavior, which the test now pins. | — | resolved
- [REV-WIZ4-3] INFO | `workspaceRootDefault` trims only a trailing `/`, not `\` — a Windows-like env value (e.g. `D:\repos\`) would produce `D:\repos\/hint`. Spec-conformant (container paths are POSIX, no plausibility check per variant ii); a pure observation. | Trigger: if GUIDANCE_WORKSPACE_ROOT should ever carry Windows paths too. | Accepted observation.
- [REV-WIZ4-4] INFO | `callStart` in the test closes only the client in the finally, not the server side of the InMemoryTransport pair — harmless in vitest, can accumulate handles on long runs. | Trigger: the next change to the contract test helpers. | Action required (optional): add `server.close()`.

## Tracked Follow-ups (2026-10-03, Chained WIZ Workflow session-b1c62520/b22053ef — workflow problems, user instruction)

> Context: WIZ-4 is FINISHED (session-b1c62520 completed, commits fe25128 +
> 0f829ed on feature/wiz-config-assistant-rework). The successor cycle
> (session-b22053ef, steps[0] duplicate) was aborted on user instruction.
> Open chain: steps[1..3] = WIZ-2, WIZ-1, WIZ-3 — see WF-6.

- [WF-1] MEDIUM (action required — infrastructure) — **RESOLVED (2026-10-03, feature/wf-followups, documentation fix)** | **Clear-thought server answered with request timeouts on direct calls:** diagnosis (2026-10-03): container healthy (`docker ps` + `/health` → ok), container logs over 24 h without a SINGLE timeout/error record — the server never sees the failed direct calls; the same `sequential_thinking` call via the container route (`call_downstream` serverId `clearthought`) answered immediately with full structuredContent. The root cause therefore lies in the editor MCP client connection (the Zed context-server transport to localhost:3000) — OUTSIDE our code/config; our downstream config (requestTimeoutSeconds 120, reconnect) is correct and proven live. Attribution to the editor client is an INFERENCE (the server side proven healthy; revise if a future direct call works after an editor update). Fix: the container route documented as the sanctioned path — AGENTS.md "Clear-Thought availability (WF-1)" (a hand-written section, the generated guide block untouched per RB-2, backup AGENTS.md.bak); the responses.json timeout policy (container route + a one-time curl fallback) already existed. | — | resolved (documented workaround, sanctioned path) |

- [WF-2] MEDIUM (action required — infrastructure/ergonomics) — **RESOLVED (2026-10-03, feature/wf-followups, guidance-only)** | **Guidance MCP calls time out on long state transitions:** the submit-once-then-poll policy anchored: (1) responses.json — the verify and complete phases (example default-guidance + instance) carry the rule "submit ONCE; on timeout do NOT retry (single-flight lock), instead poll get_workflow_state"; (2) README (server-guidance) — a new section "Long state transitions: submit once, then poll" with a 1-2-step guide and a reference to the container-route fallback rule; (3) the engine semantics deliberately UNCHANGED (synchronous; the requestId ledger makes re-submits safe) — an async job pattern remains an optional follow-up if poll discipline does not suffice in production. | Trigger: none open; the rule active from now. | resolved (guidance/ergonomics fix).

- [WF-3] HIGH — RESOLVED (environment repair in this session, but the cause is cross-repo) | **verify gate build failed at the repo root:** `npm run build --workspaces` aborted with `tsc: not found` (exit 127) — ALL 4 workspaces had no `node_modules/.bin/tsc` (insight, stochastic, clear-thought, guidance); PRE-EXISTING, NOT caused by the WIZ-4 diff (the guidance workspace build itself green, 559/559 tests). Fix: `npm install` at the root (hoisted typescript bins into root node_modules/.bin, root build exit 0). | Follow-up WF-3a: `npm install` collaterally changed `yarn.lock` massively (2667+/4456−) — reverted; the root uses npm (package-lock) AND yarn.lock coexisting: a source of instability. **WF-3b RESOLVED (2026-10-03, user decision Option A):** yarn.lock stays the source of truth; reinforcements implemented: the root package-lock already gitignored (present), a rule in AGENTS.md ("root installs ONLY yarn install; npm only workspace level + npm run; a yarn.lock diff in a feature branch = review warning signal") + a README quick-start note. | Trigger: none open; the rule active from now. | resolved.

- [WF-4] MEDIUM (action required — process gap) — **RESOLVED (2026-10-03, feature/wf-followups, guidance-only)** | **final-review-gate with STALE evidence from a predecessor session:** the complete phase now instructs the agent EXPLICITLY to write `.guidance/state/final-review.json` FRESH per session — in responses.json (instance + example default-guidance, the complete mandatory-field list + schema reference to check-final-review.mjs + the 40-hex requirement for headCommit/commits + a re-blessing rule after late commits + the validator command) and as an additional requiredAction entry. The open design question from entry (b): the gate stays with the headCommit comparison (cross-session evidence allowed if headCommit == HEAD); strict sessionId matches would be harder, but the re-blessing path + headCommit == HEAD deterministically covers the observed failure case ("commits landed after the review"). | Trigger: none open; the rule active from now. | resolved (guidance/process fix).

- [WF-5] LOW (action required — ordering trap) — **RESOLVED (2026-10-03, feature/wf-followups, code fix chosen)** | **index-freshness vs. vitest artifacts:** DECISION: test tooling artifacts are excluded from the freshness check (deterministic, testable — instead of relying on ordering discipline). Root cause: SKIP_DIRS applied only at the top level (`depth === 0`), a nested `servers/*/node_modules/.vite/vitest/results.json` counted as the newest source. Fix in check-index-freshness.mjs: `isSkipped` checks EVERY path segment against SKIP_DIRS; the redundant depth-0 check is gone; the header comment updated. Verification: after `touch`-ing results.json the script still reports the real source, not the artifact. The README documents the exclusion + the ordering rule (reindex after the last test run, directly before complete_workflow) as a defensive second line. | — | resolved.

- [WF-6] HIGH (action required — open scope + process lesson) — **RESOLVED (2026-10-03, closeout)** | **Chain-head scope trap: the successor duplicated steps[0].** The WIZ chain is COMPLETELY implemented and on develop: WIZ-4 (fe25128+0f829ed), WIZ-2 (94ee3be+a42b404), WIZ-1 (f482dc8+7b01463), WIZ-3 (05b0811+b329935) — see the section "WIZ series IMPLEMENTED" below. The lesson (head request = its own scope; omit steps[0] or implement nothing from steps under the head session) is persisted in memory-bank/lessonsLearned.md (section "2026-10-03: Guidance chained-workflow lessons (session-b1c62520/b22053ef)", bullet "Chain-head scope trap (WF-6)") — verified 2026-10-03. ADDENDUM (session-2f55537b, feature/wf-followups): constructively hardened — (1) the level-1 guard already on develop (CHAIN replay: request === steps[0].request → configuration_invalid fail-closed, tests in retry-finalize.test.ts), verified instead of newly implemented; (2) NEW: a CHAIN HEAD SCOPE annex in guidanceFor for chained heads (chainFrom === null + steps) secures the discipline form of the trap on the guidance side; 4 regression tests (8/8 green); README section "Head-session scope rules". | — | resolved + hardened (fail-closed guard + guidance annex).

## Tracked Follow-ups (2026-10-03, Config Assistant Rework — WIZ series, requirement concretization open)

> Plan for four assistant improvements. Implementation only after clarifying
> the open questions listed per entry (user). STATUS 2026-10-03 (evening):
> WIZ-4 IMPLEMENTED + COMPLETED (feature/wiz-config-assistant-rework,
> fe25128 + 0f829ed, all gates green). WIZ-2/1/3 OPEN — resumption
> of the chain see WF-6 (above). Feature branch, requirements clarified.

- [WIZ-0] META | planning/order + server outage note: the clear-thought reasoning server ran with request timeouts during the planning appointment (2× sequential_thinking) — structured planning therefore happened inline. Order proposal: WIZ-4 + WIZ-2 (small, self-contained) → WIZ-1 → WIZ-3 (largest semantic impact). WIZ-1 and WIZ-3 both change the question catalog (`src/setup/ConfigAssistant.ts` + README + contract tests) — merge in one branch if possible to avoid merge conflicts. | Trigger: start of implementation. | Action required: user decision on order/branch strategy.

- [WIZ-1] MEDIUM — **requirements clarified (2026-10-03, user), ready for implementation** | **merge target modes: the `target` question (repo-config vs. registry-edit) is dropped.** Rationale (user): `registry-edit` alone is purposeless (it creates only a registry line without the repo becoming usable); `repo-config` alone leaves the repo unregistered (`workspace_not_registered`). Target picture: ONE assistant pass creates (1) the repo-local `.guidance/` process config AND (2) the workspace registry entry `{ name, root, projectName }` for the instance. The `extraWorkspaces` question is dropped entirely (registration happens per repo in the same run); the `workspaceRoot` question keeps its meaning with a NEW sense: the container path of THIS repo (e.g. /workspaces/Thinking-MCP) as the registry `root` instead of the instance root. The workspace `name` is derived from `projectName` (the name pattern `^[a-z][a-z0-9-]{0,63}$` must be validated against `projectName`). Implementation touches: `ConfigAssistant.ts` (remove QUESTIONS target/extraWorkspaces, new workspaceRoot help, generateFiles: repo file set + registry snippet), scaffold.ts, README ("Path 2" becomes one run), contract tests.
  | **Decisions (user, 2026-10-03):** (1) The AGENT performs the registry merge (a generated snippet + a merge instruction in notes[]; the server still never writes files). (2) Remote mode: the registry step dropped there / replaced by a hint (registration runs via init_session). (3) The path existence check IS performed: the agent must later be able to access the path, so the wizard/agent flow validates existence before output (not only at loadConfig). (4) The registry step optional via a yes/no question — if no instance root exists: "Registry does not exist — should it be created initially?" (on yes: have the instance guidance.json created anew instead of merged).
  | Trigger: implementation start WIZ-1 (recommended after WIZ-4/WIZ-2). | Action required: implementation + contract tests (merge snippet form, path validation hint, registry initial-creation branch).

- [WIZ-2] LOW — **requirements clarified (2026-10-03, user), ready for implementation** | **determine `projectName` automatically and present it as a suggestion.** Decisions (user): **route (b)** — server-side: a new optional start parameter on `setup_guidance_start` (e.g. `workspaceNameHint`) that the agent passes at start (derived from the package.json/Cargo.toml/pyproject.toml `name` field, otherwise the repo directory name); the server embeds it as a structured `default` in the question object `projectName`. **Confirmation obligation (variant i):** the agent NEVER answers on behalf of the user — it presents the suggestion to the user; the user confirms or overrides the name (the "do not answer on my behalf" principle is preserved).
  | Additional requirement (via WIZ-1): the derivation must guarantee kebab-case (`^[a-z][a-z0-9-]{0,63}$`, `default` reserved) — manifest names like `@paschbaer/guidance` or `server_guidance` must be normalized, since the projectName is now used twice (project.name + workspace registry name). Implementation touches: `register-setup-tools.ts` (start parameter), `ConfigAssistant.ts` (default injection into QUESTIONS/catalogOverview), README wizard text (derivation/confirmation rule), contract tests (hint set/empty/invalid).
  | Trigger: implementation start WIZ-2 (recommended after WIZ-4). | Action required: implementation.

- [WIZ-3] MEDIUM — **requirements clarified (2026-10-03, user), ready for implementation** | **remove the workflow profile `plain`/`spec-kit`; register all tools by default.** Target picture: the `profile` question disappears from the assistant; every instance registers the full tool scope from the factory (standard workflow + 12 Spec-Kit tools, chain Form A AND B). The usage decision (whether a workflow uses Spec-Kit artifacts) shifts into the agent's runtime context — no longer a setup-time decision.
  | **Decisions (user, 2026-10-03):** (F6=6a) remove the `profile` field from guidance.json COMPLETELY (schema exit) — old files with `profile:"plain"`/`"spec-kit"` must keep loading without the field (additionalProperties: unknown-field tolerance or explicitly allowing + ignoring, to avoid the CHN-2 restart break). (F7=7b) chain behavior: BOTH forms (A + B) always allowed as long as `chain.enabled: true` — the form is decided per chain by the manifest form (steps vs. source), no more profile coupling. (F8) 12 Spec-Kit tools always in the client tool listing: accepted (documented).
  | Implementation touches: `ConfigAssistant.ts` (remove QUESTIONS profile, out of DERIVED_IN_ADOPT), scaffold.ts/generateFiles (guidance.json without profile), loadConfig schema (field exit + old-file tolerance), register-tools/tools-registration (unconditional Spec-Kit registration), chain engine (decouple form enablement from the profile, adapt the §12/FR-119 tests), adopt path (ignore the reference profile instead of blocking), builtin template, README, contract tests.
  | Trigger: implementation start WIZ-3 (last in the series; larger semantic impact). | Action required: implementation + a migration test (an old guidance.json with profile loads), tool-count update (http-transport count asserts), chain tests for both forms without a profile.

- [WIZ-4] LOW — **requirements clarified (2026-10-03, user), ready for implementation** | **pre-fill `workspaceRoot` automatically as a suggestion.** Meaning after WIZ-1: the container path of THIS repo (registry `root`). Default composition: `GUIDANCE_WORKSPACE_ROOT + "/" + workspaceNameHint` (e.g. /workspaces + thinking-mcp → /workspaces/thinking-mcp); the repo name from the same source as WIZ-2. **Decision (user): variant (ii) simple** — env set AND name present → set the default; otherwise no suggestion. No additional plausibility logic: deviations (a case mismatch à la KA-4, a differing mount name, a repo outside the pool) are corrected by the user/agent via the confirmation obligation; the path existence check from WIZ-1 (decision 3) catches bad suggestions before registry admission. Implementation touches: `register-setup-tools.ts` + `ConfigAssistant.ts` (default injection into catalogOverview/QUESTIONS, shared with the WIZ-2 mechanism), contract tests (default set/env missing/name missing).
  | Trigger: implementation start WIZ-4 (the FIRST step of the series, shares the name derivation with WIZ-2). | Action required: implementation.

## 2026-10-03 (evening): WIZ series IMPLEMENTED — feature/wiz-config-assistant-rework (chain session-7876f096, 3 sessions)

- [WIZ-4] RESOLVED (fe25128+0f829ed, session-b1c62520 completed) | workspaceRoot default from GUIDANCE_WORKSPACE_ROOT + workspaceNameHint (variant ii).
- [WIZ-2] RESOLVED (94ee3be+a42b404, session-7876f096 completed) | projectName default from a normalized workspaceNameHint (normalizeProjectName: scope strip/kebab/edge trim); the confirmation obligation ruled in the README.
- [WIZ-1] RESOLVED (f482dc8+7b01463, session-abe752d7 completed) | target/extraWorkspaces questions removed; registerWorkspace (mandatory) → workspaces[] merge snippet in notes; existence validation before emission; remote → init_session hint.
- [WIZ-3] RESOLVED (05b0811+b329935, session-57412c1b completed) | profile removed: schema exit with legacy tolerance (`profile: true`), all 16 Spec-Kit tools registered unconditionally (tool count 24→40), chain Form B decoupled.
- [WF-3b] RESOLVED (7a4ca41) | Option A: yarn-only root installs (AGENTS.md rule + README).
- [REV-FINAL-F3] LOW | validateAdoptReference still enforces legacy profiles/<profile>.json for non-plain legacy references, although generateFiles ignores refGuidance.profile — inconsistent tolerance. | Trigger: the next touch of validateAdoptReference. | Action required (optional): adjust the tolerance + a test.
- [REV-FINAL-F4] LOW | stale wizard answer keys (target/extraWorkspaces/profile) are silently ignored; old answer sets fail cleanly on a missing registerWorkspace (tested), but the stale-key behavior itself is unpinned. | Trigger: the next change to toAnswerRecord/requireCompleted. | Action required (optional): a test.
- [REV-FINAL-F5] LOW | legacy workflow.json with workflow.profile tolerated (raw read), but unpinned. | Trigger: the next change to the workflow load. | Action required (optional): a test.
- [REV-WIZ1-2/3, REV-WIZ3-3, REV-WIZ3-5] LOW/INFO | as tracked in the review (pool name coverage, boolean-answers looseness, a vestigial if-throw, the Form-B child engine bridge PRE-EXISTING CHN-4 family). | Trigger: per next touch. | Accepted with rationale.

**Open:** merge of the branch to develop (review approved, 0 HIGH/CRITICAL); push; container rebuild for the new tool surface (40 tools); WF-1..WF-6 (see above) remain as infrastructure follow-ups.

## 2026-10-03 (fault_tree top-gate fix — feature/fix-fault-tree-top-gate, session-a9c2d5b6)

- [FT-AXRAY-DE] LOW | assumption_xray supports German markers (alle, jeder/jede, immer, mindestens, höchstens, wird … müssen) as pattern additions in HEURISTICS or a language layer; note-fix (English-only disclosure) is done in this branch. | Trigger: next touch of assumption-xray.ts HEURISTICS or any i18n request for assumption_xray. | Action required (optional enhancement).
- [FT-CHAIN-DUP] RESOLVED | the steps[0] successor (session-672585e2) completed as a verification-only cycle (0 changes/commits, all gates green); steps[1] (implementation) never started — the chain's duplication risk thereby stood down.
- [FT-COMMIT] RESOLVED | feature/fix-fault-tree-top-gate committed on the feature branch (push/merge still awaiting user approval).
- [FT-FT-F1] MEDIUM | fault_tree multi-root fallback (>1 unreferenced non-basic gate) silently resolves to the last unreferenced gate — inconsistent with the fail-closed name-ambiguity stage; either enforce uniqueness (error) or expose top_gate_candidates. Behavior is documented in code and pinned by test; no merge blocker. | Trigger: next touch of fault-tree.ts resolution logic or first real multi-root use case. | Action required (design decision, owner decides error vs transparency).

## Tracked follow-ups from feature/severity-gate-review-findings (session-4e869880)

- **REV-GATE-6 / F-05 (LOW, accepted observation)** — Severity gate detects review phases indirectly (any phase with a reason-transition whose valid payload carries findings). With a CUSTOM workflow defining multiple reason-transitions per phase or a findings-bearing non-review phase, the first reason-transition could mis-select the loop target. Unreachable with all shipped workflows (schemas are additionalProperties:false without findings). Trigger point: when a custom workflow.json with multi-reason-transition phases is introduced — then restrict gate to explicit phase ids or per-transition matching. Observation documented in reviewGateReason docstring; no action required now.
- **YARN-LOCK-TRAP (process, mitigated)** — npm ci/install in member dirs or at root drifts/prunes the yarn-managed root tree (root package-lock.json is stale). Trigger point: ANY npm invocation in this repo — check `git diff --stat yarn.lock` and root node_modules sanity (node_modules/.bin/tsc) afterwards; root installs ONLY via corepack yarn. Documented in memory-bank/lessonsLearned.md (2026-10-03).
- **Merge/push of feature/severity-gate-review-findings** — pending user approval (AGENTS.md merge rules: rebase to develop, squash on main).

## Tracked follow-up: FINAL-REVIEW-RELOOP (design gap, accepted 2026-10-03)

- **Finding:** Completion-phase fixes have no re-review cycle. The final-review gate (check-final-review.mjs, beforeExit of `complete`) blocks completion on open HIGH/CRITICAL findings, but there is no reason-transition from `complete` back to `implement` — the agent fixes inside the completion phase and no review phase re-runs over those fixes. Integrity relies solely on the gate's strictness (FR-122 HEAD coverage + recomputed openHighCritical), which invalidates stale evidence but does not review the fix code itself.
- **Trigger point:** Next scope that touches the completion phase, the workflow state machine (WorkflowEngine.selectTransition / completeWorkflowLocked), or final-review gate semantics — owner must implement or explicitly re-schedule then.
- **Proposed design (to be specced):** reason-transition `{ to: "implement", reason: "final_review_changes_required" }` from `complete` (and symmetric `plan` option for plan-level findings), driven by the same blockingSeverities evaluation as the review-phase gate (REV-GATE feature 6b5fb3b); completion then re-enters the full implement → review_and_fix_implementation → verify → complete cycle, giving the fixes a real review pass. Loop counter + audit event pattern reusable.
- **Action required:** yes (design decision documented by user 2026-10-03: the missing review of completion-phase fixes is a problem worth solving).

## Tracked Follow-ups (2026-10-03, Spec-Kit Pool Mode Wiring — SKP-1)

- **Finding SKP-1 (HIGH):** Spec-Kit tools are not functional in HTTP pool mode (container, `GUIDANCE_WORKSPACE_ROOT=/workspaces`, `createConfiguredServer` in `servers/server-guidance/src/server.ts`): `discover_spec_kit_feature` returns `spec_kit_feature_not_found: feature root missing: specs`, because `registerSpecKitTools` is registered there without `getSessionWorkspace` — the resolver falls back to the pool root `/workspaces` instead of the session root (`SpecKitEngineResolver.resolve`, `register-spec-kit-tools.ts` L138-144). The stdio entry `src/index.ts` L43-49 has the correct wiring. Live verified (session-67778fe9): workflow/phase/`get_spec_kit_status` OK, only feature discovery breaks.
- **Trigger point:** Every guidance workflow in pool operation that uses Spec-Kit discovery/artifacts (`discover_spec_kit_feature`, `import_spec_kit_artifacts`, `refresh_spec_kit_artifacts`, `get_spec_kit_status` discovery paths). Also the T6 discrepancy in `specs/008-multi-workspace/tasks.md` (marked [x], implemented only stdio-side).
- **Resolution:** IMPLEMENTED (255bfd2, feature/speckit-pool-mode-wiring) — see activeContext.md 2026-10-03 entry. Live-verified: discover_spec_kit_feature resolves /workspaces/Thinking-MCP/specs/008-multi-workspace in pool mode. Independent review (sub-agent bd833a54, fresh context): APPROVED, 0 unresolved CRITICAL/HIGH.
- **Status:** closed (fixed). Residual follow-ups: SKP-2 (test wiring-depth gap, MEDIUM) and SKP-3 (SpecKitEngine.ts:221 Windows separator, LOW, pre-existing) below.

## Tracked Follow-ups (2026-10-03, SKP-1 Review — sub-agent bd833a54, APPROVED 0 HIGH/CRIT)

- **SKP-2 (MEDIUM, test-depth gap) — RESOLVED (2026-10-03, chain head session-05e744f9):** tests/contract/speckit-pool-wiring.test.ts boots the server through the REAL HTTP entry (createConfiguredServer with a composed pool fixture), registers workspace B via the protocol, starts a workflow session and runs discover_spec_kit_feature with that sessionId — discovery resolves under the session root. Revert-detection PROVEN (SKP2-T3): with the server.ts wiring commented out the happy-path test FAILS (pool-root fallback), restored it passes. Negative case (unknown sessionId -> documented fallback) covered through the same wiring. Regression coverage complete.
- **SKP-3 (LOW, pre-existing):** SpecKitEngine.ts L221 (discoverArtifacts) `resolved.startsWith(ws + "/")` checks only forward slash, while assertInsideWorkspace (L329-341) handles both separators — a native-Windows host would wrongly reject legitimate feature dirs in importArtifacts. Harmless today (tests + container run Linux).
  - **Trigger point:** Only if the guidance server is ever run natively on Windows (not via WSL/Linux container).
  - **Action required:** Align discoverArtifacts with assertInsideWorkspace's separator handling; or accept as observation with rationale.
- **SKP-3 FINAL CLOSURE (2026-10-04, session-1bdb6fee, feature/speckit-artifact-discovery-integration):** Impact analysis + text search revealed discoverArtifacts was DEAD CODE (never wired since 33255fa) — the tracked failure mode could not occur (importArtifacts reaches its guard via assertInsideWorkspace, which already handled both separators). User decision after joint intention evaluation: **C-Full** — discoverArtifacts fully integrated into importArtifacts instead of deleting: (1) shared `isInsideWorkspace` helper (exported) replaces both duplicated guards — fixes the separator bug AND the drift pattern that caused it; (2) unified traversal replaces the inline file-pattern loop + ad-hoc contracts walk — `checklists/**` artifacts now actually import (closing the declared-but-unfulfilled DEFAULT_ARTIFACTS.checklists gap) and config-provided `dir/**` patterns become functional (previously silently skipped at the old `/**` continue); (3) `relativePath` unified to real relative paths — verified zero migration impact (top-level artifacts keep identical values; snapshots immutable; staleness recomputes only over the active snapshot); (4) dead `patternOf` helper removed. Regression coverage: tests/speckit/artifact-discovery.test.ts (15 tests: separator handling incl. native Windows shapes, checklists import, contracts regression, config dir-patterns, empty-artifact findings, required-missing regression, outside-workspace rejection, staleness round-trip, deterministic ordering). Full suite 74 files / 606 tests green.
- **Review-quality note:** Review executed on worktree HEAD cc30e14 with 255bfd2 as review basis; uncommitted lessonsLearned.md change was outside review scope (process tracking, not product code).
- **SKP-1 FINAL CLOSURE (2026-10-04, session-8a3f5bf4):** SKP-2 gap closed by tests/contract/speckit-pool-wiring.test.ts (8c41768, real HTTP entry via createConfiguredServer pool fixture + revert drill). Full suite 73 files / 591 tests green; live pool-mode discovery re-verified on freshly rebuilt container (root compose --build): /workspaces/Thinking-MCP/specs/008-multi-workspace. Fast-forward merged to develop (develop == merge-base d44fc34, 0/4); feature branch deleted. Caveat: merge safety verified against LOCAL develop ref only — no origin fetch possible from this shell (SSH key passphrase unavailable); push will surface remote drift. Only SKP-3 (LOW, pre-existing) remains tracked.

## RESOLVED: YARN-LOCK-TRAP (fixed with regression coverage, feature/yarn-lock-guard)

- **Resolution:** Mechanical guard implemented — `scripts/check-yarn-lock.sh` (POSIX sh) wired as committed pre-commit AND pre-push hook via `.githooks/` (one-time activation per clone/worktree: `git config core.hooksPath .githooks`). Blocks: staged yarn.lock in Yarn-v1 format or unrecognized (positive+negative Berry detection: v1 header OR missing `__metadata:`/generator header), staged yarn.lock deletion, pruned root tree (`node_modules/.bin/tsc` missing while `node_modules/` exists; fresh clones exempt). Regression coverage: `sh scripts/test-yarn-lock-guard.sh` — 7/7 cases green (berry-pass, v1-block, unrecognized-block, deletion-block, unchanged-skip, pruned-block, fresh-clone-skip). hooksPath verified active on the main checkout; the resolution commit itself passed through the live pre-commit hook.
- **Status:** closed (fixed). Residual discipline note stays in AGENTS.md WF-3: after ANY npm/npx contact expect the guard, or check `git --no-pager diff --stat yarn.lock` — the guard catches the COMMIT, not the working-tree drift before staging (restore with `git checkout -- yarn.lock` is still manual).

## Tracked Follow-ups (2026-10-04, SKP-3 C-Full Review Residues — sub-agent a86c3633, APPROVED/BLESSED 0 HIGH/CRIT)

- **SKP-3a (LOW, dedupe-by-path):** importArtifacts dedupes discovered files by path only; a file matching TWO configured type patterns is attributed to the first type in declaration order (old code could emit it under both types). Unreachable with DEFAULT_ARTIFACTS (no overlaps). Trigger point: when a config defines overlapping type patterns and cross-type attribution matters — then dedupe by type+path or document first-wins. Action: required then, observation now.
- **SKP-3b (LOW, multi-pattern semantics change):** a config type listing multiple FILE patterns now imports ALL existing matches (old: first existing candidate only); `artifacts.find(type)` then picks by sorted path, not pattern priority. Unreachable with defaults (one pattern per default type). Trigger point: same as SKP-3a — when a config relies on pattern priority for multi-pattern types, restore first-wins per type or document. Action: required then, observation now.
- **SKP-3c (LOW, double finding for required-but-empty):** an empty required artifact now yields BOTH "artifact is empty" AND "required artifact missing" (old: only the empty finding). Both block validation; message slightly redundant. Trigger point: whenever findings texts are asserted exactly in tests/UI — dedupe by skipping the missing check when an empty entry was recorded. Action: optional polish, no action required now.
- **SKP-3d (LOW, cross-host snapshot portability, pre-existing):** relative() emits host separators; a snapshot taken on Windows restored to a POSIX host reports false "stale" for dir-pattern artifacts. Pre-existing (old contracts walk had the same property); same-host round-trip is correct. Trigger point: only if snapshots become portable across hosts — then normalize relativePath to POSIX separators at snapshot build. Action: required then, accepted now.

- **SKP-3e (LOW, pre-existing, final review 6d009224):** `npx tsc --noEmit` fails with TS2739 in tests/contract/speckit-pool-mode.test.ts:48 (specKitConfig fixture missing maxTasks/maxEntities/maxExcerptBytes) — introduced at base 255bfd2, NOT by this session; vitest does not typecheck, so test suites stay green while the type error persists. Verification blind spot: no typecheck over tests. Trigger point: when `tsc --noEmit` is added to CI/lint gates or the fixture is instantiated with stricter typing — then fix the fixture (add the three fields). Action: required then, accepted observation now.

## Tracked Follow-ups (2026-10-04, specs/016 Reference Implementation — session-62689b13)

- **S016-ADOPT (planned, follow-up scope):** mechanism adoption in `server-insight` + `server-clear-thought` (spec 016 §6 step 2): extract the SSE/progress transport helper + async acceptance wrapper from guidance and wire them in both HTTP servers. Trigger: start of the adoption scope. Action required.
- **S016-RETRY-OP (accepted observation):** `retry_operation` is deliberately NOT included in the async wrapper (spec FR-1 names submit_*/complete_workflow/run_operation). If practice shows that retry runs also hit timeouts, follow up. Trigger: another timeout report for retry_operation.
- **S016-TYPECHECK (pre-existing, already tracked):** speckit-pool-mode.test.ts SpecKitConfig error (commit 7884ba4) — unchanged, not caused by 016.
- **S016-CHAIN-PROGRESS (tracked, LOW):** gate progress hooks are wired in submitLocked (beforeExit/beforeEnter/afterExit), but not in the chain activation paths (activateSession/runAfterEnter). Trigger: progress reports on chain-successor activations or the S016-ADOPT extraction. Action required in the trigger case.
- **S016-RESTART-TEST (tracked, LOW, accepted observation):** the F2 fix (in_flight→interrupted after restart) is design-verified + typechecked, but not covered by an automated restart test. Trigger: S016-ADOPT scope (add a restart fixture test there).
- **S016-N1 (tracked, MEDIUM, re-bless 2026-10-04):** operation-registry get()/allFor() call reconcile() outside the session mutex — a microsecond window after a reboot (a stale save can overwrite a freshly started record). Fix: get/allFor also via mutexFor. Trigger: S016-ADOPT scope or the next registry touch. Action required in the trigger case.
- **S016-N2 (tracked, LOW):** the mutexes map in the OperationRegistry grows unboundedly (one entry per session, no eviction). Trigger: S016-ADOPT scope (add idle cleanup/LRU).
- **S016-N3 (tracked, LOW, coverage gap):** the F2 reclassification and the F3 multi-group cursor have no own contract test (the fixture has only one beforeExit gate); the arithmetic verified by code review. Trigger: S016-ADOPT scope (restart + multi-group fixture tests).

## Tracked Follow-ups (2026-10-04, S016-ADOPT — session-7e49befd)

- **S016-ADOPT (resolution):** adoption implemented in insight + clear-thought (feature/016-adopt-async-sse): shared-workflow as the canonical source of truth + vendored copies with a hash drift guard (no workspace package — a Docker/npm-ci context constraint, see activeContext 2026-10-04). Guidance consumes the shared modules behavior-identically (615/615). CLOSED (fixed).
- **S016-N1 (CLOSED, fixed):** get()/allFor() now reconcile UNDER the session mutex (async); regression: shared-workflow tests/operation-registry.test.ts (a reboot race test + a concurrency test). The guidance call site ToolHandlers.ts switched to await.
- **S016-N2 (CLOSED, fixed):** mutex map eviction in the idle case (identity check against the map value); regression: a mutex eviction test (map empty after 25 sessions).
- **S016-RESTART-TEST (CLOSED, fixed):** a restart fixture in servers/shared-workflow/tests/transition-protocol.test.ts (in_flight with an old bootId → failed/operation_interrupted, persisted, a resubmit creates a new record).
- **S016-N3 (CLOSED, fixed):** a multi-group monotonicity fixture via a new `createCumulativeGateObserver` (a cumulative cursor over gate groups, never restarts at 0; the total monotonically growing).
- **S016-ENV-SQLITE (NEW, pre-existing, environment):** better-sqlite3 native crash at worker exit in insight tests/contracts/evaluation.test.ts + mcp-surface.test.ts (Node 24/WSL, statement destructor at RemoveEnvironmentCleanupHook); seed-lessons flaky under full load. Reproduced on unchanged develop. `npm rebuild better-sqlite3` fixes seed-lessons, not the other two. Trigger: when the insight suite is gated env-wise or the Node version changes — then a Node-LTS(22) verification or establish a container test flow. Action required then, accepted observation now.
- **S016-ENV-TESTHOOK (observation, documented):** the fixture hooks EMMS/CLEAR_THOUGHT_ASYNC_TEST_MIN_DURATION_MS are deliberately env-gated (0 = no effect, mirroring guidance's slow-gate fixture approach); not recorded in the README (test infrastructure, no product behavior).
- **S016-REVIEW-RESIDUES (independent review 6af65578, 2026-10-04):** F1 (HIGH) vendored drift/CRLF — FIXED (sync + LF, hash guards green); F2 (MEDIUM) task ids in the shared-workflow README — FIXED (ids removed); F3 (LOW) SSE test name made precise — FIXED; F5 (LOW) a payloadMatches assertion in insight-AC2 added — FIXED. **F4 (LOW, accepted):** if registry.complete()/fail() fails after a successful handler, the record stays in_flight until process end (F2 reconcile reclassifies at restart); production probability low (a local file write). Trigger: another in_flight latch report in operation/logs — then add a retry in complete/fail. **F6 (INFO, accepted):** the insight registry singleton resolves EMMS_STORAGE_PATH at the first call; later env changes are ignored (harmless in tests, env set in beforeAll). Trigger: if tests ever need to switch the storage path dynamically.
- **S016-FINAL-REVIEW (fresh sub-agent 5eb3da64, 2026-10-04):** R1 (MEDIUM) the insight SSE path scoped async ops to "default" instead of the MCP session (an FR-3 gap in the level-2+3 combination) — FIXED with commit 8efc269ed1eba0a637c3c4aaf1821e2f4f94ab3f (AsyncLocalStorage requestSessionScope, server.ts binds the known session id into the SSE request; regression test: SSE async-accept → a plain-JSON workflow_status poll, same session, sees the record). **R2 (LOW, accepted):** FR-5 is SHOULD — the SSE upgrade deliberately keyed on progressToken instead of Accept alone (406 trap, FR-9); documented as a deliberate deviation in both server.ts + READMEs. **R3 (LOW, tracked):** the clear-thought wrapped set session_save/session_load is infrastructure adoption; the stochastic tools (mcts/bayesian/mdp) are not async-capable. Trigger: the first timeout report for stochastic tools — then extend the wrapped set. **R5 (INFO, accepted):** the clear-thought registry fallback without dataDir uses a process temp dir (records gone per boot); consistent with the process-local session tools. R4 (INFO, accepted): the mapError throw convention is fragile, a return API would be more robust — at the next register.ts restructuring.

## Tracked follow-ups (schema-drift cleanup, 2026-10-04)
- **F1 (low, pre-existing):** specs/014 FR-1101 states the instance config should contain only version/project/workspaces[]/state, but the live pool-root guidance.json also carries chain/orchestration/security blocks (implementation derives registryOnly from the 5 file-refs only). Trigger point: next specs/014 spec amendment or guidance config-schema change. Action: optional spec amendment — accepted observation until then.
- **F8-optional (low):** pool-root guidance.json is CI-invisible; a bad edit only manifests at next restart. Trigger point: next guidance infrastructure scope. Action: consider a boot-smoke/schema-lint for the pool-root config.
- **External-edit watch (medium, cause unknown):** the niyama workspace entry silently disappeared from the pool-root registry during this session (origin not identified). Trigger point: any future guidance session showing unexpected workspace_not_registered. Action: monitor; if it recurs, investigate concurrent writers to D:\repos\.guidance\guidance.json.

## Tracked Follow-ups (added 2026-10-04, downstream status feature)
1. F2 remote/local get_downstream_status contract divergence (remote-tools.ts flat array + required sessionId vs local unwrap/envelope). Trigger: next scope touching the remote surface or remote mode enablement. Action required: unify wire contract (versioned envelope or same unwrap).
2. F5 get_downstream_status declared-state per-call loadConfig for every workspace (no cache). Trigger: pools with >5 workspaces or status polling. Accepted observation: tiny local files; add mtime cache if cost matters. Also extract duplicated workspaces[] type literal.
3. F6 PRE-EXISTING typecheck error tests/contract/speckit-pool-mode.test.ts:48 (SpecKitConfig missing maxTasks/maxEntities/maxExcerptBytes; last touched 255bfd2). Trigger: next typecheck/tooling scope. Action required: align fixture with current schema.

### Added 2026-10-05 (pm-assistant feature, session-b6820e9b)
4. PM-F4 gate-op description wording drift vs scaffold/example ('... via npm.' vs 'build the project'): cosmetic, deps sync pins do not cover gates. Trigger: next scaffold/template lockstep scope. Action optional: unify wording or extend sync-pin FIELDS to descriptions.
5. PM-NOTES accepted observations: pm detection is agent-side (statelessness); yarn target 4+ documented. No action unless users report yarn-1 repos.

### Added 2026-10-05 (adopt deps-op presets, session: chat/fix-adopt-pm)
6. REGENERATED notes for preset deps ops should include the DISCARDED reference args (custom registry flags etc.) so reviewers need not dig up the old operations.json. Trigger: next ConfigAssistant adoption-note scope (reviewer F1, MEDIUM-adjacent advisory).
7. deps-op regression coverage: deps-reinstall + yarn + type-mismatch cases — deps-reinstall now covered (cf457f2); yarn/type-mismatch verified ad hoc by reviewer, not pinned. Trigger: next touch of config-assistant-extensions.test.ts.

## 2026-10-05 — specs/017 tracked follow-ups
- [OPEN] Spec amendment note (FR-3): $include cycle protection is implemented (classified `include_cycle` error + contract test) but NOT spelled out in spec.md §4 FR-3. Trigger point: next spec.md 017 revision or spec-kit-mode follow-up scope — add one sentence to FR-3 ("include cycles fail closed"). Action: required before spec status is bumped to done.
- [OPEN] FR-10 helper currently exists as `nextFeatureNumber()` (unit-tested) but is not yet exposed through any session-facing tool (no session-created feature directories exist today). Trigger point: when a guidance flow starts creating feature directories — wire the helper there and reuse it (never re-derive the rule).
- [ACCEPTED] Review B F5/F6 (low, 2026-10-05): submission_valid approves the final batch without incrementing its review round (rounds count fix loops, not approvals); a skip across `implement` can lead to a spec_kit_batch_gate reject that the agent resolves by re-submitting implement (recoverable, documented in guidance). Trigger point: revisit if batch telemetry shows agent confusion in spec-kit sessions.

## 2026-10-07 — Final-review findings (session-c4ddeb4d, reviewer session 3f843cec; 0 HIGH/CRITICAL)
- [OPEN][medium] Final#1: variantFor swallows workflow_not_found on read paths — a variant file deleted AFTER session creation silently degrades the session to boot-definition behavior (no gates, no cadence). Trigger point: any follow-up on workflow-registry robustness; action: add degradation marker (audit event + get_workflow_state flag) or distinguish legacy labels from broken variants via session-creation metadata.
- [OPEN][medium] Final#2: unreadable/absent tasks.md at verify entry -> no convergence snapshot -> converge loop silently bypassed (standard flow). Trigger point: same scope as Final#1; action: audit event + guidance note when snapshot cannot be taken for a bound verify.
- [OPEN][low] Final#3: escalation path does not persist incremented rounds/passes before blocking (re-derives breach after resume; noisy repeat blockers). Trigger point: next touch of specKitVariantGate.
- [OPEN][low] Final#4: batch upsert matches only unapproved batches — replaying an approved batch id pushes an unapproved duplicate. Trigger point: next touch of implement branch.
- [OPEN][low] Final#5: batch/convergence gating keyed on hardcoded phase names; renamed-phase custom variants lose enforcement. Trigger point: any custom-variant adoption.
- [OPEN][low] Final#6: WorkflowRegistry cache never invalidated mid-process. Trigger point: next touch of workflow-registry.ts.
- [OPEN][info] Final#7: invalid limits values silently default to 5 instead of failing closed. Trigger point: next touch of workflow-registry.ts.
- [OPEN][info] Final#12: main.ts specKitArtifactCheck catch masks non-artifact errors with a misleading reason string. Trigger point: next touch of main.ts bridges.

## 2026-10-07 — Chained run (session-3a03faf2): baseline typecheck RESOLVED
- [RESOLVED] Baseline typecheck speckit-pool-mode.test.ts TS2739 (tracked since 7884ba4, labeled baseline in 017 run): fixture now carries maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536 (commit 01071e9, branch feature/017-final-review-mediums); typecheck 0 errors, targeted test 4/4 green. Final#1/Final#2 remain OPEN — owned by chain successors of this session.
- [OPEN][low] Final-review-baseline obs (session 11f1fef2): maxTasks: 3 in the pool-mode fixture would silently slice task release if a future test in that file exercises batching with >3 ready tasks (release path slices at config.maxTasks; maxEntities/maxExcerptBytes currently reserved, not enforced). Trigger point: any new task-release test in speckit-pool-mode.test.ts — use a non-capping maxTasks there.

## 2026-10-07 — Chained successor 1 (Final#1 RESOLVED)
- [RESOLVED] Final#1 (variantFor silent degradation): creation-time marker variantResolved + sticky variantDegraded flag; workflow_not_found AND corrupt-file resolve errors mark the session (audit variant_degraded once, guidance note, get_workflow_state field) while mutating paths stay fail-closed (configuration_invalid). Tests/workflow/variant-degradation.test.ts (3 cases) + full suite 671/671 green.
- [RESOLVED][evidence] Review finding "sessions.update re-entrancy HIGH candidate" (reviewer session 2f98adcc): REFUTED against source — SessionRepository.update (src/state/SessionRepository.ts L46) is a plain load->mutate->save file write, acquires no lock; identical pattern to reviewGateReason under withLock. No deadlock possible.
- [OPEN][low] Cross-process audit duplication: in pool operation two engine processes can both observe !variantDegraded concurrently and each emit variant_degraded (cosmetic duplicate events; per-process once-guarantee). Trigger point: if audit consumers deduplicate poorly or pool-mode alerting lands.
- [OPEN][low] Final-review Final#1 F1: chain-successor creation site (createChainSuccessorLocked) sets variantResolved but has no dedicated test coverage (marker logic 1:1 identical to the tested startWorkflow site). Trigger point: next touch of chain-successor tests.
- [ACCEPTED][low] Final#1 F2/F6/F7/F8 (final review session 96ebe53c): live-engine cache hides degradation until restart (by design, documented); state-read probe runs for completed sessions too (negligible cost); corrupt-path audit event asserted indirectly via flag; no probe/submit discriminator in the audit event. Trigger point: batch with any future variantFor changes.

## 2026-10-07 — Chained successor 2 (Final#2 RESOLVED)
- [RESOLVED] Final#2 (convergence snapshot silent bypass): snapshot failure with a wired bridge now emits convergence_snapshot_unavailable (audit + sk.convergenceUnavailable + verify guidance note) and the verify gate rejects submit_verification with the classified recoverable error; submission-time retake when tasks.md became importable (recovery without phase ping-pong); unwired bridge keeps the historical standard flow (documented baseline test). Tests in converge-loop.test.ts; full suite 674/674 green (after the retake-resubmit fix).
- [RESOLVED][amended] Final#2 F1 (reviewer 02ab1802, medium): the recovery retake initially classified tautologically against the fresh snapshot — fixed: the retake now rejects once with "snapshot retaken; resubmit" so classification runs honestly against the new snapshot (test extended).
- [RESOLVED] Final#2 F3 (medium): the unwired null-snapshot fallback branch now covered by a dedicated test (forced null snapshot + unwired engine => standard flow to complete).
- [OPEN][low] Final#2 final-review F1 (session e028f587): stale convergenceUnavailable flag/note on verify re-entry — recovery outside verify (implement detour) suppresses the entry retake until the first submission; the guidance note may be stale until then. Trigger point: next touch of verify entry logic or guidance.
- [OPEN][low] Final#2 final-review F3: the entry-guard re-suppression branch (!convergenceUnavailable preventing re-audit on re-entry) has no dedicated test. Trigger point: next converge-loop test batch.
- [ACCEPTED][low] Final#2 final-review F4: sessions.update persists the (possibly stale-read) specKit object reference — pattern-consistent with surrounding code, no regression suspicion.
