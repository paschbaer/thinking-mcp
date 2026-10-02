/**
 * GDS-6 + CHAIN-Replay hardening:
 * - GDS-6: a successful retry_operation of the completion phase's hooks
 *   finalizes the workflow (status=completed, workflow_completed audit,
 *   completedAt, chain successor from the retained completion report) —
 *   previously the session wedged in status=active/phase=completed.
 * - CHAIN-Replay: a top-level request duplicating steps[0] is rejected
 *   fail-closed (configuration_invalid) at startWorkflow — step 0 would
 *   otherwise run twice (head + successor-0).
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

const FIXTURE = join(import.meta.dirname, "fixtures/guidance");

let ws: string;
let engine: WorkflowEngine;
let config: LoadedConfig;
let setAnalyzeFail: (fail: boolean) => void;

/** Workspace-local process config: repository-analysis as a composite of
 *  TWO mcpTool steps (both driven by the counting invoker) so the first
 *  completion attempt deterministically fails even though the gitnexus CLI
 *  is on PATH (the fixture's process fallback would succeed in WSL). */
function wsGuidance(): string {
  const dir = join(ws, ".guidance");
  mkdirSync(join(dir, "schemas"), { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(dir, f), readFileSync(join(FIXTURE, f)));
  }
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(dir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
  const ops = JSON.parse(readFileSync(join(dir, "operations.json"), "utf8"));
  ops.operations["repository-analysis"].steps = [
    {
      type: "mcpTool",
      server: "gitnexus",
      capability: "analyze",
      arguments: { mode: "fixed", value: { noStats: true } },
    },
    {
      type: "mcpTool",
      server: "insight",
      capability: "analyze",
      arguments: {
        mode: "template",
        value: { query: "q", scope: "s" },
      },
    },
  ];
  writeFileSync(join(dir, "operations.json"), JSON.stringify(ops));
  return dir;
}

function makeEngine(): {
  engine: WorkflowEngine;
  setAnalyzeFail: (fail: boolean) => void;
} {
  let failAnalyze = true;
  const opEngine = new OperationEngine();
  opEngine.setDownstreamInvoker({
    invokeTool: async (_serverId, toolName) => {
      if (failAnalyze && toolName === "analyze") {
        return { kind: "transport" as const, message: "simulated outage" };
      }
      return { kind: "success" as const, content: [] };
    },
  });
  const engine = new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
    operationEngine: opEngine,
  });
  return { engine, setAnalyzeFail: (fail) => (failAnalyze = fail) };
}

function newEngine(): void {
  ({ engine, setAnalyzeFail } = makeEngine());
}

function chainOn(): void {
  config.chain = { enabled: true, maxChainDepth: 8, maxStepsPerManifest: 16 };
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-retry-finalize-"));
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
  config = loadConfig(wsGuidance(), { workspaceRoot: ws });
  engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

async function walkToVerify(sessionId: string): Promise<void> {
  // FR-053: pre-grant the fixture's gated ops (build, repository-analysis);
  // the approval gate itself is covered in approval-gate.test.ts.
  new SessionRepository(join(ws, "state", "sessions")).update(
    sessionId,
    (s) => {
      s.approvedOperations ??= [];
      s.approvedOperations.push("build", "repository-analysis");
    },
  );
  const sub = (p: string, payload: Record<string, unknown>) =>
    engine.submit(sessionId, p, payload);
  await sub("understand", { summary: "s", acceptanceCriteria: ["a"] });
  await sub("plan", { tasks: [{ id: "T1" }] });
  await sub("review_and_adjust_plan", {
    findings: [],
    approvedPlan: { tasks: [] },
  });
  await sub("implement", { implementedTasks: ["T1"], changedFiles: ["a.ts"] });
  await sub("review_and_fix_implementation", {
    findings: [],
    filesChangedDuringReview: [],
  });
  await sub("verify", { verificationSummary: ["ok"] });
}

describe("GDS-6: retry_operation finalizes a wedged completion", () => {
  it("hook-fail → retry-success → status completed + workflow_completed audit + completedAt; replay returns workflow_already_completed", async () => {
    newEngine();
    const s = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await walkToVerify(s.sessionId);

    const failed = await engine.completeWorkflow(s.sessionId, {
      summary: "done",
    });
    expect(failed.accepted).toBe(false);
    setAnalyzeFail(false);
    const mid = await engine.getWorkflowState(s.sessionId);
    expect(mid.status).toBe("active");
    expect(mid.currentPhase).toBe("complete");

    const retry = await engine.retryOperations(s.sessionId);
    expect(retry.accepted).toBe(true);
    expect(retry.status).toBe("completed");
    expect(retry.currentPhase).toBe("completed");

    const done = await engine.getWorkflowState(s.sessionId);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTruthy();
    const history = readFileSync(
      join(ws, "state", "history", `${s.sessionId}.jsonl`),
      "utf8",
    );
    expect(history).toContain("workflow_completed");

    const replay = await engine.completeWorkflow(s.sessionId, {
      summary: "done again",
    });
    expect(replay.accepted).toBe(false);
    expect(JSON.stringify(replay.error)).toContain("already completed");
  });

  it("chained session: retry-finalize creates + activates the successor from the retained report", async () => {
    chainOn();
    newEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "HEAD-REQUEST",
      chain: {
        steps: [
          {
            request:
              "follow-up for ${chain.parentRequest} (summary: ${chain.completionSummary})",
          },
        ],
      },
    });
    await walkToVerify(head.sessionId);
    const failed = await engine.completeWorkflow(
      head.sessionId,
      { summary: "head summary" },
      "req-h1",
    );
    expect(failed.accepted).toBe(false);
    setAnalyzeFail(false);

    const retry = await engine.retryOperations(head.sessionId);
    expect(retry.accepted).toBe(true);
    expect(retry.status).toBe("completed");
    expect(retry.nextSessionId).toBeTruthy();
    expect(retry.chain?.[0]?.status).toBe("active");
    expect(retry.chain?.[0]?.request).toContain("head summary");

    const succ = await engine.getWorkflowState(retry.nextSessionId!);
    expect(succ.status).toBe("active");
    expect(succ.request).toContain("head summary");

    // requestId replay of the finalized completion returns the FINAL result.
    const replay = await engine.completeWorkflow(
      head.sessionId,
      { summary: "head summary" },
      "req-h1",
    );
    expect(replay.accepted).toBe(true);
    expect(replay.nextSessionId).toBe(retry.nextSessionId);
  });
});

describe("CHAIN-Replay: duplicate step-0 rejected fail-closed", () => {
  it("start_workflow rejects a top-level request that duplicates steps[0] (configuration_invalid)", async () => {
    chainOn();
    newEngine();
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "  fix the flaky test  ",
        chain: { steps: [{ request: "fix the flaky test" }] },
      }),
    ).rejects.toThrowError(/duplicates steps\[0\]/);
  });

  it("generic-context chains (request != steps[0]) remain valid", async () => {
    chainOn();
    newEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "HEAD-REQUEST",
      chain: { steps: [{ request: "fix the flaky test" }] },
    });
    expect(head.accepted).toBe(true);
    const state = await engine.getWorkflowState(head.sessionId);
    expect(state.chainSpec?.steps).toHaveLength(1);
    expect(state.request).toBe("HEAD-REQUEST");
  });
});
