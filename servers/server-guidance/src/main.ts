/**
 * Composition root (Review Finding 1): verdrahtet config → engine → tools.
 * Einziger Ort, an dem Module zusammengebaut werden.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type LoadedConfig } from "./config.js";
import {
  WorkflowEngine,
  type PendingSpecKitTask,
} from "./workflow/WorkflowEngine.js";
import { WorkflowTools } from "./mcp-server/ToolHandlers.js";
import { scaffoldIfMissing } from "./scaffold.js";
import { SpecKitStateStore } from "./mcp-server/register-spec-kit-tools.js";
import type { SpecKitState } from "./integrations/spec-kit/SpecKitEngine.js";

export interface Composition {
  config: LoadedConfig;
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
export function ensureConfiguration(configDir: string): {
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
  const result = scaffoldIfMissing(configDir);
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

export function composeApplication(
  workspaceRoot: string,
  configDir: string,
  stateDir: string,
  options?: {
    operationEngine?: ConstructorParameters<
      typeof WorkflowEngine
    >[0]["operationEngine"];
    skipScaffold?: boolean;
  },
): Composition {
  if (!options?.skipScaffold) ensureConfiguration(configDir);
  const config = loadConfig(configDir);
  // Amendment 002 (FR-117 State-Brücke): pending spec-kit tasks in tasks.md
  // order — inserted here so WorkflowEngine stays free of spec-kit imports.
  // Missing state file (head never imported artifacts) ⇒ [] ⇒ silent chain end.
  const specKitTasks =
    config.profile === "spec-kit"
      ? (sessionId: string): PendingSpecKitTask[] => {
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
          } catch {
            return [];
          }
        }
      : undefined;
  const engine = new WorkflowEngine({
    config,
    stateDir,
    operationEngine: options?.operationEngine,
    specKitTasks,
  });
  const tools = new WorkflowTools(engine);
  return { config, configDir, stateDir, engine, tools };
}

export function resolveStateDir(
  workspaceRoot: string,
  config: LoadedConfig,
): string {
  const dir = config.main.state?.directory ?? "state";
  return join(workspaceRoot, dir);
}
