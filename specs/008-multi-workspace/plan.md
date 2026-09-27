# Plan: 008-multi-workspace

**Basis:** spec.md (Decisions Q1–Q5 locked, 2026-09-27)
**Risiko:** MEDIUM (MR-1) — berührt Sicherheitsvalidierung
(`assertWorkspaceInside`), State-Layout und Lock-Semantik.

## Architektur-Skizze

```
guidance.json
  └─ workspaces[]: { name, root, projectName? }
        │
WorkspaceRegistry (neu, src/config.ts-Nähe)
  ├─ resolve(name | root) → WorkspaceEntry (fail-closed)
  ├─ Default-Eintrag "default" aus GUIDANCE_WORKSPACE_ROOT (FR-806)
  └─ fließt in configurationVersion-Hash ein (FR-019)
        │
composeApplication: statt 1 workspaceRoot
  → pro Workspace: ConfigLoad, StateDir (<root>/.guidance/state/),
    SpecKitEngine, Operationen, Downstream-Config
        │
Lock: WorkspaceOpLock-Key = hash(realpath(root)) + opId (FR-804)
Gates: Workspace-Kontext in Gate-Ops (FR-805)
```

## Phasen

### P1 — Registry & Config-Schema (FR-801, FR-806)
1. `workspaces[]` in `GuidanceMainConfig` + Ajv-Schema: `{ name
   (^[a-z][a-z0-9-]*$), root (absolut), projectName? }`; fail-closed
   Fehlerklassen (`configuration_invalid`-Familie, klare Meldungen).
2. `WorkspaceRegistry`: Build aus Config + Default-Eintrag
   `default` → `GUIDANCE_WORKSPACE_ROOT` wenn `workspaces[]` fehlt
   (Rückwärtskompatibilität). Registry-Serialisierung geht in den
   `configurationVersion`-Hash ein.
3. Eindeutigkeits-Checks: Name eindeutig, Root (realpath) eindeutig.

### P2 — Namensbasierte Bindung & Security (FR-802, AC-2)
4. `assertWorkspaceInside` → `assertWorkspaceRegistered(candidate,
   registry)`:Akzeptiert nur Roots registrierter Workspaces; neue
   Fehlerklasse `workspace_not_registered` (ERROR_CODES-Snapshot
   aktualisieren, R-010-Muster).
5. `start_workflow` + alle Tools mit `workspaceRoot`-Parameter:
   Parameter `workspace` (Name); `workspaceRoot`-Eingabe wird nur noch
   akzeptiert, wenn sie exakt einem registrierten Root entspricht
   (Deprecation-Pfad), sonst `workspace_not_registered`.
6. `SpecKitEngine`: `spec_kit_feature_outside_workspace`-Check gegen
   den Session-Workspace statt gegen den globalen Root.

### P3 — Per-Workspace Config/State (FR-803, AC-1)
> Review-Anmerkung (Architekt): P3 ist der größte Posten —
> OperationEngine, WorkflowEngine und State-Persistence haben alle
> Root-Bezüge und sind auf workspace-Parametrisierung umzustellen
> (statt N Application-Instanzen mit Memory/Metrics-Kollisionen).
> Kostenschätzung vor T8 nachziehen.
7. Config-Load pro Workspace (`.guidance/` im jeweiligen Repo),
   gecacht, je Workspace eigener `configurationVersion`-Hash.
8. State-Dir je Workspace `<root>/.guidance/state/`; Snapshots,
   Capability-Pins, Audit-Logs landen im Repo (heutiges Layout,
   multipliziert).
9. Paralleler Betrieb: maximal 2 Workspaces in Tests mit gleichzeitigen
   Sessions; State-Isolation nachweisen.

### P4 — Lock-Scoping (FR-804)
10. Lock-Key um Workspace-Identität erweitern (hash(realpath(root)));
    TTL-Formel, link()-Acquire, Quarantäne-Steal, L-5-Cap unverändert.
11. Regressionstests: 6-Prozess-Race je Workspace; Cross-Workspace:
    2 parallele Ops in verschiedenen Workspaces blockieren sich nicht.

### P5 — Gate-Verdrahtung (FR-805, AC-4)
12. `repository-analysis`/`index-freshness`/`check-final-review`
    erhalten Workspace-Kontext (Index-Konvention `<root>/.gitnexus`);
    Gate-Ergebnisse referenzieren den Workspace-Namen.

### P6 — Docs/Deployment (FR-807, MR-2)
13. README-Abschnitt Multi-Workspace; `docker-compose.override.yml`
    Beispiel mit zweitem Mount (Niyama) + guidance.json-Beispiel.
    `.guidance/state`-gitignore-Pflicht je Workspace-Repo (Gate-Rennen,
    Lesson 2026-09-26); `/health`-Registry-Exposure + Workspace-Dimension
    in `get_metrics` (FR-808).

### P7 — Verification
14. Vollsuite + tsc + build; ERROR_CODES-Snapshot-Test; AC-1…AC-5 als
    dedizierte Tests; Bestandstests unverändert grün (AC-3).

## Risiken / Gegenmaßnahmen

| Risiko | Maßnahme |
|---|---|
| Security-Regression bei Verallgemeinerung von `assertWorkspaceInside` | Fail-closed Default; Regressionstest AC-2; kein Realpath-Fallback-Erraten |
| State-Migration bestehender Sessions | Kein Migration-Pfad nötig: Default-Workspace nutzt exakt heutiges Layout (FR-806) |
| Gate prüft falschen Workspace | Workspace-Name als Pflichtfeld im Gate-Report (AC-4) |
| Windows-Host-Pfade vs. Container-Pfade (D:/repos ↔ /workspace) | Registry-Einträge lösen im Container-Pfadsystem auf; Docs machen Mount↔Root-Zuordnung explizit |
