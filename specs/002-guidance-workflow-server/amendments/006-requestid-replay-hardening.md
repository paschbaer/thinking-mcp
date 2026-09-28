# Spec Amendment 006: RID-1 — requestId-Replay-Hardening

> Status: **IMPLEMENTED** (feature/rid1-requestid-replay-hardening)
> Base: spec 002 v1+v2+v2.1 + amendments 001–005
> FR-Nummern: FR-614…616 (Fortsetzung der Kreise FR-601+/FR-611+)
> Date: 2026-09-28

## 1. Problem

`submitLocked`/`completeWorkflowLocked` gaben bei bereits registrierter
requestId das gecachte `SubmitResult` still und unmarkiert zurück
(reiner Idempotency-Replay). Konsequenz (live beobachtet, Niyama-
Session 46a43aeb): ein Agent, der dieselbe requestId wiederverwendet,
erhielt beliebig oft `accepted: true` OHNE Phase-Advance — der
Replay ist von einer erfolgreichen Erst-Submission nicht
unterscheidbar, der Agent stolpert in eine Retry-Schleife.

## 2. Entwurf

- **FR-614 (Replay-Marker):** Replays liefern das gecachte Ergebnis
  als flache Kopie mit den additiven Feldern `replayed: true`,
  `duplicateOf: <requestId>` und einem `warning` (Hinweis auf frische
  requestId pro Phase-Submission). Das gecachte Original wird nie
  mutiert (die Amendment-002-Successor-Race-Logik replays bewusst).
- **FR-615 (Payload-Hash + Policy):** Bei der Erst-Submission wird ein
  SHA-256-Fingerprint des Payloads (sortiertes JSON, deterministisch)
  je requestId gespeichert. Policy `policies.submission.requestIdReuse`:
  - `"warn"` (Default): Replay mit abweichendem Payload wird
    durchgelassen, aber mit `payloadMismatch: true` markiert.
  - `"reject-mismatch"`: abweichender Payload →
    `GuidanceError("requestId_reuse_payload_mismatch")` (recoverable).
  Gleich-Payload-Retries bleiben in beiden Modi legal (bewusste
  Idempotency-Retries). Validierung fail-closed (unbekannter Wert ⇒
  `configuration_invalid`).
- **FR-616 (Observability):** `get_metrics` zählt Replays unter
  `requestIdReplays: { total, payloadMismatches }` (in-memory, Reset
  beim Neustart — konsistent mit `containerRouteFallbacks`).

## 3. Umsetzung

- `src/workflow/WorkflowEngine.ts`: `replaySubmitResult` (Marker +
  Hash-Vergleich + Metric), `requestIdReuseMode`, Hash-Store in
  `submitLocked` (Result-Registration) und `completeWorkflowLocked`
  (First-Seen), `stablePayloadHash` (rekursiver Key-Sort), Felder auf
  `SubmitResult`.
- `src/types/index.ts` (`requestPayloadHashes`),
  `src/types/errors.ts` (`requestId_reuse_payload_mismatch`),
  `src/config.ts` (`validatePolicies`),
  `src/metrics/MetricsRepository.ts`, Template `policies.json`
  (`submission.requestIdReuse: "warn"`), README Tool-Reference.
- Tests: `tests/contract/requestid-replay.test.ts` (8 Fälle: warn-
  Marker, Nicht-Mutation, Mismatch-Flag, reject-mismatch + Same-
  Payload-Durchlass, frische-requestId-Advance, Phase-Lock-vor-Replay-
  Reihenfolge, Metrik, Policies-Schema), Error-Code-Snapshot ergänzt.
  Vollregression + `tsc --noEmit` grün.

## 4. Bekannte Grenzen

- `requestPayloadHashes` fehlt für Sessions, die vor RID-1 erstellt
  wurden — deren Replays werden ohne `payloadMismatch`-Bewertung
  durchgelassen (Marker trotzdem gesetzt).
- Reject-mismatch kann einen Payload-Nicht-Mismatch nicht beweisen,
  wenn kein Hash vorliegt (siehe oben) — bewusst konservativ.
- Complete-Workflow-Replays nutzen denselben Helper; der Pfad ist
  über die Amendment-002-Successor-Race-Tests abgesichert (ein
  dedizierter Engine-Level-Completion-Replay-Test ist im Harness
  nicht erreichbar, da `repository-analysis` `required:true` ist).
