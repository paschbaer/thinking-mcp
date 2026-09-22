import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine } from "../../src/integrations/spec-kit/SpecKitEngine.js";

let ws: string;
let stateDir: string;
const noopAudit = () => {};
const config = {
  featureRoot: "specs", strategy: "explicit" as const, requireUniqueMatch: true,
  artifactPatterns: {}, maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536,
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-refresh-"));
  stateDir = join(ws, "state");
  const src = join(import.meta.dirname, "../fixtures/speckit/valid-full");
  const dest = join(ws, "specs/valid-full");
  mkdirSync(dest, { recursive: true });
  for (const f of ["spec.md", "plan.md", "tasks.md"]) writeFileSync(join(dest, f), readFileSync(join(src, f)));
});

function makeEngine(): SpecKitEngine {
  return new SpecKitEngine(ws, stateDir, "sha256:cfg", config, noopAudit, "session-t");
}

const importState = () => {
  const engine = makeEngine();
  const state = engine.importArtifacts(engine.discoverFeature("valid-full"));
  return { engine, state };
};

describe("staleness + refresh + waivers (FR-064/071/073)", () => {
  it("detects staleness only after artifact content changes (FR-064)", () => {
    const { engine, state } = importState();
    expect(engine.isSnapshotStale(state, state.featureDirectory)).toBe(false);
    const path = join(ws, "specs/valid-full/tasks.md");
    writeFileSync(path, readFileSync(path, "utf-8") + "\n- [ ] T009 extra\n");
    expect(engine.isSnapshotStale(state, state.featureDirectory)).toBe(true);
  });

  it("buildReconciledState preserves evidence for unchanged tasks and adds new ones as pending (SC-014)", async () => {
    const { engine, state } = importState();
    state.tasks["T001"]!.status = "completed";
    state.tasks["T001"]!.implementation = { summary: "done", changedFiles: [], createdFiles: [], deletedFiles: [], testsAddedOrUpdated: [], deviations: [], unresolvedIssues: [] };
    const tasksPath = join(ws, "specs/valid-full/tasks.md");
    writeFileSync(tasksPath, readFileSync(tasksPath, "utf-8") + "\n- [ ] T004 New reconciled task\n");
    const next = engine.importArtifacts(engine.discoverFeature("valid-full"));
    const reconciled = engine.buildReconciledState(state, next);
    expect(reconciled.tasks["T001"]!.implementation).toBeTruthy(); // preserved
    expect(reconciled.tasks["T004"]!.status).toBe("pending");
    expect(reconciled.tasks["T002"]!.title).toBe("Add retry validation");
  });

  it("waivers require a reason and are recorded (FR-071)", () => {
    const { engine, state } = importState();
    const criterion = Object.keys(state.criteria)[0]!;
    engine.waiveCriterion(state, criterion, "accepted risk per user");
    expect(state.criteria[criterion]!.waiver?.reason).toBe("accepted risk per user");
  });

  it("plan-change lifecycle: approved → artifact_update_required → applied", () => {
    const { engine, state } = importState();
    const change = engine.proposePlanChange(state, { changeType: "add_task", reason: "r", affectedTasks: [], impact: { acceptanceCriteria: false, publicApi: false, dependencies: false } });
    engine.approvePlanChange(state, change.changeId, "approved");
    expect(state.planChanges[change.changeId]!.status).toBe("artifact_update_required");
    engine.markPlanChangeApplied(state, change.changeId);
    expect(engine.hasPendingPlanChanges(state)).toBe(false);
  });
});
