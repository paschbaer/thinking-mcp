import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerSwotAnalysis } from '../src/tools/swot-analysis.js';
import { registerVisualizationToolset } from '../src/toolsets/visualization.js';

function setupServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  return { server, state };
}

function getTool(server: McpServer, name: string): any {
  return (server as any)._registeredTools[name];
}

async function callSwot(server: McpServer, args: Record<string, unknown>) {
  const result = await getTool(server, 'swot_analysis').handler(args, {});
  return JSON.parse(result.content[0].text);
}

it('returns a facilitation scaffold when no quadrant content is provided', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, { subject: 'Polars vs DuckDB' });

  expect(data.mode).toBe('facilitation');
  expect(data.subject).toBe('Polars vs DuckDB');
  expect(data.strengths).toEqual([]);
  expect(data.weaknesses).toEqual([]);
  expect(data.opportunities).toEqual([]);
  expect(data.threats).toEqual([]);
  expect(data.guidingQuestions.strengths.length).toBeGreaterThan(0);
  expect(data.guidingQuestions.threats.length).toBeGreaterThan(0);
  expect(data.nextSteps.join(' ')).toMatch(/again/i);
  expect(data.status).toBe('success');
  expect(data.tows).toBeUndefined();
  expect(data.scores).toBeUndefined();
});

it('rejects an empty or whitespace-only subject at the schema level', () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const schema = getTool(server, 'swot_analysis').inputSchema;
  // SDK-level validation trims the subject before the min(1) check
  expect(schema.safeParse({ subject: '   ' }).success).toBe(false);
  expect(schema.safeParse({ subject: '' }).success).toBe(false);
  expect(schema.safeParse({ subject: '  real  ' }).success).toBe(true);
});

it('reads a deliberately half-filled SWOT as less balanced', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'half swot',
    strengths: ['a', 'b'],
    weaknesses: ['c', 'd']
  });
  // counts [2,2,0,0]: empty quadrants lower the balance on purpose —
  // a half-filled SWOT signals incomplete coverage
  expect(data.scores.balance).toBe(0.5);
});

it('passes through quadrant content and derives TOWS strategies in analysis mode', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'Scanner rewrite',
    strengths: ['fast columnar engine', 'small memory footprint'],
    weaknesses: ['single maintainer'],
    opportunities: ['growing dataset sizes', 'cheap object storage'],
    threats: ['upstream API breaks']
  });

  expect(data.mode).toBe('analysis');
  // entries are normalized: plain strings get default weights and no tags
  expect(data.strengths).toEqual([
    { text: 'fast columnar engine', impact: 3, likelihood: 3, tags: [] },
    { text: 'small memory footprint', impact: 3, likelihood: 3, tags: [] }
  ]);
  expect(data.tows.so).toHaveLength(4); // 2 strengths x 2 opportunities
  expect(data.tows.so[0]).toMatch(/^SO: Leverage "fast columnar engine" to capture "growing dataset sizes"\.$/);
  expect(data.tows.wo).toHaveLength(2); // 1 weakness x 2 opportunities
  expect(data.tows.wo[0]).toMatch(/^WO: Address "single maintainer" to unlock/);
  expect(data.tows.st).toHaveLength(2); // 2 strengths x 1 threat
  expect(data.tows.wt).toHaveLength(1); // 1 weakness x 1 threat

  expect(data.scores.strengths).toBe(2);
  expect(data.scores.weaknesses).toBe(1);
  expect(data.scores.opportunities).toBe(2);
  expect(data.scores.threats).toBe(1);
  // balance = 1 - (max-min)/total = 1 - 1/6
  expect(data.scores.balance).toBe(0.83);
  // riskExposure = (weaknesses + threats) / total = 2/6
  expect(data.scores.riskExposure).toBe(0.33);
  // v2 additive fields: weighted scores (defaults impact 3 x likelihood 3 = 9)
  expect(data.scores.weighted).toEqual({
    strengths: 18,
    weaknesses: 9,
    opportunities: 18,
    threats: 9,
    balance: 0.67, // (18+18)/54
    riskExposure: 0.33
  });
  expect(data.towsRanked.so[0]).toEqual({
    pair: ['fast columnar engine', 'growing dataset sizes'],
    score: 81,
    text: 'SO: Leverage "fast columnar engine" to capture "growing dataset sizes".',
    tags: [],
    sharedTags: []
  });
  expect(data.meta).toEqual({
    topN: 5,
    matchMode: 'all',
    truncatedPerQuadrant: { so: false, wo: false, st: false, wt: false },
    weightedEntries: { strengths: 0, weaknesses: 0, opportunities: 0, threats: 0 },
    unpaired: { strengths: [], weaknesses: [], opportunities: [], threats: [] }
  });
  expect(data.nextSteps.join(' ')).toMatch(/decisionframework|mentalmodel/);
});

