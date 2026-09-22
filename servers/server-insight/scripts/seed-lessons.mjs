/**
 * Lesson seeder: persists lessons (recurring bugs, traps, best practices)
 * as EMMS experience episodes via the running server's HTTP endpoint
 * (default) or via stdio (opt-in).
 *
 * Usage:
 *   node scripts/seed-lessons.mjs lessons.json
 *
 * Transport selection:
 *   HTTP (default): connects to $EMMS_HTTP_URL (default
 *     http://localhost:3002/mcp) — writes into the SAME store the running
 *     server uses (Docker volume or stdio store), avoiding the split-store
 *     inconsistency where the seeder wrote to ~/.insight while the Docker
 *     server read from emms-data/.
 *   stdio (opt-in): EMMS_SEED_TRANSPORT=stdio spawns dist/dev.js locally —
 *     writes to ~/.insight/emms-store.db (or $EMMS_STORAGE_PATH); use
 *     scripts/migrate-stdio-store.mjs to merge into the HTTP store.
 *
 * Input format (JSON array):
 * [
 *   {
 *     "slug": "better-sqlite3-native-binding",
 *     "observation": "what went wrong (symptom + context)",
 *     "cause": "root cause / why it happened",
 *     "fix": "the validated workaround or fix"
 *   }
 * ]
 *
 * Idempotent: idempotency_key = lesson-<slug> — re-running never duplicates.
 * Scope: thinking-mcp-lessons (all lessons share one scope).
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

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
}

let ok = 0;
const failures = [];

for (const l of LESSONS) {
  try {
    const start = await call('workflow_start', {
      goal: `Persist lesson: ${l.slug}`,
      scope_id: SCOPE,
      problem_summary: l.observation.slice(0, 120),
      idempotency_key: `lesson-${l.slug}`,
      client_context: { scope_id: SCOPE, agent_id: 'lesson-seeder' },
    });
    const wf = start.result.workflow_id;
    let rev = start.result.revision;

    await call('experience_record_observation', {
      workflow_id: wf, kind: 'agent_reflection',
      content: `OBSERVATION: ${l.observation}`, expected_revision: rev,
      client_context: { scope_id: SCOPE },
    }); rev++;

    await call('experience_record_observation', {
      workflow_id: wf, kind: 'environment_fact',
      content: JSON.stringify({ area: 'emms-mvp', trap_class: 'recurring-bug' }),
      expected_revision: rev, client_context: { scope_id: SCOPE },
    }); rev++;

    const att = await call('experience_record_attempt', {
      workflow_id: wf, intent: `Apply fix: ${l.fix}`, risk_classification: 'low',
      rationale: 'validated during implementation', expected_revision: rev,
      client_context: { scope_id: SCOPE },
    }); rev++;

    await call('experience_complete_attempt', {
      workflow_id: wf, attempt_id: att.result.attempt_id,
      outcome: `Fix applied and verified: ${l.fix}`,
      classification: 'successful', expected_revision: rev,
      client_context: { scope_id: SCOPE },
    }); rev++;

    await call('experience_propose_hypothesis', {
      workflow_id: wf, statement: `Root cause: ${l.cause}`,
      evidence_refs: [], expected_revision: rev,
      client_context: { scope_id: SCOPE },
    }); rev++;

    await call('experience_finalize', {
      workflow_id: wf, requested_outcome: 'partially_verified',
      expected_revision: rev, client_context: { scope_id: SCOPE },
    });

    ok++;
    console.error(`SEEDED ${ok}/${LESSONS.length}: ${l.slug}`);
  } catch (e) {
    failures.push({ slug: l.slug, error: e.message?.slice(0, 150) });
    console.error(`FAILED ${l.slug}:`, e.message?.slice(0, 120));
  }
}

await client.close();
console.error(`DONE: ${ok}/${LESSONS.length} lessons captured`);
if (failures.length) {
  console.error('Failures:', JSON.stringify(failures, null, 2));
  process.exit(1);
}
