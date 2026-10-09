import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import createExperienceMemoryServer from "./index.js";
import { launchSemanticWarmup } from "./tools/index.js";

async function main(): Promise<void> {
  const server = createExperienceMemoryServer({});
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Experience Memory MCP server running on stdio");
  // Fire-and-forget semantic warmup (once per process; see tools/index.ts)
  launchSemanticWarmup({});
}

main().catch((err) => {
  console.error("Fatal error running server:", err);
  process.exit(1);
});
