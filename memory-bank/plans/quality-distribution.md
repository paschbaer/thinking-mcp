# Umsetzungsplan: Qualität & Verbreitung (Option E)

> Erstellt 2026-09-13. Detaillierung der Roadmap-Idee E aus
> `plans/extension-roadmap.md`. Schema-Strategie je decisionframework
> `rb10-schema-strategy-2026-09-13` (Stage `decision`): **zentrale
> Metadaten-Registry** — Begründung in Phase 1. Bei Umsetzungsbeginn die
> Entscheidung in die PR-Beschreibung übernehmen (AGENTS.md-Konvention).
> Branches je Phase: `feature/…`, Conventional Commits.

## Ausgangslage (Fakten aus dem Code, 2026-09-13)

| Fakt | Quelle |
|---|---|
| Zentrale `tool.update()`-Verbesserung existiert: generische Annotations (`title` = snake_case-Toolname, `readOnlyHint: true`, `idempotentHint: true`), `outputSchema: z.object({}).passthrough()` (nachträglich überschrieben), structuredContent-Passthrough aus JSON-Text | `servers/server-clear-thought/src/index.ts` |
| RB-10 quantifiziert die Lücke: „annotations + outputSchemas are not set on the 33 high-level tools (code change across ~25 register calls); 8 tools have params without descriptions“; Rescan nach der Capability-Runde ausstehend | `remaining-work-plan.md` [RB-10] |
| Referenz-Pattern für vollständige Tool-Metadaten: `registerTool` mit `title`, Annotations, zod-outputSchema, structuredContent (zod als Single Source of Truth) | stochastic `src/index.ts` (RB-11-Migration) |
| `@paschbaer/clear-thought` 0.0.5: `files` = dist, src, AGENTS.template.md, smithery.yaml, README, LICENSE; `bin` → `dist/dev.js`; `prepublishOnly`/`prepare` vorhanden | `servers/server-clear-thought/package.json` |
| `@paschbaer/stochasticthinking` 0.1.0: `files` **ohne** `smithery.yaml`; `repository.url` inkonsistent (ohne `git+https`); sonst Parität | `servers/server-stochasticthinking/package.json` |
| Root-Scripts `smithery:stochastic` / `smithery:clear-thought` rufen `smithery deploy` auf — die v4-CLI hat kein `deploy` (RB-7/RB-8: toter Pfad); Publishing läuft real über `scripts/publish-smithery.mjs` je Server | Root-`package.json`, RB-7/RB-8-Einträge |
| Root-`package.json` ist `private: true` (Schutz vor versehentlichem Root-Publish) | Root-`package.json` |
| 78 vitest-Tests in clear-thought grün (Baseline) | `progress.md` |

---

## Phase 1 — RB-10 abschließen: typisierte Schemas + Annotation-Titel

**Ziel.** Alle 33 Tools mit menschenlesbarem Annotation-`title` und echtem
(top-level definiertem) zod-outputSchema versehen; 8 fehlende
Param-Beschreibungen ergänzen; Smithery-Score-Lücke schließen.

**Strategie-Entscheidung (decisionframework
`rb10-schema-strategy-2026-09-13`):** **zentrale Metadaten-Registry**
statt (a) Status quo mit passthrough-Schemas oder (b) Per-Tool-Migration
über ~25 Register-Dateien. Begründung: eine einzige Anwendungsstelle
(bestehende Loop in `src/index.ts`) bleibt erhalten, das Diff bleibt klein,
ein Vollständigkeitstest erzwingt Metadaten für alle künftigen Tools, und
die 33 Schemata leben gebündelt an einem Ort (pflegebar als Familie).

### Schritt 0 — Befundaufnahme (billig vor teuer, ~0,5 h)

1. **Smithery-Rescan auslesen** (Dashboard `paschbaer/clear-thought`) und
   die Detail-Scores (params / outputSchemas / annotations) in RB-10
   dokumentieren. *Entscheidungspunkt:* Zählt die zentrale Capability-Runde
   bereits? Falls `outputSchemas` und `annotations` bereits 33/33 zählen →
   Phase 1 auf die 8 Param-Beschreibungen reduzieren und direkt zu Phase 2.
