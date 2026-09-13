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
  it('solves an mdp with value iteration (measured value function)', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'mdp',
        problem: 'two-state savings problem',
        parameters: {
          states: ['poor', 'rich'],
          actions: ['work', 'slack'],
          transitions: [
            [
              [0, 1],
              [1, 0]
            ],
            [
              [0, 1],
              [0, 1]
            ]
          ],
          rewards: [
            [0, 0.1],
            [1, 1]
          ],
          gamma: 0.9
        }
      }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe('success');
    expect(payload.hasResult).toBe(true);
    expect(payload.summary).toContain('Value iteration converged');
    expect(payload.details.valueFunction[0]).toBeCloseTo(9, 6);
    expect(payload.details.valueFunction[1]).toBeCloseTo(10, 6);
    expect(payload.details.policy).toEqual([0, 0]);
    // structuredContent mirrors the text payload (SDK output schema path)
    expect(res.structuredContent?.status).toBe('success');
  });

  it('searches a gridworld with real UCT (mcts)', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'mcts',
        problem: 'reach the goal in a corridor',
        parameters: {
          environment: { rows: 1, cols: 3, start: [0, 0], goal: [0, 2], walls: [], traps: [] },
          simulations: 400,
          explorationConstant: 1.4,
          seed: 7
        }
      }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe('success');
    expect(payload.summary).toContain('best action "right"');
    expect(payload.details.bestAction).toBe('right');
    expect(payload.details.terminalStats.goalsReached).toBeGreaterThan(0);
  });

  it('runs a bandit with session-persisted state across calls', async () => {
    const { client } = await createConnectedPair();
    const base = {
      arms: [
        { type: 'bernoulli', p: 0.9 },
        { type: 'bernoulli', p: 0.1 }
      ],
      strategy: 'UCB'
    };

    const first = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bandit',
        problem: 'explore two options',
        parameters: { ...base, pulls: 100, seed: 11 }
      }
    });
    expect(first.isError).toBeUndefined();
    const firstPayload = JSON.parse(first.content[0].text);
    expect(firstPayload.summary).toMatch(/Bandit \(UCB/);
    expect(firstPayload.details.runId).toBe('bandit-1');

    const second = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bandit',
        problem: 'continue the same run',
        parameters: { ...base, pulls: 50, runId: firstPayload.details.runId }
      }
    });
    expect(second.isError).toBeUndefined();
    const secondPayload = JSON.parse(second.content[0].text);
    expect(secondPayload.details.cumulative.totalPulls).toBe(150);
    expect(secondPayload.details.perArm[0].pulls).toBeGreaterThan(
      secondPayload.details.perArm[1].pulls
    );
  });

  it('proposes the next Bayesian-optimization point via Expected Improvement', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bayesian',
        problem: 'tune a hyperparameter on a quadratic response',
        parameters: {
          observations: [
            [0, -4],
            [1, -1],
            [3, -1],
            [4, -4]
          ],
          bounds: [0, 4],
          maximize: true
        }
      }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.summary).toContain('next evaluation at x=');
    expect(payload.details.nextX).toBeGreaterThan(1);
    expect(payload.details.nextX).toBeLessThan(3);
    expect(payload.details.expectedImprovement).toBeGreaterThanOrEqual(0);
  });

  it('infers the known Viterbi path for the weather HMM', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'hmm',
        problem: 'infer weather from activities',
        parameters: {
          states: ['Rainy', 'Sunny'],
          observationSymbols: ['walk', 'shop', 'clean'],
          observations: ['walk', 'shop', 'clean'],
          transitions: [
            [0.7, 0.3],
            [0.4, 0.6]
          ],
          emissions: [
            [0.1, 0.4, 0.5],
            [0.6, 0.3, 0.1]
          ],
          initial: [0.6, 0.4],
          algorithm: 'both'
        }
      }
    });
    expect(res.isError).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.details.viterbi.path).toEqual(['Sunny', 'Rainy', 'Rainy']);
    expect(payload.details.forwardBackward.logLikelihood).toBeLessThan(0);
    expect(payload.summary).toContain('Viterbi path Sunny→Rainy→Rainy');
  });

  it('returns isError with a helpful message for missing model inputs', async () => {
    const { client } = await createConnectedPair();

    const res = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: 'mdp', problem: 'underspecified', parameters: {} }
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('invalid mdp parameters');
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe('failed');
    expect(payload.details.error).toContain('transitions');
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
