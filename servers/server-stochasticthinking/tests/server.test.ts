import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createStochasticThinkingServer from '../src/index.js';
import { ServerConfigSchema } from '../src/config.js';

/**
 * Creates a factory-built server and a connected in-memory client.
 * Mirrors how the Smithery SDK wires sessions in production.
 */
async function createConnectedPair(config: Record<string, unknown> = {}) {
  const server = createStochasticThinkingServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: ServerConfigSchema.parse(config)
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe('createStochasticThinkingServer (factory)', () => {
  it('lists the stochasticalgorithm tool with its required parameters', async () => {
    const { client } = await createConnectedPair();

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['agents_guide', 'stochasticalgorithm']);
    const stochastic = tools.find((t) => t.name === 'stochasticalgorithm');
    expect(stochastic?.inputSchema.required).toEqual(['algorithm', 'problem', 'parameters']);
  });

  it('creates independent instances per session (no shared module state)', async () => {
    const first = await createConnectedPair({ debug: false });
    const second = await createConnectedPair({ debug: true });

    const [a, b] = await Promise.all([first.client.listTools(), second.client.listTools()]);
    expect(a.tools).toHaveLength(2);
    expect(b.tools).toHaveLength(2);
  });
});

describe('stochasticalgorithm tool calls', () => {
  it('returns an mdp summary', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: 'mdp', problem: 'route planning', parameters: { states: 12, gamma: 0.95 } }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe('success');
    expect(payload.summary).toContain('Optimized policy over 12 states');
    expect(payload.summary).toContain('0.95');
  });

  it.each([
    {
      name: 'mcts',
      arguments: { simulations: 2500, explorationConstant: 1.6 },
      expected: ['Explored 2500 paths', '1.6']
    },
    {
      name: 'bandit',
      arguments: { strategy: 'thompson', epsilon: 0.2 },
      expected: ['thompson strategy', 'ε=0.2']
    },
    {
      name: 'bayesian',
      arguments: { acquisitionFunction: 'upper confidence bound' },
      expected: ['upper confidence bound acquisition']
    },
    {
      name: 'hmm',
      arguments: { algorithm: 'viterbi' },
      expected: ['viterbi algorithm']
    }
  ])('returns a $name summary', async ({ name, arguments: parameters, expected }) => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: name, problem: 'test problem', parameters }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe('success');
    for (const fragment of expected) {
      expect(payload.summary).toContain(fragment);
    }
  });

  it('rejects invalid input with a schema validation error', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: 'mdp' } // problem + parameters missing
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Invalid arguments for tool stochasticalgorithm');
  });

  it('rejects unknown tool names with MethodNotFound', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({ name: 'nonexistent-tool', arguments: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Tool nonexistent-tool not found');
  });
});
