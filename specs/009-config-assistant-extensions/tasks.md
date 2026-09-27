# Tasks: 009-config-assistant-extensions

## P1 — Slot + Validierung

- [x] T1 `instructions.global` in Workflow-Laden + `validateWorkflowInstructions`
  (optional, String ≤ 512, fail-closed) — FR-904/905, AC-7
- [x] T2 `guidanceForPublic`: Global-Präfix vor jeder agent-facing Instruction
  — FR-904
- [x] T3 Contract-Test: alle Phasen enthalten Global-Präfix (AC-2)

## P2 — Katalog & Fresh-Invarianz

- [x] T4 Frage `configSource` (fresh|adopt) + `profile`-Sperre bei Adopt
  (FR-901/908)
- [x] T5 Fresh-Byte-Identität: Golden-File-Test `generateFiles` fresh vs.
  heutiger Output (AC-3)

## P3 — Adopt-Pfad

- [x] T6 Referenz-Validierung: alle Dateien existieren + laden; Profil-Gleichheit
  (FR-902/908, AC-6)
- [x] T7 Adopt-Generator: Kopie workflow/schemas; Regeneration policies
  (buildPolicies, FR-910), responses (ohne Referenz-Shell-Satz, F-4) + operations (buildOperations,
  F-1); guidance.json mit `adoption`-Block (FR-906, AC-4)
- [x] T8 Anpassungsliste: nicht-generische Referenz-Ops erkannt → notes +
  adoption-Block (FR-903)
- [x] T9 Adopt-e2e (AC-1) + Fail-closed-Fälle (AC-6) + AC-5-Negative

## P4 — Docs & Abschluss

- [x] T10 README: Assistenten-Kapitel (configSource, Adopt, globaler Slot) +
  Multi-Workspace-Querverweis (Repo-Onboarding (2)) — FR-901-Doku
- [x] T11 AC-5-Test final + Vollsuite + tsc + build
- [x] T12 Re-Review der überarbeiteten Spec-Fassung (Review-Vermerk) +
  Memory-Bank/Progress

## Ergänzung (Re-Review N-1…N-7)

- [x] T13 Regeneration `downstream-servers.json` (buildDownstream) + `policies.json`
  (buildPolicies, neue Transport-Antwort) im Adopt-Flow — N-1/N-3
- [x] T14 Adopt-Kohärenz: `insight`/`gitnexus`/`gates` aus Referenz abgeleitet,
  Fragen gesperrt; Post-Adopt-Validierung workflow-Ops ⊆ operations — N-2
- [x] T15 Anpassungsliste um Inhaltsvergleich (N-5) erweitert; AC-8/AC-9-Tests
  (Profil-Sperre, Never-Inherit-Negativ-Assertionen)
- Batch 1 (T1+T2+T6) completed 2026-09-27: Katalog configSource, Adopt-Generator (Kopie workflow/schemas, Regeneration downstream/policies/responses/operations/guidance+adoption-Block), instructions.global-Slot + loadConfig-Validierung + guidanceForPublic-Injektion, 7 Contract-Tests.
- Final 2026-09-27: 15/15 implemented. Full suite 341/341 (inkl. 5 pre-existing jetzt grün im Haupt-Checkout), tsc+build clean. Tests: config-assistant-extensions 10/10 (AC-2/AC-7-Matrix, validateAdoptReference, adopt-e2e mit Never-Inherit, Kohärenz-Fail-closed).
