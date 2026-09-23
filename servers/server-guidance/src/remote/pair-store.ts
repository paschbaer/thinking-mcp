/**
 * FR-101: Key/Token-Pair-Verwaltung für den Remote-Modus (optional).
 * Tokens werden nur als SHA-256-Hash persistiert/verglichen (FR-101.2/101.3).
 * Keine Pairs konfiguriert ⇒ anonymer Fallback (FR-101.6).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export interface KeyTokenPair {
  key: string;
  /** Klartext nur in Env/Datei; im Store wird nur der Hash geführt. */
  token: string;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** FR-101.3: timing-safe Token-Vergleich über konstantlange Digests. */
export function tokenMatches(provided: string, expectedHashHex: string): boolean {
  // Beide Seiten als 32-Byte-Digest (hex-decodiert) — gleiche Länge ist
  // Voraussetzung für timingSafeEqual (wirft sonst RangeError).
  const a = new Uint8Array(Buffer.from(hashToken(provided), "hex"));
  const b = new Uint8Array(Buffer.from(expectedHashHex, "hex"));
  return timingSafeEqual(a, b);
}

export class PairStore {
  private readonly byKey = new Map<string, { tokenHash: string }>();

  constructor(pairs: KeyTokenPair[]) {
    for (const pair of pairs) {
      if (!KEY_PATTERN.test(pair.key)) {
        throw new Error(`configuration_invalid: GUIDANCE_KEY_TOKENS key must match ${KEY_PATTERN.source}`);
      }
      if (this.byKey.has(pair.key)) {
        throw new Error(`configuration_invalid: GUIDANCE_KEY_TOKENS duplicate key`);
      }
      this.byKey.set(pair.key, { tokenHash: hashToken(pair.token) });
    }
  }

  get configured(): boolean {
    return this.byKey.size > 0;
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }

  /** FR-102.1: Pair-Lookup — passt (key, token) zu einem konfigurierten Pair? */
  authenticate(key: string, token: string): boolean {
    const entry = this.byKey.get(key);
    return entry !== undefined && tokenMatches(token, entry.tokenHash);
  }

  /** FR-101.7: Ist der präsentierte Bearer-Token irgendein gültiger Pair-Token? */
  isKnownToken(token: string): boolean {
    const h = hashToken(token);
    for (const { tokenHash } of this.byKey.values()) {
      if (timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(tokenHash, "hex"))) return true;
    }
    return false;
  }
}

/**
 * FR-101: Pair-Array aus Env/Datei laden. Formate:
 *   GUIDANCE_KEY_TOKENS='[{"key":"a","token":"…"},…]'
 *   GUIDANCE_KEY_TOKENS_FILE=/path/to/pairs.json (gleiches Schema)
 */
export async function loadPairsFromEnv(): Promise<KeyTokenPair[]> {
  const inline = process.env.GUIDANCE_KEY_TOKENS;
  const file = process.env.GUIDANCE_KEY_TOKENS_FILE;
  if (inline && file) {
    throw new Error("configuration_invalid: set either GUIDANCE_KEY_TOKENS or GUIDANCE_KEY_TOKENS_FILE, not both");
  }
  let raw: string | undefined = inline;
  if (!raw && file) {
    raw = (await import("node:fs")).readFileSync(file, "utf-8");
  }
  if (!raw || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("configuration_invalid: GUIDANCE_KEY_TOKENS is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("configuration_invalid: GUIDANCE_KEY_TOKENS must be an array of {key, token}");
  }
  return parsed.map((p) => {
    const o = p as { key?: unknown; token?: unknown };
    if (typeof o.key !== "string" || typeof o.token !== "string" || o.key.length === 0 || o.token.length < 16) {
      throw new Error("configuration_invalid: GUIDANCE_KEY_TOKENS entries require {key: string, token: string>=16}");
    }
    return { key: o.key, token: o.token };
  });
}
