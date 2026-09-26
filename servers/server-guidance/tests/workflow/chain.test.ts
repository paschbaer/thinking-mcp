/**
 * Amendment 002 — Workflow-Chaining (Spec §10 Must-Pass cases 1–11).
 * FR-110…FR-118: chain manifest validation, lazy successor creation,
 * template resolution, depth limit, Form B (spec_kit_tasks), crash-window
 * fail-closed ("activating"), pruning robustness (head-copy).
 */
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
import { loadConfig, type LoadedConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";

let ws: string;
let engine: WorkflowEngine;
let config: LoadedConfig;

const chainOn = (overrides?: Partial<LoadedConfig["chain"]>) => {
  config.chain = {
    enabled: true,
    maxChainDepth: 8,
    maxStepsPerManifest: 16,
    ...overrides,
  };
};

/** Engine with a stub downstream invoker so required mcpTool completion ops succeed. */
function makeEngine(
  specKitTasks?: ConstructorParameters<
    typeof WorkflowEngine
  >[0]["specKitTasks"],
): WorkflowEngine {
  const opEngine = new OperationEngine();
  opEngine.setDownstreamInvoker({
    invokeTool: async () => ({ kind: "success" as const, content: [] }),
  });
  return new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
    operationEngine: opEngine,
    specKitTasks,
  });
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-chain-"));
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
  engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

