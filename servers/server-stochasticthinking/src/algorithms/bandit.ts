/**
 * Real multi-armed bandit with per-run session state. Arms have known
 * reward distributions (so regret is measurable), and a run persists
 * across tool calls (counts, sums, regret and the RNG state live in the
 * per-session store).
 */

import { z } from 'zod';
import { createRng, gaussian, sampleBeta, type SeededRng } from './rng.js';

export const banditArmSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bernoulli'),
    /** Success probability, [0, 1]. */
    p: z.number().min(0).max(1)
  }),
  z.object({
    type: z.literal('gaussian'),
    mu: z.number(),
    /** Standard deviation, > 0. */
    sigma: z.number().positive()
  })
]);

export const banditParamsSchema = z.object({
  arms: z.array(banditArmSchema).min(2).max(20),
  strategy: z.enum(['epsilon-greedy', 'UCB', 'thompson']).default('epsilon-greedy'),
  /** epsilon-greedy exploration rate. */
  epsilon: z.number().min(0).max(1).default(0.1),
  /** UCB exploration multiplier (default 1 = standard UCB1). */
  c: z.number().positive().default(1),
  /** Pulls executed per tool call. */
  pulls: z.number().int().positive().default(100),
  /** Seed for a NEW run (continuations reuse the stored RNG state). */
  seed: z.number().int().default(42),
  /** Opaque run id: pass it back to continue the same run. */
  runId: z.string().min(1).optional()
});

export type BanditParams = z.infer<typeof banditParamsSchema>;
export type BanditArm = z.infer<typeof banditArmSchema>;

export interface BanditRunState {
  runId: string;
  arms: BanditArm[];
  counts: number[];
  sums: number[];
  totalPulls: number;
  cumulativeReward: number;
  cumulativeRegret: number;
  rngState: number;
  bestArm: number;
  bestMean: number;
}

export interface BanditCallResult {
  runId: string;
  strategy: BanditParams['strategy'];
  thisCall: { pulls: number; meanReward: number; chosenCounts: number[] };
  cumulative: { totalPulls: number; meanReward: number; regret: number };
  bestArm: number;
  bestMean: number;
  perArm: Array<{
    index: number;
    arm: BanditArm;
    trueMean: number;
    pulls: number;
    estimate: number;
  }>;
}

function armMean(arm: BanditArm): number {
  return arm.type === 'bernoulli' ? arm.p : arm.mu;
}

/** Samples one reward from the arm's distribution using the given RNG. */
function pullReward(arm: BanditArm, rng: SeededRng): number {
  if (arm.type === 'bernoulli') return rng.next() < arm.p ? 1 : 0;
  return gaussian(rng, arm.mu, arm.sigma);
}

/**
 * Thompson sampling score for one arm given its posterior:
 * - Bernoulli: Beta(1 + successes, 1 + failures)
 * - Gaussian: Normal(mu_hat, sigma / sqrt(n)) with a broad prior at n = 0
 */
function thompsonScore(arm: BanditArm, count: number, sum: number, rng: SeededRng): number {
  if (arm.type === 'bernoulli') {
    return sampleBeta(rng, 1 + sum, 1 + Math.max(0, count - sum));
  }
  const priorSd = arm.sigma * 10;
  const posteriorSd = count === 0 ? priorSd : arm.sigma / Math.sqrt(count);
  const mean = count === 0 ? 0 : sum / count;
  return mean + posteriorSd * gaussian(rng);
}

export function createBanditRun(params: BanditParams, runId: string, seed: number): BanditRunState {
  const means = params.arms.map(armMean);
  let bestArm = 0;
  for (let i = 1; i < means.length; i++) {
    if (means[i] > means[bestArm]) bestArm = i;
  }
  return {
    runId,
    arms: params.arms,
    counts: new Array<number>(params.arms.length).fill(0),
    sums: new Array<number>(params.arms.length).fill(0),
    totalPulls: 0,
    cumulativeReward: 0,
    cumulativeRegret: 0,
    rngState: seed >>> 0,
    bestArm,
    bestMean: means[bestArm]
  };
}

