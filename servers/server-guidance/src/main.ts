/**
 * Composition root (Review Finding 1): verdrahtet config → engine → tools.
 * Einziger Ort, an dem Module zusammengebaut werden.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type LoadedConfig } from "./config.js";
import {
  warnDormantGuidanceConfigs,
  warnLegacyMonolith,
  warnNodeDeps,
} from "./config-truth.js";
import {
  WorkflowEngine,
  type PendingSpecKitTask,
} from "./workflow/WorkflowEngine.js";
import { WorkflowTools } from "./mcp-server/ToolHandlers.js";
import { scaffoldIfMissing } from "./scaffold.js";
import { SpecKitStateStore } from "./mcp-server/register-spec-kit-tools.js";
import { GuidanceError } from "./types/errors.js";
import type { SpecKitState } from "./integrations/spec-kit/SpecKitEngine.js";
import { checkArtifactPattern } from "./integrations/spec-kit/SpecKitEngine.js";
import { parseTasks } from "./integrations/spec-kit/parser.js";

export interface Composition {
  config: LoadedConfig;
  workspaces: import("./workspace-registry.js").WorkspaceRegistry;
  configDir: string;
  stateDir: string;
  engine: WorkflowEngine;
  tools: WorkflowTools;
}

/**
 * Scaffold-on-first-start (Option D): fehlt guidance.json KOMPLETT, wird eine
 * minimale valide Standardkonfiguration erzeugt (laut geloggt). Existierende
 * Dateien werden nie überschrieben; invalide Config wirft weiterhin
 * (fail-closed). Opt-out: GUIDANCE_SCAFFOLD=off.
 */
export function ensureConfiguration(
  configDir: string,
  workspaceRoot?: string,
): {
  scaffolded: boolean;
  createdFiles: string[];
} {
  const entry = join(configDir, "guidance.json");
  if (existsSync(entry)) return { scaffolded: false, createdFiles: [] };
  if (process.env.GUIDANCE_SCAFFOLD === "off") {
    throw new Error(
      `configuration_not_found: ${entry} fehlt (GUIDANCE_SCAFFOLD=off — Konfiguration manuell anlegen oder 'mcp-server-guidance-init' nutzen)`,
    );
  }
  const result = scaffoldIfMissing(configDir, workspaceRoot);
  if (result.scaffolded) {
    process.stderr.write(
      `[guidance] scaffolding initial configuration in ${configDir}:\n`,
    );
    for (const f of result.createdFiles)
      process.stderr.write(`[guidance]   + ${f}\n`);
    process.stderr.write(
      `[guidance] default 7-phase workflow created; customize .guidance/ to your process (disable with GUIDANCE_SCAFFOLD=off)\n`,
    );
  }
  return result;
}

/** Chain fix (2026-10-08): spec-kit bridges, parameterized per workspace so
 * the SAME factory serves the boot engine AND per-workspace child engines
 * (engineForWorkspace.childBridges). Keeps spec-kit imports out of the
 * WorkflowEngine (WIZ-3) while fixing the child-engine bridge drop. */