2. **Gap-Audit als Skript** (einmalig, z. B.
   `scripts/audit-tool-metadata.mjs`): Server-Instanz bauen (Factory +
   `InMemoryTransport`), `tools/list` auslesen und je Tool melden:
   `annotations.title` == snake_case-Name? inputSchema-Properties ohne
   `description`? outputSchema ohne definierte Top-Level-Properties?
   → konkrete Zielliste statt der Schätzung „8 Tools“.

### Schritt 1 — Zentrale Metadaten-Registry (~1 d)

- Neu: `servers/server-clear-thought/src/tools/tool-metadata.ts`

  ```ts
  export interface ToolMetadata {
    title: string;                          // menschenlesbar: "SWOT Analysis"
    outputSchema: z.ZodTypeAny;             // Top-Level-Felder explizit
    annotations?: Partial<ToolAnnotations>; // Abweichungen von den Defaults
  }
  export const TOOL_METADATA: Record<string, ToolMetadata> = { /* 33 Einträge */ };
  ```

- Schemata **familienweise** definieren (iterative Tools teilen ein
  `{ sessionId, status, … }`-Kernschema, Visualisierungen ein Diagramm-Kern-
  schema, Utility-Tools einzeln). Top-Level-Felder explizit benennen,
  Verschachteltes als `z.unknown()`/`z.record()` — Smithery wertet definierte
  Top-Level-Properties; die Tiefe ist nicht der Engpass.
- **Annotations-Semantik ehrlich schärfen** (aktuell pauschal
  `idempotentHint: true`):
  - iterative/stateful Tools (alle mit `sessionContext`-Akkumulation:
    `sequentialthinking`, `mentalmodel`, `debuggingapproach`,
    `decisionframework`, `metacognitivemonitoring`, `socraticmethod`,
    `creativethinking`, `scientificmethod`, `collaborativereasoning`,
    `systemsthinking`, …): `idempotentHint: false` — wiederholte Calls
    liefern akkumulierte Stats. `readOnlyHint: true` bleibt korrekt
    (nur serverinterner State, keine externe Umgebung).
  - zustandslose Analysen (`assumption_xray`, `swot_analysis` im
    Analysis-Mode, `value_of_information`, …): beide Hints `true`.
- Anwendung in der **bestehenden zentralen Loop** in `src/index.ts`:
  Registry-Lookup je Toolname → `title` / `annotations` / `outputSchema`
  aus der Metadaten-Map; Fallback auf heutiges Generik-Verhalten, falls ein
  Eintrag fehlt (der Vollständigkeitstest in Schritt 3 macht den Fallback
  trotzdem sichtbar). Loop parametrisieren, **nicht umbauen**;
  structuredContent-Passthrough unverändert.

### Schritt 2 — 8 fehlende Param-Beschreibungen (~0,5 h)

- Aus der Gap-Liste des Audit-Skripts: `.describe(…)` an den zod-Formen der
  betroffenen Register-Dateien ergänzen. Nur Beschreibungstexte, keine
  Strukturänderungen → minimales Diff in ~8 Dateien.

### Schritt 3 — Tests (~0,5 d)

- Neu: `tests/tool-metadata.test.ts`
  1. **Vollständigkeit:** jeder über `tools/list` gelieferte Toolname hat
     einen Registry-Eintrag (bricht bei künftigen Tools ohne Metadaten —
     gewollt als Torguard).
  2. **Qualität je Tool:** `annotations.title` menschenlesbar (enthält
     Leerzeichen/Großbuchstaben, ≠ snake_case-Name); `outputSchema` mit
     ≥ 1 definiertem Top-Level-Property (kein reines Passthrough); alle
     inputSchema-Properties haben `description`.
  3. **Round-trip:** `tools/call` eines repräsentativen Tools pro Familie →
     `structuredContent` validiert gegen das neue Schema (SDK-validiert).
- Bestehende 78 Tests bleiben grün; agents-guide-Sync ist unberührt
  (kein Template-Change nötig).

### Schritt 4 — Verifikation, Release, Abschluss

1. `npm run typecheck && npm run build && npx vitest` (clear-thought).
2. GitNexus: `impact` auf `createClearThoughtServer` / `registerTools`
   (upstream: beide Entries), `detect_changes` vor dem Commit.
