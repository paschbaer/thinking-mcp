# Review-Findings: Amendment 001-remote-mode (v3) — für Post-Implementation-Review

> Review-Datum: 2026-09-23 · Reviewer: Copilot (Z.AI/Glm 5.3 Flash) ·
> Basis: 001-remote-mode.md v3 (APPROVED, Q1–Q4 geschlossen)
> Status der Implementierung: läuft parallel in separatem Chat (src/main.ts
> composeApplication-Optionen bereits in Arbeit).
> Zweck: Diese Findings MÜSSEN beim Post-Implementation-Review je überprüft
> werden (erledigt = [x] mit Code-Referenz).

## MEDIUM (vor Merge klären bzw. in Spec v3.1 nachschärfen)

- [ ] **M1 — FR-102.4 vs. §8 (Idempotenz vs. Multi-Session):** Gleicher Key +
      gleiche configVersion ⇒ dieselbe Session fortgesetzt; §8 erlaubt
      mehrere Sessions pro Key. Unspezifiziert: bewusste zweite, frische
      Session mit identischem Key+Config. Implementierung muss sich
      entscheiden: (a) Resume nur bei genau einer existierenden Session,
      bei Mehrdeutigkeit Fehler ODER (b) optionaler `previousSessionId`/
      `newSession`-Parameter. Implementierten init_session-Code darauf prüfen.
- [ ] **M2 — FR-101.4 vs. FR-103.1 (Fehlerkanäle 401 vs. session_not_found):**
      Widersprüchliche Kanäle für denselben Fall. Erwartete Implementierung:
      401 NUR wenn Bearer zu keinem Pair passt (vor Session-Lookup);
      session_not_found NUR bei gültigem Token aber fremder/nicht
      existierender Session (Maskierung erhalten, kein Existenz-Oracle).
      Im Code verifizieren (Middleware-Reihenfolge vs. Tool-Handler).

## LOW

- [ ] **L1 — FR-104.3:** Verhalten von `timed_out`/`cancelled` bei
      `required: true` unbestimmt — sollte blockierend wie `failed` sein.
- [ ] **L2 — FR-104.4:** Report MIT neuer requestId für dieselbe
      (operationId, transitionAttempt): annehmen oder verwerfen? Ledger-
      Semantik präzisieren und im Code gleich umsetzen.
- [ ] **L3 — FR-104.1/104.3:** Race zweier paralleler
      report_operation_result-Calls: Transition-Auslösung muss pro Session
      serialisiert sein (Queuing oder letzter-Report-gewinnt — dokumentieren).
- [ ] **L4 — FR-102:** `config` UND `configFiles` gleichzeitig ⇒ MUSS
      `configuration_invalid` sein (aktuell unspezifiziert).
- [ ] **L5 — Redaktion:** §7 start_workflow-Zeile grammatikalisch zerbrochen;
      FR-102.1 Typo „stillerFallback"; Rate-Limit „pro Quell-IP" braucht
      X-Forwarded-For-/Proxy-Regel (sonst Spoofing/Umgehung).
- [ ] **L6 — FR-102.6/FR-103.2:** Restart-Rekonstruktion: In-Memory-
      Komponenten (Engine, PolicyEngine, Audit) müssen aus dem persistierten
      Session-Verzeichnis neu instanziiert werden — AC-R5 braucht diese
      Garantie im Code (nicht nur Volume-Mount).

## Positiv (nicht zu ändern)

- FR-101.7-Mode-Matrix, explizite GUIDANCE_REMOTE_MODE=1-Empfehlung,
  FR-104.5 „Kein Kryptografieschein", dokumentierte Anonymous-Modus-Grenze,
  FR-103.1 Maskierung (kein Existenz-Oracle) — sicherheitsrichtig.
