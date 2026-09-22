/**
 * Guidance MCP server — stdio entry point.
 *
 * Functionality is delivered incrementally per
 * specs/002-guidance-workflow-server/tasks.md; the full upstream tool surface
 * is specified in contracts/upstream-mcp-tools.md.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGuidanceServer } from "./mcp-server/GuidanceServer.js";

export const GUIDANCE_SERVER_NAME = "guidance";
export const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const server = createGuidanceServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[${GUIDANCE_SERVER_NAME}] v${SERVER_VERSION} ready (stdio).\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
