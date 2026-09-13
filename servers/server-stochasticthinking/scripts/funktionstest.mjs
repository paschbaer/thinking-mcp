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
        problem: 'reach the goal in a corridor',
        parameters: {
          environment: { rows: 1, cols: 3, start: [0, 0], goal: [0, 2], walls: [], traps: [] },
          simulations: 500,
          seed: 7
        }
      }
    }
  })
});
const callData = parseSse(await callRes.text());
const callPayload = JSON.parse(callData?.result?.content?.[0]?.text ?? '{}');
check(
  'tools/call round-trip (mcts computes)',
  callPayload.status === 'success' && /best action "right"/.test(callPayload.summary ?? ''),
  callPayload.summary
);

// 5. Bandit runs persist within the session: create a run, then continue it.
const BANDIT_ARGS = {
  arms: [
    { type: 'bernoulli', p: 0.3 },
    { type: 'bernoulli', p: 0.5 }
  ],
  strategy: 'thompson',
  seed: 11
};
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
        problem: 'A/B test two buttons',
        parameters: { ...BANDIT_ARGS, pulls: 50 }
      }
    }
  })
});
const call2Data = parseSse(await call2Res.text());
const call2Payload = JSON.parse(call2Data?.result?.content?.[0]?.text ?? '{}');
const runId = call2Payload?.details?.runId;
check(
  'bandit creates a session run',
  call2Payload.status === 'success' && typeof runId === 'string' &&
    call2Payload?.details?.cumulative?.totalPulls === 50,
  call2Payload.summary
);

const call3Res = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { ...JSON_HEADERS, 'mcp-session-id': sessionId },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'stochasticalgorithm',
      arguments: {
        algorithm: 'bandit',
        problem: 'continue the same run',
        parameters: { ...BANDIT_ARGS, pulls: 25, runId }
      }
    }
  })
});
const call3Data = parseSse(await call3Res.text());
const call3Payload = JSON.parse(call3Data?.result?.content?.[0]?.text ?? '{}');
check(
  'bandit run continues across calls (regret accumulates)',
  call3Payload.status === 'success' &&
    call3Payload?.details?.cumulative?.totalPulls === 75 &&
    call3Payload?.details?.cumulative?.regret >= 0,
  call3Payload.summary
);

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
