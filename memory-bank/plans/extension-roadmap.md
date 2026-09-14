# Erweiterungs-Roadmap — Thinking-MCP

> Dokumentiert 2026-09-13 aus der Ideations-Session (Clear-Thought-Toolchain:
> sequentialthinking → creativethinking → analogical_mapper → seven_seekers).
> Alle Ideenpakete A–E; **E ist detailliert ausgearbeitet in
> `plans/quality-distribution.md`**. Priorisierung und offene Fragen unten.

## Ausgangslage (Stand 2026-09-13)

- `server-clear-thought`: 33 Tools (individuell + 4 Toolsets), zentrale
  `tool.update()`-Capability-Runde (Annotations, passthrough outputSchema,
  structuredContent) veröffentlicht (Release 4b0dfb6a, RB-10);
  Smithery-Rescan ausstehend.
- `server-stochasticthinking`: auf der Smithery-Registry
  (`paschbaer/stochasticthinking`), High-Level-McpServer-API (RB-11),
  24 Tests, Docker verifiziert. Die fünf Algorithmen (mdp/mcts/bandit/
  bayesian/hmm) liefern bisher nur **Entscheidungs-Frames**, keine
  berechneten Zahlen (Honesty-Note im Agent-Guide).
- CI: `test.yml` vorhanden (RB-7-Rest: ersten Lauf nach Push verifizieren).
- npm-Publish der `@paschbaer`-Packages geplant, noch nicht durchgeführt.

---

## A) Stochastic-Server: echte Simulationen („Real Computing“)

**Motivation.** Größter einzelner Hebel des Projekts: Das Honesty-Disclaimer
(„der Summary ist ein Parameter-Frame, keine Messung“) wird zu einem
Verkaufsargument — kein anderer Reasoning-MCP-Server liefert gemessene Zahlen
statt nur Frames.

**Teiler:**

- **A1 — Bandit als echtes Multi-Armed-Bandit**: eingebaute
  Bernoulli-/Gauß-Arms (vom Agent konfiguriert), echte Ziehungen mit
  Reward-Historie in einem `SessionState`-Store, Strategien
  epsilon-greedy / UCB / Thompson real implementiert, kumulativer **Regret**
  als Messgröße. Mehrere `stochasticalgorithm`-Calls gegen dieselbe Session
  ergeben ein echtes Explore/Exploit-Erlebnis.
- **A2 — MDP mit Value/Policy-Iteration**: explizite Übergangsmatrix + Rewards
  als Parameter → echtes Bellman-Backup, Konvergenz-Delta, abgeleitete Policy.
  Kernig rechenbar, ohne Environment-Problem.
- **A3 — MCTS mit Environment-Vertrag**: zwei Varianten —
  (a) eingebaute Beispiel-Umgebungen (z. B. Gridworld), deterministisch
  testbar, zuerst; (b) „Agent-as-Environment“: der Agent beantwortet
  Expand/Evaluate-Requests über Folgetool-Calls, der Suchbaum lebt im
  SessionState. Design-Entscheidung offen (siehe Offene Fragen).
- **A4 — HMM echt**: Viterbi + Forward-Backward auf agent-gelieferten
  Übergangs-/Emissionsmatrizen und Observationensequenz (reine Matrix-Math).
- **A5 — Bayesian Optimization echt**: Expected-Improvement-Akquisition auf
  beobachteten (x, y)-Paaren; kleiner GP-Kernel (RBF) mit eigener Matrix-Math;
  Testfunktionen (Sphere, Rastrigin) für deterministische Tests.

**Konsequenzen.** Honesty-Note in `AGENTS_TEMPLATE`/README ersetzen durch eine
Ergebnis-Semantik („`summary`/`result` enthalten gemessene Werte realer
Algorithmen; Antwortstruktur `algorithm`/`status`/`hasResult` bleibt“).
Ein kleines Math-Modul (Matrix-Operationen, seedbarer RNG) als Grundlage;
keine schweren externen Dependencies.

**Wert:** hoch (USP). **Aufwand:** je Teiler 0,5–1,5 d, Gesamtpaket ~3–5 d.
**Abhängigkeiten:** SessionState-Store für Bandit-/MCTS-Zustand; Math-Modul.

---

## B) Neue Tool-Familien (server-clear-thought)

