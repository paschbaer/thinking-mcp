# Plan: 012-adopt-response-wisdom

**Basis:** spec.md (Re-Scope FR-983/984 auf generischen Spec-Drift-Check,
Entscheidung (a) 2026-09-28)
**Risiko:** MEDIUM — Responses-Adoption ändert die Adopt-Semantik sichtbar;
FR-982 ist ein Breaking Change für gemountete Alt-Referenzen ohne
responses.json (dokumentiert). Fresh-Pfad bleibt byte-identisch (AC-3).

## Architektur-Skizze

```
generateFiles [adopt]
  ├─ validateAdoptReference: requiredFiles += responses.json
  │    + Phasen-Deckung: jede Phase des kopierten workflow.json
  │      muss eine Response in der Referenz haben (FR-982)
  ├─ responsesOverride = Referenz-responses.json
  │    instructions.global ← Ziel-Shell-Antwort (leer ⇒ Slot weg)  (FR-981)
  │    (= identischer Mechanismus wie workflowOverride)
  ├─ embeddedScripts += .guidance/scripts/check-spec-drift.mjs      (FR-984)
  └─ docs-drift-Op (Template operations.json) in workflow.json
       complete.beforeExit VOR final-review-gate                    (FR-983)

check-spec-drift.mjs (neu, dependency-frei):
  specs/*/spec.md → Status != Draft sobald keine offenen Checkboxen;
  Escape-Hatch: Override-Kommentar in der spec.md (Konzept FR-951.4);
  repoRoot als argv[1]; read-only; exit 1 bei Drift.
```

## Phasen

### P1 — Spec-Drift-Skript + Verdrahtung (FR-983/984)
1. `scripts/embedded/check-spec-drift.mjs` (T1) → `embeddedScripts` in
   `generateFiles` (T2) → Template: `docs-drift`-Op + `complete.beforeExit`
   Reihenfolge (T3).

### P2 — Responses-Adoption (FR-981/982)
4. `validateAdoptReference` (+ responses.json, Phasen-Deckung) (T4).
5. `generateFiles` Adopt: `responsesOverride` mit Shell-Slot-Tausch;
   `buildResponses` nur noch im Fresh-Pfad (T4).

### P3 — Hardening + Docs (FR-985)
6. `referencePath`-Trim; Tests: whitespace-env, env-Override-e2e,
   mounted-Golden-Diff (Baseline 011, `adoptionBlock.date` strippen) (T5).
7. README (docs-drift im Default-Profil, Responses-Adoption) (T6).

## Teststrategie

Pro Task Fokus-Suite (`config-assistant-extensions.test.ts` /
`config-assistant.test.ts`), vor Completion Full-Suite + tsc + build +
`detect-changes` via CLI (MCP-Timeouts bekannt). Neue Tests: AC-1/AC-2
(Wisdom-Marker + Shell-Tausch), AC-3 Fresh-Golden, AC-4 Mounted-Golden,
AC-5 docs-drift-Verdrahtung + Script-Eigenschaften, FR-982-Negative
(responses fehlt / Phase fehlt), AC-7-Whitespace-Fälle.
