# Plan & Data Model: LOW-Residue Closure

**Feature:** specs/008-low-residue-closure · **Date:** 2026-09-27

## Architecture Summary

Kein neuer Executor, kein neues Gate. Drei kleine Code/Doku-Flächen:

1. **Stream-Semantik (FR-801):** Die async-Ausführung zeichnet stdout und
   stderr in getrennten Puffern auf; eine quergestreamte Reihenfolge ist
   POSIX-seitig nicht garantiert und wird bewusst nicht simuliert. Die
   agent-facing Fehloberfläche nutzt ausschließlich den redigierten
   stderr-Kanal (siehe `executeSync`-Error-Mapping). Semantik wird im
   Codekommentar festgehalten und durch einen Test gepinnt.
2. **Router-Proxy (FR-802):** Der Remote-Router wird zu einem `Proxy` um
   das Basisobjekt (`execute`/`executeRequired`): unbekannte Properties
   werden an die Downstream-Engine-Instanz weitergeleitet (Methoden
   gebunden). Damit ist die `as unknown as OperationEngine`-Stelle zur
   Laufzeit abgedeckt, ohne die Typsicherheit der Kernklasse aufzuweichen.
3. **Prompt-Auslieferung (FR-804/L253-Ersatz):** Kopie des Masters unter
   `servers/server-guidance/prompts/capture-lessons.prompt.md`,
   Aufnahme in `files`, README-Abschnitt. L253 bleibt obsolet-closed.

## Testing Strategy

- T001: Interleaving-Child (out/err abwechselnd, mehrfach) → op succeeded,
  stdout/stderr getrennt im Executor geprüft (Executor-intern via spy?
  nein — über Failing-Pfad stderr geprüft, Parität als dokumentierte
  Semantik).
- T002: Proxy-Forwarding unbekannter Member (SC-802-Vorab).
- T005: Suite ≥ 312 + neue.

## Risiken

| Risiko | Mitigation |
|---|---|
| Proxy fängt interne Zugriffe (z. B. `then`) und stört Promise-Semantik | `then`/`catch`/`finally` explizit vom Forwarding ausgeschlossen (nur auf Target auflösen) |
| Prompt-Kopie driftet vom Master | Header-Verweis auf Master + Hygiene-Regel (Sync bei Master-Änderung) |
