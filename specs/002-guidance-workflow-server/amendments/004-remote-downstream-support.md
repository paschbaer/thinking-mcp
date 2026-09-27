# Spec Amendment 004: Remote Downstream Support (L305d)

> Status: **DRAFT** (Design — Implementierung separat)
> Base: spec 002 v1+v2+v2.1 + amendments 001–003
> FR-Nummern: FR-601…605 (eigener Kreis zu 005 FR-401+ und 006 FR-501+,
> siehe Namensraum-Konvention in systemPatterns.md)
> Date: 2026-09-26

## 1. Problem (L305d)

Im Remote-Mode führt der `ClientOpEngine` keine Operationen aus: Nicht
gemeldete Operationen werden als `awaiting_client` gemeldet. Das ist für
client-seitige Ops (Feature 003) korrekt — aber **Downstream-MCP-Operationen**
(`server`/`capability`) könnten serverseitig ausgeführt werden und müssen
nicht den Umweg über den Client nehmen. Heute blockieren sie Remote-
Workflows unnötig.

## 2. Designoptionen

| Option | Mechanismus | Bewertung |
|---|---|---|
| **A: Server-seitige Ausführung** | Remote-Session-Engine erhält für Ops mit `server`/`capability` den regulären `OperationEngine`-Executor (ClientManager + Policy + Redaction) | ✅ Empfehlung: Wiedervernutzung des gesamten Trust-Stacks (Policy/Egress/Redaction/Pins), geringster neuer Code |
| B: Proxy-Tool an den Client | Server stellt ein `invoke_downstream`-Tool für den Client bereit | ❌ Verschiebt das Trust-Problem zum Client; umgeht serverseitige Policies |
| C: Delegation an Second-Agent | Successor-Session im lokalen Modus | ❌ Orchestrierungs-Zirkularität, kein Mehrwert gegenüber A |

## 3. Entwurf (Option A)

- **FR-601:** Die Remote-Session-Komposition erhält beide Executor: der
  `ClientOpEngine` bleibt für client-seitige Ops (Tokens, Reports),
  ein regulärer `OperationEngine` (mit `ClientManager` der Remote-Session)
  übernimmt Ops mit `server`/`capability`. Routing nach Op-Typ.
- **FR-602:** Downstream-Ops laufen durch den vollen Trust-Stack (Policy/
  Egress, Capability-Allowlist, Capability-Pins, Redaction, Exposure,
  Audit) — identisch zum lokalen Modus; keine `awaiting_client`-Meldung
  mehr für diese Ops.
- **FR-603:** Client-seitige Ops behalten das Token-Binding (spec 005
  FR-404/006 FR-501) unverändert.
- **FR-604:** Downstream-Verbindungen der Remote-Session werden im
  `get_metrics`-Connection-Snapshot geführt und unterliegen den Session-
  Limits (Timeout, Retry) wie im lokalen Modus.
- **FR-605:** Keine neuen Konfigurationsschlüssel; das Downstream-Set ergibt
  sich aus der importierten Workspace-Konfiguration (`.guidance/
  downstream-servers.json` des Remote-Workspaces).

## 4. Konsequenzen

- `get_downstream_status`/`retry_operation` funktionieren im Remote-Modus
  für Downstream-Ops.
- Egress-/Netzwerk-Policies des Servers gelten für Remote-Sessions —
  Betreiber müssen Downstream-Endpunkte entsprechend allowlisten.
- `awaiting_client` existiert nur noch für echte Client-Ops.

## 5. Offene Entscheidungen

| # | Frage | Default-Vorschlag |
|---|---|---|
| Q1 | Sollen Downstream-Ops im Remote-Mode `required` sein dürfen? | Ja, wie lokal |
| Q2 | Brechen Downstream-Fehler die Remote-Session oder blockieren sie? | Blockieren (FR-040-Pfad), identisch lokal |
| Q3 | Teilen sich Remote-Sessions eines Keys den ClientManager? | Nein — je Session isoliert (Blast-Radius, Pins) |

## 6. Implementierungshinweise (Nachfolger-Scope)

`composeApplication` für Remote-Sessions (remote-session-manager.ts,
`restore`/`initSession`) erhält zusätzlich eine reguläre
`OperationEngine`-Instanz mit `ClientManager`; der `ClientOpEngine` wird
zum Router (client-seitig vs. downstream). Geschätzt: mittlerer Scope,
keine Schema-Änderungen.
