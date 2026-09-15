import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';

/**
 * Tier-1 contract evals (E-plan Phase 3): deterministic, dependency-free
 * checks that every tool behaves according to its contract — dual-mode
 * scaffolds vs. analysis, toolset/individual parity, session accumulation.
 * Runs in CI (`npm test`), no API costs.
 */

async function createConnectedClient() {
  const server = createClearThoughtServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { sessionId: 'test' } as never
  });
  const client = new Client({ name: 'contract-eval', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  expect(res.isError, `tool ${name} returned isError`).toBeUndefined();
  return JSON.parse(res.content[0].text);
}

/** Volatile fields (per-session ids, timestamps) are masked before comparison. */
function canonicalize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/"sessionId":"[^"]*"/g, '"sessionId":"*"')
    .replace(/"createdAt":"[^"]*"/g, '"createdAt":"*"')
    .replace(/"lastAccessedAt":"[^"]*"/g, '"lastAccessedAt":"*"')
    .replace(/"\d{4}-\d{2}-\d{2}T[^"]*"/g, '"*"');
}

function hasScaffold(data: Record<string, unknown>): boolean {
  return (
    data.mode === 'facilitation' ||
    (Array.isArray(data.guiding_questions) && data.guiding_questions.length > 0)
  );
}

describe('contract: dual-mode tools (facilitation vs analysis)', () => {
  const cases = [
    {
      tool: 'concept_map',
      facilitation: { main_concept: 'Testkonzept' },
      analysis: {
        main_concept: 'Testkonzept',
        related_concepts: ['Konzept A', 'Konzept B'],
        relations: ['beinflusst', 'erweitert']
      }
    },
    {
      tool: 'fishbone_diagram',
      facilitation: { problem: 'Hohe Fehlerquote im Release' },
      analysis: {
        problem: 'Hohe Fehlerquote im Release',
        causes: [{ category: 'methods', causes: ['fehlende Tests', 'kein Code-Review'] }]
      }
    },
    {
      tool: 'issue_tree',
      facilitation: { problem: 'Langsame Builds' },
      analysis: { problem: 'Langsame Builds', sub_questions: ['Wo entstehen Engpässe?'] }
    }
  ];

  for (const { tool, facilitation, analysis } of cases) {
    it(`${tool}: returns a guiding scaffold without content`, async () => {
      const client = await createConnectedClient();
      const data = await call(client, tool, facilitation);
      expect(data.status).toBe('success');
      expect(hasScaffold(data), 'facilitation call must provide a scaffold').toBe(true);
    });

    it(`${tool}: returns structured analysis without scaffold when content is given`, async () => {
      const client = await createConnectedClient();
      const data = await call(client, tool, analysis);
      expect(data.status).toBe('success');
      expect(data.mode, 'analysis call must report analysis mode').toBe('analysis');
      expect(hasScaffold(data), 'analysis call must not return the scaffold').toBe(false);
      const contentKeys = Object.keys(data).filter(
        (k) => !['status', 'guiding_questions', 'nextSteps', 'mode'].includes(k)
      );
      expect(contentKeys.length, 'analysis call must carry content fields').toBeGreaterThan(0);
    });
  }
});

describe('contract: toolset parity (individual ≡ toolset call)', () => {
  const cases = [
    {
      tool: 'sequential_thinking',
      toolset: 'reasoning',
      args: { thought: 'parity check', thoughtNumber: 1, totalThoughts: 3, nextThoughtNeeded: true }
    },
    {
      tool: 'mind_map',
      toolset: 'visualization',
      args: { topic: 'parity', branches: [{ title: 'Branch A', subtopics: ['a1', 'a2'] }] }
    },
    {
      tool: 'drag_point_audit',
      toolset: 'utility',
      args: { log: 'error\nerror\nwarning\nok\nretry timeout' }
    }
  ];

  for (const { tool, toolset, args } of cases) {
    it(`${tool}: individual and ${toolset} toolset calls produce identical output`, async () => {
      const viaIndividual = await call(await createConnectedClient(), tool, args);
      const viaToolset = await call(await createConnectedClient(), toolset, {
        operation: tool,
        ...args
      });
      expect(canonicalize(viaToolset)).toBe(canonicalize(viaIndividual));
    });
  }

  it('session family: session_export parity across call paths', async () => {
    const args = { format: 'json' };
    const viaIndividual = await call(await createConnectedClient(), 'session_export', args);
    const viaToolset = await call(await createConnectedClient(), 'session', {
      operation: 'session_export',
      ...args
    });
    expect(canonicalize(viaToolset)).toBe(canonicalize(viaIndividual));
  });
});

describe('contract: session state accumulates within a session', () => {
  it('sequential_thinking counts thoughts per session (and not across sessions)', async () => {
    const clientA = await createConnectedClient();
    const base = { thought: 'x', totalThoughts: 5, nextThoughtNeeded: true };
    await clientA.callTool({ name: 'sequential_thinking', arguments: { ...base, thoughtNumber: 1 } });
    const second = await call(clientA, 'sequential_thinking', { ...base, thoughtNumber: 2 });
    expect(second.sessionContext.totalThoughts).toBe(2);

    const clientB = await createConnectedClient();
    const fresh = await call(clientB, 'sequential_thinking', { ...base, thoughtNumber: 1 });
    expect(fresh.sessionContext.totalThoughts).toBe(1);
  });
});
