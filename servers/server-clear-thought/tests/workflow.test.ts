import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';

/**
 * Tier-1 contract tests for `recipe_runner` (track C): navigation across
 * calls requires a real session, so these run through the MCP client.
 */

async function createConnectedClient() {
  const server = createClearThoughtServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { sessionId: 'test' } as never
  });
  const client = new Client({ name: 'workflow-eval', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function run(client: Client, args: Record<string, unknown>) {
  const res = await client.callTool({ name: 'recipe_runner', arguments: args });
  expect(res.isError).toBeUndefined();
  return JSON.parse(res.content[0].text);
}

describe('recipe_runner', () => {
  it('lists all six recipes with their stage tools', async () => {
    const client = await createConnectedClient();
    const data = await run(client, { recipe: 'debug-failure', action: 'list' });
    expect(data.recipes).toHaveLength(6);
    expect(data.recipes.map((r: { id: string }) => r.id)).toContain('long-research-question');
  });

  it('starts a recipe at stage 1', async () => {
    const client = await createConnectedClient();
    const data = await run(client, { recipe: 'debug-failure', action: 'start' });
    expect(data.mode).toBe('started');
    expect(data.total_stages).toBe(4);
    expect(data.progress).toBe('1/4');
    expect(data.current_stage.tool).toBe('sequentialthinking');
    expect(data.next_action).toContain('advance');
  });

  it('advances through all stages to completion', async () => {
    const client = await createConnectedClient();
    await run(client, { recipe: 'architecture-decision', action: 'start' });

    const a1 = await run(client, { recipe: 'architecture-decision', action: 'advance' });
    expect(a1.mode).toBe('advanced');
    expect(a1.progress).toBe('2/5');
    expect(a1.current_stage.tool).toBe('swot_analysis');

    await run(client, { recipe: 'architecture-decision', action: 'advance' });
    const a3 = await run(client, { recipe: 'architecture-decision', action: 'advance' });
    expect(a3.progress).toBe('4/5');
    expect(a3.current_stage.tool).toBe('decisionframework');

    const a4 = await run(client, { recipe: 'architecture-decision', action: 'advance' });
    expect(a4.progress).toBe('5/5');
    expect(a4.current_stage.tool).toBe('metacognitivemonitoring');

    const a5 = await run(client, { recipe: 'architecture-decision', action: 'advance' });
    expect(a5.mode).toBe('completed');
    expect(a5.tools_in_order).toEqual([
      'issue_tree',
      'swot_analysis',
      'value_of_information',
      'decisionframework',
      'metacognitivemonitoring'
    ]);
  });

  it('auto-starts when advancing an unstarted run', async () => {
    const client = await createConnectedClient();
    const data = await run(client, { recipe: 'open-ended-ideation', action: 'advance' });
    expect(data.mode).toBe('started');
    expect(data.current_stage.tool).toBe('creativethinking');
  });

  it('keeps progress isolated per session', async () => {
    const clientA = await createConnectedClient();
    const clientB = await createConnectedClient();
    await run(clientA, { recipe: 'debug-failure', action: 'start' });

    const statusB = await run(clientB, { recipe: 'debug-failure', action: 'status' });
    expect(statusB.started).toBe(false);
  });

  it('status without start shows the full plan', async () => {
    const client = await createConnectedClient();
    const data = await run(client, { recipe: 'multi-agent-delegation', action: 'status' });
    expect(data.started).toBe(false);
    expect(data.all_stages.map((s: { tool: string }) => s.tool)).toEqual([
      'comparative_advantage',
      'drag_point_audit',
      'safe_struggle_designer'
    ]);
  });

  it('reset discards progress', async () => {
    const client = await createConnectedClient();
    await run(client, { recipe: 'debug-failure', action: 'start' });
    const afterReset = await run(client, { recipe: 'debug-failure', action: 'reset' });
    expect(afterReset.mode).toBe('reset');
    const status = await run(client, { recipe: 'debug-failure', action: 'status' });
    expect(status.started).toBe(false);
  });

  it('rejects unknown recipe names with a validation error', async () => {
    const client = await createConnectedClient();
    const res = await client.callTool({
      name: 'recipe_runner',
      arguments: { recipe: 'does-not-exist', action: 'start' }
    });
    expect(res.isError).toBe(true);
  });
});
