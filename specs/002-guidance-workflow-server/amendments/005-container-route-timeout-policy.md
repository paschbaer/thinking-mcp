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
  (`examples/default-guidance/responses-wisdom.json`, `responses.json`
  via `buildResponses`) wird zur Reihenfolge
  **(1) retry ONCE (read-only/idempotent) → (2) Container-Route des
  Tools, sofern verfügbar → (3) lokale Tools/CLI → (4) `report_blocker`
  (infrastructure)** erweitert. Schwere GitNexus-Arbeit (analyze/
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
  im Snapshot (additiv).
- Templates: FR-035-Text in `responses-wisdom.json` (7 Phasen) und den
  davon abgeleiteten Workspace-Configs; `containerRoute`-Beispiel für
  Clear-Thought in `examples/default-guidance/downstream-servers.json`.
- Tests: `tests/contract/container-route-fallback.test.ts` (Config-
  Validierung inkl. SSRF-/Allowlist-Fälle, transiente Route, Metrik);
  Suite `tests/contract` + `tests/setup` 221/221 grün (Baseline
  210/210 + 11 neue), `tsc --noEmit` clean.
