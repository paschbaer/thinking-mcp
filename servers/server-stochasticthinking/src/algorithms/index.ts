/**
 * Dispatcher for the real algorithm implementations. Validates the
 * per-algorithm `parameters` object, runs the computation and returns a
 * one-line measured summary plus the structured details payload.
 */

import { z } from 'zod';
import {
  mdpParamsSchema,
  solveMdp,
  formatMdpSummary,
  type MdpResult
} from './mdp.js';
import {
  mctsParamsSchema,
  runMcts,
  formatMctsSummary,
  type MctsResult
} from './mcts.js';
import {
  banditParamsSchema,
  createBanditRun,
  runBanditCall,
  formatBanditSummary,
  type BanditRunState
} from './bandit.js';
import { hmmParamsSchema, inferHmm, formatHmmSummary, type HmmResult } from './hmm.js';
import {
  bayesoptParamsSchema,
  runBayesianOptimization,
  formatBayesOptSummary,
  type BayesOptResult
} from './bayesopt.js';

export { mdpParamsSchema, mctsParamsSchema, banditParamsSchema, hmmParamsSchema, bayesoptParamsSchema };
export type { MdpResult, MctsResult, BanditRunState, HmmResult, BayesOptResult };

export const ALGORITHM_NAMES = ['mdp', 'mcts', 'bandit', 'bayesian', 'hmm'] as const;
export type AlgorithmName = (typeof ALGORITHM_NAMES)[number];

/** Thrown for any invalid/insufficient algorithm input (→ isError result). */
export class AlgorithmInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlgorithmInputError';
  }
}

const EXPECTED_PARAMETERS: Record<AlgorithmName, string> = {
  mdp: 'transitions[s][a][s′] (row-stochastic), rewards[s][a], optional states/actions name arrays, gamma (0–1), theta, maxIterations',
  mcts: 'environment { rows, cols, start:[r,c], goal:[r,c], walls?, traps?, goalReward?, trapReward?, stepReward?, maxSteps? }, simulations, explorationConstant, seed',
  bandit: 'arms [{type:"bernoulli", p} | {type:"gaussian", mu, sigma}] (≥2), strategy "epsilon-greedy"|"UCB"|"thompson", epsilon, c, pulls, seed, optional runId (continue a session run)',
  bayesian: 'observations [[x, y], …] (≥2), bounds [lo, hi], lengthscale?, noise?, gridPoints?, maximize?',
  hmm: 'states, observationSymbols, observations (sequence), transitions A[si][sj], emissions B[si][oi], initial π, algorithm "viterbi"|"forward-backward"|"both"'
};

export interface AlgorithmRunContext {
  /** Per-session bandit run store (owned by the server factory). */
  banditRuns: Map<string, BanditRunState>;
}

export interface AlgorithmOutcome {
  /** One-line, human-readable summary containing the measured numbers. */
  summary: string;
  /** Structured artifacts of the computation (returned as `details`). */
  details: Record<string, unknown>;
}

function parseParameters<T extends z.ZodTypeAny>(
  algorithm: AlgorithmName,
  schema: T,
  parameters: unknown
): z.infer<T> {
  const parsed = schema.safeParse(parameters ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new AlgorithmInputError(
      `invalid ${algorithm} parameters — expected: ${EXPECTED_PARAMETERS[algorithm]}. Issues: ${issues}`
    );
  }
  return parsed.data;
}

export function runAlgorithm(
  algorithm: string,
  parameters: unknown,
  ctx: AlgorithmRunContext
): AlgorithmOutcome {
  switch (algorithm) {
    case 'mdp': {
      const params = parseParameters('mdp', mdpParamsSchema, parameters);
      const result = solveMdp(params);
      return {
        summary: formatMdpSummary(result, params.gamma),
        details: { ...result }
      };
    }
    case 'mcts': {
      const params = parseParameters('mcts', mctsParamsSchema, parameters);
      const result = runMcts(params);
      return {
        summary: formatMctsSummary(result),
        details: { ...result }
      };
    }
    case 'bandit': {
      const params = parseParameters('bandit', banditParamsSchema, parameters);
      let run = params.runId ? ctx.banditRuns.get(params.runId) : undefined;
      if (run && JSON.stringify(run.arms) !== JSON.stringify(params.arms)) {
        throw new AlgorithmInputError(
          `bandit run "${params.runId}" exists with a different arm configuration ` +
            `(stored: ${JSON.stringify(run.arms)}); omit runId to start a new run`
        );
      }
      if (!run) {
        const runId = params.runId ?? `bandit-${ctx.banditRuns.size + 1}`;
        if (ctx.banditRuns.has(runId)) {
          throw new AlgorithmInputError(
            `bandit run "${runId}" already exists with a different configuration; choose another runId`
          );
        }
        run = createBanditRun(params, runId, params.seed);
        ctx.banditRuns.set(runId, run);
      }
      const result = runBanditCall(run, params);
      return {
        summary: formatBanditSummary(result),
        details: { ...result }
      };
    }
    case 'bayesian': {
      const params = parseParameters('bayesian', bayesoptParamsSchema, parameters);
      const result = runBayesianOptimization(params);
      return {
        summary: formatBayesOptSummary(result),
        details: { ...result }
      };
    }
    case 'hmm': {
      const params = parseParameters('hmm', hmmParamsSchema, parameters);
      const result = inferHmm(params);
      return {
        summary: formatHmmSummary(result),
        details: { ...result }
      };
    }
    default:
      throw new AlgorithmInputError(
        `unknown algorithm "${String(algorithm)}" — expected one of: ${ALGORITHM_NAMES.join(', ')}`
      );
  }
}
