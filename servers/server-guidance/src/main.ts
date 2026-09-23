/**
 * Composition root (Review Finding 1): verdrahtet config → engine → tools.
 * Einziger Ort, an dem Module zusammengebaut werden.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, type LoadedConfig } from "./config.js";
import { WorkflowEngine } from "./workflow/WorkflowEngine.js";
import { WorkflowTools } from "./mcp-server/ToolHandlers.js";

export interface Composition {
  config: LoadedConfig;
  configDir: string;
  stateDir: string;
  engine: WorkflowEngine;
  tools: WorkflowTools;
}

export function composeApplication(workspaceRoot: string, configDir: string, stateDir: string): Composition {
  if (!existsSync(join(configDir, "guidance.json"))) {
    throw new Error(`configuration_not_found: ${join(configDir, "guidance.json")} fehlt`);
  }
  const config = loadConfig(configDir);
  const engine = new WorkflowEngine({ config, stateDir });
  const tools = new WorkflowTools(engine);
  return { config, configDir, stateDir, engine, tools };
}

export function resolveStateDir(workspaceRoot: string, config: LoadedConfig): string {
  const dir = config.main.state?.directory ?? "state";
  return join(workspaceRoot, dir);
}
