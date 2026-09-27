# Plan: 011-adopt-templates

**Basis:** spec.md (Draft 2026-09-27); 009-Adopt-Infrastruktur (15/15 implemented)
**Risiko:** LOW — ändert nur den Adopt-Einstieg in `ConfigAssistant.ts`
(`validateAdoptReference`, `generateFiles`); Fresh-Pfad und gemountete
Adopt-Referenz bleiben byte-identisch (AC-4).

## Architektur-Skizze

```
generateFiles(answers) [adopt]
  ├─ referencePath fehlt/leer  → resolveBuiltinReferencePath()   (AC-1)
  ├─ referencePath "builtin"   → resolveBuiltinReferencePath()   (AC-2)
  ├─ sonst                     → unverändert (gemountete Referenz, AC-4)
  │
  └─ resolveBuiltinReferencePath():
       env GUIDANCE_BUILTIN_TEMPLATE_DIR (konfigurierbar, Nutzerwunsch 2026-09-27)
       sonst join(PKG_ROOT, "examples", "default-guidance")   (FR-971)

validateAdoptReference("builtin")
  → löst via resolveBuiltinReferencePath() auf, Validierung fail-closed
    (FR-973: fehlt das Template in der Installation → configuration_invalid,
    bestehende Meldung "adopt source: missing/unreadable file …")

adoptionBlock (AC-3, FR-974):
  source: "builtin" (statt des Pfads) + resolvedPath (Audit),
  Set-Regeln identisch zu gemountetem Adopt (009-Generator unverändert)
```

## Phasen

### P1 — Builtin-Resolver (FR-971/973)
1. `resolveBuiltinReferencePath()` (env-Override, PKG_ROOT-Default) in
   `ConfigAssistant.ts`; `validateAdoptReference` akzeptiert `"builtin"`.
2. Contract-Tests: `"builtin"` wird validiert (fail-closed bei fehlender
   Datei, FR-973); gemounteter Pfad unverändert.

### P2 — Generator-Semantik (FR-972/974, AC-1–AC-4)
3. `generateFiles`: `configSource: "adopt"` ohne `referencePath` → builtin
   (AC-1); explizit `"builtin"` äquivalent (AC-2).
4. `adoptionBlock.source: "builtin"` + `resolvedPath` (AC-3); notes-Text
   nennt builtin.
5. Regression: gemountete Referenz byte-identisch zum 009-Verhalten (AC-4);
   AC-1-End-to-End (Config-Load + Workflow-Boot im Container-Only-Layout).

### P3 — Docs (FR-972)
6. README (Configuration assistant): Builtin-Template = generische Baseline
   (Minimalkonfiguration), nicht die Thinking-MCP-Referenz; env-Override
   dokumentiert.
