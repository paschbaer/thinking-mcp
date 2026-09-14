import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';
import { TOOL_METADATA } from '../src/tools/tool-metadata.js';

/**
 * Connects a client to a factory-built server over an in-memory pair.
 * Mirrors how the Smithery SDK wires sessions in production.
 */
async function createConnectedClient() {
  const server = createClearThoughtServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { sessionId: 'test' } as never
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

interface ToolInfo {
  name: string;
  annotations?: { title?: string; idempotentHint?: boolean };
  inputSchema: { properties?: Record<string, { description?: unknown }> };
  outputSchema?: { properties?: Record<string, unknown> };
}

describe('tool metadata registry (RB-10)', () => {
  it('covers every registered tool (no metadata gaps)', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    const missing = names.filter((name) => !(name in TOOL_METADATA));
    expect(missing).toEqual([]);
    expect(names.length).toBe(Object.keys(TOOL_METADATA).length);
  });

  it('gives every tool a human-readable annotation title', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools as unknown as ToolInfo[]) {
      const title = tool.annotations?.title;
      expect(title, `tool ${tool.name} has no title`).toBeTruthy();
      expect(title, `tool ${tool.name} title is still the raw name`).not.toBe(tool.name);
      expect(title, `tool ${tool.name} title is not human-readable`).toMatch(/[A-Z]/);
    }
  });

  it('marks stateful tools idempotentHint=false and pure tools true', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools as unknown as ToolInfo[]) {
      const metadata = TOOL_METADATA[tool.name];
      const expected = !(metadata?.stateful ?? false);
      expect(
        tool.annotations?.idempotentHint,
        `tool ${tool.name} idempotentHint should be ${expected}`
      ).toBe(expected);
    }
  });

  it('defines at least one top-level property in every output schema', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools as unknown as ToolInfo[]) {
      const props = Object.keys(tool.outputSchema?.properties ?? {});
      expect(
        props.length,
        `tool ${tool.name} output schema is passthrough-only`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('describes every input parameter (no bare fields)', async () => {
    const client = await createConnectedClient();
    const { tools } = await client.listTools();

    for (const tool of tools as unknown as ToolInfo[]) {
      const undescribed = Object.entries(tool.inputSchema?.properties ?? {})
        .filter(([, schema]) => typeof schema.description !== 'string')
        .map(([key]) => key);
      expect(undescribed, `tool ${tool.name} has undescribed params`).toEqual([]);
    }
  });

  it('structuredContent round-trips through the registry schema', async () => {
    const client = await createConnectedClient();

    // Stateless echo tool
    const echo = await client.callTool({
      name: 'existing_tool_example',
      arguments: { text: 'smoke' }
    });
    expect(echo.isError).toBeUndefined();
    expect(echo.structuredContent).toBeDefined();

    // Dual-mode facilitation tool
    const mindMap = await client.callTool({
      name: 'mind_map',
      arguments: { topic: 'test topic' }
    });
    expect(mindMap.isError).toBeUndefined();
    expect(mindMap.structuredContent).toBeDefined();

    // Session tool
    const info = await client.callTool({ name: 'session_info', arguments: {} });
    expect(info.isError).toBeUndefined();
    expect(info.structuredContent).toBeDefined();
  });
});
