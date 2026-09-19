/**
 * setup_experience_memory tool — bootstraps the EMMS integration in a target
 * repo, analogous to clear-thought's `agents_guide`: returns ready-to-write
 * content (lookup rules, capture prompt, gitignore lines) with marker-based
 * idempotent merging. The agent executing the tool writes the returned
 * content to the target files.
 *
 * Two modes (per file):
 * - full: complete file content (when the target file doesn't exist)
 * - merge: the EMMS block integrated into existing content, delimited by
 *   HTML-comment markers so repeat calls update in place (idempotent)
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const START_MARKER = '<!-- emms:lookup-rules:start -->';
const END_MARKER = '<!-- emms:lookup-rules:end -->';

const CAPTURE_PROMPT_FILENAME = '.github/prompts/capture-lessons.prompt.md';

const CAPTURE_PROMPT_TEMPLATE = `---
description: Capture session lessons as EMMS experience episodes
---

# Capture Lessons to Experience Memory

Analyze this session for recurring bugs, traps, and validated fixes, then
persist each one as an experience episode in the experience-memory server.

## Procedure

1. **Review the session** for recurring bugs, traps, surprising failures, and
   validated fixes. Candidate signals:
   - the same error occurred more than once
   - a fix required multiple attempts (first attempts were harmful/ineffective)
   - a root cause differed from the obvious one
   - an environment/build/driver quirk cost significant time

2. **For each candidate**, collect these fields:
   - \`slug\` — kebab-case identifier
   - \`observation\` — what went wrong (symptom + context)
   - \`cause\` — root cause / why it happened
   - \`fix\` — the validated workaround or fix

3. **Write them to a JSON file** (array of objects with slug, observation,
   cause, fix).

4. **Seed via the EMMS server** — call the MCP tools directly:
   \`workflow_start\` → \`experience_record_observation\` (agent_reflection:
   OBSERVATION; environment_fact: trap_class) → \`experience_record_attempt\`
   → \`experience_complete_attempt\` (successful) →
   \`experience_propose_hypothesis\` (root cause) → \`experience_finalize\`
   (partially_verified). Use \`idempotency_key = lesson-<slug>\` (re-runs
   never duplicate).

5. **Verify** the round-trip with \`experience_search\` using the lesson's
   wording.

6. **Append a short entry** to the project's lessons-learned file
   (constitution requirement).

## Rules

- Only capture validated lessons (fix confirmed in this session).
- Redact secrets before seeding (the server's pattern redaction is a
  safety net, not a substitute).
`;

function buildLookupRulesBlock(repoLessonsScope: string, triggers: Array<{ domain: string; keywords: string }>): string {
  const rows = triggers.map((t) => `| ${t.domain} | \`${t.keywords}\` |`).join('\n');
  return `${START_MARKER}
## Experience Memory Lookup (EMMS) — proactive retrieval

Before working in a known trap domain, search prior experience via the
local **experience-memory** MCP server:

Trigger domains → search query keywords:

| Trigger (touching…) | Query keywords |
|---|---|
${rows}

Call: \`experience_search { query: "<keywords>", scope_id: "${repoLessonsScope}" }\`

- A hit with tier \`PARTIALLY_VERIFIED\` / \`LOCALLY_VERIFIED\`: follow the
  recorded fix (\`known_bad_attempts\` = paths that already failed) and record
  \`experience_record_reuse_feedback\` afterwards (verdict \`useful\`/\`harmful\`).
- No hit: proceed normally — and if the session uncovers a new recurring trap,
  capture it via \`workflow_start\` + observation/attempt/finalize (idempotent
  via \`idempotency_key = lesson-<slug>\`).
${END_MARKER}`;
}

const GITIGNORE_LINES = [
  'servers/insight/emms-data/',
  'servers/insight/emms-store.db*',
  'servers/insight/emms-artifacts/',
];

const DEFAULT_TRIGGERS = [
  { domain: 'better-sqlite3 (install, rebuild, queries)', keywords: 'better-sqlite3 bindings named params' },
  { domain: 'SQLite FTS5 / full-text search', keywords: 'fts5 match injection sanitize' },
  { domain: 'vitest / ESM test imports', keywords: 'vitest esm ts extensions' },
  { domain: 'finalize / assessment / evidence logic', keywords: 'finalize assessment read-only read-after-write' },
  { domain: 'ranking / demotion / dedupe tests', keywords: 'ranking comparison jaccard demotion' },
  { domain: 'semantic embeddings / transformers', keywords: 'minilm embeddings offline' },
  { domain: 'Docker / native module builds', keywords: 'docker native rebuild bindings' },
];

interface FileResult {
  file: string;
  mode: 'full' | 'merge' | 'append' | 'skip';
  block_replaced: boolean;
  content: string;
  warning?: string;
}

function integrateWithMarkers(
  existing: string,
  block: string
): { content: string; blockReplaced: boolean; warning?: string } {
  const startCount = existing.split(START_MARKER).length - 1;
  const endCount = existing.split(END_MARKER).length - 1;
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (startCount === 1 && endCount === 1 && startIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + END_MARKER.length).trimStart();
    const joined = after.length > 0 ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}`;
    return { content: `${joined}\n`, blockReplaced: true };
  }
  if (startCount > 0 || endCount > 0) {
    return {
      content: `${existing.trimEnd()}\n\n${block}\n`,
      blockReplaced: false,
      warning: 'Incomplete or duplicated EMMS markers found; block appended instead of replacing. Clean up stray markers and re-run.',
    };
  }
  const base = existing.trimEnd();
  return { content: `${base}\n\n${block}\n`, blockReplaced: false };
}

export function registerSetupExperienceMemory(server: McpServer): void {
  server.tool(
    'setup_experience_memory',
    'Bootstrap the EMMS integration in a target repo: returns ready-to-write ' +
      'lookup rules for AGENTS.md/CLAUDE.md (marker-based idempotent merge into ' +
      'existing content), the capture prompt file, gitignore lines, and next ' +
      'steps. The calling agent writes the returned content to the target files.',
    {
      repo_lessons_scope: z.string().trim().min(1).optional()
        .describe('Scope id for lesson episodes (default: <repo-name>-lessons)'),
      repo_name: z.string().trim().min(1).optional()
        .describe('Target project name — used in generated content'),
      existing_agents_md: z.string().max(2_000_000).optional()
        .describe('Content of existing AGENTS.md → merge mode (idempotent update)'),
      existing_claude_md: z.string().max(2_000_000).optional()
        .describe('Content of existing CLAUDE.md → merge mode'),
      existing_gitignore: z.string().max(100_000).optional()
        .describe('Content of existing .gitignore → returns appended version'),
      existing_capture_prompt: z.string().max(50_000).optional()
        .describe('Content of existing capture prompt file → returns "skip" if non-empty'),
      custom_triggers: z.array(z.object({
        domain: z.string().min(1),
        keywords: z.string().min(1),
      })).optional()
        .describe('Repo-specific trigger domains replacing the defaults'),
    },
    async (args) => {
      const scope = args.repo_lessons_scope ?? (args.repo_name ? `${args.repo_name}-lessons` : 'emms-lessons');
      const triggers = args.custom_triggers?.length ? args.custom_triggers : DEFAULT_TRIGGERS;
      const block = buildLookupRulesBlock(scope, triggers);

      const files: FileResult[] = [];

      // AGENTS.md
      if (args.existing_agents_md !== undefined) {
        const m = integrateWithMarkers(args.existing_agents_md, block);
        files.push({ file: 'AGENTS.md', mode: 'merge', block_replaced: m.blockReplaced, content: m.content, warning: m.warning });
      } else {
        files.push({ file: 'AGENTS.md', mode: 'full', block_replaced: false, content: `# AGENTS.md\n\n${block}\n` });
      }

      // CLAUDE.md
      if (args.existing_claude_md !== undefined) {
        const m = integrateWithMarkers(args.existing_claude_md, block);
        files.push({ file: 'CLAUDE.md', mode: 'merge', block_replaced: m.blockReplaced, content: m.content, warning: m.warning });
      } else {
        files.push({ file: 'CLAUDE.md', mode: 'full', block_replaced: false, content: `# CLAUDE.md\n\n${block}\n` });
      }

      // Capture prompt
      if (args.existing_capture_prompt !== undefined && args.existing_capture_prompt.trim().length > 0) {
        files.push({ file: CAPTURE_PROMPT_FILENAME, mode: 'skip', block_replaced: false, content: args.existing_capture_prompt, warning: 'Capture prompt already exists and is non-empty — skipped.' });
      } else {
        files.push({ file: CAPTURE_PROMPT_FILENAME, mode: 'full', block_replaced: false, content: CAPTURE_PROMPT_TEMPLATE });
      }

      // Gitignore
      if (args.existing_gitignore !== undefined) {
        const missing = GITIGNORE_LINES.filter((l) => !args.existing_gitignore!.includes(l));
        if (missing.length === 0) {
          files.push({ file: '.gitignore', mode: 'skip', block_replaced: false, content: args.existing_gitignore });
        } else {
          const appended = `${args.existing_gitignore.trimEnd()}\n\n# EMMS runtime data\n${missing.join('\n')}\n`;
          files.push({ file: '.gitignore', mode: 'append', block_replaced: false, content: appended, warning: `Appended: ${missing.join(', ')}` });
        }
      } else {
        files.push({ file: '.gitignore', mode: 'full', block_replaced: false, content: `${GITIGNORE_LINES.join('\n')}\n` });
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scope,
            files,
            next_steps: [
              'Write each file\u2019s `content` to the corresponding target file in the target repo.',
              'Create .github/prompts/capture-lessons.prompt.md from the returned prompt content.',
              'After setup, /capture-lessons is available for session-end capture and the lookup rules are live for task-start retrieval.',
              'Seed initial lessons via workflow_start + observations + finalize, or provide a lessons JSON.',
            ],
            status: 'success',
          }, null, 2),
        }],
      };
    }
  );
}
