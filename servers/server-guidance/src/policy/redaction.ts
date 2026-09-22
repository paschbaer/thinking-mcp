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
      const re = new RegExp(`(["']?)(${pattern})\\1\\s*[:=]\\s*("[^"]*"|'[^']*'|[^\\s,}]+)`, "gi");
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
