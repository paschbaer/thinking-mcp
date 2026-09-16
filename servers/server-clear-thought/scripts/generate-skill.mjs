#!/usr/bin/env node
/**
 * Generates the user-level Claude skill for ALL clear-thought tools from the
 * server's AGENTS.template.md (single source of truth).
 *
 *   node scripts/generate-skill.mjs [--out <path>]
 *   # default out: ~/.claude/skills/clear-thought/SKILL.md
 *
 * Pipeline (mirror of the guide chain — template ↔ constant ↔ root AGENTS.md):
 *   AGENTS.template.md ──► generate-skill.mjs ──► SKILL.md
 *
 * The body is the template guide verbatim (Ground rules → before the
 * project-specific section), so tool routing, stochastic parameters and
 * recipes stay in sync automatically. As a safety net the script fails when
 * the toolset slugs in the template's toolset routing table do not match the
 * registries actually wired in src/toolsets/*.ts.
 *
 * Run after every guide change:  npm run sync:skill
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outPath =
  outIdx !== -1
    ? resolve(argv[outIdx + 1])
    : join(homedir(), '.claude', 'skills', 'clear-thought', 'SKILL.md');

// ── source: the guide template ───────────────────────────────────────────
const md = readFileSync(join(pkgRoot, 'AGENTS.template.md'), 'utf8');
const START = '## Ground rules';
const END = '## Project-specific conventions';
const startIdx = md.indexOf(START);
const endIdx = md.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error(
    `generate-skill: expected markers not found in AGENTS.template.md (${START} / ${END})`
  );
  process.exit(1);
}
const body = md.slice(startIdx, endIdx).trimEnd();

// ── safety net: toolset slugs template ↔ code ────────────────────────────
const toolsetTableRegion = body.slice(
  body.indexOf('Toolset routing:'),
  body.indexOf('\n## ', body.indexOf('Toolset routing:'))
);
const templateSlugs = new Set();
for (const m of toolsetTableRegion.matchAll(/^\| `([a-z]+)` \|/gm)) {
  templateSlugs.add(m[1]);
}
const codeSlugs = new Set();
for (const f of readdirSync(join(pkgRoot, 'src', 'toolsets'))) {
  if (!f.endsWith('.ts') || f === 'registry.ts') continue;
  const src = readFileSync(join(pkgRoot, 'src', 'toolsets', f), 'utf8');
  const m = src.match(/ToolsetRegistry\(\s*'([a-z]+)'/);
  if (m) codeSlugs.add(m[1]);
}
const missingInTemplate = [...codeSlugs].filter((s) => !templateSlugs.has(s));
const missingInCode = [...templateSlugs].filter((s) => !codeSlugs.has(s));
if (missingInTemplate.length || missingInCode.length) {
  console.error(
    'generate-skill: toolset routing table out of sync with src/toolsets:\n' +
      `  in code but not in template: ${missingInTemplate.join(', ') || '—'}\n` +
      `  in template but not in code: ${missingInCode.join(', ') || '—'}\n` +
      'Fix AGENTS.template.md (Toolset routing table) first.'
  );
  process.exit(1);
}

// ── assemble ─────────────────────────────────────────────────────────────
const FRONT = [
  '---',
  'name: clear-thought',
  'description: "Use when: planning or reasoning step-by-step, debugging a failure, making or stress-testing decisions, SWOT/premortem/FMEA/fault-tree risk analysis, Fermi estimates, game theory, causal analysis, analogies, multi-agent delegation, or quantifying decisions with real stochastic algorithms (MDP, MCTS, bandit, Bayesian optimization, HMM) — covers ALL tools of the clear-thought MCP server: 40 tools, 7 toolsets, workflow recipes, session persistence."',
  'trigger: /clear-thought',
  '---',
  '',
  '# /clear-thought — All-Tools Guide (Thinking-MCP)',
  '',
  'Complete tool guide for the **clear-thought** MCP server (~40 tools, 7 grouped',
  'toolsets, individual + toolset registration). Trigger: `/clear-thought` or any',
  'task needing structured reasoning/decision tools.',
  '',
  '> GENERATED from `servers/server-clear-thought/AGENTS.template.md` by',
  '> `scripts/generate-skill.mjs` — do not hand-edit. Regenerate:',
  '> `cd servers/server-clear-thought && npm run sync:skill`.',
  ''
].join('\n');

const MAINT = [
  '',
  '## Maintenance (meta)',
  '',
  '- This skill is **generated** — edit `AGENTS.template.md`, then run:',
  '  `npm run sync:guide && npm run sync:skill` (plus',
  '  `npx tsx scripts/regen-root-agents.ts` to refresh the root AGENTS.md).',
  '- Sync guards: `tests/agents-guide.test.ts` (template ↔ constant) and the',
  '  toolset-slug check inside `generate-skill.mjs` (template ↔ `src/toolsets`).'
].join('\n');

const skill = `${FRONT}${body}\n${MAINT}\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, skill);
const lines = skill.split('\n').length;
console.log(`generate-skill: wrote ${outPath} (${lines} lines, toolsets: ${[...codeSlugs].sort().join(', ')})`);
