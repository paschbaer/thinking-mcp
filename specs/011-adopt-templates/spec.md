# Specification: Adopt-Templates (gebündelte Referenz für Container-Only)

**Feature ID:** `011-adopt-templates`
**Basis:** Container-Only-Befund 2026-09-27 (specs/009 FR-902-Präzisierung): im
Container-Only-Deployment existiert keine proven Reference — Adopt war dort nur
mit explizit gemounteter Referenz möglich. Diese Spec liefert die gebündelte
Alternative.
**Namespace:** FR-971+
**Status:** Implemented (2026-09-27, feature/011-adopt-templates)
**Date:** 2026-09-27

## Overview

`examples/default-guidance/` wird als **benanntes Adopt-Template** etabliert.
Damit funktioniert `configSource: "adopt"` auch im Container-Only-Deployment
ohne gemountete Referenz: `referencePath: "builtin"` (oder Weglassen mit
`configSource: "adopt"` + neuer Antwort `reference: builtin`) nutzt das
gebündelte Template aus der Installation.

## Functional Requirements

- **FR-971 Builtin-Referenz:** `validateAdoptReference` akzeptiert
  `referencePath: "builtin"` und löst ihn auf das ausgelieferte
  `examples/default-guidance/` auf (PKG_ROOT-basiert, deploymentspezifisch).
- **FR-972 Semantik:** Das Builtin-Template ist die generische Baseline
  (Minimalkonfiguration) — nicht die Thinking-MCP-Referenz. README-Doku
  unterscheidet beide explizit.
- **FR-973 Fail-closed bleibt:** Existiert das Template in der Installation
  nicht (untypische Deployment-Form), fail-closed mit klarer Meldung.
- **FR-974 Set-Regeln:** Identisch zum gemounteten Adopt (Kopie workflow/
  schemas; Regeneration downstream/policies/responses/operations; guidance
  mit adoption-Block `source: "builtin"`); repo-spezifische Werte weiterhin
  nur aus Antworten.

## Acceptance Criteria

- **AC-1** `configSource: "adopt"` ohne `referencePath` nutzt `builtin`
  erfolgreich im Container-Only-Layout (Config-Load + Workflow-Boot).
- **AC-2** `referencePath: "builtin"` explizit äquivalent zu AC-1.
- **AC-3** Adoption-Block dokumentiert `source: "builtin"` (Audit-Konsistenz).
- **AC-4** Bestandsverhalten (gemountete Referenz) unverändert.

## Out of Scope

- Sprachspezifische Templates (spec 009 FR-907)
- Thinking-MCP-Referenz als gebündeltes Template (bleibt self-hosting-spezifisch)
