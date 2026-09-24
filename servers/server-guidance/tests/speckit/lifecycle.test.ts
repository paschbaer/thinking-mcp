import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine, type SpecKitState } from "../../src/integrations/spec-kit/SpecKitEngine.js";

let ws: string;
let stateDir: string;
const noopAudit = () => {};
const config = {
  featureRoot: "specs", strategy: "explicit" as const, requireUniqueMatch: true,
  artifactPatterns: {}, maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536,
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-life-"));
  stateDir = join(ws, "state");
  const src = join(import.meta.dirname, "../fixtures/speckit/valid-full");
  const dest = join(ws, "specs/valid-full");
  mkdirSync(dest, { recursive: true });
  for (const f of ["spec.md", "plan.md", "tasks.md"]) {
    writeFileSync(join(dest, f), readFileSync(join(src, f)));
  }
});

function makeEngine(): SpecKitEngine {
  return new SpecKitEngine(ws, stateDir, "sha256:cfg", config, noopAudit, "session-t");
}

const importState = (): { engine: SpecKitEngine; state: SpecKitState } => {
  const engine = makeEngine();
  const feature = engine.discoverFeature("valid-full");
  const state = engine.importArtifacts(feature);
  return { engine, state };
};

describe("task lifecycle + release + evidence gating (FR-066–069)", () => {
  it("releases T001 only; starting an unreleased task is rejected", () => {
    const { engine, state } = importState();
    const released = engine.releaseBatch(state, "single", "b1");
    expect(released).toEqual(["T001"]);
    expect(() => engine.startTask(state, "b1", ["T002"])).toThrowError(/not in released batch/);
    engine.startTask(state, "b1", ["T001"]);
    expect(state.tasks["T001"]!.status).toBe("in_progress");
  });

  it("complete_task requires evidence, review, verification", () => {
    const { engine, state } = importState();
    engine.releaseBatch(state, "single", "b1");
    engine.startTask(state, "b1", ["T001"]);
    expect(() => engine.completeTask(state, "T001")).toThrowError(/implementation evidence/);
    engine.submitImplementation(state, "b1", [{ taskId: "T001", summary: "done", changedFiles: ["a.ts"], testsAddedOrUpdated: [], deviations: [], unresolvedIssues: [] }]);
    engine.transitionTask(state, "T001", "review_required");
    engine.submitReview(state, "b1", [{ findingId: "F1", taskIds: ["T001"], severity: "critical", fixRequired: true, fixApplied: false }]);
    expect(() => engine.completeTask(state, "T001")).toThrowError(/findings/);
    // fix applied, review passes — resubmitted with fixApplied true
    engine.submitReview(state, "b1", [{ findingId: "F1", taskIds: ["T001"], severity: "high", fixRequired: true, fixApplied: true }]);
    engine.transitionTask(state, "T001", "verification_required");
    state.tasks["T001"]!.verification = { executions: ["op-1"], succeeded: true };
    engine.completeTask(state, "T001");
    expect(state.tasks["T001"]!.status).toBe("completed");
  });

  it("unapproved deviations block completion", () => {
    const { engine, state } = importState();
    engine.releaseBatch(state, "single", "b1");
    engine.startTask(state, "b1", ["T001"]);
    engine.submitImplementation(state, "b1", [{ taskId: "T001", summary: "d", changedFiles: [], testsAddedOrUpdated: [], deviations: [{ desc: "changed API", approved: false }], unresolvedIssues: [] }]);
    state.tasks["T001"]!.verification = { executions: ["op-1"], succeeded: true };
    expect(() => engine.completeTask(state, "T001")).toThrowError(/deviations|plan_change/);
  });

  it("evidence-gated completion ignores checked checkboxes (SC-011)", () => {
    const { engine, state } = importState();
    // no evidence at all
    expect(() => engine.completeTask(state, "T001")).toThrowError(/implementation evidence|review|verification/);
    void engine;
  });
});

describe("plan changes + reconciliation (FR-072/073)", () => {
  it("classifies add_task with no impact as minor; criterion change as major", () => {
    const { engine, state } = importState();
    const minor = engine.proposePlanChange(state, { changeType: "add_task", reason: "extra test", affectedTasks: [], impact: { acceptanceCriteria: false, publicApi: false, dependencies: false } });
    expect(minor.classification).toBe("minor");
    const major = engine.proposePlanChange(state, { changeType: "changed_acceptance_criterion", reason: "tightened", affectedTasks: [], impact: { acceptanceCriteria: true, publicApi: false, dependencies: false } });
    expect(major.classification).toBe("major");
    expect(major.status).toBe("artifact_update_required");
    expect(engine.hasPendingPlanChanges(state)).toBe(true);
  });

  it("reconciliation preserves evidence for unchanged tasks and flags changed completed tasks (SC-014)", () => {
    const { engine, state } = importState();
    // simulate completed T001 with evidence
    state.tasks["T001"]!.implementation = { summary: "s", changedFiles: [], createdFiles: [], deletedFiles: [], testsAddedOrUpdated: [], deviations: [], unresolvedIssues: [] };
    state.tasks["T001"]!.status = "completed";
    const nextTasks = JSON.parse(JSON.stringify(state.tasks)) as typeof state.tasks;
    nextTasks["T004"] = { ...nextTasks["T001"]!, taskId: "T004", title: "New task" };
    nextTasks["T001"]!.title = "CHANGED title";
    const diff = engine.reconcile(state.tasks, nextTasks);
    expect(diff.added).toEqual(["T004"]);
    expect(diff.changed).toContain("T001");
    expect(diff.evidencePreserved).toContain("T002");
    expect(diff.flaggedForReview).toContain("T001");
  });
});

describe("completion invariants (FR-074, SC-013)", () => {
  it("violations listed while tasks incomplete or criteria unverified", () => {
    const { state } = importState();
    const engine = makeEngine();
    const result = engine.evaluateCompletionInvariants(state, { requiredVerificationSucceeded: false, completionOpsSucceeded: false });
    expect(result.satisfied).toBe(false);
    expect(result.violations).toContain("required_tasks_incomplete");
    expect(result.violations).toContain("acceptance_criteria_unverified");
  });

  it("pending plan changes block completion", () => {
    const { engine, state } = importState();
    engine.proposePlanChange(state, { changeType: "add_task", reason: "r", affectedTasks: [], impact: { acceptanceCriteria: false, publicApi: false, dependencies: false } });
    const result = engine.evaluateCompletionInvariants(state, { requiredVerificationSucceeded: true, completionOpsSucceeded: true });
    expect(result.satisfied).toBe(false);
  });
});
