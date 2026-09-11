import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerMindMap } from '../src/tools/mind-map.js';
import { registerVisualizationToolset } from '../src/toolsets/visualization.js';


it('generates branches from caller content', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  registerMindMap(server, state);
  // Access the registered tool (private API)
  const tool: any = (server as any)._registeredTools['mind_map'];
  const result = await tool.handler(
    {
      topic: 'cats',
      branches: [
        { title: 'anatomy', subtopics: ['digits', 'whiskers'] },
        { title: 'behavior', subtopics: ['hunting'] }
      ]
    },
    {}
  );
  const data = JSON.parse(result.content[0].text);

  expect(data.mode).toBe('analysis');
  expect(data.branch_count).toBe(2);
  expect(data.map[0]).toEqual({ branch: 'anatomy', subtopics: ['digits', 'whiskers'] });
  // no fabricated placeholder branches
  expect(result.content[0].text).not.toContain('cats aspect');
});

it('returns a facilitation scaffold without branches', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  registerMindMap(server, state);
  const tool: any = (server as any)._registeredTools['mind_map'];
  const result = await tool.handler({ topic: 'cats', num_branches: 4 }, {});
  const data = JSON.parse(result.content[0].text);

  expect(data.mode).toBe('facilitation');
  expect(data.map).toEqual([]);
  expect(data.suggested_branch_count).toBe(4);
  expect(data.guiding_questions.length).toBeGreaterThan(0);
  expect(result.content[0].text).not.toContain('cats aspect');
});

it('generates branches via the visualization toolset', async () => {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  registerVisualizationToolset(server, state);
  const tool: any = (server as any)._registeredTools['visualization'];
  const result = await tool.handler(
    { operation: 'mind_map', topic: 'cats', branches: [{ title: 'anatomy' }] },
    {}
  );
  const data = JSON.parse(result.content[0].text);

  expect(data.mode).toBe('analysis');
  expect(data.map[0].branch).toBe('anatomy');
});
