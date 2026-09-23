# Spec Amendment: Remote Mode (Central Container) — v3

> Status: **APPROVED** (open questions Q1–Q4 decided, see §10)
> Base: `specs/002-guidance-workflow-server/spec.md` (v1 + v2 + v2.1)
> Date: 2026-09-23
> Decisions locked by user: (1a) client-executed process operations ·
> Auth: optional `Key`/`Token` pairs (array). **No pairs configured =
> anonymous access (as today)** — a single global bearer token remains
> supported · `Key` supplied at `init_session` when pairs are configured

## 1. Motivation

Der aktuelle HTTP-Modus bindet einen Container an **genau einen** Workspace
(`GUIDANCE_WORKSPACE_ROOT` + Boot-Zeit-Komposition). Für den Betrieb **eines**
zentralen Containers für **beliebig viele Repos** ist das ungeeignet:
N Repos ⇒ N Container ist keine akzeptable Betriebsform.

Der Remote-Modus dreht das Modell um: Der Container startet **ohne jegliche
Konfiguration**. Jedes Repo überträgt seine lokale Konfiguration per
`init_session` an den Server. Alle Operationen sind strikt an die dadurch
entstehende Session gebunden — Repo B kann Repo A strukturell nicht erreichen
(Isolation durch Session-Kapplung, nicht durch Pfadvalidierung).

## 2. Operational Modes

| Mode | Transport | Config-Quelle | Process-Operationen | Scope |
|---|---|---|---|---|
| `local` (bisher) | stdio oder HTTP | `.guidance/` im Server-Workspace | serverseitig ausgeführt | ein Workspace pro Server |
| `remote` (NEU) | HTTP | Config-Upload via `init_session` | **clientseitig ausgeführt**, Ergebnisse reported (1a) | ein Server für N Repos |

- `local` bleibt unverändert (Rückwärtskompatibilität; stdio/HTTP wie heute).
- Moduswahl: HTTP-Server läuft im `remote`-Modus, wenn mindestens ein
  Key/Token-Paar konfiguriert ist (`GUIDANCE_KEY_TOKENS`, s. u.). Ohne Pairs
  verhält sich der Server wie bisher (local, optional `GUIDANCE_AUTH_TOKEN`).
- **FR-100 (Mode Resolution):** Der Server läuft im Remote-Modus, wenn
  `GUIDANCE_WORKSPACE_ROOT` **nicht** auf ein Verzeichnis mit vorhandener
  `.guidance/guidance.json` zeigt ODER Pairs konfiguriert sind (X-Header /
  explicit env `GUIDANCE_REMOTE_MODE=1` erzwingt Remote; siehe FR-101.6).
  Im Remote-Modus MÜSSEN alle Workspace-Boot-Zeit-Annahmen deaktiviert sein:
  kein Scaffold, kein `composeApplication` bei Start, keine
  `GUIDANCE_WORKSPACE_ROOT`-Abhängigkeit. `start_workflow` ohne vorheriges
  `init_session` MUSS mit `configuration_not_found` (recoverable) abgelehnt
  werden. Implizite Modus-Autoerkennung ist FEHLERANFÄLLIG — empfohlen wird
  das explizite `GUIDANCE_REMOTE_MODE=1`.

## 3. Server-Konfiguration: Key/Token-Pairs (optional)

**FR-101 (Pair Definition):** Der Server KANN bei Start ein Array von
`{key, token}`-Paaren laden (OPTIONAL — siehe Fallback FR-101.6).
Konfiguration über Env-Variable:

```bash
GUIDANCE_KEY_TOKENS='[
  {"key": "repo-alpha",  "token": "openssl-rand-hex-32-…"},
  {"key": "repo-beta",   "token": "…"}
]'
```

oder alternativ per Datei `GUIDANCE_KEY_TOKENS_FILE=/run/secrets/guidance-pairs.json`
(gleiches Schema). Regeln:

- **FR-101.1** `key`: 1–64 Zeichen, `[A-Za-z0-9._-]`, eindeutig im Array.
  Der Key ist ein **Identifikator** (kein Secret) und darf in Logs erscheinen.
- **FR-101.2** `token`: MUSS hohen Entropie-Anforderungen genügen (≥ 32 Zeichen
  empfohlen, `openssl rand -hex 32`); der Server MUSS Token **nie im Klartext
  loggen** und MUSS sie im Speicher/in State-Dateien nur als SHA-256-Hash
  persistieren.
- **FR-101.3** Token-Vergleich MUSS timing-safe erfolgen (SHA-256-Digest +
  `timingSafeEqual`).
