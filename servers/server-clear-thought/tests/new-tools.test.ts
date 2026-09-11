import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerUtilityToolset } from '../src/toolsets/utility.js';

function setupServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  return { server, state };
}

type ToolCallback = (args: any) => Promise<any>;

function getCallback(server: McpServer): ToolCallback {
  return (server as any)._registeredTools['utility'].handler;
}

async function call(server: McpServer, args: Record<string, unknown>) {
  const result = await getCallback(server)(args, {});
  return JSON.parse(result.content[0].text);
}

it('assumption_xray extracts assumptions with evidence and falsification tests', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'assumption_xray',
    claim: 'All deployments always fail because the pipeline is the slowest',
    context: 'release engineering'
  });

  expect(data.mode).toBe('analysis');
  expect(data.assumptions.length).toBeGreaterThanOrEqual(2);
  for (const a of data.assumptions) {
    expect(a.kind).toBeDefined();
    expect(a.evidence.length).toBeGreaterThan(0);
    expect(a.falsification_test).toMatch(/counterexample|experiment|constraints|Benchmark/);
    expect(a.confidence).toBeGreaterThan(0);
  }
  expect(typeof data.confidence).toBe('number');
});

it('assumption_xray falls back to probing questions when no markers match', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'assumption_xray',
    claim: 'The report file is stored in the S3 bucket.'
  });

  expect(data.mode).toBe('no_marker');
  expect(data.assumptions).toEqual([]);
  expect(data.probing_questions.length).toBeGreaterThan(0);
});

it('value_of_information ranks uncertainties by impact and warns on length mismatch', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['polars', 'duckdb'],
    uncertainties: ['latency at scale', 'sql parity', 'memory ceiling'],
    payoffs: [3, 9, 1]
  });

  // uniform prior (probability 1 each): mean of impacts
  expect(data.voi_score).toBeCloseTo(4.33, 1);
  expect(data.ranked_uncertainties[0]).toEqual({
    uncertainty: 'sql parity',
    impact: 9,
    probability: 1,
    expected_impact: 9
  });
  expect(data.ranked_uncertainties[2].impact).toBe(1);
  expect(data.high_impact_questions[0]).toContain('sql parity');
  expect(data.nextSteps.join(' ')).toMatch(/Resolve/i);
});

it('value_of_information weights by probability when provided', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['a', 'b'],
    uncertainties: ['likely-small', 'unlikely-huge'],
    payoffs: [2, 20],
    probabilities: [0.9, 0.1]
  });

  // expected impacts: 0.9*2 = 1.8 vs 0.1*20 = 2 -> unlikely-huge still first
  expect(data.ranked_uncertainties[0].uncertainty).toBe('unlikely-huge');
  expect(data.ranked_uncertainties[0].expected_impact).toBe(2);
  expect(data.ranked_uncertainties[1].expected_impact).toBe(1.8);
  expect(data.voi_score).toBeCloseTo(1.9, 1);
  expect(data.baseline).toMatch(/probability-weighted/);
});

it('value_of_information computes partial VoI and its share of the total', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['a', 'b'],
    uncertainties: ['u1', 'u2', 'u3'],
    payoffs: [8, 1, 1],
    sampled_uncertainties: ['u1']
  });

  expect(data.partial_voi.expected_value).toBe(8);
  expect(data.partial_voi.share_of_total).toBe(0.8);
  expect(data.partial_voi.interpretation).toMatch(/most of the total VoI/i);
});

it('value_of_information warns about sampled uncertainties it does not know', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['a'],
    uncertainties: ['u1'],
    payoffs: [5],
    sampled_uncertainties: ['does-not-exist']
  });
  expect(data.warnings.join(' ')).toMatch(/does-not-exist/);
});

it('value_of_information returns a per-option VoI ranking from the payoff matrix', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['polars', 'duckdb'],
    uncertainties: ['latency', 'sql parity'],
    payoffs: [4, 4],
    option_payoffs: {
      polars: [5, 1],
      duckdb: [1, 6]
    }
  });

  // per-option VoI: polars (5+1)/2 = 3 vs duckdb (1+6)/2 = 3.5 -> duckdb first
  expect(data.per_option[0].option).toBe('duckdb');
  expect(data.per_option[0].voi_score).toBe(3.5);
  expect(data.per_option[0].top_uncertainty.uncertainty).toBe('sql parity');
  expect(data.per_option[1].option).toBe('polars');
  expect(data.per_option[1].top_uncertainty.uncertainty).toBe('latency');
  expect(data.nextSteps.join(' ')).toMatch(/favoring/i);
});

