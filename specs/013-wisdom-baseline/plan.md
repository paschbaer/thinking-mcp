# Plan: 013-wisdom-baseline

**Basis:** spec.md (Entscheidung 2026-09-28: zwei Baselines, renderer-basiert)
**Risiko:** MEDIUM — Renderer-Edge-Cases (Rest-Tokens, Bedingungsblöcke) und
Editorial-Qualität der Kuratierung; Fresh-Pfad bleibt unberührt (AC-5 Golden).

## Architektur-Skizze

```
examples/default-guidance/
  responses.json          ← FR-991: neu sync'd auf buildResponses("")-Output
  responses-wisdom.json   ← FR-992: NEU, kuratiert (7 Phasen), Platzhalter +
                             {{#server:NAME}}-Bedingungsblöcke

generateFiles:
  fresh  → buildResponses("")                       (unverändert, AC-5)
  adopt  → validateAdoptReference validiert die verwendete Datei:
             builtin ⇒ responses-wisdom.json (fail-closed)
             mounted ⇒ responses-wisdom.json WENN vorhanden, sonst responses.json
           → renderAdoptedResponses(wisdom, {shell, transport,
              enabledServers, projectName})          (FR-993)
           → instructions.global ← Shell (FR-981-Semantik)

renderAdoptedResponses:
  {{CLEARTHOUGHT_URL}}/{{INSIGHT_URL}}/{{GITNEXUS_URL}} → transportabhängige URLs
  {{PROJECT_NAME}} → projectName
  {{#server:NAME}}…{{/server:NAME}} → nur bei aktivem Server
  unbekannte {{…}}-Reste ⇒ GuidanceError (fail-closed, AC-2/AC-6)
```

## Phasen

### P1 — Baselines
1. T1 FR-991: responses.json sync + Drift-Guard-Test.
2. T2 FR-992: responses-wisdom.json kuratieren (aus `.guidance/responses.json`).

### P2 — Renderer + Adopt-Pfad
3. T3 FR-993: `renderAdoptedResponses` + Unit-Tests (stdio/http-docker,
   insight=false, unbekannter Token fail-closed).
4. T4 FR-994: Adopt-Pfad (builtin → wisdom, mounted → fallback), Validierung
   auf verwendete Datei.

### P3 — Anti-Drift, e2e, Docs
5. T5 FR-995: Anti-Drift-Tests (Phasen-Deckung, ≠ generisch, definierte
   Platzhalter).
6. T6 AC-6 e2e (Boot + Self-Containment + keine Rest-Tokens) + README.
7. T7 Regression: Full-Suite, tsc, build, detect-changes (CLI).

## Teststrategie

Fokus-Suite pro Task; vor Completion Full-Suite + tsc + build +
detect-changes via CLI. Reasoning-Passes weiterhin via Container-HTTP-Proxy
(Chat-Transport instabil — dokumentierte Abweichung).
