#!/usr/bin/env node
/**
 * Regenerates src/tools/agents-guide-template.ts from AGENTS.template.md.
 *
 * The constant is one JSON-stringified line — read_file truncates long lines,
 * so hand-editing the constant is not viable. Run after every guide edit:
 *
 *   node scripts/sync-agents-template.mjs
 *
 * tests/agents-guide.test.ts enforces the template ↔ constant sync contract.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, '..', 'AGENTS.template.md'), 'utf8');
const out =
  '// AUTO-GENERATED from AGENTS.template.md — do not edit by hand.\n' +
  '// Kept in sync by tests/agents-guide.test.ts (template sync check).\n' +
  'export const AGENTS_TEMPLATE = ' +
  JSON.stringify(md) +
  ';\n';
writeFileSync(join(here, '..', 'src', 'tools', 'agents-guide-template.ts'), out);
console.log('agents-guide-template.ts regenerated from AGENTS.template.md');
