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
