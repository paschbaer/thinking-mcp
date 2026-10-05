/** specs/017 AC5 (FR-7): hash-based converge loop on tasks.md. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { checkArtifactPattern } from "../../src/integrations/spec-kit/SpecKitEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance-speckit");

let ws: string;
let engine: WorkflowEngine;
let featureDir: string;
let tasksMd: string;

const FEATURE_ID = "017-test-feature";

function syncTasksFile(): void {
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, "tasks.md"), tasksMd);
}

const startVariant = () =>
  engine.startWorkflow({
    workspaceRoot: ws,
    request: "r",
    workflowId: "spec-kit-development",
  });

/** Drives a variant session from its CURRENT phase to verify. */
const reachVerify = async (sessionId: string): Promise<void> => {
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
  const impl = await engine.submit(sessionId, "implement", {
    implementedTasks: ["T1"],
    batch: { id: "batch-1", taskIds: ["T1"] },
  });
  if (!impl.accepted) throw new Error(impl.error?.message);
  const review = await engine.submit(
    sessionId,
    "review_and_fix_implementation",
    {
      findings: [],
      outcome: "submission_valid",
    },
  );
  if (!review.accepted) throw new Error(review.error?.message);
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
  writeArtifactAll();
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

function writeArtifactAll(): void {
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, "spec.md"), "# spec\n");
  writeFileSync(join(featureDir, "plan.md"), "# plan\n");
  mkdirSync(join(featureDir, "checklists"), { recursive: true });
  writeFileSync(join(featureDir, "checklists", "requirements.md"), "# c\n");
  tasksMd = "# tasks\n\n## Phase 1\n- [ ] T1\n";
  writeFileSync(join(featureDir, "tasks.md"), tasksMd);
}

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("converge loop (specs/017 FR-7)", () => {
  it("tasks.md byte-identical after converge => complete path (AC5)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("verify");
    expect(s.specKit?.convergence?.snapshotSha256).toMatch(/^sha256:/);
    // speckit.converge leaves tasks.md unchanged.
    const out = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["✅ Converged: 1 checked, 0 findings"],
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("complete");
  });

  it("Convergence section appended => loop back to implement after refresh (AC5)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    // speckit.converge appends gap tasks (mutates tasks.md).
    tasksMd += "\n## Phase 2: Convergence\n- [ ] T2 gap fix\n";
    syncTasksFile();
    const out = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["converge found gaps"],
      convergence: {
        outcome: "tasks_appended",
        summary: "2 gaps appended",
        checkedTasks: 1,
      },
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("implement");
    // FR-7: the loop guidance mandates refresh_spec_kit_artifacts first.
    expect(out.guidance?.instruction).toContain("refresh_spec_kit_artifacts");
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.convergence?.passes).toBe(1);
  });

  it("changed tasks.md WITHOUT a Convergence section fails closed (classified)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    tasksMd = tasksMd.replace("T1", "T1-edited");
    syncTasksFile();
    const out = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["x"],
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_convergence_unclassified");
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("verify");
  });

  it("exceeding the convergence-pass maximum escalates via blocker (AC5)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    for (let pass = 1; pass <= 5; pass++) {
      tasksMd += `\n## Phase ${pass + 1}: Convergence\n- [ ] gap-${pass}\n`;
      syncTasksFile();
      const out = await engine.submit(res.sessionId, "verify", {
        verificationSummary: [`pass ${pass}`],
        convergence: { outcome: "tasks_appended", summary: `pass ${pass}` },
      });
      expect(out.accepted).toBe(true);
      expect(out.currentPhase).toBe("implement");
      // back through implement/review to verify
      const impl = await engine.submit(res.sessionId, "implement", {
        implementedTasks: [`gap-${pass}`],
        batch: { id: `conv-${pass}`, taskIds: [`gap-${pass}`] },
      });
      expect(impl.accepted).toBe(true);
      const review = await engine.submit(
        res.sessionId,
        "review_and_fix_implementation",
        { findings: [], outcome: "submission_valid" },
      );
      expect(review.accepted).toBe(true);
    }
    // 6th pass exceeds the maximum.
    tasksMd += "\n## Phase 7: Convergence\n- [ ] gap-6\n";
    syncTasksFile();
    const out = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["pass 6"],
      convergence: { outcome: "tasks_appended", summary: "pass 6" },
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("workflow_blocked");
    const s = engine.getSession(res.sessionId);
    expect(s.blockers.at(-1)?.category).toBe("spec_kit_convergence_exceeded");
    expect(s.blockers.at(-1)?.requiresUserDecision).toBe(true);
  });
});
