import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectOperations, type OperationSpec } from '../src/toolsets/registry.js';
import { registerPremortem } from '../src/tools/premortem.js';
import { registerFmea } from '../src/tools/fmea.js';
import { registerFaultTree } from '../src/tools/fault-tree.js';

/**
 * Harvests the operation (schema + handler) exactly the way the risk
 * toolset does, parses args through the registered zod schema (zod is the
 * single source of truth — see lessonsLearned) and returns the parsed
 * response payload.
 */
function opFor(registerFn: (server: any, state: any) => void): OperationSpec {
  const ops = collectOperations(registerFn, {});
  expect(ops.length).toBe(1);
  return ops[0];
}

async function call(op: OperationSpec, args: Record<string, unknown>) {
  const parsed = z.object(op.schema).parse(args);
  const result = await op.handler(parsed);
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0].text);
}

describe('premortem', () => {
  const op = opFor(registerPremortem);

  it('returns a facilitation scaffold without failure causes', async () => {
    const data = await call(op, { project: ' MCP-Registry-Rollout ', timeframe_months: 3 });
    expect(data.mode).toBe('facilitation');
    expect(data.project).toBe('MCP-Registry-Rollout');
    expect(data.timeframe_months).toBe(3);
    expect(data.guiding_questions.length).toBeGreaterThan(0);
  });

  it('ranks causes by likelihood × impact and computes mitigation coverage', async () => {
    const data = await call(op, {
      project: 'Rollout',
      failure_causes: [
        { cause: 'no smoke tests', likelihood: 5, impact: 4 },
        { cause: 'key person leaves', likelihood: 3, impact: 3, mitigation: 'pair rotation' },
        { cause: 'vendor outage', likelihood: 4, impact: 5 }
      ],
      top_n: 2
    });
    expect(data.mode).toBe('analysis');
    expect(data.risks.map((r: { score: number }) => r.score)).toEqual([20, 20, 9]);
    expect(data.top_risks).toHaveLength(2);
    expect(data.mitigation_coverage).toBe(33);
  });
});

describe('fmea', () => {
  const op = opFor(registerFmea);

  const rows = {
    failure_modes: [
      { failure_mode: 'data loss on upgrade', severity: 8, occurrence: 5, detection: 3 },
      { failure_mode: 'slow queries', severity: 4, occurrence: 2, detection: 5 },
      { failure_mode: 'token leak', severity: 6, occurrence: 2, detection: 2 }
    ]
  };

  it('computes, ranks and flags RPNs against the threshold', async () => {
    const data = await call(op, { scope: 'storage layer', ...rows, rpn_threshold: 100 });
    expect(data.mode).toBe('analysis');
    const rpns = data.rows.map((r: { rpn: number }) => r.rpn);
    expect(rpns).toEqual([120, 40, 24]);
    expect(data.rows[0].flagged).toBe(true);
    expect(data.rows[1].flagged).toBe(false);
    expect(data.flagged_count).toBe(1);
    expect(data.mean_rpn).toBeCloseTo(61.33, 2);
    expect(data.max_rpn).toBe(120);
  });

  it('returns a facilitation scaffold without failure modes', async () => {
    const data = await call(op, { scope: 'storage layer' });
    expect(data.mode).toBe('facilitation');
    expect(data.guiding_questions.length).toBeGreaterThan(0);
  });
});

describe('fault_tree', () => {
  const op = opFor(registerFaultTree);

  // TOP = OR(G1, B3); G1 = AND(B1, B2); P(B1)=0.1, P(B2)=0.2, P(B3)=0.3
  // → P(G1)=0.02, P(TOP)=1−(1−0.02)(1−0.3)=0.314
  const tree = {
    top_event: 'system outage',
    gates: [
      { id: 'B1', type: 'basic', name: 'power supply', probability: 0.1 },
      { id: 'B2', type: 'basic', name: 'backup fails', probability: 0.2 },
      { id: 'B3', type: 'basic', name: 'operator error', probability: 0.3 },
      { id: 'G1', type: 'and', inputs: ['B1', 'B2'] },
      { id: 'TOP', type: 'or', inputs: ['G1', 'B3'] }
    ]
  };

  it('evaluates AND/OR gates exactly (hand-checked)', async () => {
    const data = await call(op, tree);
    expect(data.mode).toBe('analysis');
    expect(data.top_probability).toBeCloseTo(0.314, 9);
    const ranking = Object.fromEntries(
      data.basic_events.map((b: { id: string; contribution: number }) => [b.id, b.contribution])
    );
    expect(ranking.B3).toBeCloseTo(0.294, 9);
    expect(ranking.B1).toBeCloseTo(0.014, 9);
    expect(ranking.B2).toBeCloseTo(0.014, 9);
    // Contribution ranking: B3 dominates.
    expect(data.basic_events[0].id).toBe('B3');
  });

  it('rejects unknown references, duplicate ids and cycles', async () => {
    await expect(
      call(op, { ...tree, gates: [...tree.gates, { id: 'G9', type: 'or', inputs: ['G1', 'nope'] }] })
    ).rejects.toThrow(/unknown id "nope"/);

    await expect(
      call(op, {
        ...tree,
        gates: [...tree.gates, { id: 'B1', type: 'basic', probability: 0.5 }]
      })
    ).rejects.toThrow(/duplicate gate id/);

    const cyclic = {
      top_event: 'loop',
      gates: [
        { id: 'A', type: 'or', inputs: ['B'] },
        { id: 'B', type: 'or', inputs: ['A'] }
      ]
    };
    await expect(call(op, cyclic)).rejects.toThrow(/cycle/);
  });

  it('returns a facilitation scaffold without gates', async () => {
    const data = await call(op, { top_event: 'system outage' });
    expect(data.mode).toBe('facilitation');
    expect(data.guiding_questions.length).toBeGreaterThan(0);
  });
});
