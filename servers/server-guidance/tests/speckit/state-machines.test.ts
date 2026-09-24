import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine, type SpecKitState } from "../../src/integrations/spec-kit/SpecKitEngine.js";

// 2b: state-machine guards + reconciliation apply (Phase 7a/7b MEDIUMs).

let ws: string;
let stateDir: string;
let auditEvents: { eventType: string; data?: Record<string, unknown> }[];
const captureAudit = (e: { eventType: string; data?: Record<string, unknown> }) => {
  auditEvents.push(e);
};
const config = {
  featureRoot: "specs", strategy: "explicit" as const, requireUniqueMatch: true,
  artifactPatterns: {}, maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536,
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-2b-"));
  stateDir = join(ws, "state");
  const src = join(import.meta.dirname, "../fixtures/speckit/valid-full");
  const dest = join(ws, "specs/valid-full");
  mkdirSync(dest, { recursive: true });
  for (const f of ["spec.md", "plan.md", "tasks.md"]) {
    writeFileSync(join(dest, f), readFileSync(join(src, f)));
  }
  mkdirSync(join(dest, "contracts"), { recursive: true });
  writeFileSync(join(dest, "contracts", "api.json"), JSON.stringify({ endpoint: "/v1/example" }));
  auditEvents = [];
});

afterEach(() => rmSync(ws, { recursive: true, force: true }));

function makeEngine(): SpecKitEngine {
  return new SpecKitEngine(ws, stateDir, "sha256:cfg", config, captureAudit, "session-2b");
}

function importState() {
  const engine = makeEngine();
  const state = engine.importArtifacts(engine.discoverFeature("valid-full"));
  return { engine, state };
}

describe("2b: plan-change lifecycle guards (F6)", () => {
  it("markPlanChangeApplied on unknown id throws GuidanceError (no TypeError)", () => {
    const { engine, state } = importState();
    expect(() => engine.markPlanChangeApplied(state, "change-does-not-exist")).toThrowError(/unknown change/);
  });

  it("apply requires prior approval; approve is idempotent-guarded at terminality", () => {
    const { engine, state } = importState();
    const change = engine.proposePlanChange(state, {
      changeType: "defer_task", reason: "r", affectedTasks: ["T003"],
      impact: { acceptanceCriteria: false, publicApi: false, dependencies: false },
    });
    expect(() => engine.markPlanChangeApplied(state, change.changeId)).toThrowError(/must be approved/);
    engine.approvePlanChange(state, change.changeId, "approved");
    expect(state.planChanges[change.changeId]!.status).toBe("approved");
    engine.markPlanChangeApplied(state, change.changeId);
    expect(state.planChanges[change.changeId]!.status).toBe("applied");
    expect(() => engine.approvePlanChange(state, change.changeId, "approved")).toThrowError(/already applied/);
    expect(() => engine.approvePlanChange(state, change.changeId, "rejected")).toThrowError(/already applied/);
  });

  it("reject is terminal too", () => {
    const { engine, state } = importState();
    const change = engine.proposePlanChange(state, {
      changeType: "add_task", reason: "r", affectedTasks: [],
      impact: { acceptanceCriteria: false, publicApi: false, dependencies: false },
    });
    engine.approvePlanChange(state, change.changeId, "rejected");
    expect(state.planChanges[change.changeId]!.status).toBe("rejected");
    expect(() => engine.markPlanChangeApplied(state, change.changeId)).toThrowError(/must be approved/);
  });
});

