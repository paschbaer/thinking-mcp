#!/usr/bin/env node
// Publishes the built experiencememory MCPB bundle to the Smithery registry.
//
// Prerequisites:
//   - `npm run build && npm run build:mcpb` (bundle at ./insight.mcpb)
//   - Logged in once via `npx -y @smithery/cli auth login`
//     (credentials are read locally from ~/.config/smithery/settings.json)
//
// What it publishes (StdioDeployPayload, per Smithery OpenAPI):
//   type: "stdio", runtime: "node", configSchema, serverCard.
// The serverCard carries the static capability metadata for ALL tools
// (captured at runtime via an in-memory client) — stdio releases get no
// automatic capability scan, so this card is what feeds the registry
// listing and the Smithery quality score.
// After the release, the server record is PATCHed so displayName/homepage/
// iconUrl/license stay in sync (the quality score reads those from the
// record, not from the release).
//
// Usage: node scripts/publish-smithery.mjs [qualifiedName]
//   default qualifiedName: paschbaer/insight

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qualifiedName = process.argv[2] ?? 'paschbaer/insight';
const bundlePath = path.join(pkgRoot, 'insight.mcpb');

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

const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));

// Capture tool metadata at runtime (in-memory client against the factory)
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { default: createClearThoughtServer } = await import(
  pathToFileURL(path.join(pkgRoot, 'dist/index.js'))
);
const { defaultConfig } = await import(pathToFileURL(path.join(pkgRoot, 'dist/config.js')));

const server = createClearThoughtServer({ sessionId: 'publish', config: defaultConfig });
const client = new Client({ name: 'publish', version: pkg.version });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
const { tools } = await client.listTools();
console.log(`Captured ${tools.length} tools from the runtime server`);

const payload = {
  type: 'stdio',
  runtime: 'node',
  configSchema: {
    type: 'object',
    properties: {
      debug: { type: 'boolean', default: false, description: 'Enable debug logging.' },
      maxThoughtsPerSession: {
        type: 'number',
        default: 100,
        description: 'Maximum number of thoughts allowed per session.'
      },
      sessionTimeout: {
        type: 'number',
        default: 3600000,
        description: 'Session timeout in milliseconds.'
      },
      enableMetrics: { type: 'boolean', default: false, description: 'Enable metrics collection.' }
    },
    description: 'Configuration for the Clear Thought MCP server.'
  },
  serverCard: {
    serverInfo: {
      name: 'clear-thought-server',
      title: 'Clear Thought',
      version: pkg.version,
      description:
        'MCP server for systematic thinking: mental models, debugging approaches, decision frameworks, and structured reasoning tools.'
    },
    tools: tools.map((t) => ({
      name: t.name,
      title: t.annotations?.title,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
      annotations: t.annotations
    }))
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
console.log('release:', res.status, (await res.text()).slice(0, 300));
if (res.status !== 202 && res.status !== 200) process.exit(1);

// Keep the server record metadata in sync (the score reads displayName,
// homepage, iconUrl etc. from the record, not from the release).
const recordRes = await fetch(
  `https://api.smithery.ai/servers/${encodeURIComponent(qualifiedName)}`,
  {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Clear Thought',
      description: pkg.description,
      homepage: 'https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-clear-thought',
      repositoryUrl: 'https://github.com/paschbaer/thinking-mcp',
      iconUrl: 'https://github.com/paschbaer.png',
      license: 'MIT'
    })
  }
);
console.log('record patch:', recordRes.status, (await recordRes.text()).slice(0, 120));
process.exit(0);
