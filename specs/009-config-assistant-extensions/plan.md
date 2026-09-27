# Plan: 009-config-assistant-extensions

**Basis:** spec.md (Review F-1…F-10 eingearbeitet, 2026-09-27)
**Risiko:** MEDIUM — berührt `loadConfig`-Validierung (FR-905) und den
Assistenten-Generator; Adopt-Flow ist neu und hat die meisten Testpflichten.

## Architektur-Skizze

```
setup_guidance_start/answer (Katalog erweitert)
  ├─ configSource: fresh | adopt                (FR-901)
  ├─ [adopt] referencePath (+ Validierung)      (FR-902)
  ├─ [adopt] profile: gesperrt aus Referenz     (FR-908)
  ├─ shell → workflow.json instructions.global  (FR-904, statt understand-only)
  └─ generateFiles(answers)
       ├─ fresh: heutiger Pfad (byte-identisch, AC-3)
       └─ adopt:
            kopiere   workflow.json, schemas/
            regeneriere policies.json (buildPolicies, neue Transport-Antwort — R-1/FR-910)
            regeneriere responses.json (ohne Referenz-Shell-Satz), operations.json (buildOperations)
            generiere guidance.json (+ adoption-Block, FR-906)
```

Workflow-Engine (unabhängiger Teilstrang):
```
guidanceForPublic: instruction = instructions.global (falls gesetzt) + phase instruction
loadConfig: validateWorkflowInstructions (optional, String ≤512, fail-closed)
```

## Phasen

### P1 — Slot + Validierung (FR-904/905, AC-7)
1. `LoadedConfig`/Workflow-Laden: `instructions.global` optional lesen;
   `validateWorkflowInstructions` (String ≤ 512) fail-closed in `loadConfig`.
2. `guidanceForPublic`: Global-Text vor jede agent-facing Instruction.
3. Contract-Test: Iteration über alle Phasen (globale Präsenz + Präfix).

### P2 — Katalog + Fresh-Invarianz (FR-901 Teil 1, AC-3)
4. Frage `configSource` in den Katalog (vor `profile`); `profile` im
   Adopt-Fall gesperrt (FR-908).
5. Fresh-Pfad refaktorfrei: `generateFiles` verhält sich bei `fresh`
   byte-identisch zum heutigen Output (Test: Golden-File-Vergleich).

### P3 — Adopt-Pfad (FR-901/902/903, AC-1/4/5/6)
6. Referenz-Validierung (FR-902): alle zu übernehmenden Dateien existieren +
   laden; Profil-Gleichheit erzwungen (FR-908).
7. Adopt-Generator: kopiere workflow/schemas; REGENERIERE policies (FR-910),
   responses + guidance.json;
   responses/operations; guidance.json mit `adoption`-Block (FR-906).
8. Shell-Deduplizierung: Referenz-Shell-Satz fließt nicht in kopierte
   Instructions (F-4); neue Antwort nur in `instructions.global`.

### P4 — Tests (AC-1…AC-7)
9. Adopt-e2e: Assistenten-Flow gegen eine Fixture-Referenz → Config-Load +
   Workflow-Boot (AC-1); Fail-closed-Fälle (AC-6).
10. AC-2-Matrix (alle Phasen), AC-4-Provenance, AC-5-Negative,
    AC-7-Slot-Validierung + Rückwärtskompatibilität.

### P5 — Docs + Abschluss
11. README: Assistenten-Kapitel um `configSource`/Adopt + Slot erweitern;
    Multi-Workspace-Sektion verweist auf den Assistenten für (2)-Onboarding.
12. Final-Regression: Vollsuite + tsc + build; Re-Review des Specs (vor
    Implementierungs-Freigabe laut Review-Vermerk).

## Ergänzung nach Re-Review (N-1…N-7, 2026-09-27)

- P3 erweitert: `downstream-servers.json` + `policies.json` werden im
  Adopt-Flow REGENERIERT (`buildDownstream`/`buildPolicies` mit neuen
  Antworten) — nicht kopiert (N-1/N-3).
- `insight`/`gitnexus`/`gates`-Antworten werden im Adopt-Modus
  deterministisch aus der Referenz abgeleitet, Fragen gesperrt (N-2a);
  Post-Adopt-Validierung: workflow-Op-Referenzen ⊆ operations (N-2).
- Anpassungsliste um Inhaltsvergleich erweitert (N-5).
- Tests: AC-8 (Profil-Sperre + invalide Profil-Datei), AC-9 (Negativ-
  Assertionen Never-Inherit), Post-Adopt-Kohärenz (N-2).