describe("2b: removed-task superseded marker + audit (M3)", () => {
  it("removed unfinished tasks are retained as cancelled with an audit trail", () => {
    const { engine, state } = importState();
    const previous: SpecKitState = structuredClone(state);
    previous.tasks["T999"] = { ...state.tasks["T001"]!, taskId: "T999", title: "later removed", status: "in_progress" };
    previous.tasks["T998"] = { ...state.tasks["T001"]!, taskId: "T998", title: "later removed done", status: "completed" };

    const nextImport = engine.importArtifacts(engine.discoverFeature("valid-full"));
    const next = engine.buildReconciledState(previous, nextImport);

    expect(next.tasks["T999"]?.status).toBe("cancelled"); // superseded, auditable
    expect(next.tasks["T998"]?.status).toBe("completed"); // completed: retained as-is
    expect(auditEvents.filter((e) => e.eventType === "spec_kit_task_superseded").map((e) => e.data?.taskId).sort())
      .toEqual(["T998", "T999"]);
  });
});

describe("2b: contracts artifacts are relocation-safe (M1)", () => {
  it("stores contracts paths relative to the feature directory", () => {
    const { state } = importState();
    const contracts = state.snapshots.flatMap((s) => s.artifacts).filter((a) => a.type === "contracts");
    expect(contracts.length).toBeGreaterThanOrEqual(1);
    for (const a of contracts) expect(a.relativePath.startsWith("/")).toBe(false);
  });

  it("staleness survives relocation of the whole feature directory", () => {
    const { state } = importState();
    // relocate: copy the feature directory to a second root
    const ws2 = mkdtempSync(join(tmpdir(), "guidance-sk-2b-reloc-"));
    const dest = join(ws2, "specs/valid-full");
    mkdirSync(dest, { recursive: true });
    for (const f of ["spec.md", "plan.md", "tasks.md"]) {
      writeFileSync(join(dest, f), readFileSync(join(ws, "specs/valid-full", f)));
    }
    mkdirSync(join(dest, "contracts"), { recursive: true });
    writeFileSync(join(dest, "contracts", "api.json"), readFileSync(join(ws, "specs/valid-full/contracts/api.json")));
    try {
      const engine2 = makeEngine();
      expect(engine2.isSnapshotStale(state, dest)).toBe(false); // M1: was always stale with absolute paths
    } finally {
      rmSync(ws2, { recursive: true, force: true });
    }
  });
});

describe("2b: refresh applies reconciliation — task progress survives", () => {
  it("completed tasks keep their status across a refresh", () => {
    const engine = makeEngine();
    const previous = engine.importArtifacts(engine.discoverFeature("valid-full"));
    engine.releaseBatch(previous, "single", "b1");
    engine.startTask(previous, "b1", ["T001"]);
    engine.submitImplementation(previous, "b1", [{ taskId: "T001", summary: "done", changedFiles: ["a.ts"], testsAddedOrUpdated: [], deviations: [], unresolvedIssues: [] }]);
    engine.transitionTask(previous, "T001", "review_required");
    engine.submitReview(previous, "b1", [{ findingId: "F1", taskIds: ["T001"], severity: "high", fixRequired: true, fixApplied: true }]);
    engine.transitionTask(previous, "T001", "verification_required");
    previous.tasks["T001"]!.verification = { executions: ["op-1"], succeeded: true };
    engine.completeTask(previous, "T001");

    writeFileSync(join(ws, "specs/valid-full/spec.md"), readFileSync(join(ws, "specs/valid-full/spec.md")) + "\n<!-- refresh -->\n");
    const imported = engine.importArtifacts(engine.discoverFeature("valid-full"), previous);
    const next = engine.buildReconciledState(previous, imported);

    expect(next.tasks["T001"]?.status).toBe("completed"); // progress survives refresh
    expect(next.activeSnapshotId).toBe(imported.activeSnapshotId); // chained snapshot
  });

  it("waiveCriterion emits the dedicated spec_kit_criterion_waived event (F5)", () => {
    const { engine, state } = importState();
    engine.waiveCriterion(state, "SC-001", "customer sign-off");
    expect(auditEvents.some((e) => e.eventType === "spec_kit_criterion_waived")).toBe(true);
    expect(auditEvents.some((e) => e.eventType === "spec_kit_criterion_waived" && e.data?.criterionId === "SC-001")).toBe(true);
  });
});
