# Tasks: Registry Hot-Reload & Dependency Bootstrap (specs/015)

**Status:** Draft (SDD 2026-09-30 — Umsetzung ausstehend)
**Vorbedingung:** R1 (US1-Design-Entscheidung) und R2 (Session-Semantik-Matrix)
aus plan.md sind vor Phase 3 zu schließen.

## Phase 1 — Setup

- [x] T001 Feature-Branch + Spec-Review: spec.md/plan.md gegen aktuelle
      Codebasis abgleichen (Zeilen-/Symbol-Referenzen können driftete sein);
      R1/R2-Entscheidungen mit Nutzer protokollieren
- [x] T002 FR-1201…-Nummern final vergeben und in spec.md einsetzen

## Phase 2 — US1: Registry-Hot-Reload (FR-1201…1210, je nach Alternative)

- [ ] T003 [US1] Contract-Tests FIRST: Registry-Validation-Reuse (invalid →
      kein Swap, alter Stand aktiv), Audit-Event alt→neu + Hash,
      configurationVersion-Semantik je R2-Matrix
- [ ] T004 [US1] Implementierung je R1-Entscheidung:
      (B) `registry-register`-Tool via `WorkspaceRegistry.build` + atomarer
      Registry-Persist + Audit — oder
      (A) config-watch/mtime-Poll + atomarer Swap + Session-Semantik
- [ ] T005 [US1] Config-Flag (Default aus) + Doku (README Multi-Workspace)
- [ ] T006 [US1] Integration: Onboarding ohne Restart (Pool-Szenario),
      invalid-Edit-Negativfall, AC-5-Meldungstexte

## Phase 3 — US2: Dependency-Bootstrap (FR-1211…)

- [ ] T007 [US2] Contract-Tests FIRST: `deps-install` (npm ci, Lockfile-
      Fallback mit Audit-Vermerk), `deps-reinstall` (Clean + Reinstall),
      Root-Scoping (Path-Traversal-Negativfall), riskClass workspace_write
- [ ] T008 [US2] Operationen im Katalog (Config-Assistant-Templates +
      Repo-`.guidance`-Beispiele), exposure-gefilterter Output
- [ ] T009 [US2] Erkennungs-Anschluss: `warnNodeDeps`-Meldungen + Gate-
      Fehlerpfad (`Cannot find module`, `ERR_DLOPEN_FAILED`) verweisen auf
      die Operationen; optionale proaktive Sonde (Config-Flag, Default aus)
- [ ] T010 [US2] Integration: Gate-Heilung im Pool (flacher Node-Workspace →
      deps-install → Gates grün, native Addons laden im Container)

## Phase 4 — Polish & Verifikation

- [ ] T011 [P] README: Multi-Workspace (US1-Feature) + Operations-Katalog
      (deps-Operationen) aktualisieren
- [ ] T012 Vollauf `npm test` + `npm run typecheck` + `prettier` +
      `gitnexus analyze --no-stats` + `detect_changes()`
- [ ] T013 quickstart-/Pool-Szenarien laut plan.md-Test-Strategie durchlaufen
- [ ] T014 memory-bank (progress/activeContext/lessonsLearned) + specs/015
      Status auf Implemented; unabhängiger Review + Completion-Gates

## Dependencies

- T003/T004 hängen an R1/R2 (Phase 1). T008/T009 hängen an T007.
- Phase 2 und Phase 3 sind unabhängig voneinander ([P]-kombinierbar auf
  getrennten Branches).
