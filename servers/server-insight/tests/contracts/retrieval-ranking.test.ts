import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteAdapter } from "../../src/storage/sqlite.ts";
import { EmmsService } from "../../src/service.ts";

let dir: string;
let service: EmmsService;
let adapter: SqliteAdapter;
const CTX = { scope_id: "lessons-repro", agent_id: "local-agent" };

// Mirrors of the live lessons involved in the 2026-10-09 retrieval defect:
// every query returned the same oldest episodes with flat relevance because
// the FTS arm never hit (implicit AND) and the scope fallback flooded the
// candidate set.
const LESSONS = [
  {
    slug: "chain-step-workflowid-registry-trap",
    observation:
      "A chained workflow whose steps carry free-form workflowIds passes start_workflow, then complete_workflow fails with workflow_not_found expecting a registry definition.",
    cause:
      "Since the registry change, a chain step workflowId resolves against the workflow registry at successor spawn and fails closed on unknown ids.",
    fix: "Omit workflowId on chain steps so successors inherit the boot workflow, or reference a real registry definition file.",
  },
  {
    slug: "reindex-command-must-be-verbatim-executable",
    observation:
      "Agents did not execute the required manual host-side reindex before completion; the gate failed without an actionable command.",
    cause:
      "Process-operation gates surface the script stderr verbatim; healing hints placed anywhere else never reach the agent at failure time.",
    fix: "Print the exact copy-pasteable host-side reindex command to stderr in the gate script failure path, then retry the operation.",
  },
  {
    slug: "yarn-lockfile-format-mismatch",
    observation:
      "A yarn.lock written in v1 format drifted the dependency tree after an npm contact at the repo root.",
    cause:
      "npm ignores yarn.lock and rewrites the install state; the guard hook fails closed on unrecognizable formats.",
    fix: "Run root installs only with yarn via corepack; keep npm to workspace-level operations with their own lockfiles.",
  },
  {
    slug: "docker-native-module-rebuild-bindings",
    observation:
      "The insight container crashed on startup with a native module binding error after a base image change.",
    cause:
      "better-sqlite3 prebuilt binaries are platform-specific; a musl/glibc switch invalidates the cached bindings.",
    fix: "Rebuild native modules explicitly for the target platform inside the image build.",
  },
  {
    slug: "speckit-checkbox-semantics-invert",
    observation:
      "A parser captured the checkbox state all along; the import simply hardcoded the wrong status.",
    cause:
      "The consumer of the parsed field was never audited; an existing test pinned the defective behavior.",
    fix: "Verify the CONSUMER of a parsed field, not just the parser, and grep the suite for tests pinning current behavior before fixing.",
  },
];

const Q1 = "lessons learned traps yarn lock docker";
const Q2 = "reindex api poll chain workflowId registry";
const Q3 = "checkbox tampered spec kit bridge sessionId";

async function resultsFor(query: string) {
  const out = await service.search({
    query,
    scope_id: CTX.scope_id,
    limit: 20,
  });
  return out.result.results as Array<{
    experience_id: string;
    summary: string;
    relevance: number;
  }>;
}

describe("Retrieval ranking regression (multi-token FTS queries)", () => {
  // ONE adapter/service for the whole file: six per-test seed rounds of
  // short-lived WAL databases on this filesystem trigger the known native
  // better-sqlite3 destructor crash at vitest worker exit (Node-24/WSL
  // flake class). All tests are read-only searches over the same seeded
  // set, so a single shared fixture is equivalent and lighter.
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "emms-rank-"));
    adapter = new SqliteAdapter(join(dir, "store.db"));
    await adapter.init();
    service = new EmmsService(adapter, join(dir, "artifacts"));
    const seeded = await service.seedLessons({
      lessons: LESSONS,
      client_context: CTX,
    });
    const payload = seeded.result as { seeded?: number };
    expect(payload.seeded).toBe(LESSONS.length);
  });
  afterAll(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("multi-token queries return non-empty, query-DEPENDENT result sets", async () => {
    const r1 = await resultsFor(Q1);
    const r2 = await resultsFor(Q2);
    const r3 = await resultsFor(Q3);
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(r3.length).toBeGreaterThan(0);
    // Query dependence: at least one query's top hit differs from another's
    const tops = new Set([
      r1[0].experience_id,
      r2[0].experience_id,
      r3[0].experience_id,
    ]);
    expect(tops.size).toBeGreaterThan(1);
    // No uniform relevance: within at least one result set scores differ
    const allScores = [...r1, ...r2, ...r3].map((r) => r.relevance);
    expect(new Set(allScores).size).toBeGreaterThan(1);
  });

  it("the registry query ranks the registry-trap lesson as the top hit", async () => {
    const r2 = await resultsFor(Q2);
    expect(r2[0].summary).toContain("chain-step-workflowid-registry-trap");
  });

  it("fallback no longer floods results when the FTS arm hits (B)", async () => {
    // Before the fix, every query returned ALL scope episodes (the
    // unconditional fallback). With OR-FTS working, a specific query must
    // return only real full-text hits — fewer than the full scope.
    const r2 = await resultsFor(Q2);
    expect(r2.length).toBeLessThan(LESSONS.length);
    for (const hit of r2) {
      expect(hit.relevance).toBeGreaterThan(0);
    }
  });

  it("zero-hit queries still fall back to the full scope for recall", async () => {
    const out = await service.search({
      query: "zzzzzerohitquery",
      scope_id: CTX.scope_id,
      limit: 20,
    });
    const res = out.result.results as Array<{ summary: string }>;
    expect(res.length).toBe(LESSONS.length);
  });

  it("graded FTS relevance differentiates within one result set", async () => {
    const r2 = await resultsFor(Q2);
    expect(r2.length).toBeGreaterThan(1);
    // Best full-text match keeps the full boost; weaker ones score lower.
    // Identical scores for different hits would re-introduce the flat
    // ranking defect.
    expect(r2[0].relevance).toBeGreaterThanOrEqual(r2[1].relevance);
    const distinct = new Set(r2.map((r) => r.relevance));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("never-verified lessons are not flagged stale and report verified:false (D)", async () => {
    const r2 = await resultsFor(Q2);
    for (const hit of r2) {
      const validation = (
        hit as unknown as {
          validation: { verified: boolean; last_verified_at: string | null };
        }
      ).validation;
      expect(validation.verified).toBe(false);
      expect(validation.last_verified_at).toBeNull();
      const flags = (hit as unknown as { flags: { stale: boolean } }).flags;
      expect(flags.stale).toBe(false);
    }
  });
});
