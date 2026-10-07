# Decisions

> Chosen option of every `decision_framework` run (Clear Thought project convention).

## merge-servers-2026-09-15 — Zusammenlegung clear-thought + stochasticthinking?

- **Gewählt:** **B — Status quo (zwei Server)**, Merge an explizite Trigger gekoppelt.
- **Frage:** Bringt die Zusammenlegung zu einem MCP-Server einen Vorteil, sodass beide
  gemeinsam (Recipe) genutzt werden können?
- **Toolkette:** `issue_tree` → `swot_analysis` (gewichtet) → `value_of_information`
  (Score 2,03; Top-Unsicherheit: reale Nutzerpräferenz, expected impact 2,5; zweiter:
  Toolset-Abschaltbarkeit 2,4 — sofort per Code-Check aufgelöst: Toolsets kollabieren
  je Familie zu EINEM Tool mit `operation`-Diskriminator) → `decisionframework`
  (Optionen A Merge-als-Toolset / B Status quo / C Hybrid) → stochastisches
  **MDP** (γ=0,9, konvergiert nach 145 Iterationen: Policy **early→separate,
  mature→merge**, V(early)=25,77, V(mature)=35,0; Rewards = Priors, keine Messwerte)
  → `metacognitive_monitoring` (Confidence 0,72).
- **Kernargumente:**
  1. Recipes sind der richtige Anwendungsfall, aber KEIN Merge-Argument: `recipe_runner`
     navigiert nur, die Tools ruft der Client auf — Cross-Server-Chains (clear-thought +
     stochastic) funktionieren heute bereits (Rezept 2 im kombinierten Guide; live
     verifiziert in derselben Agent-Session).
  2. Echte Merge-Vorteile: Wartung (duplizierte Scripts/Dockerfile/agents_guide),
     ein Installations-/Release-Weg, gemeinsame Session (Bandit-runId ↔ WorkflowStore).
  3. Echte Merge-Kosten: Migration + Deprecation zweier live publizierter Pakete
     (npm 0.3.0 / 0.1.1, Smithery 100/100 + 96/100, ghcr, automatisierte Doppel-Pipelines
     existieren bereits) — Nutzen unklar, da unbekannt ist, wie viele Nutzer beide Server
     zusammen installieren.
  4. Die Toolset-Architektur macht einen späteren Merge billig (~1–3 neue Tools,
     kein Schema-Bloat) — Zeitdruck für den Merge existiert damit nicht.
- **Merge-Trigger (bei Eintreten Entscheidung neu bewerten):**
  1. stochastic-Rezepte im `recipe_runner` → Cross-Familie-Session-State wird hart
     benötigt.
  2. Nutzer-Feedback: Setup-Friction durch zwei Config-Einträge.
  3. Sichtbar steigende Duplikations-/Wartungskosten → dann Hybrid (Option C,
     Shared-Infra-Paket) statt Full-Merge prüfen.

## merge-servers-2026-09-15 / Update 1 — Ausführungsentscheidung: Merge (Option A)

