/**
 * Real Markov Decision Process solver: value iteration with a derived
 * greedy policy. This replaces the former parameter-frame summary —
 * the numbers returned are measured solver output.
 */

import { z } from 'zod';

export const mdpParamsSchema = z.object({
  /** State names (strings) or just the number of states (indices used). */
  states: z.union([z.array(z.string().min(1)), z.number().int().positive()]).optional(),
  /** Action names (strings) or just the number of actions. */
  actions: z.union([z.array(z.string().min(1)), z.number().int().positive()]).optional(),
  /**
   * Transition probabilities: transitions[s][a][s'], row-stochastic per (s, a).
   */
  transitions: z.array(z.array(z.array(z.number().min(0).max(1)))).min(1),
  /** Immediate rewards: rewards[s][a]. */
  rewards: z.array(z.array(z.number())).min(1),
  gamma: z.number().min(0).max(1).default(0.9),
  /** Convergence tolerance on max |ΔV|. */
  theta: z.number().positive().default(1e-8),
  maxIterations: z.number().int().positive().default(1000)
});

export type MdpParams = z.infer<typeof mdpParamsSchema>;

export interface MdpResult {
  valueFunction: number[];
  /** Greedy policy as action indices. */
  policy: number[];
  iterations: number;
  convergenceDelta: number;
  converged: boolean;
  stateNames: string[];
  actionNames: string[];
}

const ROW_SUM_TOLERANCE = 1e-6;

function expandNames(
  spec: MdpParams['states'],
  fallbackCount: number,
  prefix: string
): string[] {
  if (Array.isArray(spec)) {
    if (spec.length !== fallbackCount) {
      throw new Error(
        `${prefix} names (${spec.length}) do not match the ${prefix} dimension (${fallbackCount})`
      );
    }
    return [...spec];
  }
  return Array.from({ length: fallbackCount }, (_, i) => `${prefix}-${i}`);
}

export function solveMdp(params: MdpParams): MdpResult {
  const { transitions, rewards, gamma, theta, maxIterations } = params;
  const nStates = transitions.length;
  const nActions = transitions[0]?.length ?? 0;

  if (nActions === 0) {
    throw new Error('transitions must contain at least one action');
  }
  if (rewards.length !== nStates) {
    throw new Error(
      `rewards has ${rewards.length} rows but transitions has ${nStates} states`
    );
  }

  for (let s = 0; s < nStates; s++) {
    if (transitions[s].length !== nActions) {
      throw new Error(
        `transitions[${s}] has ${transitions[s].length} actions, expected ${nActions}`
      );
    }
    if (rewards[s].length !== nActions) {
      throw new Error(
        `rewards[${s}] has ${rewards[s].length} actions, expected ${nActions}`
      );
    }
    for (let a = 0; a < nActions; a++) {
      const row = transitions[s][a];
      if (row.length !== nStates) {
        throw new Error(
          `transitions[${s}][${a}] has ${row.length} entries, expected ${nStates} (square over states)`
        );
      }
      const sum = row.reduce((acc, p) => acc + p, 0);
      if (Math.abs(sum - 1) > ROW_SUM_TOLERANCE) {
        throw new Error(
          `transitions[${s}][${a}] is not row-stochastic (sum=${sum.toFixed(8)}, tolerance=${ROW_SUM_TOLERANCE})`
        );
      }
    }
  }

  const stateNames = expandNames(params.states, nStates, 'state');
  const actionNames = expandNames(params.actions, nActions, 'action');

  // Value iteration
  let v = new Array<number>(nStates).fill(0);
  let iterations = 0;
  let delta = Number.POSITIVE_INFINITY;
  let converged = false;

  while (iterations < maxIterations) {
    const vNext = new Array<number>(nStates).fill(0);
    for (let s = 0; s < nStates; s++) {
      let best = Number.NEGATIVE_INFINITY;
      for (let a = 0; a < nActions; a++) {
        let q = rewards[s][a];
        for (let s2 = 0; s2 < nStates; s2++) {
          const p = transitions[s][a][s2];
          if (p !== 0) q += gamma * p * v[s2];
        }
        if (q > best) best = q;
      }
      vNext[s] = best;
    }
    delta = 0;
    for (let s = 0; s < nStates; s++) {
      delta = Math.max(delta, Math.abs(vNext[s] - v[s]));
    }
    v = vNext;
    iterations++;
    if (delta < theta) {
      converged = true;
      break;
    }
  }

  // Greedy policy extraction
  const policy = new Array<number>(nStates).fill(0);
  for (let s = 0; s < nStates; s++) {
    let best = Number.NEGATIVE_INFINITY;
    let bestAction = 0;
    for (let a = 0; a < nActions; a++) {
      let q = rewards[s][a];
      for (let s2 = 0; s2 < nStates; s2++) {
        const p = transitions[s][a][s2];
        if (p !== 0) q += gamma * p * v[s2];
      }
      if (q > best) {
        best = q;
        bestAction = a;
      }
    }
    policy[s] = bestAction;
  }

  return {
    valueFunction: v,
    policy,
    iterations,
    convergenceDelta: delta,
    converged,
    stateNames,
    actionNames
  };
}

export function formatMdpSummary(result: MdpResult, gamma: number): string {
  const policyPairs = result.policy
    .map((a, s) => `${result.stateNames[s]}→${result.actionNames[a]}`)
    .join(', ');
  return (
    `Value iteration ${result.converged ? 'converged' : 'stopped at maxIterations'} ` +
    `after ${result.iterations} iterations (Δ=${result.convergenceDelta.toExponential(2)}, γ=${gamma}); ` +
    `greedy policy: ${policyPairs}`
  );
}
