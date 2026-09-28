# Tasks: 013-wisdom-baseline

## P1 — Baselines

- [x] T1 FR-991: Template-`responses.json` auf `buildResponses("")`-Output
  synchronisieren + Drift-Guard-Contract-Test
- [x] T2 FR-992: `responses-wisdom.json` kuratieren (7 Phasen, Platzhalter +
  Bedingungsblöcke, deployment-neutral)

## P2 — Renderer + Adopt-Pfad

- [x] T3 FR-993: `renderAdoptedResponses` + Unit-Tests (URLs je Transport,
  Bedingungsblöcke, unbekannter Token fail-closed)
- [x] T4 FR-994: Adopt-Pfad (builtin → wisdom fail-closed; mounted →
  responses.json-Fallback), Validierung der verwendeten Datei

## P3 — Anti-Drift, e2e, Docs

- [x] T5 FR-995: Anti-Drift-Tests (Phasen-Deckung, ≠ generisch, definierte
  Platzhalter/Server)
- [x] T6 AC-6 e2e (Boot + Self-Containment + keine Rest-Tokens) + README
- [x] T7 Regression: Full-Suite, tsc, build, detect-changes (CLI)
