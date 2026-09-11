import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerMindMap(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'mind_map',
    'Outline branches around a central topic. With `branches` provided the ' +
      'map is built from your content; without it a facilitation scaffold ' +
      'with guiding questions is returned',
    {
      topic: z.string().trim().min(1),
      num_branches: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Suggested branch count for the facilitation scaffold (default 3)'),
      branches: z
        .array(
          z.object({
            title: z.string().trim().min(1),
            subtopics: z.array(z.string().trim().min(1)).optional()
          })
        )
        .optional()
        .describe('Branch content — providing it switches from facilitation to analysis mode')
    },
    async ({ topic, num_branches, branches }) => {
      const cleaned = (branches ?? []).map((b) => ({
        branch: b.title,
        subtopics: (b.subtopics ?? []).map((s) => s.trim()).filter(Boolean)
      }));
      const mode = cleaned.length > 0 ? 'analysis' : 'facilitation';

      const response: Record<string, unknown> = {
        mode,
        topic,
        ...(mode === 'analysis'
          ? { map: cleaned, branch_count: cleaned.length }
          : {
              map: [],
              suggested_branch_count: num_branches ?? 3,
              guiding_questions: [
                `What are the 3-5 main themes around "${topic}"? Aim for MECE (mutually exclusive, collectively exhaustive).`,
                'Which themes are parents and which are details?',
                'What is missing that an expert would include?'
              ],
              nextSteps: [
                'Call again with the `branches` parameter ({ title, subtopics[] }) filled from your answers.'
              ]
            }),
        status: 'success'
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    }
  );
}
