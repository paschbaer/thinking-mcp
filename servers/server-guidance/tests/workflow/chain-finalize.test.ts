/** Regression test for the chain-successor silent end (GDS-6 finalize path).
 *
 *  Drives a chained head into a failing completion op (pendingCompletion
 *  retained), makes the op pass, finalizes via retry_operations, and asserts
 *  the successor is created AND activated (status "active", not stuck in
 *  "activating"). Pins the defect class observed in production: a
 *  retry-finalized chained completion silently losing its successor. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance");

let ws: string;
let configDir: string;
let stateDir: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-chain-"));
  configDir = mkdtempSync(join(tmpdir(), "guidance-chain-cfg-"));
  cpSync(FIXTURE, configDir, { recursive: true });
  stateDir = join(ws, "state");
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
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

describe("chain finalize via retry_operations (silent end regression)", () => {
  it("finalizes a chained head via retry_operations and activates the successor", async () => {
    const flipMarker = join(ws, "flip");

    // Completion op fails until the flip marker exists (fail-then-pass).
    const opsPath = join(configDir, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf-8"));
    ops.operations["store-completion-insight"] = {
      type: "process",
      executable: "node",
      args: [
        "-e",
        `const fs=require("fs");if(fs.existsSync(${JSON.stringify(flipMarker)}))process.exit(0);fs.writeFileSync(${JSON.stringify(flipMarker)},"x");process.exit(1)`,
      ],
      required: true,
      timeoutSeconds: 30,
    };
    writeFileSync(opsPath, JSON.stringify(ops, null, 2));

    const config = loadConfig(configDir);
    config.chain = { enabled: true, maxChainDepth: 8, maxStepsPerManifest: 16 };
    const opEngine = new OperationEngine();
    opEngine.setDownstreamInvoker({
      invokeTool: async () => ({
        kind: "success",
        content: [{ type: "text", text: "ok" }],
      }),
    });
    const engine = new WorkflowEngine({
      config,
      stateDir,
      operationEngine: opEngine,
    });

    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "head scope",
      chain: { steps: [{ request: "successor scope" }] },
    });
    const drive = async (phase: string, payload: Record<string, unknown>) => {
      const out = await engine.submit(start.sessionId, phase, payload);
      if (!out.accepted) throw new Error(`${phase}: ${out.error?.message}`);
      return out;
    };
    await drive("understand", { summary: "s", acceptanceCriteria: ["a"] });
    await drive("plan", { tasks: [{ id: "T1" }] });
    await drive("review_and_adjust_plan", {
      findings: [],
      approvedPlan: { tasks: [] },
    });
    await drive("implement", {
      implementedTasks: ["T1"],
      changedFiles: ["a.ts"],
    });
    await drive("review_and_fix_implementation", {
      findings: [],
      filesChangedDuringReview: [],
    });
    await drive("verify", { verificationSummary: ["ok"] });

    // Completion op fails -> pendingCompletion retained, workflow not done.
    const first = await engine.completeWorkflow(start.sessionId, {
      summary: "done",
    });
    expect(first.accepted).toBe(false);
    expect(engine.getSession(start.sessionId).pendingCompletion).toBeTruthy();

    // "Fix" the op and finalize via retry_operations.
    writeFileSync(flipMarker, "go");
    const retry = await engine.retryOperations(start.sessionId);
    expect(retry.accepted, JSON.stringify(retry.error ?? retry)).toBe(true);
    const successorId = retry.nextSessionId;
    expect(
      successorId,
      "successor must be created by the finalize path",
    ).toBeTruthy();

    const successor = engine.getSession(successorId!);
    expect(successor.status).toBe("active"); // NOT stuck in "activating"
    expect(successor.chainFrom).toBe(start.sessionId);
    expect(successor.request).toBe("successor scope");
  });

  it("no-pending fallback completes but leaves a loud diagnostic for chained steps", async () => {
    // Production anomaly shape: a chained head in complete phase with NO
    // retained report (never stored because ops succeeded inline on the
    // original attempt). The fallback completes the workflow but MUST emit
    // chain_end_without_successor so the anomaly is observable.
    const config = loadConfig(configDir);
    config.chain = { enabled: true, maxChainDepth: 8, maxStepsPerManifest: 16 };
    const opEngine = new OperationEngine();
    opEngine.setDownstreamInvoker({
      invokeTool: async () => ({
        kind: "success",
        content: [{ type: "text", text: "ok" }],
      }),
    });
    const engine = new WorkflowEngine({
      config,
      stateDir,
      operationEngine: opEngine,
    });

    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "head scope",
      chain: { steps: [{ request: "successor scope" }] },
    });
    const drive = async (phase: string, payload: Record<string, unknown>) => {
      const out = await engine.submit(start.sessionId, phase, payload);
      if (!out.accepted) throw new Error(`${phase}: ${out.error?.message}`);
      return out;
    };
    await drive("understand", { summary: "s", acceptanceCriteria: ["a"] });
    await drive("plan", { tasks: [{ id: "T1" }] });
    await drive("review_and_adjust_plan", {
      findings: [],
      approvedPlan: { tasks: [] },
    });
    await drive("implement", {
      implementedTasks: ["T1"],
      changedFiles: ["a.ts"],
    });
    await drive("review_and_fix_implementation", {
      findings: [],
      filesChangedDuringReview: [],
    });
    await drive("verify", { verificationSummary: ["ok"] });

    // Simulate the anomaly: completed-report lost, session parked in
    // complete phase (active), steps still pending.
    engine.sessions.update(start.sessionId, (s) => {
      s.status = "active";
      s.currentPhase = "complete";
      s.pendingCompletion = undefined;
      delete s.pendingCompletion;
    });

    const retry = await engine.retryOperations(start.sessionId);
    expect(retry.accepted, JSON.stringify(retry.error ?? retry)).toBe(true);
    expect(retry.nextSessionId).toBeUndefined();
    expect(
      engine.audit
        .read(start.sessionId)
        .filter((e) => e.eventType === "chain_end_without_successor"),
    ).toHaveLength(1);
    const s = engine.getSession(start.sessionId);
    expect(s.status).toBe("completed");

    // Second retry: the diagnostic is latched — still exactly one event.
    engine.sessions.update(start.sessionId, (s) => {
      s.status = "active";
      s.currentPhase = "complete";
    });
    const retry2 = await engine.retryOperations(start.sessionId);
    expect(retry2.accepted, JSON.stringify(retry2.error ?? retry2)).toBe(true);
    expect(
      engine.audit
        .read(start.sessionId)
        .filter((e) => e.eventType === "chain_end_without_successor"),
    ).toHaveLength(1);
  });
});
