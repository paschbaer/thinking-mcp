import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

/**
 * D1 — Session-state MCP resources: read-only views of the current
 * session without tool calls. Registered per session factory, so the
 * resources always reflect that session's live state.
 */

function jsonResource(server: McpServer, name: string, uri: string, title: string, description: string, read: () => unknown) {
  server.registerResource(name, uri, { title, description }, async (uriObj) => ({
    contents: [
      {
        uri: uriObj.href,
        mimeType: 'application/json',
        text: JSON.stringify(read(), null, 2)
      }
    ]
  }));
}

export function registerSessionResources(server: McpServer, sessionState: SessionState): void {
  jsonResource(
    server,
    'session-stats',
    'clear-thought://session/stats',
    'Session Statistics',
    'Live statistics of the current session (tool usage, store sizes).',
    () => sessionState.getStats()
  );

  jsonResource(
    server,
    'session-export',
    'clear-thought://session/export',
    'Session Export',
    'Full session state in the same JSON shape session_import accepts.',
    () => sessionState.export()
  );

  jsonResource(
    server,
    'session-thoughts',
    'clear-thought://session/thoughts',
    'Thought History',
    'All sequential-thinking thoughts recorded in this session.',
    () => sessionState.getThoughts()
  );

  jsonResource(
    server,
    'session-workflows',
    'clear-thought://session/workflows',
    'Workflow Progress',
    'Current recipe_runner progress per recipe (session-scoped).',
    () => sessionState.getWorkflowStore().getAll()
  );
}
