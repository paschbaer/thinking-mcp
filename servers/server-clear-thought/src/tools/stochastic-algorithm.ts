import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { AlgorithmInputError, runAlgorithm } from '../algorithms/index.js';

/**
 * Stochastic decision algorithms (merged from server-stochasticthinking —
 * plan `memory-bank/plans/merge-stochastic-into-clear-thought.md`).
 *
 * Dual registration (systemPatterns #1): the individual tool keeps its
 * historical name `stochasticalgorithm` and its `{ algorithm, ... }` shape so
 * existing stochastic-server clients migrate without call-site changes; the
 * grouped `stochastic` toolset exposes the same computations behind the
 * conventional `operation` discriminator (see src/toolsets/stochastic.ts).
 */

export const stochasticInputShape = {
  algorithm: z
    .enum(['mdp', 'mcts', 'bandit', 'bayesian', 'hmm'])
    .describe('Decision algorithm to apply'),
  problem: z
    .string()
    .describe('Concrete decision problem statement (context; not used by the math)'),
  parameters: z
    .record(z.unknown())
    .describe(
      'Algorithm-specific model inputs — see the parameter tables in the README/guide (transitions/rewards for mdp, environment for mcts, arms for bandit, observations/bounds for bayesian, matrices + sequence for hmm)'
    ),
  result: z
    .string()
    .optional()
    .describe('Reserved for future use; accepted but not required by the real algorithms')
};

export interface StochasticToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Runs one algorithm call and builds the MCP result object. Shared by the
 * individual tool and every toolset operation so both call paths stay
 * behaviorally identical (Tier-1 contract: individual ≡ toolset).
 */
export function callStochasticAlgorithm(
  algorithm: string,
  parameters: unknown,
  sessionState: SessionState
): StochasticToolResult {
  try {
    const { summary, details } = runAlgorithm(algorithm, parameters, {
      banditRuns: sessionState.getBanditRuns()
    });
    const payload = { algorithm, status: 'success', summary, hasResult: true, details };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload
    };
  } catch (error) {
    if (!(error instanceof AlgorithmInputError)) throw error;
    const payload = {
      algorithm,
      status: 'failed',
      summary: '',
      hasResult: false,
      details: { error: error.message }
    };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload
    };
  }
}

export function registerStochasticAlgorithm(server: McpServer, sessionState: SessionState): void {
  server.tool(
    'stochasticalgorithm',
    'Runs stochastic decision algorithms with real, measured computations: ' +
      'mdp (value iteration over explicit transition/reward models), mcts (UCT search on a ' +
      'deterministic gridworld), bandit (real pulls with per-session run state via runId and ' +
      'measurable regret), bayesian (Gaussian-process posterior + Expected Improvement), ' +
      'hmm (Viterbi and forward-backward over explicit matrices). Summaries contain the ' +
      'measured numbers; results hold only under the modeled assumptions.',
    stochasticInputShape,
    async ({ algorithm, parameters }) => callStochasticAlgorithm(algorithm, parameters, sessionState)
  );
}
