---
description: Implement specs/008-multi-workspace (Guidance Multi-Workspace-Registry) nach Spec-Kit-Artefakten
---

# Feature 008-multi-workspace implementieren

Implementiere das Spec-Kit-Feature `specs/008-multi-workspace` (Guidance
Multi-Workspace-Support) vollständig gemäß den Artefakten im Feature-
Verzeichnis. Die Design-Entscheidungen sind abgeschlossen — es gibt
keine offenen Fragen; weiche nicht von spec.md/plan.md ab.

## Kontext (zwingend lesen)

1. **Artefakte:** `specs/008-multi-workspace/spec.md`, `plan.md`,
   `tasks.md` (T1–T17, Batch-Modus max 3, abhängigkeitsbewusst).
2. **Memory Bank:** alle Dateien in `memory-bank/`; insbesondere
   `remaining-work-plan.md` (Triggers MR-1/MR-2 → dieses Feature) und
   die Gate-Rennen-Lesson 2026-09-26 in AGENTS.md.
3. **Code-Basis:** `servers/server-guidance/src/` — Schlüsselstellen:
   `index.ts:15-16` (singulärer workspaceRoot), `config.ts`
   (fail-closed-Loader, `configurationVersion`),
   `mcp-server/register-tools.ts:82-98` (`assertWorkspaceInside`),
   `integrations/spec-kit/SpecKitEngine.ts:116-120`,
   `workflow/workspace-lock.ts` (WorkspaceOpLock).

## Regeln (aus AGENTS.md, verbindlich)

- **Feature-Branch** `feature/multi-workspace` erstellen; NIEMALS auf
  `main`/`develop` direkt committen.
- **GitNexus:** Vor jeder Symbol-Änderung
  `impact({target, direction: "upstream"})` mit Blast-Radius-Bericht;
  vor jedem Commit `detect_changes()`. HIGH/CRITICAL-Risiko → Stoppen
  und melden.
- **Clearthought:** Komplexe Schritte (P2 Security-Verallgemeinerung,
  P3 Parametrisierung) mit `sequential_thinking` (min. 3–5 Thoughts)
  planen; Bugfix-Protokoll bei Fehlern einhalten.
- **Review Evidence Protocol:** Snapshot-Tabelle (Branch, HEAD,
  review basis) + Evidence-Table je Finding; kein `approved` ohne
  HIGH/CRITICAL-Count.
- **Cleanup:** keine temp files im Commit.

## Procedure

1. **Vorbereitung:** Branch erstellen; `git status --short --branch`
   + `git rev-parse HEAD` als Review-Basis dokumentieren.

2. **Phasenweise Umsetzung** gemäß plan.md:
   - P1 (T1–T3): `workspaces[]`-Schema + `WorkspaceRegistry`
     (Default-Eintrag `default` aus `GUIDANCE_WORKSPACE_ROOT`,
     realpath-Eindeutigkeit, Hash-Eingang).
   - P2 (T4–T7): `assertWorkspaceRegistered` ersetzt
     `assertWorkspaceInside`; `realpathSync` auf BEIDEN Seiten
     (FR-802); `workspace_not_registered`-Fehlerklasse +
     ERROR_CODES-Exact-Snapshot; AC-2-Testmatrix (Traversal, Case,
     Symlinks).
   - P3 (T8–T10): pro-Workspace Config-Load/Cache/Hash; State-Dir
     `<root>/.guidance/state/`; 2-Workspace-Parallel-Integrationstest.
   - P4 (T11–T12): Lock-Key um Workspace-Identität erweitern —
     Invarianten (link()-Acquire, Quarantäne-Steal, TTL-Formel,
     L-5-Cap) unverändert.
   - P5 (T13): Gates mit Workspace-Kontext (`<root>/.gitnexus`),
     Gate-Reports referenzieren Workspace-Namen.
   - P6 (T14, T17): Docs + compose-Beispiel (Niyama-Mount);
     `.guidance/state`-gitignore-Pflicht; `/health`-Registry-Exposure;
     `get_metrics`-Workspace-Dimension.
   - P7 (T15–T16): AC-1…AC-5-Tests; Vollsuite + tsc + build;
     Bestandstests unverändert grün (AC-3).

3. **Nach jeder Task:** `tasks.md`-Checkbox setzen (nur mit Evidence:
   Testname/Ergebnis), `memory-bank/activeContext.md` aktualisieren.

4. **Abschluss:**
   - Self-Review gemäß Review Evidence Protocol (Snapshot-Tabelle +
     Evidence-Table); `submit_implementation` /
     `submit_implementation_review` falls Guidance-Session aktiv.
   - Vor Merge: alle Tests grün, `detect_changes()` ohne
     unerwartete Symbole; Knowledge-Graph aktualisieren
     (`gitnexus analyze --no-stats` — Flag obligatorisch).
   - `memory-bank/progress.md` + `lessonsLearned.md` aktualisieren;
     MR-1/MR-2 in `remaining-work-plan.md` auf [x] mit Evidence.

## Akzeptanz (aus spec.md, verbindlich)

AC-1 Parallelbetrieb ohne Kollision · AC-2 fail-closed Ablehnung mit
Testmatrix · AC-3 Bestandsverhalten unverändert (Default-Workspace) ·
AC-4 Gate-Korrektheit je Workspace · AC-5 globale Invalidierung bei
Registry-Änderung. FR-801…FR-808 vollständig umgesetzt.
