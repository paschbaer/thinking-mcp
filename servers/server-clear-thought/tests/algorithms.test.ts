import { describe, expect, it } from 'vitest';
import { createRng } from '../src/algorithms/rng.js';
import { mdpParamsSchema, solveMdp } from '../src/algorithms/mdp.js';
import { mctsParamsSchema, runMcts } from '../src/algorithms/mcts.js';
import {
  banditParamsSchema,
  createBanditRun,
  runBanditCall
} from '../src/algorithms/bandit.js';
import { hmmParamsSchema, inferHmm } from '../src/algorithms/hmm.js';
import {
  bayesoptParamsSchema,
  runBayesianOptimization
} from '../src/algorithms/bayesopt.js';
import { AlgorithmInputError, runAlgorithm } from '../src/algorithms/index.js';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('can be snapshotted and restored', () => {
    const rng = createRng(7);
    rng.next();
    rng.next();
    const snapshot = rng.state();
    const afterSnapshot1 = rng.next();
    rng.setState(snapshot);
    expect(rng.next()).toBe(afterSnapshot1);
  });
});

describe('mdp (value iteration)', () => {
  const toy = mdpParamsSchema.parse({
    states: ['poor', 'rich'],
    actions: ['work', 'slack'],
    transitions: [
      [
        [0, 1],
        [1, 0]
      ],
      [
        [0, 1],
        [0, 1]
      ]
    ],
    rewards: [
      [0, 0.1],
      [1, 1]
    ],
    gamma: 0.9
  });

  it('computes the hand-checkable value function and greedy policy', () => {
    const result = solveMdp(toy);
    // V(rich) = 1/(1-γ) = 10 (absorbing, reward 1); V(poor) = γ·V(rich) = 9.
    expect(result.valueFunction[0]).toBeCloseTo(9, 6);
    expect(result.valueFunction[1]).toBeCloseTo(10, 6);
    // In "poor", working (action 0) is strictly better than slacking.
    expect(result.policy[0]).toBe(0);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('rejects non-stochastic transition rows', () => {
    const broken = mdpParamsSchema.parse({
      ...toy,
      transitions: [
        [
          [0.5, 0.4],
          [1, 0]
        ],
        [
          [0, 1],
          [0, 1]
        ]
      ]
    });
    expect(() => solveMdp(broken)).toThrow(/row-stochastic/);
  });
});

describe('mcts (gridworld UCT)', () => {
  it('solves the 1×3 corridor towards the goal', () => {
    const result = runMcts(
      mctsParamsSchema.parse({
        environment: { rows: 1, cols: 3, start: [0, 0], goal: [0, 2], walls: [], traps: [] },
        simulations: 400,
        explorationConstant: 1.4,
        seed: 7
      })
    );
    expect(result.bestAction).toBe('right');
    expect(result.terminalStats.goalsReached).toBeGreaterThan(0);
    const right = result.root.find((entry) => entry.action === 'right');
    expect(right).toBeDefined();
    expect(right!.visits).toBeGreaterThan(0);
  });

  it('never reaches a walled-off goal', () => {
    const result = runMcts(
      mctsParamsSchema.parse({
        environment: {
          rows: 1,
          cols: 3,
          start: [0, 0],
          goal: [0, 2],
          walls: [[0, 1]],
          traps: []
        },
        simulations: 300,
        explorationConstant: 1.4,
        seed: 7
      })
    );
    expect(result.terminalStats.goalsReached).toBe(0);
    expect(result.root.length).toBeGreaterThan(0);
  });
});

describe('bandit (real pulls with persisted run state)', () => {
  const params = banditParamsSchema.parse({
    arms: [
      { type: 'bernoulli', p: 0.9 },
      { type: 'bernoulli', p: 0.1 }
    ],
    strategy: 'UCB',
    pulls: 100,
    seed: 11
  });

  it('converges on the better arm and accumulates state across calls', () => {
    const run = createBanditRun(params, 'bandit-test', params.seed);
    const first = runBanditCall(run, params);
    expect(first.runId).toBe('bandit-test');
    expect(first.cumulative.totalPulls).toBe(100);
    expect(first.perArm[0].pulls).toBeGreaterThan(first.perArm[1].pulls);
    expect(first.cumulative.regret).toBeGreaterThanOrEqual(0);

    const second = runBanditCall(run, { ...params, pulls: 50 });
    expect(second.cumulative.totalPulls).toBe(150);
    expect(second.bestArm).toBe(0);
  });

  it('estimates bernoulli means close to the true values', () => {
    const run = createBanditRun(params, 'bandit-est', params.seed);
    const result = runBanditCall(run, { ...params, pulls: 1000 });
    expect(result.perArm[0].estimate).toBeGreaterThan(0.8);
    expect(result.perArm[1].estimate).toBeLessThan(0.2);
  });

  // Pins the exact draw sequence baked into the rubric of
  // servers/server-clear-thought/evals/tasks-hard.json (vendor-bandit task).
  // If this test fails after an RNG change, regenerate that rubric's ground
  // truth by calling the real tools before trusting any eval run.
  it('pins the thompson/seed-7 80+60 continuation used by the hard eval rubric', () => {
    const params = banditParamsSchema.parse({
      arms: [
        { type: 'bernoulli', p: 0.28 },
        { type: 'bernoulli', p: 0.46 },
        { type: 'bernoulli', p: 0.35 }
      ],
      strategy: 'thompson',
      pulls: 80,
      seed: 7
    });
    const run = createBanditRun(params, 'bandit-1', params.seed);
    const first = runBanditCall(run, params);
    expect(first.runId).toBe('bandit-1');
    expect(first.cumulative.totalPulls).toBe(80);
    expect(first.cumulative.regret).toBeCloseTo(9.13, 2);

    const second = runBanditCall(run, { ...params, pulls: 60 });
    expect(second.cumulative.totalPulls).toBe(140);
    expect(second.cumulative.regret).toBeCloseTo(16.14, 2);
    expect(second.cumulative.meanReward).toBeCloseTo(0.271, 3);
    expect(second.perArm.map((a) => a.pulls)).toEqual([31, 13, 96]);
    expect(second.bestArm).toBe(1);
  });
});

describe('hmm (viterbi + forward-backward)', () => {
  const weather = {
    states: ['Rainy', 'Sunny'],
    observationSymbols: ['walk', 'shop', 'clean'],
    observations: ['walk', 'shop', 'clean'],
    transitions: [
      [0.7, 0.3],
      [0.4, 0.6]
    ],
    emissions: [
      [0.1, 0.4, 0.5],
      [0.6, 0.3, 0.1]
    ],
    initial: [0.6, 0.4],
    algorithm: 'both' as const
  };

  it('finds the known Viterbi path for the classic weather example', () => {
    const result = inferHmm(hmmParamsSchema.parse(weather));
    expect(result.viterbi?.path).toEqual(['Sunny', 'Rainy', 'Rainy']);
    expect(result.viterbi?.logProbability).toBeLessThan(0);
    expect(Number.isFinite(result.viterbi?.logProbability)).toBe(true);
  });

  it('produces normalized posteriors and a finite log-likelihood', () => {
    const result = inferHmm(hmmParamsSchema.parse(weather));
    const fb = result.forwardBackward!;
    expect(fb.gamma).toHaveLength(3);
    for (const row of fb.gamma) {
      expect(row.reduce((acc, x) => acc + x, 0)).toBeCloseTo(1, 9);
    }
    expect(fb.logLikelihood).toBeLessThan(0);
    expect(Number.isFinite(fb.logLikelihood)).toBe(true);
  });

  it('rejects unknown observation symbols', () => {
    expect(() =>
      inferHmm(hmmParamsSchema.parse({ ...weather, observations: ['walk', 'fly', 'clean'] }))
    ).toThrow(/not in observationSymbols/);
  });
});

describe('bayesian optimization (GP-RBF + Expected Improvement)', () => {
  it('proposes points near the maximum of a quadratic', () => {
    const result = runBayesianOptimization(
      bayesoptParamsSchema.parse({
        observations: [
          [0, -4],
          [1, -1],
          [3, -1],
          [4, -4]
        ],
        bounds: [0, 4],
        maximize: true
      })
    );
    expect(result.nextX).toBeGreaterThan(1);
    expect(result.nextX).toBeLessThan(3);
    expect(result.expectedImprovement).toBeGreaterThanOrEqual(0);
    expect(result.incumbent.y).toBe(-1);
  });

  it('supports minimization and rejects inverted bounds', () => {
    const minimized = runBayesianOptimization(
      bayesoptParamsSchema.parse({
        observations: [
          [0, 4],
          [2, 0],
          [4, 4]
        ],
        bounds: [0, 4],
        maximize: false
      })
    );
    expect(minimized.mode).toBe('minimize');
    expect(minimized.nextX).toBeGreaterThan(0);
    expect(minimized.nextX).toBeLessThan(4);

    expect(() =>
      runBayesianOptimization(
        bayesoptParamsSchema.parse({
          observations: [
            [0, 1],
            [1, 0]
          ],
          bounds: [4, 0]
        })
      )
    ).toThrow(/bounds/);
  });
});

describe('dispatcher (runAlgorithm)', () => {
  const ctx = { banditRuns: new Map() };

  it('throws AlgorithmInputError for missing model inputs', () => {
    expect(() => runAlgorithm('mdp', {}, ctx)).toThrow(AlgorithmInputError);
    expect(() => runAlgorithm('mdp', {}, ctx)).toThrow(/transitions/);
  });

  it('throws AlgorithmInputError for unknown algorithms', () => {
    expect(() => runAlgorithm('astrology', {}, ctx)).toThrow(/unknown algorithm/);
  });

  it('creates and continues bandit runs in the session store', () => {
    const runs = new Map();
    const arms = [
      { type: 'bernoulli', p: 0.9 },
      { type: 'bernoulli', p: 0.1 }
    ];
    const first = runAlgorithm(
      'bandit',
      { arms, strategy: 'UCB', pulls: 10, seed: 3 },
      { banditRuns: runs }
    );
    const runId = first.details.runId as string;
    expect(runs.has(runId)).toBe(true);

    const second = runAlgorithm(
      'bandit',
      { arms, strategy: 'UCB', pulls: 5, runId },
      { banditRuns: runs }
    );
    expect((second.details.cumulative as { totalPulls: number }).totalPulls).toBe(15);
  });
});
