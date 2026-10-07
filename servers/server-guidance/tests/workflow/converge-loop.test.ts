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

describe("convergence snapshot availability (specs/017 Final#2)", () => {
  it("unwired bridge: existing snapshot still classifies via standard flow (documented baseline)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    // An engine WITHOUT the artifact bridge cannot enforce variant gates at
    // all (its artifactCheck always reports absent). With a snapshot already
    // taken by the wired engine, the verify gate degrades to the standard
    // flow instead of crashing — the historical behavior.
    const bare = new WorkflowEngine({
      config: loadConfig(FIXTURE),
      stateDir: join(ws, "state"),
    });
    const out = await bare.submit(res.sessionId, "verify", {
      verificationSummary: ["no bridge, existing snapshot"],
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("complete");
  });

  it("wired bridge + unreadable tasks.md at verify entry: flagged, audited, and verify submissions rejected (Final#2)", async () => {
    // tasks.md exists through the tasks-phase exit gate, then disappears —
    // so verify is entered without an importable tasks.md.
    const res = await startVariant();
    const analyze = await engine.submit(
      res.sessionId,
      "review_and_adjust_plan",
      {
        findings: [],
      },
    );
    if (!analyze.accepted) throw new Error(analyze.error?.message);
    const impl = await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T1"],
      batch: { id: "batch-1", taskIds: ["T1"] },
    });
    if (!impl.accepted) throw new Error(impl.error?.message);
    rmSync(join(featureDir, "tasks.md"));
    const review = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      { findings: [], outcome: "submission_valid" },
    );
    if (!review.accepted) throw new Error(review.error?.message);
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("verify");
    expect(s.specKit?.convergence).toBeNull();
    expect(s.specKit?.convergenceUnavailable).toBeTruthy();
    expect(
      engine.audit
        .read(res.sessionId)
        .filter((e) => e.eventType === "convergence_snapshot_unavailable"),
    ).toHaveLength(1);
    const verifyOut = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["attempt"],
    });
    expect(verifyOut.accepted).toBe(false);
    expect(verifyOut.error?.code).toBe("convergence_snapshot_unavailable");
    expect(verifyOut.error?.recoverable).toBe(true);

    // Recovery: restore tasks.md and RESUBMIT verify — the gate retakes the
    // snapshot at submission time and rejects ONCE with "resubmit" so the
    // next submission classifies honestly against the NEW snapshot (no
    // tautological auto-complete, final review F1).
    syncTasksFile();
    const s2 = engine.getSession(res.sessionId);
    expect(s2.currentPhase).toBe("verify");
    const retake = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["restored"],
    });
    expect(retake.accepted).toBe(false);
    expect(retake.error?.code).toBe("convergence_snapshot_unavailable");
    expect(retake.error?.message).toContain("snapshot retaken");
    const out = await engine.submit(res.sessionId, "verify", {
      verificationSummary: ["✅ Converged after recovery"],
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("complete");
    const s3 = engine.getSession(res.sessionId);
    expect(s3.specKit?.convergence).not.toBeNull();
    expect(s3.specKit?.convergenceUnavailable).toBeUndefined();
  });

  it("unwired bridge + null snapshot falls back to the standard flow (Final#2 baseline branch)", async () => {
    const res = await startVariant();
    await reachVerify(res.sessionId);
    const bare = new WorkflowEngine({
      config: loadConfig(FIXTURE),
      stateDir: join(ws, "state"),
    });
    // Force the null-snapshot state on the persisted session, then submit
    // verify through the UNWIRED engine: the gate must take the documented
    // standard-flow fallback (return {}), not reject.
    engine.sessions.update(res.sessionId, (s) => {
      s.specKit!.convergence = null;
      s.specKit!.convergenceUnavailable = undefined;
    });
    const out = await bare.submit(res.sessionId, "verify", {
      verificationSummary: ["unwired fallback"],
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("complete");
  });
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
