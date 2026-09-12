#!/usr/bin/env node
// Assembles the Smithery-publishable MCPB bundle for this server.
//
// Steps:
//  1. Clean/create a staging directory (`.mcpb-stage/`)
//  2. Copy dist/ + package.json into it
//  3. Install production dependencies (npm, workspace-independent)
//  4. Write a manifest.json that carries the real tool metadata
//     (descriptions, input schemas, annotations) so registry scans
//     can rate capability quality
//  5. Pack the staging directory with the MCPB CLI
//
// Usage: npm run build:mcpb   (run `npm run build` first)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(pkgRoot, '.mcpb-stage');
const output = path.join(pkgRoot, 'stochasticthinking.mcpb');
const require_ = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (result.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

// 1. fresh staging directory
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// 2. dist + package metadata
fs.cpSync(path.join(pkgRoot, 'dist'), path.join(stage, 'dist'), { recursive: true });
fs.copyFileSync(path.join(pkgRoot, 'package.json'), path.join(stage, 'package.json'));

// 3. production dependencies into the staging directory
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--workspaces=false'], { cwd: stage });

// 4. manifest with real tool metadata (mirrors src/index.ts + src/tools/agents-guide.ts)
const { STOCHASTIC_TOOL } = await import(pathToFileURL(path.join(pkgRoot, 'dist/index.js')));
const { AGENTS_GUIDE_TOOL } = await import(
  pathToFileURL(path.join(pkgRoot, 'dist/tools/agents-guide.js'))
);

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
  tools: [
    {
      name: STOCHASTIC_TOOL.name,
      description: STOCHASTIC_TOOL.description
    },
    {
      name: AGENTS_GUIDE_TOOL.name,
      description: AGENTS_GUIDE_TOOL.description
    }
  ]
};
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

// 5. pack
run('npx', ['-y', '@anthropic-ai/mcpb', 'pack', stage, output]);

const size = (fs.statSync(output).size / 1024).toFixed(1);
console.log(`MCPB bundle written: ${output} (${size} KB)`);
