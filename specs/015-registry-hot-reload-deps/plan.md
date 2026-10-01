# Plan: Registry Hot-Reload & Dependency Bootstrap (specs/015)

**Status:** Draft (SDD 2026-09-30 — Umsetzung ausstehend)
**Spec:** `specs/015-registry-hot-reload-deps/spec.md`

## Research / Open Points (vor Implementierung zu entscheiden)

### R1 — US1-Design-Entscheidung: Watch vs. Register-Tool — ENTSCHIEDEN (2026-09-30, Nutzer)

**Entscheidung: Alternative B (`registry-register`-Tool).** Alternative A
(config-watch + atomarer Swap) ist als Follow-up im remaining-work-plan
getrackt und wird umgesetzt, falls Datei-Edit-Workflows dominieren.

Kriterien (aus spec.md AC-1…AC-6 abgeleitet):

| Kriterium                    | A: config-watch + Swap                                                           | B: registry-register-Tool                    |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| specs/008-Konformität        | muss Äquivalenzgarantie liefern (deterministische Neubewertung derselben Quelle) | respektiert sie strukturell (ein enges Tool) |
| Session-Semantik-Komplexität | hoch (Weiterführungsregeln oder geordnete Invalidierung)                         | niedrig (AC-5 greift unverändert)            |
| Angriffsfläche               | niedrig (kein neues Tool)                                                        | mittel (workspace_write + Approval)          |
| Operator-Erlebnis            | Datei-Edit genügt (Editor/Config-Assistant unverändert)                          | Tool-Aufruf nötig                            |
| Implementierungsaufwand      | Watcher-Lebenszyklus + Rennen                                                    | ein Tool + Validierungs-Reuse                |

**Empfehlung des SDD (nicht bindend):** B zuerst (kleiner, specs/008-näher),
A als Follow-up, falls Datei-Edit-Workflows dominieren.

### R2 — Session-Semantik bei Registry-Wechsel — ENTSCHIEDEN (2026-09-30, Nutzer)

**Entscheidung: Weiterführung mit Re-Validierung.** `completed`-Sessions
überleben einen Registry-Wechsel; `active`- und `blocked`-Sessions werden
genau dann weitergeführt, wenn sie gegen die neue Registry re-validieren
(AC-5-Hash-Vergleich mit Rebind + Re-Validierung), andernfalls fail-closed
(`configuration_invalid`). Die verbindliche Fallmatrix (welche Felder der
Session in die Re-Validierung eingehen) wird in Phase 1 (T001/T002)
konkretisiert und in spec.md AC-1…AC-6 verankert.

### R3 — Watcher-Technologie (nur bei Alternative A)

FS-Watcher (`node:fs` watch, rekursiv) vs. mtime-Poll im
Session-Freigabezyklus; Debounce; Verhalten bei Editor-Partial-Writes.

## Technical Approach

- **US1 (Alternative B):** Neues MCP-Tool `registry-register` (profile-abhängig
  registriert), Parameter `{ name, root, projectName? }` + optional `remove`;
  interne Ausführung exclusively über `WorkspaceRegistry.build` auf der
  kompletten neuen Registry (keine Sonderbehandlung); Erfolg → persistente
  Registry-Datei (atomarer Write, gleiche Routine wie
  `WorkspaceRegistry`-Serialisierung) + Audit-Event + neue
  `configurationVersion`. AC-5 läuft über den bestehenden
  Hash-Vergleich in `getWorkflowState`.
- **US2:** Zwei neue Operationen in der Katalog-Config
  (`deps-install`, `deps-reinstall`), type `process`, `executable: npm`,
  `cwd` = Workspace-Root (Resolver wie bestehende process-Operationen),
  `riskClass: workspace_write`, `required: false`; Erkennungs-Verweis in
  `warnNodeDeps`-Meldungen und im Gate-Fehlerpfad (Fehlermuster-Matching
  `Cannot find module` / `ERR_DLOPEN_FAILED` → Hinweis-Text).

## Constitution Checks

- Fail-closed: US1 übernimmt nur vollständig validierte Registries; US2
  scope-strikt auf registrierte Roots, Approval-Pflicht (FR-053).
- Single config truth: US1 ändert nur die Registry-Datei der Instanz —
  Process-Config-Truth bleibt beim Repo (specs/014).
- Audit: beide US-Pfade erzeugen Audit-Events (Registry-Swap bzw.
  deps-Operation-Ausführung inkl. Fallback-Vermerk).

## Test-Strategie

- Contract-Tests: Registry-Validation-Reuse (invalid → kein Swap),
  AC-5-Hash-Semantik, Audit-Events, deps-Operation-Verhalten
  (Lockfile/Lockfile-fallback, Reinstall-Cleanliness, Root-Scoping).
- Integration: Pool-Szenarien (Onboarding ohne Restart; Gate-Heilung:
  warnNodeDeps-Fall → deps-install → Gates grün).
- Regression: bestehende AC-5-, Multi-Workspace- und
  shipped-configs-Suiten unverändert grün.

## Gate-/Verifikationsplan

`npm test` (Vollauf) + `npm run typecheck` + `prettier` +
`gitnexus analyze --no-stats` + quickstart-Szenarien für
Onboarding/Heilung + memory-bank-Updates (progress/activeContext/lessonsLearned).
