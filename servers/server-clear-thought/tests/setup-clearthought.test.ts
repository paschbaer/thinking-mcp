import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { __resetLoopGuardForTests, registerAgentsGuide } from '../src/tools/setup-clearthought.js';
import { AGENTS_TEMPLATE } from '../src/tools/setup-clearthought-template.js';
import { registerUtilityToolset } from '../src/toolsets/utility.js';

const START = '<!-- clear-thought:agents-guide:start -->';
const END = '<!-- clear-thought:agents-guide:end -->';

beforeEach(() => {
  __resetLoopGuardForTests();
});

function setupServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const state = new SessionState('test', defaultConfig);
  return { server, state };
}

function getTool(server: McpServer, name: string): any {
  return (server as any)._registeredTools[name];
}

async function call(server: McpServer, args: Record<string, unknown>) {
  const result = await getTool(server, 'setup_clearthought').handler(args, {});
  return JSON.parse(result.content[0].text);
}

/** Fetches the full paged guide: part 0, then all remaining parts in order. */
async function fetchAllParts(server: McpServer, args: Record<string, unknown>) {
  const first = await call(server, { ...args, part: 0 });
  expect(first.status).toBe('success');
  expect(first.delivery).toBe('paged');
  const parts: string[] = [first.content_part];
  for (let i = 1; i < first.total_parts; i++) {
    const next = await call(server, { ...args, part: i });
    expect(next.status).toBe('success');
    expect(next.part).toBe(i);
    parts.push(next.content_part);
  }
  return { first, parts: parts.join('') };
}

it('full mode is delivered PAGED: parts stay small, concatenate 1:1 to the complete document', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const { first, parts } = await fetchAllParts(server, {
    project_name: 'Tradix',
    domain_context: 'Algorithmic trading.',
    codebase_root: 'C:/repos/Tradix'
  });

  // every part individually stays well under the ~20KB offload threshold
  expect(first.content_part.length).toBeLessThan(8000);
  expect(first.total_parts).toBeGreaterThanOrEqual(2);

  const doc = parts;
  expect(doc).toContain('# Clear Thought — Reasoning Tool Guide for Tradix');
  expect(doc).toContain('Algorithmic trading.');
  expect(doc).toContain('C:/repos/Tradix');
  // template meta preamble must not leak into the final document
  expect(doc).not.toContain('Template usage');
  // guide body wrapped in markers for later in-place updates
  expect(doc.indexOf(START)).toBeLessThan(doc.indexOf('## Ground rules'));
  expect(doc).toContain(END);
  expect(first.unresolved_placeholders).toEqual([]);
  // the final part announces itself
  const last = await call(server, { project_name: 'Tradix', domain_context: 'Algorithmic trading.', codebase_root: 'C:/repos/Tradix', part: first.total_parts - 1 });
  expect(last.final_part).toBe(true);
});

it('paged delivery: out-of-range part returns a SHORT error naming the valid range', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const first = await call(server, { project_name: 'X' });
  const bad = await call(server, { project_name: 'X', part: first.total_parts });
  expect(bad.status).toBe('part_out_of_range');
  expect(bad.total_parts).toBe(first.total_parts);
  expect(bad.content).toBeUndefined();
  expect(bad.message).toContain('parts (0..');
});

it('serialization puts status FIRST and marks the call as one-shot (anti-retry-loop invariant)', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const raw = await getTool(server, 'setup_clearthought').handler(
    { project_name: 'OrderTest' },
    {}
  );
  const parsed = JSON.parse(raw.content[0].text);
  // status must survive truncation of large payloads -> first serialized field
  const rawText = raw.content[0].text as string;
  const firstKey = rawText.trim().replace(/^\{/, '').split('"')[1];
  expect(firstKey).toBe('status');
  expect(parsed.status).toBe('success');
  expect(parsed.one_shot).toBe(true);
  expect(parsed.delivery).toBe('paged');
  expect(parsed.content_part).toContain('Guide for OrderTest');
});

