/**
 * GuidanceEnvelope schema + invariants (contracts/guidance.md, D4).
 * Attached to EVERY successful or recoverable response (FR-010).
 */
import { z } from 'zod';

export const PLACEHOLDERS = ['<collect value>', '<attach artifact>'] as const;

export const EPISODE_STATES = [
  'DRAFT', 'OBSERVED', 'DIAGNOSING', 'SOLUTION_PROPOSED', 'VALIDATING',
  'LOCALLY_VERIFIED', 'REPRODUCED', 'CROSS_PROJECT_VERIFIED', 'UNRESOLVED',
  'PARTIALLY_VERIFIED', 'NEEDS_REVIEW', 'CONTRADICTED', 'INVALIDATED',
  'DEPRECATED', 'SUPERSEDED',
] as const;

export const WarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string(),
});

export type Warning = z.infer<typeof WarningSchema>;

export const RecommendedRequestSchema = z.object({
  tool: z.string(),
  reason: z.string(),
  arguments_template: z.record(z.unknown()),
});

export const GuidanceEnvelopeSchema = z.object({
  workflow_id: z.string(),
  experience_id: z.string().optional(),
  workflow_state: z.enum(EPISODE_STATES),
  revision: z.number().int().positive(),
  objective: z.string().optional(),
  missing_information: z.array(
    z.object({
      field: z.string(),
      reason: z.string(),
      required: z.boolean(),
      safe_collection_hint: z.string().optional(),
    })
  ),
  warnings: z.array(WarningSchema),
  allowed_next_tools: z.array(z.string()),
  recommended_next_request: RecommendedRequestSchema,
  alternative_next_requests: z.array(z.object({ tool: z.string(), reason: z.string() })),
  stop_conditions: z.array(z.string()),
  human_approval: z.object({ required: z.boolean(), reason: z.string().optional() }),
});

export type GuidanceEnvelope = z.infer<typeof GuidanceEnvelopeSchema>;

/** Canonical warning severity mapping (guidance.md invariant 8). */
export const SEVERITY_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  CONTRADICTION: 'high',
  HUMAN_APPROVAL_REQUIRED: 'high',
  UNVERIFIED_ROOT_CAUSE: 'medium',
  DUPLICATE: 'medium',
  BUDGET_EXHAUSTED: 'medium',
  STALE: 'low',
  SEMANTIC_UNAVAILABLE: 'low',
};

export function severityFor(code: string): 'low' | 'medium' | 'high' {
  return SEVERITY_MAP[code] ?? 'medium';
}

/** Invariant: unknown values use ONLY the reserved placeholders (FR-011). */
export function assertPlaceholdersOnly(template: Record<string, unknown>): void {
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.startsWith('<') && node.endsWith('>') && !PLACEHOLDERS.includes(node as never)) {
        throw new Error(`Fabricated placeholder not allowed: ${node}`);
      }
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(template);
}

/** Validate a complete envelope; throws on invariant violations. */
export function validateEnvelope(env: GuidanceEnvelope): GuidanceEnvelope {
  const parsed = GuidanceEnvelopeSchema.parse(env);
  if (!parsed.allowed_next_tools.includes(parsed.recommended_next_request.tool)) {
    throw new Error('Invariant violated: recommended tool not in allowed_next_tools');
  }
  assertPlaceholdersOnly(parsed.recommended_next_request.arguments_template);
  return parsed;
}
