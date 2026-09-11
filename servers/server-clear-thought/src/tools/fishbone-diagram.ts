import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

const DEFAULT_CATEGORIES = ['materials', 'methods', 'people', 'environment'] as const;

const GUIDING_QUESTIONS: Record<string, string> = {
  materials: 'Which inputs, data or dependencies contribute to the problem?',
  methods: 'Which process steps or procedures contribute to the problem?',
  people: 'Which human factors (knowledge load, handoffs, decisions) contribute?',
  environment: 'Which external conditions (load, timing, infrastructure) contribute?'
};

export function registerFishboneDiagram(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'fishbone_diagram',
    'Group potential causes of a problem. With `causes` provided the diagram ' +
      'is built from your content; without it a facilitation scaffold with ' +
      'per-category guiding questions is returned',
    {
      problem: z.string().trim().min(1),
      categories: z
        .array(z.string().trim().min(1))
        .optional()
        .describe('Bone categories for the scaffold (default: materials, methods, people, environment)'),
      causes: z
        .array(
          z.object({
            category: z.string().trim().min(1),
            causes: z.array(z.string().trim().min(1))
          })
        )
        .optional()
        .describe('Cause content per category — providing it switches to analysis mode')
    },
    async ({ problem, categories, causes }) => {
      const cleaned = (causes ?? []).map((c) => ({
        category: c.category,
        causes: c.causes.map((cause) => cause.trim()).filter(Boolean)
      }));
      const mode = cleaned.length > 0 ? 'analysis' : 'facilitation';
      const cats = categories ?? [...DEFAULT_CATEGORIES];

      const causes_map =
        mode === 'analysis'
          ? cleaned
          : cats.map((category) => ({
              category,
              causes: [] as string[],
              guiding_question:
                GUIDING_QUESTIONS[category] ?? `Which ${category}-related factors contribute to "${problem}"?`
            }));

      const total_cause_count =
        mode === 'analysis' ? cleaned.reduce((sum, c) => sum + c.causes.length, 0) : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode,
                problem,
                causes_map,
                total_cause_count,
                nextSteps:
                  mode === 'analysis'
                    ? [
                        'Mark the 1-2 causes with the highest impact x likelihood as prime suspects.',
                        'Verify prime suspects with debuggingapproach before fixing anything.'
                      ]
                    : [
                        'Answer the guiding question per category, then call again with the `causes` parameter.'
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
