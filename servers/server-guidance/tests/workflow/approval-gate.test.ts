/**
 * FR-053 approval gate (REV-US2-F1, scope A) + REV-F2F3F4-1 warnings
 * pass-through:
 * - workspace_write/destructive/credential_sensitive operations require a
 *   per-execution user grant on ALL execution paths (run_operation and
 *   lifecycle executions); grants come from the approval ceremony
 *   (report_blocker category "approval" + resume_workflow decision
 *   "approve <operation-id>") and are consumed one-shot.
 * - applyExposure mode summary_and_errors lets warnings through so the
 *   AC-9 node_deps_hint reaches the agent (content/data stay suppressed).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type LoadedConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import { SessionRepository } from "../../src/state/SessionRepository.js";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";

let ws: string;
let config: LoadedConfig;
let engine: WorkflowEngine;

function makeEngine(): void {
  const opEngine = new OperationEngine();
  opEngine.setDownstreamInvoker({
    invokeTool: async () => ({ kind: "success" as const, content: [] }),
  });
  engine = new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
    operationEngine: opEngine,
  });
}

function grant(sessionId: string, operationId: string): void {
  new SessionRepository(join(ws, "state", "sessions")).update(
    sessionId,
    (s) => {
      s.approvedOperations ??= [];
      s.approvedOperations.push(operationId);
    },
  );
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-approval-"));
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
  config = loadConfig(join(import.meta.dirname, "fixtures/guidance"));
  config.chain = { enabled: true, maxChainDepth: 8, maxStepsPerManifest: 16 };
  makeEngine();
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("FR-053 approval gate (scope A)", () => {
  it("run_operation on a workspace_write op without a grant → recoverable authorization_required + audit; ceremony grants a one-shot execution", async () => {
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const sid = start.sessionId;

    await expect(engine.runOperation(sid, "build")).rejects.toThrowError(
      /authorization_required|FR-053/,
    );
    const history = readFileSync(
      join(ws, "state", "history", `${sid}.jsonl`),
      "utf8",
    );
    expect(history).toContain("approval_required");

    // Approval ceremony: blocker + resume decision grants a one-shot run.
    await engine.reportBlocker(sid, {
      category: "approval",
      description: "approve build",
      requiresUserDecision: true,
      options: ["approve build", "deny"],
    });
    expect((await engine.getSession(sid)).status).toBe("blocked");
    await engine.resumeWorkflow(sid, { decision: "approve build" });
    expect((await engine.getSession(sid)).status).toBe("active");

    const result = await engine.runOperation(sid, "build");
    expect(result.status).toBe("succeeded");
    expect(
      readFileSync(join(ws, "state", "history", `${sid}.jsonl`), "utf8"),
    ).toContain("approval_consumed");

    // One-shot: the second run requires a fresh grant.
    await expect(engine.runOperation(sid, "build")).rejects.toThrowError(
      /authorization_required|FR-053/,
    );
  });

  it("lifecycle path: a workspace_write verify gate fails the submit without a grant and completes after the ceremony", async () => {
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const sid = start.sessionId;
    const sub = (p: string, payload: Record<string, unknown>) =>
      engine.submit(sid, p, payload);
    await sub("understand", { summary: "s", acceptanceCriteria: ["a"] });
    await sub("plan", { tasks: [{ id: "T1" }] });
    await sub("review_and_adjust_plan", {
      findings: [],
      approvedPlan: { tasks: [] },
    });
    await sub("implement", {
      implementedTasks: ["T1"],
      changedFiles: ["a.ts"],
    });
    await sub("review_and_fix_implementation", {
      findings: [],
      filesChangedDuringReview: [],
    });
    // verify submit runs the verify→complete transition incl. the build
    // gate (workspace_write); the throw aborts with the phase parked on
    // verify.
    await expect(
      sub("verify", { verificationSummary: ["ok"] }),
    ).rejects.toThrowError(/authorization_required|FR-053/);
    expect((await engine.getSession(sid)).currentPhase).toBe("verify");

    grant(sid, "build");
    grant(sid, "repository-analysis");
    await sub("verify", { verificationSummary: ["ok"] });
    expect((await engine.getSession(sid)).currentPhase).toBe("complete");
  });

  it("read_only ops are unaffected by the gate", async () => {
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const result = await engine.runOperation(start.sessionId, "lint");
    expect(result.status).toBe("succeeded");
  });
});

describe("REV-F2F3F4-1: summary_and_errors lets warnings through", () => {
  it("applyExposure keeps warnings while suppressing content/data", () => {
    const policy = new PolicyEngine();
    const exposed = policy.applyExposure(
      {
        id: "gate",
        status: "failed",
        summary: "gate failed",
        content: [{ type: "text", text: "raw output" }],
        data: { exitCode: 1 },
        errors: [{ message: "boom" }],
        warnings: [{ code: "node_deps_hint", message: "run deps-install" }],
      },
      "summary_and_errors",
    );
    expect(exposed.content).toEqual([]);
    expect(exposed.data).toEqual({});
    expect(exposed.warnings).toEqual([
      { code: "node_deps_hint", message: "run deps-install" },
    ]);
  });

  it("a failing composite gate exposes node_deps_hint to the agent under summary_and_errors", async () => {
    const opEngine = new OperationEngine();
    const result = await opEngine.execute(
      {
        operationId: "gate",
        description: "d",
        type: "composite",
        strategy: "firstAvailable",
        required: true,
        riskClass: "read_only",
        steps: [
          {
            type: "process",
            capability: "gate",
            executable: "node",
            args: [
              "-e",
              "console.error(\"Cannot find module 'x'\"); process.exit(1)",
            ],
          },
        ],
        timeoutSeconds: 30,
        validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      } as Parameters<OperationEngine["execute"]>[0],
      { workspaceRoot: ws },
      1,
    );
    const exposed = new PolicyEngine().applyExposure(
      result,
      "summary_and_errors",
    );
    expect(exposed.status).toBe("failed");
    expect(
      exposed.warnings.find((w) => w.code === "node_deps_hint"),
    ).toBeDefined();
  });
});

/** REV-F053-1: all-or-nothing approval for op-by-op lifecycle loops. Uses a
 *  workspace-local workflow.json whose plan.beforeEnter list is
 *  [query-project-insights (ungated), build (gated), repository-analysis
 *  (gated)] — a denial on the LAST gated op must fire BEFORE any op of the
 *  list executes and must not burn the earlier gated op's grant. */
