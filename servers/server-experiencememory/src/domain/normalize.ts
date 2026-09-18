/**
 * Failure normalization (spec §13.3 analogue): canonical, stable, hashable
 * representation. Raw redacted content is retained separately by callers.
 */
import { createHash } from 'node:crypto';

export interface NormalizedFailure {
  normalized: string;
  normalized_hash: string;
  exit_code?: number;
  exact_tokens: string[];
}

const TIMESTAMP_PATTERNS: RegExp[] = [
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
  /\b(?:\d{1,2}:){2}\d{2}(?:\.\d+)?\b/g,
];
const VOLATILE_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HOME_PATH = /(?:\/home\/[\w.-]+|\/Users\/[\w.-]+|C:\\Users\\[\w.-]+)/g;

export function normalizeFailure(
  content: string,
  knownExactTokens: string[] = [],
  exitCodeHint?: number
): NormalizedFailure {
  let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const p of TIMESTAMP_PATTERNS) normalized = normalized.replace(p, '<timestamp>');
  normalized = normalized.replace(VOLATILE_ID, '<uuid>');
  normalized = normalized.replace(HOME_PATH, '<home>');

  // Preserve exact rare tokens (never normalized away)
  const exact_tokens = [...new Set([...knownExactTokens])].filter((t) => normalized.includes(t) || content.includes(t));

  let exit_code = exitCodeHint;
  if (exit_code === undefined) {
    const m = normalized.match(/exit(?:ed)?(?: with)?(?: code)?\s+(\d{1,4})/i) || normalized.match(/\bexit code:\s*(\d{1,4})\b/i);
    if (m) exit_code = Number(m[1]);
  }

  const canonical = JSON.stringify({ normalized, exit_code: exit_code ?? null, exact_tokens });
  const normalized_hash = 'sha256:' + createHash('sha256').update(canonical).digest('hex');
  return { normalized, normalized_hash, exit_code, exact_tokens };
}