Pattern-Vorlage existiert und ist bewährt: dual-mode
(Facilitation/Analysis) + dual registration (Tool + Toolset). Je Familie:
`src/tools/<name>.ts` + Eintrag in `src/tools/index.ts` + Toolset-Routing
(`src/toolsets/<family>.ts`) + `AGENTS.template.md` **und**
`agents-guide-template.ts` (Sync-Test!) + vitest + (ab E1) Eintrag in der
Tool-Metadaten-Registry.

- **B1 — Risiko-Familie** (Empfehlung: erste Familie): `premortem`
  („Ein Jahr später: das Projekt ist gescheitert — warum?“), `fmea`
  (Ausfallarten mit S × O × D-Ranking), `fault_tree` (UND/ODR-Baum über
  Basisereignisse). Dual-mode wie `fishbone_diagram`; eigener `RiskStore`.
- **B2 — Argument-Map (Toulmin)**: Claim / Warrant / Backing / Rebuttal /
  Qualifier als persistenter Disput im SessionState; natürliche Erweiterung
  von `structuredargumentation`, nützlich für Review-Dispute
  (passt zum Review-Evidence-Protokoll in AGENTS.md).
- **B3 — Kausal-Reasoning**: Kausalgraph (Knoten + gerichtete Kanten),
  Interventions- und Counterfactual-Leitfragen pro Knoten; Brücke zum
  Bayesian-Algorithmus des Stochastic-Servers (A5).
- **B4 — Fermi-Estimation**: Annahmenzerlegung in eine
  Multiplikationskette, berechnete Punktschätzung + Sensitivitätsranking
  (∂Ergebnis / ∂Annahme) — deterministisch rechenbar; alternativ im
  Stochastic-Server ansiedelbar.
- **B5 — Spieltheorie**: 2×2/3×3-Payoff-Matrix, strikte Dominanz, Nash in
  reinen Strategien (analytisch), gemischte Strategien für 2×2 (geschlossen
  lösbar). Praktisch für Multi-Stakeholder-Entscheidungen in
  `decisionframework`.

**Wert:** mittel–hoch. **Aufwand:** je Familie 0,5–1,5 d.

---

## C) Recipe Runner (Workflows ausführbar machen) — ✅ Minimalvariante implementiert 2026-09-14 (0.3.0)

> **Status:** `recipe_runner` + `workflow`-Toolset live (Navigation + Hints,
> per-session Fortschritt, 6 Rezepte als Daten in `src/recipes/index.ts`).
> Offen: orchestrierte Variante (Server ruft Stage-Handler direkt).

**Ist.** Vier Workflow-Rezepte existieren nur als Doku in `AGENTS_TEMPLATE`
(Debug, Architektur-Entscheidung, Stress-Test, Ideation).

**Ziel.** Ein `workflow`-Toolset mit `recipe_runner`:

- Rezepte als **Daten** (`recipes/*.ts|json`: Stages, je Stage Tool +
  Pflichtparameter + Abschlusskriterium).
- Runner hält Fortschritt im SessionState (aktuelle Stage, Historie) und
  liefert je Call den nächsten Schritt (Hint + fehlende Parameter).
- Minimalvariante zuerst (nur Navigation/Hints — der Server orchestriert
  nicht); orchestrierte Variante (Server ruft Handler direkt) später.

**Nutzen.** Reproduzierbare Multi-Tool-Flows; Fundament für Eval-Szenarien
(E3 Tier 2) und Onboarding (der Guide verweist auf ausführbare Rezepte).

**Wert:** mittel, hoher Hebel für alles andere. **Aufwand:** 1–2 d minimal.

---

## D) MCP-Protokoll-Features

- **D1 — Resources**: Session-State als MCP-Resources exponieren
  (Thought-History je Store, Decision-Records, `session_export`-Snapshot);
  `resources/list` + `resources/read`. Die Stores existieren bereits —
  hauptsächlich Plumbing.
- **D2 — Prompts**: MCP-Prompt-Vorlagen (`/decide`, `/debug`, `/stress-test`,
  `/ideate`), die die Rezept-Ketten aus (C) als vorbereitete Argumente
  anbieten; `capabilities.prompts` aktivieren.
- **D3 — File-backed Persistence**: `session_export`/`session_import` in
  Dateien (Pfad aus Server-Config, auf Arbeitsverzeichnis beschränkt), damit
  State Server-Neustarts überlebt; natürliche Integration mit der
  `memory-bank/`-Praxis.
