/** Guidance MCP server — stdio entry point (composition root, Review Finding 1). */
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGuidanceServer } from "./mcp-server/GuidanceServer.js";
import { registerWorkflowTools } from "./mcp-server/register-tools.js";
import { registerSpecKitTools } from "./mcp-server/register-spec-kit-tools.js";
import { toEngineSpecKitConfig } from "./mcp-server/register-spec-kit-tools.js";
import { composeApplication, ensureConfiguration } from "./main.js";
import { AuditRepository } from "./state/SessionRepository.js";
export const GUIDANCE_SERVER_NAME = "guidance";
export const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const app = composeApplication(workspaceRoot, join(workspaceRoot, ".guidance"), join(workspaceRoot, ".guidance", "state"));
  const server = createGuidanceServer();
  registerWorkflowTools(server, app.tools, workspaceRoot);
  // Option C (Review Finding 7): Spec-Kit-Tools nur bei Profil "spec-kit".
  if (app.config.profile === "spec-kit") {
    if (!app.config.specKit) {
      throw new Error("configuration_invalid: profile spec-kit requires specKit integration config");
    }
    const audit = new AuditRepository(join(app.stateDir, "history"));
    registerSpecKitTools(server, {
      workspaceRoot,
      stateDir: app.stateDir,
      configVersion: app.config.configVersion,
      specKitConfig: toEngineSpecKitConfig(app.config.specKit),
      audit: (event) => audit.append({ sessionId: event.sessionId, eventType: event.eventType, phase: event.phase, data: event.data }),
    });
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[${GUIDANCE_SERVER_NAME}] v${SERVER_VERSION} ready (stdio, profile: ${app.config.profile})\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
