import { describe, it, expect } from 'vitest';
import {
  assertExpectedRevision,
  initialRevision,
  nextRevision,
  StaleRevisionError,
} from '../../src/domain/revision.ts';

describe('revision semantics (D2 / FR-029)', () => {
  it('starts at 1 and increments monotonically', () => {
    expect(initialRevision()).toBe(1);
    expect(nextRevision(1)).toBe(2);
    expect(nextRevision(41)).toBe(42);
  });

  it('accepts exact expected revision', () => {
    expect(() => assertExpectedRevision(3, 3)).not.toThrow();
  });

  it('rejects stale and future revisions with STALE_REVISION + current', () => {
    try {
      assertExpectedRevision(1, 3);
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StaleRevisionError);
      expect((e as StaleRevisionError).code).toBe('STALE_REVISION');
      expect((e as StaleRevisionError).current_revision).toBe(3);
    }
    expect(() => assertExpectedRevision(5, 3)).toThrow(StaleRevisionError);
  });

  it('rejects missing expected revision', () => {
    expect(() => assertExpectedRevision(undefined, 1)).toThrow(StaleRevisionError);
  });
});
