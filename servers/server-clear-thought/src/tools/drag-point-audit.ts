import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

const DEFAULT_CATEGORIES = ['error', 'warning', 'timeout', 'retry', 'slow'] as const;

export function registerDragPointAudit(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'drag_point_audit',
    'Scan a process log for drag points: per-keyword occurrence counts, ' +
      'repeated messages and overall drag density (empty log returns a scaffold)',
    {
      log: z.string(),
      categories: z
        .array(z.string())
        .optional()
        .describe('Keywords to count per line (default: error, warning, timeout, retry, slow)')
    },
    async ({ log, categories }) => {
      const lines = log
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mode: 'facilitation',
                  drag_points: [],
                  repeated_messages: [],
                  guiding_questions: [
                    'Which processing stages are covered by this log?',
                    'Where do retries, timeouts or repeated failures appear?',
                    'Which lines repeat identically (loops, retry storms)?'
                  ],
                  nextSteps: ['Paste the log text into the `log` parameter and call again.'],
                  status: 'success'
                },
                null,
                2
              )
            }
          ]
        };
      }

      const supplied = (categories ?? DEFAULT_CATEGORIES.map((c) => c))
        .map((c) => c.trim())
        .filter(Boolean);
      const cats = supplied.length > 0 ? supplied : [...DEFAULT_CATEGORIES];
      const lowerLines = lines.map((line) => line.toLowerCase());
      const drag_points = cats.map((category) => ({
        category,
        count: lowerLines.filter((line) => line.includes(category.toLowerCase())).length
      }));

      const counts = new Map<string, number>();
      for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
      const repeated_messages = [...counts.entries()]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count }));

      const flagged = lowerLines.filter((line) =>
        cats.some((category) => line.includes(category.toLowerCase()))
      ).length;
      const drag_density = Number((flagged / lines.length).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: 'analysis',
                drag_points,
                repeated_messages,
                total_line_count: lines.length,
                flagged_line_count: flagged,
                drag_density,
                summary_score: drag_density,
                nextSteps: [
                  'Investigate the categories with the highest counts first.',
                  'Repeated identical messages usually indicate retry storms or loops.',
                  'A drag_density above 0.3 means the log is dominated by problem lines.'
                ],
                status: 'success'
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}