it('value_of_information returns a facilitation scaffold without uncertainties', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['a'],
    uncertainties: [],
    payoffs: []
  });
  expect(data.mode).toBe('facilitation');
  expect(data.guiding_questions.length).toBeGreaterThan(0);
});

it('value_of_information warns when payoffs and uncertainties mismatch', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'value_of_information',
    decision_options: ['a'],
    uncertainties: ['u1', 'u2'],
    payoffs: [5]
  });
  expect(data.warnings.join(' ')).toMatch(/missing entries were treated as 0/i);
});

it('drag_point_audit counts keyword occurrences, repeats and density from the log', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'drag_point_audit',
    log: [
      '10:00 ERROR connection refused',
      '10:01 retrying connection',
      '10:01 ERROR connection refused',
      '10:02 ok',
      '10:03 slow query took 4s',
      'timeout while waiting for upstream',
      'timeout while waiting for upstream'
    ].join('\n')
  });

  expect(data.mode).toBe('analysis');
  const byCategory = Object.fromEntries(data.drag_points.map((d: any) => [d.category, d.count]));
  expect(byCategory.error).toBe(2);
  expect(byCategory.retry).toBe(1);
  expect(byCategory.timeout).toBe(2);
  expect(byCategory.slow).toBe(1);
  expect(data.repeated_messages[0]).toEqual({ message: 'timeout while waiting for upstream', count: 2 });
  expect(data.total_line_count).toBe(7);
  // flagged lines: all except '10:02 ok' -> 6 of 7
  expect(data.drag_density).toBe(0.86);
  expect(data.summary_score).toBe(0.86);
});

it('drag_point_audit returns a facilitation scaffold for an empty log', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, { operation: 'drag_point_audit', log: '   ' });
  expect(data.mode).toBe('facilitation');
  expect(data.drag_points).toEqual([]);
  expect(data.guiding_questions.length).toBeGreaterThan(0);
});

it('safe_struggle_designer derives ladder and review interval from the level gap', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'safe_struggle_designer',
    skill: 'sql',
    current_level: 1,
    target_level: 3
  });

  expect(data.level_gap).toBe(2);
  expect(data.scaffold_steps).toHaveLength(2);
  expect(data.scaffold_steps[0]).toContain('level 2');
  expect(data.review_intervals).toBe('weekly');
});

it('safe_struggle_designer evaluates time constraints and deadline overruns', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'safe_struggle_designer',
    skill: 'rust',
    current_level: 1,
    target_level: 5,
    hours_per_week: 2,
    session_minutes: 60,
    deadline_weeks: 2
  });

  // 2 h/week in 60-min sessions = 2 sessions/week; 4 steps -> 2 weeks estimate
  expect(data.estimated_weeks).toBe(2);
  expect(data.plan_basis).toMatch(/2 h\/week/);
  expect(data.success_criteria).toHaveLength(4);
  expect(data.success_criteria[0]).toMatch(/Level 2/);
  expect(data.prerequisite_chain[0].requires).toMatch(/level 1/);
  expect(data.prerequisite_chain[1].requires).toBe(data.scaffold_steps[0]);
  // deadline-driven review interval: 2 weeks * 7 / 4 steps = 4 (rounded) days
  expect(data.review_intervals).toMatch(/every 4 days/);
});

it('safe_struggle_designer warns when the plan exceeds the deadline', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'safe_struggle_designer',
    skill: 'rust',
    current_level: 1,
    target_level: 5,
    hours_per_week: 1,
    deadline_weeks: 1
  });

  // 1 session/week, 4 steps -> 4 weeks > 1 week deadline
  expect(data.estimated_weeks).toBe(4);
  expect(data.warnings.join(' ')).toMatch(/exceeds the 1-week deadline/);
});

it('safe_struggle_designer uses monthly reviews for large gaps and rejects inverted levels', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'safe_struggle_designer',
    skill: 'rust',
    current_level: 1,
    target_level: 6
  });
  expect(data.scaffold_steps).toHaveLength(5);
  expect(data.review_intervals).toBe('monthly');

  await expect(
    getCallback(server)({ operation: 'safe_struggle_designer', skill: 'x', current_level: 3, target_level: 1 }, {})
  ).rejects.toThrow(/must be greater than current_level/);
});

