/**
 * Real Monte Carlo Tree Search (UCT) over a built-in deterministic
 * gridworld environment. v1 ships the environment inside the server
 * (deterministic, testable); an "agent-as-environment" contract is a
 * documented future extension.
 */

import { z } from 'zod';
import { createRng, sampleInteger, type SeededRng } from './rng.js';

const ACTION_NAMES = ['up', 'right', 'down', 'left'] as const;
export type GridAction = (typeof ACTION_NAMES)[number];

const ACTION_DELTAS: Array<[number, number]> = [
  [-1, 0], // up
  [0, 1], // right
  [1, 0], // down
  [0, -1] // left
];

export const mctsParamsSchema = z.object({
  environment: z.object({
    rows: z.number().int().min(1).max(50),
    cols: z.number().int().min(1).max(50),
    /** Zero-based [row, col]. */
    start: z.tuple([z.number().int(), z.number().int()]),
    goal: z.tuple([z.number().int(), z.number().int()]),
    walls: z.array(z.tuple([z.number().int(), z.number().int()])).default([]),
    traps: z.array(z.tuple([z.number().int(), z.number().int()])).default([]),
    goalReward: z.number().default(1),
    trapReward: z.number().default(-1),
    stepReward: z.number().default(-0.01),
    maxSteps: z.number().int().positive().optional()
  }),
  simulations: z.number().int().positive().default(1000),
  /** UCT exploration constant. */
  explorationConstant: z.number().positive().default(1.4),
  seed: z.number().int().default(42)
});

export type MctsParams = z.infer<typeof mctsParamsSchema>;

export interface MctsResult {
  bestAction: GridAction;
  bestActionIndex: number;
  root: Array<{ action: GridAction; visits: number; meanValue: number }>;
  simulations: number;
  terminalStats: { goalsReached: number; trapsHit: number; timeouts: number };
  grid: { rows: number; cols: number };
}

interface MctsNode {
  cell: number; // r * cols + c
  visits: number;
  value: number;
  untried: number[]; // action indices
  children: Map<number, MctsNode>;
}

function isBlocked(
  walls: Array<readonly [number, number]>,
  r: number,
  c: number
): boolean {
  return walls.some(([wr, wc]) => wr === r && wc === c);
}

function isTrap(traps: Array<readonly [number, number]>, r: number, c: number): boolean {
  return traps.some(([tr, tc]) => tr === r && tc === c);
}

interface StepOutcome {
  cell: number;
  reward: number;
  terminal: false | 'goal' | 'trap';
}

function makeStepper(env: MctsParams['environment']) {
  const maxSteps = env.maxSteps ?? env.rows * env.cols * 2;
  const wallSet = new Set(env.walls.map(([r, c]) => r * env.cols + c));
  const trapSet = new Set(env.traps.map(([r, c]) => r * env.cols + c));
  const goalCell = env.goal[0] * env.cols + env.goal[1];

  return function step(cell: number, actionIndex: number, stepsSoFar: number): StepOutcome {
    const r = Math.floor(cell / env.cols);
    const c = cell % env.cols;
    const [dr, dc] = ACTION_DELTAS[actionIndex];
    const nr = Math.min(env.rows - 1, Math.max(0, r + dr));
    const nc = Math.min(env.cols - 1, Math.max(0, c + dc));
    let next = nr * env.cols + nc;
    if (wallSet.has(next)) {
      next = cell; // blocked: stay in place
    }
    if (next === goalCell) {
      return { cell: next, reward: env.goalReward, terminal: 'goal' };
    }
    if (trapSet.has(next)) {
      return { cell: next, reward: env.trapReward, terminal: 'trap' };
    }
    if (stepsSoFar + 1 >= maxSteps) {
      return { cell: next, reward: env.stepReward, terminal: false };
    }
    return { cell: next, reward: env.stepReward, terminal: false };
  };
}

function maxStepsOf(env: MctsParams['environment']): number {
  return env.maxSteps ?? env.rows * env.cols * 2;
}

