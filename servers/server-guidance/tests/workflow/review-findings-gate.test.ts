import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { evaluateReviewFindings } from "../../src/workflow/review-findings.js";

let ws: string;
let engine: WorkflowEngine;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-gate-"));
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
  const fixtureConfig = join(import.meta.dirname, "fixtures/guidance");
  engine = new WorkflowEngine({
    config: loadConfig(fixtureConfig),
    stateDir: join(ws, "state"),
  });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

const started = async () => {
  const res = await engine.startWorkflow({
    workspaceRoot: ws,
    request: "test request",
  });
  return res;
};

/** understand → plan → review_and_adjust_plan (clean) → implement. */
const walkToImplementationReview = async (sessionId: string) => {
  await engine.submit(sessionId, "understand", {
    summary: "s",
    acceptanceCriteria: ["a"],
  } as Record<string, unknown>);
  await engine.submit(sessionId, "plan", {
    tasks: [{ id: "T1" }],
  } as Record<string, unknown>);
  await engine.submit(sessionId, "review_and_adjust_plan", {
    findings: [],
    approvedPlan: { tasks: [] },
  } as Record<string, unknown>);
  await engine.submit(sessionId, "implement", {
    implementedTasks: ["T1"],
    changedFiles: ["a.ts"],
  } as Record<string, unknown>);
};

describe("review findings severity gate (unit)", () => {
  it("blocks open high/critical findings", () => {
    const out = evaluateReviewFindings(
      [{ severity: "high" }, { severity: "critical" }, { severity: "low" }],
      ["high", "critical"],
    );
    expect(out.blocked).toBe(true);
    expect(out.openBlocking).toHaveLength(2);
    expect(out.totalFindings).toBe(3);
  });

  it("treats fixed/tracked/accepted as resolved (check-final-review semantics)", () => {
    const out = evaluateReviewFindings(
      [
        { severity: "high", status: "fixed" },
        { severity: "critical", status: "tracked" },
        { severity: "critical", status: "accepted" },
      ],
      ["high", "critical"],
    );
    expect(out.blocked).toBe(false);
  });

  it("treats a missing status on a blocking severity as open", () => {
    expect(
      evaluateReviewFindings([{ severity: "HIGH" }], ["high"]).blocked,
    ).toBe(true);
  });

  it("ignores non-object entries and empty lists", () => {
    expect(
      evaluateReviewFindings(["nope", null, 42], ["high"]).blocked,
    ).toBe(false);
    expect(evaluateReviewFindings([], ["high"]).blocked).toBe(false);
  });
});

describe("review findings severity gate (integration)", () => {
  it("loops review_and_adjust_plan back to plan on an open high finding", async () => {
    const res = await started();
    await engine.submit(res.sessionId, "understand", {
      summary: "s",
      acceptanceCriteria: ["a"],
    } as Record<string, unknown>);
    await engine.submit(res.sessionId, "plan", {
      tasks: [{ id: "T1" }],
    } as Record<string, unknown>);
    const out = await engine.submit(res.sessionId, "review_and_adjust_plan", {
      findings: [{ severity: "high", findingId: "R-1" }],
      approvedPlan: { tasks: [] },
    } as Record<string, unknown>);
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
  });

  it("loops review_and_fix_implementation back to implement on an open critical finding", async () => {
    const res = await started();
    await walkToImplementationReview(res.sessionId);
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      {
        findings: [{ severity: "critical", findingId: "R-2" }],
        filesChangedDuringReview: [],
      } as Record<string, unknown>,
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("implement");
  });

  it("advances to verify when all blocking findings are resolved", async () => {
    const res = await started();
    await walkToImplementationReview(res.sessionId);
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      {
        findings: [
          { severity: "high", status: "fixed" },
          { severity: "critical", status: "tracked" },
          { severity: "medium" },
        ],
        filesChangedDuringReview: ["a.ts"],
      } as Record<string, unknown>,
    );
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("verify");
  });

  it("rejects findings without severity (strict schema, phase unchanged)", async () => {
    const res = await started();
    await walkToImplementationReview(res.sessionId);
    const out = await engine.submit(
      res.sessionId,
      "review_and_fix_implementation",
      {
        findings: [{ findingId: "R-3" }],
        filesChangedDuringReview: [],
      } as Record<string, unknown>,
    );
    expect(out.accepted).toBe(false);
    if (!out.accepted) expect(out.error!.code).toBe("submission_invalid");
    expect(engine.getSession(res.sessionId).currentPhase).toBe(
      "review_and_fix_implementation",
    );
  });

  it("increments the loop counter across repeated blocked submissions and surfaces it in guidance", async () => {
    const res = await started();
    await walkToImplementationReview(res.sessionId);
    const blocked = async () =>
      await engine.submit(res.sessionId, "review_and_fix_implementation", {
        findings: [{ severity: "high" }],
        filesChangedDuringReview: [],
      } as Record<string, unknown>);
    await blocked();
    // implement → review again, then a second blocked submission
    await engine.submit(res.sessionId, "implement", {
      implementedTasks: ["T1"],
      changedFiles: ["a.ts"],
    } as Record<string, unknown>);
    const second = await blocked();
    expect(second.accepted).toBe(true);
    expect(second.currentPhase).toBe("implement");
    const s = engine.getSession(res.sessionId);
    expect(s.reviewGateLoops?.review_and_fix_implementation).toBe(2);
    const guidance = engine.guidanceForPublic(s);
    expect(guidance.instruction).toContain("2 time(s)");
  });
});