3. Branch `feature/rb10-typed-output-schemas`, Conventional Commits
   (`feat(clear-thought): typed output schemas + human tool titles`).
4. Publizieren: `node scripts/publish-smithery.mjs` (im clear-thought-
   Verzeichnis), Rescan abwarten, RB-10 in `remaining-work-plan.md`
   schließen — oder Rest mit Score-Evidenz neu klassifizieren.

**AC Phase 1:** 33/33 Tools mit echtem outputSchema + menschenlesbarem
Titel; 0 inputSchema-Properties ohne `description`; Tests grün; Rescan-Score
in RB-10 dokumentiert; RB-10 geschlossen oder evidenzbasiert neu
klassifiziert.

**Risiken & Mitigationen**

| Risiko | Wirkung | Mitigation |
|---|---|---|
| Schema-Drift (Handler-Antwort ändert sich, Schema nicht) | Clients validieren gegen falsches Schema | Round-trip-Test je Familie; Passthrough auf inneren Ebenen; Schema-Mitpflicht im Review bei Antwort-Änderungen |
| 33 Schemas grob/falsch | Score nutzt nichts | Familien-Basis-Schemas wiederverwenden; Audit-Skript als Check |
| `tool.update()`-Loop verhält sich mit expliziten Schemas anders | Registratur bricht | Loop nur parametrisieren; Unit-Test für Loop mit/ohne Registry-Eintrag |
| `_registeredTools` ist SDK-intern | SDK-Upgrade bricht die Loop | Läuft bereits in Produktion (Capability-Runde); 78+neue Tests als Regressionsnetz |

**Aufwand:** 1–2 d.

---

## Phase 2 — npm-Publish (`@paschbaer/*`) — ✅ ERLEDIGT 2026-09-14

**Ergebnis.** Beide Packages live: `@paschbaer/clear-thought@0.1.1` +
`@paschbaer/stochasticthinking@0.1.1` (Registry-Verifikation via
`npm view --prefer-online`; npx-Configs dokumentiert in beiden READMEs).
Zwei Lektionen auf dem Weg: 0.1.0 landete für stochastic gar nicht erst auf
der Registry (stiller Publish-Fail trotz Exit 0), und der Bin-Guard
no-opete via npx-Symlink (Fix 0c6daca + Regressionstests in beiden Suiten).

**Ziel.** Beide Server auf npmjs.org veröffentlichen (scoped public), mit
wiederholbarem Release-Pfad. Nebeneffekt: die Scope-Namen sind geschützt,
sobald das erste Package online ist.

### Schritt 1 — Voraussetzungen (~0,5 h, Nutzer-Aktionen)

> **UPDATE 2026-09-14 (npm-12/GAT-Deprecation, GitHub-Changelog 2026-07-08):**
> 2FA-bypass Granular Access Tokens verlieren schrittweise die
> Publishing-Fähigkeit (ab ~Jan 2027: nur noch Lesen privater Packages +
> gestagte Publishes mit menschlicher 2FA-Freigabe). Für den Erst-Publish
> daher **kein** 2FA-Bypass-Token: interaktiver `npm login` (Web-Flow + 2FA).
> Für Automation später: **Trusted Publishing (OIDC)** aus GitHub Actions
> bzw. Staged Publishing statt langlebigem Publish-Token.

1. npm-Account `paschbaer` verifizieren (RB-5-Fakcheck zeigte: Scope noch
   frei/unbesetzt); 2FA aktivieren.
2. Login lokal: `npm login --auth-type=web` — die CLI druckt eine URL; im
   WSL die URL manuell in den Windows-Browser kopieren (mutmaßliche Ursache
   des Exit-1 beim ersten Versuch). Danach `npm whoami` → `paschbaer`?

### Schritt 2 — Package-Hygiene (vor dem ersten Publish, ~0,5 d)

Beide Server:

- `publishConfig: { "access": "public" }` ergänzen (verhindert das
  klassische scoped-package-Vergehen von `--access public`).
- `repository.url` vereinheitlichen (`git+https://…`).
- Prüfen, dass `dist/dev.js` mit `#!/usr/bin/env node` beginnt (bin-Anforderung);
  tsc übernimmt den Shebang aus der Quelldatei — also in `src/dev.ts` prüfen,
  ggf. ergänzen.

