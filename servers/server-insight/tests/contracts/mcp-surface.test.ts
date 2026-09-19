/**
 * End-to-end MCP client contract test (FR-010: guidance on EVERY tool
 * response; error mapping; SC-005 response size bounds).
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

const CTX = { scope_id: 'demo-repo', agent_id: 'local-agent' };

describe('MCP surface contract (FR-010, SC-005)', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-mcp-'));
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

  it('workflow.start returns guidance envelope on the MCP response', async () => {
    const out = await call('workflow_start', {
      goal: 'fix build', scope_id: CTX.scope_id,
      idempotency_key: 'mcp-1', client_context: CTX,
    });
    expect(out.guidance).toBeDefined();
    expect((out.result as Record<string, unknown>).workflow_id).toBeDefined();
  });

  it('every capture response carries guidance (FR-010)', async () => {
    const start = await call('workflow_start', {
      goal: 'fix build', scope_id: CTX.scope_id,
      idempotency_key: 'mcp-2', client_context: CTX,
    });
    const wf = (start.result as Record<string, unknown>).workflow_id as string;
    const obs = await call('experience_record_observation', {
      workflow_id: wf, kind: 'failure_output',
      content: 'ERESOLVE exited with code 1', exit_code: 1,
      expected_revision: 1, client_context: CTX,
    });
    expect(obs.guidance).toBeDefined();
    expect((obs.guidance as Record<string, unknown>).revision).toBe(2);
  });

  it('invalid state request returns recoverable error with corrected guidance', async () => {
    const start = await call('workflow_start', {
      goal: 'fix build', scope_id: CTX.scope_id,
      idempotency_key: 'mcp-3', client_context: CTX,
    });
    const wf = (start.result as Record<string, unknown>).workflow_id as string;
    const out = await call('validation_record_run', {
      workflow_id: wf, check_index: 0, status: 'passed', client_context: CTX,
    });
    expect((out.error as Record<string, unknown>).code).toBeDefined();
    expect(out.guidance).toBeDefined();
  });

  it('schema-invalid request surfaces as protocol-level error (isError), not a crash', async () => {
    const res = await client.callTool({ name: 'experience_search', arguments: { query: '' } as never });
    expect(res.isError).toBe(true);
  });

  it('result cards are bounded (SC-005: no raw log flooding)', async () => {
    const start = await call('workflow_start', {
      goal: 'g', scope_id: CTX.scope_id, idempotency_key: 'mcp-5', client_context: CTX,
    });
    const wf = (start.result as Record<string, unknown>).workflow_id as string;
    const big = 'x'.repeat(100000);
    await call('experience_record_observation', {
      workflow_id: wf, kind: 'failure_output', content: big,
      expected_revision: 1, client_context: CTX,
    });
    const search = await call('experience_search', { query: 'x', scope_id: CTX.scope_id });
    const raw = JSON.stringify(search);
    // Card excerpts are bounded; raw content is not echoed wholesale
    expect(raw.length).toBeLessThan(big.length);
  });
});
