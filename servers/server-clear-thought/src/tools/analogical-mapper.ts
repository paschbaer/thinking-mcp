import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';

function questionsFor(domain: string, problem: string): string[] {
  const d = domain.charAt(0).toUpperCase() + domain.slice(1);
  return [
    `What is the deep structure of the problem — entities, relations, constraints? State them before mapping.`,
    `Name a classic, well-understood problem in ${d} with the same structure as: "${problem}".`,
    `Which solution patterns from ${d} transfer — and which fail because the mapping is imperfect?`
  ];
}

export function registerAnalogicalMapper(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'analogical_mapper',
    'Build an analogy scaffold: per seed domain guiding questions that lead ' +
      'the caller to construct the analogy (this server does not fabricate analogies)',
    {
      problem: z.string().trim().min(1),
      seed_domains: z
        .array(z.string().trim().min(1))
        .optional()
        .describe('Domains to draw analogies from (default: math, biology, art)'),
      k: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Max number of domains to use (default 3)')
    },
    async (args) => {
      const k = args.k ?? 3;
      const domains = (args.seed_domains ?? ['math', 'biology', 'art'])
        .map((d) => d.trim())
        .filter(Boolean)
        .slice(0, k);

      const lenses = domains.map((domain) => ({
        domain,
        guiding_questions: questionsFor(domain, args.problem)
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: 'facilitation',
                problem: args.problem,
                lenses,
                suggested_prompts: [
                  `Abstract "${args.problem}" to its structure: what plays the role of system, state and transformation?`,
                  ...domains.map((d) => `Translate the problem into ${d} terms, solve it there, then translate the solution back.`)
                ],
                nextSteps: [
                  'Answer the guiding questions per domain — the analogy content comes from you.',
                  'Keep only analogies that survive the "imperfect mapping" question.',
                  'Validate the best transfer candidate with systemsthinking or a small experiment.'
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