it('handles partial analysis with only negative quadrants filled', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'legacy import path',
    weaknesses: ['no test coverage'],
    threats: ['dependency drift']
  });

  expect(data.mode).toBe('analysis');
  expect(data.tows.so).toEqual([]);
  expect(data.tows.wo).toEqual([]);
  expect(data.tows.st).toEqual([]);
  expect(data.tows.wt).toHaveLength(1);
  expect(data.scores.riskExposure).toBe(1);
});

it('ignores whitespace-only entries', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'x',
    strengths: ['  ', 'real strength']
  });
  expect(data.mode).toBe('analysis');
  expect(data.strengths).toEqual([
    { text: 'real strength', impact: 3, likelihood: 3, tags: [] }
  ]);
  // single item in a single quadrant: total=1, max-min=1 -> balance 0
  expect(data.scores.balance).toBe(0);
});

it('advertises the quadrant fields via the visualization toolset', async () => {
  const { server, state } = setupServer();
  registerVisualizationToolset(server, state);
  const json: any = zodToJsonSchema(getTool(server, 'visualization').inputSchema);

  // toolset contract: only `operation` is required at the advertised level;
  // per-operation requiredness (subject) is enforced by the dispatcher
  expect(json.properties.subject).toBeDefined();
  expect(json.required).toEqual(['operation']);
  for (const field of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
    expect(json.properties[field].type).toBe('array');
    expect(json.required).not.toContain(field);
    // v2: entry union (string | weighted object) survives schema serialization;
    // zod-to-json-schema deduplicates the reused entry schema as a $ref to the
    // first field's items, so later quadrants carry a $ref instead of anyOf
    const items = json.properties[field].items;
    if (items.anyOf) {
      expect(items.anyOf).toHaveLength(2);
    } else {
      expect(items.$ref).toBe('#/properties/strengths/items');
    }
  }
  expect(json.properties.topN).toBeDefined();
  expect(json.properties.topN.default).toBe(5);
  expect(json.properties.matchMode.enum).toEqual(['all', 'tags']);

  // dispatcher enforces the missing subject for the swot_analysis operation
  const handler = getTool(server, 'visualization').handler;
  await expect(handler({ operation: 'swot_analysis' }, {})).rejects.toThrow(
    /Invalid arguments for operation 'swot_analysis'.*subject/
  );
  // dispatcher enforces v2 constraints (weight range, topN range)
  await expect(
    handler({ operation: 'swot_analysis', subject: 'x', strengths: [{ text: 't', impact: 6 }] }, {})
  ).rejects.toThrow(/Invalid arguments for operation 'swot_analysis'/);
  await expect(
    handler({ operation: 'swot_analysis', subject: 'x', topN: 51 }, {})
  ).rejects.toThrow(/Invalid arguments for operation 'swot_analysis'/);
  await expect(
    handler({ operation: 'swot_analysis', subject: 'x', strengths: [{ text: 'ok', impact: 4 }] }, {})
  ).resolves.toBeDefined();
});

it('keeps the unlimited cross product with topN=0 and score-free strings (spec cases 1+7)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'v1 compat',
    strengths: ['s1', 's2', 's3'],
    opportunities: ['o1', 'o2', 'o3'],
    topN: 0
  });
  expect(data.tows.so).toHaveLength(9); // full 3x3 cross product
  expect(data.towsRanked.so).toHaveLength(9);
  data.tows.so.forEach((text: string, i: number) => {
    expect(text).toBe(data.towsRanked.so[i].text);
    expect(text).toMatch(/^SO: Leverage/);
    expect(text).not.toMatch(/\[\d+\]/); // no score suffix
  });
  expect(data.scores.weighted.strengths).toBe(27); // 3 entries x default 9
});

it('caps pairings at the default topN=5 and reports truncation (spec case 2)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'big cross product',
    strengths: ['s1', 's2', 's3', 's4'],
    weaknesses: ['w1', 'w2', 'w3', 'w4'],
    opportunities: ['o1', 'o2', 'o3', 'o4']
  });
  expect(data.towsRanked.so).toHaveLength(5);
  expect(data.tows.so).toHaveLength(5);
  expect(data.meta.topN).toBe(5);
  expect(data.meta.truncatedPerQuadrant.so).toBe(true);
  expect(data.meta.truncatedPerQuadrant.wo).toBe(true);
  expect(data.meta.truncatedPerQuadrant.st).toBe(false);
  expect(data.meta.truncatedPerQuadrant.wt).toBe(false);
});

