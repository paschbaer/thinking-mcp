# Specification: Registry Hot-Reload & Dependency Bootstrap (specs/015)

**Feature ID:** `015-registry-hot-reload-deps`
**Closes tracks:** HR-1 (LOW, Registry-Hot-Reload-Konzept) · DB-1-Rest (MEDIUM, generische `deps-install`/`deps-reinstall`-Operation)
**Namespace:** neue FRs ab FR-1201 (keine Kollision mit FR-1101… aus specs/014, FR-001…995 davor)
**Status:** Implemented (SDD 2026-09-30; Umsetzung 2026-10-01 — US1 feature/015-us1-registry-register, US2 feature/015-us2-deps-operations)
<!-- docs-drift: status ok -->

**Date:** 2026-09-30

## Overview

Zwei unabhängige Betriebslücken aus dem Pool-Betrieb (specs/014):

1. **Registry-Starrheit (HR-1):** Die `workspaces[]`-Registry wird nur beim
   Boot geladen (`loadConfig`/`composeApplication`). Ein neu onboardetes Repo
   erfordert einen Container-Restart (billig — bind mount, kein Rebuild —
   aber ein Stopp). Dabei invalidiert der neue `configurationVersion`-Hash
   (specs/008 AC-5) **alle** bestehenden Sessions. specs/008 hat
   Laufzeit-Registry-Tools bewusst abgelehnt (statisch, fail-closed) — diese
   Spec muss die Spannung auflösen, nicht umgehen.

2. **Dependency-Bootstrap (DB-1-Rest):** Node-Workspaces im Pool brauchen
   lauffähige Gates. Fehlender oder plattform-falsch installierter
   `node_modules` lässt sie mit `Cannot find module` / `ERR_DLOPEN_FAILED`
   failen. Die Slim-Variante (`warnNodeDeps`, Boot-Warnungen für beide
   Fälle) ist live; die **Heilung** — generische `deps-install`/
   `deps-reinstall`-Operationen — fehlt noch.

**Nicht-Ziele:** Kein Auto-Install bei Boot (Boot bleibt rein diagnostisch:
warnNodeDeps); keine Registry-Änderung über Middleware/Proxy-Layer; keine
per-Workspace-Abweichungen vom Fail-closed-Validierungsstandard.

## User Stories

### US1: Registry-Hot-Reload ohne Ad-hoc-Umgehung (P1)

**As an** operator, **I want** eine neu registrierte Workspace-Root ohne
Container-Restart nutzen zu können — **entweder** über einen überwachten,
atomaren Registry-Swap mit definierter Session-Semantik, **oder** über ein
`registry-register`-Tool mit exakt denselben Fail-closed-Regeln wie
`WorkspaceRegistry.build` — **so that** Onboarding ohne Total-Invalidierung
möglich wird, ohne die specs/008-Garantien (statische Registry, fail-closed,
auditiert) aufzuweichen.

**Design-Entscheidung (2026-09-30, Nutzer): Alternative B — `registry-register`-Tool.**
Alternative A (config-watch + atomarer Swap) ist als Follow-up getrackt
(remaining-work-plan, SPEC015-A) und wird umgesetzt, falls Datei-Edit-Workflows
dominieren. Die Alternative-Tabelle bleibt als Entscheidungsdokumentation
stehen:

|                    | **A: config-watch + atomarer Swap**                                                                                                              | **B: `registry-register`-Tool**                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Mechanismus        | FS-Watcher (oder mtime-Poll) auf `guidance.json`; bei Änderung: `WorkspaceRegistry.build` über die neue Datei, atomarer Registry-Swap            | MCP-Tool registriert EINE Root zur Laufzeit über denselben `WorkspaceRegistry.build`-Pfad       |
| Session-Semantik   | zu definieren: Weiterführung (Sessions an alte Hash gebunden → definiertes Rebind oder geordnete Invalidierung) vs. AC-5-Invalidierung wie heute | unverändert: neue `configurationVersion` → AC-5 greift wie bei jedem Config-Wechsel             |
| specs/008-Spannung | muss widerlegen: Watcher ist kein „Laufzeit-Registry-Tool", sondern deterministische Neubewertung derselben statischen Quelle                    | respektiert specs/008 teilweise: ein enges, fail-closed-Tool statt beliebiger Laufzeit-Mutation |
| Risiken            | Watcher-Flakiness, Partial-Read, Restart-Rennen                                                                                                  | Angriffsfläche des Tools (riskClass `workspace_write` + Approval-Pflicht)                       |

**Acceptance Criteria (gültig für beide Alternativen; Requirements-Mapping
siehe unten, FR-1201…1210 für Alternative B):**

- AC-1: Jede zur Laufzeit übernommene Registry durchläuft **dieselbe**
  Fail-closed-Validierung wie beim Boot (`WorkspaceRegistry.build`:
  Absoluteität, Existenz, Dedupe, Namensschema) — keine Teil-Übernahme,
  keine Toleranzen, die der Boot-Pfad nicht hätte.
