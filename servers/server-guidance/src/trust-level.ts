/**
 * Shared trustLevel normalization (WC-1 hardening): the config validator and
 * the runtime egress path MUST agree on what an absent or unknown trustLevel
 * means, otherwise validation and enforcement diverge silently.
 */
import type { TrustLevel } from "./types/index.js";

export const TRUST_LEVELS: readonly TrustLevel[] = [
  "untrusted",
  "restricted",
  "trusted",
  "privileged",
];

/** Warn-once memory: a misconfiguration should not warn on every call. */
const trustLevelWarned = new Set<string>();

/** Normalizes a configured trustLevel to the TrustLevel union; unknown values fall back to "trusted". */
export function toTrustLevel(
  value: string | undefined,
  serverId?: string,
): TrustLevel {
  if (value !== undefined && !TRUST_LEVELS.includes(value as TrustLevel)) {
    const key = `${serverId ?? "?"}:${value}`;
    if (!trustLevelWarned.has(key)) {
      trustLevelWarned.add(key);
      process.stderr.write(
        `[guidance] warning: unknown trustLevel "${value}" for server ${serverId ?? "?"}; falling back to "trusted"\n`,
      );
    }
  }
  return TRUST_LEVELS.includes(value as TrustLevel)
    ? (value as TrustLevel)
    : "trusted";
}
