import { describe, expect, it, afterAll } from 'vitest';
import { app } from '../../src/server.js';

const server = app.listen(0, '127.0.0.1');
const port = () => (server.address() as { port: number }).port;
afterAll(() => {
  server.close();
});

async function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port()}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'cb3-test', version: '0.0.0' },
  },
};

describe('CB-3: /mcp early-reject (no orphan sessions)', () => {
  it('rejects non-initialize POST without session id with 400', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32600);
  });

  it('rejects batch/array bodies without session id with 400', async () => {
    const res = await post([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400/-32700 instead of 500 (1caa690a)', async () => {
    const res = await post('{nope');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32700);
  });

  it('initialize still creates a working session; known session id passes the gate', async () => {
    const res = await post(INIT);
    expect([200, 201]).toContain(res.status);
    const sid = res.headers.get('mcp-session-id');
    expect(sid).toBeTruthy();
    const followup = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': sid! });
    expect(followup.status).toBe(200);
  });
});

describe('CB-20: optional bearer auth (EMMS_AUTH_TOKEN)', () => {
  it('open when unset; 401 without/wrong token; 200 with correct token; /health stays open', async () => {
    process.env.EMMS_AUTH_TOKEN = 's3cret';
    try {
      const denied = await post(INIT);
      expect(denied.status).toBe(401);
      const wrong = await post(INIT, { authorization: 'Bearer wrong' });
      expect(wrong.status).toBe(401);
      const ok = await post(INIT, { authorization: 'Bearer s3cret' });
      expect([200, 201]).toContain(ok.status);
      const health = await fetch(`http://127.0.0.1:${port()}/health`);
      expect(health.status).toBe(200);
    } finally {
      delete process.env.EMMS_AUTH_TOKEN;
    }
  });
});
