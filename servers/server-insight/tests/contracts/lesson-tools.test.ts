/**
 * Regression tests: lesson_publish / lesson_unpublish must be registered on
 * the MCP surface, and experience_record_reuse_feedback must accept calls
 * with OPTIONAL fields omitted (SQLite named-parameter bind bug — undefined
 * values must be mapped to null before better-sqlite3 sees them).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import createExperienceMemoryServer from '../../src/index.js';

let dir: string;
let client: Client;

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text);
}

const CTX = { scope_id: 'lesson-tools-test', agent_id: 'test-agent' };

async function startWorkflow(idem: string): Promise<string> {
  const out = await call('workflow_start', {
    goal: 'seed a lesson', scope_id: CTX.scope_id,
    idempotency_key: idem, client_context: CTX,
  });
  return (out.result as Record<string, unknown>).workflow_id as string;
}

describe('lesson tools on MCP surface', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-lesson-tools-'));
    const server = createExperienceMemoryServer({
      config: { storagePath: join(dir, 'store.db') },
    });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0' });
    await Promise.all([client.connect(clientT), server.connect(serverT)]);
  });
  afterEach(async () => {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lesson_publish and lesson_unpublish are exposed as MCP tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('lesson_publish');
    expect(names).toContain('lesson_unpublish');
  });

  it('experience_record_reuse_feedback accepts omitted optional fields (bind regression)', async () => {
    const wf = await startWorkflow('fb-bind-1');
    // Minimal call — changed_plan and outcome deliberately omitted.
    const out = await call('experience_record_reuse_feedback', {
      workflow_id: wf, experience_id: 'exp_nonexistent', verdict: 'useful',
      client_context: CTX,
    });
    // No internal SQLite bind error; tool contract reports recorded feedback.
    expect(out.result).toBeDefined();
    expect((out.result as Record<string, unknown>).verdict).toBe('useful');
  });

  it('experience_record_reuse_feedback with all fields supplied', async () => {
    const wf = await startWorkflow('fb-bind-2');
    const out = await call('experience_record_reuse_feedback', {
      workflow_id: wf, experience_id: 'exp_x', verdict: 'harmful',
      changed_plan: true, outcome: 'followed the recorded fix and it broke',
      client_context: CTX,
    });
    expect((out.result as Record<string, unknown>).verdict).toBe('harmful');
  });
});
