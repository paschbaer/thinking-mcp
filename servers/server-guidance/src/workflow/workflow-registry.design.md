# Spec-Kit workflow-registry design (specs/017 FR-1/FR-3/FR-9)

## Resolution contract

- Workflow variant files live at `<configDir>/workflows/<workflowId>.json`, resolved
  PER configDir (per workspace root — pool-compatible, FR-9).
- `workflowId` guards: `^[a-z0-9][a-z0-9-]*$` (no path traversal, no case tricks).
- Missing file => `GuidanceError("workflow_not_found", recoverable: true)` — fail-closed
  at session creation, never a silent fallback to standard-development (F4).
- If `workflowId` equals the boot definition's id, the engine uses the boot definition
  object itself (FR-2 byte-identical default; the registry is not consulted).

## File shape

```json
{
  "version": 2,
  "workflow": { "id": "spec-kit-development", "initialPhase": "understand", "terminalStates": ["completed","cancelled"] },
  "phases": {
    "understand": { "$include": "workflow.json#/phases/understand" },
    "review_and_fix_implementation": {
      "$include": "workflow.json#/phases/review_and_fix_implementation",
      "transitions": [ ...variant-specific... ]
    }
  },
  "bindings": { "understand": { "commands": ["/speckit-specify"], "artifact": { "pattern": "spec.md", "required": true } } },
  "limits": { "maxReviewRoundsPerBatch": 5, "maxConvergencePasses": 5 }
}
```

## $include semantics (FR-3, DQ-2)

- PER-KEY: each phase individually references a shared base phase via
  `"<file>#<json-pointer>"` (file relative to configDir, e.g. `workflow.json#/phases/plan`).
- Resolution: `{ ...includedPhase, ...localKeys }` — explicit local keys win (shallow
  merge). This lets a variant override `transitions` (batch cadence, converge loop)
  while `submissionSchema`/`response`/`lifecycle` stay inherited and drift-proof.
- Full-file sparse inheritance is rejected: a variant file MUST declare every phase of
  its phase model explicitly (inline or via $include). No implicit "copy base and
  patch" mode (silent drift on renamed base phases).
- Fail-closed:
  - missing include target (file or pointer) => `configuration_invalid` (recoverable: false)
  - include cycles (A -> B -> A, including self-include) => `configuration_invalid`
    with `include_cycle` in the message (classified; contract-tested; spec amendment
    note: cycles are implied by FR-3's fail-closed stance but not spelled out in the
    spec — surfaced in the 017 completion report)
  - variant phases missing from the file => `configuration_invalid` (phases must be
    complete: initialPhase and every transition target must resolve)

## Bindings (FR-4)

- `bindings[phase] = { commands: string[] (non-empty), artifact?: { pattern: string
(non-empty, relative to the feature dir; `**` allowed), required: boolean } }`.
- Instruction layer: commands render into phase guidance (engine `guidanceFor`).
- Enforcement layer: when `artifact` is present AND `required` is true, the engine
  blocks the phase exit (`spec_kit_artifact_missing`, recoverable) until the pattern
  matches an existing, non-empty artifact (same discovery as import validation —
  single source of truth via the injected `specKitArtifactCheck` bridge).
- Phases whose spec table exit gate is "as today" carry commands WITHOUT artifact
  (implement/review_and_adjust_plan/verify) — no artifact gate is installed for them.

## Limits

- `limits.maxReviewRoundsPerBatch` (default 5) and `limits.maxConvergencePasses`
  (default 5) bound the FR-6/FR-7 loops; exceeding either escalates via a
  `requiresUserDecision: true` blocker (session status `blocked`).
