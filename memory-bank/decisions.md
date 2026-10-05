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
