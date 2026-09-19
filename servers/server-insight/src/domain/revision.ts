/**
 * Revision semantics (research.md D2 / spec FR-029):
 * monotonic per-workflow integer starting at 1; mutations require
 * expected_revision; mismatch => recoverable STALE_REVISION.
 */

export class StaleRevisionError extends Error {
  public readonly code = 'STALE_REVISION';
  public readonly retryable = false;
  constructor(
    public readonly expected: number,
    public readonly current_revision: number
  ) {
    super(`Stale revision: expected ${expected}, current ${current_revision}`);
    this.name = 'StaleRevisionError';
  }
}

export function initialRevision(): number {
  return 1;
}

export function nextRevision(current: number): number {
  return current + 1;
}

/** Assert the caller's expected revision matches; throw otherwise. */
export function assertExpectedRevision(expected: number | undefined, current: number): void {
  if (expected !== current) throw new StaleRevisionError(expected ?? -1, current);
}
