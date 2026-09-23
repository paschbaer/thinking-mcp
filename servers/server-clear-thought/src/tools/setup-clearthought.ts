import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionState } from '../state/SessionState.js';
import { AGENTS_TEMPLATE } from './setup-clearthought-template.js';

const START_MARKER = '<!-- clear-thought:agents-guide:start -->';
const END_MARKER = '<!-- clear-thought:agents-guide:end -->';
const BODY_HEADING = '## Ground rules';
const GUIDE_HEADING = '# Clear Thought — Reasoning Tool Guide';

/** Repeated full-mode calls beyond this threshold per session are answered
 *  with a SHORT blocked response instead of the ~20KB guide. Rationale: when
 *  the guide response is offloaded/truncated by the client, the model sees no
 *  success flag at all and retries endlessly (observed 47x, 2026-09-23). A
 *  short response is guaranteed visible, which text notes inside the large
 *  payload cannot guarantee. */
const FULL_CALL_LOOP_THRESHOLD = 2;
/** Module-level per-session counter for full-mode setup_clearthought calls. */
const fullCallCounters = new Map<string, number>();

/** Test hook: clears the per-session loop-guard counters. Not part of the
 *  public tool API — used by the unit tests to isolate counter state. */
export function __resetLoopGuardForTests(): void {
  fullCallCounters.clear();
}

interface LoopBlockArgs {
  sessionId: string;
  calls: number;
}

/**
 * Builds the short loop-detected response. Deliberately small (< 1KB) so it
 * cannot be truncated/offloaded — that is the entire point of the guard.
 */
function buildLoopBlockedResponse({ sessionId, calls }: LoopBlockArgs) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            status: 'loop_detected',
            one_shot: true,
            calls_in_session: calls,
            message:
              'setup_clearthought already SUCCEEDED ' +
              calls +
              ' times in this session and returned the complete guide. ' +
              'The full content was delivered in the first response ' +
              '(check your client for the earlier tool result / offloaded file). ' +
              'Do NOT call this tool again — proceed with your actual task now. ' +
              'Only pass force:true if you genuinely need a newly rendered guide.',
            how_to_override: 'force: true'
          },
          null,
          2
        )
      }
    ]
  };
}

interface Placeholder {
  token: string;
  value?: string;
  fallback: string;
}

/** Target size per delivered part (chars). Well below the ~20KB client
 *  offload threshold so each response arrives inline in the model context. */
const PART_SIZE = 4500;

/** Splits text into chunks of at most maxChars, breaking at line boundaries
 *  so markdown structure is never cut mid-line. */
