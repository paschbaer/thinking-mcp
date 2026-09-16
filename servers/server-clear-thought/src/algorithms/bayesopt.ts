/**
 * Real Bayesian optimization step: Gaussian-process posterior (RBF kernel)
 * + Expected Improvement over provided observations. The proposed point
 * and EI value are measured outputs of the computation.
 */

import { z } from 'zod';

export const bayesoptParamsSchema = z.object({
  /** Observed evaluations [x, y] of the (black-box) objective. */
  observations: z.array(z.tuple([z.number(), z.number()])).min(2).max(200),
  /** Search interval [lo, hi] for the next evaluation point. */
  bounds: z.tuple([z.number(), z.number()]),
  /** RBF kernel lengthscale ℓ. */
  lengthscale: z.number().positive().default(0.5),
  /** Observation noise added to the kernel diagonal. */
  noise: z.number().min(0).default(1e-6),
  /** Grid resolution for the EI maximization. */
  gridPoints: z.number().int().min(10).max(20000).default(500),
  maximize: z.boolean().default(true)
});

export type BayesOptParams = z.infer<typeof bayesoptParamsSchema>;

export interface BayesOptResult {
  nextX: number;
  expectedImprovement: number;
  posteriorAtNext: { mean: number; std: number };
  incumbent: { x: number; y: number };
  mode: 'maximize' | 'minimize';
  kernel: 'rbf';
  lengthscale: number;
}

function rbf(a: number, b: number, lengthscale: number): number {
  const d = a - b;
  return Math.exp(-(d * d) / (2 * lengthscale * lengthscale));
}

/** Gauss–Jordan inversion with partial pivoting (small symmetric PD matrices). */
function invertMatrix(A: number[][]): number[][] {
  const n = A.length;
  const M = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error('kernel matrix is singular — increase `noise` or remove duplicate observations');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const diag = M[col][col];
    for (let c = col; c < 2 * n; c++) M[col][c] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c < 2 * n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Abramowitz–Stegun 7.1.26 error-function approximation. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t *
    Math.exp(-ax * ax);
  return sign * (1 - poly);
}

const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));
const normalPdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

export function runBayesianOptimization(params: BayesOptParams): BayesOptResult {
  const { observations, bounds, lengthscale, noise, gridPoints, maximize } = params;
  const [lo, hi] = bounds;
  if (!(lo < hi)) {
    throw new Error(`bounds must be [lo, hi] with lo < hi (got [${lo}, ${hi}])`);
  }

  const xs = observations.map(([x]) => x);
  const ys = observations.map(([, y]) => y);
  const n = xs.length;

  // Kernel matrix K[i][j] = rbf(xi, xj) + noise·δij (posterior over f, not y).
  const K: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => rbf(xs[i], xs[j], lengthscale) + (i === j ? noise : 0))
  );
  const Kinv = invertMatrix(K);

  // alpha = K⁻¹ y — reused for the posterior mean at every grid point.
  const alpha = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) alpha[i] += Kinv[i][j] * ys[j];
  }

  let incumbentIdx = 0;
  for (let i = 1; i < n; i++) {
    const better = maximize ? ys[i] > ys[incumbentIdx] : ys[i] < ys[incumbentIdx];
    if (better) incumbentIdx = i;
  }
  const incumbentY = ys[incumbentIdx];

  let nextX = lo;
  let bestEI = Number.NEGATIVE_INFINITY;
  let bestMean = 0;
  let bestStd = 0;

  for (let g = 0; g < gridPoints; g++) {
    const xStar = gridPoints === 1 ? lo : lo + ((hi - lo) * g) / (gridPoints - 1);
    const kStar = xs.map((x) => rbf(x, xStar, lengthscale));

    let mean = 0;
    for (let i = 0; i < n; i++) mean += kStar[i] * alpha[i];

    // v = K⁻¹ k*, variance = 1 − k*ᵀ v
    const v = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) v[i] += Kinv[i][j] * kStar[j];
    }
    let variance = 1;
    for (let i = 0; i < n; i++) variance -= kStar[i] * v[i];
    const std = Math.sqrt(Math.max(variance, 1e-12));

    let ei = 0;
    if (std > 1e-12) {
      const improvement = maximize ? mean - incumbentY : incumbentY - mean;
      const z = improvement / std;
      ei = improvement * normalCdf(z) + std * normalPdf(z);
    }

    if (ei > bestEI) {
      bestEI = ei;
      nextX = xStar;
      bestMean = mean;
      bestStd = std;
    }
  }

  return {
    nextX,
    expectedImprovement: bestEI,
    posteriorAtNext: { mean: bestMean, std: bestStd },
    incumbent: { x: xs[incumbentIdx], y: incumbentY },
    mode: maximize ? 'maximize' : 'minimize',
    kernel: 'rbf',
    lengthscale
  };
}

export function formatBayesOptSummary(result: BayesOptResult): string {
  return (
    `Bayesian optimization (RBF, ℓ=${result.lengthscale}, ${result.mode}): ` +
    `next evaluation at x=${result.nextX.toFixed(4)} ` +
    `(EI=${result.expectedImprovement.toExponential(3)}, ` +
    `posterior ${result.posteriorAtNext.mean.toFixed(4)} ± ${result.posteriorAtNext.std.toFixed(4)}); ` +
    `incumbent y=${result.incumbent.y} at x=${result.incumbent.x}`
  );
}
