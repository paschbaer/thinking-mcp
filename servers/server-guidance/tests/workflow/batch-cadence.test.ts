/** specs/017 AC3 (FR-6): strict per-batch review cadence. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { checkArtifactPattern } from "../../src/integrations/spec-kit/SpecKitEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance-speckit");

let ws: string;
let engine: WorkflowEngine;
let featureDir: string;

const FEATURE_ID = "017-test-feature";

function writeArtifact(name: string, content = `# ${name}\n\ncontent\n`): void {
  mkdirSync(join(featureDir, dirname(name)), { recursive: true });
  writeFileSync(join(featureDir, name), content);
}

const startVariant = () =>
  engine.startWorkflow({
    workspaceRoot: ws,
    request: "r",
    workflowId: "spec-kit-development",
  });

/** Drives a variant session from its CURRENT phase to implement (skipping
 *  phases already skipped via artifacts_present). */
const reachImplement = async (sessionId: string): Promise<void> => {
  const queue: [string, Record<string, unknown>][] = [
    ["understand", { summary: "s" }],
    ["plan", { tasks: [] }],
    ["checklist", {}],
    ["tasks", {}],
    ["review_and_adjust_plan", { findings: [] }],
  ];
  let s = engine.getSession(sessionId);
  for (const [phase, payload] of queue) {
    if (s.currentPhase === phase) {
      const out = await engine.submit(sessionId, phase, payload);
      if (!out.accepted) throw new Error(`${phase}: ${out.error?.message}`);
      s = engine.getSession(sessionId);
    }
  }
  if (s.currentPhase !== "implement") {
    throw new Error(`expected implement, got ${s.currentPhase}`);
  }
  const implOut = await engine.submit(sessionId, "implement", {
    implementedTasks: ["T1"],
    batch: { id: "batch-1", taskIds: ["T1", "T2"] },
  });
  if (!implOut.accepted) throw new Error(implOut.error?.message);
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ws-"));
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({
      name: "ws",
      scripts: {
        lint: 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
        build: 'node -e "process.exit(0)"',
      },
    }),
  );
  featureDir = join(ws, "specs", FEATURE_ID);
  writeArtifact("spec.md");
  writeArtifact("plan.md");
  writeArtifact("checklists/requirements.md");
  writeArtifact("tasks.md");
  const config = loadConfig(FIXTURE);
  engine = new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
    specKitArtifactCheck: (_sessionId, pattern) => {
      try {
        return checkArtifactPattern(featureDir, ws, pattern);
      } catch {
        return { present: false, reason: "feature dir missing" };
      }
    },
  });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("strict batch review cadence (specs/017 FR-6)", () => {
  it("routes the batch-1 exit to review, not verify (AC3)", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("review_and_fix_implementation");
    expect(s.specKit?.batches).toEqual([
      {
        id: "batch-1",
        taskIds: ["T1", "T2"],
        reviewRounds: 0,
        approved: false,
      },
    ]);
  });

  it("submission_valid before all batches approved is rejected (AC3)", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    // Register a second batch while batch-1 is still unapproved.
    await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "implementation_changes_required",
    });
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T2"],
      batch: { id: "batch-2", taskIds: ["T2"] },
    });
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "submission_valid" },
    );
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_batch_gate");
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("review_and_fix_implementation");
  });

  it("batch_approved_more_pending returns to implement and the next implement registers the next batch (AC3)", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "batch_approved_more_pending" },
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("implement");
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T3"],
      batch: { id: "batch-2", taskIds: ["T3"] },
    });
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.batches[0]?.approved).toBe(true);
    expect(s.specKit?.batches[1]).toMatchObject({
      id: "batch-2",
      approved: false,
    });
  });

  it("last batch via submission_valid completes the cadence into verify", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "batch_approved_more_pending",
    });
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T3"],
      batch: { id: "batch-2", taskIds: ["T3"] },
    });
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "submission_valid" },
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("verify");
  });

  it("submission_valid after ALL batches approved reaches verify (AC3)", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "batch_approved_more_pending",
    });
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T3"],
      batch: { id: "batch-2", taskIds: ["T3"] },
    });
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "submission_valid" },
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("verify");
  });

  it("verify is unreachable while any batch lacks an approved review pass", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    // batch-2 registered while batch-1 is still unapproved
    await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "implementation_changes_required",
    });
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T2"],
      batch: { id: "batch-2", taskIds: ["T2"] },
    });
    // approving the CURRENT batch (batch-2) leaves batch-1 pending
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "batch_approved_more_pending" },
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("implement");
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.batches.map((b) => b.approved)).toEqual([false, true]);
  });

  it("re-submitting the same batch id updates instead of stacking", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "implementation_changes_required",
    });
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T2"],
      batch: { id: "batch-1", taskIds: ["T1", "T2", "T2b"] },
    });
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.batches).toHaveLength(1);
    expect(s.specKit?.batches[0]?.taskIds).toEqual(["T1", "T2", "T2b"]);
  });

  it("review rounds are visible in session state and the maximum escalates via blocker (AC3)", async () => {
    const res = await startVariant();
    await reachImplement(res.sessionId);
    let out;
    for (let round = 0; round < 5; round++) {
      await engine.submit(res.sessionId, "implement", {
        implementedTasks: [`T1-r${round}`],
        batch: { id: "batch-1", taskIds: ["T1"] },
      });
      out = await engine.submit(
        res.sessionId,
        "review_and_fix_implementation",
        {
          findings: [],
          outcome: "implementation_changes_required",
        },
      );
      expect(out.accepted).toBe(true);
      const s = engine.getSession(res.sessionId);
      expect(s.specKit?.batches[0]?.reviewRounds).toBe(round + 1);
    }
    // 6th round exceeds the maximum (5) -> blocker escalation.
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T1-final"],
      batch: { id: "batch-1", taskIds: ["T1"] },
    });
    out = await engine.submit(res.sessionId, "review_and_fix_implementation", {
      findings: [],
      outcome: "implementation_changes_required",
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("workflow_blocked");
    const s = engine.getSession(res.sessionId);
    expect(s.status).toBe("blocked");
    const blocker = s.blockers.at(-1);
    expect(blocker?.category).toBe("spec_kit_review_round_exceeded");
    expect(blocker?.requiresUserDecision).toBe(true);
  });
});
