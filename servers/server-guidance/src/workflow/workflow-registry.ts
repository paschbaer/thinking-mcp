/** specs/017 FR-1/FR-3/FR-9: workflow variant registry.
 *
 * Loads workflow definitions from `<configDir>/workflows/<workflowId>.json`,
 * resolved per workspace root (pool-compatible). Per-key `$include` lets a
 * variant inherit shared base phases individually (fail-closed on missing
 * targets and cycles); full-file sparse inheritance is rejected (DQ-2).
 * See workflow-registry.design.md for the full contract.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GuidanceError } from "../types/errors.js";

export interface PhaseBinding {
  commands: string[];
  artifact?: { pattern: string; required: boolean };
}

export interface VariantLimits {
  maxReviewRoundsPerBatch: number;
  maxConvergencePasses: number;
}

export interface LoadedWorkflow {
  workflowId: string;
  definition: {
    workflowId: string;
    initialPhase: string;
    terminalStates: string[];
    phases: Record<
      string,
      {
        response?: string;
        submissionSchema?: string;
        lifecycle?: Partial<
          Record<
            "beforeEnter" | "afterEnter" | "beforeExit" | "afterExit",
            string[]
          >
        >;
        transitions: { to: string; when?: string; reason?: string }[];
      }
    >;
  };
  bindings: Record<string, PhaseBinding>;
  limits: VariantLimits;
}

const WORKFLOW_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface RawPhase {
  $include?: string;
  [key: string]: unknown;
}

interface RawWorkflowFile {
  version?: unknown;
  workflow?: { id?: unknown; initialPhase?: unknown; terminalStates?: unknown };
  phases?: Record<string, RawPhase>;
  bindings?: unknown;
  limits?: unknown;
}

function configurationInvalid(message: string): GuidanceError {
  return new GuidanceError("configuration_invalid", message, {
    recoverable: false,
  });
}

/** Resolves `<file>#<pointer>` include references against a configDir.
 *  References are configDir-relative (the variant file includes the boot
 *  `workflow.json`); a `workflows/`-relative fallback supports include
 *  targets shipped next to the variant file. */
