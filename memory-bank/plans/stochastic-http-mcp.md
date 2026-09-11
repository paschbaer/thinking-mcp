# Umsetzungsplan: server-stochasticthinking → HTTP-MCP (Clear-thought-Parität)

> Erstellt 2026-09-11 mit Clear-Thought-Decision-Chain (issue_tree → swot_analysis →
> value_of_information → decisionframework → metacognitivemonitoring, Confidence 0.85).
> **Gewählte Option (decisionframework `stochastic-http-mcp-2026-09-11`): B — Full
> clear-thought parity.** Option A (minimaler HTTP-Wrapper) verworfen (Tech-Debt bleibt),
> Option C (Shared-Workspace-Scaffold) verworfen für jetzt (fasst RB-4-Kandidat nach Branch-Merge ins Auge).

## Ausgangslage (Fakten aus dem Code)

| | server-stochasticthinking (Ist) | server-clear-thought (Referenz) |
|---|---|---|
| Transport | nur stdio (`StdioServerTransport`) | stdio (`dev.ts`) + HTTP (`server.ts`, Streamable HTTP) |
| SDK | `@modelcontextprotocol/sdk` ^1.5.0 | ^1.30.0 |
| Architektur | Low-Level `Server` + `CallToolRequestSchema`-Handler, Tool-Logik (MDP/MCTS/Bandit-Summaries) | Factory `createClearThoughtServer` + `McpServer` + zod-Tools |
| HTTP | — | `createStatefulServer` (@smithery/sdk) + Express `/health` + Graceful Shutdown |
| Tests | `test` = No-op | vitest (7 Dateien, 78 Tests) + `test:live` (funktionstest.mjs) |
| Docker | vorhanden (zu prüfen, stdio-lastig) | node:22-alpine, curl-Healthcheck, sed-Workaround für Smithery-SDK, non-root |
| Deps-Sonderfälle | `chalk`/`yargs` (mutmaßlich ungenutzt — prüfen) | zod, express, @smithery/sdk |

## Zielbild

```
Client ──stdio──► src/dev.ts ──────────────┐
                                           ├─► createStochasticThinkingServer()
Client ──HTTP───► src/server.ts (Express) ─┘         (src/index.ts, Factory)
                        ├─ GET /health
                        └─ /mcp (Streamable HTTP, createStatefulServer)
```

## Phasen

### Phase 0 — Spike & Baseline (De-Risking, ~0,5 h)
1. Feature-Branch: `feature/stochastic-http-mcp`
2. `@modelcontextprotocol/sdk` auf ^1.30.0 heben, `npm run build` + `typecheck` am
   bestehenden Low-Level-Code → **löst die Top-VoI-Unsicherheit** (SDK-Sprung bricht
   Low-Level-API? erwartete Impact 1,8) sofort und billig.
3. Bestehenden stochastic-Dockerfile gegen clear-thought diffen.
4. `grep`-Prüfung: werden `chalk`/`yargs` wirklich benutzt? (Wenn nein: entfernen.)
- **AC:** Build grün mit SDK 1.30; Diff-Notizen dokumentiert.

### Phase 1 — Gerüst & Dependencies (~0,5 h)
- `package.json`: Deps `@smithery/sdk` ^1.4.3, `express` ^4.18.2, `zod` ^3.25.27;
  devDeps `vitest`, `tsx`, `@types/express`; `engines.node` auf `>=20` (Parität);
  Scripts wie clear-thought: `build` (tsc -p tsconfig.build.json), `test` (vitest run),
  `test:live`, `typecheck`, `dev` (tsx src/dev.ts), `dev:http` (tsx src/server.ts),
  `start`, `start:http`, `docker:build`, `docker:run`, `clean`.
- `tsconfig.build.json` analog clear-thought.
- **AC:** `npm install && npm run build` grün.

### Phase 2 — Factory & Config (~1–2 h)
- `src/index.ts`: Export der Factory `createStochasticThinkingServer(config?)`
  (Default-Export, Parität zu `createClearThoughtServer`). Bestehende Tool-Logik
  (MDP/MCTS/Bandit, Validierung, `formatOutput`) **unverändert übernehmen** — nur
  Registratur in die Factory ziehen.
- `src/config.ts`: `ServerConfigSchema` (zod) + `ServerConfig`-Typ (Parität; Minimalfelder).
- `src/dev.ts`: stdio-Entry = Factory + `StdioServerTransport` (Parität zu clear-thought).
- Bewusst **nicht** Teil des Scopes: Migration Low-Level `Server` → High-Level
  `McpServer` (separater Follow-up, sonst wächst das Diff und die Tool-Logik wird
  unnötig berührt).
