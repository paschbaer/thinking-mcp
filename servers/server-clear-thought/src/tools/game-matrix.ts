import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * B5 — Game Matrix: analyze a zero-sum-or-not payoff matrix — strict
 * dominance, best responses, pure Nash equilibria and (closed-form) mixed
 * strategies for 2×2 games. Deterministic analysis, no state.
 */

const cellSchema = z.object({
  row: z.number().describe('Payoff for the row player'),
  col: z.number().describe('Payoff for the column player')
});

export const gameMatrixInputShape = {
  row_labels: z.array(z.string().trim().min(1)).min(2).describe('Row player strategies'),
  col_labels: z.array(z.string().trim().min(1)).min(2).describe('Column player strategies'),
  payoff_matrix: z
    .array(z.array(cellSchema))
    .min(2)
    .describe('Payoff cells: payoff_matrix[row][col] = { row, col }')
};

export function runGameMatrix(args: z.infer<z.ZodObject<typeof gameMatrixInputShape>>) {
  const { row_labels, col_labels, payoff_matrix } = args;
  const R = row_labels.length;
  const C = col_labels.length;

  if (payoff_matrix.length !== R) {
    throw new Error(`payoff_matrix has ${payoff_matrix.length} rows, expected ${R}`);
  }
  payoff_matrix.forEach((row, i) => {
    if (row.length !== C) {
      throw new Error(`payoff_matrix[${i}] has ${row.length} columns, expected ${C}`);
    }
  });

  // Best responses: for each column, the row payoffs; for each row, the col payoffs.
  const bestResponses = {
    row: new Array(C).fill(0).map((_, c) => {
      let best = 0;
      for (let r = 1; r < R; r++) if (payoff_matrix[r][c].row > payoff_matrix[best][c].row) best = r;
      return row_labels[best];
    }),
    col: new Array(R).fill(0).map((_, r) => {
      let best = 0;
      for (let c = 1; c < C; c++) if (payoff_matrix[r][c].col > payoff_matrix[r][best].col) best = c;
      return col_labels[best];
    })
  };

  // Strict dominance: row r strictly dominated by row r' if r' beats r in every column.
  function strictlyDominatedRows(): Array<{ dominated: string; by: string }> {
    const out: Array<{ dominated: string; by: string }> = [];
    for (let r = 0; r < R; r++) {
      for (let r2 = 0; r2 < R; r2++) {
        if (r === r2) continue;
        if (payoff_matrix[r].every((cell, c) => payoff_matrix[r2][c].row > cell.row)) {
          out.push({ dominated: row_labels[r], by: row_labels[r2] });
          break;
        }
      }
    }
    return out;
  }
  function strictlyDominatedCols(): Array<{ dominated: string; by: string }> {
    const out: Array<{ dominated: string; by: string }> = [];
    for (let c = 0; c < C; c++) {
      for (let c2 = 0; c2 < C; c2++) {
        if (c === c2) continue;
        if (payoff_matrix.every((row) => row[c2].col > row[c].col)) {
          out.push({ dominated: col_labels[c], by: col_labels[c2] });
          break;
        }
      }
    }
    return out;
  }

  // Pure Nash: cell is a simultaneous best response.
  const pureNash: Array<{ row: string; col: string; payoffs: z.infer<typeof cellSchema> }> = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const isRowBest = payoff_matrix[r][c].row === Math.max(...payoff_matrix.map((row) => row[c].row));
      const isColBest = payoff_matrix[r][c].col === Math.max(...payoff_matrix[r].map((cell) => cell.col));
      if (isRowBest && isColBest) {
        pureNash.push({ row: row_labels[r], col: col_labels[c], payoffs: payoff_matrix[r][c] });
      }
    }
  }

  // Mixed strategies (closed form) for 2×2 — opponent indifference.
  let mixed: Record<string, unknown> | null = null;
  if (R === 2 && C === 2) {
    const a = payoff_matrix[0][0].row;
    const b = payoff_matrix[0][1].row;
    const c = payoff_matrix[1][0].row;
    const d = payoff_matrix[1][1].row;
    const denomRow = a - b - c + d;
    if (denomRow !== 0) {
      // Column mixes col0 with q so the row player is indifferent.
      const q = (d - b) / denomRow;
      const e = payoff_matrix[0][0].col;
      const f = payoff_matrix[0][1].col;
      const g = payoff_matrix[1][0].col;
      const h = payoff_matrix[1][1].col;
      const denomCol = e - f - g + h;
      if (denomCol !== 0) {
        // Row mixes row0 with p so the column player is indifferent.
        // Col payoff from H: p·e + (1−p)·g; from R: p·f + (1−p)·h.
        // Indifference → p = (h − g) / (e − f − g + h).
        const p = (h - g) / denomCol;
        mixed = {
          row_player: { [row_labels[0]]: round(p), [row_labels[1]]: round(1 - p) },
          col_player: { [col_labels[0]]: round(q), [col_labels[1]]: round(1 - q) },
          note: 'Closed-form equilibrium of the mixed extension (2×2). Probabilities outside [0,1] mean no interior mixed equilibrium.'
        };
      }
    }
  }

  return {
    mode: 'analysis',
    row_labels,
    col_labels,
    payoff_matrix,
    best_responses: bestResponses,
    strictly_dominated: { rows: strictlyDominatedRows(), columns: strictlyDominatedCols() },
    pure_nash: pureNash,
    nash_count: pureNash.length,
    mixed_strategies: mixed,
    nextSteps: [
      pureNash.length === 1
        ? 'Unique pure Nash — predicted outcome, but check the payoffs for realism before relying on it.'
        : 'Multiple equilibria (or none) — coordination, convention or commitment mechanisms decide which one is played.',
      mixed ? 'Compare the mixed equilibrium against the pure ones before predicting behavior.' : 'Consider aggregating strategies to reach a 2×2 form for mixed-equilibrium analysis.'
    ],
    status: 'success'
  };

  function round(x: number): number {
    return Math.round(x * 1000) / 1000;
  }
}

export function registerGameMatrix(server: McpServer, _sessionState: unknown) {
  server.tool(
    'game_matrix',
    'Game theory: analyze a payoff matrix — strict dominance, best ' +
      'responses, pure Nash equilibria and closed-form mixed strategies for ' +
      '2×2 games',
    gameMatrixInputShape,
    async (args) => {
      const response = runGameMatrix(args);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