Stochastic zusätzlich:

- `smithery.yaml` in `files` aufnehmen (Parität zu clear-thought).

Root:

- Tote Scripts ersetzen: `smithery:stochastic` / `smithery:clear-thought`
  rufen `smithery deploy` auf (v3-Pfad, RB-7/RB-8) → auf
  `node scripts/publish-smithery.mjs` im jeweiligen Server-Verzeichnis
  umstellen. RB-7-Rest damit teilweise abarbeiten.
- Optional: `release`-Hilfsscript (`npm version` je Workspace +
  `git tag pkg@version`).

### Schritt 3 — Trockenlauf & Erstveröffentlichung (~0,5 d)

1. `npm publish --dry-run` je Workspace; Tarball-Inhalt prüfen: `dist`
   vollständig, keine Test-/Dev-Artefakte, README/LICENSE/
   AGENTS.template.md enthalten (klarstellen, dass `src` in clear-thought
   bewusst im Package liegt).
2. Versionierung: für clear-thought minor bump empfohlen (0.0.5 → 0.1.0),
   da structuredContent/outputSchemas funktionsrelevant sind; stochastic
   startet mit 0.1.0. Entscheidung beim Release dokumentieren.
3. Reihenfolge: erst `@paschbaer/clear-thought`, dann
   `@paschbaer/stochasticthinking`.
4. Verifikation nach jedem Publish:
   - `npm view @paschbaer/<pkg>` (Metadaten, bin, engines korrekt)
   - `npx -y @paschbaer/<pkg>`-Smoke mit **offen gehaltenem stdin**
     (lessonsLearned-Falle): `(sleep 1; printf '%s\n' '<initialize/tools-list>';
     sleep 3) | npx -y @paschbaer/<pkg>`
   - READMEs aktualisieren: „geplanter Publish“ → echte npm/npx-Installations-
     wege (knüpft an die bestehenden RB-5/RB-6-Doku-Pfade an).

### Schritt 4 — Wiederholbarer Release (optional, +0,5 d)

- GitHub-Action `release.yml` auf Tag-Pattern `pkg/*@*`: **zuerst**
  `corepack enable`, **dann** `setup-node` (Lektion aus
  `ci/fix-corepack-order`: der package-manager-Cache-Probe von setup-node
  scheitert am globalen Yarn 1.x), immutable install, build.
- Auth in CI: **Trusted Publishing (OIDC)** statt `NODE_AUTH_TOKEN` —
  2FA-Bypass-GATs verlieren das direkte Publishen (Deprecation 2026-07-08);
  auf npmjs.org im Package-Settings den Workflow als Trusted Publisher
  eintragen (repo + workflow-Datei). Übergangsweise funktioniert ein
  Non-Bypass-GAT; ab ~Jan 2027 stagged dieser nur noch (Freigabe mit 2FA).

**AC Phase 2:** beide Packages öffentlich installierbar (`npx`-Smoke grün),
Metadaten/Keywords/Repository korrekt, Release-Pfad dokumentiert (README +
Root-Scripts), Root-`package.json` bleibt privat.

**Risiken & Mitigationen**

| Risiko | Mitigation |
|---|---|
| 2FA/OTP blockt nicht-interaktiven Publish | Interaktiver Login für den Erst-Publish; Automation über OIDC Trusted Publishing (GAT-2FA-Bypass wird deprecated) |
| npm 12 Install-Defaults (`allowScripts` off, `--allow-git`/`--allow-remote` none) | Unsere Packages shippen KEINE Lifecycle-Scripts → Consumer unberührt; für frische Repo-Installs ggf. `npm approve-scripts`-Allowlist (esbuild) committen |
| Tarball enthält zu viel/wenig | `--dry-run`-Audit als Pflichtschritt vor jedem Publish |
| Versionierungs-Chaos im Monorepo | Tags `pkg@version` je Workspace; Changesets erst bei echtem Bedarf |

**Aufwand:** 0,5–1 d (inkl. CI-Action +0,5 d).

---

## Phase 3 — Eval-Harness

