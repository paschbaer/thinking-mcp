# T046 Golden-Path-Ergebnisse

**Datum:** 2026-09-18 | **Runner:** vitest + InMemoryTransport gegen den echten Server (`tests/fixtures/golden-g1-g3.test.ts`)

## G1 — Verified Capture → Retrieval: PASS (11/11)
Capture→Validate→Finalize→Search→Retrieve komplett; finalize(verified) → LOCALLY_VERIFIED nur mit Evidenz auf beiden Checks.

## G1-Negativ — fehlender Regression-Run: PASS
finalize(verified) → `MISSING_REQUIRED_EVIDENCE`, `details.missing=["checks[1].passed_evidence"]`; Episode-State bleibt VALIDATING.

## G2 — Inkompatible Umgebung: PASS (2/2)
`mismatches: ["node"]`, `recommended_use: "reference_only"`, `semantic_available: false` gemeldet.

## G3 — Known-Bad Attempt: PASS (3/3)
known_bad_attempts sichtbar; harmful Feedback aufgenommen; Episode in der Rangfolge zurückgestuft (SC-009, Rang 3 von 3).

## Zusatzszenarien: PASS (4/4)
Idempotenz (kein Duplikat), STALE_REVISION mit current_revision, Cross-Scope-Isolation (leer, kein Existenz-Leak).

**Gesamt: 21/21 PASS**
