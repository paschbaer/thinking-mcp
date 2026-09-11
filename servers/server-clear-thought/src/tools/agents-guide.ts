import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { AGENTS_TEMPLATE } from './agents-guide-template.js';

const START_MARKER = '<!-- clear-thought:agents-guide:start -->';
const END_MARKER = '<!-- clear-thought:agents-guide:end -->';
const BODY_HEADING = '## Ground rules';
const GUIDE_HEADING = '# Clear Thought — Reasoning Tool Guide';

interface Placeholder {
  token: string;
  value?: string;
  fallback: string;
}

/**
 * Serves the AGENTS.md template shipped with this package so that an LLM
 * agent can add a ready-made reasoning-tool guide to any project's
 * AGENTS.md — without needing this repository checked out.
 *
 * Two modes:
 * - full (default): a complete AGENTS.md document, placeholders substituted
 * - merge: the guide body integrated into existing AGENTS.md content,
 *   delimited by HTML-comment markers so repeat calls update in place
 *   (idempotent) instead of duplicating the guide.
 */
export function registerAgentsGuide(server: McpServer, _sessionState: SessionState) {
  server.tool(
    'agents_guide',
    'Return a ready-to-use AGENTS.md reasoning-tool guide (with usage rules, ' +
      'tool routing and workflow recipes) for projects consuming this server, ' +
      'optionally merged into existing AGENTS.md content',
    {
      project_name: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Name of the target project — replaces the {{PROJECT_NAME}} placeholder'),
      domain_context: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('1-3 sentences about the target project domain — replaces {{DOMAIN_CONTEXT}}'),
      codebase_root: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Working root for the agent — replaces the {{CODEBASE_ROOT}} placeholder'),
      existing_agents_md: z
        .string()
        .trim()
        .min(1)
        .max(2_000_000)
        .optional()
        .describe(
          'Content of an existing AGENTS.md. Providing it switches to merge mode: ' +
            'the guide is integrated into this content (replacing a previously ' +
            'inserted guide block if present) instead of returning a full document.'
        )
    },
    async (args) => {
      const template = loadTemplate();
      const placeholders: Placeholder[] = [
        { token: '{{PROJECT_NAME}}', value: args.project_name, fallback: '<your project>' },
        { token: '{{DOMAIN_CONTEXT}}', value: args.domain_context, fallback: '<describe your domain>' },
        { token: '{{CODEBASE_ROOT}}', value: args.codebase_root, fallback: '<working root>' }
      ];

      const rendered = applyPlaceholders(template, placeholders);
      const block = buildGuideBlock(rendered, args.existing_agents_md !== undefined, placeholders);

      let mode: 'full' | 'merge' = 'full';
      let blockReplaced = false;
      let warning: string | undefined;
      let content: string;

      if (args.existing_agents_md !== undefined) {
        mode = 'merge';
        const merged = integrateIntoExisting(args.existing_agents_md, block);
        blockReplaced = merged.blockReplaced;
        warning = merged.warning;
        content = merged.content;
      } else {
        content = buildFullDocument(rendered, block);
      }

      const unresolved = placeholders
        .filter((p) => valueOrFallback(p) === p.fallback && content.includes(p.fallback))
        .map((p) => p.token);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode,
                block_replaced: blockReplaced,
                ...(warning ? { warning } : {}),
                content,
                unresolved_placeholders: unresolved,
                nextSteps: [
                  mode === 'merge'
                    ? 'Write `content` back to the target AGENTS.md. A previously inserted guide block was replaced in place — no duplication.'
                    : 'Write `content` to the AGENTS.md at the target project root.',
                  'Fill any unresolved placeholders directly in the written file.',
                  mode === 'full'
                    ? 'Later updates: pass the file content as existing_agents_md to update the guide block in place.'
                    : 'Repeat calls with updated content stay idempotent via the clear-thought markers.'
                ],
                status: 'success'
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}

/** The AGENTS.md template is embedded (see agents-guide-template.ts) so it
 *  survives Docker builds with *.md ignores and single-file bundling. */
function loadTemplate(): string {
  return AGENTS_TEMPLATE;
}

function applyPlaceholders(template: string, placeholders: Placeholder[]): string {
  let out = template;
  for (const p of placeholders) {
    out = out.split(p.token).join(valueOrFallback(p));
  }
  return out;
}

function valueOrFallback(p: Placeholder): string {
  return p.value ?? p.fallback;
}

/** Drop the template-usage preamble; split into head (H1 + intro) and body. */
function splitGuide(rendered: string): { head: string; body: string } {
  const headingStart = rendered.indexOf(GUIDE_HEADING);
  const bodyStart = rendered.indexOf(BODY_HEADING);
  if (headingStart === -1 || bodyStart === -1 || bodyStart < headingStart) {
    throw new Error(
      'AGENTS template is malformed: expected "# Clear Thought — Reasoning Tool Guide" followed by "## Ground rules"'
    );
  }
  return {
    head: rendered.slice(headingStart, bodyStart).trimEnd(),
    body: rendered.slice(bodyStart).trimEnd()
  };
}

function buildGuideBlock(rendered: string, mergeMode: boolean, placeholders: Placeholder[]): string {
  const { body } = splitGuide(rendered);
  if (mergeMode === false) {
    return `${START_MARKER}\n${body}\n${END_MARKER}`;
  }
  // The template head (with the project-specific intro) is not part of a
  // merged block, so surface the provided context as a line under the heading.
  const provided = placeholders
    .filter((p) => p.value !== undefined && p.token !== '{{CODEBASE_ROOT}}')
    .map((p) => `${p.token === '{{PROJECT_NAME}}' ? 'Project' : 'Domain'}: ${p.value}`);
  const contextLine = placeholders.find((p) => p.token === '{{CODEBASE_ROOT}}' && p.value !== undefined);
  if (contextLine) provided.push(`Codebase root: ${contextLine.value}`);
  const heading = mergeMode
    ? `${GUIDE_HEADING.replace('# ', '## ')}${provided.length ? `\n\n${provided.join(' ')}` : ''}`
    : '';
  return `${START_MARKER}\n${heading}\n\n${body}\n${END_MARKER}`;
}

function buildFullDocument(rendered: string, block: string): string {
  const { head } = splitGuide(rendered);
  return `${head}\n\n${block}\n`;
}

function integrateIntoExisting(
  existing: string,
  block: string
): { content: string; blockReplaced: boolean; warning?: string } {
  const startCount = existing.split(START_MARKER).length - 1;
  const endCount = existing.split(END_MARKER).length - 1;
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  // Replace only an intact single marker pair; with corrupt markers (stray
  // START without END, END before START, multiple pairs) replacing the span
  // [first START .. last END] could silently delete user content, so append
  // instead and tell the caller.
  if (startCount === 1 && endCount === 1 && startIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + END_MARKER.length).trimStart();
    const joined =
      after.length > 0 ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}`;
    return { content: `${joined}\n`, blockReplaced: true };
  }
  if (startCount > 0 || endCount > 0) {
    return {
      content: `${existing.trimEnd()}\n\n${block}\n`,
      blockReplaced: false,
      warning:
        'The existing content contains incomplete or duplicated clear-thought guide markers; ' +
        'the guide was appended instead of replacing them. Clean up the stray ' +
        `${START_MARKER} / ${END_MARKER} lines manually and re-run to restore in-place updates.`
    };
  }
  const base = existing.trimEnd();
  return { content: `${base}\n\n${block}\n`, blockReplaced: false };
}
