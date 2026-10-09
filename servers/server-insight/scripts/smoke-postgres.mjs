/**
 * Live smoke test for the Postgres storage backend (pgvector).
 *
 * Takes a connection string as input and carries NO docker logic — the
 * caller owns the database lifecycle (temporary container, compose stack,
 * or a real deployment):
 *
 *   node scripts/smoke-postgres.mjs "postgres://user:pass@host:port/db"
 *   # or: EMMS_PG_CONNECTION_STRING=... node scripts/smoke-postgres.mjs
 *
 * Verifies against a LIVE Postgres:
 *   1. schema init/migration path (PostgresAdapter.init incl.
 *      autoCreateExtension: CREATE EXTENSION vector)
 *   2. basic episode upsert + retrieval through the service (seedLessons)
 *   3. searchFullText FTS parity: sanitized OR-joined tokens, graded
 *      fts_rank (ts_rank), LEFT JOIN signatures (signature-less episodes
 *      must not be dropped)
 *   4. end-to-end service.search over Postgres (FTS arm + fts_rank pin)
 *   5. backend-aware storage factory: EMMS_STORAGE_BACKEND=postgres
 *      constructs a PostgresAdapter (what the semantic warmup uses), and
 *      a missing connection string fails loudly (no silent sqlite fallback)
 *
 * Exit code 0 = all checks green; anything else prints the failing check.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cs = process.argv[2] ?? process.env.EMMS_PG_CONNECTION_STRING;
if (!cs) {
  console.error(
    "usage: node scripts/smoke-postgres.mjs <postgres-connection-string>",
  );
  process.exit(2);
}

process.env.EMMS_STORAGE_BACKEND = "postgres";
process.env.EMMS_PG_CONNECTION_STRING = cs;

let failed = 0;
const check = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`[smoke-postgres] PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    console.error(
      `[smoke-postgres] FAIL ${name} — ${e instanceof Error ? e.stack : String(e)}`,
    );
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
};

const { PostgresAdapter } = await import("../dist/storage/postgres.js");
const { EmmsService } = await import("../dist/service.js");
const { buildStorageAdapter } = await import("../dist/storage/factory.js");

const scope = `pg-smoke-${Date.now()}`;
const CTX = { scope_id: scope, agent_id: "pg-smoke" };
const artifactsDir = mkdtempSync(join(tmpdir(), "emms-pg-smoke-"));

const adapter = new PostgresAdapter({
  connectionString: cs,
  autoCreateExtension: true,
});
const service = new EmmsService(adapter, artifactsDir);

const runTag = `${Date.now()}`;
const slug = (base) => `${base}-${runTag}`;
const LESSONS = [
  {
    slug: slug("pg-smoke-vector-extension"),
    observation:
      "The vector extension is created once by init when autoCreateExtension is set.",
    cause: "pgvector must be available before the embeddings migration runs.",
    fix: "Pass autoCreateExtension on first init against a fresh database.",
  },
  {
    slug: slug("pg-smoke-fts-or-tokens"),
    observation:
      "Multi-token full-text queries OR-join sanitized tokens and rank graded by ts_rank.",
    cause:
      "AND-joined tsquery matched essentially never for multi-token queries.",
    fix: "OR-join tokens; keep the graded fts_rank column (higher = better).",
  },
];

try {
  await check(
    "1. schema init + migrations (incl. pgvector extension)",
    async () => {
      await adapter.init();
      return "init resolved";
    },
  );

  await check(
    "2. episode upsert + retrieval via service (seedLessons)",
    async () => {
      const seeded = await service.seedLessons({
        lessons: LESSONS,
        client_context: CTX,
      });
      const payload = seeded.result;
      assert(payload.seeded === 2, `expected 2 seeded, got ${payload.seeded}`);
      const rows = await adapter.listInScope(scope);
      assert(
        rows.length === 2,
        `expected 2 episodes in scope, got ${rows.length}`,
      );
      return `seeded=${payload.seeded}, listedInScope=${rows.length}`;
    },
  );

  await check(
    "3a. searchFullText: OR-joined multi-token query hits + graded fts_rank",
    async () => {
      const rows = await adapter.searchFullText("graded ts_rank tokens", scope);
      assert(rows.length > 0, "no rows for a multi-token OR query");
      for (const r of rows) {
        assert(
          typeof r.fts_rank === "number" && Number.isFinite(r.fts_rank),
          `row ${r.episode_id} without numeric fts_rank`,
        );
      }
      return `${rows.length} rows, fts_rank all numeric`;
    },
  );

  await check(
    "3b. searchFullText: LEFT JOIN (signature-less lessons not dropped)",
    async () => {
      // Seeded lessons have NO signature rows — an INNER join would drop them.
      const rows = await adapter.searchFullText("signature-less lesson", scope);
      assert(
        rows.length > 0,
        "signature-less episodes dropped from FTS results",
      );
      return `${rows.length} signature-less episodes returned`;
    },
  );

  await check(
    "4. end-to-end service.search over Postgres (FTS arm + contract pin)",
    async () => {
      const out = await service.search({
        query: "graded ts_rank tokens",
        limit: 5,
        ...CTX,
      });
      const hits = out.result?.results ?? [];
      assert(hits.length > 0, "no hits from service.search");
      assert(
        hits[0].summary.toLowerCase().includes("fts-or-tokens") ||
          JSON.stringify(hits[0])
            .toLowerCase()
            .includes("pg-smoke-fts-or-tokens"),
        `unexpected top hit: ${hits[0].summary}`,
      );
      return `top hit = pg-smoke-fts-or-tokens lesson, relevance=${hits[0].relevance}`;
    },
  );

  await check(
    "5a. backend-aware factory constructs PostgresAdapter (warmup path)",
    async () => {
      const handle = buildStorageAdapter();
      assert(
        handle.adapter instanceof PostgresAdapter,
        `factory returned ${handle.adapter.constructor.name}`,
      );
      return handle.adapter.constructor.name;
    },
  );

  await check(
    "5b. factory fail-closed: postgres without connection string",
    async () => {
      const saved = process.env.EMMS_PG_CONNECTION_STRING;
      process.env.EMMS_PG_CONNECTION_STRING = "";
      try {
        buildStorageAdapter();
        throw new Error("factory did NOT throw on missing connection string");
      } catch (e) {
        assert(
          /EMMS_PG_CONNECTION_STRING/.test(String(e.message)),
          "throw without the actionable message",
        );
      } finally {
        process.env.EMMS_PG_CONNECTION_STRING = saved;
      }
      return "loud actionable error, no silent sqlite fallback";
    },
  );
} finally {
  await adapter.close().catch(() => {});
  rmSync(artifactsDir, { recursive: true, force: true });
}

if (failed) {
  console.error(`[smoke-postgres] ${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("[smoke-postgres] ALL CHECKS GREEN");
