import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import type { NormalizedResult } from "../../src/types/index.js";

let ws: string;
let stateDir: string;
let configDir: string;

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");
const WORKSPACE_LOCK = "workspace-ops.lock";

function seededWorkspace(): void {
  ws = mkdtempSync(join(tmpdir(), "guidance-runop-"));
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
  writeFileSync(join(configDir, "workflow.json"), JSON.stringify({
    version: 2,
    workflow: { id: "runop-test", profile: "plain", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
    phases: {
      understand: { response: "understand", submissionSchema: "schemas/understand.schema.json", transitions: [{ to: "plan", when: "submission_valid" }] },
      plan: { response: "plan", submissionSchema: "schemas/plan.schema.json", transitions: [{ to: "review_and_adjust_plan", when: "submission_valid" }] },
      review_and_adjust_plan: { response: "review_and_adjust_plan", submissionSchema: "schemas/review-plan.schema.json", transitions: [{ to: "implement", when: "submission_valid" }] },
      implement: { response: "implement", submissionSchema: "schemas/implement.schema.json", transitions: [{ to: "review_and_fix_implementation", when: "submission_valid" }] },
      review_and_fix_implementation: { response: "review_and_fix_implementation", submissionSchema: "schemas/review-implementation.schema.json", transitions: [{ to: "verify", when: "submission_valid" }] },
      verify: { response: "verify", submissionSchema: "schemas/verify.schema.json", transitions: [{ to: "complete", when: "required_operations_succeeded" }] },
      complete: { response: "complete", submissionSchema: "schemas/complete.schema.json", transitions: [{ to: "completed", when: "required_operations_succeeded" }] },
    },
    states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
  }));
  writeFileSync(join(configDir, "operations.json"), JSON.stringify({
    version: 2,
    operations: {
      "invocable-echo": { description: "d", type: "process", executable: "node", args: ["-e", "console.log('hi')"], required: false, invocableByAgent: true, timeoutSeconds: 10, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
      "unmarked-echo": { description: "d", type: "process", executable: "node", args: ["-e", "console.log('nope')"], required: false, timeoutSeconds: 10, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
      "slow-echo": { description: "d", type: "process", executable: "node", args: ["-e", "setTimeout(()=>{process.exit(0)},3000)"], required: false, invocableByAgent: true, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
      "secret-echo": { description: "d", type: "process", executable: "node", args: ["-e", "console.log('api_key: sk-abc123deployment')"], required: false, invocableByAgent: true, timeoutSeconds: 10, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } },
    },
  }));
}

/** Controllable fake OperationEngine for concurrency scenarios. */
function makeDeferredOpEngine(): { engine: OperationEngine; calls: () => string[]; resolveAll: () => void } {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => { release = r; });
  const engine = {
    execute: (config: { operationId: string }): Promise<NormalizedResult> => {
      calls.push(config.operationId);
      return gate.then(() => ({
        operationId: config.operationId, capabilityType: "process", capabilityName: config.operationId,
        status: "succeeded", summary: `${config.operationId} succeeded`, data: {}, content: [],
        warnings: [], errors: [], protocolMetadata: {}, validated: true,
      } as NormalizedResult));
    },
  };
  return { engine: engine as unknown as OperationEngine, calls: () => calls, resolveAll: () => release?.() };
}

function makeEngine(opEngine?: OperationEngine): WorkflowEngine {
  const config = loadConfig(configDir);
  return new WorkflowEngine({ config, stateDir, ...(opEngine ? { operationEngine: opEngine } : {}) });
}

beforeEach(seededWorkspace);
afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("run_operation: on-demand invocation (spec 003 US1, FR-101..107)", () => {
  it("executes a marked operation through the engine and returns {id,status,summary}", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const res = await engine.runOperation(start.sessionId, "invocable-echo");
    expect(res.id).toBe("invocable-echo");
    expect(res.status).toBe("succeeded");
    expect(typeof res.summary).toBe("string");
  });

  it("rejects unmarked operations fail-closed without executing (SC-002)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await expect(engine.runOperation(start.sessionId, "unmarked-echo")).rejects.toThrowError(/agent_invocation_denied/);
    const history = rf(join(stateDir, "history", `${start.sessionId}.jsonl`), "utf-8");
    // kein Execution-Event (operation_invoked), aber Denial wird auditiert (FR-103/SC-002)
    expect(history).not.toContain("operation_invoked");
    expect(history).toContain("operation_invocation_denied");
    expect(history).toContain("unmarked-echo");
  });

  it("rejects unknown operations and unknown sessions with existing error contracts", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await expect(engine.runOperation(start.sessionId, "nope")).rejects.toThrowError(/operation_not_configured/);
    await expect(engine.runOperation("session-does-not-exist", "invocable-echo")).rejects.toThrowError(/session_not_found/);
  });

  it("records an operation_invoked audit event with the outcome (FR-103)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await engine.runOperation(start.sessionId, "invocable-echo");
    const history = rf(join(stateDir, "history", `${start.sessionId}.jsonl`), "utf-8");
    expect(history).toContain("operation_invoked");
    expect(history).toContain("invocable-echo");
  });

  it("per-session mutex (FR-107) and cross-session workspace lock (FR-109)", async () => {
    const { engine, resolveAll } = makeDeferredOpEngine();
    const e = makeEngine(engine);
    const a = await e.startWorkflow({ workspaceRoot: ws, request: "a" });
    const b = await e.startWorkflow({ workspaceRoot: ws, request: "b" });
    const first = e.runOperation(a.sessionId, "invocable-echo");
    await expect(e.runOperation(a.sessionId, "invocable-echo")).rejects.toThrowError(/operation_in_progress/);
    await expect(e.runOperation(b.sessionId, "invocable-echo")).rejects.toThrowError(/operation_in_progress/);
    resolveAll();
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
    // locks released afterwards
    await expect(e.runOperation(b.sessionId, "invocable-echo")).resolves.toMatchObject({ status: "succeeded" });
  });

  it("FR-110: cancelling mid-operation discards the result and releases the lock", async () => {
    const { engine, resolveAll } = makeDeferredOpEngine();
    const e = makeEngine(engine);
    const a = await e.startWorkflow({ workspaceRoot: ws, request: "a" });
    const running = e.runOperation(a.sessionId, "invocable-echo");
    await e.cancelWorkflow(a.sessionId);
    resolveAll();
    const res = await running;
    expect(res.status).toBe("failed");
    expect(res.summary).toMatch(/cancel/i);
    // lock released: another session can run immediately
    const b = await e.startWorkflow({ workspaceRoot: ws, request: "b" });
    await expect(e.runOperation(b.sessionId, "invocable-echo")).resolves.toMatchObject({ status: "succeeded" });
  });

  it("exposure: agent-facing result carries no raw op content (SC-004 seam via exposure)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const res = await engine.runOperation(start.sessionId, "secret-echo");
    expect(JSON.stringify(res)).not.toContain("sk-abc123deployment");
  });

  it("hard-cancel kills a real running child, releases the lock (FR-202, SC-201)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const running = engine.runOperation(start.sessionId, "slow-echo");
    await new Promise((r) => setTimeout(r, 400)); // let the child start
    await engine.cancelWorkflow(start.sessionId);
    const res = await running;
    expect(res.status).toBe("failed");
    expect(res.summary).toMatch(/cancel/i);
    // lock released + child dead: another session runs immediately
    const other = await engine.startWorkflow({ workspaceRoot: ws, request: "b" });
    await expect(engine.runOperation(other.sessionId, "invocable-echo")).resolves.toMatchObject({ status: "succeeded" });
  }, 15_000);

  it("real-process cross-session contention (FR-109/FR-203, R-006)", async () => {
    const engine = makeEngine();
    const a = await engine.startWorkflow({ workspaceRoot: ws, request: "a" });
    const b = await engine.startWorkflow({ workspaceRoot: ws, request: "b" });
    const first = engine.runOperation(a.sessionId, "slow-echo");
    await new Promise((r) => setTimeout(r, 400)); // child running
    await expect(engine.runOperation(b.sessionId, "slow-echo")).rejects.toThrowError(/operation_in_progress/);
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
    // after release, b can acquire
    await expect(engine.runOperation(b.sessionId, "invocable-echo")).resolves.toMatchObject({ status: "succeeded" });
  }, 20_000);

  it("workspace lock file is cleaned up after runs (no residue)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await engine.runOperation(start.sessionId, "invocable-echo");
    expect(existsSync(join(stateDir, WORKSPACE_LOCK))).toBe(false);
  });

  it("stale lock recovery (Review R-004): dead-owner lock is stolen, operation proceeds", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const lock = join(stateDir, WORKSPACE_LOCK);
    writeFileSync(lock, "999999999"); // pid existiert nicht → tot
    await expect(engine.runOperation(start.sessionId, "invocable-echo")).resolves.toMatchObject({ status: "succeeded" });
    expect(existsSync(lock)).toBe(false); // regulär released nach dem Run
  });

  it("live owner is NEVER stolen (R-012c): fresh lock from a live pid → contention, lock intact", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const lock = join(stateDir, WORKSPACE_LOCK);
    writeFileSync(lock, String(process.pid)); // lebender Owner, frische mtime
    await expect(engine.runOperation(start.sessionId, "invocable-echo")).rejects.toThrowError(/operation_in_progress/);
    expect(existsSync(lock)).toBe(true); // nicht gerausgenommen
    expect(readFileSync(lock, "utf8").trim()).toBe(String(process.pid));
    // aufräumen, damit afterEach sauber ist
    rmSync(lock);
  });
});
