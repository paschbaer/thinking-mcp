/**
 * Episode state machine (spec FR-019; data-model.md).
 * Valid transitions are exhaustive; anything else is INVALID_TRANSITION.
 */
import { ACTIVE_PROGRESSION, TERMINAL_STATES, type EpisodeState } from './types.js';

const PROGRESSION_EDGES: Record<string, EpisodeState> = {
  DRAFT: 'OBSERVED',
  OBSERVED: 'DIAGNOSING',
  DIAGNOSING: 'SOLUTION_PROPOSED',
  SOLUTION_PROPOSED: 'VALIDATING',
  VALIDATING: 'LOCALLY_VERIFIED',
  LOCALLY_VERIFIED: 'REPRODUCED',
  REPRODUCED: 'CROSS_PROJECT_VERIFIED',
};

/** States reachable from any non-terminal state. */
const TERMINAL_TARGETS = new Set(TERMINAL_STATES);

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: EpisodeState,
    public readonly to: EpisodeState
  ) {
    super(`Invalid episode state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function isTerminal(state: EpisodeState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function isAllowedTransition(from: EpisodeState, to: EpisodeState): boolean {
  if (isTerminal(from)) return false;
  if (from === to) return false;
  if (TERMINAL_TARGETS.has(to)) return true;
  return PROGRESSION_EDGES[from] === to;
}

/** Assert a transition is legal; throw recoverable INVALID_TRANSITION otherwise. */
export function assertTransition(from: EpisodeState, to: EpisodeState): void {
  if (!isAllowedTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Allowed progression next step (may be null in terminal/terminal-ready states). */
export function nextProgressionState(from: EpisodeState): EpisodeState | null {
  return PROGRESSION_EDGES[from] ?? null;
}

/** Which observation/capture action advances the given state (guidance engine). */
export function stateRequirements(state: EpisodeState): string[] {
  switch (state) {
    case 'DRAFT':
      return ['failure observation', 'environment facts'];
    case 'OBSERVED':
      return ['hypothesis or diagnostic attempt'];
    case 'DIAGNOSING':
      return ['solution with mechanism, prerequisites, validation plan'];
    case 'SOLUTION_PROPOSED':
      return ['validation run against original failure'];
    case 'VALIDATING':
      return ['passing original-failure + regression runs with evidence'];
    default:
      return [];
  }
}

export { ACTIVE_PROGRESSION };
