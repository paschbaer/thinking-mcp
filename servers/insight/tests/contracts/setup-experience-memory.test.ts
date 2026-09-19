/**
 * setup_experience_memory contract tests: full mode, merge mode (marker-based
 * idempotent update), skip-if-existing, gitignore append.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from '../../src/storage/sqlite.ts';
import { EmmsService } from '../../src/service.ts';
import { registerSetupExperienceMemory } from '../../src/tools/setup-experience-memory.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let dir: string;
let captured: Record<string, unknown> | undefined;

// Minimal MCP-server stub capturing the registered tool handler
const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
const fakeServer = {
  tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
    handlers[name] = handler;
  },
} as unknown as McpServer;

const AGENTS_EXISTING = `# AGENTS.md

## Architecture
- Use the graph tools.

<!-- emms:lookup-rules:start -->
## Experience Memory Lookup (EMMS) — proactive retrieval
OLD CONTENT
<!-- emms:lookup-rules:end -->

## More rules
- Keep clean.`;

const CLAUDE_EXISTING = `# CLAUDE.md

## Rules
- Be concise.`;

const GITIGNORE_EXISTING = 'node_modules/\ndist/\nservers/insight/emms-data/\n';

describe('setup_experience_memory (FR-021 groundwork, analog agents_guide)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emms-setup-'));
    const adapter = new SqliteAdapter(join(dir, 's.db'));
    void adapter.init();
    new EmmsService(adapter, join(dir, 'art'));
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    registerSetupExperienceMemory(fakeServer);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('registers as setup_experience_memory', () => {
    expect(handlers['setup_experience_memory']).toBeDefined();
  });

  it('full mode: returns complete AGENTS.md when no existing content given', async () => {
    const out = (await handlers['setup_experience_memory']({ repo_name: 'Niyama' })) as {
      content: Array<{ text: string }>;
    };
    const payload = JSON.parse(out.content[0].text);
    expect(payload.scope).toBe('Niyama-lessons');
    const agents = payload.files.find((f: { file: string }) => f.file === 'AGENTS.md');
    expect(agents.mode).toBe('full');
    expect(agents.content).toContain('# AGENTS.md');
    expect(agents.content).toContain('emms:lookup-rules:start');
    expect(agents.content).toContain('emms:lookup-rules:end');
  });

  it('merge mode: replaces existing marker block in place (idempotent)', async () => {
    const out = (await handlers['setup_experience_memory']({
      existing_agents_md: AGENTS_EXISTING,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(out.content[0].text);
    const agents = payload.files.find((f: { file: string }) => f.file === 'AGENTS.md');
    expect(agents.mode).toBe('merge');
    expect(agents.block_replaced).toBe(true);
    // OLD CONTENT must be gone (replaced in place)
    expect(agents.content).not.toContain('OLD CONTENT');
    // surrounding content preserved
    expect(agents.content).toContain('## Architecture');
    expect(agents.content).toContain('## More rules');
    // exactly one marker pair
    expect(agents.content.split('emms:lookup-rules:start').length - 1).toBe(1);
  });

  it('CLAUDE.md full mode when no existing content', async () => {
    const out = (await handlers['setup_experience_memory']({})) as { content: Array<{ text: string }> };
    const payload = JSON.parse(out.content[0].text);
    const claude = payload.files.find((f: { file: string }) => f.file === 'CLAUDE.md');
    expect(claude.mode).toBe('full');
    expect(claude.content).toContain('emms:lookup-rules:start');
  });

  it('CLAUDE.md merge mode with existing content', async () => {
    const out = (await handlers['setup_experience_memory']({
      existing_claude_md: CLAUDE_EXISTING,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(out.content[0].text);
    const claude = payload.files.find((f: { file: string }) => f.file === 'CLAUDE.md');
    expect(claude.mode).toBe('merge');
    expect(claude.content).toContain('## Rules');
    expect(claude.content).toContain('emms:lookup-rules:start');
  });

  it('capture prompt: skip when non-empty existing, full when missing', async () => {
    const withExisting = (await handlers['setup_experience_memory']({
      existing_capture_prompt: '---\ndescription: my prompt\n---\ncontent',
    })) as { content: Array<{ text: string }> };
    const promptExisting = JSON.parse(withExisting.content[0].text).files.find(
      (f: { file: string }) => f.file === '.github/prompts/capture-lessons.prompt.md'
    );
    expect(promptExisting.mode).toBe('skip');

    const withoutExisting = (await handlers['setup_experience_memory']({})) as { content: Array<{ text: string }> };
    const promptFull = JSON.parse(withoutExisting.content[0].text).files.find(
      (f: { file: string }) => f.file === '.github/prompts/capture-lessons.prompt.md'
    );
    expect(promptFull.mode).toBe('full');
    expect(promptFull.content).toContain('Capture Lessons');
  });

  it('gitignore: appends only missing lines, skips when all present', async () => {
    const partial = (await handlers['setup_experience_memory']({
      existing_gitignore: GITIGNORE_EXISTING,
    })) as { content: Array<{ text: string }> };
    const gitPartial = JSON.parse(partial.content[0].text).files.find((f: { file: string }) => f.file === '.gitignore');
    expect(gitPartial.mode).toBe('append');
    expect(gitPartial.content).toContain('emms-store.db*');

    const complete = (await handlers['setup_experience_memory']({
      existing_gitignore: 'node_modules/\n' + GITIGNORE_LINES_ALL,
    })) as { content: Array<{ text: string }> };
    const gitComplete = JSON.parse(complete.content[0].text).files.find((f: { file: string }) => f.file === '.gitignore');
    expect(gitComplete.mode).toBe('skip');
  });

  it('custom triggers replace the defaults', async () => {
    const out = (await handlers['setup_experience_memory']({
      custom_triggers: [{ domain: 'pnpm workspaces', keywords: 'pnpm workspace protocol' }],
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(out.content[0].text);
    const agents = payload.files.find((f: { file: string }) => f.file === 'AGENTS.md');
    expect(agents.content).toContain('pnpm workspaces');
  });
});

const GITIGNORE_LINES_ALL = [
  'servers/insight/emms-data/',
  'servers/insight/emms-store.db*',
  'servers/insight/emms-artifacts/',
].join('\n');
