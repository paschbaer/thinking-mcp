import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

export function registerConceptMap(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'concept_map',
    'Depict nodes and annotated relationships. With `related_concepts` ' +
      'provided the map is built from your content; without it a ' +
      'facilitation scaffold is returned',
    {
      main_concept: z.string().trim().min(1),
      related_concepts: z
        .array(z.string().trim().min(1))
        .optional()
        .describe('Related concepts — providing it switches to analysis mode'),
      relations: z
        .array(z.string().trim().min(1))
        .optional()
        .describe('Relation label per related concept (same order); defaults to a neutral structural label')
    },
    async ({ main_concept, related_concepts, relations }) => {
      const related = (related_concepts ?? []).map((r) => r.trim()).filter(Boolean);
      const mode = related.length > 0 ? 'analysis' : 'facilitation';

      const response: Record<string, unknown> = {
        mode,
        main_concept,
        ...(mode === 'analysis'
          ? {
              nodes: [main_concept, ...related],
              links: related.map((r, i) => ({
                from: main_concept,
                to: r,
                relation: relations?.[i]?.trim() || `${main_concept} relates to ${r}`
              })),
              relation_count: related.length
            }
          : {
              nodes: [main_concept],
              links: [],
              guiding_questions: [
                'Which concepts directly interact with the main concept?',
                'What kind of relationship does each have (causes, contains, contradicts, enables)?',
                'Which relationships are directed, and what would a cycle mean?'
              ],
              nextSteps: [
                'Call again with `related_concepts` (and optionally `relations`, same order) filled from your answers.'
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
