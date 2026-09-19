import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { DEFAULT_CONFIG, type ServerConfig } from './config.js';
import { registerTools } from './tools/index.js';

/**
 * Creates the Experience Memory MCP Server (EMMS).
 *
 * Tool surface (workflow, experience, lesson, validation, artifact families) is
 * specified in specs/001-experience-memory-server/spec.md and will be
 * implemented incrementally; every tool response MUST carry a guidance object
 * per the spec's guided interaction requirements.
 */
export default function createExperienceMemoryServer({
  config,
}: {
  sessionId?: string;
  config?: Partial<ServerConfig>;
}): Server {
  const resolvedConfig: ServerConfig = { ...DEFAULT_CONFIG, ...config };

  const server = new McpServer(
    {
      name: 'experience-memory-mcp',
      version: '0.1.0',
    },
    {
      instructions:
        'Evidence-backed long-term experience memory for coding agents. ' +
        'Capture, validate, and retrieve structured experience episodes with ' +
        'guidance on the recommended next request.',
    }
  );

  registerTools(server, resolvedConfig);

  return server.server;
}