- AC-2: Ein invalider Registry-Edit ändert den laufenden Zustand **nicht**
  (alter Registry-Stand bleibt aktiv); der Fehler wird geloggt/auditiert.
- AC-3: Die `configurationVersion`-Semantik ist spezifiziert und getestet:
  nach einer Hot-Reload-Änderung gilt für bestehende Sessions definiertes
  Verhalten (dokumentierte Weiterführungsregeln ODER geordnete
  Invalidierung mit AC-5-Meldung) — kein undefinierter Mischzustand.
- AC-4: Jede Übernahme erzeugt ein Audit-Event (alte → neue Registry,
  inklusive Konfigurations-Hash).
- AC-5: Egress-, Wildcard- und Approval-Kopplungen (WC-1, WC-1-B, FR-053)
  werden pro Aufruf neu ausgewertet — eine Registry-Änderung kann keine
  bestehende Gate-Entscheidung „retroaktiv" legitimieren.
- AC-6: Der Mechanismus ist per Konfiguration deaktivierbar
  (`registry.hotReload: false` als Default-Kandidat — Finalentscheidung in
  der Umsetzungsplanung), damit statisch-fail-closed der sichere Modus
  bleibt.

### US2: Dependency-Bootstrap-Operationen (P1)

**As an** agent, **I want** generische `deps-install`/`deps-reinstall`-Operationen
für Node-Workspaces, **so that** ein Gate-Versagen wegen fehlendem oder
ABI-inkompatiblem `node_modules` in der Session heilbar ist, ohne manuelle
Container-Kommandos.

**Acceptance Criteria:**

- AC-7: `deps-install` führt `npm ci` mit Clean-Semantik im **registrierten
  Root** aus; fehlt das Lockfile → Fallback `npm install` (dokumentiert und
  im Audit vermerkt).
- AC-8: `deps-reinstall` entfernt `node_modules` vor der Installation
  (`rm -rf node_modules` scoped auf den Workspace-Root — kein Path-Traversal,
  keine Ausführung außerhalb registrierter Roots).
- AC-9: Reaktive Erkennung: ein Gate-Fehler mit `Cannot find module` oder
  `ERR_DLOPEN_FAILED` liefert in der Fehlerführung einen Verweis auf die
  deps-Operationen (Anschluss an `warnNodeDeps`, das dieselben zwei Fälle
  proaktiv meldet).
- AC-10: Optionale proaktive Sonde (Konfig-Flag, Default aus): gleiche
  `.node`-Probe wie `warnNodeDeps`, auslösend `deps-install`-Hinweis bevor
  Gates laufen.
- AC-11: Beide Operationen tragen `riskClass: workspace_write` und
  unterliegen der FR-053-Approval-Pflicht; Ausgaben sind exposure-gefiltert
  (npm-Output kann Registry-URLs mit Tokens enthalten).
- AC-12: Funktionieren im Container (Linux-native Installation — löst
  GATE-1/DB-1-Kontext: Gates im Container werden nach diesem Feature zu
  verlässlichen Signalen).

## Dependencies / Risiken

- **specs/008-Spannung (US1):** Die Ablehnung „Laufzeit-Registry-Tools"
  (statisch, fail-closed) ist normativer Kontext. Alternative A muss die
  Garantie äquivalent rekonstruieren (deterministische Neubewertung derselben
  Quelle, atomarer Swap, Audit), sonst ist der Kandidat zu verwerfen.
- **AC-5-Interaktion (US1):** Jede Registry-Änderung ändert
  `configurationVersion` → bestehende Sessions. Session-Semantik ist
  ENTSCHEIDEN (R2, 2026-09-30): Weiterführung mit Re-Validierung —
  spezifiziert im Addendum (AC-13…17).
- **Requirements-Mapping US1 (Alternative B):** FR-1201 `registry-register`-
  Tool (profile-abhängig registriert); FR-1202 Ausführung ausschließlich über
  `WorkspaceRegistry.build` auf der kompletten neuen Registry (keine
  Sonderbehandlung); FR-1203 fail-closed bei invalider Eingabe (kein Swap);
  FR-1204 atomare persistente Registry-Datei; FR-1205 Audit-Event pro
  Übernahme (alte → neue Registry); FR-1206 neue `configurationVersion`
  pro Übernahme (AC-5-Interaktion über bestehenden Hash-Vergleich, Rebind
  gemäß Addendum AC-13…17); FR-1207 Konfig-Flag (Default aus);
  FR-1208 Pool-Onboarding ohne Restart; FR-1209 specs/008-Konformität
  (ein enges, fail-closed-Tool); FR-1210 Entfernen einer Root (`remove?`).
