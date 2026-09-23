/**
 * Regenerates the root AGENTS.md guide block via the REAL setup_clearthought tool
 * handler (merge mode) — never hand-edit the generated block (RB-2).
 *
 * Additionally removes the deprecated `stochastic-thinking:agents-guide`
 * block: its content is folded into the consolidated clear-thought guide
 * since the server merge (plan `merge-stochastic-into-clear-thought.md`).
 *
 * Run from servers/server-clear-thought:  npx tsx scripts/regen-root-agents.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultConfig } from '../src/config.js';
import { SessionState } from '../src/state/SessionState.js';
import { registerAgentsGuide } from '../src/tools/agents-guide.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootAgentsPath = join(here, '..', '..', '..', 'AGENTS.md');
const existing = readFileSync(rootAgentsPath, 'utf8');

// Strip the deprecated stochastic-thinking guide block (generated content).
const S_START = '<!-- stochastic-thinking:agents-guide:start -->';
const S_END = '<!-- stochastic-thinking:agents-guide:end -->';
const sStart = existing.indexOf(S_START);
const sEnd = existing.indexOf(S_END);
let stripped = existing;
if (sStart !== -1 && sEnd !== -1) {
  stripped = existing.slice(0, sStart) + existing.slice(sEnd + S_END.length);
  console.log('stochastic-thinking guide block found — removing.');
} else {
  console.log('no stochastic-thinking guide block present — nothing to remove.');
}

const server = new McpServer({ name: 'regen', version: '0.0.0' });
const state = new SessionState('regen', defaultConfig);
registerAgentsGuide(server, state);
const tool = (server as unknown as { _registeredTools: Record<string, any> })
  ._registeredTools['setup_clearthought'];
const result = await tool.handler(
  {
    project_name: 'Thinking-MCP',
    domain_context:
      'MCP servers providing structured reasoning and decision tools (clear-thought toolset incl. stochastic algorithms) for coding agents.',
    codebase_root: '/mnt/d/repos/Thinking-MCP',
    detail: 'full',
    existing_agents_md: stripped
  },
  {}
);
const data = JSON.parse(result.content[0].text);
if (data.mode !== 'merge' || data.block_replaced !== true) {
  console.error(
    'unexpected setup_clearthought result:',
    data.mode,
    data.block_replaced,
    data.warning ?? ''
  );
  process.exit(1);
}
writeFileSync(rootAgentsPath, data.content);
console.log('root AGENTS.md: clear-thought guide block regenerated (merge, replaced).');
