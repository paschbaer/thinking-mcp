#!/usr/bin/env node
/**
 * Auto-capture hook for post-commit use.
 *
 * Detects error signatures in the recent commit diff and offers to capture
 * them as EMMS episodes. Install as .git/hooks/post-commit (chmod +x).
 *
 * Set EMMS_SERVER_DIR to the EMMS server directory if not auto-detected.
 * Set EMMS_AUTO_CAPTURE=0 to disable.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.env.EMMS_AUTO_CAPTURE === '0') process.exit(0);

// Find EMMS server dir
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const serverDir = process.env.EMMS_SERVER_DIR ?? join(repoRoot, 'servers', 'server-experiencememory');
const distEntry = join(serverDir, 'dist', 'dev.js');

if (!existsSync(distEntry)) {
  // EMMS server not built/present — silently skip
  process.exit(0);
}

// Get the last commit's diff (added/changed lines only)
let diff;
try {
  diff = execSync('git diff HEAD~1 HEAD --unified=0 -- . ":!*.lock" ":!*.md"', {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
} catch {
  process.exit(0); // no previous commit
}

if (!diff || diff.length < 50) process.exit(0);

// Detect error-like patterns in added lines
const ERROR_PATTERNS = [
  /(?:ERR!|ERROR:|FATAL|exited with code [1-9]\d*)/,
  /(?:Cannot find module|MODULE_NOT_FOUND|SyntaxError|TypeError|ReferenceError)/,
  /(?:failed to compile|build failed|test.*failed)/i,
];

const addedLines = diff
  .split('\n')
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  .join('\n');

const hasError = ERROR_PATTERNS.some((p) => p.test(addedLines));
if (!hasError) process.exit(0);

// Extract a summary (first error-like line)
const errorLine = addedLines.split('\n').find((l) => ERROR_PATTERNS.some((p) => p.test(l)));
const summary = errorLine?.replace(/^[+]/, '').trim().slice(0, 120) ?? 'unknown error';

console.log(`\n⚡ EMMS auto-capture: potential error signature detected in commit`);
console.log(`   ${summary}`);
console.log(`   To capture: run /capture-lessons in the chat, or manually seed via`);
console.log(`   ${serverDir}/scripts/seed-lessons.mjs`);
console.log(`   (disable: EMMS_AUTO_CAPTURE=0)\n`);
