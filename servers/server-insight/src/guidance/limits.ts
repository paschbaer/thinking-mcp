/**
 * Workflow turn/budget limits (FR-013): maximum repeated identical attempts,
 * diagnostic turn budget, escalation conditions.
 */
import type { Attempt } from '../domain/types.js';

export interface WorkflowLimits {
  maxAttempts: number;
  maxRepeatedIdenticalAttempts: number;
}

export const DEFAULT_LIMITS: WorkflowLimits = { maxAttempts: 12, maxRepeatedIdenticalAttempts: 2 };

export interface LimitAssessment {
  stop_conditions: string[];
  warnings: { code: string; message: string }[];
}

export function assessLimits(attempts: Attempt[], limits = DEFAULT_LIMITS): LimitAssessment {
  const warnings: { code: string; message: string }[] = [];
  const stop: string[] = [];
  const byIntent = new Map<string, number>();
  for (const a of attempts) {
    const key = a.intent.trim().toLowerCase();
    byIntent.set(key, (byIntent.get(key) ?? 0) + 1);
  }
  for (const [intent, n] of byIntent) {
    if (n > limits.maxRepeatedIdenticalAttempts) {
      warnings.push({ code: 'REPEATED_ATTEMPT', message: `Attempt "${intent.slice(0, 60)}" was already tried ${n} times with the same strategy` });
    }
  }
  if (attempts.length >= limits.maxAttempts) {
    stop.push('ATTEMPT_BUDGET_EXHAUSTED: escalate — collect one final piece of evidence or request human input');
  }
  return { stop_conditions: stop, warnings };
}