/** Walks a session from understand to verify (ready for complete_workflow). */
async function walkToVerify(sessionId: string): Promise<void> {
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

describe("Amendment 002: workflow chaining", () => {
  it("§10.1 Form A happy path: 2 steps → nextSessionId per completion, silent end, 2x chain_successor_created", async () => {
    chainOn();
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "HEAD-REQUEST",
      chain: {
        steps: [
          {
            request:
              "fix tests for ${chain.parentRequest} (summary: ${chain.completionSummary})",
          },
          { request: "regression review of ${chain.changedFiles}" },
        ],
      },
    });
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(
      head.sessionId,
      { summary: "head done" },
      "req-c1",
    );
    expect(c1.accepted).toBe(true);
    expect(c1.nextSessionId).toBeTruthy();
    expect(c1.chain).toEqual([
      {
        sessionId: c1.nextSessionId!,
        request: expect.stringContaining("HEAD-REQUEST"),
        status: "active",
      },
    ]);
    // audit: chain_successor_created on the head
    const headAudit = readFileSync(
      join(ws, "state", "history", `${head.sessionId}.jsonl`),
      "utf-8",
    );
    expect(headAudit).toContain("chain_successor_created");
    // replay (requestIds idempotency) must NOT create a second successor
    const replay = await engine.completeWorkflow(
      head.sessionId,
      { summary: "head done" },
      "req-c1",
    );
    expect(replay.accepted).toBe(true);
    expect(replay.nextSessionId).toBe(c1.nextSessionId);
    expect(engine.getSession(c1.nextSessionId!).chainFrom).toBe(head.sessionId);
    // successor 1 → completion → successor 2 (rest chain copied, chainUpNext advanced)
    await walkToVerify(c1.nextSessionId!);
    const s1 = engine.getSession(c1.nextSessionId!);
    expect(s1.chainIndex).toBe(1);
    expect(s1.chainSpec?.steps).toHaveLength(2);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s1 done",
    });
    expect(c2.nextSessionId).toBeTruthy();
    expect(engine.getSession(c2.nextSessionId!).request).toContain("a.ts");
    // successor 2: chain exhausted → silent end (no nextSessionId/chain)
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s2 done",
    });
    expect(c3.accepted).toBe(true);
    expect(c3.nextSessionId).toBeUndefined();
    expect(c3.chain).toBeUndefined();
  });

  it("§10.2 unresolved template variable: no successor created, predecessor stays completed, chain_failed audited", async () => {
    chainOn();
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "broken ${chain.doesNotExist}" }] },
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c.accepted).toBe(true);
    expect(engine.getSession(head.sessionId).status).toBe("completed");
    expect(c.nextSessionId).toBeUndefined();
    expect(c.chain?.[0]?.status).toBe("failed");
    expect(c.chain?.[0]?.error).toContain("chain_template_unresolved");
    const audit = readFileSync(
      join(ws, "state", "history", `${head.sessionId}.jsonl`),
      "utf-8",
    );
    expect(audit).toContain("chain_failed");
    expect(audit).toContain("chain_template_unresolved");
  });

  it("§10.3 blocked successor (FR-040 path): successor blocked, predecessor stays completed", async () => {
    // fixture copy with a required beforeEnter op on understand that SUCCEEDS
    // on the 1st invocation (head start) and FAILS on the 2nd (successor start)
    const cfgDir = join(ws, "cfg");
    cpSync(join(import.meta.dirname, "fixtures/guidance"), cfgDir, {
      recursive: true,
    });
    const ops = JSON.parse(
      readFileSync(join(cfgDir, "operations.json"), "utf-8"),
    );
    ops.operations["fail-on-second"] = {
      description: "d",
      type: "mcpTool",
      server: "stub",
      capability: "probe",
      required: true,
      timeoutSeconds: 10,
      riskClass: "read_only",
      validation: {
        protocolRequestMustSucceed: true,
        toolResultMustNotBeError: true,
      },
      output: { returnToAgent: "summary_and_errors" },
    };
    writeFileSync(
      join(cfgDir, "operations.json"),
      JSON.stringify(ops, null, 2),
    );
    const wf = JSON.parse(readFileSync(join(cfgDir, "workflow.json"), "utf-8"));
    wf.phases.understand.lifecycle = { beforeEnter: ["fail-on-second"] };
    writeFileSync(join(cfgDir, "workflow.json"), JSON.stringify(wf, null, 2));
    config = loadConfig(cfgDir);
    chainOn();
    let probeCalls = 0;
    const opEngine = new OperationEngine();
    opEngine.setDownstreamInvoker({
      invokeTool: async (_serverId: string, toolName: string) => {
        if (toolName !== "probe")
          return { kind: "success" as const, content: [] }; // completion gates pass
        probeCalls += 1;
        if (probeCalls >= 2)
          return {
            kind: "transport" as const,
            message: "second activation fails",
          };
        return { kind: "success" as const, content: [] };
      },
    });
    engine = new WorkflowEngine({
      config,
      stateDir: join(ws, "state"),
      operationEngine: opEngine,
    });
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }] },
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c.accepted).toBe(true);
    expect(c.nextSessionId).toBeTruthy();
    expect(c.chain?.[0]?.status).toBe("blocked");
    expect(engine.getSession(head.sessionId).status).toBe("completed"); // FR-115: no rollback
    const succ = engine.getSession(c.nextSessionId!);
    expect(succ.status).toBe("blocked");
    expect(
      succ.blockers.some((b) => b.category === "required_operation_failed"),
    ).toBe(true);
  });

  it("§10.4 depth limit: chain_depth_exceeded when chainIndex reaches maxChainDepth (FR-111)", async () => {
    chainOn({ maxChainDepth: 2 });
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: {
        steps: [
          { request: "step-1" },
          { request: "step-2" },
          { request: "step-3" },
        ],
      },
    });
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" }); // idx 1
    expect(c1.nextSessionId).toBeTruthy();
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    }); // idx 2
    expect(c2.nextSessionId).toBeTruthy();
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s",
    }); // idx 3 > max 2
    expect(c3.nextSessionId).toBeUndefined();
    expect(c3.chain?.[0]?.error).toContain("chain_depth_exceeded");
  });

  it("§10.5 Form B in plain profile rejected (FR-112 rev.)", async () => {
    chainOn();
    engine = makeEngine();
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
        chain: {
          source: "spec_kit_tasks",
          requestTemplate: "do ${chain.taskId}",
        },
      }),
    ).rejects.toThrow(/spec-kit profile/);
  });

  it("§10.6 feature gate: chain disabled (default) → configuration_invalid (FR-110)", async () => {
    // config.chain stays undefined → defaults to enabled:false
    engine = makeEngine();
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
        chain: { steps: [{ request: "s" }] },
      }),
    ).rejects.toThrow(/disabled/);
  });

  it("§10.7+8 Form B happy path: task-derived chain, scope annex, silent end when exhausted (FR-117/118)", async () => {
    chainOn();
    config.profile = "spec-kit"; // test seam: Form B requires the spec-kit profile
    const pending = [
      {
        id: "T001",
        title: "First task",
        featureId: "001-feat",
        status: "pending",
      },
      {
        id: "T002",
        title: "Second task",
        featureId: "001-feat",
        status: "pending",
      },
      {
        id: "T003",
        title: "Third task",
        featureId: "001-feat",
        status: "pending",
      },
    ];
    engine = makeEngine(() => pending.map((t) => ({ ...t })));
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "feature work",
      chain: {
        source: "spec_kit_tasks",
        requestTemplate:
          "Execute task ${chain.taskId} (${chain.taskTitle}) of feature ${chain.featureId}",
        featureId: "001-feat",
      },
    });
    expect(head.accepted).toBe(true);
    // step 1 → T001
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c1.nextSessionId).toBeTruthy();
    const s1 = engine.getSession(c1.nextSessionId!);
    expect(s1.chainTaskScope).toEqual({
      taskId: "T001",
      featureId: "001-feat",
    });
    expect(s1.request).toContain("T001");
    expect(s1.chainSpec?.chainedTaskIds).toEqual(["T001"]);
    // FR-118: scope annex in EVERY phase guidance of the successor
    const guid = engine.guidanceForPublic(s1);
    expect(guid.instruction).toContain("CHAIN TASK SCOPE");
    expect(guid.instruction).toContain("T001");
    // step 2 → T002
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    });
    expect(engine.getSession(c2.nextSessionId!).chainTaskScope?.taskId).toBe(
      "T002",
    );
    // step 3 → T003
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s",
    });
    expect(engine.getSession(c3.nextSessionId!).chainTaskScope?.taskId).toBe(
      "T003",
    );
    // exhausted → silent end (FR-117), not an error (§10.8)
    await walkToVerify(c3.nextSessionId!);
    const c4 = await engine.completeWorkflow(c3.nextSessionId!, {
      summary: "s",
    });
    expect(c4.accepted).toBe(true);
    expect(c4.nextSessionId).toBeUndefined();
    expect(c4.chain).toBeUndefined();
  });

  it("§10.4b LOW-4 regression: steps.length == maxChainDepth ends SILENTLY, not chain_depth_exceeded", async () => {
    chainOn({ maxChainDepth: 2 });
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }, { request: "step-2" }] },
    });
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" }); // idx 1
    expect(c1.nextSessionId).toBeTruthy();
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    }); // idx 1 < steps.length → step-2 runs (depth allows chainIndex 1→2)
    expect(c2.nextSessionId).toBeTruthy();
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s",
    }); // chainUpNext 2 == steps.length → exhausted BEFORE depth gate
    expect(c3.nextSessionId).toBeUndefined();
    expect(c3.chain).toBeUndefined(); // silent end per Spec §3.2, NOT a depth failure
  });

  it("§10.7b MEDIUM-1 regression: Form-B featureId from the task list wins over absent manifest featureId", async () => {
    chainOn();
    config.profile = "spec-kit";
    const pending = [
      {
        id: "T001",
        title: "Only task",
        featureId: "001-from-tasks",
        status: "pending",
      },
    ];
    engine = makeEngine(() => pending.map((t) => ({ ...t })));
    // NO featureId in the manifest (schema: optional) — FR-117 must take the
    // candidate's featureId; previously the successor got featureId: "".
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "feature work",
      chain: {
        source: "spec_kit_tasks",
        requestTemplate:
          "Execute task ${chain.taskId} of feature ${chain.featureId}",
      },
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c.nextSessionId).toBeTruthy();
    const s1 = engine.getSession(c.nextSessionId!);
    expect(s1.chainTaskScope).toEqual({
      taskId: "T001",
      featureId: "001-from-tasks",
    });
    expect(s1.request).toContain("001-from-tasks");
  });

  it("§10.11b CHN-1 recovery happy path: retry_operation re-activates an 'activating' session", async () => {
    chainOn();
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }] },
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    // simulate crash between persistence and activation completion
    engine.sessions.update(c.nextSessionId!, (s) => {
      s.status = "activating";
    });
    await expect(engine.getWorkflowState(c.nextSessionId!)).rejects.toThrow();
    // documented recovery path now works
    const retry = await engine.retryOperations(c.nextSessionId!);
    expect(retry.accepted).toBe(true);
    expect(retry.status).toBe("active");
    expect(engine.getSession(c.nextSessionId!).status).toBe("active");
    const audit = readFileSync(
      join(ws, "state", "history", `${c.nextSessionId!}.jsonl`),
      "utf-8",
    );
    expect(audit).toContain("chain_activation_recovered");
  });

  it("§10.11c CHN-1 recovery fail path: failing activation leaves the session blocked with recoverable error", async () => {
    // probe op succeeds on probe calls 1-2 (head start, successor auto-activation)
    // and fails from call 3 on — so the manual retry (recovery) hits the failure
    const cfgDir = join(ws, "cfg");
    cpSync(join(import.meta.dirname, "fixtures/guidance"), cfgDir, {
      recursive: true,
    });
    const ops = JSON.parse(
      readFileSync(join(cfgDir, "operations.json"), "utf-8"),
    );
    ops.operations["fail-from-third"] = {
      description: "d",
      type: "mcpTool",
      server: "stub",
      capability: "probe",
      required: true,
      timeoutSeconds: 10,
      riskClass: "read_only",
      validation: {
        protocolRequestMustSucceed: true,
        toolResultMustNotBeError: true,
      },
      output: { returnToAgent: "summary_and_errors" },
    };
    writeFileSync(
      join(cfgDir, "operations.json"),
      JSON.stringify(ops, null, 2),
    );
    const wf = JSON.parse(readFileSync(join(cfgDir, "workflow.json"), "utf-8"));
    wf.phases.understand.lifecycle = { beforeEnter: ["fail-from-third"] };
    writeFileSync(join(cfgDir, "workflow.json"), JSON.stringify(wf, null, 2));
    config = loadConfig(cfgDir);
    chainOn();
    let probeCalls = 0;
    const opEngine = new OperationEngine();
    opEngine.setDownstreamInvoker({
      invokeTool: async (_serverId: string, toolName: string) => {
        if (toolName !== "probe")
          return { kind: "success" as const, content: [] };
        probeCalls += 1;
        if (probeCalls >= 3)
          return { kind: "transport" as const, message: "activation down" };
        return { kind: "success" as const, content: [] };
      },
    });
    engine = new WorkflowEngine({
      config,
      stateDir: join(ws, "state"),
      operationEngine: opEngine,
    });
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }] },
    });
    expect(head.status).toBe("active"); // probe call 1
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c.chain?.[0]?.status).toBe("active"); // probe call 2
    // crash-orphan the successor, then run the documented recovery → call 3 fails
    engine.sessions.update(c.nextSessionId!, (s) => {
      s.status = "activating";
    });
    const retry = await engine.retryOperations(c.nextSessionId!);
    expect(retry.accepted).toBe(false);
    expect(retry.status).toBe("blocked");
    expect(retry.error?.code).toBe("required_hook_failed");
    expect(retry.error?.recoverable).toBe(true);
    expect(engine.getSession(c.nextSessionId!).status).toBe("blocked");
    const failAudit = readFileSync(
      join(ws, "state", "history", `${c.nextSessionId!}.jsonl`),
      "utf-8",
    );
    expect(failAudit).toContain("chain_activation_recovered");
    expect(failAudit).toContain("hook_failed");
  });

  it("CHN-3 mixed manifest: explicit steps first, then task-derived (Form A → Form B)", async () => {
    chainOn();
    config.profile = "spec-kit";
    const pending = [
      {
        id: "T001",
        title: "Task one",
        featureId: "001-feat",
        status: "pending",
      },
      {
        id: "T002",
        title: "Task two",
        featureId: "001-feat",
        status: "pending",
      },
    ];
    engine = makeEngine(() => pending.map((t) => ({ ...t })));
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "feature work",
      chain: {
        steps: [{ request: "prep for ${chain.parentRequest}" }],
        source: "spec_kit_tasks",
        requestTemplate: "Execute task ${chain.taskId} (${chain.taskTitle})",
        featureId: "001-feat",
      },
    });
    expect(head.accepted).toBe(true);
    // phase 1: explicit step
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(engine.getSession(c1.nextSessionId!).request).toContain(
      "prep for feature work",
    );
    expect(engine.getSession(c1.nextSessionId!).chainUpNext).toBe(1);
    // phase 2: task-derived T001
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    });
    const s2 = engine.getSession(c2.nextSessionId!);
    expect(s2.request).toContain("T001");
    expect(s2.chainTaskScope?.taskId).toBe("T001");
    expect(s2.chainSpec?.chainedTaskIds).toEqual(["T001"]);
    // phase 3: task-derived T002
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s",
    });
    expect(engine.getSession(c3.nextSessionId!).chainTaskScope?.taskId).toBe(
      "T002",
    );
    // exhausted: steps done + no pending tasks → silent end
    await walkToVerify(c3.nextSessionId!);
    const c4 = await engine.completeWorkflow(c3.nextSessionId!, {
      summary: "s",
    });
    expect(c4.nextSessionId).toBeUndefined();
    expect(c4.chain).toBeUndefined();
  });

  it("CHN-3 HIGH-1 regression: Form B after 2 explicit steps does NOT re-enter Form A", async () => {
    chainOn();
    config.profile = "spec-kit";
    const pending = [
      {
        id: "T001",
        title: "Only task",
        featureId: "001-feat",
        status: "pending",
      },
    ];
    engine = makeEngine(() => pending.map((t) => ({ ...t })));
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "feature work",
      chain: {
        steps: [{ request: "step-one" }, { request: "step-two" }],
        source: "spec_kit_tasks",
        requestTemplate: "Execute task ${chain.taskId}",
        featureId: "001-feat",
      },
    });
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" }); // step-one
    expect(engine.getSession(c1.nextSessionId!).request).toContain("step-one");
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    }); // step-two
    expect(engine.getSession(c2.nextSessionId!).request).toContain("step-two");
    await walkToVerify(c2.nextSessionId!);
    const c3 = await engine.completeWorkflow(c2.nextSessionId!, {
      summary: "s",
    }); // T001
    expect(engine.getSession(c3.nextSessionId!).request).toContain("T001");
    await walkToVerify(c3.nextSessionId!);
    // T001 done, steps exhausted → SILENT end; must NOT re-run step-two (HIGH-1)
    const c4 = await engine.completeWorkflow(c3.nextSessionId!, {
      summary: "s",
    });
    expect(c4.nextSessionId).toBeUndefined();
    expect(c4.chain).toBeUndefined();
  });

  it("CHN-3 validation: manifest with neither steps nor source → configuration_invalid", async () => {
    chainOn();
    engine = makeEngine();
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
        chain: { source: undefined } as unknown as {
          steps: { request: string }[];
        },
      }),
    ).rejects.toThrow(/steps or source/);
  });

  it("§10.9 backward compatibility: sessions without chain fields load and complete unchanged", async () => {
    // chain NOT enabled → legacy behavior
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "legacy",
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c.accepted).toBe(true);
    expect(c.nextSessionId).toBeUndefined();
    const s = engine.getSession(head.sessionId);
    expect(s.chainSpec).toBeUndefined();
    expect(s.chainFrom).toBeUndefined();
  });

  it("§10.10 pruning robustness: head pruned, successor still completes and creates the next step (FR-114)", async () => {
    chainOn();
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }, { request: "step-2" }] },
    });
    await walkToVerify(head.sessionId);
    const c1 = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    expect(c1.accepted).toBe(true);
    // backdate deterministically — with maxAgeDays 0 the cutoff is Date.now(),
    // and a millisecond-equal completedAt would make the prune a no-op flake.
    engine.sessions.update(head.sessionId, (s) => {
      s.completedAt = new Date(Date.now() - 10_000).toISOString();
    });
    const pruned = engine.pruneFinishedSessions(0, "delete");
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(engine.sessions.exists(head.sessionId)).toBe(false);
    // successor carries the copied chain → completes and creates step-2
    await walkToVerify(c1.nextSessionId!);
    const c2 = await engine.completeWorkflow(c1.nextSessionId!, {
      summary: "s",
    });
    expect(c2.nextSessionId).toBeTruthy();
    expect(engine.getSession(c2.nextSessionId!).request).toBe("step-2");
  });

  it("§10.11 crash-window fix (Plan-Review F1): 'activating' sessions are fail-closed (chain_activation_incomplete)", async () => {
    chainOn();
    engine = makeEngine();
    const head = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      chain: { steps: [{ request: "step-1" }] },
    });
    await walkToVerify(head.sessionId);
    const c = await engine.completeWorkflow(head.sessionId, { summary: "s" });
    // simulate a crash between successor persistence and activation completion
    engine.sessions.update(c.nextSessionId!, (s) => {
      s.status = "activating";
    });
    expect(() => engine.getSession(c.nextSessionId!)).toThrowError(
      /chain_activation_incomplete|activation did not complete/,
    );
    await expect(engine.getWorkflowState(c.nextSessionId!)).rejects.toThrow();
    // simulated completed activation → session readable again
    engine.sessions.update(c.nextSessionId!, (s) => {
      s.status = "active";
    });
    expect(engine.getSession(c.nextSessionId!).status).toBe("active");
  });
});
