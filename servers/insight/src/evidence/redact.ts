/**
 * Deterministic pattern-based redaction (FR-025) + instruction-like-string
 * flagging (FR-026). No external services. Versioned ruleset id — referenced
 * by artifact metadata and audit records (FR-030).
 */
export const RULESET_VERSION = 'emms-redact-2026-09-01';

interface Rule {
  name: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { name: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'generic_api_token', pattern: /\b(?:sk|pk|ghp|gho|xox[baprs]|api)[_-][A-Za-z0-9_-]{16,}\b/g },
  { name: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi },
  { name: 'private_key_block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'connection_string', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g },
  { name: 'password_assignment', pattern: /\b(?:password|passwd|pwd|secret|token)\s*[:=]\s*\S{4,}/gi },
  { name: 'home_path', pattern: /(?:\/home\/[\w.-]+|\/Users\/[\w.-]+|C:\\Users\\[\w.-]+)/g },
];

export interface RedactionResult {
  redacted: string;
  findings: number;
  ruleset_version: string;
  finding_names: string[];
  flags_instruction_like: boolean;
}

const INSTRUCTION_PATTERNS: RegExp[] = [
  /^\s*(?:system\s*prompt|ignore\s+(?:all\s+)?(?:previous|above)\s+instructions)/im,
  /\b(?:you\s+must\s+now|from\s+now\s+on\s+you\s+are)\b/i,
];

export function redact(content: string): RedactionResult {
  let out = content;
  const findingNames = new Set<string>();
  let findings = 0;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match) => {
      findings++;
      findingNames.add(rule.name);
      return `[REDACTED:${rule.name}]`;
    });
  }
  const flags_instruction_like = INSTRUCTION_PATTERNS.some((p) => p.test(content));
  return {
    redacted: out,
    findings,
    ruleset_version: RULESET_VERSION,
    finding_names: [...findingNames],
    flags_instruction_like,
  };
}