export function createSpecKitBridges(
  workspaceRoot: string,
  stateDir: string,
  featureRoot: string,
) {
  // Amendment 002 (FR-117 State-Brücke): pending spec-kit tasks in tasks.md
  // order. Missing state file (head never imported artifacts) ⇒ [] ⇒ silent
  // chain end.
  const specKitTasks = (sessionId: string): PendingSpecKitTask[] => {
    try {
      const state = new SpecKitStateStore(stateDir).load(
        sessionId,
      ) as SpecKitState;
      return Object.values(state.tasks).map((t) => ({
        id: t.taskId,
        title: t.title,
        featureId: state.featureId,
        status: t.status,
      }));
    } catch (err) {
      // CHN-4: a broken bridge must be diagnosable — empty list keeps
      // the FR-117 silent chain end. A missing state file is the
      // documented normal case (review F-2): stay silent for it and
      // only warn on unexpected errors.
      if (
        !(err instanceof GuidanceError) ||
        err.code !== "spec_kit_artifact_missing"
      ) {
        process.stderr.write(
          `[guidance] warning: specKitTasks bridge failed for ${sessionId}: ${String(err)}\n`,
        );
      }
      return [];
    }
  };
  // specs/017 FR-4/FR-8: artifact gate/skip bridge — same discovery/import
  // validation as the spec-kit tools (checkArtifactPattern), feature dir from
  // the session's imported state (import_spec_kit_artifacts is the source of
  // truth for featureId).
  const specKitArtifactCheck = (
    sessionId: string,
    pattern: string,
  ): {
    present: boolean;
    reason?: string;
    sha256?: string;
    content?: string;
  } => {
    try {
      const state = new SpecKitStateStore(stateDir).load(
        sessionId,
      ) as SpecKitState;
      const featureDir = join(workspaceRoot, featureRoot, state.featureId);
      return checkArtifactPattern(featureDir, workspaceRoot, pattern);
    } catch (err) {
      if (
        !(err instanceof GuidanceError) ||
        err.code !== "spec_kit_artifact_missing"
      ) {
        process.stderr.write(
          `[guidance] warning: specKitArtifactCheck failed for ${sessionId}: ${String(err)}\n`,
        );
      }
      const reason =
        err instanceof GuidanceError && err.code === "spec_kit_artifact_missing"
          ? "no imported spec-kit state for session"
          : `specKitArtifactCheck failed: ${err instanceof Error ? err.message : String(err)}`;
      return { present: false, reason };
    }
  };
  // Chain fix (2026-10-08): copy the spec-kit state to a chain successor —
  // successors get a NEW sessionId and would otherwise start without any
  // state file (Form-B bridge ⇒ [] ⇒ silent chain end after one task).
  // Best-effort by contract: errors are logged and swallowed so a failed
  // copy degrades to the previous behavior instead of blocking completion.
  const inheritSpecKitState = (
    fromSessionId: string,
    toSessionId: string,
  ): void => {
    try {
      const store = new SpecKitStateStore(stateDir);
      if (!store.exists(fromSessionId)) return; // head never imported — normal
      store.save(toSessionId, store.load(fromSessionId));
    } catch (err) {
      process.stderr.write(
        `[guidance] warning: spec-kit state inheritance ${fromSessionId} -> ${toSessionId} failed: ${String(err)}\n`,
      );
    }
  };
  // Chain fix (2026-10-08): UNCHECKED task count straight from tasks.md —
  // feeds the Form-B depth pre-check at start_workflow time (no session
  // state exists for the head yet). null = not determinable (pre-check skips).
  const specKitPendingTaskCount = (featureId: string): number | null => {
    try {
      if (!featureId) return null;
      const tasksFile = join(workspaceRoot, featureRoot, featureId, "tasks.md");
      if (!existsSync(tasksFile)) return null;
      const parsed = parseTasks(readFileSync(tasksFile, "utf-8"));
      return parsed.tasks.filter((t) => !t.checkboxChecked).length;
    } catch {
      return null;
    }
  };
  return {
    specKitTasks,
    specKitArtifactCheck,
    inheritSpecKitState,
    specKitPendingTaskCount,
  };
}

export function composeApplication(
  workspaceRoot: string,
  configDir: string,
  stateDir: string,
  options?: {
    operationEngine?: ConstructorParameters<
      typeof WorkflowEngine
    >[0]["operationEngine"];
    /** spec 007 FR-701: client-side executor for remote sessions. */
    clientOperationEngine?: ConstructorParameters<
      typeof WorkflowEngine
    >[0]["clientOperationEngine"];
    skipScaffold?: boolean;
  },
): Composition {
  if (!options?.skipScaffold) ensureConfiguration(configDir, workspaceRoot);
  // specs/008 FR-806: registry default entry anchors on the real workspace root.
  const config = loadConfig(configDir, { workspaceRoot });
  // specs/014 FR-1103/FR-1106: config-truth boot diagnostics (stderr warns).
  warnLegacyMonolith(config);
  warnDormantGuidanceConfigs(config, workspaceRoot);
  // specs/015 US2 (AC-10, FR-1214): when the proactive probe flag is ON, boot
  // diagnostics reference the deps-install/deps-reinstall operations so the
  // agent can heal node deps BEFORE gates run. OFF (default) = plain remedy text.
  warnNodeDeps(config, workspaceRoot, undefined, undefined, {
    operational: config.nodeDeps.proactiveProbe,
  });
  // Chain fix (2026-10-08): spec-kit bridges via the shared factory —
  // childBridges rebuilds them per workspace so pool deployments (registry-
  // only boot + per-workspace child engines) keep Form B and the artifact
  // gates working.
  const featureRoot = config.specKit?.discovery.featureRoot ?? "specs";
  const bridges = createSpecKitBridges(workspaceRoot, stateDir, featureRoot);
  const engine = new WorkflowEngine({
    config,
    stateDir,
    operationEngine: options?.operationEngine,
    clientOperationEngine: options?.clientOperationEngine,
    specKitTasks: bridges.specKitTasks,
    specKitArtifactCheck: bridges.specKitArtifactCheck,
    inheritSpecKitState: bridges.inheritSpecKitState,
    specKitPendingTaskCount: bridges.specKitPendingTaskCount,
    childBridges: (childRoot, childStateDir, childConfig) =>
      createSpecKitBridges(
        childRoot,
        childStateDir,
        childConfig.specKit?.discovery.featureRoot ?? "specs",
      ),
  });
  const tools = new WorkflowTools(engine, { stateDir });
  return {
    config,
    configDir,
    stateDir,
    engine,
    tools,
    // Live getter: registry_register recomposes engine.config — a frozen
    // snapshot here made /workspaces listings and tool wiring stale (specs/015).
    get workspaces() {
      return engine.config.workspaces;
    },
  };
}

export function resolveStateDir(
  workspaceRoot: string,
  config: LoadedConfig,
): string {
  const dir = config.main.state?.directory ?? "state";
  return join(workspaceRoot, dir);
}
