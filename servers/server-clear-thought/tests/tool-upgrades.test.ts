import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerConceptMap } from '../src/tools/concept-map.js';
import { registerFishboneDiagram } from '../src/tools/fishbone-diagram.js';
import { registerIssueTree } from '../src/tools/issue-tree.js';

function setup(toolRegister: (s: McpServer, st: SessionState) => void) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  toolRegister(server, state);
  return server;
}

async function call(server: McpServer, tool: string, args: Record<string, unknown>) {
  const registered: any = (server as any)._registeredTools[tool];
  const result = await registered.handler(args, {});
  return JSON.parse(result.content[0].text);
}

it('concept_map builds nodes and labeled links from provided concepts', async () => {
  const server = setup(registerConceptMap);
  const data = await call(server, 'concept_map', {
    main_concept: 'backtesting',
    related_concepts: ['data quality', 'execution model'],
    relations: ['depends on', 'simulated by']
  });

  expect(data.mode).toBe('analysis');
  expect(data.nodes).toEqual(['backtesting', 'data quality', 'execution model']);
  expect(data.links[0]).toEqual({ from: 'backtesting', to: 'data quality', relation: 'depends on' });
  expect(data.links[1].relation).toBe('simulated by');
  expect(data.relation_count).toBe(2);
});

it('concept_map falls back to a facilitation scaffold without related concepts', async () => {
  const server = setup(registerConceptMap);
  const data = await call(server, 'concept_map', { main_concept: 'latency' });

  expect(data.mode).toBe('facilitation');
  expect(data.nodes).toEqual(['latency']);
  expect(data.links).toEqual([]);
  expect(data.guiding_questions.length).toBeGreaterThan(0);
  // no fabricated "sub1" placeholders
  expect(JSON.stringify(data)).not.toContain('latency sub1');
});

it('fishbone_diagram builds the diagram from provided causes', async () => {
  const server = setup(registerFishboneDiagram);
  const data = await call(server, 'fishbone_diagram', {
    problem: 'nightly import fails',
    causes: [
      { category: 'methods', causes: ['no retry', 'hard cutoff at 23:00'] },
      { category: 'environment', causes: ['shared db maintenance window'] }
    ]
  });

  expect(data.mode).toBe('analysis');
  expect(data.causes_map).toEqual([
    { category: 'methods', causes: ['no retry', 'hard cutoff at 23:00'] },
    { category: 'environment', causes: ['shared db maintenance window'] }
  ]);
  expect(data.total_cause_count).toBe(3);
  expect(data.nextSteps.join(' ')).toMatch(/debuggingapproach/);
});

it('fishbone_diagram scaffolds guiding questions without causes', async () => {
  const server = setup(registerFishboneDiagram);
  const data = await call(server, 'fishbone_diagram', { problem: 'flaky tests' });

  expect(data.mode).toBe('facilitation');
  expect(data.causes_map.length).toBeGreaterThanOrEqual(4);
  for (const bone of data.causes_map) {
    expect(bone.causes).toEqual([]);
    expect(bone.guiding_question).toBeDefined();
  }
  expect(data.total_cause_count).toBe(0);
});

it('issue_tree builds the tree from provided sub-questions', async () => {
  const server = setup(registerIssueTree);
  const data = await call(server, 'issue_tree', {
    problem: 'Why is the import slow?',
    depth: 2,
    sub_questions: ['Is it network or compute bound?', 'Is data volume the driver?']
  });

  expect(data.mode).toBe('analysis');
  expect(data.tree.question).toBe('Why is the import slow?');
  expect(data.tree.sub_questions).toHaveLength(2);
  expect(data.tree.sub_questions[0].sub_questions).toEqual([]);
  expect(data.node_count).toBe(3);
});

it('issue_tree scaffolds decomposition questions without sub-questions', async () => {
  const server = setup(registerIssueTree);
  const data = await call(server, 'issue_tree', { problem: 'Why is the import slow?', depth: 2 });

  expect(data.mode).toBe('facilitation');
  expect(data.tree.sub_questions).toEqual([]);
  expect(data.decomposition_questions.join(' ')).toMatch(/MECE/);
  expect(data.nextSteps.join(' ')).toMatch(/sub_questions/);
});
