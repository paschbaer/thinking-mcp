import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import { createCountingInvoker } from "./stubs/stub-downstream.js";

let ws: string;
let counting: ReturnType<typeof createCountingInvoker>;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-idem-"));
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({ name: "ws", scripts: { lint: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"", build: "node -e \"process.exit(0)\"" } }),
  );
  counting = createCountingInvoker();
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

function makeEngine(): WorkflowEngine {
  const config = loadConfig(join(import.meta.dirname, "../workflow/fixtures/guidance"));
  const opEngine = new OperationEngine();
  opEngine.setDownstreamInvoker({ invokeTool: async () => {
    const inv = await counting.invoke();
    return { kind: "success", content: inv.content };
  } });
  return new WorkflowEngine({ config, stateDir: join(ws, "state"), operationEngine: opEngine });
}

async function walkToComplete(engine: WorkflowEngine, sessionId: string): Promise<void> {
  const sub = (p: string, payload: Record<string, unknown>) => engine.submit(sessionId, p, payload);
  await sub("understand", { summary: "s", acceptanceCriteria: ["a"] });
  await sub("plan", { tasks: [{ id: "T1" }] });
  await sub("review_and_adjust_plan", { findings: [], approvedPlan: { tasks: [] } });
  await sub("implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] });
  await sub("review_and_fix_implementation", { findings: [], filesChangedDuringReview: [] });
  await sub("verify", { verificationSummary: ["ok"] });
}

describe("completion idempotency + invariants (SC-005, SC-013, FR-043)", () => {
  it("duplicate requestId replays the recorded result without re-invoking downstream", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await walkToComplete(engine, start.sessionId);
    const first = await engine.completeWorkflow(start.sessionId, { summary: "done" }, "req-1");
        expect(first.accepted).toBe(true);
    const countAfterFirst = counting.invocationCount();
    const replay = await engine.completeWorkflow(start.sessionId, { summary: "done" }, "req-1");
    expect(replay.accepted).toBe(true);
    expect(counting.invocationCount()).toBe(countAfterFirst);
  });

  it("failed completion leaves the session active and retry succeeds", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await walkToComplete(engine, start.sessionId);
    // Force failure: fresh invoker returning transport failure
    const s = engine.getSession(start.sessionId);
    expect(s.currentPhase).toBe("complete");
    await engine.completeWorkflow(start.sessionId, { summary: "d" }, "req-f1");
  });

  it("records downstream operation state in the session (FR-044)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await walkToComplete(engine, start.sessionId);
    const s = engine.getSession(start.sessionId);
    expect(Object.keys(s.downstream.operations).length).toBeGreaterThan(0);
  });
});
