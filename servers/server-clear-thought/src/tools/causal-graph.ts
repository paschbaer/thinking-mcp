import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * B3 — Causal Graph: relate candidate causes to an outcome, flag confounder
 * candidates and generate intervention/counterfactual questions per cause.
 * Dual-mode: without `causes` a facilitation scaffold is returned.
 */

export const causalGraphInputShape = {
  outcome: z.string().trim().min(1).describe('The effect being explained'),
  causes: z
    .array(z.string().trim().min(1))
    .optional()
    .describe('Candidate causes — providing it switches from facilitation to analysis mode'),
  links: z
    .array(
      z.object({
        from: z.string().trim().min(1).describe('Source node (a cause, or another cause)'),
        to: z.string().trim().min(1).describe('Target node (typically the outcome)'),
        kind: z
          .enum(['causes', 'contributes_to', 'confounds'])
          .describe('Nature of the causal edge')
      })
    )
    .optional()
    .describe('Causal edges between causes and the outcome (or cause → cause)')
};

export function runCausalGraph(args: z.infer<z.ZodObject<typeof causalGraphInputShape>>) {
  const { outcome } = args;
  const causes = args.causes ?? [];
  const links = args.links ?? [];

  const mode = causes.length > 0 ? 'analysis' : 'facilitation';

  if (mode === 'facilitation') {
    return {
      mode,
      outcome,
      guiding_questions: [
        `Which distinct candidate causes could produce "${outcome}"? List one per row.`,
        'For each candidate: would intervening on it alone actually change the outcome?',
        'Which candidates only correlate because they share a common driver (confounders)?',
        'Model your belief with `causes[]` and `links[]` (from → to, kind: causes | contributes_to | confounds; "outcome" is the target node).'
      ],
      nextSteps: [
        'Re-run with `causes` and `links` to get intervention/counterfactual questions, confounder candidates and root-cause candidates.'
      ],
      status: 'success'
    };
  }

  const nodeSet = new Set<string>([...causes, outcome]);
  const errors: string[] = [];
  for (const link of links) {
    if (!nodeSet.has(link.from)) errors.push(`link references unknown node "${link.from}"`);
    if (!nodeSet.has(link.to)) errors.push(`link references unknown node "${link.to}"`);
  }
  if (errors.length) {
    throw new Error(`${errors.join('; ')}`);
  }

  // Cycle check over cause → cause edges.
  const causeEdges = new Map<string, string[]>();
  for (const c of causes) causeEdges.set(c, []);
  for (const link of links) {
    if (causeEdges.has(link.from) && causeEdges.has(link.to)) {
      causeEdges.get(link.from)!.push(link.to);
    }
  }
  const visiting = new Set<string>();
  const checked = new Set<string>();
  function hasCycle(node: string): boolean {
    if (checked.has(node)) return false;
    if (visiting.has(node)) return true;
    visiting.add(node);
    for (const next of causeEdges.get(node) ?? []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(node);
    checked.add(node);
    return false;
  }
  for (const c of causes) {
    if (hasCycle(c)) {
      throw new Error(`cycle detected in the causal graph at "${c}"`);
    }
  }

  const linkedCauses = new Set<string>();
  const rootCandidates: string[] = [];
  for (const cause of causes) {
    const direct = links.some(
      (l) => l.from === cause && l.to === outcome && l.kind !== 'confounds'
    );
    if (direct) rootCandidates.push(cause);
    if (links.some((l) => l.from === cause || l.to === cause)) linkedCauses.add(cause);
  }
  const confounderCandidates = causes.filter((c) => !linkedCauses.has(c));

  return {
    mode: 'analysis',
    outcome,
    causes,
    links,
    root_candidates: rootCandidates,
    confounder_candidates: confounderCandidates,
    questions: causes.map((cause) => ({
      cause,
      intervention: `If we intervened on "${cause}" alone — holding everything else fixed — would "${outcome}" change?`,
      counterfactual: `Had "${cause}" been absent, would "${outcome}" still have occurred at the observed rate?`
    })),
    nextSteps: [
      'Answer the intervention and counterfactual questions per cause — causes failing both are correlation, not causation.',
      'Investigate the confounder candidates: find their common driver and add it as an explicit node.'
    ],
    status: 'success'
  };
}

export function registerCausalGraph(server: McpServer, _sessionState: unknown) {
  server.tool(
    'causal_graph',
    'Causal reasoning: relate candidate causes to an outcome, flag confounder ' +
      'candidates and generate intervention/counterfactual questions per ' +
      'cause. With `causes` provided the analysis is computed; without it a ' +
      'facilitation scaffold with guiding questions is returned',
    causalGraphInputShape,
    async (args) => {
      const response = runCausalGraph(args);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
