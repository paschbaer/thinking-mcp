# Tasks: 011-adopt-templates

## P1 — Builtin-Resolver

- [x] T1 `resolveBuiltinReferencePath()`: env `GUIDANCE_BUILTIN_TEMPLATE_DIR`
  → sonst `join(PKG_ROOT, "examples", "default-guidance")`; `validateAdoptReference`
  akzeptiert `"builtin"` und löst auf — FR-971
- [x] T2 Contract-Tests: `"builtin"` fail-closed bei fehlendem Template
  (FR-973); gemounteter Pfad unverändert validiert — FR-973, AC-4

## P2 — Generator-Semantik

- [x] T3 `generateFiles` (adopt): fehlender/leerer `referencePath` → builtin
  (AC-1); explizit `"builtin"` äquivalent (AC-2)
- [x] T4 `adoptionBlock.source: "builtin"` + `resolvedPath`; notes-Text (AC-3,
  FR-974: Set-Regeln identisch zum gemounteten Adopt)
- [x] T5 Regression AC-4: gemountete Referenz unverändert; e2e AC-1
  (Config-Load + Workflow-Boot mit builtin)

## P3 — Docs

- [x] T6 README: builtin = generische Baseline (nicht Thinking-MCP-Referenz),
  env-Override `GUIDANCE_BUILTIN_TEMPLATE_DIR` — FR-972