- **FR-101.4** Bei konfigurierten Pairs ist **jeder** `/mcp`-Request ohne
  gültiges `Authorization: Bearer <token>` mit `401` abzulehnen
  (`GUIDANCE_AUTH_TOKEN` ist im Remote-Modus obsolet; Pairs ersetzen es).
- **FR-101.5** Der selbe Token DARF von mehreren Clients gleichzeitig genutzt
  werden (Team-Betrieb eines Repos); er berechtigt ausschließlich für
  Sessions, die mit dem **zugehörigen Key** erstellt wurden
  (Token-per-Session-Bindung, FR-103).
- **FR-101.6 (Anonymous Fallback — DECIDED):** Sind **keine** Pairs
  konfiguriert, gilt der bisherige anonymous/globale-Auth-Modus:
  (a) Ohne `GUIDANCE_AUTH_TOKEN` ist `/mcp` offen (wie bisher);
  (b) mit `GUIDANCE_AUTH_TOKEN` gilt der globale Bearer für ALLE Sessions.
  `init_session` MUSS dann OHNE `key` aufgerufen werden (key darf nicht
  übergeben werden — sonst `configuration_invalid`); Sessions werden an
  den **globalen Kontext** gebunden. Isolation zwischen Sessions bleibt
  via `sessionId` (Kapplung) bestehen; Cross-Repo-Schutz über Tokens
  existiert in diesem Modus NICHT (dokumentierte Grenze).
- **FR-101.7 (Mode-Matrix):**

  | Pairs konfiguriert | `GUIDANCE_AUTH_TOKEN` | Effektives Verhalten |
  |---|---|---|
  | ja | ignoriert | Pair-Auth; `init_session` MUSS key+matchenden Token liefern |
  | nein | ja | Global-Bearer-Auth; `init_session` OHNE key |
  | nein | nein | Anonymous; `init_session` OHNE key |
  | ja UND kein Volume/State | — | Remote-Mode erfordert Volume für FR-106 (Session-Persistenz) |

## 4. `init_session` — Config-Upload und Session-Erzeugung

**FR-102 (init_session):** Neues Tool:

```
init_session {
  key?: string,             // NUR wenn Pairs konfiguriert (FR-101.7); sonst verboten
  config: { … },            // vollständige .guidance-Konfiguration ALS PAYLOAD
  configFiles?: {           // alternative Form: Dateiinhalte statt Inline-Objekt
    "guidance.json": string, "workflow.json": string, …, "schemas/understand.schema.json": string
  },
  requestId?: string
} → { sessionId, configVersion, workflow: { id, phases[] }, warnings[] }
```

- **FR-102.1** Authentifizierung: MIT Pairs MUSS `Authorization: Bearer
  <token>` zum übermittelten `key` passen (Pair-Lookup); sonst
  `401`/`unauthorized`. OHNE Pairs (anonymer Fallback) MUSS `key`
  **nicht** übergeben werden; ein trotzdem übergebener `key` ist ein
  Fehler (`configuration_invalid`) — keine stillerFallback-Mischformen.
- **FR-102.2** Die Konfiguration wird **in-memory** mit denselben Regeln wie
  `loadConfig` validiert (Schema-Prüfung, Referenz-Auflösung, Cross-File-
  Konsistenz). Ungültige Config ⇒ `configuration_invalid` mit präziser
  Fehlerstelle; **keine** Teilspeicherung.
- **FR-102.3** Bei Erfolg: deterministische `configVersion` (SHA-256 über die
  kanonische Config, wie im Local-Modus); Session wird erzeugt und an
  `(key, configVersion)` gebunden; der gesamte Session-State wird unter
  `state/sessions/<sessionId>/` **physisch isoliert** persistiert (Volume).
- **FR-102.4** Idempotenz: erneutes `init_session` mit identischer Config
  (gleicher `configVersion`) + gleichem Key ⇒ dieselbe Session wird
  fortgesetzt (keine Duplikate). Geänderte Config ⇒ neue `configVersion` ⇒
  neue Session (bestehende Sessions bleiben unberührt; Migration ist
  explizit, nicht implizit).
- **FR-102.5** `workspaceRoot` ist im Remote-Modus **kein** Parameter und wird
  serverseitig ignoriert (Prozesse laufen beim Client, s. FR-103).
- **FR-102.6** Der Server MUSS die Konfiguration der Session persistent
  speichern, sodass Sessions Container-Restarts überleben (Volume; siehe
  FR-106).
