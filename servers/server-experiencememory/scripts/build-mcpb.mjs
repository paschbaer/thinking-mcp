#!/usr/bin/env node
// Assembles the Smithery-publishable MCPB bundle for this server.
// Mirrors server-clear-thought's build-mcpb.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverDir = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageDir = path.join(serverDir, '.mcpb-stage');

function cleanStage() {
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
}

function copyDist() {
  fs.cpSync(path.join(serverDir, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
}

function installProd() {
  const result = spawnSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: stageDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('npm install failed in stage dir');
}

function writeManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
  const manifest = {
    manifest_version: '0.2',
    name: pkg.name.replace('@paschbaer/', 'paschbaer/'),
    display_name: 'Experience Memory',
    description: pkg.description,
    version: pkg.version,
    author: { name: pkg.author },
    license: pkg.license,
    repository: pkg.repository?.url?.replace('.git', ''),
    server: {
      type: 'node',
      entry_point: 'dist/dev.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/dist/dev.js'],
      },
    },
    tools: [
      'workflow_start', 'workflow_status', 'workflow_abandon',
      'experience_search', 'experience_record_observation',
      'experience_record_attempt', 'experience_complete_attempt',
      'experience_propose_hypothesis', 'experience_propose_solution',
      'validation_plan', 'validation_record_run', 'artifact_attach',
      'experience_finalize', 'experience_record_reuse_feedback',
      'experience_mark_regression', 'experience_invalidate',
      'lesson_propose', 'lesson_search', 'lesson_get',
      'lesson_publish', 'lesson_unpublish',
      'experience_dedupe_scope', 'setup_experience_memory',
    ],
  };
  fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.copyFileSync(path.join(serverDir, 'README.md'), path.join(stageDir, 'README.md'));
  console.error(`Manifest written: ${manifest.tools.length} tools, v${manifest.version}`);
}

function pack() {
  const result = spawnSync('npx', ['@anthropic-ai/mcpb', 'pack', stageDir, path.join(serverDir, `${pkg.name.replace('@paschbaer/', '')}-${pkg.version}.mcpb`)], {
    cwd: serverDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('mcpb pack failed');
}

const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
cleanStage();
copyDist();
installProd();
writeManifest();
pack();
console.error('MCPB bundle built successfully.');
