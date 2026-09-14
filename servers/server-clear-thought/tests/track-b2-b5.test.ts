import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { argumentMapInputShape, runArgumentMap } from '../src/tools/argument-map.js';
import { causalGraphInputShape, runCausalGraph } from '../src/tools/causal-graph.js';
import { fermiEstimateInputShape, runFermiEstimate } from '../src/tools/fermi-estimate.js';
import { gameMatrixInputShape, runGameMatrix } from '../src/tools/game-matrix.js';

/**
 * Deterministic contract tests for roadmap tracks B2–B5 — hand-checked
 * numbers, no client needed (pure functions + zod parsing like production).
 */

function caller<T extends z.ZodRawShape>(shape: T, run: (a: any) => any) {
  return (args: z.infer<z.ZodObject<T>>) => run(z.object(shape).parse(args));
}

describe('argument_map (B2)', () => {
  const call = caller(argumentMapInputShape, runArgumentMap);

  it('scores completeness and lists missing elements with questions', () => {
    const data = call({
      claim: 'We should migrate to Postgres',
      evidence: ['p99 latency is 3× the SLO on MySQL'],
      rebuttals: ['migration downtime during cutover']
    });
    expect(data.mode).toBe('analysis');
    expect(data.claim).toBe('We should migrate to Postgres');
    expect(data.present_count).toBe(3);
    expect(data.completeness).toBe(50);
    expect(data.missing_elements.map((m: { element: string }) => m.element)).toEqual([
      'warrant',
      'backing',
      'qualifiers'
    ]);
    expect(data.missing_elements[0].guiding_question).toContain('Why');
    expect(data.verdict).toContain('Incomplete');
  });

  it('reports a complete structure when all six elements are given', () => {
    const data = call({
      claim: 'C',
      warrant: 'W',
      backing: ['B'],
      qualifiers: ['Q'],
      rebuttals: ['R'],
      evidence: ['E']
    });
    expect(data.missing_elements).toEqual([]);
    expect(data.completeness).toBe(100);
    expect(data.verdict).toContain('Complete');
  });
});

describe('causal_graph (B3)', () => {
  const call = caller(causalGraphInputShape, runCausalGraph);

  it('returns a facilitation scaffold without causes', () => {
    const data = call({ outcome: 'release delays' });
    expect(data.mode).toBe('facilitation');
    expect(data.guiding_questions.length).toBeGreaterThan(0);
  });

  it('classifies root candidates and confounders, generates questions', () => {
    const data = call({
      outcome: 'release delays',
      causes: ['flaky tests', 'scope creep', 'monday deploys'],
      links: [
        { from: 'flaky tests', to: 'release delays', kind: 'causes' },
        { from: 'scope creep', to: 'flaky tests', kind: 'contributes_to' }
      ]
    });
    expect(data.mode).toBe('analysis');
    expect(data.root_candidates).toEqual(['flaky tests']);
    // "monday deploys" has no edges at all → confounder candidate.
    expect(data.confounder_candidates).toEqual(['monday deploys']);
    expect(data.questions).toHaveLength(3);
    expect(data.questions[0].intervention).toContain('flaky tests');
  });

  it('rejects unknown nodes and cycles', () => {
    expect(() =>
      call({
        outcome: 'X',
        causes: ['a'],
        links: [{ from: 'ghost', to: 'outcome', kind: 'causes' }]
      })
    ).toThrow(/unknown node "ghost"/);

    expect(() =>
      call({
        outcome: 'X',
        causes: ['a', 'b'],
        links: [
          { from: 'a', to: 'b', kind: 'causes' },
          { from: 'b', to: 'a', kind: 'causes' }
        ]
      })
    ).toThrow(/cycle/);
  });
});

describe('fermi_estimate (B4)', () => {
  const call = caller(fermiEstimateInputShape, runFermiEstimate);

  it('multiplies the chain and ranks sensitivity (hand-checked)', () => {
    const data = call({
      target: 'users hitting the bug per day',
      assumptions: [
        { label: 'a', value: 10, uncertainty_pct: 20 },
        { label: 'b', value: 4, uncertainty_pct: 10 },
        { label: 'c', value: 2.5, uncertainty_pct: 10 }
      ]
    });
    expect(data.estimate).toBe(100);
    expect(data.most_sensitive).toBe('a');
    const impacts = Object.fromEntries(
      data.sensitivity.map((s: { label: string; impact: number }) => [s.label, s.impact])
    );
    expect(impacts.a).toBeCloseTo(40, 6);
    expect(impacts.b).toBeCloseTo(20, 6);
    expect(impacts.c).toBeCloseTo(20, 6);
  });

  it('supports sum chains and custom uncertainty', () => {
    const data = call({
      target: 'total backlog items',
      combine: 'sum',
      assumptions: [
        { label: 'team a', value: 30, uncertainty_pct: 0 },
        { label: 'team b', value: 12, uncertainty_pct: 50 }
      ]
    });
    expect(data.estimate).toBe(42);
    const impacts = Object.fromEntries(
      data.sensitivity.map((s: { label: string; impact: number }) => [s.label, s.impact])
    );
    expect(impacts['team b']).toBe(12); // ±50 % of 12
    expect(impacts['team a']).toBe(0);
  });
});

describe('game_matrix (B5)', () => {
  const call = caller(gameMatrixInputShape, runGameMatrix);

  const pd = {
    row_labels: ['quiet', 'defect'],
    col_labels: ['quiet', 'defect'],
    payoff_matrix: [
      [
        { row: -1, col: -1 },
        { row: -3, col: 0 }
      ],
      [
        { row: 0, col: -3 },
        { row: -2, col: -2 }
      ]
    ]
  };

  const assurance = {
    row_labels: ['hunt', 'rabbit'],
    col_labels: ['hunt', 'rabbit'],
    payoff_matrix: [
      [
        { row: 3, col: 3 },
        { row: 0, col: 2 }
      ],
      [
        { row: 2, col: 0 },
        { row: 1, col: 1 }
      ]
    ]
  };

  it('finds the unique prisoner’s-dilemma Nash at (defect, defect)', () => {
    const data = call(pd);
    expect(data.nash_count).toBe(1);
    expect(data.pure_nash[0].row).toBe('defect');
    expect(data.pure_nash[0].col).toBe('defect');
    // Strict dominance: defect dominates quiet for both players.
    expect(data.strictly_dominated.rows).toEqual([{ dominated: 'quiet', by: 'defect' }]);
    expect(data.strictly_dominated.columns).toEqual([{ dominated: 'quiet', by: 'defect' }]);
  });

  it('reports two equilibria and the mixed 2×2 for the assurance game', () => {
    const data = call(assurance);
    expect(data.nash_count).toBe(2);
    expect(data.pure_nash.map((n: { row: string; col: string }) => `${n.row}/${n.col}`)).toEqual([
      'hunt/hunt',
      'rabbit/rabbit'
    ]);
    // Mixed: both players hunt with 1/2 (opponent-indifference).
    expect(data.mixed_strategies.row_player['hunt']).toBeCloseTo(0.5, 3);
    expect(data.mixed_strategies.col_player['hunt']).toBeCloseTo(0.5, 3);
    expect(data.strictly_dominated.rows).toEqual([]);
  });

  it('rejects dimension mismatches', () => {
    expect(() =>
      call({
        row_labels: ['a', 'b'],
        col_labels: ['x', 'y'],
        payoff_matrix: [[{ row: 1, col: 1 }]]
      })
    ).toThrow(/too_small/i);
    void assurance;
  });
});
