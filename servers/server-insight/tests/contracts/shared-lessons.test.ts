import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteAdapter } from "../../src/storage/sqlite.ts";
import { EmmsService } from "../../src/service.ts";

// Cross-scope visibility of published lessons in the FULL-TEXT arm.
// The exact/semantic/fallback arms always included public episodes
// (listInScope: scope OR visibility='public'); the FTS arm filtered
// strictly scope-local, so a public foreign lesson was unreachable by
// full text whenever any local episode matched the query tokens (scope
// fallback suppressed). This suite pins the closed asymmetry.

let dir: string;
let adapter: SqliteAdapter;

const SCOPE_A = "project-alpha-lessons";
const SCOPE_B = "shared-lessons";
const CTX_A = { scope_id: SCOPE_A, agent_id: "test-agent" };
const CTX_B = { scope_id: SCOPE_B, agent_id: "test-agent" };

const LOCAL_LESSONS = [
  {
    slug: "local-widget-trap",
    observation: "The widget assembler failed after a config change.",
    cause: "The consumer of the parsed field was never audited.",
    fix: "Audit the consumer, not just the producer.",
  },
];

const FOREIGN_LESSONS = [
  {
    slug: "general-widget-gasket-sequencing",
    observation: "Widget gasket sequencing fails when steps are reordered.",
    cause: "Sequencing constraints are implicit and unchecked at reorder time.",
    fix: "Make sequencing explicit and validate it after every reorder.",
  },
  {
    slug: "general-unpublished-control",
    observation: "Turbine coil winding requires balanced tension.",
    cause: "Tension balancing is skipped for small coils.",
    fix: "Balance tension regardless of coil size.",
  },
];

let publishedId: string;

/**
 * Mutations require the episode's CURRENT revision (optimistic-concurrency
 * guard, fail-closed). The seed result does not carry it — query it via
 * workflow_status (guidance envelope `revision`), and retry once with the
 * `current_revision` from a STALE_REVISION error envelope as the fallback
 * (same pattern the capture prompt teaches for manual publishing).
 */
async function publishWithRevision(
  service: EmmsService,
  workflow_id: string,
  experience_id: string,
  ctx: typeof CTX_B,
): Promise<void> {
  const status = await service.status(workflow_id, ctx);
  const revision = (status.guidance as { revision?: number } | undefined)
    ?.revision;
  try {
    await service.lesson_publish({
      workflow_id,
      experience_id,
      expected_revision: revision,
      client_context: ctx,
    });
  } catch (e) {
    const current = (e as { details?: { current_revision?: number } })?.details
      ?.current_revision;
    if (current === undefined) throw e;
    await service.lesson_publish({
      workflow_id,
      experience_id,
      expected_revision: current,
      client_context: ctx,
    });
  }
}

async function seed(
  service: EmmsService,
  lessons: typeof LOCAL_LESSONS,
  ctx: typeof CTX_A,
) {
  const out = await service.seedLessons({ lessons, client_context: ctx });
  expect((out.result as { seeded?: number }).seeded).toBe(lessons.length);
  return out.result as {
    lessons: Array<{
      slug: string;
      workflow_id: string;
      experience_id: string;
    }>;
  };
}

describe("FTS public-inclusion across scopes", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "emms-shared-"));
    adapter = new SqliteAdapter(join(dir, "store.db"));
    await adapter.init();
    const service = new EmmsService(adapter, join(dir, "artifacts"));
    await seed(service, LOCAL_LESSONS, CTX_A);
    const foreign = await seed(service, FOREIGN_LESSONS, CTX_B);
    // Publish exactly ONE foreign lesson; the other stays repository-only
    // (control: must remain invisible from scope A).
    const target = foreign.lessons.find(
      (l) => l.slug === "general-widget-gasket-sequencing",
    )!;
    publishedId = target.experience_id;
    await publishWithRevision(
      service,
      target.workflow_id,
      target.experience_id,
      CTX_B,
    );
  });
  afterAll(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a published public lesson of a foreign scope is found by full text even when local episodes match", async () => {
    const service = new EmmsService(adapter, join(dir, "artifacts"));
    // Query tokens match BOTH the local lesson ('widget') and the public
    // foreign lesson ('widget gasket') — with the old strict scope filter
    // the local hit suppressed the fallback and the public lesson vanished.
    const out = await service.search({
      query: "widget gasket sequencing",
      scope_id: SCOPE_A,
      limit: 10,
    });
    const results = out.result.results as Array<{
      experience_id: string;
      summary: string;
      relevance: number;
    }>;
    const hit = results.find((r) => r.experience_id === publishedId);
    expect(hit).toBeDefined();
    expect(hit!.summary).toContain("general-widget-gasket-sequencing");
    // FTS-ranked, not fallback filler: the graded boost lifts the score
    // above the uniform base (0.225 for a lesson episode without boost).
    expect(hit!.relevance).toBeGreaterThan(0.23);
  });

  it("a repository-only lesson of a foreign scope stays invisible (isolation intact)", async () => {
    const service = new EmmsService(adapter, join(dir, "artifacts"));
    const out = await service.search({
      query: "turbine coil winding tension",
      scope_id: SCOPE_A,
      limit: 10,
    });
    const results = out.result.results as Array<{ summary: string }>;
    expect(
      results.some((r) => r.summary.includes("general-unpublished-control")),
    ).toBe(false);
  });
});