function readJsonAt(configDir: string, file: string): unknown {
  const base = resolve(configDir);
  const primary = resolve(configDir, file);
  const fallback = resolve(configDir, "workflows", file);
  let path: string;
  if (
    !primary.startsWith(base) ||
    (existsSync(fallback) && !fallback.startsWith(base))
  ) {
    throw configurationInvalid(`$include target escapes configDir: ${file}`);
  }
  if (existsSync(primary)) {
    path = primary;
  } else if (existsSync(fallback)) {
    path = fallback;
  } else {
    throw configurationInvalid(`$include target file missing: ${file}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw configurationInvalid(
      `$include target not valid JSON: ${file} (${String(err)})`,
    );
  }
}

function pointerLookup(root: unknown, pointer: string, file: string): unknown {
  if (!pointer.startsWith("/")) {
    throw configurationInvalid(
      `$include pointer must be a JSON pointer (${file}): ${pointer}`,
    );
  }
  let node: unknown = root;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (typeof node !== "object" || node === null || !(key in node)) {
      throw configurationInvalid(`$include target missing: ${file}${pointer}`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Loads and validates a workflow variant file. Throws fail-closed. */
export function loadWorkflowFile(
  configDir: string,
  workflowId: string,
): LoadedWorkflow {
  if (!WORKFLOW_ID_PATTERN.test(workflowId)) {
    throw new GuidanceError(
      "workflow_not_found",
      `invalid workflowId: ${workflowId}`,
      { recoverable: true },
    );
  }
  const path = join(configDir, "workflows", `${workflowId}.json`);
  if (!existsSync(path)) {
    throw new GuidanceError(
      "workflow_not_found",
      `workflow definition not found: ${workflowId} (expected ${path})`,
      { recoverable: true },
    );
  }
  let raw: RawWorkflowFile;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as RawWorkflowFile;
  } catch (err) {
    throw configurationInvalid(
      `workflow file not valid JSON: ${workflowId} (${String(err)})`,
    );
  }
  if (raw.version !== 2) {
    throw configurationInvalid(
      `workflow file ${workflowId}: unsupported version (${String(raw.version)})`,
    );
  }
  if (raw.workflow?.id !== workflowId) {
    throw configurationInvalid(
      `workflow file ${workflowId}: workflow.id must match the file name`,
    );
  }
  if (typeof raw.workflow.initialPhase !== "string") {
    throw configurationInvalid(
      `workflow file ${workflowId}: workflow.initialPhase required`,
    );
  }
  if (!raw.phases || typeof raw.phases !== "object") {
    throw configurationInvalid(
      `workflow file ${workflowId}: phases object required`,
    );
  }

  // Per-key $include resolution with cycle detection (FR-3, DQ-2). The
  // visited set tracks file#pointer edges, so A -> B -> A (and self-include)
  // fail closed with a classified error.
  const visited = new Set<string>();
  const resolvePhase = (
    key: string,
    phase: RawPhase,
  ): Record<string, unknown> => {
    const includeRef = phase.$include;
    let base: Record<string, unknown> = {};
    if (includeRef !== undefined) {
      if (typeof includeRef !== "string") {
        throw configurationInvalid(
          `workflow ${workflowId}, phase ${key}: $include must be a string`,
        );
      }
      const hashIndex = includeRef.indexOf("#");
      const file =
        hashIndex === -1 ? includeRef : includeRef.slice(0, hashIndex);
      const pointer = hashIndex === -1 ? "/" : includeRef.slice(hashIndex + 1);
      const cycleKey = `${file}${pointer}`;
      if (visited.has(cycleKey)) {
        throw configurationInvalid(
          `include_cycle: workflow ${workflowId}, phase ${key} participates in a $include cycle at ${cycleKey}`,
        );
      }
      visited.add(cycleKey);
      const target = pointerLookup(readJsonAt(configDir, file), pointer, file);
      if (
        typeof target !== "object" ||
        target === null ||
        Array.isArray(target)
      ) {
        throw configurationInvalid(
          `$include target is not an object: ${includeRef}`,
        );
      }
      base = target as Record<string, unknown>;
      visited.delete(cycleKey);
    }
    const { $include: _drop, ...local } = phase;
    const merged = { ...base, ...local };
    // An include target that itself carries $include would leave an
    // unresolved reference in the result (A -> B -> A chains surface here):
    // fail closed with the classified cycle error instead of shipping a
    // half-resolved phase (FR-3 fail-closed stance; spec amendment note).
    if ("$include" in merged) {
      throw configurationInvalid(
        `include_cycle: workflow ${workflowId}, phase ${key} resolves to a phase that still carries $include (${String(merged["$include"])})`,
      );
    }
    return merged;
  };

  const phases: LoadedWorkflow["definition"]["phases"] = {};
  for (const [key, phase] of Object.entries(raw.phases)) {
    if (typeof phase !== "object" || phase === null) {
      throw configurationInvalid(
        `workflow file ${workflowId}: phase ${key} must be an object`,
      );
    }
    const merged = resolvePhase(key, phase);
    if (!Array.isArray(merged.transitions)) {
      throw configurationInvalid(
        `workflow file ${workflowId}: phase ${key} needs transitions`,
      );
    }
    phases[key] = merged as LoadedWorkflow["definition"]["phases"][string];
  }

  // Phase-model completeness: initialPhase and every transition target must
  // resolve inside the variant (no implicit base lookup — sparse inheritance
  // is rejected per DQ-2).
  if (!(raw.workflow.initialPhase as string)) {
    throw configurationInvalid(
      `workflow file ${workflowId}: empty initialPhase`,
    );
  }
  if (!phases[raw.workflow.initialPhase as string]) {
    throw configurationInvalid(
      `workflow file ${workflowId}: initialPhase ${String(raw.workflow.initialPhase)} has no phase definition`,
    );
  }
  const terminalStates = Array.isArray(raw.workflow.terminalStates)
    ? (raw.workflow.terminalStates as string[])
    : ["completed", "cancelled"];
  for (const [key, phase] of Object.entries(phases)) {
    for (const t of phase.transitions) {
      if (
        typeof t.to !== "string" ||
        (!phases[t.to] && !terminalStates.includes(t.to))
      ) {
        throw configurationInvalid(
          `workflow file ${workflowId}: phase ${key} transitions to unknown phase ${String(t.to)}`,
        );
      }
    }
  }

  // Bindings (FR-4): commands non-empty; artifact optional but validated.
  const bindings: Record<string, PhaseBinding> = {};
  if (raw.bindings !== undefined) {
    if (typeof raw.bindings !== "object" || raw.bindings === null) {
      throw configurationInvalid(
        `workflow file ${workflowId}: bindings must be an object`,
      );
    }
    for (const [phase, binding] of Object.entries(
      raw.bindings as Record<string, unknown>,
    )) {
      if (!phases[phase]) {
        throw configurationInvalid(
          `workflow file ${workflowId}: binding for unknown phase ${phase}`,
        );
      }
      const b = binding as { commands?: unknown; artifact?: unknown };
      if (
        !Array.isArray(b.commands) ||
        b.commands.length === 0 ||
        !b.commands.every((c) => typeof c === "string" && c.length > 0)
      ) {
        throw configurationInvalid(
          `workflow file ${workflowId}: binding ${phase}.commands must be a non-empty string array`,
        );
      }
      let artifact: PhaseBinding["artifact"];
      if (b.artifact !== undefined) {
        const a = b.artifact as { pattern?: unknown; required?: unknown };
        if (typeof a.pattern !== "string" || a.pattern.length === 0) {
          throw configurationInvalid(
            `workflow file ${workflowId}: binding ${phase}.artifact.pattern must be a non-empty string`,
          );
        }
        if (typeof a.required !== "boolean") {
          throw configurationInvalid(
            `workflow file ${workflowId}: binding ${phase}.artifact.required must be a boolean`,
          );
        }
        artifact = { pattern: a.pattern, required: a.required };
      }
      bindings[phase] = { commands: b.commands as string[], artifact };
    }
  }

  const limitsRaw = (raw.limits ?? {}) as {
    maxReviewRoundsPerBatch?: unknown;
    maxConvergencePasses?: unknown;
  };
  const limits: VariantLimits = {
    maxReviewRoundsPerBatch:
      typeof limitsRaw.maxReviewRoundsPerBatch === "number" &&
      limitsRaw.maxReviewRoundsPerBatch > 0
        ? limitsRaw.maxReviewRoundsPerBatch
        : 5,
    maxConvergencePasses:
      typeof limitsRaw.maxConvergencePasses === "number" &&
      limitsRaw.maxConvergencePasses > 0
        ? limitsRaw.maxConvergencePasses
        : 5,
  };

  return {
    workflowId,
    definition: {
      workflowId,
      initialPhase: raw.workflow.initialPhase as string,
      terminalStates,
      phases,
    },
    bindings,
    limits,
  };
}

/** Cached per (configDir, workflowId) resolution. Fail-closed on every error
 *  path — a broken variant file never degrades to the boot definition. */
export class WorkflowRegistry {
  private cache = new Map<string, LoadedWorkflow>();

  resolve(configDir: string, workflowId: string): LoadedWorkflow {
    const key = `${configDir}::${workflowId}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const loaded = loadWorkflowFile(configDir, workflowId);
    this.cache.set(key, loaded);
    return loaded;
  }
}
