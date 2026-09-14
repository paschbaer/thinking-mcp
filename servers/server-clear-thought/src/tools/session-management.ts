import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerSessionManagement(server: McpServer, sessionState: SessionState) {
  // Session Info Tool
  server.tool(
    'session_info',
    'Get information about the current session including statistics and recent activity',
    {},
    async () => {
      const stats = sessionState.getStats();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId: stats.sessionId,
            createdAt: stats.createdAt,
            lastAccessedAt: stats.lastAccessedAt,
            stats,
            status: 'success'
          }, null, 2)
        }]
      };
    }
  );

  // Session Export Tool
  server.tool(
    'session_export',
    'Export the entire session state for backup or sharing',
    {
      format: z.enum(['json', 'summary']).optional().describe('Export format (default: json)')
    },
    async (args) => {
      const format = args.format || 'json';
      
      if (format === 'json') {
        const exportData = sessionState.export(); console.error('[DBG] session_export len:', Array.isArray(exportData) ? exportData.length : 'obj');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(exportData, null, 2)
          }],
          // exportData is an array — the central text→structuredContent
          // derivation skips arrays, so provide it explicitly (RB-10 schema
          // is advertised; without this the SDK rejects the call with -32602).
          structuredContent: { export: exportData, status: 'success' }
        };
      } else {
        // Summary format
        const stats = sessionState.getStats();
        let summary = `Session Summary: ${sessionState.sessionId}\n`;
        summary += `Created: ${stats.createdAt.toISOString()}\n`;
        summary += `Last Activity: ${stats.lastAccessedAt.toISOString()}\n\n`;
        summary += `Statistics:\n`;
        summary += `- Total Thoughts: ${stats.thoughtCount}\n`;
        summary += `- Tools Used: ${stats.toolsUsed.join(', ')}\n`;
        summary += `- Total Operations: ${stats.totalOperations}\n`;
        summary += `- Remaining Thoughts: ${stats.remainingThoughts}\n`;
        summary += `- Active: ${stats.isActive}\n\n`;
        summary += `Store Statistics:\n`;
        summary += `- Thoughts: ${JSON.stringify(stats.stores.thoughts)}\n`;
        summary += `- Mental Models: ${JSON.stringify(stats.stores.mentalModels)}\n`;
        summary += `- Debugging: ${JSON.stringify(stats.stores.debugging)}\n`;
        summary += `- Collaborative: ${JSON.stringify(stats.stores.collaborative)}\n`;
        summary += `- Decisions: ${JSON.stringify(stats.stores.decisions)}\n`;
        summary += `- Metacognitive: ${JSON.stringify(stats.stores.metacognitive)}\n`;
        summary += `- Scientific: ${JSON.stringify(stats.stores.scientific)}\n`;
        summary += `- Creative: ${JSON.stringify(stats.stores.creative)}\n`;
        summary += `- Systems: ${JSON.stringify(stats.stores.systems)}\n`;
        summary += `- Visual: ${JSON.stringify(stats.stores.visual)}\n`;
        
        return {
          content: [{
            type: 'text',
            text: summary
          }],
          // Markdown is not JSON — provide structuredContent explicitly so
          // the advertised output schema does not reject the call.
          structuredContent: { format: 'summary', summary, status: 'success' }
        };
      }
    }
  );

  // Session Import Tool
  server.tool(
    'session_import',
    'Import a previously exported session state',
    {
      sessionData: z.string().describe('JSON string of exported session data'),
      merge: z.boolean().optional().describe('Whether to merge with existing session data (default: false)')
    },
    async (args) => {
      try {
        const importData = JSON.parse(args.sessionData);
        const merge = args.merge || false;
        
        if (!merge) {
          // Clear existing data before import
          sessionState.cleanup();
        }
        
        sessionState.import(importData);
        
        const stats = sessionState.getStats();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: merge ? 'Session data merged successfully' : 'Session data imported successfully',
              sessionId: sessionState.sessionId,
              stats
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to import session data'
            }, null, 2)
          }]
        };
      }
    }
  );

  // Session Persistence Tools (D3) — enabled via the `dataDir` config.
  const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

  function persistenceError(message: string) {
    return {
      isError: true as const,
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ status: 'error', error: message }, null, 2)
      }]
    };
  }

  server.tool(
    'session_save',
    'Persist the current session state to a JSON file under the configured dataDir',
    {
      name: z
        .string()
        .regex(NAME_PATTERN, 'name may contain letters, digits, dot, underscore and dash only')
        .describe('File name (without extension) for the saved session')
    },
    async ({ name }) => {
      const dataDir = sessionState.getConfig().dataDir;
      if (!dataDir) {
        return persistenceError(
          'session persistence is disabled — configure the server with a dataDir to enable session_save/session_load'
        );
      }
      try {
        const sessionsDir = path.join(dataDir, 'sessions');
        await fs.mkdir(sessionsDir, { recursive: true });
        const file = path.join(sessionsDir, `${name}.json`);
        const payload = {
          savedAt: new Date().toISOString(),
          sessionId: sessionState.sessionId,
          data: ((d) => { console.error('[DBG] session_save len:', Array.isArray(d) ? d.length : 'obj'); return d; })(sessionState.export())
        };
        await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
        const response = {
          status: 'success',
          saved: file,
          bytes: (await fs.stat(file)).size
        };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      } catch (error) {
        return persistenceError(
          error instanceof Error ? error.message : 'Failed to save session state'
        );
      }
    }
  );

  server.tool(
    'session_load',
    'Load a previously saved session state file from the configured dataDir into this session',
    {
      name: z
        .string()
        .regex(NAME_PATTERN, 'name may contain letters, digits, dot, underscore and dash only')
        .describe('File name (without extension) of the saved session'),
      merge: z.boolean().optional().describe('Whether to merge with existing session data (default: false)')
    },
    async ({ name, merge }) => {
      const dataDir = sessionState.getConfig().dataDir;
      if (!dataDir) {
        return persistenceError(
          'session persistence is disabled — configure the server with a dataDir to enable session_save/session_load'
        );
      }
      try {
        const file = path.join(dataDir, 'sessions', `${name}.json`);
        if (!fsSync.existsSync(file)) {
          return persistenceError(`no saved session named "${name}" (looked at ${file})`);
        }
        const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!merge) {
          sessionState.cleanup();
        }
        sessionState.import(parsed.data);
        const response = {
          status: 'success',
          loaded: file,
          savedAt: parsed.savedAt ?? null,
          stats: sessionState.getStats()
        };
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      } catch (error) {
        return persistenceError(
          error instanceof Error ? error.message : 'Failed to load session state'
        );
      }
    }
  );
}