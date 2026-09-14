import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * B4 — Fermi Estimation: decompose a target quantity into a chain of
 * assumptions, compute the point estimate and rank the assumptions by
 * sensitivity (deterministic: ±uncertainty_pct per assumption).
 */

export const fermiEstimateInputShape = {
  target: z.string().trim().min(1).describe('The quantity being estimated'),
  assumptions: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        value: z.number().describe('Assumed value (positive for multiply chains)'),
        uncertainty_pct: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Estimated relative uncertainty in percent (default 10)')
      })
    )
    .min(2)
    .describe('The assumption chain (at least two assumptions)'),
  combine: z
    .enum(['multiply', 'sum'])
    .optional()
    .describe('How the assumptions combine (default multiply — the classic Fermi chain)')
};

export function runFermiEstimate(args: z.infer<z.ZodObject<typeof fermiEstimateInputShape>>) {
  const { target, assumptions } = args;
  const combine = args.combine ?? 'multiply';

  const rows = assumptions.map((a) => ({
    label: a.label,
    value: a.value,
    uncertainty_pct: a.uncertainty_pct ?? 10
  }));

  const base = runWithMultiplier(rows, combine);

  // Sensitivity: swing each assumption by ± its uncertainty and measure the
  // estimate delta (deterministic — the classic Fermi sensitivity ranking).
  const sensitivity = rows.map((row, i) => {
    const factor = row.uncertainty_pct / 100;
    const plus = runWithMultiplier(
      rows.map((r, j) => (j === i ? { ...r, value: r.value * (1 + factor) } : r)),
      combine
    );
    const minus = runWithMultiplier(
      rows.map((r, j) => (j === i ? { ...r, value: r.value * (1 - factor) } : r)),
      combine
    );
    return {
      label: row.label,
      uncertainty_pct: row.uncertainty_pct,
      impact: Math.abs(plus - minus)
    };
  });
  sensitivity.sort((a, b) => b.impact - a.impact);

  return {
    mode: 'analysis',
    target,
    combine,
    assumptions: rows,
    estimate: base,
    sensitivity,
    most_sensitive: sensitivity[0].label,
    nextSteps: [
      `Tighten "${sensitivity[0].label}" first — it moves the estimate the most (impact ${round(sensitivity[0].impact)}).`,
      'Re-run after tightening to see the new sensitivity ranking.'
    ],
    status: 'success'
  };

  function runWithMultiplier(list: Array<{ value: number }>, op: 'multiply' | 'sum'): number {
    return op === 'multiply'
      ? list.reduce((acc, r) => acc * r.value, 1)
      : list.reduce((acc, r) => acc + r.value, 0);
  }

  function round(x: number): number {
    return Math.round(x * 100) / 100;
  }
}

export function registerFermiEstimate(server: McpServer, _sessionState: unknown) {
  server.tool(
    'fermi_estimate',
    'Fermi estimation: decompose a target quantity into an assumption chain, ' +
      'compute the point estimate and rank the assumptions by how much their ' +
      'uncertainty moves the result',
    fermiEstimateInputShape,
    async (args) => {
      const response = runFermiEstimate(args);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
