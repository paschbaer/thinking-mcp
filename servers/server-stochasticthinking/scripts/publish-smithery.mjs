#!/usr/bin/env node
// Publishes the built MCPB bundle to the Smithery registry.
//
// Prerequisites:
//   - `npm run build && npm run build:mcpb` (bundle at ./stochasticthinking.mcpb)
//   - Logged in once via `npx -y @smithery/cli auth login`
//     (credentials are read locally from ~/.config/smithery/settings.json;
//      the token never leaves this process)
//
// What it publishes (StdioDeployPayload, per Smithery OpenAPI):
//   type: "stdio", runtime: "node", configSchema, serverCard.
// The serverCard carries the static capability metadata (tools with
// descriptions + input schemas) — stdio releases get NO automatic
// capability scan, so this card is what feeds the registry listing and
// the Smithery quality score.
//
// Usage: node scripts/publish-smithery.mjs [qualifiedName]
//   default qualifiedName: paschbaer/stochasticthinking

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qualifiedName = process.argv[2] ?? 'paschbaer/stochasticthinking';
const bundlePath = path.join(pkgRoot, 'stochasticthinking.mcpb');

// CI-friendly: SMITHERY_API_KEY (GitHub Secret) wins; local runs fall back
// to the token stored by `npx @smithery/cli auth login`. The settings file is
// OPTIONAL — on CI runners it does not exist.
const settingsPath = path.join(os.homedir(), '.config/smithery/settings.json');
const settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  : {};
let token = process.env.SMITHERY_API_KEY;
const scan = (o) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && v.startsWith('smry_')) token = v;
    if (v && typeof v === 'object') scan(v);
  }
};
if (!token) scan(settings);
if (!token) {
  console.error('No Smithery token found in ~/.config/smithery/settings.json.');
  console.error('Run: npx -y @smithery/cli auth login');
  process.exit(2);
}

// Capture tool metadata at runtime (in-memory client against the factory)
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { default: createStochasticThinkingServer } = await import(
  pathToFileURL(path.join(pkgRoot, 'dist/index.js'))
);
const { defaultConfig } = await import(pathToFileURL(path.join(pkgRoot, 'dist/config.js')));

const captureServer = createStochasticThinkingServer({
  sessionId: 'publish',
  config: defaultConfig
});
const captureClient = new Client({ name: 'publish', version: '0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([
  captureServer.connect(serverTransport),
  captureClient.connect(clientTransport)
]);
const { tools } = await captureClient.listTools();
console.log(`Captured ${tools.length} tools from the runtime server`);

const toCardTool = (t) => ({
  name: t.name,
  title: t.annotations?.title,
  description: t.description,
  inputSchema: t.inputSchema,
  outputSchema: t.outputSchema,
  annotations: t.annotations
});

const payload = {
  type: 'stdio',
  runtime: 'node',
  configSchema: {
    type: 'object',
    properties: {
      debug: { type: 'boolean', default: false, description: 'Enable debug logging.' }
    },
    description: 'Configuration for the Stochastic Thinking MCP server.'
  },
  serverCard: {
    serverInfo: {
      name: 'stochastic-thinking-server',
      title: 'Stochastic Thinking',
      version: JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version,
      description:
        'MCP server for stochastic algorithms and probabilistic decision making: MDP, MCTS, bandit, Bayesian optimization, and HMM.',
      websiteUrl: 'https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-stochasticthinking',
      icons: [{ src: 'https://github.com/paschbaer.png', mimeType: 'image/png' }]
    },
    tools: tools.map(toCardTool)
  }
};

const bundle = fs.readFileSync(bundlePath);
const form = new FormData();
form.append('payload', JSON.stringify(payload));
form.append('bundle', new Blob([bundle]), path.basename(bundlePath));

const res = await fetch(
  `https://api.smithery.ai/servers/${encodeURIComponent(qualifiedName)}/releases`,
  { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form }
);
console.log('HTTP', res.status);
const body = await res.text();
console.log(body.slice(0, 400));
if (res.status !== 202 && res.status !== 200) process.exit(1);

// Keep the server record metadata in sync (the score sources displayName,
// homepage, and iconUrl from the record, not from the release).
const recordRes = await fetch(
  `https://api.smithery.ai/servers/${encodeURIComponent(qualifiedName)}`,
  {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Stochastic Thinking',
      description: payload.serverCard.serverInfo.description,
      homepage: 'https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-stochasticthinking',
      repositoryUrl: 'https://github.com/paschbaer/thinking-mcp',
      iconUrl: 'https://github.com/paschbaer.png',
      license: 'MIT'
    })
  }
);
console.log('record patch:', recordRes.status, (await recordRes.text()).slice(0, 120));
