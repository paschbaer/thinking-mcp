import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import createExperienceMemoryServer from './index.js';

async function main(): Promise<void> {
  const server = createExperienceMemoryServer({});
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Experience Memory MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error running server:', err);
  process.exit(1);
});
