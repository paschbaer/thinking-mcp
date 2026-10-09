/**
 * Semantic retrieval arm contract tests (FR-014, spec Clarifications):
 * - with provider: semantic arm active, near-miss with same words but different
 *   subsystem retrieved (the case exact/FTS arms cannot handle well)
 * - provider unavailable: search still works, semantic_available: false
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteAdapter } from "../../src/storage/sqlite.ts";
import { EmmsService } from "../../src/service.ts";
import {
  TransformersEmbedding,
  cosineSimilarity,
  type EmbeddingProvider,
} from "../../src/retrieval/semantic.ts";

const CTX = { scope_id: "demo-repo", agent_id: "local-agent" };

class UnavailableEmbedding implements EmbeddingProvider {
  async available(): Promise<boolean> {
    return false;
  }
  async embed(): Promise<Float32Array | null> {
    return null;
  }
}

let dir: string;
let adapter: SqliteAdapter;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "emms-sem-"));
  adapter = new SqliteAdapter(join(dir, "s.db"));
  await adapter.init();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function seedVerifiedEpisode(
  service: EmmsService,
  summary: string,
): Promise<string> {
  const { result } = await service.startWorkflow({
    goal: summary,
    scope_id: CTX.scope_id,
    client_context: CTX,
  });
  const wf = result.workflow_id as string;
  let rev = result.revision as number;
  await service.recordObservation({
    workflow_id: wf,
    kind: "failure_output",
    content: "npm ERR code ERESOLVE exited with code 1",
    exit_code: 1,
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.recordObservation({
    workflow_id: wf,
    kind: "environment_fact",
    content: '{"os":"linux","node":"20"}',
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.putEnvironmentDirect(
    wf,
    { os: "linux", node: "20" },
    CTX.scope_id,
  );
  const att = await service.recordAttempt({
    workflow_id: wf,
    intent: "align peer dependency versions",
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.completeAttempt({
    workflow_id: wf,
    attempt_id: att.result.attempt_id as string,
    outcome: "ok",
    classification: "successful",
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.proposeSolution({
    workflow_id: wf,
    strategy: "align peers",
    mechanism: "semver",
    checks: [
      {
        criterion: "clean install exits 0",
        test_type: "build",
        expected_result: "exit 0",
        regression_coverage: false,
        timeout_s: 300,
        evidence_requirement: true,
        targets_original_failure: true,
      },
    ],
    expected_revision: rev++,
    client_context: CTX,
  });
  const ev = await service.attachArtifact({
    workflow_id: wf,
    content_base64: Buffer.from("pass").toString("base64"),
    kind: "log",
    media_type: "text/plain",
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.recordValidationRun({
    workflow_id: wf,
    check_index: 0,
    status: "passed",
    exit_code: 0,
    evidence_artifact_id: ev.result.artifact_id as string,
    expected_revision: rev++,
    client_context: CTX,
  });
  await service.finalize({
    workflow_id: wf,
    requested_outcome: "verified",
    expected_revision: rev,
    client_context: CTX,
  });
  return result.experience_id as string;
}

const EMBEDDINGS_ENABLED = process.env.EMMS_DISABLE_EMBEDDINGS !== "1";

describe.skipIf(!EMBEDDINGS_ENABLED)("semantic retrieval arm", () => {
  it("cosineSimilarity: identical vectors = 1, orthogonal = 0", () => {
    expect(
      cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0])),
    ).toBeCloseTo(1);
    expect(
      cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1])),
    ).toBeCloseTo(0);
  });

  it.skipIf(!EMBEDDINGS_ENABLED)(
    "TransformersEmbedding produces normalized 384-dim vectors",
    async () => {
      const emb = new TransformersEmbedding();
      const vec = await emb.embed("npm peer dependency conflict");
      expect(vec).not.toBeNull();
      expect(vec!.length).toBe(384);
      const norm = Math.sqrt(vec!.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 1);
    },
    120_000,
  );

  it.skipIf(!EMBEDDINGS_ENABLED)(
    "semantic arm retrieves paraphrased problem that exact/FTS would rank lower",
    async () => {
      const embedding = new TransformersEmbedding();
      const service = new EmmsService(
        adapter,
        join(dir, "art"),
        undefined,
        embedding,
      );
      // Episode summary uses DIFFERENT wording than the query
      const expId = await seedVerifiedEpisode(
        service,
        "restoring reproducible dependency installation across peer ranges",
      );
      const out = await service.search({
        query:
          "cannot install packages because of conflicting version requirements",
        scope_id: CTX.scope_id,
        environment: { os: "linux", node: "20" },
      });
      const results = out.result.results as Array<Record<string, unknown>>;
      expect(results.length).toBeGreaterThan(0);
      const notes = (out.result as Record<string, unknown>)
        .retrieval_notes as Record<string, unknown>;
      expect(notes.semantic_available).toBe(true);
      // paraphrased query should still surface the episode via semantic similarity
      expect(results.some((r) => r.experience_id === expId)).toBe(true);
    },
    180_000,
  );

  it("unavailable provider: search works and reports semantic_available: false", async () => {
    const service = new EmmsService(
      adapter,
      join(dir, "art"),
      undefined,
      new UnavailableEmbedding(),
    );
    await seedVerifiedEpisode(service, "dependency install fix");
    const out = await service.search({
      query: "ERESOLVE install",
      scope_id: CTX.scope_id,
    });
    const notes = (out.result as Record<string, unknown>)
      .retrieval_notes as Record<string, unknown>;
    expect(notes.semantic_available).toBe(false);
    const results = out.result.results as unknown[];
    expect(results.length).toBeGreaterThan(0); // FTS arm still delivers
  });
});

// Deterministic keyword-vector provider: no native model needed, so these
// contract tests run in every environment (incl. EMMS_DISABLE_EMBEDDINGS=1).
class KeywordEmbedding implements EmbeddingProvider {
  calls = 0;
  queryCalls = 0; // embeds whose input equals the search query (dedupe check)
  async available(): Promise<boolean> {
    return true;
  }
  async embed(text: string): Promise<Float32Array | null> {
    this.calls++;
    return this.vector(text);
  }
  vector(text: string): Float32Array {
    const v = [0, 0, 0];
    if (/registry/i.test(text)) v[0] = 1;
    if (/yarn/i.test(text)) v[1] = 1;
    if (/docker/i.test(text)) v[2] = 1;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return Float32Array.from(v.map((x) => x / norm));
  }
}

describe("semantic warmup + query-embed dedupe (provider fakes)", () => {
  const LESSONS = [
    {
      slug: "warm-registry-lesson",
      observation: "A registry workflow trap fired at completion time.",
      cause: "Registry resolution fails closed on unknown ids.",
      fix: "Omit free-form ids on chain steps.",
    },
    {
      slug: "warm-yarn-lesson",
      observation: "A yarn lockfile drifted after an npm contact.",
      cause: "npm ignores the yarn lockfile format.",
      fix: "Install at the root with yarn only.",
    },
  ];

  async function seed(service: EmmsService): Promise<void> {
    const out = await service.seedLessons({
      lessons: LESSONS,
      client_context: CTX,
    });
    expect((out.result as { seeded?: number }).seeded).toBe(LESSONS.length);
  }

  it("warmup embeds every stored summary once and is incremental on re-run", async () => {
    const provider = new KeywordEmbedding();
    const service = new EmmsService(
      adapter,
      join(dir, "art"),
      undefined,
      provider,
    );
    await seed(service);
    const before = provider.calls;
    const r1 = await service.warmupSemanticIndex();
    expect(r1.skipped).toBe(false);
    expect(r1.embedded).toBe(LESSONS.length);
    // exactly one embed per summary, nothing else
    expect(provider.calls - before).toBe(LESSONS.length);
    const r2 = await service.warmupSemanticIndex();
    expect(r2.embedded).toBe(0); // cached summaries are skipped
  });

  it("warmup skips cleanly when the provider is unavailable", async () => {
    const service = new EmmsService(
      adapter,
      join(dir, "art"),
      undefined,
      new UnavailableEmbedding(),
    );
    await seed(service);
    const r = await service.warmupSemanticIndex();
    expect(r.skipped).toBe(true);
    expect(r.embedded).toBe(0);
    expect(r.reason).toBeTruthy();
  });

  it("search embeds the query exactly once (dedupe)", async () => {
    const provider = new KeywordEmbedding();
    const service = new EmmsService(
      adapter,
      join(dir, "art"),
      undefined,
      provider,
    );
    await seed(service);
    await service.warmupSemanticIndex(); // summaries cached: remaining embeds are queries
    const before = provider.calls;
    const QUERY = "registry trap";
    const out = await service.search({ query: QUERY, scope_id: CTX.scope_id });
    const notes = (out.result as Record<string, unknown>)
      .retrieval_notes as Record<string, unknown>;
    expect(notes.semantic_available).toBe(true);
    // every embed after warmup is the query itself — and it must fire ONCE
    const queryEmbeds = out // placeholder to keep structure clear
      ? provider.calls - before
      : 0;
    expect(queryEmbeds).toBe(1);
  });

  it("an episode hit by BOTH FTS and semantic arms keeps its graded FTS boost (candidates-map identity)", async () => {
    const provider = new KeywordEmbedding();
    const service = new EmmsService(
      adapter,
      join(dir, "art"),
      undefined,
      provider,
    );
    await seed(service);
    // No warmup: the semantic arm itself lazily embeds in-scope summaries.
    const out = await service.search({
      query: "registry trap",
      scope_id: CTX.scope_id,
      limit: 5,
    });
    const results = out.result.results as Array<Record<string, unknown>>;
    const top = results[0] as { summary: string; relevance: number };
    expect(top.summary).toContain("warm-registry-lesson");
    // Expected score for the dual-arm hit: applicability-neutral base for a
    // lesson (0.5*0.35 + 0.05 = 0.225) + full graded FTS boost (best bm25 hit
    // of this query → 0.30) + semantic sim 1.0 * 0.24. If the semantic-arm
    // add() had clobbered the FTS row's identity/rank, the boost term would
    // be missing and the score would fall short by ~0.30.
    expect(top.relevance).toBeGreaterThanOrEqual(0.225 + 0.3 + 0.24 - 0.005);
  });
});