function splitIntoParts(text: string, maxChars: number): string[] {
  const lines = text.split('\n');
  const parts: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length > 0 && current.length + line.length + 1 > maxChars) {
      parts.push(current);
      current = line;
    } else {
      current = current.length === 0 ? line : current + '\n' + line;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
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
    'setup_clearthought',
    'Return a ready-to-use AGENTS.md reasoning-tool guide (with usage rules, ' +
      'tool routing and workflow recipes) for projects consuming this server, ' +
      'optionally merged into existing AGENTS.md content. ' +
      'IMPORTANT: This is a ONE-SHOT tool. It always succeeds on the first call; ' +
      'never call it again to retry or verify — vary nothing and repeat nothing. ' +
      'If the response is truncated in your view, the call still succeeded: ' +
      'read `status` first and stop after one call.',
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
        ),
      force: z
        .boolean()
        .optional()
        .describe(
          'Escape hatch for the per-session loop guard: pass true ONLY to ' +
            'intentionally re-render the guide after setup_clearthought was ' +
            'already called multiple times in this session.'
        ),
      part: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'FULL mode delivers the guide PAGED (each part well under the ' +
            'client offload threshold, so every response stays inline): ' +
            'part 0 (or omitted) returns metadata + the first part and ' +
            'reports total_parts; follow up with part: 1, 2, ... to fetch ' +
            'the remaining parts in order. part calls are exempt from the ' +
            'loop guard. Ignored in merge mode.'
        )
    },
    async (args, extra) => {
      const sessionId = extra?.sessionId ?? 'no-session';
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

      // --- Loop guard (server-side anti-retry) -------------------------------
      // Counts FULL-mode calls per session. From the threshold on, repeated
      // calls get a SHORT blocked response instead of the ~20KB guide, because
      // offloaded/truncated large responses hide the success flag from the
      // model and cause endless retries (observed 2026-09-23). Merge-mode
      // calls are exempt (idempotent updates are legitimate), as is force:true.
      if (mode === 'full' && args.force !== true && args.part === undefined) {
        const calls = (fullCallCounters.get(sessionId) ?? 0) + 1;
        fullCallCounters.set(sessionId, calls);
        if (calls > FULL_CALL_LOOP_THRESHOLD) {
          return buildLoopBlockedResponse({ sessionId, calls });
        }
      }

      const unresolved0 = placeholders
        .filter((p) => valueOrFallback(p) === p.fallback && content.includes(p.fallback))
        .map((p) => p.token);

      // --- Paged delivery (root-cause fix for response offloading) ----------
      // Full-mode responses are split into parts small enough to stay inline.
      // The first call returns metadata + part 0 and tells the agent how many
      // parts exist; subsequent calls fetch part N directly. `part` calls are
      // exempt from the loop guard (they are deterministic fetches, not
      // retries). Merge mode is never paged (existing_agents_md input implies
      // a write-back flow where the full document is required).
      if (mode === 'full') {
        const parts = splitIntoParts(content, PART_SIZE);
        const requested = args.part ?? 0;
        if (requested >= parts.length) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    status: 'part_out_of_range',
                    one_shot: true,
                    part: requested,
                    total_parts: parts.length,
                    message:
                      'Invalid part: this guide has ' +
                      parts.length +
                      ' parts (0..' +
                      (parts.length - 1) +
                      '). Fetch the missing parts in order and stop.',
                    how_to_fix: 'part: 0..' + (parts.length - 1)
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  status: 'success',
                  one_shot: true,
                  delivery: 'paged',
                  part: requested,
                  total_parts: parts.length,
                  final_part: requested === parts.length - 1,
                  mode,
                  content_part: parts[requested],
                  unresolved_placeholders: unresolved0,
                  nextSteps:
                    requested < parts.length - 1
                      ? [
                          'Fetch the next part: call setup_clearthought again with the SAME arguments plus part: ' +
                            (requested + 1) +
                            ' (total ' +
                            parts.length +
                            ' parts).',
                          'Then assemble all parts in order (they concatenate 1:1) and write the result to AGENTS.md.'
                        ]
                      : [
                          'Final part received. Concatenate parts 0..' +
                            (parts.length - 1) +
                            ' in order (1:1, no separators) and write the result to AGENTS.md.',
                          'Fill any unresolved placeholders directly in the written file.',
                          'Later updates: pass the file content as existing_agents_md to update the guide block in place.'
                        ]
                },
                null,
                2
              )
            }
          ]
        };
      }

      // After the paged block, mode is guaranteed 'merge': the full-mode path
      // returned inside the paged block. Simplify the merge-only response.
      const unresolved = placeholders
        .filter((p) => valueOrFallback(p) === p.fallback && content.includes(p.fallback))
        .map((p) => p.token);

      // one_shot note is scoped per mode: merge mode legitimately allows repeat
      // calls (idempotent in-place updates); full mode must never be retried.
      const note =
        'This call SUCCEEDED. Repeat calls with existing_agents_md are ' +
        'allowed for idempotent in-place updates, but never call it again ' +
        'to retry or verify success.';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                // status FIRST: large `content` can push trailing fields out of
                // a truncated tool-result view, which caused agents to assume
                // failure and retry the call in an endless loop (2026-09-23).
                status: 'success',
                one_shot: false,
                note,
                mode,
                block_replaced: blockReplaced,
                ...(warning ? { warning } : {}),
                content,
                unresolved_placeholders: unresolved,
                nextSteps: [
                  'Write `content` back to the target AGENTS.md. A previously inserted guide block was replaced in place — no duplication.',
                  'Fill any unresolved placeholders directly in the written file.',
                  'Repeat calls with updated content stay idempotent via the clear-thought markers.'
                ]
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

/** The AGENTS.md template is embedded (see setup-clearthought-template.ts) so it
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
