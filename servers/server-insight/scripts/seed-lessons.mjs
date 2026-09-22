/**
 * Lesson seeder (THIN CLIENT): the entire seeding logic lives server-side in
 * the `experience_seed_lessons` MCP tool (src/service.ts, seedLessons). This
 * script only transports the JSON payload over MCP — HTTP (default) or stdio
 * (opt-in) — so it carries NO store/path logic itself.
 *
 * Usage:
 *   node scripts/seed-lessons.mjs lessons.json
 *
 * Transport:
 *   HTTP (default): $EMMS_HTTP_URL (default http://localhost:3002/mcp) —
 *     the running server's store (Docker volume or stdio store).
 *   stdio (opt-in): EMMS_SEED_TRANSPORT=stdio spawns dist/dev.js locally.
 *
 * Input format (JSON array):
 * [ { "slug": "...", "observation": "...", "cause": "...", "fix": "..." } ]
 *
 * Idempotent: server-side idempotency_key = lesson-<slug>; re-runs report
 * the lesson as `duplicate` without appending anything.
 * Scope: EMMS_LESSON_SCOPE or 'thinking-mcp-lessons'.
 */
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distEntry = join(scriptDir, '..', 'dist', 'dev.js');
const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node scripts/seed-lessons.mjs <lessons.json>');
  process.exit(1);
}

const LESSONS = JSON.parse(readFileSync(inputPath, 'utf8'));
const SCOPE = process.env.EMMS_LESSON_SCOPE ?? 'thinking-mcp-lessons';

const USE_STDIO = process.env.EMMS_SEED_TRANSPORT === 'stdio';
const HTTP_URL = process.env.EMMS_HTTP_URL ?? 'http://localhost:3002/mcp';

const transport = USE_STDIO
  ? new StdioClientTransport({ command: 'node', args: [distEntry] })
  : new StreamableHTTPClientTransport(new URL(HTTP_URL));
const client = new Client({ name: 'lesson-seeder', version: '1.0' });
try {
  await client.connect(transport);
} catch (e) {
  if (USE_STDIO) throw e;
  console.error(
    `ERROR: cannot reach HTTP server at ${HTTP_URL} (${e.message}).\n` +
    'Start it with `docker compose up -d` in servers/server-insight, ' +
    'or set EMMS_SEED_TRANSPORT=stdio to seed the local ~/.insight store ' +
    '(then migrate with scripts/migrate-stdio-store.mjs).'
  );
  process.exit(1);
}

const res = await client.callTool({
  name: 'experience_seed_lessons',
  arguments: {
    lessons: LESSONS,
    scope_id: SCOPE,
    client_context: { scope_id: SCOPE, agent_id: 'lesson-seeder' },
  },
});
const out = JSON.parse(res.content[0].text);

if (out.error) {
  console.error('ERROR:', JSON.stringify(out.error, null, 2));
  process.exit(1);
}

const { seeded, duplicates, failed, lessons } = out.result;
for (const r of lessons) {
  console.error(`${r.status.toUpperCase().padEnd(9)} ${r.slug}${r.message ? ' — ' + r.message : ''}`);
}

await client.close();
console.error(`DONE: ${seeded}/${LESSONS.length} seeded, ${duplicates} duplicates, ${failed} failed`);
if (failed > 0) process.exit(1);
