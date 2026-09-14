import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SessionState } from './state/SessionState.js';
import { ServerConfigSchema, type ServerConfig } from './config.js';
import { registerTools } from './tools/index.js';
import { TOOL_METADATA } from './tools/tool-metadata.js';

// Export the config schema for Smithery
export { ServerConfigSchema as configSchema } from './config.js';

/**
 * Creates a Clear Thought MCP server instance for a specific session
 * @param sessionId - Unique identifier for this session
 * @param config - Server configuration
 * @returns Server instance configured for this session
 */
export default function createClearThoughtServer({
  sessionId,
  config
}: {
  sessionId: string;
  config: z.infer<typeof ServerConfigSchema>
}): Server {
  // Create a new MCP server instance for each session
  const mcpServer = new McpServer({
    name: 'clear-thought',
    version: '0.1.1'
  });

  // Initialize session state
  const sessionState = new SessionState(sessionId, config);

  // Register all tools for this session
  registerTools(mcpServer, sessionState);

  // Capability metadata for every registered tool: annotations, a generic
  // object output schema, and structuredContent derived from the JSON text
  // payload the handlers already return. Applied centrally via the SDK's
  // supported tool.update() so all current and future tools are covered
  // without touching each registration site. Reasoning tools do not modify
  // the external environment (they only read session state), so the
  // readOnly/idempotent hints are accurate.
  const registeredTools = (
    mcpServer as unknown as { _registeredTools: Record<string, any> }
  )._registeredTools;
  for (const [toolName, tool] of Object.entries(registeredTools ?? {})) {
    // RB-10: registry-driven metadata — human-readable titles, honest
    // idempotent hints (stateful tools accumulate session state) and typed
    // output schemas. Fallback keeps the loop total if a tool ships without
    // an entry; the completeness test makes that gap visible.
    const metadata = TOOL_METADATA[toolName];
    const outputSchema =
      metadata?.outputSchema ??
      (z.object({}).passthrough() as z.ZodObject<Record<string, z.ZodTypeAny>>);
    const originalHandler = tool.handler.bind(tool);
    tool.update({
      annotations: {
        title: metadata?.title ?? toolName,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: !(metadata?.stateful ?? false),
        openWorldHint: false
      },
      outputSchema: outputSchema.shape,
      callback: async (args: unknown, extra: unknown) => {
        const result = await originalHandler(args, extra);
        if (result?.structuredContent) return result;
        const text = result?.content?.[0]?.text;
        if (typeof text !== 'string') return result;
        try {
          const structured = JSON.parse(text);
          if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
            return { ...result, structuredContent: structured };
          }
        } catch {
          // non-JSON payloads stay text-only
        }
        return result;
      }
    });
    // update() builds the schema via objectFromShape(shape) which serializes
    // conservatively — assign the full zod object so clients get defined
    // properties + additionalProperties (passthrough) for payload evolution.
    tool.outputSchema = outputSchema;
  }

  // Return the underlying Server instance for Smithery SDK
  return mcpServer.server;
}