- **D4 — Sampling-Integration** (optional, bewusst zuletzt):
  Facilitation-Vorbefüllung über MCP-Sampling (z. B. SWOT-Kandidaten vom
  Client-Modell generieren lassen); client- und kostenabhängig.

**Aufwand:** D1/D2 je 0,5–1 d; D3 0,5–1 d; D4 1 d+ (mit Unbekannten).

---

## E) Qualität & Verbreitung — Kurzfassung

**Detailliert ausgearbeitet: `plans/quality-distribution.md`.**

- **E1 — RB-10 abschließen**: typisierte outputSchemas + menschenlesbare
  Annotation-Titel für alle 33 Tools, 8 fehlende Param-Beschreibungen
  ergänzen. Gewählte Strategie (decisionframework
  `rb10-schema-strategy-2026-09-13`): **zentrale Metadaten-Registry**
  statt ~25 Einzeldatei-Edits.
- **E2 — npm-Publish**: `@paschbaer/clear-thought` +
  `@paschbaer/stochasticthinking` auf npmjs.org; Package-Hygiene zuerst
  (publishConfig, files, tote Root-Scripts ersetzen).
- **E3 — Eval-Harness**: Tier 1 (deterministische Contract-Evals in
  vitest/CI, gratis) und Tier 2 (LLM-Task-Evals mit/ohne Tools, on-demand).

---

## Gemeinsame Umsetzungsregeln (alle Ideenpakete)

1. Neue Tools **immer doppelt registrieren** (individual + Toolset) — sonst
   brechen Toolset-Calls still (lessonsLearned).
2. Guide-Sync-Kontrakt: `AGENTS.template.md` ↔ `AGENTS_TEMPLATE` ↔ root
   `AGENTS.md` via `agents_guide` Merge-Mode regenerieren (Sync-Test).
3. Ab E1: jeder neue Tool braucht einen Registry-Eintrag in
   `tool-metadata.ts` (Vollständigkeitstest schlägt fehl, sonst).
4. Je Paket: eigener Feature-Branch (`feature/<name>`), Conventional Commits,
   GitNexus `impact` vor Symbol-Edits, `detect_changes` vor Commit,
   README-Update vor Merge, Memory-Bank-Update nach Merge.

## Priorisierung

| # | Idee | Wert | Aufwand | Abhängigkeit | Empfohlener Start |
|---|------|------|---------|--------------|-------------------|
| 1 | E1 RB-10-Registry | mittel (Score-Lücke) | 1–2 d | Smithery-Rescan lesen | sofort |
| 2 | E2 npm-Publish | hoch (Verbreitung, Namenschutz) | 0,5–1 d | E1 (sonst doppelte Release-Zyklen) | direkt danach |
| 3 | E3 Tier 1 | mittel (Vertrauen/Regressionen) | 0,5–1 d | — | parallel zu A |
| 4 | A1/A2/A4 Real Computing | hoch (USP) | je 0,5–1,5 d | Math-Modul | nächstes Feature-Paket |
| 5 | C Recipe Runner | mittel | 1–2 d | — | nach A oder parallel |
| 6 | B1 Risiko-Familie | mittel–hoch | 0,5–1 d | — | danach B2/B3 |
| 7 | D1/D2 Resources/Prompts | mittel | je 0,5–1 d | — | Protokoll-Reife |
| 8 | E3 Tier 2, A3/A5, D3/D4 | mittel | variabel | API-Key / Design-Entscheidungen | später |

## Bewusst zurückgestellt

- VS-Code-Extension / Web-Playground (MCP-first bleibt der Fokus).
- Schwere Math-/ML-Libraries (tfjs, jstat) — eigene schlanke Matrix-Math.
- Orchestrierter Server-seitiger Multi-Tool-Aufruf in C (erst Minimalvariante).

## Offene Fragen

1. Smithery-Rescan-Score nach der Capability-Runde (RB-10-Trigger) — zählen
   die generischen Annotations/passthrough-Schemas bereits für den Score?
2. MCTS-Environment-Modell (A3): eingebaute Umgebungen vs.
   Agent-as-Environment.
3. Eval Tier 2: Modell-/Anbieter-Politik und Kostenbudget (API-Key-Handling).
4. Toolset-Routing neuer Familien: eigenes `risk`-Toolset vs. Einordnung in
   `reasoning`/`visualization`.
