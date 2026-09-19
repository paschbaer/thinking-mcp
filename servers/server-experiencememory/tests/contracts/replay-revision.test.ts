/**
 * Regression: idempotent workflow_start replay must report the workflow's
 * CURRENT revision (plus a `replayed` flag), not the revision from the
 * original call. Otherwise addendum runs (seed-lessons re-run, lesson
 * extension) proceed from a stale revision and crash with STALE_REVISION.
 *
 * Reported by the Niyama capture session (2026-09-19): an addendum to
 * exp_160d2db7-4d8 "landed as Rev 3 on the older workflow" — the replayed
 * start result carried revision 1 from the original call.
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
  return JSON.parse((res.content as Array<{ type: string; text: string }>)[0].text);
}

const CTX = { scope_id: 'replay-revision-test', agent_id: 'test-agent' };

describe('workflow_start idempotent replay reports current revision', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emms-replay-'));
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

  it('replay after mutations returns current revision + replayed flag (addendum flow)', async () => {
    const start = await call('workflow_start', {
      goal: 'seed a lesson', scope_id: CTX.scope_id,
      idempotency_key: 'lesson-addendum-slug', client_context: CTX,
    });
    const wf = (start.result as Record<string, unknown>).workflow_id as string;
    expect((start.result as Record<string, unknown>).revision).toBe(1);

    // Advance the workflow by a few mutations (original capture run).
    let rev = 2;
    await call('experience_record_observation', {
      workflow_id: wf, kind: 'failure_output',
      content: 'ERR! exited 1', exit_code: 1,
      expected_revision: 1, client_context: CTX,
    });
    await call('experience_record_observation', {
      workflow_id: wf, kind: 'environment_fact',
      content: 'node 24, linux', expected_revision: rev, client_context: CTX,
    });
    rev++; // now 3

    // Addendum run: same idempotency key → replay of the ORIGINAL result.
    const replay = await call('workflow_start', {
      goal: 'seed a lesson', scope_id: CTX.scope_id,
      idempotency_key: 'lesson-addendum-slug', client_context: CTX,
    });

    // Same workflow, no duplicate…
    expect((replay.result as Record<string, unknown>).workflow_id).toBe(wf);
    // …but CURRENT revision and an explicit replay marker.
    expect((replay.result as Record<string, unknown>).revision).toBe(rev);
    expect((replay as Record<string, unknown>).replayed).toBe(true);

    // The addendum can now proceed with the correct revision chain.
    const obs = await call('experience_record_observation', {
      workflow_id: wf, kind: 'agent_reflection',
      content: 'ADDENDUM: two more instances confirm the pattern',
      expected_revision: rev, client_context: CTX,
    });
    expect((obs.result as Record<string, unknown>).new_revision).toBe(rev + 1);
  });

  it('replay before any mutation returns revision 1 with replayed flag', async () => {
    const args = {
      goal: 'unchanged workflow', scope_id: CTX.scope_id,
      idempotency_key: 'lesson-untouched-slug', client_context: CTX,
    };
    await call('workflow_start', args);
    const replay = await call('workflow_start', args);
    expect((replay.result as Record<string, unknown>).revision).toBe(1);
    expect((replay as Record<string, unknown>).replayed).toBe(true);
  });
});
