import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';

/**
 * Merge contract tests (plan `merge-stochastic-into-clear-thought.md`,
 * phase 1/4): the individual `stochasticalgorithm` tool and the grouped
 * `stochastic` toolset must behave identically, bandit runs must persist
 * per session across BOTH call paths, and invalid input must surface as
 * isError results with the expected-parameter message.
 */
async function createConnectedClient() {
  const server = createClearThoughtServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { sessionId: 'test' } as never
  });
  const client = new Client({ name: 'stochastic-merge-eval', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const MDP_ARGS = {
  problem: 'save or spend',
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
};

describe('stochastic merge contract', () => {
  it('mdp: individual and toolset calls produce identical measured output', async () => {
    const client = await createConnectedClient();
    const viaIndividual = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: 'mdp', ...MDP_ARGS }
    });
    const viaToolset = await client.callTool({
      name: 'stochastic',
      arguments: { operation: 'mdp', ...MDP_ARGS }
    });
    expect(viaIndividual.isError).toBeUndefined();
    expect(viaToolset.isError).toBeUndefined();
    const a = viaIndividual.structuredContent as Record<string, unknown>;
    const b = viaToolset.structuredContent as Record<string, unknown>;
    expect(a.status).toBe('success');
    expect(JSON.stringify(a.details)).toBe(JSON.stringify(b.details));
    // Hand-checked toy problem: V(poor) = 9, V(rich) = 10, "work" dominates.
    const details = a.details as { valueFunction: number[]; policy: number[]; converged: boolean };
    expect(details.valueFunction[0]).toBeCloseTo(9, 6);
    expect(details.valueFunction[1]).toBeCloseTo(10, 6);
    expect(details.policy[0]).toBe(0);
    expect(details.converged).toBe(true);
  });

  it('bandit: runId continues a run across calls AND across call paths', async () => {
    const client = await createConnectedClient();
    const arms = [
      { type: 'bernoulli', p: 0.9 },
      { type: 'bernoulli', p: 0.1 }
    ];
    const first = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bandit',
        problem: 'two buttons',
        parameters: { arms, strategy: 'UCB', pulls: 100, seed: 11 }
      }
    });
    expect(first.isError).toBeUndefined();
    const runId = ((first.structuredContent as Record<string, any>).details as any).runId;
    expect(String(runId)).toMatch(/^bandit-/);

    const second = await client.callTool({
      name: 'stochastic',
      arguments: {
        operation: 'bandit',
        problem: 'two buttons',
        parameters: { arms, strategy: 'UCB', pulls: 50, seed: 11, runId }
      }
    });
    expect(second.isError).toBeUndefined();
    const cum = ((second.structuredContent as Record<string, any>).details as any).cumulative;
    expect(cum.totalPulls).toBe(150);
  });

  it('invalid parameters surface as isError with the expected-shape message', async () => {
    const client = await createConnectedClient();
    const res = await client.callTool({
      name: 'stochastic',
      arguments: { operation: 'mdp', problem: 'broken', parameters: { transitions: 'nope' } }
    });
    expect(res.isError).toBe(true);
    const payload = res.structuredContent as Record<string, any>;
    expect(payload.status).toBe('failed');
    expect(String(payload.details.error)).toContain('row-stochastic');
  });

  it('unknown operation and unknown algorithm fail cleanly', async () => {
    const client = await createConnectedClient();
    const badOp = await client.callTool({
      name: 'stochastic',
      arguments: { operation: 'quantum_annealing', problem: 'x', parameters: {} }
    });
    expect(badOp.isError).toBe(true);
    const badAlgo = await client.callTool({
      name: 'stochasticalgorithm',
      arguments: { algorithm: 'quantum_annealing', problem: 'x', parameters: {} }
    });
    expect(badAlgo.isError).toBe(true);
  });

  it('registers both call paths exactly once (tool + toolset enum)', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();
    const individual = tools.find((t) => t.name === 'stochasticalgorithm');
    const toolset = tools.find((t) => t.name === 'stochastic');
    expect(individual).toBeDefined();
    expect(toolset).toBeDefined();
    const ops = (toolset as any).inputSchema?.properties?.operation?.enum ?? [];
    expect(ops).toEqual(['mdp', 'mcts', 'bandit', 'bayesian', 'hmm']);
  });
});
