# Spec Amendment 005: FR-035 Timeout-Policy — Container-Route vor lokalem Fallback

> Status: **IMPLEMENTED** (feature/fr035-container-route)
> Base: spec 002 v1+v2+v2.1 + amendments 001–004
> FR-Nummern: FR-611…613 ( Fortsetzung des Amendment-004-Kreises FR-601+)
> Date: 2026-09-28

## 1. Problem

Die FR-035-Timeout-Policy (Agent-Konvention, verankert in den Phase-
Instruktionen der Responses-Templates) sah bei Timeout eines Remote-
Tool-Aufrufs nur: 1× Retry (read-only), danach lokale Tools/CLI bzw.
`report_blocker`. Dabei ist die Container-Route des Tools — der HTTP-
Endpoint, der aus dem Guidance-Container heraus erreichbar ist —
häufig verfügbar und erfolgreich, während der direkte MCP-Transport
des Clients timeoutet (praktisch verifiziert 2026-09-27/28:
Clear-Thought `sequential_thinking` über den Client-Transport 2×
Timeout, über die Container-Route (`run_operation`) erfolgreich,
177 ms).

## 2. Entscheidung (Nutzer, 2026-09-28)

1. **Textregel + maschinelle Umsetzung** (nicht nur Dokumentation).
2. **FR-035 wird amendiert** (keine neue FR-Nummer für die Policy),
   dokumentiert in diesem Amendment.
3. RID-1 (requestId-Reuse-Hardening) folgt als separate Änderung.

## 3. Entwurf

- **FR-611 (Textregel):** Die FR-035-Policy in allen Phase-Instruktionen
  der **Wisdom-Baseline** (`examples/default-guidance/responses-wisdom.json`)
  sowie den davon abgeleiteten Workspace-Configs wird zur Reihenfolge
  **(1) retry ONCE (read-only/idempotent) → (2) Container-Route des
  Tools, sofern verfügbar → (3) lokale Tools/CLI → (4) `report_blocker`
  (infrastructure)** erweitert. **Re-Scope nach Review F2:** die
  Fresh-Baseline (`buildResponses`/`responses.json`) enthält historisch
  keine FR-035-Policy — das bleibt zunächst unverändert (grüner
  Drift-Guard ist daher kein FR-611-Nachweis); das Nachziehen in die
  Fresh-Baseline ist als Follow-up getrackt (memory-bank/
  remaining-work-plan.md). Schwere GitNexus-Arbeit (analyze/
  reindex) bleibt über das Terminal-CLI statt MCP geroutet.
- **FR-612 (maschinell):** `downstream-servers.json` erhält das
  optionale Feld `servers.<id>.containerRoute`
  (`{ url, headers? }`, `${ENV_VAR}`-Auflösung wie `transport.http`).
  Validierung fail-closed: URL-Regeln wie `transport.http.url`
  (http/https, gültige URL), Header object-of-strings; der Host MUSS
  in `policies.egress.httpHostAllowlist` allowlisted sein (SSRF-Schutz);
  ein enabled Server mit `containerRoute` erzwingt die Existenz der
  Allowlist. Konfigurationsfehler blockieren den Config-Load.
- **FR-613 (Engine-Fallback):** Timeoutet ein **read-only**-Call
  (`riskClass: "read_only"` der Operation) auf dem primären Transport,
  macht die Engine **genau einen** automatischen Versuch über die
  `containerRoute` (transienter HTTP-Client, primäre Verbindung bleibt
  unberührt), bevor der Fehler gemeldet wird. `workspace_write` /
  `external_write` werden NIE automatisch wiederholt (der Call kann
  downstream bereits gelaufen sein — kein AbortSignal in MCP
  `callTool`). Ergebnisse werden je Server in `get_metrics` unter
  `containerRouteFallbacks` (`{ attempted, succeeded, failed }`)
  gezählt.

## 4. Abgrenzung

- Für Server mit HTTP-Primary-Transport ist die Container-Route
  funktional häufig dieselbe URL — der Mehrwert ist die explizite,
  konfigurierbare zweite Route (und die Doku der Agent-seitig nutzbaren
  Route); der Fallback bleibt auf EINEN Versuch begrenzt (keine
  Retry-Vermehrung).
- Der Agent-seitige Fallback (Client-Transport timeoutet) läuft über
  `run_operation` durch den Guidance-Server — die Textregel dokumentiert
  diesen Weg; ein neues Agent-facing Tool ist nicht erforderlich.

## 5. Umsetzung (Feature `feature/fr035-container-route`)

- `src/config.ts`: `containerRoute`-Validierung (fail-closed) +
  Egress/Env-Resolution in `applyHttpTransports`.
- `src/mcp-client/ClientManager.ts`: `invokeOnTransientHttpRoute`
  (ein Call, Timeout-Race, isoliertes Close, Test-Seam `routeKey`).
- `src/workflow/WorkflowEngine.ts`: Fallback-Gate in
  `buildInvokerClosure` (nur `timedOut` + `riskClass "read_only"` +
  konfigurierte Route) + `recordContainerRouteFallback`.
- `src/metrics/MetricsRepository.ts`: `containerRouteFallbacks`-Zähler
  im Snapshot (additiv; in-memory, nicht persistiert — Reset beim
  Neustart, siehe README).
- Templates: FR-035-Text in `responses-wisdom.json` (7 Phasen) und den
  davon abgeleiteten Workspace-Configs; `containerRoute`-Beispiel für
  Clear-Thought in `examples/default-guidance/downstream-servers.json`.
- Tests: `tests/contract/container-route-fallback.test.ts` (Config-
  Validierung inkl. SSRF-/Allowlist-Fälle, transiente Route, Metrik);
  Suite `tests/contract` + `tests/setup` grün, `tsc --noEmit` clean.
- **Review-Fixes (Runde 1, F1–F5):** F1 HIGH (SSRF-Bypass für stdio-
  Server) — Allowlist/Env-Block vor den Transport-Typ-`continue`
  gezogen + 2 Regressionstests; F4 — Timeout-Guard in
  `invokeOnTransientHttpRoute`; F5 — `recordConnection` auch im
  Fallback-Pfad. F3 (Engine-Gating-Test) als Test-Debt getrackt
  (remaining-work-plan.md, Trigger: nächste Berührung von
  `buildInvokerClosure` — GDS4 arbeitet parallel an WorkflowEngine).
