import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

const LENSES: Array<{ lens: string; questions: [string, string] }> = [
  { lens: 'empirical', questions: ['What observable evidence supports or contradicts this?', 'What experiment or measurement would settle it?'] },
  { lens: 'logical', questions: ['Does the reasoning chain contain any invalid inference?', 'What are the formal premises, and are they consistent?'] },
  { lens: 'ethical', questions: ['Who is affected, and are any harms unequally distributed?', 'Would this decision survive publicity?'] },
  { lens: 'pragmatic', questions: ['What is the cheapest test that could falsify this?', 'What breaks first in production?'] },
  { lens: 'systemic', questions: ['Which feedback loops does this trigger?', 'What second-order effects appear after time delays?'] },
  { lens: 'creative', questions: ['What would a solution look like if the main constraint were removed?', 'Which analogy from another domain reframes this?'] },
  { lens: 'critical', questions: ['What is the strongest argument against this?', 'Which unstated assumption is most load-bearing?'] }
];

export function registerSevenSeekersOrchestrator(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'seven_seekers_orchestrator',
    'Build a seven-lens examination scaffold (empirical, logical, ethical, ' +
      'pragmatic, systemic, creative, critical): guiding questions per lens ' +
      'plus optional downstream tools; the caller answers and synthesizes',
    {
      query: z.string().trim().min(1),
      downstream_tools: z
        .array(z.string().trim().min(1))
        .optional()
        .describe('Tools to chain after the lens examination (default: sequentialthinking, assumption_xray, structuredargumentation)')
    },
    async ({ query, downstream_tools }) => {
      const lenses = LENSES.map(({ lens, questions }) => ({ lens, guiding_questions: questions }));
      const suggested_downstream_tools = downstream_tools ?? [
        'sequentialthinking',
        'assumption_xray',
        'structuredargumentation'
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: 'facilitation',
                query,
                lenses,
                suggested_downstream_tools,
                nextSteps: [
                  'Answer the guiding questions for each lens — the examination content comes from you.',
                  'Note where two lenses disagree; those conflicts carry the most information.',
                  'Synthesize the answers with sequentialthinking, then stress-test with structuredargumentation.'
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