it('reports unresolved placeholders when optional context is omitted', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, { part: 0 });
  expect(data.mode).toBe('full');
  expect(data.unresolved_placeholders).toEqual(
    expect.arrayContaining(['{{PROJECT_NAME}}', '{{DOMAIN_CONTEXT}}', '{{CODEBASE_ROOT}}'])
  );
});

it('merge mode integrates the guide into existing content without duplication', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {
    project_name: 'Tradix',
    existing_agents_md: '# Tradix Rules\n\nAlways run tests before committing.\n'
  });

  expect(data.mode).toBe('merge');
  expect(data.block_replaced).toBe(false);
  expect(data.content.startsWith('# Tradix Rules')).toBe(true);
  expect(data.content).toContain('Always run tests before committing.');
  expect(data.content).toContain(START);
  expect(data.content).toContain('## Clear Thought — Reasoning Tool Guide');
  expect(data.content.split(START).length - 1).toBe(1);
});

it('re-merging replaces the existing guide block in place', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const first = await call(server, { project_name: 'Tradix', existing_agents_md: '# Rules\n' });
  const second = await call(server, {
    project_name: 'Tradix v2',
    existing_agents_md: first.content
  });

  expect(second.mode).toBe('merge');
  expect(second.block_replaced).toBe(true);
  expect(second.content.split(START).length - 1).toBe(1);
  // provided context is surfaced under the merge heading and updated in place
  expect(second.content).toContain('Project: Tradix v2\n');
  expect(second.content).not.toContain('Project: Tradix\n');
});

it('is exposed through the utility toolset with advertised parameters', async () => {
  const { server, state } = setupServer();
  registerUtilityToolset(server, state);
  const json: any = zodToJsonSchema(getTool(server, 'utility').inputSchema);
  expect(json.properties.operation.enum).toContain('setup_clearthought');
  for (const field of ['project_name', 'domain_context', 'codebase_root', 'existing_agents_md']) {
    expect(json.properties[field]).toBeDefined();
  }

  const handler = getTool(server, 'utility').handler;
  const result = await handler({ operation: 'setup_clearthought', project_name: 'ViaToolset' }, {});
  const data = JSON.parse(result.content[0].text);
  expect(data.mode).toBe('full');
  const second = await handler(
    { operation: 'setup_clearthought', project_name: 'ViaToolset', part: 1 },
    {}
  );
  const doc = data.content_part + JSON.parse(second.content[0].text).content_part;
  expect(doc).toContain('Guide for ViaToolset');
});

it('rejects whitespace-only parameter values', () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const schema = getTool(server, 'setup_clearthought').inputSchema;
  expect(schema.safeParse({ project_name: '   ' }).success).toBe(false);
  expect(schema.safeParse({ existing_agents_md: '' }).success).toBe(false);
});

it('embedded template stays in sync with AGENTS.template.md', () => {
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const onDisk = readFileSync(join(pkgRoot, 'AGENTS.template.md'), 'utf8').replace(/\r\n/g, '\n');
  expect(AGENTS_TEMPLATE).toBe(onDisk);
});

it('merge surfaces codebase_root as context line', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const data = await call(server, {
    project_name: 'Tradix',
    codebase_root: 'C:/repos/Tradix',
    existing_agents_md: '# Rules\n'
  });
  expect(data.content).toContain('Project: Tradix');
  expect(data.content).toContain('Codebase root: C:/repos/Tradix');
});

it('appends with a warning instead of deleting content around corrupt markers', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  // stray START without END: a naive span replace would delete user content
  const corrupt = '# Rules\n' + START + '\nuser notes that must survive\n';
  const data = await call(server, { project_name: 'P', existing_agents_md: corrupt });

  expect(data.block_replaced).toBe(false);
  expect(data.warning).toMatch(/incomplete or duplicated/i);
  // nothing was deleted — corrupt markers and user content are still present
  expect(data.content).toContain('user notes that must survive');
  expect(data.content.split(START).length - 1).toBe(2);
});

