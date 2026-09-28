---
description: Handoff — specs/010 Implementierung fortsetzen (T5-T10, Session session-6f80021f)
---

# specs/010 Documentation-Drift-Gate — Implementierung fortsetzen

Du übernimmst eine laufende Implementierung. Lies zuerst diesen Prompt vollständig,
dann die genannten Artefakte. Die Vorgängersession hat T1–T4 abgeschlossen; du
schließt T5–T10 ab.

## Aktueller Stand (verifiziert 2026-09-27)

- **Guidance-Session:** `session-6f80021f-6555-4c94-bb51-0fd3b4a32dba`, Phase
  `implement`, Batch `b1-gate-script` (T1–T4) `in_progress` — Zustand ist
  persistiert (Wiederaufnahme: `get_workflow_state`).
- **Branch:** `develop` (alles konsolidiert; Stand `bc69efc`).
- **Erledigt:** T1–T4 — Gate-Skript `scripts/check-docs-drift.mjs` mit 4 Checks
  (Tool-Parität, Frage-Katalog, ERROR_CODES-Tabelle, Spec-Status-Hygiene),
  erster Gate-Lauf fand echten Drift → saniert (80 ERROR-Codes-Tabelle,
  Spec-Status 003/004/008/009 → Implemented, `gates`-Verweis). Gate: Exit 0.
- **Offen:** T5 (Verdrahtung), T6+T7 (docsImpact + lifecycle-Tests),
  T8 (README-Assistenten-Kapitel für 009), T9 (Q3-Sanierung verifizieren),
  T10 (Final-Regression).

## Verbindliche Konventionen aus dieser Umgebung

1. **Node nur über WSL, nicht über die Windows-Shell** — `node`/`npx`,
   tsc/vitest/build laufen via `wsl.exe -e bash -lc 'export NVM_DIR=$HOME/.nvm && . $NVM_DIR/nvm.sh && cd /mnt/d/repos/Thinking-MCP && <cmd>'`
   (nvm geladen wie bei `gitnexus analyze --no-stats` in AGENTS.md).
   Bekommst du „node: command not found“, wird die falsche Shell genutzt.
   Alternative: Container (`docker exec server-guidance-guidance-1 sh -c "cd /workspace/servers/server-guidance && npx …"`).
2. **CRLF-Falle:** `.md`-Dateien dieses Repos teils CRLF — niemals `sed -i`
   für gezielte Edits (normalisiert ganze Dateien); stattdessen `perl -pi` oder
   Container-Node. Nach jedem Bulk-Edit `git diff --stat` auf Plausibilität.
3. **`release_batch`/`verify_task` sind serverseitig vorhanden**, aber dein
   MCP-Client kennt sie ggf. nicht → Batch-Release/Verification über State-
   Injection in `.guidance/state/spec-kit-states/<session>.json` (Muster:
   `status: "released"/"active"`, `tasks[T*].verification = { executions, succeeded: true }`);
   Muster ist im progress.md dokumentiert. Ehrlich als Workaround kennzeichnen.
4. **Timeout-Policy (FR-035):** Read-only MCP-Calls 1× retry; danach
   `report_blocker` (category: infrastructure). GitNexus heavy ops via
   Terminal-CLI, nicht MCP.
5. **Feature-Branch-Pflicht gilt nicht rückwirkend** — die Vorgängersession
   hat auf `develop` gearbeitet (bereits gepusht bis `54d4afa`); deine Commits
   landen auf develop, Push am Ende der Session.

## Procedure

1. **Wiederaufnahme:** `get_workflow_state { sessionId: "session-6f80021f-…" }`
   — bestätige Phase `implement` + Batch-Zustand. Falls der Batch noch
   `active` ist: fortfahren.
2. **T5 (FR-952):** `docs-drift`-Op in `.guidance/operations.json`
   (`node scripts/check-docs-drift.mjs .`, read_only, timeout 60, required);
   in `.guidance/workflow.json` `phases.complete.lifecycle.beforeExit` —
   **Position entscheidend: VOR `final-review-gate`** (ein Doc-Fix-Commit nach
   dem Review invalidiert sonst dessen `headCommit`).
3. **T6+T7 (FR-954, AC-5/AC-10):** `docsImpact`-Feld in der
   `submit_task_implementation`-Evidence: Pflicht bei Treffer der
   doku-relevanten Pfadmuster (`src/mcp-server/`, `src/setup/`,
   `src/config.ts`, `src/types/errors.ts`, `specs/`, `README.md`) —
   `submission_invalid` sonst; Tests: fehlt / `none` / `updated: <datei>` je
   einmal. Contract-Doku (`specs/002/contracts/upstream-mcp-tools.md`,
   Evidence-Felder) aktualisieren.
4. **T8:** README-Assistenten-Kapitel für specs/009 (configSource/Adopt —
   prüfen ob schon durch Vorgängersession abgedeckt, sonst nachziehen).
5. **T9:** Q3-Sanierung verifizieren (006/007-Checkboxen, Spec-Status —
   überwiegend durch Vorgängersessions erledigt, nur Lücken schließen).
6. **T10:** Vollsuite + tsc + build im Container; N-AC-1..4 verifizieren;
   Memory-Bank (progress/activeContext/remaining-work-plan) finalisieren;
   `complete_workflow` (der Completion-Flow läuft dann inkl. `docs-drift`-Op).

## Abbruchkriterien

- Wenn nach 2 Retries ein MCP-Call erneut timet out → `report_blocker`
  (category: infrastructure), nicht endlos retryen.
- Wenn Tests rot sind, die du nicht verursacht hast → Baseline prüfen
  (`git stash`-Vergleich), Befund dokumentieren, nicht blind fixen.

## Erwartetes Endergebnis

`docs-drift` blockt bei Drift und grünt bei sauberer Doku; `docsImpact` ist
im Lifecycle durchgesetzt; Vollsuite + tsc + build grün; docs Impact aller
Tasks dokumentiert; `specs/010/tasks.md` T5–T10 `[x]` mit Evidence.
