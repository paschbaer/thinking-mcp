/** Secret redaction (FR-050, FR-045, FR-025). */
const DEFAULT_PATTERNS = [
  "\\bapi[_-]?key\\b",
  "\\btoken\\b",
  "\\bsecret\\b",
  "\\bpassword\\b",
  "\\bauthorization\\b",
];

export function redact(text: string, patterns: string[]): string {
  let out = text;
  for (const pattern of patterns) {
    try {
      // 2c: value alternation matches multi-line quoted values ([\s\S]*?,
      // non-greedy) in addition to single-line ones.
      const re = new RegExp(`(["']?)(${pattern})\\1\\s*[:=]\\s*("[\\s\\S]*?"|'[\\s\\S]*?'|[^\\s,}]+)`, "gi");
      out = out.replace(re, `$1$2$1: "[REDACTED]"`);
    } catch {
      // invalid pattern: skip (config validation should prevent this)
    }
  }
  return out;
}

export interface Redactor {
  redact(text: string): string;
}

export function createRedactor(patterns: string[] = DEFAULT_PATTERNS): Redactor {
  return { redact: (text: string) => redact(text, patterns) };
}

/** Value-key based redaction for structured objects before serialization. */
export function redactKey(value: string, patterns: string[] = DEFAULT_PATTERNS): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p, "i").test(value);
    } catch {
      return false;
    }
  });
}

/** 2c: high-confidence secret VALUE patterns (no key marker needed).
 *  Deliberately narrow to avoid false positives on ordinary text. */
const SECRET_VALUE_PATTERNS = [
  /begin (?:rsa |ec |openssh )?private key/i,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
];

/** Returns true when the text carries a high-confidence secret value. */
export function containsSecretPattern(text: string): boolean {
  return SECRET_VALUE_PATTERNS.some((re) => re.test(text));
}

/** 2c sanitization seam: deep-walks untrusted downstream payloads and
 *  redacts inline key:value secrets plus secret-bearing strings before
 *  anything agent-facing is built from them. */
export function redactUnknown(value: unknown, patterns: string[] = DEFAULT_PATTERNS): unknown {
  if (typeof value === "string") return redact(value, patterns);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v, patterns));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        redactKey(k, patterns) && (typeof v === "string" || v === null) ? "[REDACTED]" : redactUnknown(v, patterns),
      ]),
    );
  }
  return value;
}
