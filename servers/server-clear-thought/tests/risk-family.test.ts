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

  // Regression: the top gate must come from top_event (id, then unique name)
  // or the unique unreferenced gate — never from the array position.
  describe('top-gate resolution (array-order independent)', () => {
    const basics = [
      { id: 'B1', type: 'basic', name: 'power', probability: 0.01 },
      { id: 'B2', type: 'basic', name: 'cooling', probability: 0.02 },
      { id: 'B3', type: 'basic', name: 'disk', probability: 0.05 }
    ];
    const g2 = { id: 'G2', type: 'and', inputs: ['B2', 'B3'] };
    const g1 = { id: 'G1', type: 'or', inputs: ['B1', 'G2'] };
    // P(G2)=0.001, P(G1)=1−(1−0.01)(1−0.001)=0.01099
    const nestedTopProbability = 0.01099;

    const orders: { label: string; gates: unknown[] }[] = [
      { label: 'G1 last', gates: [...basics, g2, g1] },
      { label: 'G2 last', gates: [...basics, g1, g2] },
      { label: 'G1 middle', gates: [g1, ...basics, g2] }
    ];

    for (const { label, gates } of orders) {
      it(`resolves the unreferenced OR gate as top (${label})`, async () => {
        const data = await call(op, { top_event: 'system outage', gates });
        expect(data.mode).toBe('analysis');
        expect(data.top_gate).toBe('G1');
        expect(data.top_probability).toBeCloseTo(nestedTopProbability, 9);
        expect(data.top_gate_type).toBeUndefined();
      });
    }

    it('resolves the top gate by id, regardless of position', async () => {
      const data = await call(op, { top_event: 'G1', gates: [...basics, g1, g2] });
      expect(data.top_gate).toBe('G1');
      expect(data.top_probability).toBeCloseTo(nestedTopProbability, 9);
    });

    it('resolves the top gate by unique name', async () => {
      const named = { ...g1, name: 'total loss' };
      const data = await call(op, {
        top_event: 'total loss',
        gates: [...basics, named, g2]
      });
      expect(data.top_gate).toBe('G1');
      expect(data.top_probability).toBeCloseTo(nestedTopProbability, 9);
    });

    it('rejects an ambiguous top_event name', async () => {
      await expect(
        call(op, {
          top_event: 'clone',
          gates: [...basics, { ...g1, name: 'clone', id: 'GA', inputs: ['B1'] }, { ...g2, name: 'clone', id: 'GB', inputs: ['B2', 'B3'] }]
        })
      ).rejects.toThrow(/multiple gate names/);
    });

    it('prefers an id match over ambiguous gate names', async () => {
      // top_event names the id G1 exactly; two OTHER gates share that name.
      // Resolution stage (a) must win before name ambiguity is considered.
      const data = await call(op, {
        top_event: 'G1',
        gates: [
          ...basics,
          { ...g1, name: 'G1' },
          { ...g2, name: 'G1' }
        ]
      });
      expect(data.top_gate).toBe('G1');
      expect(data.top_probability).toBeCloseTo(nestedTopProbability, 9);
    });

    it('resolves a basic event by unique name with top_gate_type', async () => {
      const data = await call(op, { top_event: 'disk', gates: [...basics, g1, g2] });
      expect(data.top_gate).toBe('B3');
      expect(data.top_gate_type).toBe('basic');
      expect(data.top_probability).toBe(0.05);
    });

    it('pins the multi-top fallback to the last unreferenced gate', async () => {
      // Two unreferenced sibling roots and a non-matching top_event:
      // documented behavior is the LAST unreferenced gate (legacy edge
      // preservation).
      const data = await call(op, {
        top_event: 'unmatched',
        gates: [
          ...basics,
          { id: 'GA', type: 'or', inputs: ['B1'] },
          { id: 'GB', type: 'and', inputs: ['B2', 'B3'] }
        ]
      });
      expect(data.top_gate).toBe('GB');
      expect(data.top_probability).toBeCloseTo(0.001, 9);
    });

    it('never reports a basic event as top gate when a gate matches', async () => {
      // B3 is last in the array but the top_event names the OR gate.
      const data = await call(op, { top_event: 'G1', gates: [...basics, g1, g2] });
      expect(data.top_gate).not.toBe('B3');
      expect(data.top_gate).toBe('G1');
    });

    it('flags a basic event as top with top_gate_type', async () => {
      const data = await call(op, { top_event: 'B3', gates: [...basics, g1, g2] });
      expect(data.top_gate).toBe('B3');
      expect(data.top_gate_type).toBe('basic');
      expect(data.top_probability).toBe(0.05);
    });

    it('evaluates the flat OR tree exactly', async () => {
      const flat = {
        id: 'G1',
        type: 'or',
        inputs: ['B1', 'B2', 'B3']
      };
      const data = await call(op, { top_event: 'G1', gates: [...basics, flat] });
      expect(data.top_gate).toBe('G1');
      // 1 − (0.99 × 0.98 × 0.95)
      expect(data.top_probability).toBeCloseTo(0.07831, 9);
    });
  });
});