- **Auslöser:** User-Entscheidung (2026-09-15): Zusammenlegung wird umgesetzt —
  stochastic-Tools in clear-thought integrieren, `recipe_runner` erweitern
  (Trigger 1 greift damit proaktiv; Update widerspricht der ursprünglichen
  Empfehlung „Status quo" bewusst).
- **Umsetzungsplan:** `memory-bank/plans/merge-stochastic-into-clear-thought.md`
  (Kette: `sequential_thinking` ×4 → `issue_tree` → `creative_thinking` →
  `metacognitive_monitoring`, Confidence 0,82).
- **Design-Kern:** Dual-Registration — individuelles Tool `stochasticalgorithm` mit
  unverändertem Namen/Signaturen (Call-Site-kompatible Migration) + neues Toolset
  `stochastic` (`operation`: mdp/mcts/bandit/bayesian/hmm); `BanditRunStore` als
  SessionState-Domain (Cleanup-integriert); Guide-Konsolidierung via merge mode;
  Recipe-Erweiterung datengetrieben (architecture-decision + neues Rezept
  `decision-under-uncertainty` + 7. Workflow-Prompt); Release 1.1.0 additiv,
  danach Deprecation des stochastic-Pakets (Reihenfolge fix).

## merge-servers-2026-09-15 / Update 2 — Release-Version 2.0.0 (statt 1.1.0)

- **Auslöser:** User-Entscheidung (2026-09-16): Versionsnummer für den Merge-Release
  direkt auf **2.0.0** setzen (Plan sah 1.1.0 additiv vor). Begründung: Merge plus
  anstehende Deprecation eines live publizierten Pakets ist für Nutzer das größere
  Ereignis — der Major-Bump signalisiert das.
- **Umsetzung:** package.json + Factory-ServerInfo auf 2.0.0 (branch
  `feature/release-2-0-0`, Typcheck grün). Session-Export-Envelope-Version bleibt
  bewusst 1.0.0 (Datenformat-Version, Schema unverändert). Root-`package.json`
  (0.0.1, privat/unpubliziert) und stochastic-`package.json` (0.1.1, wird nach
  Release deprecatet; Version-Guard überspringt es) unverändert.

## 2026-10-04 — DEC-SKM-1: Spec-Kit-Modus als Workflow-Variante mit Artifact-Bindung (W5+W1, mit Phasen-Split)

- **Kontext:** Der "Spec-Kit-Modus" war nie real (session-62689b13: metadata `specKitMode` war wirkungslos; Boot-Komposition ist hart standard-development; Spec-Kit = passives 16-Tool-Set). Brainstorming ergab drei Ontologien (Workflow / Policy / Treiber); Nutzer-Entscheidung: W5-Bindung + W1-Auswahl, ABER mit Phasen-Split (damit faktisch ein Workflow-Varianten-File).
- **Entscheidung:**
  1. W1: Workflow-Registry `.guidance/workflows/*.json`, Auswahl via `start_workflow {workflowId}` bei Session-Erstellung (Engine: Definition pro Session statt Boot-Definition; standard-development bleibt Default; rückwärtskompatibel).
  2. Workflow-Variante `spec-kit-development` (Derivat des Standard-Workflows, geteilte Phasen-Definitionen gegen Drift): understand → specify+clarify; plan → speckit-plan; NEU checklist → speckit-checklist; NEU tasks → speckit-tasks; review_and_adjust_plan → speckit-analyze; implement → speckit-implement (+ Task-Tools Mikro-Loop); review_and_fix_implementation bewusst ungebunden; verify → speckit.converge; complete ungebunden.
  3. Bindung = Instruktionsschicht (Phasen-Guidance nennt die Commands) + DURCHSETZBARES Artifact-Gate (Exit nur wenn Artefakt existiert und sauber importiert; Fail-closed, retry_operation als Recovery).
  4. Modus ist ATTENDED: Clarify-Fragen über report_blocker (requiresUserDecision), Phase pausiert bis zur Nutzerantwort.
  5. Generelle Skip-Regel: Existiert das Exit-Artefakt einer gebundenen Phase bereits (und importiert sauber), Skip via Transition-Reason `artifacts_present`, protokolliert in der Session → ergibt idempotentes Workflow-Resume.
- **Explizit NICHT:** W8-Transitionsautomation (Task-Events als Phasentreiber) — Agent-Judgment + Severity-Gates bleiben.
- **Offene Mikro-Entscheidungen (in Spec 017 zu klären):** Clarify-Exit-Signal; Convergence-Report-Artefaktname für das Verify-Gate; Review-Loop-Ziele nach Phasen-Split (minor→tasks, major→plan als Vorschlag); Feature-Nummerierung durch Discovery.
- **Status:** Entscheidung getroffen im Brainstorming (2026-10-04); Spec 017 ausstehend.

### DEC-SKM-1 Refinements (2026-10-04, nach Brainstorming-Abschluss; gehalten bis ADOPT-Completion, jetzt nachgetragen)

- **Converge-Loop (verify ↔ speckit.converge):** "Converged" → Exit nach complete; Gaps (Tasks werden an tasks.md angehängt) → verification_failed-Muster zurück nach implement. Loop-Reihenfolge: Convergence-Report (Evidence, Pfad im submit_verification-Payload) → refresh_spec_kit_artifacts (Re-Import, kein stale Task-Snapshot) → implement. Max-Pass-Zähler pro Session (analog maxChainDepth); Überschreitung → report_blocker (requiresUserDecision).
- **Strenge Batch-Review-Kadenz (Option B, HARD):** implement → review_and_fix_implementation läuft PRO BATCH. Drei Review-Ausgänge: implementation_changes_required (Fix, Resubmit), batch_approved_more_pending (neu, zurück zu implement für den nächsten Batch), submission_valid (nur wenn ALLE Batches einen approvierten Review-Pass haben — Gate über Task-Review-Status). Batch-scoped submit_implementation-Payload (Batch-Task-IDs). Max-Runden-Zähler pro Batch mit Blocker-Eskalation. Angehängte Converge-Tasks durchlaufen dieselbe Kadenz. Nicht konfigurierbar (bewusste Nutzer-Entscheidung).
- **Spezifizierungsstand:** specs/017-spec-kit-mode/spec.md (Draft) — 9 US, 9 FR, 7 AC, OQ-1..3 (Converge-Report-Konvention, Include-Syntax, Feature-Nummerierung).
- **DEC-SKM-1 Nachtrag 2 (2026-10-04): OQ-1..3 geklärt** (aus .github/skills/speckit-* + .specify/scripts): DQ-1 Converge-Outcome ist hash-basiert auf tasks.md (byte-identisch = converged; neuer "## Phase N: Convergence"-Abschnitt = tasks_appended; kein Report-File; Evidence im submit_verification-Payload). DQ-2 Include-Syntax = per-Key $include, fail-closed (Sparse-Vollerbe verworfen wegen stummem Drift). DQ-3 Feature-Nummerierung = highest NNN in specs/ + 1, identisch zu create-new-feature.sh (FR-10 im Spec). DQ-4 Clarify-Exit = Agent-Submission nach attended Q&A (Antworten werden in spec.md kodiert). Spec 017 aktualisiert (FR-3/FR-7/FR-10, US5, DQ-Abschnitt, AC5).

## DEC-GBEA-M0 (2026-10-07) — specs/018 Milestone-0 decisions: GBEA adapter implementation

- **Auslöser:** Phase 0 of specs/018 (tasks T001–T005) per RFC GBEA-SPEC-001 v0.6.1-draft §28 (ADR 1–8) + §11.5 proof-signing + §23 config default. User approved ALL proposals unchanged (2026-10-07).
- **Full rationale (PROPOSED→ACCEPTED):** `specs/018-guidance-beads-execution-adapter/m0-adr-proposals.md`, `m0-implementation-contract.md` (22 MCP methods), `m0-beads-v1.3-baseline.md`.
- **Decisions:**
  1. **ADR-1 Transport:** CLI only for v1 (`bd` argument-array, no shell); port stays transport-agnostic — later MCP/API transport behind the same `WorkExecutionAdapter` without touching mapping v1. Grounds: RFC §23 config sample is CLI-shaped; §20.2–20.10 controls are process-spawn semantics; Beads 1.3 has no verified stable MCP/HTTP surface.
  2. **ADR-2 Metadata limits:** normative 32,768-byte `guidance`-metadata guard as constant; additional client-side caps ONLY where the pinned Beads v1.3 baseline documents hard limits (same per-item `PROJECTION_FAILED` + diagnostic pattern); no speculative limits.
  3. **ADR-3 Persistence:** better-sqlite3 (WAL mode), one Guidance-side store file beside guidance data (not in repo content), prepared statements for the §21.1 query paths. Chosen over JSON-file store (transactional fencing/sequence allocation §11.4/§21.1 unmanageable) and Postgres (new infra). Deployment constraint: multi-instance split-brain support is co-located (same machine, shared store file) only; cross-machine active-active out of scope v1.
  4. **ADR-4 Lease recovery:** orphaned-claim detection synchronously at store open (before serving claims, §11.3) + on every reconciliation pass at `synchronization.pollIntervalSeconds`; expired-lease lookup is a prepared indexed query; NO new config keys (config surface stays strictly RFC §23).
  5. **ADR-5 Status sync:** polling-only v1 (poll + incremental recon + 24 h full recon per §23); re-evaluate only on a stable Beads push mechanism.
  6. **ADR-6 Canonical JSON:** own profile `guidance.canonical-json/v1` — UTF-8, keys sorted by Unicode code point, ECMAScript minimal escaping, no insignificant whitespace, **non-integer numbers forbidden** in canonicalized content (removes JCS float nondeterminism); identifier recorded in `ProvenanceRecord.canonicalizationAlgorithm` and receipts (§15.4).
  7. **ADR-7 Retention:** NO online pruning in v1 (hot store keeps full history); append-only enforcement at data-access layer (no UPDATE/DELETE on event/receipt tables) + nightly digest export (JSONL + chain digest) as WORM-adjacent archive; `retentionEpoch` = 1 from day one; external anchoring (§18.2 SHOULD) documented as optional deployment step.
  8. **ADR-8 Upgrade policy:** ship `>=1.3.0 <2.0.0`; in-range minor upgrades auto-accepted after probe; widening requires baseline update + golden/contract tiers green + explicit config change + audited re-negotiation (§19); Beads MAJOR schema/status change triggers mapping-v2 evaluation (§9.6/§9.7).
  9. **Proof signing (T003):** Ed25519 via `node:crypto`; keypair generated on first start, persisted 0600 beside the execution store (optional `signingKeyPath` override); rotation = new pair + audit event (proofs short-lived); nonce store = SQLite UNIQUE table consumed atomically (replay → `OPERATION_NOT_AUTHORIZED`); signature format `ed25519:<base64url>` over canonical JSON (ADR-6 profile).
  10. **Config default (T005):** shipped default `executionBackends.beads` absent → functionally disabled (RFC §4.1 / AC-A1); config keys strictly RFC §23; config assistant offers Beads enablement only at rollout stage R5.
- **Binding effect:** M0 exit reached (T001–T005 done); ⏳ADR-gated tasks T013 (ADR-6), T024 (ADR-3), T066 (ADR-7) are unblocked; WP-01 (Phase 1) may start. m0-implementation-contract.md is binding for AC-A3 contract tests (WP-05/06/07); m0-beads-v1.3-baseline.md is binding for mapping v1 and golden fixtures (T038).
- **Environment note:** `bd` not installed on dev host (verified 2026-10-07) — real-backend tests need pinned Beads 1.3.x install; all other tiers run against the fake backend (T015).
