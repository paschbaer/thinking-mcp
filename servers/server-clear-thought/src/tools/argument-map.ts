import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * B2 — Argument Map (Toulmin model): structural completeness check of an
 * argument. Pure analysis — no state, no facilitation scaffold (the claim
 * alone already carries the structure).
 */

export const argumentMapInputShape = {
  claim: z.string().trim().min(1).describe('The conclusion being argued for'),
  warrant: z
    .string()
    .trim()
    .optional()
    .describe('Why the claim follows from the evidence — the reasoning principle'),
  backing: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('Supporting facts, data or sources under the warrant'),
  qualifiers: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('Strength limits, e.g. "in most cases", "as of today"'),
  rebuttals: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('Counter-arguments or conditions that would weaken the claim'),
  evidence: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('Concrete evidence items (data, observations, references)')
};

export function runArgumentMap(args: z.infer<z.ZodObject<typeof argumentMapInputShape>>) {
  const { claim } = args;
  const warrant = args.warrant ?? null;
  const backing = args.backing ?? [];
  const qualifiers = args.qualifiers ?? [];
  const rebuttals = args.rebuttals ?? [];
  const evidence = args.evidence ?? [];

  const elements = [
    { element: 'claim', present: claim.length > 0, question: null as string | null },
    {
      element: 'warrant',
      present: !!warrant,
      question: warrant
        ? null
        : 'Why does the evidence support the claim — what reasoning principle connects them?'
    },
    {
      element: 'evidence',
      present: evidence.length > 0,
      question: evidence.length ? null : 'What concrete data or observations support the claim?'
    },
    {
      element: 'backing',
      present: backing.length > 0,
      question: backing.length ? null : 'What facts or sources stand under the warrant itself?'
    },
    {
      element: 'qualifiers',
      present: qualifiers.length > 0,
      question: qualifiers.length
        ? null
        : 'Under which limits does the claim hold ("in most cases", "for type-1 systems")?'
    },
    {
      element: 'rebuttals',
      present: rebuttals.length > 0,
      question: rebuttals.length
        ? null
        : 'Which counter-arguments would weaken the claim — and why do they not defeat it?'
    }
  ];

  const present = elements.filter((e) => e.present).map((e) => e.element);
  const missing = elements.filter((e) => !e.present);

  return {
    mode: 'analysis',
    claim,
    elements,
    present_count: present.length,
    missing_elements: missing.map((m) => ({ element: m.element, guiding_question: m.question })),
    completeness: Math.round((present.length / elements.length) * 100),
    verdict:
      missing.length === 0
        ? 'Complete Toulmin structure — the argument is explicit about its reasoning and limits.'
        : 'Incomplete Toulmin structure — fill the missing elements (or explicitly scope them away) before reporting the conclusion.',
    status: 'success'
  };
}

export function registerArgumentMap(server: McpServer, _sessionState: unknown) {
  server.tool(
    'argument_map',
    'Argument Map (Toulmin model): check the structural completeness of an ' +
      'argument — claim, warrant, evidence, backing, qualifiers, rebuttals. ' +
      'Missing elements come back with guiding questions',
    argumentMapInputShape,
    async (args) => {
      const response = runArgumentMap(args);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
