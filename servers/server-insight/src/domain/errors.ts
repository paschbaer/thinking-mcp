/**
 * Error contract (contracts/tools.md): every recoverable error carries
 * code/message/retryable/details and pairs with a guidance envelope.
 */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'STALE_REVISION'
  | 'INVALID_TRANSITION'
  | 'MISSING_REQUIRED_EVIDENCE'
  | 'ARTIFACT_REJECTED'
  | 'ARTIFACT_HASH_MISMATCH'
  | 'DUPLICATE_IDEMPOTENCY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class EmmsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'EmmsError';
  }
}

export function invalidRequest(message: string, details?: Record<string, unknown>) {
  return new EmmsError('INVALID_REQUEST', message, false, details);
}

export function missingEvidence(missing: string[]) {
  return new EmmsError('MISSING_REQUIRED_EVIDENCE', 'Missing required evidence', true, { missing });
}

export function artifactRejected(reasons: string[]) {
  return new EmmsError('ARTIFACT_REJECTED', 'Artifact rejected', false, { reasons });
}

export function duplicateIdempotency(original: unknown) {
  return new EmmsError('DUPLICATE_IDEMPOTENCY', 'Duplicate idempotency key', false, { original });
}

export function internalError(message: string) {
  return new EmmsError('INTERNAL_ERROR', message, true);
}
