import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerAgentsGuide } from '../src/tools/agents-guide.js';
import { AGENTS_TEMPLATE } from '../src/tools/agents-guide-template.js';
import { registerUtilityToolset } from '../src/toolsets/utility.js';

const START = '<!-- clear-thought:agents-guide:start -->';
const END = '<!-- clear-thought:agents-guide:end -->';

function setupServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  return { server, state };
}

function getTool(server: McpServer, name: string): any {
  return (server as any)._registeredTools[name];
}

async function call(server: McpServer, args: Record<string, unknown>) {
  const result = await getTool(server, 'agents_guide').handler(args, {});
  return JSON.parse(result.content[0].text);
}

it('full mode returns a complete document with substituted placeholders', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {
    project_name: 'Tradix',
    domain_context: 'Algorithmic trading.',
    codebase_root: 'C:/repos/Tradix'
  });

  expect(data.mode).toBe('full');
  expect(data.content).toContain('# Clear Thought — Reasoning Tool Guide for Tradix');
  expect(data.content).toContain('Algorithmic trading.');
  expect(data.content).toContain('C:/repos/Tradix');
  // template meta preamble must not leak into the final document
  expect(data.content).not.toContain('Template usage');
  // guide body wrapped in markers for later in-place updates
  expect(data.content.indexOf(START)).toBeLessThan(data.content.indexOf('## Ground rules'));
  expect(data.content).toContain(END);
  expect(data.unresolved_placeholders).toEqual([]);
});

it('reports unresolved placeholders when optional context is omitted', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {});
  expect(data.mode).toBe('full');
  expect(data.unresolved_placeholders).toEqual(
    expect.arrayContaining(['{{PROJECT_NAME}}', '{{DOMAIN_CONTEXT}}', '{{CODEBASE_ROOT}}'])
  );
});

it('merge mode integrates the guide into existing content without duplication', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {
    project_name: 'Tradix',
    existing_agents_md: '# Tradix Rules\n\nAlways run tests before committing.\n'
  });

  expect(data.mode).toBe('merge');
  expect(data.block_replaced).toBe(false);
  expect(data.content.startsWith('# Tradix Rules')).toBe(true);
  expect(data.content).toContain('Always run tests before committing.');
  expect(data.content).toContain(START);
  expect(data.content).toContain('## Clear Thought — Reasoning Tool Guide');
  expect(data.content.split(START).length - 1).toBe(1);
});

it('re-merging replaces the existing guide block in place', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const first = await call(server, { project_name: 'Tradix', existing_agents_md: '# Rules\n' });
  const second = await call(server, {
    project_name: 'Tradix v2',
    existing_agents_md: first.content
  });

  expect(second.mode).toBe('merge');
  expect(second.block_replaced).toBe(true);
  expect(second.content.split(START).length - 1).toBe(1);
  // provided context is surfaced under the merge heading and updated in place
  expect(second.content).toContain('Project: Tradix v2\n');
  expect(second.content).not.toContain('Project: Tradix\n');
});

it('is exposed through the utility toolset with advertised parameters', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const json: any = zodToJsonSchema(getTool(server, 'utility').inputSchema);
  expect(json.properties.operation.enum).toContain('agents_guide');
  for (const field of ['project_name', 'domain_context', 'codebase_root', 'existing_agents_md']) {
    expect(json.properties[field]).toBeDefined();
  }

  const handler = getTool(server, 'utility').handler;
  const result = await handler({ operation: 'agents_guide', project_name: 'ViaToolset' }, {});
  const data = JSON.parse(result.content[0].text);
  expect(data.mode).toBe('full');
  expect(data.content).toContain('Guide for ViaToolset');
});

it('rejects whitespace-only parameter values', () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const schema = getTool(server, 'agents_guide').inputSchema;
  expect(schema.safeParse({ project_name: '   ' }).success).toBe(false);
  expect(schema.safeParse({ existing_agents_md: '' }).success).toBe(false);
});

it('embedded template stays in sync with AGENTS.template.md', () => {
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const onDisk = readFileSync(join(pkgRoot, 'AGENTS.template.md'), 'utf8').replace(/\r\n/g, '\n');
  expect(AGENTS_TEMPLATE).toBe(onDisk);
});

it('merge surfaces codebase_root as context line', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {
    project_name: 'Tradix',
    codebase_root: 'C:/repos/Tradix',
    existing_agents_md: '# Rules\n'
  });
  expect(data.content).toContain('Project: Tradix');
  expect(data.content).toContain('Codebase root: C:/repos/Tradix');
});

it('appends with a warning instead of deleting content around corrupt markers', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  // stray START without END: a naive span replace would delete user content
  const corrupt = '# Rules\n' + START + '\nuser notes that must survive\n';
  const data = await call(server, { project_name: 'P', existing_agents_md: corrupt });

  expect(data.block_replaced).toBe(false);
  expect(data.warning).toMatch(/incomplete or duplicated/i);
  // nothing was deleted — corrupt markers and user content are still present
  expect(data.content).toContain('user notes that must survive');
  expect(data.content.split(START).length - 1).toBe(2);
});

it('appends with a warning when END appears before START', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const corrupt = '# Rules\n' + END + '\nsome text\n' + START + '\nbody\n';
  const data = await call(server, { project_name: 'P', existing_agents_md: corrupt });

  expect(data.block_replaced).toBe(false);
  expect(data.warning).toBeDefined();
  expect(data.content).toContain('some text');
});