it('appends with a warning when END appears before START', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const corrupt = '# Rules\n' + END + '\nsome text\n' + START + '\nbody\n';
  const data = await call(server, { project_name: 'P', existing_agents_md: corrupt });

  expect(data.block_replaced).toBe(false);
  expect(data.warning).toBeDefined();
  expect(data.content).toContain('some text');
});


it('loop guard: blocks the 3rd full-mode call with a SHORT response and force overrides it', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const tool = getTool(server, 'setup_clearthought');
  const extra = { sessionId: 's-loop' };

  await tool.handler({ project_name: 'A' }, extra);
  await tool.handler({ project_name: 'B' }, extra);
  const third = await tool.handler({ project_name: 'C' }, extra);
  const blocked = JSON.parse(third.content[0].text);
  expect(blocked.status).toBe('loop_detected');
  expect(blocked.calls_in_session).toBe(3);
  // hardening: blocked payload keeps the one-shot invariant visible
  expect(blocked.one_shot).toBe(true);
  // SHORT response: must stay far below the offload threshold (~20KB)
  expect(third.content[0].text.length).toBeLessThan(2000);
  expect(blocked.content).toBeUndefined();

  // merge mode is exempt from the counter
  const merge = await tool.handler({ existing_agents_md: '# My Agents\n\nBody.' }, extra);
  const merged = JSON.parse(merge.content[0].text);
  expect(merged.mode).toBe('merge');
  expect(merged.status).toBe('success');

  // force overrides the block and delivers content again
  const forced = await tool.handler({ project_name: 'D', force: true }, extra);
  const forcedData = JSON.parse(forced.content[0].text);
  expect(forcedData.status).toBe('success');
  expect(forcedData.delivery).toBe('paged');
  expect(forcedData.content_part).toContain('Guide for D');

  // counter is per session: another session still gets content
  const other = await tool.handler({ project_name: 'E' }, { sessionId: 's-other' });
  expect(JSON.parse(other.content[0].text).status).toBe('success');
});

it('paged part calls do NOT trip the loop guard; unparameterized repeats still do', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const tool = getTool(server, 'setup_clearthought');
  const extra = { sessionId: 's-page' };
  const args = { project_name: 'Paged' };

  // many part fetches are legitimate and must never be blocked
  for (let i = 0; i < 6; i++) {
    const r = await tool.handler({ ...args, part: 0 }, extra);
    expect(JSON.parse(r.content[0].text).status).toBe('success');
  }

  // unparameterized full-mode repeats still hit the guard (calls 1..2 pass)
  await tool.handler(args, extra);
  await tool.handler(args, extra);
  const blocked = await tool.handler(args, extra);
  expect(JSON.parse(blocked.content[0].text).status).toBe('loop_detected');
});
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { __resetLoopGuardForTests, registerAgentsGuide } from '../src/tools/setup-clearthought.js';
import { AGENTS_TEMPLATE } from '../src/tools/setup-clearthought-template.js';
import { registerUtilityToolset } from '../src/toolsets/utility.js';


it('escalation: after 3 blocked attempts the guard returns a HARD tool error', async () => {
  const { server, state } = setupServer();
  registerAgentsGuide(server, state);
  const tool = getTool(server, 'setup_clearthought');
  const extra = { sessionId: 's-escalate' };
  const args = { project_name: 'Spam' };

  await tool.handler(args, extra);
  await tool.handler(args, extra);
  // calls 3-5: soft loop_detected, isError false
  for (let i = 3; i <= 5; i++) {
    const r = await tool.handler(args, extra);
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0].text).status).toBe('loop_detected');
  }
  // call 6+: hard error, clients must treat it as a failed tool call
  const hard = await tool.handler(args, extra);
  expect(hard.isError).toBe(true);
  const data = JSON.parse(hard.content[0].text);
  expect(data.status).toBe('refused_do_not_retry');
  expect(data.terminal).toBe(true);
  // stays SHORT even when hard
  expect(hard.content[0].text.length).toBeLessThan(1000);
});