- **AC:** Factory exportiert; `dev` startet stdio-Server; alte `index`-Nutzung kein
  Break für bestehende Aufrufer (Bin-Entry zeigt künftig auf dev.ts-Funktionalität —
  `bin` in package.json auf `dist/dev.js` umstellen oder Wrapper behalten; Entscheidung
  in Phase 2 dokumentieren).

### Phase 3 — HTTP-Server (~0,5 h)
- `src/server.ts`: Muster aus clear-thought 1:1 — `createStatefulServer` mit
  zod-Schema, `GET /health` (`service: 'stochastic-thinking-mcp'`), Error-Middleware,
  `PORT` env (Default 3000), SIGTERM/SIGINT-Graceful-Shutdown.
- **AC:** `npm run dev:http` → `/health` 200 ok; Server-Log zeigt `/mcp`-Endpoint.

### Phase 4 — Tests (~1–2 h)
- `vitest.config.ts`; Testsuite:
  1. Factory-Test: `listTools` enthält alle Stochastic-Tools (via `InMemoryTransport.createLinkedPair()`).
  2. Round-trip: `tools/call` je Kern-Tool (MDP/MCTS/Bandit) — Ausgabe enthält erwartete Summary-Fragmente.
  3. Validierung: ungültige Inputs → saubere MCP-Fehler (keine ungefangenen Exceptions).
  4. HTTP-Smoke: `app` aus `server.ts`-Export (oder supertest-frei über `app.listen(0)`) → `/health` 200.
- `scripts/funktionstest.mjs` (Live-Check wie clear-thought): HTTP initialize →
  tools/list → tools/call; **zwei sequenzielle Calls** gegen dieselbe Session
  (Prüft Stateful-Session-Semantik bei zustandslosen Tools).
- **AC:** `npm test` grün; `test:live` grün gegen laufenden Server.

### Phase 5 — Packaging, Deploy, Doku (~1 h)
- `Dockerfile`: Port des clear-thought-Layouts (node:22-alpine, `npm ci --ignore-scripts`,
  **sed-Workaround** für `@smithery/sdk/dist/shared/config.js`, prune, non-root,
  HEALTHCHECK auf `/health`, `CMD ["node","dist/server.js"]`, LABELs auf stochastic).
- Root-`package.json`: `docker`-Script um stochastic erweitern (Parität zu clear-thought).
- README: Root-Server-Tabelle + Server-README — HTTP-Start, Port, `/health`, Docker-Befehle.
- `memory-bank`: RB-1 in `remaining-work-plan.md` schließen; `progress.md`/`activeContext.md` aktualisieren; Entscheidung `stochastic-http-mcp-2026-09-11` (Option B) in die PR-Beschreibung (AGENTS.md-Konvention).
- **AC:** `docker build` + `docker run` lokal verifiziert, Healthcheck grün; Doku aktuell.

## Risiken & Mitigationen

| Risiko | Wirkung | Mitigation |
|---|---|---|
| SDK 1.5→1.30 bricht Low-Level-API-Details | Build-/Laufzeitfehler | Phase-0-Spike zuerst; typecheck als Tor |
| Stateful-Session-Semantik (@smithery/sdk) überrascht zustandslose Tools | Session-/Verbindungsfehler | Round-trip-Test mit 2 sequenziellen Calls (Phase 4) |
| sed-Workaround fragil bei SDK-/Smithery-Upgrade | Docker-Build bricht | 1:1 von clear-thought übernehmen (bewährt), Kommentar im Dockerfile |
| stdio-Consumer brechen beim Umbau | Integration bricht | `dev.ts`-Pfad durchgehend am Leben halten; AC je Phase |
| Scope Creep Richtung Shared-Scaffold (Option C) | Verzögerung | Explizit out of scope; RB-Kandidat nach Merge |

## Definition of Done (gesamt)

- HTTP: `/health` ok, `/mcp` mit initialize → tools/list → tools/call Round-trip (funktionstest).
- stdio-Einstieg weiterhin funktionsfähig.
- `npm run build && npm test && npm run typecheck` grün; Docker-Build/-Run verifiziert.
- Root-README + Server-README aktuell; Root-Docker-Script vorhanden.
- Memory-Bank aktuell; RB-1 geschlossen; RB-4 (Option C Shared-Scaffold) ggf. neu getrackt.

## Aufwandsschätzung

~5–7 h Gesamt (Phase 0: 0,5 · 1: 0,5 · 2: 1–2 · 3: 0,5 · 4: 1–2 · 5: 1) —
jede Phase einzeln commitbar (Conventional Commits, Feature-Branch `feature/stochastic-http-mcp`).