it('ranks weighted pairs first and honors an explicit topN (spec cases 3+4)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'weighted',
    strengths: [{ text: 'S1', impact: 5, likelihood: 5 }, 's2', 's3', 's4'],
    opportunities: [{ text: 'O1', impact: 4, likelihood: 4 }, 'o2', 'o3', 'o4'],
    topN: 3
  });
  expect(data.towsRanked.so[0].score).toBe(400); // entryScore 25 (5x5) x entryScore 16 (4x4); spec's "100" was an arithmetic slip
  expect(data.towsRanked.so[0].pair).toEqual(['S1', 'O1']);
  expect(data.towsRanked.so).toHaveLength(3);
  expect(data.meta.truncatedPerQuadrant.so).toBe(true);
});

it('breaks score ties by input order (spec case 5)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'ties',
    strengths: ['s1', 's2'],
    opportunities: ['o1']
  });
  expect(data.tows.so).toEqual([
    'SO: Leverage "s1" to capture "o1".',
    'SO: Leverage "s2" to capture "o1".'
  ]);
});

it('defaults mixed input to entryScore 9 and counts object entries (spec case 6)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'defaults',
    strengths: ['s1', { text: 's2' }],
    opportunities: ['o1', { text: 'o2', tags: ['x'] }]
  });
  expect(data.scores.weighted.strengths).toBe(18);
  expect(data.scores.weighted.opportunities).toBe(18);
  expect(data.towsRanked.so.every((p: any) => p.score === 81)).toBe(true);
  expect(data.meta.weightedEntries).toEqual({
    strengths: 1,
    weaknesses: 0,
    opportunities: 1,
    threats: 0
  });
});

it('computes weighted riskExposure from the formula (spec case 8, corrected value)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'risk',
    weaknesses: [{ text: 'w', impact: 5, likelihood: 5 }],
    threats: [{ text: 't', impact: 5, likelihood: 5 }],
    strengths: ['s'],
    opportunities: ['o']
  });
  expect(data.scores.weighted.weaknesses).toBe(25);
  expect(data.scores.weighted.threats).toBe(25);
  // (25+25) / (9+9+25+25) = 50/68 ≈ 0.74 (spec table said 0.58 — corrected)
  expect(data.scores.weighted.riskExposure).toBe(0.74);
  expect(data.scores.weighted.balance).toBe(0.26); // 18/68
});

it('facilitation mode ignores topN and matchMode (spec case 9)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, { subject: 'phase 1', topN: 3, matchMode: 'tags' });
  expect(data.mode).toBe('facilitation');
  expect(data.guidingQuestions).toBeDefined();
  expect(data.tows).toBeUndefined();
  expect(data.towsRanked).toBeUndefined();
  expect(data.scores).toBeUndefined();
  expect(data.meta).toBeUndefined();
});

it('defaults matchMode to "all" with empty unpaired (spec case 11)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'mode default',
    strengths: ['s1', 's2'],
    opportunities: ['o1']
  });
  expect(data.meta.matchMode).toBe('all');
  expect(data.tows.so).toHaveLength(2);
  expect(data.meta.unpaired).toEqual({
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: []
  });
});

it('pairs only entries sharing a tag and reports the rest as unpaired (spec case 12)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'tag filter',
    matchMode: 'tags',
    strengths: [{ text: 'S1', tags: ['perf'] }, 'S2'],
    opportunities: [{ text: 'O1', tags: ['perf'] }, { text: 'O2', tags: ['kosten'] }]
  });
  expect(data.tows.so).toHaveLength(1);
  expect(data.tows.so[0]).toBe('SO: Leverage "S1" to capture "O1".');
  expect(data.meta.unpaired.strengths).toEqual(['S2']);
  expect(data.meta.unpaired.opportunities).toEqual(['O2']);
});

it('emits exactly one pair with the full shared tag intersection (spec case 13)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'multi tags',
    matchMode: 'tags',
    strengths: [{ text: 'S1', tags: ['a', 'b'] }],
    opportunities: [{ text: 'O1', tags: ['b', 'c'] }]
  });
  expect(data.towsRanked.so).toHaveLength(1);
  expect(data.towsRanked.so[0].sharedTags).toEqual(['b']);
  expect(data.towsRanked.so[0].tags).toEqual(['a', 'b', 'b', 'c']); // mirrored union
});

it('matches tags case-insensitively using the first side spelling (spec case 14)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'case',
    matchMode: 'tags',
    strengths: [{ text: 'S1', tags: ['Perf'] }],
    opportunities: [{ text: 'O1', tags: ['perf'] }]
  });
  expect(data.tows.so).toHaveLength(1);
  expect(data.towsRanked.so[0].sharedTags).toEqual(['Perf']);
});

