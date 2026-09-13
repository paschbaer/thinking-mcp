import { expect, it, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createStochasticThinkingServer from '../src/index.js';
import { AGENTS_TEMPLATE } from '../src/tools/agents-guide-template.js';

const START = '<!-- stochastic-thinking:agents-guide:start -->';
const END = '<!-- stochastic-thinking:agents-guide:end -->';
const CLEAR_THOUGHT_START = '<!-- clear-thought:agents-guide:start -->';
const CLEAR_THOUGHT_END = '<!-- clear-thought:agents-guide:end -->';

/** Connects a client to a factory-built server over an in-memory pair. */
async function createConnectedClient() {
  const server = createStochasticThinkingServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { debug: false }
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function callAgentsGuide(args: Record<string, unknown>) {
  const client = await createConnectedClient();
  const res = await client.callTool({ name: 'agents_guide', arguments: args });
  return { data: JSON.parse(res.content[0].text), raw: res };
}

describe('agents_guide tool', () => {
  it('is listed next to stochasticalgorithm', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['agents_guide', 'stochasticalgorithm']);
  });

  it('full mode returns a complete document with substituted placeholders', async () => {
    const { data } = await callAgentsGuide({
      project_name: 'Tradix',
      domain_context: 'Algorithmic trading.',
      codebase_root: 'C:/repos/Tradix'
    });

    expect(data.mode).toBe('full');
    expect(data.content).toContain('# Stochastic Thinking — Decision Tool Guide for Tradix');
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
    const { data } = await callAgentsGuide({});
    expect(data.mode).toBe('full');
    expect(data.unresolved_placeholders).toEqual(
      expect.arrayContaining(['{{PROJECT_NAME}}', '{{DOMAIN_CONTEXT}}', '{{CODEBASE_ROOT}}'])
    );
  });

  it('merge mode integrates the guide into existing content without duplication', async () => {
    const { data } = await callAgentsGuide({
      project_name: 'Tradix',
      existing_agents_md: '# Tradix Rules\n\nAlways run tests before committing.\n'
    });

    expect(data.mode).toBe('merge');
    expect(data.block_replaced).toBe(false);
    expect(data.content.startsWith('# Tradix Rules')).toBe(true);
    expect(data.content).toContain('Always run tests before committing.');
    expect(data.content).toContain(START);
    expect(data.content).toContain('## Stochastic Thinking — Decision Tool Guide');
    expect(data.content.split(START).length - 1).toBe(1);
  });

  it('re-merging replaces the existing guide block in place', async () => {
    const first = await callAgentsGuide({ project_name: 'Tradix', existing_agents_md: '# Rules\n' });
    const second = await callAgentsGuide({
      project_name: 'Tradix v2',
      existing_agents_md: first.data.content
    });

    expect(second.data.mode).toBe('merge');
    expect(second.data.block_replaced).toBe(true);
    expect(second.data.content.split(START).length - 1).toBe(1);
    // provided context is surfaced under the merge heading and updated in place
    expect(second.data.content).toContain('Project: Tradix v2\n');
    expect(second.data.content).not.toContain('Project: Tradix\n');
  });

  it('only touches stochastic-thinking markers and preserves foreign guide blocks', async () => {
    const existing =
      '# Rules\n\n' +
      `${CLEAR_THOUGHT_START}\nClear Thought guide content that must survive.\n${CLEAR_THOUGHT_END}\n`;
    const { data } = await callAgentsGuide({ project_name: 'Tradix', existing_agents_md: existing });

    expect(data.mode).toBe('merge');
    expect(data.block_replaced).toBe(false);
    expect(data.content).toContain(CLEAR_THOUGHT_START);
    expect(data.content).toContain('Clear Thought guide content that must survive.');
    expect(data.content).toContain(CLEAR_THOUGHT_END);
    expect(data.content.split(CLEAR_THOUGHT_START).length - 1).toBe(1);
    expect(data.content.split(START).length - 1).toBe(1);
  });

  it('rejects whitespace-only parameter values', async () => {
    const client = await createConnectedClient();
    const res = await client.callTool({
      name: 'agents_guide',
      arguments: { project_name: '   ' }
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Input validation error');
  });

  it('embedded template stays in sync with AGENTS.template.md', () => {
    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const onDisk = readFileSync(join(pkgRoot, 'AGENTS.template.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(AGENTS_TEMPLATE).toBe(onDisk);
  });
});