- **FR-102.7** Inline-Schemas: `submissionSchema`-Pfade werden gegen die im
  Upload mitgelieferten `configFiles` aufgelöst (Remote-Modus kennt kein
  Server-Dateisystem des Clients).

**FR-102.8 (Limits — DECIDED):** `init_session` MUSS Größenlimits erzwingen:
Konfig-Payload ≤ 1 MB (Default), max. 10 aktive Sessions pro Key (Default,
konfigurierbar), Session-TTL **30 Tage Inaktivität** (DECIDED Q2, Default,
konfigurierbar via `GUIDANCE_SESSION_TTL_DAYS`); abgelaufene Sessions werden
beim nächsten Zugriff mit `session_not_found` abgelehnt und lazily entfernt.

## 5. Session-Binding und Repo-Isolation

**FR-103 (Strict Session Binding):**

- **FR-103.1** Jeder Werkzeugaufruf mit `sessionId` MUSS prüfen: Session
  existiert UND die Auth passt — MIT Pairs: Bearer-Token muss zum Key der
  Session passen; OHNE Pairs: globaler Bearer (falls konfiguriert) muss
  gültig sein, sonst keine zusätzliche Bindung (anonymer Modus, wie
  heute). Bei Nichtbestehen: `session_not_found` (nicht unterscheidbar
  von „keine Berechtigung" — keine Existenz-Oracle-Leaks).
- **FR-103.2** Komponenten-Instanziierung (Engine, PolicyEngine, Operation-
  Verfolgung, Audit) erfolgt **pro Session**;Instanzen teilen KEINEN Zustand
  über Sessions hinweg (Muster: `SpecKitEngineResolver`).
- **FR-103.3** Session-State liegt unter `state/sessions/<sessionId>/`
  (Konfig-Kopie, Workflow-State, Audit, Downstream-Op-Zustände). Zwei
  Sessions können sich gegenseitig nicht lesen oder beeinflussen; ein
  Cross-Session-Zugriff ist strukturell ausgeschlossen (kein API-Pfad, keine
  Pfad-Überschneidung).
- **FR-103.4** Der Audit-Trail jeder Session MUSS den Key (Identifikator,
  **Klartext** — DECIDED Q3; der Key ist kein Secret, nur der Token ist es)
  und die `configVersion` enthalten.

## 6. Client-executed Process Operations (1a)

**FR-104 (Client-Reported Gates):** Im Remote-Modus entfällt die
serverseitige Ausführung von `type: "process"`. Stattdessen:

- **FR-104.1** Bei einem Submit, der eine Transition mit Lifecycle-Gates
  (`beforeExit`/`beforeEnter`) auslöst, MUSS die Server-Antwort anstelle der
  Transition **`pending_operations`** liefern:

```json
{
  "accepted": false,
  "code": "client_operations_pending",
  "currentPhase": "verify",
  "pendingOperations": [
    { "operationId": "lint", "required": false, "instruction": "npm run lint" },
    { "operationId": "test", "required": true,  "instruction": "npm test" }
  ]
}
```

- **FR-104.2** Neues Tool `report_operation_result`:

```
report_operation_result {
  sessionId, operationId, requestId?,
  status: "succeeded" | "failed" | "timed_out" | "cancelled",
  exitCode?: number,
  summary: string,          // wird Redaction + returnToAgent-Policy unterworfen
  logs?: string             // optional, maxExcerptBytes-Limit
} → { recorded: true, pendingOperations: […] }   // Transition automatisch,
                                                 // wenn alle required succeeded
```

- **FR-104.3** Die Transition wird **automatisch** vollzogen, sobald alle
  `required: true`-Operationen `succeeded`-Reports haben (kein zweiter
  Submit nötig); fehlgeschlagene Required-Ops blockieren wie im Local-Modus
  (`required_hook_failed`-Semantik, Session bleibt in der Phase). Optionale
  Ops: Failure = Warnung in `operations`.
- **FR-104.4** Reports sind über `requestId` idempotent; mehrfache Reports
  für dieselbe `(operationId, transitionAttempt)` ohne neue `requestId`
  werden verworfen (Ledger-Prinzip wie Submissions).
- **FR-104.5** Integrität (Fault-Tree-Risiko „falsche Reports"): Der Server
  KANN die Ehrlichkeit des Clients nicht kryptografisch prüfen. Spezifikation
  MUSS daher: (a) Reports werden unverändert auditiert (userId/key,
  timestamp, payload-hash), (b) `validation.exitCodeMustBeZero`-Prüfung
  erfolgt serverseitig auf den gemeldeten Werten, (c) die Doku MUSS klar
 stellen, dass Client-Reports im Remote-Modus ein **Vertrauensanker** sind —
  Integritätsgarantien auf Prozess-Ebene gibt es nur im Local-Modus.
- **FR-104.6** MCP-Downstream-Operationen (`server`/`capability`) bleiben
  **serverseitig** ausgeführt (der Container verbindet selbst) — hiervon
  nicht betroffen.

## 7. Änderungen an bestehenden Anforderungen

| FR | Änderung |
|---|---|
| FR-013 (process ops) | Gültigkeit auf Local-Mode eingeschränkt; Remote: FR-104 |
| FR-027 (loopback-only) | Im Remote-Modus MUSS 0.0.0.0-Bindung mit Pair-Auth zulässig sein; ohne Pairs bleibt Fail-closed-Loopback bestehen |
| FR-044 (downstream state) | Gilt unverändert, Zustand aber unter `state/sessions/<id>/` |
| FR-052 (atomic persist) | Gilt unverändert für Session-Verzeichnisse |
| `start_workflow` | Neuer Pflicht-Parameter entfällt stattdessen: verweist auf die Session-Konfiguration (kein `workspaceRoot` im Remote-Modus) |
| `mcp-server-guidance-init` | Bleibt (Local-Mode); Remote-Repos nutzen `init_session` |

## 8. Security Considerations

- **Key-Reuse (nur mit Pairs):** Ein Key DARF mehrere Sessions haben
  (z. B. mehrere Parallel-Features im selben Repo). Isolation bleibt
  gewahrt (FR-103.3); empfohlen: ein Key pro Repo, nicht pro Team.
  Im anonymen Modus (ohne Pairs) gilt: Cross-Repo-Schutz über Tokens
  existiert nicht — geeignet für Single-Operator-Setups.
- **Kein Existenz-Oracle:** `session_not_found` für fremde und nicht
  existierende Sessions identisch.
- **Rotation:** Pair-Rotation = neues Pair hinzufügen, altes entfernen,
  Container-Neustart; bestehende Sessions des alten Keys werden dabei
  unbrauchbar (dokumentiertes Verhalten) — Alternative „Session-Weitergeltung"
  bewusst NICHT spezifiziert (Verweigerung ist sicherer).
- **Rate Limiting:** `init_session` MUSS rate-limited sein (**20 Requests/min
  pro Quell-IP** — DECIDED Q4; 429 bei Überschreitung) gegen Config-Upload-Flutung.
- **Kein Kryptografieschein:** FR-104.5 — Client-Reports sind Vertrauens-
 anker; die Spec verspricht keine Integrität, die nicht geliefert wird.

## 9. Acceptance Criteria (Auszug)

- AC-R1: Container startet mit `GUIDANCE_KEY_TOKENS=[…]` ohne jegliche
  `.guidance/` auf Serverseite; `tools/list` funktioniert; `start_workflow`
  ohne `init_session` ⇒ `configuration_not_found`.
- AC-R2: `init_session` mit gültigem (key, token) + vollständiger Config ⇒
  `sessionId` + `configVersion`; Workflow-Zyklus understand→…→complete ist
  über die Session durchführbar.
- AC-R3: MIT Pairs: Session A (key-a) kann mit Token-b nicht bedient
  werden (`session_not_found`). OHNE Pairs: Session bedienbar mit
  globalem Bearer bzw. anonym (wie bisher) — dokumentierte Grenze.
- AC-R4: `verify`-Phase mit `beforeExit: [test]` liefert
  `client_operations_pending`; erst `report_operation_result { status:
  "succeeded" }` vollzieht die Transition. Failed ⇒ verbleib in Phase.
- AC-R5: Container-Restart: Session mit allen Zuständen weiterhin bedienbar.
- AC-R6: Invalid-Config-Upload ⇒ `configuration_invalid`, keine
  Teilspeicherung, kein Session-Eintrag.
- AC-R7: Fehlender/falscher Bearer-Token auf JEDEM Tool ⇒ 401.

## 10. Entscheidungen (DECIDED 2026-09-23)

- **Q1 (Key:Repo):** Key pro Repo empfohlen (1 Key : N Sessions zulässig);
  anonymous Fallback ohne Pairs (FR-101.6, user decision).
- **Q2 (TTL):** 30 Tage Inaktivität (FR-102.8).
- **Q3 (Audit):** Key im Klartext (FR-103.4).
- **Q4 (Rate Limit):** 20 Requests/min pro Quell-IP (Security Considerations).

Alle offenen Punkte sind damit geschlossen — Implementierung freigegeben.
