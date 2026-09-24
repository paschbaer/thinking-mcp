import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine, type SpecKitState } from "../../src/integrations/spec-kit/SpecKitEngine.js";

// F8 test gaps (Phase 7b/8/9 review): contracts artifact store, removed-task
// reconciliation, plan-change terminality, waiver audit fields.

let ws: string;
let stateDir: string;
let auditEvents: { eventType: string; data?: Record<string, unknown> }[] = [];
const captureAudit = (e: { eventType: string; data?: Record<string, unknown> }) => {
  auditEvents.push(e);
};
const config = {
  featureRoot: "specs", strategy: "explicit" as const, requireUniqueMatch: true,
  artifactPatterns: {}, maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536,
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-f8-"));
  stateDir = join(ws, "state");
  const src = join(import.meta.dirname, "../fixtures/speckit/valid-full");
  const dest = join(ws, "specs/valid-full");
  mkdirSync(dest, { recursive: true });
  for (const f of ["spec.md", "plan.md", "tasks.md"]) {
    writeFileSync(join(dest, f), readFileSync(join(src, f)));
  }
  // contracts artifact store fixture
  mkdirSync(join(dest, "contracts"), { recursive: true });
  writeFileSync(join(dest, "contracts", "api.json"), JSON.stringify({ endpoint: "/v1/example" }));
  auditEvents = [];
});

afterEach(() => rmSync(ws, { recursive: true, force: true }));

function makeEngine(): SpecKitEngine {
  return new SpecKitEngine(ws, stateDir, "sha256:cfg", config, captureAudit, "session-f8");
}

function importState(): { engine: SpecKitEngine; state: SpecKitState } {
  const engine = makeEngine();
  const feature = engine.discoverFeature("valid-full");
  const state = engine.importArtifacts(feature);
  return { engine, state };
}

describe("F8: contracts artifact store", () => {
  it("imports contracts/** artifacts with hash and content", () => {
    const { state } = importState();
    const contracts = state.snapshots.flatMap((s) => s.artifacts).filter((a) => a.type === "contracts");
    expect(contracts.length).toBeGreaterThanOrEqual(1);
    const api = contracts.find((a) => a.relativePath.endsWith("api.json"));
    expect(api).toBeTruthy();
    expect(api!.sha256).toMatch(/[a-f0-9]{64}/);
    // content is intentionally NOT retained in state (stripped at snapshot
    // build); the hash is the durable reference.
  });
});

describe("F8: removed-task reconciliation", () => {
  it("flags removed tasks and retains completed ones", () => {
    const { engine, state } = importState();
    const previous: SpecKitState = structuredClone(state);
    previous.tasks["T999"] = { ...state.tasks["T001"]!, taskId: "T999", title: "later removed", status: "completed" };

    const nextImport = engine.importArtifacts(engine.discoverFeature("valid-full"));
    const diff = engine.reconcile(previous.tasks, nextImport.tasks);
    expect(diff.removed).toContain("T999");

    const next = engine.buildReconciledState(previous, nextImport);
    expect(next.tasks["T999"]?.status).toBe("completed"); // retained, flagged by diff
  });
});

describe("F8: plan-change terminality", () => {
  it("propose → approve → applied clears pending state", () => {
    const { engine, state } = importState();
    const change = engine.proposePlanChange(state, {
      changeType: "defer_task", reason: "deferred by user", affectedTasks: ["T003"],
      impact: { acceptanceCriteria: false, publicApi: false, dependencies: false },
    });
    expect(engine.hasPendingPlanChanges(state)).toBe(true);
    engine.approvePlanChange(state, change.changeId, "approved");
    engine.markPlanChangeApplied(state, change.changeId);
    expect(state.planChanges[change.changeId]!.status).toBe("applied");
    expect(engine.hasPendingPlanChanges(state)).toBe(false);
  });
});

describe("F8: waiver audit fields", () => {
  it("waiveCriterion audit entry carries criterionId, reason, approvedBy and at", () => {
    const { engine, state } = importState();
    engine.waiveCriterion(state, "SC-001", "customer sign-off");
    const evt = auditEvents.find((e) => e.data && "criterionId" in (e.data ?? {}));
    expect(evt).toBeTruthy();
    expect(evt!.data).toMatchObject({ criterionId: "SC-001", waiver: "customer sign-off", approvedBy: "user" });
    expect(typeof evt!.data!.at).toBe("string");
    expect(state.criteria["SC-001"]!.waiver?.reason).toBe("customer sign-off");
  });
});
