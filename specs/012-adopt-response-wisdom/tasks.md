# Tasks: 012-adopt-response-wisdom

## P1 — Spec-Drift-Skript + Verdrahtung

- [x] T1 `scripts/embedded/check-spec-drift.mjs`: dependency-freier generischer
  Spec-Status-Drift-Check (Status vs. Checkboxen, FR-951.4-Override) — FR-984
- [x] T2 `generateFiles`: `check-spec-drift.mjs` in `embeddedScripts` — FR-984
- [x] T3 Template: `docs-drift`-Op (operations.json) + `complete.beforeExit`
  Reihenfolge docs-drift → final-review-gate → store-completion-insight
  (workflow.json) — FR-983

## P2 — Responses-Adoption

- [x] T4 `validateAdoptReference`: `requiredFiles` += responses.json,
  Phasen-Deckung gegen kopiertes workflow.json (fail-closed) — FR-982
- [x] T5 `generateFiles` Adopt: `responsesOverride` (Kopie + Shell-Slot-Tausch),
  `buildResponses` nur noch Fresh — FR-981

## P3 — Hardening + Docs

- [x] T6 `referencePath`-Trim + Tests: whitespace-env, env-Override-e2e,
  mounted-Golden-Diff — FR-985
- [x] T7 README: docs-drift im Default-Profil + Responses-Adoption dokumentieren
- [x] T8 Regression: Full-Suite, tsc, build, detect-changes (CLI), e2e AC-6
