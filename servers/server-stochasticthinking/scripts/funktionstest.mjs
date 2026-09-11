#!/usr/bin/env node
/**
 * Live smoke test for the Stochastic Thinking HTTP MCP server.
 *
 * Usage:
 *   1. Start the server:  npm run start     (or: npm run dev:http)
 *   2. Run this check:    npm run test:live
 *
 * Env:
 *   STOCHASTIC_URL  base URL of the server (default: http://localhost:3001)
 *
 * The health check polls for up to ~30 s to tolerate WSL2 /mnt/c cold-start
 * I/O latency before failing.
 */

const BASE = process.env.STOCHASTIC_URL ?? 'http://localhost:3001';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream'
};

let failures = 0;

function check(name, condition, extra = '') {
  console.log(`${condition ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!condition) failures++;
}

function parseSse(text) {
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  return dataLine ? JSON.parse(dataLine.slice('data: '.length)) : null;
}

// 1. Health endpoint (poll to tolerate cold starts)
let health = null;
for (let i = 0; i < 30 && !health; i++) {
  try {
    const res = await fetch(`${BASE}/health`);
    if (res.ok) health = await res.json();
  } catch {
    // server not up yet
  }
  if (!health) await new Promise((resolve) => setTimeout(resolve, 1000));
}
check(
  'health endpoint',
  !!health && health.status === 'ok' && health.service === 'stochastic-thinking-mcp',
  JSON.stringify(health)
);

// 2. Initialize round-trip
const initRes = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: JSON_HEADERS,
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'funktionstest', version: '0.0.0' }
    }
  })
});
const sessionId = initRes.headers.get('mcp-session-id');
const initData = parseSse(await initRes.text());
check(
  'initialize round-trip',
  initData?.result?.serverInfo?.name === 'stochastic-thinking-server',
  JSON.stringify(initData?.result?.serverInfo)
);
check('session id header issued', !!sessionId, sessionId ?? 'missing');

// 3. tools/list with the issued session
const listRes = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { ...JSON_HEADERS, 'mcp-session-id': sessionId },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
});
const listData = parseSse(await listRes.text());
check(
  'tools/list with session',
  !!listData?.result?.tools?.some((tool) => tool.name === 'stochasticalgorithm')
);

// 4. tools/call round-trip
const callRes = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { ...JSON_HEADERS, 'mcp-session-id': sessionId },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'mcts',
        problem: 'game tree search',
        parameters: { simulations: 500 }
      }
    }
  })
});
const callData = parseSse(await callRes.text());
const callPayload = JSON.parse(callData?.result?.content?.[0]?.text ?? '{}');
check(
  'tools/call round-trip',
  callPayload.status === 'success' && /Explored 500 paths/.test(callPayload.summary ?? ''),
  callPayload.summary
);

// 5. Second sequential call on the SAME session (stateful transport, stateless tools)
const call2Res = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { ...JSON_HEADERS, 'mcp-session-id': sessionId },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bandit',
        problem: 'exploration vs exploitation',
        parameters: { strategy: 'thompson', epsilon: 0.2 }
      }
    }
  })
});
const call2Data = parseSse(await call2Res.text());
const call2Payload = JSON.parse(call2Data?.result?.content?.[0]?.text ?? '{}');
check(
  'second call on same session',
  call2Payload.status === 'success' && /thompson strategy/.test(call2Payload.summary ?? ''),
  call2Payload.summary
);

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
