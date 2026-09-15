# Umsetzungsplan: Merge server-stochasticthinking → server-clear-thought (+ Orchestrator-Erweiterung)

> Erstellt 2026-09-15 mit Clear-Thought-Kette (`sequential_thinking` ×4 → `issue_tree` →
> `creative_thinking` → `metacognitive_monitoring`, Confidence 0,82).
> Entscheidung: `merge-servers-2026-09-15 / Update 1` — User-Entscheidung für Option A
> (Merge als Toolset). Recipe-Erweiterung ist Kernbestandteil (Phase 3).
> Branch: `feature/merge-stochastic-into-clear-thought` ab `develop` (GitFlow-light).

## Ausgangslage (Fakten aus dem Code)

| | server-stochasticthinking (Ist) | Ziel in server-clear-thought |
|---|---|---|
| Tools | `stochasticalgorithm` (ein Tool, `algorithm`-Enum) + eigenes `agents_guide` | Dual-Registration: `stochasticalgorithm` (Name/Signaturen **unverändert**) + neues Toolset `stochastic` mit `operation`-Enum |
| Logik | `src/algorithms/*` (rng, mdp, mcts, bandit, hmm, bayesopt, Dispatcher `runAlgorithm`) | 1:1 portiert nach `src/algorithms/*` |
| Session-State | lokale `Map<string, BanditRunState>` in der Factory | `BanditRunStore` als Domain-Store in `SessionState` (nimmt am Cleanup-Timer teil) |
| Guide | eigenes `agents_guide` + AGENTS.template (Marker `stochastic-thinking:agents-guide`) | konsolidiert in den clear-thought-Guide (Abschnitt „Stochastic algorithms"); Markerblock im Root-AGENTS.md entfällt |
| Tests | 41 Tests (Hand-Werte: V=[9,10], Korridor→`right`, Viterbi-Pfad, EI x≈2.0, Bandit-RunId) | in clear-thought-Suite integriert (Basis 129) |
| Veröffentlichung | npm 0.1.1, Smithery 100/100, ghcr, eigene Jobs | Package deprecated; Jobs aus den Publish-Pipelines entfernt |

## Design-Entscheidungen

1. **Dual-Registration mit stabilem Namen** (Convention systemPatterns #1): Das individuelle
   Tool heißt weiterhin `stochasticalgorithm` mit unveränderter Signatur
   `{ algorithm, problem, parameters, result? }` → Bestandsnutzer migrieren durch reinen
   Server-Entry-Tausch in der Client-Config, **keine Call-Site-Änderung**. Zusätzlich das
   Toolset `stochastic` mit Operationen `mdp|mcts|bandit|bayesian|hmm` (Convention-Feld
   `operation` ersetzt dort `algorithm`).
2. **BanditRunStore in SessionState**: statt Factory-lokaler Map ein eigener Domain-Store
   (`src/state/stores/`), eingebunden in den bestehenden Session-Cleanup — Voraussetzung
   dafür, dass Bandit-`runId`s Rezept-Stagen überleben (der eigentliche Merge-Gewinn:
   gemeinsame Session für WorkflowStore + Bandit-Runs).
3. **Guide-Konsolidierung via merge mode** (RB-2): Parameter-Tabellen und Routing wandern
   direkt in den clear-thought-Guide (kein „server README"-Verweis mehr); Dreifach-Kette
   `AGENTS.template.md` ↔ Template-Konstante ↔ Root-`AGENTS.md` per Sync-Test gesichert;
   der verwaiste `stochastic-thinking:agents-guide`-Markerblock im Root-AGENTS.md wird
   entfernt (generierter Inhalt) und per grep verifiziert.
4. **Release 1.1.0 additiv, Deprecation danach**: kein Config-Schema-Change → non-breaking
   Feature-Release; erst nach live-Gehen von 1.1.0 wird `@paschbaer/stochasticthinking`
   deprecated (Reihenfolge fix, siehe Risiken).

## Zielbild

```
Client ──stdio/HTTP──► server-clear-thought (v1.1.0)
                        ├─ src/tools/stochastic-algorithm.ts  (Tool `stochasticalgorithm`, Name unverändert)
                        ├─ src/toolsets/stochastic.ts         (Tool `stochastic`, operation-Enum)
                        │      └─ beide → src/algorithms/runAlgorithm(...) → BanditRunStore
                        ├─ SessionState + BanditRunStore      (eine Session für alles)
                        ├─ recipes/index.ts                   (7 Rezepte, stochastic-aware)
                        └─ workflow-prompts.ts                (7 Prompts)
server-stochasticthinking → deprecated (npm), Jobs entfernt, Ordner später archivieren (MG-2)
```

## Phasen

### Phase 0 — Spike & Baseline (~0,5 h)
1. Branch `feature/merge-stochastic-into-clear-thought` ab `develop`; Stand verifizieren
   (`git rev-parse HEAD`, Versionen in beiden `package.json` — 1.0.0-Rename-Stand prüfen).
2. Baseline grün: `npm test` (129 + 41) + `npm run typecheck` beider Server.
3. Inventar: `src/algorithms/*` auflisten, `BanditRunState`-Shape notieren, Zähllogik des
   Completeness-Tests (`tests/tool-metadata.test.ts`) lesen.
- **AC:** Baseline grün; Inventar + offene Fragen (Metacog-Unsicherheiten 1+2) aufgelöst.

### Phase 1 — Port Algorithmen + Store + Dual-Registration (~2 h)
- `src/algorithms/*` unverändert kopieren (reine Berechnungsmodule).
- `src/state/stores/BanditRunStore.ts`: kapselt `Map<string, BanditRunState>`; Einbindung
  in `SessionState` (Cleanup-Pfad wie alle Stores; Factory parst Config defensiv — Lesson
  2026-09-14).
- `src/tools/stochastic-algorithm.ts`: `registerStochasticAlgorithm(server, state)` mit
  identischem Input-Schema wie heute; Handler → `runAlgorithm(algorithm, parameters,
  { banditRuns })`; **explizites `structuredContent` + `isError`-Behandlung für
  `AlgorithmInputError` 1:1 portieren** (Lesson: advertised outputSchema verlangt
  structuredContent).
- `src/toolsets/stochastic.ts`: Operationen mit Schemas **ohne** `operation`-Feld
  (Registry-Guard wirft sonst); Dispatcher ruft denselben Handler-Pfad.
- Registration in `src/tools/index.ts` (einzeln + Toolset), Factory-Versions-String
  an Package-Version.
- **AC:** `tools/list` enthält `stochasticalgorithm` + `stochastic`; individueller mdp-Call
  liefert V=[9,10]-Toy-Ergebnis; Toolset-Call `stochastic{operation:'mdp'}` verhält sich
  identisch.

### Phase 2 — Guide-Konsolidierung (~1 h)
- `AGENTS.template.md`: neuer Abschnitt „Stochastic algorithms" (Routing-Einträge,
  Parameter-Referenz **im Guide selbst**, Calling-Regeln: row-stochastic 1e-6,
  Annahmen-Disclaimer „measured outputs unter deinen Modellannahmen", runId-Fortsetzung)
  + Workflow-Rezept-Sektion um die Phase-3-Inhalte erweitert.
- Template-Konstante regenerieren → Sync-Test (`tests/agents-guide.test.ts`) grün.
- Root-`AGENTS.md` **nur via `agents_guide` merge mode** regenerieren; verwaisten
  `stochastic-thinking:agents-guide:start/end`-Block entfernen; Verifikation: grep
  (Marker weg, handgeschriebene Sektionen intakt).
- stochastic-README: Deprecation-Banner vorbereiten (wirkt in Phase 6).
- **AC:** Sync-Kette grün; grep-Verifikation bestanden.

### Phase 3 — Orchestrator/Recipes (~1,5 h)
- `src/recipes/index.ts`:
  1. `architecture-decision`: **neue optionale Stage** zwischen `decision_framework` und
     `metacognitive_monitoring` — tool `stochasticalgorithm`, purpose „Quantifiziere die
     Top-Optionen (mdp: Phasen-Modell · bayesian: teure Black-Box · mcts: Suche)",
     `example_arguments` (Toy-MDP), `result_guidance` „gemessene V/Policy/EI →
     metacognitive `uncertaintyAreas`; Annahmen im decision log dokumentieren".
  2. **Neues Rezept `decision-under-uncertainty`**: `value_of_information` →
     `decision_framework` → `stochasticalgorithm` → `metacognitive_monitoring` (das
     „Combined"-Muster aus dem kombinierten Guide als First-Class-Recipe).
  3. Optional: Bandit-Hinweis in `open-ended-ideation` (Ideen als Bernoulli-Arme;
     epsilon-greedy/Thompson-Pulls als Empirie-Check; runId über Stagen dank gemeinsamer
     Session).
- `src/prompts/workflow-prompts.ts`: **7. Prompt** `decision-under-uncertainty`;
  Architektur-Prompt-Text um die Quantifizierungs-Stage ergänzen.
- `tests/workflow.test.ts`: Walk-Tests (start/advance/reset/Auto-Start) für das neue
  Rezept + aktualisierte Stage-Liste von `architecture-decision`.
- **AC:** `recipe_runner` walkt beide Rezepte sauber durch; Tests grün; Guide-Prosa ↔
  Rezept-Daten synchron (Phase-2-Abschnitt deckt das neue Rezept ab).

### Phase 4 — Tests, Metadaten, Funktionstest (~1,5 h)
- Tests portieren: `algorithms.test.ts` (Hand-Werte; **Params ausschließlich über zod
  Schemas parsen** — Lesson 2026-09-13), Server-Roundtrip via `InMemoryTransport`,
  Toolset-Parität individual ≡ toolset (Muster `contracts.test.ts`), Cross-Op-Invalid-Input.
- `src/tools/tool-metadata.ts`: Einträge für `stochasticalgorithm` + `stochastic`
  (stateful:true → idempotentHint:false wegen Bandit-Runs); `tool-metadata.test.ts` +
  `audit-tool-metadata.ts` grün.
- `scripts/funktionstest.mjs`: + stochastic-Checks (mdp-Roundtrip; Bandit-RunId-Fortsetzung
  über zwei Calls in derselben Session).
- Optional: Bandit-Runs in `session_export`/`session_save` aufnehmen.
- **AC:** komplette Suite grün (129 + portierte + neue), Audit 0 Findings, Funktionstest grün.

### Phase 5 — Docs, Evals, Memory-Bank (~1 h)
- Root-README: Single-Server-Tabelle; Migrations-Abschnitt („Server-Entry tauschen genügt —
  Tool-Name/Argumente unverändert; zusätzlich Toolset `stochastic` mit `operation`");
  Parameter-Tabellen übernehmen.
- `evals/tasks.json`: optionaler Task „guided decision with stochastic quantification".
- Memory-Bank: `remaining-work-plan.md` (**MG-1** Deprecation/Pipelines-Cleanup,
  **MG-2** Ordner-Archivierung später), `progress.md` aktualisieren.
- **AC:** Doku konsistent; Follow-ups getrackt.

### Phase 6 — Release & Deprecation (~1 h)
- PR `feature/…` → `develop` (Review + alle Tests), Version 1.1.0, Release via PR
  `develop → main` (Branch-Protection).
- Pipelines: OIDC-npm 1.1.0, ghcr-Image, Smithery-Re-Publish (alle Tools registriert,
  Score-Rescan prüfen).
- **Danach** Deprecation: `npm deprecate @paschbaer/stochasticthinking` (Verweis auf
  `@paschbaer/clear-thought@>=1.1.0`), stochastic-README-Banner als 0.1.2 publizieren,
  stochastic-Jobs aus `publish-npm.yml`/`publish-containers.yml`/`publish-smithery.yml`
  entfernen; `npx @paschbaer/clear-thought` Smoke (stdin offen halten, Lesson).
- **AC:** 1.1.0 live + registry-verifiziert; Deprecation sichtbar; Pipelines bereinigt.

## Risiken & Mitigationen

| Risiko | Wirkung | Mitigation |
|---|---|---|
| Toolset-Union: advertised schema macht Felder optional | Scheinbar lose Client-Validierung | Per-op Strict-Validation im Dispatcher bleibt (Registry-Verhalten); Cross-Op-Tests |
| `operation`-Feld in op.schemas | Registry-Guard wirft bei Registration | Schemas ohne `operation` definieren (Diskriminator kommt automatisch) |
| Direkte Modul-Calls umgehen zod-Defaults → NaN | Tests falsch-grün/-rot | Unit-Tests parsen ausschließlich über die Schemas (Lesson 2026-09-13) |
| Bandit-Store nicht im Cleanup / rohe Config | Runs weg oder sofortiges Store-Wiping | Store in SessionState-Cleanup; Factory parst Config defensiv (Lesson 2026-09-14) |
| Guide-Dreifach-Kette / RB-2 | Root-AGENTS.md verliert handgeschriebene Sektionen | Nur merge mode; Sync-Test; grep-Verifikation nach Marker-Entfernung |
| Completeness-Test zählt Toolanzahl | CI rot durch fehlende Metadaten | 2 TOOL_METADATA-Einträge vor dem Audit (Phase 4) |
| Release vor Deprecation | Nutzer verlieren ihr Paket ohne Ziel | Fixe Reihenfolge: 1.1.0 live → dann deprecate |

## Definition of Done (gesamt)

- clear-thought **1.1.0**: `stochasticalgorithm` + Toolset `stochastic` funktional
  (Hand-Verifizierungswerte grün), konsolidierter Guide, **7 Rezepte + 7 Prompts**.
- Komplette Testsuite + Audit + Funktionstest grün; Smithery-Re-Publish vollständig.
- stochastic-Package deprecated (npm + README), Publish-Pipelines bereinigt.
- Memory-Bank (decisions, activeContext, progress, remaining-work-plan) aktuell.

## Aufwandsschätzung

~8,5–9,5 h (Phase 0: 0,5 · 1: 2 · 2: 1 · 3: 1,5 · 4: 1,5 · 5: 1 · 6: 1) — jede Phase
einzeln commitbar (Conventional Commits).
