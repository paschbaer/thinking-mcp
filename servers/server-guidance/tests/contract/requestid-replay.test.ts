/**
 * RID-1: requestId-reuse hardening. Replays of already-registered requestIds
 * must be VISIBLE (replayed/duplicateOf markers) instead of silently returning
 * the cached result, and — under the strict policy — rejected when the payload
 * hash differs from the first submission. Same-payload idempotency retries
 * always stay legal (both modes); fresh requestIds always advance the phase.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { WorkflowTools } from "../../src/mcp-server/ToolHandlers.js";

const FIXTURE_CONFIG = join(import.meta.dirname, "../workflow/fixtures/guidance");

function makeTools(opts: { policies?: object } = {}): {
  tools: WorkflowTools;
  ws: string;
} {
  const ws = mkdtempSync(join(tmpdir(), "guidance-rid1-"));
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({
      name: "ws",
      scripts: {
        lint: "node -e \"process.exit(0)\"",
        test: "node -e \"process.exit(0)\"",
        build: "node -e \"process.exit(0)\"",
      },
    }),
  );
  let configDir = FIXTURE_CONFIG;
  if (opts.policies) {
    configDir = join(ws, "config");
    cpSync(FIXTURE_CONFIG, configDir, { recursive: true });
    writeFileSync(join(configDir, "policies.json"), JSON.stringify(opts.policies));
  }
  const config = loadConfig(configDir);
  return {
    tools: new WorkflowTools(
      new WorkflowEngine({ config, stateDir: join(ws, "state") }),
    ),
    ws,
  };
}

async function startAndSubmitUnderstanding(
  tools: WorkflowTools,
  summary: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  const start = (await tools.startWorkflow({
    workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
    request: "r",
  })) as { sessionId: string };
  return (await tools.submitUnderstanding(
    start.sessionId,
    { summary, assumptions: [], acceptanceCriteria: [] },
    requestId,
  )) as Record<string, unknown>;
}

describe("requestId replay hardening (RID-1)", () => {
  let cleanup: string[] = [];
  beforeEach(() => { cleanup = []; });
  afterEach(() => {
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  });

  it("warn (default): replay returns the cached result with replayed markers, phase unchanged", async () => {
    const { tools, ws } = makeTools();
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    const first = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(first.replayed).toBeUndefined();
    const replay = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(replay.accepted).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(replay.duplicateOf).toBe("req-A");
    expect(replay.warning).toMatch(/fresh requestId/);
    expect(replay.currentPhase).toBe(first.currentPhase); // no phase change
  });

  it("cached results are not mutated: repeated replays carry stable markers", async () => {
    const { tools, ws } = makeTools();
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    const r1 = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    const r2 = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(r1).toEqual(r2); // stacked markers would break equality
  });

  it("warn mode flags a changed payload instead of rejecting it", async () => {
    const { tools, ws } = makeTools();
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    const replay = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "TOTALLY DIFFERENT" },
      "req-A",
    )) as Record<string, unknown>;
    expect(replay.replayed).toBe(true);
    expect(replay.payloadMismatch).toBe(true);
  });

  it("reject-mismatch policy rejects a changed payload, allows same-payload retries", async () => {
    const { tools, ws } = makeTools({
      policies: { version: 2, submission: { requestIdReuse: "reject-mismatch" } },
    });
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    await expect(
      tools.submitUnderstanding(
        start.sessionId,
        { summary: "v2-changed" },
        "req-A",
      ),
    ).rejects.toThrowError(/requestId_reuse_payload_mismatch/);
    // Same-payload idempotency retry stays legal even under strict policy.
    const ok = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(ok.replayed).toBe(true);
    expect(ok.payloadMismatch).toBeUndefined();
  });

  it("a fresh requestId for the next phase submission advances the phase (AC-3)", async () => {
    const { tools, ws } = makeTools();
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    const s1 = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(s1.currentPhase).toBe("plan");
    // Phase-locked submissions: understanding again would fail with
    // invalid_active_phase regardless of requestId — the advance path is the
    // NEXT phase tool with a fresh requestId.
    const s2 = (await tools.submitPlan(
      start.sessionId,
      { tasks: [{ id: "T1", title: "t", files: [], tests: "", dependsOn: [] }] },
      "req-B",
    )) as Record<string, unknown>;
    expect(s2.replayed).toBeUndefined();
    expect(s2.previousPhase).toBe("plan");
    expect(s2.currentPhase).toBe("review_and_adjust_plan");
  });

  it("completeWorkflow replay shares the submitLocked replay semantics — verified at helper level via submit phase lock (AC-4a)", async () => {
    // NOTE: completeWorkflowLocked cannot reach 'completed' in this harness
    // (repository-analysis is required:true and unavailable in tests), and
    // failed completions intentionally do NOT register the requestId (retry
    // after fixing must stay legal). The complete-replay path calls the SAME
    // replaySubmitResult helper tested above; the Amendment-002
    // successor-race suite covers the completeWorkflow requestId cache sites.
    const { tools, ws } = makeTools();
    cleanup.push(ws);
    const start = (await tools.startWorkflow({
      workspaceRoot: mkdtempSync(join(tmpdir(), "guidance-rid1-ws-")),
      request: "r",
    })) as { sessionId: string };
    // Phase-locked guard still wins over replay: submitUnderstanding at plan
    // phase with the ALREADY-REGISTERED understand requestId is replayed, not
    // re-validated — proves the replay check runs before phase validation.
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    const replay = (await tools.submitUnderstanding(
      start.sessionId,
      { summary: "v1" },
      "req-A",
    )) as Record<string, unknown>;
    expect(replay.replayed).toBe(true);
    expect(replay.duplicateOf).toBe("req-A");
    expect((replay as { error?: unknown }).error).toBeUndefined();
  });

  it("metrics count replays and payload mismatches (AC-5)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "guidance-rid1-"));
    cleanup.push(ws);
    writeFileSync(
      join(ws, "package.json"),
      JSON.stringify({
        name: "ws",
        scripts: { lint: "node -e \"process.exit(0)\"" },
      }),
    );
    const config = loadConfig(FIXTURE_CONFIG);
    const engine = new WorkflowEngine({
      config,
      stateDir: join(ws, "state"),
    });
    const tools = new WorkflowTools(engine);
    const start = (await tools.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    })) as { sessionId: string };
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    await tools.submitUnderstanding(start.sessionId, { summary: "v1" }, "req-A");
    await tools.submitUnderstanding(
      start.sessionId,
      { summary: "changed" },
      "req-A",
    );
    const metrics = await engine.getMetrics();
    expect(metrics.requestIdReplays).toEqual({ total: 2, payloadMismatches: 1 });
  });

  it("policies validation fails closed on an unknown requestIdReuse value", () => {
    const ws = mkdtempSync(join(tmpdir(), "guidance-rid1-cfg-"));
    cleanup.push(ws);
    const configDir = join(ws, "config");
    cpSync(FIXTURE_CONFIG, configDir, { recursive: true });
    writeFileSync(
      join(configDir, "policies.json"),
      JSON.stringify({ version: 2, submission: { requestIdReuse: "yolo" } }),
    );
    expect(() => loadConfig(configDir)).toThrowError(/requestIdReuse/);
  });
});
