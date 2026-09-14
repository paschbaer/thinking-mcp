import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createClearThoughtServer from '../src/index.js';

/**
 * Tier-1 contract tests for roadmap track D: session resources (D1),
 * workflow prompts (D2) and file-backed persistence (D3).
 */

type Config = Record<string, unknown>;

async function createConnectedClient(config: Config = {}) {
  const server = createClearThoughtServer({
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    config: { sessionId: 'test', ...config } as never
  });
  const client = new Client({ name: 'track-d-eval', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  return res;
}

describe('D1 — session resources', () => {
  it('lists the four session resources', async () => {
    const client = await createConnectedClient();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      'clear-thought://session/export',
      'clear-thought://session/stats',
      'clear-thought://session/thoughts',
      'clear-thought://session/workflows'
    ]);
  });

  it('stats resource reflects live session state', async () => {
    const client = await createConnectedClient();
    await call(client, 'sequentialthinking', {
      thought: 'resource probe',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true
    });

    const read = await client.readResource({ uri: 'clear-thought://session/stats' });
    const text = read.contents[0].text as string;
    expect(JSON.parse(text).thoughtCount).toBe(1);
  });

  it('thoughts and workflows resources return JSON payloads', async () => {
    const client = await createConnectedClient();
    const thoughts = await client.readResource({ uri: 'clear-thought://session/thoughts' });
    expect(JSON.parse(thoughts.contents[0].text as string)).toEqual([]);

    const workflows = await client.readResource({ uri: 'clear-thought://session/workflows' });
    expect(JSON.parse(workflows.contents[0].text as string)).toEqual([]);
  });
});

describe('D2 — workflow prompts', () => {
  it('lists one prompt per recipe (six)', async () => {
    const client = await createConnectedClient();
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual([
      'architecture-decision',
      'debug-failure',
      'long-research-question',
      'multi-agent-delegation',
      'open-ended-ideation',
      'stress-test-conclusion'
    ]);
  });

  it('renders a user message that references the matching recipe', async () => {
    const client = await createConnectedClient();
    const result = await client.getPrompt({
      name: 'debug-failure',
      arguments: { failure_description: 'checkout returns 500 on discount codes' }
    });
    const message = result.messages[0];
    expect(message.role).toBe('user');
    const text = (message.content as { type: string; text: string }).text;
    expect(text).toContain('checkout returns 500 on discount codes');
    expect(text).toContain("recipe 'debug-failure'");
    expect(text).toContain('recipe_runner');
  });
});

describe('D3 — file-backed persistence', () => {
  it('save → file on disk → load restores into a fresh session', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'ct-persist-'));
    const writer = await createConnectedClient({ dataDir });

    // Make the session non-empty.
    await call(writer, 'sequentialthinking', {
      thought: 'persist me',
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false
    });

    const saved = await call(writer, 'session_save', { name: 'run-a' });
    expect(saved.isError).toBeUndefined();
    const savedPayload = JSON.parse(saved.content[0].text);
    expect(savedPayload.status).toBe('success');
    expect(existsSync(savedPayload.saved)).toBe(true);

    const file = JSON.parse(await readFile(savedPayload.saved, 'utf8'));
    expect(file.data).toBeDefined();

    // Fresh session over the same dataDir loads the state back.
    const reader = await createConnectedClient({ dataDir });
    const loaded = await call(reader, 'session_load', { name: 'run-a' });
    expect(loaded.isError).toBeUndefined();
    const loadedPayload = JSON.parse(loaded.content[0].text);
    expect(loadedPayload.status).toBe('success');
    expect(loadedPayload.stats.thoughtCount).toBe(1);

    // And the thoughts resource reflects the restored state.
    const thoughts = await client_thoughts(reader);
    expect(JSON.parse(thoughts.contents[0].text as string)[0].thought).toBe('persist me');
  });

  it('errors clearly when dataDir is not configured', async () => {
    const client = await createConnectedClient();
    const res = await call(client, 'session_save', { name: 'nope' });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toContain('dataDir');
  });

  it('rejects invalid file names', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'ct-persist-'));
    const client = await createConnectedClient({ dataDir });
    const res = await call(client, 'session_save', { name: '../escape' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/validation|name may contain/i);
  });

  async function client_thoughts(client: Client) {
    return client.readResource({ uri: 'clear-thought://session/thoughts' });
  }
});
