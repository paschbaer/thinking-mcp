import { describe, it, expect } from 'vitest';
import {
  assertTransition,
  isAllowedTransition,
  isTerminal,
  nextProgressionState,
  InvalidTransitionError,
} from '../../src/domain/state-machine.ts';
import type { EpisodeState } from '../../src/domain/types.ts';

describe('episode state machine (FR-019)', () => {
  it('allows the full active progression', () => {
    const path: EpisodeState[] = [
      'DRAFT', 'OBSERVED', 'DIAGNOSING', 'SOLUTION_PROPOSED',
      'VALIDATING', 'LOCALLY_VERIFIED', 'REPRODUCED', 'CROSS_PROJECT_VERIFIED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('allows any active state to reach any terminal state', () => {
    const terminals: EpisodeState[] = [
      'UNRESOLVED', 'PARTIALLY_VERIFIED', 'NEEDS_REVIEW', 'CONTRADICTED',
      'INVALIDATED', 'DEPRECATED', 'SUPERSEDED',
    ];
    for (const from of ['DRAFT', 'DIAGNOSING', 'VALIDATING'] as EpisodeState[]) {
      for (const to of terminals) {
        expect(isAllowedTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects skipping progression steps', () => {
    expect(() => assertTransition('DRAFT', 'DIAGNOSING')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('OBSERVED', 'LOCALLY_VERIFIED')).toThrow(InvalidTransitionError);
  });

  it('rejects transitions out of terminal states and self-transitions', () => {
    expect(isTerminal('UNRESOLVED')).toBe(true);
    expect(() => assertTransition('UNRESOLVED', 'DIAGNOSING')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('DRAFT', 'DRAFT')).toThrow(InvalidTransitionError);
  });

  it('supports regression path: LOCALLY_VERIFIED -> CONTRADICTED', () => {
    expect(() => assertTransition('LOCALLY_VERIFIED', 'CONTRADICTED')).not.toThrow();
  });

  it('nextProgressionState matches progression', () => {
    expect(nextProgressionState('DRAFT')).toBe('OBSERVED');
    expect(nextProgressionState('CROSS_PROJECT_VERIFIED')).toBeNull();
  });
});
