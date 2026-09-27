# Tasks: 008-multi-workspace

> Batch-Modus (max 3, abhängigkeitsbewusst) gemäß guidance.json.
> [P]=Phase aus plan.md

## P1 — Registry & Config-Schema

- [ ] T1 `workspaces[]` in `GuidanceMainConfig` + Ajv-Schema
  (`{name, root, projectName?}`, Name-Regex, absoluter Root);
  fail-closed Fehlermeldungen. — FR-801
- [ ] T2 `WorkspaceRegistry` (resolve fail-closed, Default-Eintrag
  `default` aus `GUIDANCE_WORKSPACE_ROOT` bei leerer Liste,
  Eindeutigkeit Name+realpath(root), Eingang in
  `configurationVersion`). — FR-801, FR-806
- [ ] T3 Unit-Tests Registry: Valid/invalid Einträge, Duplikate,
  Default-Fallback, Hash-Beteiligung (AC-5-Präfix).

## P2 — Namensbasierte Bindung & Security

- [ ] T4 `assertWorkspaceRegistered` ersetzt
  `assertWorkspaceInside`; Fehlerklasse `workspace_not_registered`;
  ERROR_CODES-Exact-Snapshot aktualisieren. — FR-802, AC-2
- [ ] T5 Tool-Oberfläche: `workspace`-Parameter (Name) auf
  `start_workflow` u. a.; `workspaceRoot`-Eingabe nur noch bei exakter
  Übereinstimmung nach `realpathSync` BEIDER Seiten (Registry-Root +
  Kandidat; Symlinks/Case) mit registriertem Root (Deprecation). —
  FR-802
- [ ] T6 `SpecKitEngine`-Root-Check gegen Session-Workspace;
  `spec_kit_feature_outside_workspace` beibehalten, Scoping anpassen.
- [ ] T7 Security-Regressionstests: fremder Pfad/Namen abgelehnt;
  Pfad-Traversal (`../../etc`), Windows-Case, Symlink-Aliase,
  Name/Pfad-Verwechslung (AC-2-Matrix).

## P3 — Per-Workspace Config/State

- [ ] T8 Pro-Workspace Config-Load + Cache + eigener
  `configurationVersion`-Hash. — FR-803
- [ ] T9 State-Dir je Workspace `<root>/.guidance/state/` (Snapshots,
  Pins, Audit); kein gemeinsamer State. — FR-803
- [ ] T10 Integrationstest: 2 Workspaces, parallele Sessions,
  State-Isolation (AC-1).

## P4 — Lock-Scoping

- [ ] T11 `WorkspaceOpLock`-Key um Workspace-Identität erweitern;
  Invarianten unverändert. — FR-804
- [ ] T12 Tests: 6-Prozess-Race je Workspace; Cross-Workspace
  Parallel-Progress (AC-1-Präfix).

## P5 — Gate-Verdrahtung

- [ ] T13 Gates (`repository-analysis`, `index-freshness`,
  `check-final-review`) mit Workspace-Kontext; Report referenziert
  Workspace-Name; Index-Konvention `<root>/.gitnexus`. — FR-805, AC-4

## P6 — Docs/Deployment

- [ ] T14 README Multi-Workspace + docker-compose.override-Beispiel
  (zweiter Mount, guidance.json-Beispiel, Mount↔Root-Zuordnung);
  `.guidance/state`-gitignore-Anforderung dokumentiert; Deployment-
  Validierung (nicht gemounteter Root → klare Meldung + /health-Markierung). —
  FR-807, MR-2
- [ ] T17 Observability: `/health` exposiert Registry (Namen, Roots,
  Erreichbarkeit); `get_metrics` mit Workspace-Dimension. — FR-808

## P7 — Verification

- [ ] T15 AC-5-Test: Registry-Änderung → laufende Session failt bei
  nächster Operation mit Konfigurationsfehler.
- [ ] T16 AC-3-Regression: Bestandssuite + tsc + build grün mit
  Default-Workspace-Setup; ERROR_CODES-Snapshot konsistent.
