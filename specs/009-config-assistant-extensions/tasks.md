# Tasks: 009-config-assistant-extensions

## P1 — Slot + Validierung

- [ ] T1 `instructions.global` in Workflow-Laden + `validateWorkflowInstructions`
  (optional, String ≤ 512, fail-closed) — FR-904/905, AC-7
- [ ] T2 `guidanceForPublic`: Global-Präfix vor jeder agent-facing Instruction
  — FR-904
- [ ] T3 Contract-Test: alle Phasen enthalten Global-Präfix (AC-2)

## P2 — Katalog & Fresh-Invarianz

- [ ] T4 Frage `configSource` (fresh|adopt) + `profile`-Sperre bei Adopt
  (FR-901/908)
- [ ] T5 Fresh-Byte-Identität: Golden-File-Test `generateFiles` fresh vs.
  heutiger Output (AC-3)

## P3 — Adopt-Pfad

- [ ] T6 Referenz-Validierung: alle Dateien existieren + laden; Profil-Gleichheit
  (FR-902/908, AC-6)
- [ ] T7 Adopt-Generator: Kopie workflow/schemas; Regeneration policies
  (buildPolicies, FR-910), responses (ohne Referenz-Shell-Satz, F-4) + operations (buildOperations,
  F-1); guidance.json mit `adoption`-Block (FR-906, AC-4)
- [ ] T8 Anpassungsliste: nicht-generische Referenz-Ops erkannt → notes +
  adoption-Block (FR-903)
- [ ] T9 Adopt-e2e (AC-1) + Fail-closed-Fälle (AC-6) + AC-5-Negative

## P4 — Docs & Abschluss

- [ ] T10 README: Assistenten-Kapitel (configSource, Adopt, globaler Slot) +
  Multi-Workspace-Querverweis (Repo-Onboarding (2)) — FR-901-Doku
- [ ] T11 AC-5-Test final + Vollsuite + tsc + build
- [ ] T12 Re-Review der überarbeiteten Spec-Fassung (Review-Vermerk) +
  Memory-Bank/Progress

## Ergänzung (Re-Review N-1…N-7)

- [ ] T13 Regeneration `downstream-servers.json` (buildDownstream) + `policies.json`
  (buildPolicies, neue Transport-Antwort) im Adopt-Flow — N-1/N-3
- [ ] T14 Adopt-Kohärenz: `insight`/`gitnexus`/`gates` aus Referenz abgeleitet,
  Fragen gesperrt; Post-Adopt-Validierung workflow-Ops ⊆ operations — N-2
- [ ] T15 Anpassungsliste um Inhaltsvergleich (N-5) erweitert; AC-8/AC-9-Tests
  (Profil-Sperre, Never-Inherit-Negativ-Assertionen)