- **Requirements-Mapping US2:** FR-1211 `deps-install` (npm ci Clean-Semantik
  - Lockfile-Fallback mit Audit-Vermerk); FR-1212 `deps-reinstall`
    (workspace-scoped); FR-1213 reaktive Erkennung über Gate-Fehlermuster;
    FR-1214 optionale proaktive Sonde; FR-1215 riskClass workspace_write +
    FR-053-Approval + Egress-Filterung; FR-1216 Container-Installation
    (Linux-ABI).
- **Plattform-Fallstricke (US2):** Native Addons müssen im Container
  gebaut werden (Linux-ABI); Windows-Host-`node_modules` sind unbrauchbar —
  genau deshalb installieren die Operationen **im Container**.
- **Sicherheitsrisiko (US2):** `npm install`-Fallback umgeht Lockfile-Pinning
  → nur als dokumentierter Fallback mit Audit-Vermerks; `deps-reinstall`
  löscht `node_modules` (workspace-scoped,Approval-Pflicht).

## Follow-up-Verweise

- HR-1: `memory-bank/remaining-work-plan.md` (2026-09-30, Registry-Hot-Reload)
- DB-1-Rest: `memory-bank/remaining-work-plan.md` (2026-09-30, Dependency-Bootstrap)
- Kontext: GATE-1-Observation (Container-Gates umweltbedingt, required:false)

## Addendum: AC-5-Rebind-Semantik (R2-Entscheidung, 2026-09-30/10-01)

Nutzerentscheidung R2 (2026-09-30): **Weiterführung mit Re-Validierung.**
Live-Reproduktion des Defekts (2026-10-01, session-77a51a32): eine
Mid-Session-Config-Änderung (operations.json) plus Container-Restart
invalidierte die Session fail-closed
(`configuration_invalid`, WorkflowEngine.ts:639-648, `recoverable:false`) —
exakt der seit 2026-09-30 getrackte CHAIN-1-Symptom (Auto-Folgesession
erbt den Hash des Kettenstarts).

Verbindliche Akzeptanzkriterien für die US1-Implementierung:

- AC-13: `completed`-Sessions überleben einen Registry-/Config-Wechsel
  unverändert (kein Rebind nötig, Audit-Event dokumentiert den Wechsel).
- AC-14: `active`- und `blocked`-Sessions werden bei Aktivierung/State-Zugriff
  gegen die neue Registry **re-validiert** (Rebind an die neue
  `configurationVersion` nur nach erfolgreicher Re-Validierung: Registry-
  Validation läuft vollständig, alle referenzierten Roots existieren).
- AC-15: Schlägt die Re-Validierung fehl, bleibt das Verhalten fail-closed
  (`configuration_invalid`, wie heute) — kein stiller Weiterlauf auf
  ungeprüfter Config.
- AC-16: Chain-Successor-Sessions erben NICHT mehr den Hash des
  Kettenstarts, sondern werden bei Aktivierung an die dann aktuelle
  Konfiguration gebunden (Rebind-Pfad aus AC-14); Regressionstest:
  Registry-Änderung zwischen Kettenstart und Folgesession-Aktivierung →
  Folgesession aktiviert mit Re-Validierung statt `configuration_invalid`.
- AC-17: Jeder Rebind erzeugt ein Audit-Event
  (`session_rebound`, from/to configurationVersion).
- Verwandt (Completion-Pfad, separater Defekt GDS-6): nach erfolgreichem
  `retry_operation` in Phase `complete` unterbleibt die Finalisierung
  (kein Terminal-Übergang, kein `workflow_completed`-Audit, keine
  Successor-Erzeugung); `complete_workflow` erneut liefert
  `invalid_active_phase`. Wird mit US1 nicht gelöst, aber im selben
  WorkflowEngine-Bereich adressiert (siehe remaining-work-plan).

---

## Amendment note (package-manager awareness, 2026-10-05)

FR-1211/1212 context: the dependency-bootstrap strategies are
package-manager-dependent since the config assistant gained the optional
`packageManager` answer (npm | pnpm | yarn, default npm; detection is
agent-side from the repo-root lockfiles). Generated semantics per PM:

- npm: `deps-install` = `npm ci` -> fallback `npm install` (unchanged).
- pnpm: `pnpm install --frozen-lockfile` -> fallback `pnpm install`
  (frozen is the sync-with-lockfile equivalent of npm ci; no destructive
  node_modules reset on failure).
- yarn (4+): `yarn install --immutable` -> fallback `yarn install`.
- Gates run via the PM (`npm run` / `pnpm run` / `yarn` + script name;
  npm keeps the idiomatic bare `npm test`).

Unknown `packageManager` values fail closed with `configuration_invalid`.

### Amendment (adopt-mode genericity, 2026-10-05)

`deps-install` and `deps-reinstall` are preset operations: adopt mode
ALWAYS regenerates them from the PM-parameterized template (per the
`packageManager` answer) instead of copying npm-based reference ops.
Reference divergence (e.g. custom registry args) is surfaced via
`divergentOps` + REGENERATED notes, never copied silently.
