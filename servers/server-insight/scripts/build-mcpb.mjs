#!/usr/bin/env node
// Assembles the Smithery-publishable MCPB bundle for this server.
// Note: `mcpb pack` hangs on large node_modules (onnxruntime ~300 MB) in this
// environment, so we build the tar.gz directly — .mcpb IS a tar.gz with
// manifest.json at the root. Tool metadata is captured at runtime via an
// in-memory client (same as server-clear-thought's approach).
//
// WSL/drvfs caveat: freshly compiled dist/ may be invisible to new processes
// right after tsc exits (dentry cache). This script therefore builds into a
// temp dir on ext4 (/tmp) and packs there.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-mcpb-'));
const output = path.join(serverDir, `insight-${pkg.version}.mcpb`);

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

// 1. dist must exist (run `yarn workspace @paschbaer/insight build` first)
if (!fs.existsSync(path.join(serverDir, 'dist/index.js'))) {
  console.error('dist/index.js missing — run the build first.');
  process.exit(1);
}

// 2. copy dist to ext4 stage (avoids drvfs dentry flakiness)
fs.cpSync(path.join(serverDir, 'dist'), path.join(stage, 'dist'), { recursive: true });
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(stage, 'package.json'));

// 3. production deps WITHOUT lifecycle scripts (prepare would need tsc), then rebuild the native binding
delete pkg.scripts?.prepare;
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: stage });
run('npm', ['rebuild', 'better-sqlite3'], { cwd: stage });

// 4. capture tool metadata at runtime
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const { default: createInsightServer } = await import(
  pathToFileURL(path.join(stage, 'dist/index.js'))
);
const { DEFAULT_CONFIG } = await import(pathToFileURL(path.join(stage, 'dist/config.js')));

const server = createInsightServer({ config: DEFAULT_CONFIG });
const client = new Client({ name: 'mcpb-build', version: pkg.version });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
const { tools } = await client.listTools();
console.log(`Captured ${tools.length} tools from the runtime server`);

// 5. manifest (MCPB schema: tools as objects with name+description)
const manifest = {
  manifest_version: '0.2',
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: { name: pkg.author },
  license: 'MIT',
  server: {
    type: 'node',
    entry_point: 'dist/dev.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/dist/dev.js'],
      env: {}
    }
  },
  tools: tools.map((t) => ({ name: t.name, description: t.description }))
};
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

// 6. pack as tar.gz directly (mcpb pack hangs on ~300 MB node_modules here)
if (fs.existsSync(output)) fs.rmSync(output);
run('tar', ['-czf', output, '-C', stage, 'manifest.json', 'dist', 'node_modules', 'package.json']);

const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`MCPB bundle written: ${output} (${size} MB)`);
fs.rmSync(stage, { recursive: true, force: true });