/**
 * Runs `pulls` additional pulls on the given run state, mutating it
 * (counts, sums, regret, RNG state). Returns the call + cumulative stats.
 */
export function runBanditCall(state: BanditRunState, params: BanditParams): BanditCallResult {
  const rng = createRng(state.rngState);
  const strategy = params.strategy;
  const chosenCounts = new Array<number>(state.arms.length).fill(0);
  let callReward = 0;

  for (let pull = 0; pull < params.pulls; pull++) {
    let chosen: number;

    if (strategy === 'thompson') {
      chosen = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < state.arms.length; i++) {
        const score = thompsonScore(state.arms[i], state.counts[i], state.sums[i], rng);
        if (score > bestScore) {
          bestScore = score;
          chosen = i;
        }
      }
    } else if (strategy === 'UCB') {
      chosen = -1;
      for (let i = 0; i < state.arms.length; i++) {
        if (state.counts[i] === 0) {
          chosen = i; // play every arm once first
          break;
        }
      }
      if (chosen === -1) {
        const logTotal = Math.log(state.totalPulls + 1);
        chosen = 0;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < state.arms.length; i++) {
          const mean = state.sums[i] / state.counts[i];
          const bonus = params.c * Math.sqrt((2 * logTotal) / state.counts[i]);
          const score = mean + bonus;
          if (score > bestScore) {
            bestScore = score;
            chosen = i;
          }
        }
      }
    } else {
      // epsilon-greedy
      if (state.totalPulls === 0 || rng.next() < params.epsilon) {
        chosen = Math.min(state.arms.length - 1, Math.floor(rng.next() * state.arms.length));
      } else {
        chosen = 0;
        let bestEstimate = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < state.arms.length; i++) {
          const estimate = state.sums[i] / state.counts[i];
          if (estimate > bestEstimate) {
            bestEstimate = estimate;
            chosen = i;
          }
        }
      }
    }

    const reward = pullReward(state.arms[chosen], rng);
    state.counts[chosen]++;
    state.sums[chosen] += reward;
    state.totalPulls++;
    state.cumulativeReward += reward;
    state.cumulativeRegret += state.bestMean - armMean(state.arms[chosen]);
    chosenCounts[chosen]++;
    callReward += reward;
  }

  state.rngState = rng.state();

  const perArm = state.arms.map((arm, i) => ({
    index: i,
    arm,
    trueMean: armMean(arm),
    pulls: state.counts[i],
    estimate: state.counts[i] === 0 ? 0 : state.sums[i] / state.counts[i]
  }));

  return {
    runId: state.runId,
    strategy,
    thisCall: {
      pulls: params.pulls,
      meanReward: callReward / params.pulls,
      chosenCounts
    },
    cumulative: {
      totalPulls: state.totalPulls,
      meanReward: state.cumulativeReward / state.totalPulls,
      regret: state.cumulativeRegret
    },
    bestArm: state.bestArm,
    bestMean: state.bestMean,
    perArm
  };
}

export function formatBanditSummary(result: BanditCallResult): string {
  const chosen = result.thisCall.chosenCounts
    .map((n, i) => (n > 0 ? `arm-${i}×${n}` : null))
    .filter((x): x is string => x !== null)
    .join(', ');
  return (
    `Bandit (${result.strategy}, ${result.perArm.length} arms): ` +
    `${result.thisCall.pulls} pulls this call [${chosen}], ` +
    `cumulative mean reward ${result.cumulative.meanReward.toFixed(3)} over ` +
    `${result.cumulative.totalPulls} pulls, regret ${result.cumulative.regret.toFixed(3)} ` +
    `(best arm: #${result.bestArm}, true mean ${result.bestMean})`
  );
}