**Ziel.** Messbar machen, dass die Tools Agents tatsächlich besser machen —
und Tool-Verhaltens-Regressionen automatisch erkennen. Zwei Stufen.

### Tier 1 — Contract-Evals (CI, gratis, deterministisch, ~0,5–1 d)

Neu: `servers/server-clear-thought/tests/contracts/*.test.ts` (reines
vitest, läuft in `test.yml` ohne API-Kosten):

1. **Je Tool** (33, datengetrieben aus der Phase-1-Registry): gültiger
   Minimal-Call → `isError: false`, `structuredContent` parst und validiert
   gegen das Registry-Schema (profitiert direkt von Phase 1).
2. **Dual-Mode:** Facilitation-Call ohne Content liefert Scaffold-Marker
   (Guiding Questions); derselbe Call mit Content liefert Analyse ohne
   Scaffold (die 7 dual-mode Tools).
3. **Toolset-Parität:** Toolset-Call (`operation: …`) ≡ Individual-Call
   (identischer Handler-Output) je Familie — Bestandsgarantie aus
   `systemPatterns.md`.
4. **SessionState:** iterative Tools erhöhen `sessionContext`-Stats über
   zwei Calls in derselben Session messbar.

### Tier 2 — LLM-Task-Evals (on-demand, API-Key nötig, ~1–2 d)

- `evals/tasks/*.json`: Task-Prompt, erlaubte Tools, Rubrik (Kriterien mit
  Gewichtungen), erwartete Elemente (z. B. „nutzt `fishbone_diagram` statt
  freier Prosa bei Ursachenanalyse“).
- `evals/run.mjs`: MCP-Client (SDK, stdio) + konfigurierbares LLM (Env);
  Lauf A ohne Tools vs. Lauf B mit Server; LLM-as-Judge über die Rubrik
  plus programmatische Checks (wurde Tool X benutzt? Ergebnis strukturiert?).
- Output: `evals/results/<date>-<model>.json` + Markdown-Report;
  Kostenkontrolle über `--max-tasks` und Modell-Wahl per Env.
- CI: nur `workflow_dispatch` (manuell), Key als Secret — **niemals** per
  Push automatisch.

**AC Phase 3:** Tier 1 grün als Bestandteil von `npm test`; Tier 2 läuft
manuell gegen beide Server und erzeugt einen Vergleichsreport mit/ohne Tools.

**Risiken:** Judge-Varianz (→ Rubrik-Gewichte, mehrere Runs, Median);
API-Kosten (→ Budget-Limit im Runner); Overfitting auf eigene Aufgaben
(→ Tasks aus echten Sessions ableiten).

---

## Gesamtreihenfolge & Governance

1. Phase 1 (RB-10) → 2. Phase 2 (npm) → 3. Phase 3 Tier 1 (parallel zu
   Roadmap-A möglich), Tier 2 später.
2. Je Phase: eigener Feature-Branch, Conventional Commits, GitNexus
   `detect_changes` vor Commit, README-Update vor Merge, Memory-Bank-Update
   (remaining-work-plan / activeContext / progress) nach Merge.
3. Decisionframework-Option (zentrale Registry) in die PR-Beschreibung von
   Phase 1 übernehmen (AGENTS.md-Konvention).

## Definition of Done (gesamt)

- [ ] Smithery clear-thought: Rescan-Score dokumentiert, RB-10 geschlossen
      oder evidenzbasiert neu klassifiziert.
- [ ] 33/33 Tools: menschenlesbarer `title`, echtes `outputSchema`, 0 Params
      ohne `description`; Registry-Test erzwingt das dauerhaft.
- [ ] `@paschbaer/clear-thought` und `@paschbaer/stochasticthinking` auf
      npm installierbar, `npx`-Smoke grün, Release-Pfad dokumentiert.
- [ ] Contract-Evals (Tier 1) in CI grün; Tier-2-Report optional existiert.
- [ ] Memory-Bank aktuell (RB-10, activeContext, progress, lessonsLearned).

## Aufwandsschätzung gesamt

~2–4 d reine Umsetzung (Phase 1: 1–2 · Phase 2: 0,5–1 · Phase 3 Tier 1:
0,5–1; Tier 2 optional +1–2) — jede Phase einzeln commitbar und
veröffentlichbar.