export function runMcts(params: MctsParams): MctsResult {
  const { environment: env, simulations, explorationConstant, seed } = params;
  const step = makeStepper(env);
  const maxSteps = maxStepsOf(env);
  const startCell = env.start[0] * env.cols + env.start[1];
  const goalCell = env.goal[0] * env.cols + env.goal[1];
  const trapSet = new Set(env.traps.map(([r, c]) => r * env.cols + c));
  const rng: SeededRng = createRng(seed);

  const newNode = (cell: number): MctsNode => ({
    cell,
    visits: 0,
    value: 0,
    untried: [0, 1, 2, 3],
    children: new Map()
  });

  const root = newNode(startCell);
  const terminalStats = { goalsReached: 0, trapsHit: 0, timeouts: 0 };

  for (let sim = 0; sim < simulations; sim++) {
    let node = root;
    let cell = startCell;
    const path: MctsNode[] = [node];
    let totalReturn = 0;
    let steps = 0;
    let terminal: StepOutcome['terminal'] = false;

    // Selection: descend fully expanded, non-terminal nodes via UCT.
    while (node.untried.length === 0 && node.children.size > 0) {
      const logParent = Math.log(node.visits + 1);
      let bestAction = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const [actionIndex, child] of node.children) {
        const score =
          child.value / child.visits +
          explorationConstant * Math.sqrt(logParent / child.visits);
        if (score > bestScore) {
          bestScore = score;
          bestAction = actionIndex;
        }
      }
      const outcome = step(cell, bestAction, steps);
      totalReturn += outcome.reward;
      cell = outcome.cell;
      steps++;
      terminal = outcome.terminal;
      node = node.children.get(bestAction)!;
      path.push(node);
      if (terminal) break;
    }

    // Expansion: add one random untried child if not terminal.
    if (!terminal && node.untried.length > 0) {
      const pick = sampleInteger(rng, node.untried.length);
      const actionIndex = node.untried.splice(pick, 1)[0];
      const outcome = step(cell, actionIndex, steps);
      totalReturn += outcome.reward;
      cell = outcome.cell;
      steps++;
      terminal = outcome.terminal;
      const child = newNode(outcome.cell);
      node.children.set(actionIndex, child);
      node = child;
      path.push(child);
    }

    // Simulation: uniform random rollout to a terminal state or step limit.
    while (!terminal && steps < maxSteps) {
      const outcome = step(cell, sampleInteger(rng, 4), steps);
      totalReturn += outcome.reward;
      cell = outcome.cell;
      steps++;
      terminal = outcome.terminal;
    }
    if (terminal === 'goal') terminalStats.goalsReached++;
    else if (terminal === 'trap') terminalStats.trapsHit++;
    else terminalStats.timeouts++;

    // Backpropagation: undiscounted return for every node on the path.
    for (const visited of path) {
      visited.visits++;
      visited.value += totalReturn;
    }
  }

  // Robust child: most visited action at the root.
  let bestActionIndex = 0;
  let bestVisits = -1;
  const rootStats: MctsResult['root'] = [];
  for (let a = 0; a < 4; a++) {
    const child = root.children.get(a);
    if (!child) continue;
    rootStats.push({
      action: ACTION_NAMES[a],
      visits: child.visits,
      meanValue: child.value / child.visits
    });
    if (child.visits > bestVisits) {
      bestVisits = child.visits;
      bestActionIndex = a;
    }
  }
  rootStats.sort((x, y) => y.visits - x.visits);

  if (rootStats.length === 0) {
    throw new Error('MCTS produced no root actions — check the environment definition');
  }

  return {
    bestAction: ACTION_NAMES[bestActionIndex],
    bestActionIndex,
    root: rootStats,
    simulations,
    terminalStats,
    grid: { rows: env.rows, cols: env.cols }
  };
}

export function formatMctsSummary(result: MctsResult): string {
  const top = result.root[0];
  return (
    `MCTS gridworld (${result.grid.rows}×${result.grid.cols}): ` +
    `${result.simulations} simulations, best action "${result.bestAction}" ` +
    `(${top.visits} visits, mean value ${top.meanValue.toFixed(3)}); ` +
    `rollout outcomes: ${result.terminalStats.goalsReached} goal, ` +
    `${result.terminalStats.trapsHit} trap, ${result.terminalStats.timeouts} timeout`
  );
}
