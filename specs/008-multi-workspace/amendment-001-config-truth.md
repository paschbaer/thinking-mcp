# Amendment 001 — Config Truth & Composition v2 (specs/014)

**Date:** 2026-09-29
**Status:** Implemented
**Supersedes:** the scaffold-on-first-use copy semantics (T8) and the
repo-config `workspaces[]` emission from the wizard (WA-1).

## Decision (two modes, no layering)

| | Workspace-Mode (`GUIDANCE_REMOTE_MODE=0`) | Remote-Mode (`GUIDANCE_REMOTE_MODE=1`) |
|---|---|---|
| Instance `.guidance/` | **Registry only** (`workspaces[]` in `guidance.json`) | registry in the container; sessions per `init_session` |
| Process config | **repo-level** in each registered root's `.guidance/` | uploaded per session |
| New scopes | manual registry edit, or config assistant (`target: registry-edit`) | `init_session`, or assistant-prompted |

Normative truth: **process-config truth = the registered repo; registry
truth = the serving instance; any other `.guidance/` copy is inert.**

## Changes

1. `loadConfig` accepts registry-only `guidance.json` (no process file
   references) and reports `registryOnly: true` (FR-1101).
2. The silent `cpSync` of the boot config into workspaces without their own
   `.guidance/` is REMOVED (FR-1102): such workspaces fail closed with
   `workspace_process_config_missing` — run the config assistant in the repo.
3. A full config at the instance root keeps working (legacy monolith,
   FR-1103) with a boot warning when additional workspaces are registered;
   boot also warns about dormant (unregistered) `.guidance/` directories
   under the workspace root (FR-1106).
4. The config assistant gained a `target` question (`repo-config` default |
   `registry-edit`): repo-config emits the repo file set WITHOUT any
   `workspaces[]` block (workspace answers are rejected, AC-8);
   registry-edit emits ONLY the registry guidance.json for the served
   instance root (FR-1104/1105). Notes are mode-aware (`init_session` hint
   in remote mode, served-root placement hint in workspace mode).

## Migration

Existing single-repo deployments: unchanged. Legacy monolith deployments
(full config + registered extra workspaces): keep working with a boot
warning — migrate by moving the process config into each repo's own
`.guidance/` and slimming the instance config to the registry.
