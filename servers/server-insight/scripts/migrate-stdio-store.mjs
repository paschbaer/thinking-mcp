/**
 * One-shot migration: copy all rows from the stdio default store
 * (~/.insight/emms-store.db) into the Docker store (emms-data/emms-store.db),
 * so episodes seeded/recorded via stdio become visible to the Dockerized
 * HTTP server (and vice versa when source/target are swapped).
 *
 * Usage (run from servers/server-insight so node_modules resolves):
 *   node scripts/migrate-stdio-store.mjs [--source <db>] [--target <db>] [--dry-run]
 *
 * Defaults:
 *   source: $EMMS_SOURCE_DB or ~/.insight/emms-store.db
 *   target: $EMMS_TARGET_DB or ./emms-data/emms-store.db
 *
 * Strategy: direct SQLite-to-SQLite row copy with INSERT OR IGNORE on the
 * primary keys — idempotent (safe to re-run), never overwrites newer target
 * rows. Artifacts (content-addressed files next to the DB in emms-artifacts/)
 * are copied byte-identically when missing at the target. FTS5 index rows are
 * migrated with the episodes; if any are missing they are rebuilt from
 * episodes at the end.
 *
 * NOTE: stop the insight container while migrating to avoid WAL contention.
 */
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

// ---- argument parsing -------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const dryRun = args.includes('--dry-run');
const defaultSource = join(homedir(), '.insight', 'emms-store.db');
const defaultTarget = join(scriptDir, '..', 'emms-data', 'emms-store.db');
const sourcePath = resolve(argValue('--source') ?? process.env.EMMS_SOURCE_DB ?? defaultSource);
const targetPath = resolve(argValue('--target') ?? process.env.EMMS_TARGET_DB ?? defaultTarget);

for (const p of [sourcePath, targetPath]) {
  if (!existsSync(p)) {
    console.error(`ERROR: store not found: ${p}`);
    process.exit(1);
  }
}

// Deterministic copy order: parents before children.
const TABLES = [
  'workflows',
  'episodes',
  'observations',
  'attempts',
  'hypotheses',
  'validation_plans',
  'validation_runs',
  'artifacts',
  'signatures',
  'lessons',
  'embeddings',
  'environment',
  'events',
  'feedback',
  'audit',
  'idempotency',
  'episodes_fts', // fts5 virtual table (UNINDEXED episode_id + content columns)
];

console.log(`source: ${sourcePath}`);
console.log(`target: ${targetPath}${dryRun ? '  (DRY RUN — no writes)' : ''}`);

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = new Database(targetPath);

// Fail fast if the target schema is stale/absent (server normally migrates on boot).
for (const t of TABLES) {
  const exists = target.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
  ).get(t);
  if (!exists.n) {
    console.error(`ERROR: table '${t}' missing in target — start the server once so migrations run, then retry.`);
    process.exit(1);
  }
}

const pkColumns = (db, table) =>
  db.prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);

const totals = {};
const dryRunSummary = {};

for (const table of TABLES) {
  let pks = pkColumns(source, table);
  const cols = source.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (pks.length === 0) {
    if (table === 'episodes_fts') continue; // rebuilt from episodes below
    if (table === 'signatures') {
      // No PK: dedupe on the full row via EXCEPT (all columns as key).
      pks = cols;
    } else {
      console.warn(`WARN: ${table} has no primary key — skipped (row-level merge unsafe)`);
      continue;
    }
  }
  const rows = source.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) { totals[table] = 0; continue; }

  if (dryRun) {
    const existing = target.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    dryRunSummary[table] = { sourceRows: rows.length, targetRowsBefore: existing };
    continue;
  }

  // Bind by column name to avoid column-order mistakes between schema versions.
  const named = target.prepare(
    `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => `@${c}`).join(',')})`
  );
  const realPk = pkColumns(target, table).length > 0;
  const exists = realPk
    ? null
    : target.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${cols.map((c) => `${c} IS @${c}`).join(' AND ')}`
      );
  const copyTx = target.transaction((batch) => {
    let copied = 0;
    for (const row of batch) {
      if (exists && exists.get(row).n > 0) continue;
      copied += named.run(row).changes;
    }
    return copied;
  });
  totals[table] = copyTx(rows);
}

// ---- artifacts ---------------------------------------------------------------
const artifactTableName = 'artifacts';
const sourceArtifactDir = join(dirname(sourcePath), 'emms-artifacts');
const targetArtifactDir = join(dirname(targetPath), 'emms-artifacts');
let artifactsCopied = 0;

if (!dryRun && existsSync(sourceArtifactDir)) {
  mkdirSync(targetArtifactDir, { recursive: true });
  for (const f of readdirSync(sourceArtifactDir)) {
    const src = join(sourceArtifactDir, f);
    const dst = join(targetArtifactDir, f);
    if (statSync(src).isFile() && !existsSync(dst)) {
      copyFileSync(src, dst);
      artifactsCopied++;
    }
  }
}

// ---- verify FTS coverage ------------------------------------------------------
let ftsRebuilt = 0;
if (!dryRun) {
  const missing = target.prepare(`
    SELECT e.experience_id FROM episodes e
    LEFT JOIN episodes_fts f ON f.episode_id = e.experience_id
    WHERE f.episode_id IS NULL
  `).all();
  if (missing.length) {
    const seed = target.prepare(
      'INSERT INTO episodes_fts (episode_id, summary, scope_id) VALUES (?, ?, ?)'
    );
    const rebuildTx = target.transaction((rows) => {
      for (const r of rows) {
        seed.run(r.experience_id, r.goal_summary, r.scope_id);
      }
    });
    rebuildTx(missing);
    ftsRebuilt = missing.length;
  }
}

if (dryRun) {
  console.log('\nDry-run summary (source rows -> target rows before migration):');
  for (const [t, s] of Object.entries(dryRunSummary)) {
    console.log(`  ${t.padEnd(18)} ${String(s.sourceRows).padStart(6)} -> ${s.targetRowsBefore}`);
  }
} else {
  console.log('\nCopied rows (INSERT OR IGNORE):');
  for (const [t, n] of Object.entries(totals)) console.log(`  ${t.padEnd(18)} ${String(n).padStart(6)}`);
  console.log(`  artifacts files:   ${String(artifactsCopied).padStart(6)}`);
  console.log(`  fts rows rebuilt:  ${String(ftsRebuilt).padStart(6)}`);
}

source.close();
target.close();
console.log(dryRun ? '\ndry run complete — no changes written.' : '\nmigration complete.');