describe("REV-F053-1: lifecycle hook lists are all-or-nothing", () => {
  function wsGuidanceMultiGate(): string {
    const dir = join(ws, ".guidance");
    mkdirSync(join(dir, "schemas"), { recursive: true });
    const FIX = join(import.meta.dirname, "fixtures/guidance");
    for (const f of [
      "guidance.json",
      "workflow.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
      "policies.json",
    ]) {
      writeFileSync(join(dir, f), readFileSync(join(FIX, f)));
    }
    for (const f of readdirSync(join(FIX, "schemas"))) {
      writeFileSync(
        join(dir, "schemas", f),
        readFileSync(join(FIX, "schemas", f)),
      );
    }
    const wf = JSON.parse(readFileSync(join(dir, "workflow.json"), "utf8"));
    wf.phases.plan.lifecycle = {
      ...wf.phases.plan.lifecycle,
      beforeEnter: [
        "query-project-insights",
        "build",
        "repository-analysis",
      ],
    };
    writeFileSync(join(dir, "workflow.json"), JSON.stringify(wf));
    return dir;
  }

  function multiGateEngine(): void {
    config = loadConfig(wsGuidanceMultiGate(), { workspaceRoot: ws });
    const opEngine = new OperationEngine();
    opEngine.setDownstreamInvoker({
      invokeTool: async () => ({ kind: "success" as const, content: [] }),
    });
    engine = new WorkflowEngine({
      config,
      stateDir: join(ws, "state"),
      operationEngine: opEngine,
    });
  }

  async function startAndReachPlan(sid: string): Promise<void> {
    await engine.submit(sid, "understand", {
      summary: "s",
      acceptanceCriteria: ["a"],
    });
  }

  it("a denial on the LAST gated op fires before ANY op executes and keeps earlier grants", async () => {
    multiGateEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const sid = start.sessionId;
    grant(sid, "build"); // repository-analysis NOT granted

    // plan.beforeEnter validates the WHOLE list before executing anything:
    // the denial names the LAST unapproved op, the ungated op did NOT run,
    // and the earlier gated op's grant was not burned.
    await expect(
      engine.submit(sid, "understand", {
        summary: "s",
        acceptanceCriteria: ["a"],
      }),
    ).rejects.toThrowError(/repository-analysis/);

    const history = readFileSync(
      join(ws, "state", "history", `${sid}.jsonl`),
      "utf8",
    );
    expect(history).not.toContain("approval_consumed");
    const still = new SessionRepository(join(ws, "state", "sessions")).load(
      sid,
    );
    expect(still.approvedOperations).toContain("build");
  });

  it("after granting all gated ops the list executes once, consuming each grant on success", async () => {
    multiGateEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const sid = start.sessionId;
    grant(sid, "build");
    grant(sid, "repository-analysis");

    await startAndReachPlan(sid);
    const history = readFileSync(
      join(ws, "state", "history", `${sid}.jsonl`),
      "utf8",
    );
    expect(history.match(/approval_consumed/g) ?? []).toHaveLength(2);
    const s = new SessionRepository(join(ws, "state", "sessions")).load(sid);
    expect(s.approvedOperations ?? []).toHaveLength(0);
  });
});
