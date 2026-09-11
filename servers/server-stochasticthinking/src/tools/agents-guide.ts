import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AGENTS_TEMPLATE } from './agents-guide-template.js';

const START_MARKER = '<!-- stochastic-thinking:agents-guide:start -->';
const END_MARKER = '<!-- stochastic-thinking:agents-guide:end -->';
const BODY_HEADING = '## Ground rules';
const GUIDE_HEADING = '# Stochastic Thinking — Decision Tool Guide';

interface Placeholder {
  token: string;
  value?: string;
  fallback: string;
}

interface AgentsGuideArgs {
  project_name?: string;
  domain_context?: string;
  codebase_root?: string;
  existing_agents_md?: string;
}

export const AGENTS_GUIDE_TOOL: Tool = {
  name: 'agents_guide',
  description:
    'Return a ready-to-use AGENTS.md decision-tool guide (with algorithm ' +
    'routing and workflow recipes) for projects consuming this server, ' +
    'optionally merged into existing AGENTS.md content',
  inputSchema: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        minLength: 1,
        description: 'Name of the target project — replaces the {{PROJECT_NAME}} placeholder'
      },
      domain_context: {
        type: 'string',
        minLength: 1,
        description: '1-3 sentences about the target project domain — replaces {{DOMAIN_CONTEXT}}'
      },
      codebase_root: {
        type: 'string',
        minLength: 1,
        description: 'Working root for the agent — replaces the {{CODEBASE_ROOT}} placeholder'
      },
      existing_agents_md: {
        type: 'string',
        minLength: 1,
        description:
          'Content of an existing AGENTS.md. Providing it switches to merge mode: ' +
          'the guide is integrated into this content (replacing a previously ' +
          'inserted guide block if present) instead of returning a full document.'
      }
    },
    additionalProperties: false
  }
};

/** Validates and normalizes arguments; throws McpError on invalid input. */
export function parseAgentsGuideArgs(raw: unknown): AgentsGuideArgs {
  const data = (raw ?? {}) as Record<string, unknown>;
  const result: AgentsGuideArgs = {};

  for (const key of [
    'project_name',
    'domain_context',
    'codebase_root',
    'existing_agents_md'
  ] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length < 1) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `agents_guide: ${key} must be a non-empty string`
      );
    }
    result[key] = value;
  }

  return result;
}

/** Handles a tools/call for agents_guide. */
export function handleAgentsGuideCall(rawArgs: unknown): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  try {
    const args = parseAgentsGuideArgs(rawArgs);
    const placeholders: Placeholder[] = [
      { token: '{{PROJECT_NAME}}', value: args.project_name, fallback: '<your project>' },
      {
        token: '{{DOMAIN_CONTEXT}}',
        value: args.domain_context,
        fallback: '<describe your domain>'
      },
      { token: '{{CODEBASE_ROOT}}', value: args.codebase_root, fallback: '<working root>' }
    ];

    const template = loadTemplate();
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
                  : 'Repeat calls with updated content stay idempotent via the stochastic-thinking markers.'
              ],
              status: 'success'
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
              status: 'failed'
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
}

/** The AGENTS template is embedded (see agents-guide-template.ts) so it
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
      'AGENTS template is malformed: expected "# Stochastic Thinking — Decision Tool Guide" followed by "## Ground rules"'
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
  const contextLine = placeholders.find(
    (p) => p.token === '{{CODEBASE_ROOT}}' && p.value !== undefined
  );
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
        'The existing content contains incomplete or duplicated stochastic-thinking guide markers; ' +
        'the guide was appended instead of replacing them. Clean up the stray ' +
        `${START_MARKER} / ${END_MARKER} lines manually and re-run to restore in-place updates.`
    };
  }
  const base = existing.trimEnd();
  return { content: `${base}\n\n${block}\n`, blockReplaced: false };
}
