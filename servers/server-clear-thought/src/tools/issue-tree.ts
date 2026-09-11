import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

const DECOMPOSITION_QUESTIONS = [
  'Split the question into 2-4 MECE sub-questions (mutually exclusive, collectively exhaustive).',
  'For each sub-question: is it answerable, or does it need to be split again?',
  'Which branch carries the highest risk or information value?'
];

export function registerIssueTree(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'issue_tree',
    'Break down a question into hierarchical sub-issues. With `sub_questions` ' +
      'provided the tree is built from your decomposition; without it a ' +
      'facilitation scaffold with decomposition questions is returned',
    {
      problem: z.string().trim().min(1),
      depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('Target tree depth for the decomposition (default 1)'),
      sub_questions: z
        .array(z.string().trim().min(1))
        .optional()
        .describe(
          'First-level decomposition from you — providing it switches to analysis mode'
        )
    },
    async ({ problem, depth, sub_questions }) => {
      const d = depth ?? 1;
      const cleaned = (sub_questions ?? []).map((q) => q.trim()).filter(Boolean);
      const mode = cleaned.length > 0 ? 'analysis' : 'facilitation';

      const tree =
        mode === 'analysis'
          ? {
              question: problem,
              sub_questions: cleaned.map((question) => ({
                question,
                sub_questions: [] as unknown[]
              }))
            }
          : { question: problem, sub_questions: [] };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode,
                depth: d,
                tree,
                node_count: mode === 'analysis' ? 1 + cleaned.length : 1,
                ...(mode === 'facilitation' ? { decomposition_questions: DECOMPOSITION_QUESTIONS } : {}),
                nextSteps:
                  mode === 'analysis'
                    ? [
                        'Repeat the split for branches that are not yet answerable (target depth ' + d + ').',
                        'Work the branch with the highest information value first.'
                      ]
                    : [
                        'Answer the decomposition questions, then call again with `sub_questions` filled from your split.'
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
