/**
 * Real Hidden Markov Model inference: Viterbi (most likely latent path,
 * log-space) and the forward–backward algorithm (scaled, smoothed
 * posteriors + log-likelihood). Numbers are measured, not framed.
 */

import { z } from 'zod';

export const hmmParamsSchema = z.object({
  states: z.array(z.string().min(1)).min(2),
  /** Observation alphabet, aligned with emissions columns. */
  observationSymbols: z.array(z.string().min(1)).min(1),
  /** Observed sequence (symbols from observationSymbols). */
  observations: z.array(z.string().min(1)).min(1),
  /** Transition matrix A[si][sj], row-stochastic. */
  transitions: z.array(z.array(z.number().min(0).max(1))),
  /** Emission matrix B[si][oi], row-stochastic. */
  emissions: z.array(z.array(z.number().min(0).max(1))),
  /** Initial state distribution pi. */
  initial: z.array(z.number().min(0).max(1)),
  algorithm: z.enum(['viterbi', 'forward-backward', 'both']).default('both')
});

export type HmmParams = z.infer<typeof hmmParamsSchema>;

export interface HmmResult {
  viterbi?: {
    path: string[];
    logProbability: number;
  };
  forwardBackward?: {
    /** Smoothed state posteriors gamma[t][si] — each row sums to 1. */
    gamma: number[][];
    logLikelihood: number;
  };
}

const ROW_SUM_TOLERANCE = 1e-6;
const NEG_INF = Number.NEGATIVE_INFINITY;

function validateStochastic(name: string, matrix: number[][], rows: number, cols: number): void {
  if (matrix.length !== rows) {
    throw new Error(`${name} has ${matrix.length} rows, expected ${rows}`);
  }
  for (let i = 0; i < rows; i++) {
    if (matrix[i].length !== cols) {
      throw new Error(`${name}[${i}] has ${matrix[i].length} columns, expected ${cols}`);
    }
    const sum = matrix[i].reduce((acc, p) => acc + p, 0);
    if (Math.abs(sum - 1) > ROW_SUM_TOLERANCE) {
      throw new Error(
        `${name}[${i}] is not row-stochastic (sum=${sum.toFixed(8)}, tolerance=${ROW_SUM_TOLERANCE})`
      );
    }
  }
}

export function inferHmm(params: HmmParams): HmmResult {
  const { states, observationSymbols, observations, transitions, emissions, initial, algorithm } =
    params;

  const nStates = states.length;
  const nSymbols = observationSymbols.length;

  validateStochastic('transitions', transitions, nStates, nStates);
  validateStochastic('emissions', emissions, nStates, nSymbols);
  validateStochastic('initial', [initial], 1, nStates);

  const initialSum = initial.reduce((acc, p) => acc + p, 0);
  if (Math.abs(initialSum - 1) > ROW_SUM_TOLERANCE) {
    throw new Error(
      `initial is not a distribution (sum=${initialSum.toFixed(8)}, tolerance=${ROW_SUM_TOLERANCE})`
    );
  }

  const symbolIndex = new Map<string, number>();
  observationSymbols.forEach((sym, i) => symbolIndex.set(sym, i));
  const obsIdx = observations.map((o) => {
    const idx = symbolIndex.get(o);
    if (idx === undefined) {
      throw new Error(
        `observation "${o}" is not in observationSymbols [${observationSymbols.join(', ')}]`
      );
    }
    return idx;
  });

  const safeLog = (x: number): number => (x <= 0 ? NEG_INF : Math.log(x));

  const result: HmmResult = {};

  if (algorithm === 'viterbi' || algorithm === 'both') {
    // Viterbi in log space
    const T = obsIdx.length;
    const delta: number[][] = Array.from({ length: T }, () => new Array<number>(nStates).fill(NEG_INF));
    const psi: number[][] = Array.from({ length: T }, () => new Array<number>(nStates).fill(0));

    for (let i = 0; i < nStates; i++) {
      delta[0][i] = safeLog(initial[i]) + safeLog(emissions[i][obsIdx[0]]);
    }
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < nStates; j++) {
        let best = NEG_INF;
        let bestPrev = 0;
        for (let i = 0; i < nStates; i++) {
          const cand = delta[t - 1][i] + safeLog(transitions[i][j]);
          if (cand > best) {
            best = cand;
            bestPrev = i;
          }
        }
        delta[t][j] = best + safeLog(emissions[j][obsIdx[t]]);
        psi[t][j] = bestPrev;
      }
    }
    let bestLast = 0;
    for (let i = 1; i < nStates; i++) {
      if (delta[T - 1][i] > delta[T - 1][bestLast]) bestLast = i;
    }
    const pathIdx = new Array<number>(T).fill(0);
    pathIdx[T - 1] = bestLast;
    for (let t = T - 2; t >= 0; t--) {
      pathIdx[t] = psi[t + 1][pathIdx[t + 1]];
    }
    result.viterbi = {
      path: pathIdx.map((i) => states[i]),
      logProbability: delta[T - 1][bestLast]
    };
  }

  if (algorithm === 'forward-backward' || algorithm === 'both') {
    // Scaled forward-backward
    const T = obsIdx.length;
    const alpha: number[][] = Array.from({ length: T }, () => new Array<number>(nStates).fill(0));
    const beta: number[][] = Array.from({ length: T }, () => new Array<number>(nStates).fill(0));
    const scales = new Array<number>(T).fill(0);

    for (let i = 0; i < nStates; i++) alpha[0][i] = initial[i] * emissions[i][obsIdx[0]];
    scales[0] = alpha[0].reduce((acc, x) => acc + x, 0);
    if (scales[0] <= 0) throw new Error('forward pass collapsed: zero probability at t=0');
    for (let i = 0; i < nStates; i++) alpha[0][i] /= scales[0];

    for (let t = 1; t < T; t++) {
      for (let j = 0; j < nStates; j++) {
        let acc = 0;
        for (let i = 0; i < nStates; i++) acc += alpha[t - 1][i] * transitions[i][j];
        alpha[t][j] = acc * emissions[j][obsIdx[t]];
      }
      scales[t] = alpha[t].reduce((acc, x) => acc + x, 0);
      if (scales[t] <= 0) throw new Error(`forward pass collapsed: zero probability at t=${t}`);
      for (let j = 0; j < nStates; j++) alpha[t][j] /= scales[t];
    }

    for (let i = 0; i < nStates; i++) beta[T - 1][i] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < nStates; i++) {
        let acc = 0;
        for (let j = 0; j < nStates; j++) {
          acc += transitions[i][j] * emissions[j][obsIdx[t + 1]] * beta[t + 1][j];
        }
        beta[t][i] = acc / scales[t + 1];
      }
    }

    const gamma: number[][] = Array.from({ length: T }, () => new Array<number>(nStates).fill(0));
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < nStates; i++) gamma[t][i] = alpha[t][i] * beta[t][i];
    }

    const logLikelihood = scales.reduce((acc, s) => acc + Math.log(s), 0);
    result.forwardBackward = { gamma, logLikelihood };
  }

  return result;
}

export function formatHmmSummary(result: HmmResult): string {
  const parts: string[] = [];
  if (result.viterbi) {
    parts.push(`Viterbi path ${result.viterbi.path.join('→')} (log P=${result.viterbi.logProbability.toFixed(3)})`);
  }
  if (result.forwardBackward) {
    parts.push(`forward-backward log-likelihood=${result.forwardBackward.logLikelihood.toFixed(3)}`);
  }
  return `HMM inference: ${parts.join('; ')}`;
}