it('reports success with empty TOWS when no tags match (spec cases 15+16)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'no matches',
    matchMode: 'tags',
    strengths: ['plain string', { text: 'tagged', tags: ['x'] }],
    threats: [{ text: 'T1', tags: ['y'] }]
  });
  expect(data.status).toBe('success');
  expect(data.tows.so).toEqual([]);
  expect(data.tows.wt).toEqual([]);
  expect(data.towsRanked.st).toEqual([]);
  expect(data.meta.unpaired.strengths).toEqual(['plain string', 'tagged']);
  expect(data.meta.unpaired.threats).toEqual(['T1']);
});

it('applies topN after the tag filter (spec case 17)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'topN after filter',
    matchMode: 'tags',
    topN: 5,
    strengths: [
      { text: 's1', tags: ['perf'] },
      { text: 's2', tags: ['perf'] },
      { text: 's3', tags: ['perf'] },
      { text: 's4', tags: ['perf'] }
    ],
    opportunities: [
      { text: 'o1', tags: ['perf'] },
      { text: 'o2', tags: ['perf'] }
    ]
  });
  expect(data.tows.so).toHaveLength(5); // 8 candidates -> 5
  expect(data.meta.truncatedPerQuadrant.so).toBe(true);
});

it('validates weights, topN, matchMode, and entry text at the schema level (spec section 5)', () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const schema = getTool(server, 'swot_analysis').inputSchema;
  expect(schema.safeParse({ subject: 'x', strengths: [{ text: 't', impact: 6 }] }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', strengths: [{ text: 't', impact: 0 }] }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', strengths: [{ text: '   ' }] }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', topN: 51 }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', topN: -1 }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', matchMode: 'fuzzy' }).success).toBe(false);
  expect(schema.safeParse({ subject: 'x', topN: 0, matchMode: 'tags' }).success).toBe(true);
});

it('keeps entries paired via another family out of unpaired (review finding 1)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'cross family',
    matchMode: 'tags',
    strengths: [{ text: 'S1', tags: ['sec'] }],
    opportunities: [{ text: 'O1', tags: ['other'] }],
    threats: [{ text: 'T1', tags: ['sec'] }]
  });
  expect(data.tows.st).toHaveLength(1); // S1 pairs via ST only
  expect(data.tows.so).toEqual([]);
  expect(data.meta.unpaired.strengths).toEqual([]); // paired via ST
  expect(data.meta.unpaired.opportunities).toEqual(['O1']);
  expect(data.meta.unpaired.threats).toEqual([]);
});

it('dedupes duplicate tags on a single entry per pair (review finding 2)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'dup tags',
    matchMode: 'tags',
    strengths: [{ text: 'S1', tags: ['perf', 'Perf'] }],
    opportunities: [{ text: 'O1', tags: ['perf'] }]
  });
  expect(data.towsRanked.so).toHaveLength(1);
  expect(data.towsRanked.so[0].sharedTags).toEqual(['perf']);
});

it('clamps topN above the candidate count without truncation flag (review finding 4)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'big topN',
    strengths: ['s1', 's2'],
    opportunities: ['o1', 'o2'],
    topN: 50
  });
  expect(data.tows.so).toHaveLength(4);
  expect(data.meta.truncatedPerQuadrant).toEqual({ so: false, wo: false, st: false, wt: false });
});

it('keeps unpaired empty when topN cuts candidates away (review finding 5)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'cut unpaired',
    matchMode: 'tags',
    topN: 1,
    strengths: [
      { text: 's1', tags: ['perf'] },
      { text: 's2', tags: ['perf'] }
    ],
    opportunities: [{ text: 'o1', tags: ['perf'] }]
  });
  expect(data.tows.so).toHaveLength(1); // 2 candidates, cut to 1
  expect(data.meta.truncatedPerQuadrant.so).toBe(true);
  expect(data.meta.unpaired.strengths).toEqual([]); // pre-topN semantics
  expect(data.meta.unpaired.opportunities).toEqual([]);
});

it('falls back to facilitation when every entry is whitespace-only (review finding 6)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, { subject: 'all blank', strengths: ['  ', '   '] });
  expect(data.mode).toBe('facilitation');
  expect(data.strengths).toEqual([]);
  expect(data.tows).toBeUndefined();
});

it('renders ST and WT templates verbatim (review finding 7)', async () => {
  const { server, state } = setupServer();
  registerSwotAnalysis(server, state);
  const data = await callSwot(server, {
    subject: 'templates',
    strengths: ['s'],
    weaknesses: ['w'],
    threats: ['t']
  });
  expect(data.tows.st).toEqual(['ST: Use "s" to mitigate "t".']);
  expect(data.tows.wt).toEqual(['WT: Reduce exposure where "w" meets "t".']);
});
