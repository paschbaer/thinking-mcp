/** Upstream MCP server surface (FR-016/031). Tools are registered by later tasks. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createGuidanceServer(): McpServer {
  return new McpServer(
    { name: "guidance", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
}
