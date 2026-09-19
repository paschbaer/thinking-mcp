/**
 * Evaluation corpus + baseline harness contract tests (D3, SC-001, T020/T048).
 */
import { describe, it, expect } from 'vitest';
import { CORPUS, corpusSummary } from '../fixtures/corpus.ts';
import { runBaselineComparison } from '../fixtures/baseline-run.ts';

describe('evaluation corpus (D3)', () => {
  it('contains at least 30 tasks', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(30);
  });

  it('covers all mandated composition classes', () => {
    const s = corpusSummary();
    for (const cat of ['repeat', 'near-match-env-diff', 'misleading-semantic', 'obsolete', 'poisoned', 'conflicting', 'novel', 'security-sensitive']) {
      expect(s[cat], `missing category ${cat}`).toBeGreaterThan(0);
    }
  });
});

describe('SC-001 baseline harness', () => {
  it('memory mode reduces failed attempts vs baseline (SC-001 measurement procedure)', async () => {
    const report = await runBaselineComparison();
    expect(report.baseline_total_failed).toBeGreaterThan(0);
    expect(report.memory_total_failed).toBeLessThan(report.baseline_total_failed);
    expect(report.reduction_percent).toBeGreaterThan(0);
  });
});
