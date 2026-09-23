import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";

let ws: string;
let stateDir: string;
let configDir: string;

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-exp-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({ name: "ws", scripts: { lint: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"", build: "node -e \"process.exit(0)\"" } }),
  );
});

function makeEngineWithFailingLint(overrideOps?: (ops: Record<string, unknown>) => void): WorkflowEngine {
  if (overrideOps) {
    const opsPath = join(configDir, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf-8"));
    overrideOps(ops.operations);
    writeFileSync(opsPath, JSON.stringify(ops, null, 2));
  }
  const opEngine = new OperationEngine();
  opEngine.setDownstreamInvoker({ invokeTool: async () => ({ kind: "success", content: [] }) });
  return new WorkflowEngine({ config: loadConfig(configDir), stateDir, operationEngine: opEngine });
}

async function walkToComplete(engine: WorkflowEngine, sessionId: string): Promise<void> {
  await engine.submit(sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] });
  await engine.submit(sessionId, "plan", { tasks: [{ id: "T1" }] });
  await engine.submit(sessionId, "review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } });
  await engine.submit(sessionId, "implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] });
  await engine.submit(sessionId, "review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] });
  await engine.submit(sessionId, "verify", { verificationSummary: ["ok"] });
}

describe("exposure wiring (FR-037/§30, Review Finding 3)", () => {
  it("status_only op keeps stderr out of the agent-facing summary (secret-ish output)", async () => {
    const engine = makeEngineWithFailingLint((ops) => {
      ops["lint"] = {
        description: "lint", type: "process", executable: "node", required: true,
        args: ["-e", "process.stderr.write('SECRET-API-KEY-CONTENT'); process.exit(1)"],
        timeoutSeconds: 30, validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "status_only" },
      };
    });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await engine.submit(start.sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] });
    await engine.submit(start.sessionId, "plan", { tasks: [{ id: "T1" }] });
    await engine.submit(start.sessionId, "review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } });
    await engine.submit(start.sessionId, "implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] });
    await engine.submit(start.sessionId, "review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] });
    const out = await engine.submit(start.sessionId, "verify", { verificationSummary: ["ok"] });
    // verify-Op schlägt fehl → Transition zurück in review_and_fix_implementation (FR-040)
    expect(out.currentPhase).toBe("review_and_fix_implementation");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("SECRET-API-KEY-CONTENT");
  });

  it("summary_and_errors mode still surfaces the failure summary (without secret content)", async () => {
    const engine = makeEngineWithFailingLint((ops) => {
      ops["lint"] = {
        description: "lint", type: "process", executable: "node", required: true,
        args: ["-e", "process.stderr.write('harmless failure detail'); process.exit(1)"],
        timeoutSeconds: 30, validation: { exitCodeMustBeZero: true },
        output: { returnToAgent: "summary_and_errors" },
      };
    });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await engine.submit(start.sessionId, "understand", { summary: "s", acceptanceCriteria: ["a"] });
    await engine.submit(start.sessionId, "plan", { tasks: [{ id: "T1" }] });
    await engine.submit(start.sessionId, "review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } });
    await engine.submit(start.sessionId, "implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] });
    await engine.submit(start.sessionId, "review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] });
    const out = await engine.submit(start.sessionId, "verify", { verificationSummary: ["ok"] });
    expect(out.currentPhase).toBe("review_and_fix_implementation");
    const serialized = JSON.stringify(out);
    expect(serialized).toContain("harmless failure detail");
  });
});
