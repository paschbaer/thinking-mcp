import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { ToolsetRegistry } from './registry.js';
import { callStochasticAlgorithm } from '../tools/stochastic-algorithm.js';

/**
 * `stochastic` toolset — grouped dispatch for the merged stochastic
 * algorithms (plan `memory-stochastic-into-clear-thought`, phase 1). The
 * operations mirror the individual `stochasticalgorithm` tool with the
 * conventional `operation` discriminator instead of the `algorithm` field.
 * Bandit runs live in the shared session state, so runId continuation works
 * across BOTH call paths.
 */

type AlgorithmOp = 'mdp' | 'mcts' | 'bandit' | 'bayesian' | 'hmm';

const ALGORITHMS: Array<{ name: AlgorithmOp; description: string }> = [
  {
    name: 'mdp',
    description:
      'Markov Decision Process: value iteration over an explicit transition/reward model → value function + greedy policy'
  },
  {
    name: 'mcts',
    description:
      'Monte Carlo Tree Search: UCT search on a deterministic gridworld → visit counts + mean values per root action'
  },
  {
    name: 'bandit',
    description:
      'Multi-Armed Bandit: real pulls (epsilon-greedy/UCB/Thompson) with per-session run state (runId) and measurable regret'
  },
  {
    name: 'bayesian',
    description:
      'Bayesian Optimization: Gaussian-process posterior (RBF) + Expected Improvement over observed points'
  },
  {
    name: 'hmm',
    description:
      'Hidden Markov Model: Viterbi (log-space) and scaled forward-backward over explicit matrices'
  }
];

const stochasticOperationSchema = {
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

export function registerStochasticToolset(server: McpServer, state: SessionState): void {
  const registry = new ToolsetRegistry(
    'stochastic',
    'Stochastic decision algorithms with real, measured computations (mdp, mcts, bandit, bayesian, hmm)'
  );
  for (const algo of ALGORITHMS) {
    registry.addOperation({
      name: algo.name,
      description: algo.description,
      schema: stochasticOperationSchema,
      handler: async (data: { parameters: unknown }) =>
        callStochasticAlgorithm(algo.name, data.parameters, state)
    });
  }
  registry.register(server);
}
