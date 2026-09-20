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

// 3b. trim platform/arch ballast — Smithery caps bundles at 25 MB and the
// raw install is ~300 MB (onnxruntime ships all platforms, better-sqlite3
// ships its sqlite build toolchain). The bundle targets linux x64 runners
// only; semantic search degrades gracefully if a platform lib is missing.
const rm = (rel) => fs.rmSync(path.join(stage, rel), { recursive: true, force: true });
rm('node_modules/onnxruntime-node/bin/napi-v3/darwin');
rm('node_modules/onnxruntime-node/bin/napi-v3/win32');
rm('node_modules/onnxruntime-node/bin/napi-v3/linux/arm64');
rm('node_modules/onnxruntime-web');
rm('node_modules/@xenova/transformers/dist/ort-wasm-simd.wasm');
rm('node_modules/@xenova/transformers/dist/ort-wasm.wasm');
rm('node_modules/@xenova/transformers/dist/ort-wasm-threaded.wasm');
const rmGlob = (dir, names) => {
  if (!fs.existsSync(dir)) return;
  for (const n of names) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
};
rmGlob('node_modules/@xenova/transformers/dist', ['transformers.js.map', 'transformers.min.js.map']);
rmGlob('node_modules/protobufjs', ['cli']);
rmGlob('node_modules/better-sqlite3', ['deps']);
rmGlob('node_modules/better-sqlite3/build', ['obj.target', 'test_extension.target.mk', 'better_sqlite3.target.mk', 'binding.Makefile', 'config.gypi', 'Makefile']);
rmGlob('node_modules/better-sqlite3/build/Release', ['test_extension.node', 'test_extension.node.o']);
rm('node_modules/better-sqlite3/build/Release/obj.target');
rm('node_modules/better-sqlite3/build/Release/obj/gen');
// dead weight: source maps and unpacked dist variants
rmGlob('node_modules/@xenova/transformers/dist', ['transformers.js.map', 'transformers.min.js.map', 'transformers.min.js', 'transformers.js']);
rmGlob('node_modules/protobufjs', ['cli', 'dist Light']);
rm('node_modules/lodash');
rm('node_modules/bare-url');
const sizeMB = (p2) => (fs.statSync(p2).size / 1024 / 1024).toFixed(1);
console.log(`trimmed stage: ${sizeMB(path.join(stage, 'node_modules'))} MB node_modules`);

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

// 6. pack as tar.gz directly (mcpb pack hangs on ~300 MB node_modules here).
// Pipe tar stdout into gzip -9: the Smithery 25 MB cap applies to the
// compressed artifact, and default gzip leaves us at ~28 MB.
if (fs.existsSync(output)) fs.rmSync(output);
const tarProc = spawnSync('tar', ['-cf', '-', '-C', stage, 'manifest.json', 'dist', 'node_modules', 'package.json'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 512 });
if (tarProc.status !== 0 || tarProc.error) {
  console.error('tar stderr:', tarProc.stderr?.toString().slice(0, 500), '| error:', tarProc.error?.message);
  throw new Error('tar failed');
}
if (!tarProc.stdout || !tarProc.stdout.length) throw new Error('tar produced no output');
const gzProc = spawnSync('gzip', ['-9'], { input: tarProc.stdout, stdio: ['pipe', fs.openSync(output, 'w'), 'inherit'] });
if (gzProc.status !== 0) throw new Error('gzip failed');

const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`MCPB bundle written: ${output} (${size} MB)`);
fs.rmSync(stage, { recursive: true, force: true });