it('comparative_advantage matches tasks against required skills per agent', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'comparative_advantage',
    skills: {
      alice: { sql: 5, python: 1 },
      bob: { sql: 1, python: 5 }
    },
    tasks: {
      migrate_db: ['sql'],
      build_pipeline: ['python']
    }
  });

  const byTask = Object.fromEntries(data.advantage_map.map((e: any) => [e.task, e]));
  expect(byTask.migrate_db.assignee).toBe('alice');
  expect(byTask.migrate_db.score).toBe(5);
  expect(byTask.build_pipeline.assignee).toBe('bob');
  expect(byTask.build_pipeline.score).toBe(5);
  expect(byTask.build_pipeline.breakdown).toHaveLength(2);
  expect(data.status).toBe('success');
});

it('comparative_advantage respects agent capacity with greedy assignment', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'comparative_advantage',
    skills: {
      alice: { sql: 5, python: 4 },
      bob: { sql: 3, python: 5 }
    },
    tasks: {
      t_fast_sql: ['sql'],
      t_big_python: ['python'],
      t_another_python: ['python']
    },
    capacity: { alice: 1, bob: 2 }
  });

  expect(data.assignment_mode).toBe('capacity-aware-greedy');
  const byTask = Object.fromEntries(data.advantage_map.map((e: any) => [e.task, e.assignee]));
  // alice is best for sql (5) -> takes t_fast_sql (capacity 1 exhausted)
  expect(byTask.t_fast_sql).toBe('alice');
  // bob covers both python tasks (capacity 2)
  expect(byTask.t_big_python).toBe('bob');
  expect(byTask.t_another_python).toBe('bob');
  expect(data.advantage_map.every((e: any) => e.assignee !== null)).toBe(true);
});

it('comparative_advantage reports unassigned tasks when capacity is exhausted', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'comparative_advantage',
    skills: { alice: { sql: 5 }, bob: { sql: 2 } },
    tasks: { t1: ['sql'], t2: ['sql'], t3: ['sql'] },
    capacity: { alice: 1, bob: 1 }
  });

  const unassigned = data.advantage_map.filter((e: any) => e.assignee === null);
  expect(unassigned).toHaveLength(1);
  expect(data.warnings.join(' ')).toMatch(/no agent with remaining capacity/);
});

it('comparative_advantage applies cost divisor to the effective score', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'comparative_advantage',
    skills: {
      senior: { sql: 5 },
      junior: { sql: 4 }
    },
    tasks: { migration: ['sql'] },
    costs: { senior: 4, junior: 1 }
  });

  const entry = data.advantage_map[0];
  // effective: senior 5/4 = 1.25 vs junior 4/1 = 4 -> junior wins despite lower skill
  expect(entry.assignee).toBe('junior');
  expect(entry.breakdown[0].agent).toBe('junior');
  expect(data.assignment_mode).toBe('per-task');
});

it('comparative_advantage reports missing skills as warnings', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'comparative_advantage',
    skills: { alice: { sql: 4 } },
    tasks: { infra: ['terraform'] }
  });

  expect(data.advantage_map[0].assignee).toBe('alice'); // only agent, score 0
  expect(data.advantage_map[0].missing_skills).toEqual(['terraform']);
  expect(data.warnings.join(' ')).toMatch(/terraform/);
});

it('analogical_mapper returns an honest scaffold without fabricated analogies', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'analogical_mapper',
    problem: 'Backtest engine choice',
    seed_domains: ['math', 'biology'],
    k: 2
  });

  expect(data.mode).toBe('facilitation');
  expect(data.lenses).toHaveLength(2);
  expect(data.lenses[0].domain).toBe('math');
  expect(data.lenses[0].guiding_questions.length).toBeGreaterThan(0);
  expect(data.analogies).toBeUndefined(); // no fabricated content
  expect(data.suggested_prompts.join(' ')).toMatch(/structure/i);
});

it('seven_seekers_orchestrator returns seven lens scaffolds with guiding questions', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const data = await call(server, {
    operation: 'seven_seekers_orchestrator',
    query: 'Should we rewrite the scanner?',
    downstream_tools: ['decisionframework']
  });

  expect(data.mode).toBe('facilitation');
  expect(data.lenses).toHaveLength(7);
  for (const lens of data.lenses) {
    expect(lens.guiding_questions).toHaveLength(2);
  }
  expect(data.suggested_downstream_tools).toEqual(['decisionframework']);
  expect(data.resonance_map).toBeUndefined(); // fake resonance removed
  expect(data.nextSteps.join(' ')).toMatch(/synthesize/i);
});
