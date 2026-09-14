import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const gateSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['basic', 'and', 'or']),
  name: z.string().trim().optional(),
  /** Basic events only: failure probability in [0, 1]. */
  probability: z.number().min(0).max(1).optional(),
  /** Input gate/event ids (required for `and` / `or` gates). */
  inputs: z.array(z.string().trim().min(1)).optional()
});

export function registerFaultTree(server: McpServer, _sessionState: unknown) {
  server.tool(
    'fault_tree',
    'Fault Tree Analysis: evaluate an AND/OR fault tree exactly, report the ' +
      'top-event probability and rank the basic events by their contribution ' +
      '(top probability with the event set to zero). With `gates` provided ' +
      'the analysis is computed; without it a facilitation scaffold with ' +
      'guiding questions is returned',
    {
      top_event: z.string().trim().min(1).describe('Name of the top event being analysed'),
      gates: z
        .array(gateSchema)
        .optional()
        .describe(
          'Tree definition — `basic` events carry `probability`, `and`/`or` gates reference `inputs` by id. Providing it switches from facilitation to analysis mode'
        )
    },
    async ({ top_event, gates }) => {
      const mode = gates && gates.length > 0 ? 'analysis' : 'facilitation';

      let response: Record<string, unknown>;
      if (mode === 'facilitation') {
        response = {
          mode,
          top_event,
          guiding_questions: [
            `What does "${top_event}" mean precisely — and what does NOT count as an instance of it?`,
            'Which immediate combinations of failures directly cause the top event? Those are your OR branches.',
            'For each branch: which component failures must occur TOGETHER (AND gate) versus any single one sufficing (OR gate)?',
            'Estimate a failure probability in [0, 1] for every leaf (basic event).',
            'Model the result as `gates`: basic events with probabilities, `and`/`or` gates referencing their `inputs` by id, and the id of the top gate.'
          ],
          nextSteps: [
            'Re-run with `gates` filled to compute the exact top-event probability and the contribution ranking of all basic events.'
          ],
          status: 'success'
        };
      } else {
        const defs = gates!;
        const gateMap = new Map<string, z.infer<typeof gateSchema>>();
        for (const g of defs) {
          if (gateMap.has(g.id)) {
            throw new Error(`duplicate gate id "${g.id}"`);
          }
          gateMap.set(g.id, g);
        }
        for (const g of defs) {
          if (g.type !== 'basic') {
            const inputs = g.inputs ?? [];
            if (inputs.length === 0) {
              throw new Error(`gate "${g.id}" (${g.type}) has no inputs`);
            }
            for (const ref of inputs) {
              if (!gateMap.has(ref)) {
                throw new Error(`gate "${g.id}" references unknown id "${ref}"`);
              }
            }
          }
          if (g.type === 'basic' && g.probability === undefined) {
            throw new Error(`basic event "${g.id}" is missing its probability`);
          }
        }

        const evaluating = new Set<string>();
        const memo = new Map<string, number>();

        function evaluate(id: string, zeroed?: string): number {
          if (zeroed && id === zeroed) return 0;
          if (evaluating.has(id)) {
            throw new Error(`cycle detected in the fault tree at "${id}"`);
          }
          const cached = memo.get(`${zeroed ?? ''}|${id}`);
          if (cached !== undefined) return cached;
          const gate = gateMap.get(id)!;
          evaluating.add(id);
          let p: number;
          if (gate.type === 'basic') {
            p = zeroed === id ? 0 : gate.probability!;
          } else {
            const probs = (gate.inputs ?? []).map((ref) => evaluate(ref, zeroed));
            if (gate.type === 'and') {
              // P(and) = ∏pᵢ
              p = probs.reduce((acc, x) => acc * x, 1);
            } else {
              // P(or) = 1 − ∏(1 − pᵢ)
              const complement = probs.reduce((acc, x) => acc * (1 - x), 1);
              p = 1 - complement;
            }
          }
          evaluating.delete(id);
          memo.set(`${zeroed ?? ''}|${id}`, p);
          return p;
        }

        // The last gate in the list is treated as the top gate.
        const topId = defs[defs.length - 1].id;
        const topProbability = evaluate(topId);

        const basics = defs.filter((g) => g.type === 'basic');
        const basicRanking = basics
          .map((b) => {
            const reduced = evaluate(topId, b.id);
            return {
              id: b.id,
              name: b.name ?? null,
              probability: b.probability!,
              contribution: topProbability - reduced
            };
          })
          .sort((a, b) => b.contribution - a.contribution);

        response = {
          mode: 'analysis',
          top_event,
          top_gate: topId,
          top_probability: topProbability,
          basic_events: basicRanking,
          status: 'success'
        };
      }

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
