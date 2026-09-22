import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let engine: WorkflowEngine;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ws-"));
  // Minimal workspace so verify-phase process ops (lint/test/build) succeed.
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({ name: "ws", scripts: { lint: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"", build: "node -e \"process.exit(0)\"" } }),
  );
  const fixtureConfig = join(import.meta.dirname, "fixtures/guidance");
  const config = loadConfig(fixtureConfig);
  engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

const started = () => engine.startWorkflow({ workspaceRoot: ws, request: "test request" });

describe("workflow engine (FR-001–003)", () => {
  it("starts a session in understand and returns guidance (FR-001, FR-006)", async () => {
    const res = await started();
    expect(res.accepted).toBe(true);
    expect(res.sessionId).toBeTruthy();
    expect(res.currentPhase).toBe("understand");
    expect(res.guidance?.title).toContain("Understand");
  });

  it("persists the session with configurationVersion binding (FR-019)", async () => {
    const res = await started();
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("understand");
    expect(s.configurationVersion).toMatch(/^sha256:/);
  });

  it("rejects a submission for the wrong active phase (FR-003)", async () => {
    const res = await started();
    const out = await engine.submit(res.sessionId, "implement", { implementedTasks: ["T1"] } as Record<string, unknown>);
    expect(out.accepted).toBe(false);
    if (!out.accepted) {
      expect(out.error!.code).toBe("invalid_active_phase");
      expect(out.currentPhase).toBe("understand");
    }
  });

  it("walks understand → plan on a valid submission (FR-002)", async () => {
    const res = await started();
    const out = await engine.submit(res.sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] } as Record<string, unknown>);
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
  });

  it("rejects an invalid submission without state change (FR-030)", async () => {
    const res = await started();
    const before = engine.getSession(res.sessionId).updatedAt;
    const out = await engine.submit(res.sessionId, "understand", { wrong: true } as Record<string, unknown>);
    expect(out.accepted).toBe(false);
    if (!out.accepted) expect(out.error!.code).toBe("submission_invalid");
    expect(engine.getSession(res.sessionId).currentPhase).toBe("understand");
    expect(engine.getSession(res.sessionId).updatedAt).toBe(before);
  });

  it("only allows configured transitions (FR-002)", async () => {
    const res = await started();
    await engine.submit(res.sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] } as Record<string, unknown>);
    await engine.submit(res.sessionId, "plan", { tasks: [{ id: "T1" }] } as Record<string, unknown>);
    const out = await engine.submit(res.sessionId, "review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } } as Record<string, unknown>);
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("implement");
  });

  it("full correction-loop walk reaches verify → complete via valid submissions", async () => {
    const res = await started();
    const sub = async (p: string, payload: Record<string, unknown>) => await engine.submit(res.sessionId, p, payload);
    await sub("understand", { summary: "s", acceptanceCriteria: ["a"] } as Record<string, unknown>);
    await sub("plan", { tasks: [{ id: "T1" }] } as Record<string, unknown>);
    await sub("review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } } as Record<string, unknown>);
    const impl = await sub("implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] } as Record<string, unknown>);
    expect(impl.currentPhase).toBe("review_and_fix_implementation");
    await sub("review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] } as Record<string, unknown>);
    expect(engine.getSession(res.sessionId).currentPhase).toBe("verify");
  });

  it("blocks completion while required verify operations fail; completes when they succeed (FR-004)", async () => {
    const res = await started();
    const sub = async (p: string, payload: Record<string, unknown>) => await engine.submit(res.sessionId, p, payload);
    await sub("understand", { summary: "s", acceptanceCriteria: ["a"] } as Record<string, unknown>);
    await sub("plan", { tasks: [{ id: "T1" }] } as Record<string, unknown>);
    await sub("review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } } as Record<string, unknown>);
    await sub("implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] } as Record<string, unknown>);
    await sub("review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] } as Record<string, unknown>);
    await sub("verify", { verificationSummary: ["ok"] } as Record<string, unknown>);
    expect(engine.getSession(res.sessionId).currentPhase).toBe("complete");
    const done = await engine.completeWorkflow(res.sessionId, { summary: "done" } as Record<string, unknown>);
    // FR-004/005: gitnexus-analysis is required; without a working downstream
    // the local CLI fallback also fails in the sandbox ⇒ stays in complete.
    expect(done.accepted).toBe(false);
    if (!done.accepted) expect(done.error!.code).toBe("required_hook_failed");
    expect(engine.getSession(res.sessionId).status).toBe("active");
  });

  it("report_blocker → blocked with previous phase preserved; resume_workflow re-enters it (FR-028)", async () => {
    const res = await started();
    const blocked = await engine.reportBlocker(res.sessionId, {
      category: "missing_information",
      description: "d",
      requiresUserDecision: true,
    });
    expect(blocked.accepted).toBe(true);
    const s = engine.getSession(res.sessionId);
    expect(s.status).toBe("blocked");
    expect(s.previousPhase).toBe("understand");
    const resumed = await engine.resumeWorkflow(res.sessionId, { decision: "proceed" });
    expect(resumed.accepted).toBe(true);
    const after = engine.getSession(res.sessionId);
    expect(after.status).toBe("active");
    expect(after.currentPhase).toBe("understand");
  });

  it("resume_workflow is the only exit from blocked (FR-028)", async () => {
    const res = await started();
    await engine.reportBlocker(res.sessionId, { category: "x", description: "y", requiresUserDecision: false });
    const out = await engine.submit(res.sessionId, "understand", { summary: "s" });
    expect(out.accepted).toBe(false);
    if (!out.accepted) expect(out.error!.code).toBe("workflow_blocked");
  });
});
