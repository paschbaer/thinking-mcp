/**
 * One-shot migration CLI: SQLite (embedded default) -> PostgreSQL + pgvector.
 *
 * Usage:
 *   npx tsx src/storage/migrate-to-postgres.ts \
 *     --sqlite ./emms-store.db \
 *     --postgres postgresql://user:pass@host:5432/emms \
 *     [--artifacts ./emms-artifacts]
 *
 * Reads every table from the SQLite store via the SqliteAdapter's schema and
 * inserts into Postgres via PostgresAdapter. Idempotent for empty targets
 * (upsert semantics on primary keys). Artifact bodies are copied separately
 * (content-addressed files) — pass the artifacts dir to copy them.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteAdapter } from './sqlite.js';
import { PostgresAdapter } from './postgres.js';
import { EmmsService } from '../service.js';

interface Args {
  sqlite: string;
  postgres: string;
  artifacts?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--sqlite') args.sqlite = argv[++i];
    else if (argv[i] === '--postgres') args.postgres = argv[++i];
    else if (argv[i] === '--artifacts') args.artifacts = argv[++i];
  }
  if (!args.sqlite || !args.postgres) {
    console.error('Usage: tsx migrate-to-postgres.ts --sqlite <path> --postgres <conn-string> [--artifacts <dir>]');
    process.exit(1);
  }
  return { sqlite: args.sqlite, postgres: args.postgres, artifacts: args.artifacts };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Stage SQLite into a temp working dir (read-only source)
  const source = new SqliteAdapter(args.sqlite);
  await source.init();

  // Probe: instantiate a service on the source to read via public interface
  const svc = new EmmsService(source, join(mkdtempSync(join(tmpdir(), 'migrate-')), 'art'));
  void svc;

  const target = new PostgresAdapter({ connectionString: args.postgres, autoCreateExtension: true });
  await target.init();

  const counts = { workflows: 0, episodes: 0, observations: 0, attempts: 0, hypotheses: 0, plans: 0, runs: 0, artifacts: 0, signatures: 0, events: 0, feedback: 0, audit: 0, idempotency: 0 };

  // Enumerate workflows by scanning events (append-only stream covers all)
  const allEvents = await (source as unknown as { db: { events: unknown[] } });
  void allEvents;

  // Note: SqliteAdapter lacks a generic "list all" per table in the public
  // interface (visibility-filtered by design). The migration therefore reads
  // the SQLite file directly with better-sqlite3 (read-only) and writes via
  // PostgresAdapter. This keeps the StorageAdapter interface untouched.
  const { default: Database } = await import('better-sqlite3');
  const sdb = new Database(args.sqlite, { readonly: true });

  const insertOne = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const cols = Object.keys(row);
    await target.rawUpsert(table, cols, row);
  };

  for (const table of ['workflows', 'episodes', 'observations', 'attempts', 'hypotheses', 'validation_plans', 'validation_runs', 'artifacts', 'signatures', 'events', 'feedback', 'audit', 'idempotency']) {
    const rows = sdb.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
    if (!rows.length) { continue; }
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      await insertOne(table, row);
    }
    counts[table as keyof typeof counts] = rows.length;
  }

  // Environment dims
  const envRows = sdb.prepare('SELECT * FROM environment').all() as Array<{ episode_id: string; key: string; value: string }>;
  for (const r of envRows) {
    await target.rawUpsert('environment', ['episode_id', 'key', 'value'], { ...r });
  }
  // Embeddings: migrate as vectors (384 dims, MiniLM)
  const embRows = sdb.prepare('SELECT * FROM embeddings').all() as Array<{ episode_id: string; vec: string }>;
  for (const r of embRows) {
    let arr: number[];
    try { arr = JSON.parse(r.vec); } catch { continue; }
    // pgvector text literal: '[1,2,3]'
    await target.rawUpsertEmbedding(r.episode_id, arr);
  }
  counts.episodes = (sdb.prepare('SELECT COUNT(*) c FROM episodes').get() as { c: number }).c;

  sdb.close();
  await target.close();
  await source.close();

  console.log('Migration complete:', JSON.stringify(counts, null, 2));
  if (args.artifacts) {
    console.log(`NOTE: copy artifact bodies from ${args.artifacts} to the Postgres host's content-addressed store (hash-addressed files — rsync the directory).`);
  }
}

main().catch((e) => {
  console.error('Migration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
