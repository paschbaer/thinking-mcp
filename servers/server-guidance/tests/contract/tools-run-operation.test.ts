import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync as rf,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { workspaceLockFile } from "../../src/workflow/workspace-lock.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import type { NormalizedResult } from "../../src/types/index.js";

let ws: string;
let stateDir: string;
let configDir: string;

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");
const lockPath = (): string => workspaceLockFile(stateDir, ws);

function seededWorkspace(): void {
  ws = mkdtempSync(join(tmpdir(), "guidance-runop-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(configDir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
  writeFileSync(
    join(configDir, "workflow.json"),
    JSON.stringify({
      version: 2,
      workflow: {
        id: "runop-test",
        profile: "plain",
        initialPhase: "understand",
        terminalStates: ["completed", "cancelled"],
      },
      phases: {
        understand: {
          response: "understand",
          submissionSchema: "schemas/understand.schema.json",
          transitions: [{ to: "plan", when: "submission_valid" }],
        },
        plan: {
          response: "plan",
          submissionSchema: "schemas/plan.schema.json",
          transitions: [
            { to: "review_and_adjust_plan", when: "submission_valid" },
          ],
        },
        review_and_adjust_plan: {
          response: "review_and_adjust_plan",
          submissionSchema: "schemas/review-plan.schema.json",
          transitions: [{ to: "implement", when: "submission_valid" }],
        },
        implement: {
          response: "implement",
          submissionSchema: "schemas/implement.schema.json",
          transitions: [
            { to: "review_and_fix_implementation", when: "submission_valid" },
          ],
        },
        review_and_fix_implementation: {
          response: "review_and_fix_implementation",
          submissionSchema: "schemas/review-implementation.schema.json",
          transitions: [{ to: "verify", when: "submission_valid" }],
        },
        verify: {
          response: "verify",
          submissionSchema: "schemas/verify.schema.json",
          transitions: [
            { to: "complete", when: "required_operations_succeeded" },
          ],
        },
        complete: {
          response: "complete",
          submissionSchema: "schemas/complete.schema.json",
          transitions: [
            { to: "completed", when: "required_operations_succeeded" },
          ],
        },
      },
      states: {
        completed: { terminal: true },
        blocked: { system: true },
        cancelled: { terminal: true },
      },
    }),
  );
  writeFileSync(
    join(configDir, "operations.json"),
    JSON.stringify({
      version: 2,
      operations: {
        "invocable-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "console.log('hi')"],
          required: false,
          invocableByAgent: true,
          timeoutSeconds: 10,
          validation: { exitCodeMustBeZero: true },
          output: { returnToAgent: "summary_and_errors" },
        },
        "unmarked-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "console.log('nope')"],
          required: false,
          timeoutSeconds: 10,
          validation: { exitCodeMustBeZero: true },
          output: { returnToAgent: "summary_and_errors" },
        },
        "slow-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "setTimeout(()=>{process.exit(0)},3000)"],
          required: false,
          invocableByAgent: true,
          timeoutSeconds: 30,
          validation: { exitCodeMustBeZero: true },
          output: { returnToAgent: "summary_and_errors" },
        },
        "secret-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "console.log('api_key: sk-abc123deployment')"],
          required: false,
          invocableByAgent: true,
          timeoutSeconds: 10,
          validation: { exitCodeMustBeZero: true },
          output: { returnToAgent: "summary_and_errors" },
        },
        "content-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "console.log('hi')"],
          required: false,
          invocableByAgent: true,
          timeoutSeconds: 10,
          validation: { exitCodeMustBeZero: true },
          output: { returnToAgent: "raw" },
        },
        "bare-echo": {
          description: "d",
          type: "process",
          executable: "node",
          args: ["-e", "console.log('bare')"],
          required: false,
          invocableByAgent: true,
          timeoutSeconds: 10,
          validation: { exitCodeMustBeZero: true },
        },
      },
    }),
  );
}

/** Controllable fake OperationEngine for concurrency scenarios. */
function makeDeferredOpEngine(): {
  engine: OperationEngine;
  calls: () => string[];
  resolveAll: () => void;
} {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const engine = {
    execute: (config: { operationId: string }): Promise<NormalizedResult> => {
      calls.push(config.operationId);
      return gate.then(
        () =>
          ({
            operationId: config.operationId,
            capabilityType: "process",
            capabilityName: config.operationId,
            status: "succeeded",
            summary: `${config.operationId} succeeded`,
            data: {},
            content: [],
            warnings: [],
            errors: [],
            protocolMetadata: {},
            validated: true,
          }) as NormalizedResult,
      );
    },
  };
  return {
    engine: engine as unknown as OperationEngine,
    calls: () => calls,
    resolveAll: () => release?.(),
  };
}

function makeEngine(opEngine?: OperationEngine): WorkflowEngine {
  const config = loadConfig(configDir);
  return new WorkflowEngine({
    config,
    stateDir,
    ...(opEngine ? { operationEngine: opEngine } : {}),
  });
}

beforeEach(seededWorkspace);
afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("run_operation: on-demand invocation (spec 003 US1, FR-101..107)", () => {
  it("executes a marked operation through the engine and returns {id,status,summary}", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "invocable-echo");
    expect(res.id).toBe("invocable-echo");
    expect(res.status).toBe("succeeded");
    expect(typeof res.summary).toBe("string");
  });

  it("rejects unmarked operations fail-closed without executing (SC-002)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await expect(
      engine.runOperation(start.sessionId, "unmarked-echo"),
    ).rejects.toThrowError(/agent_invocation_denied/);
    const history = rf(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf-8",
    );
    // kein Execution-Event (operation_invoked), aber Denial wird auditiert (FR-103/SC-002)
    expect(history).not.toContain("operation_invoked");
    expect(history).toContain("operation_invocation_denied");
    expect(history).toContain("unmarked-echo");
  });

  it("rejects unknown operations and unknown sessions with existing error contracts", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await expect(
      engine.runOperation(start.sessionId, "nope"),
    ).rejects.toThrowError(/operation_not_configured/);
    await expect(
      engine.runOperation("session-does-not-exist", "invocable-echo"),
    ).rejects.toThrowError(/session_not_found/);
    // GDS-2: the error carries a recovery hint (hint only, no id listing)
    await expect(
      engine.runOperation("session-does-not-exist", "invocable-echo"),
    ).rejects.toThrowError(/start_workflow/);
  });

  it("records an operation_invoked audit event with the outcome (FR-103)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await engine.runOperation(start.sessionId, "invocable-echo");
    const history = rf(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf-8",
    );
    expect(history).toContain("operation_invoked");
    expect(history).toContain("invocable-echo");
  });

  it("per-session mutex (FR-107) and cross-session workspace lock (FR-109)", async () => {
    const { engine, resolveAll } = makeDeferredOpEngine();
    const e = makeEngine(engine);
    const a = await e.startWorkflow({ workspaceRoot: ws, request: "a" });
    const b = await e.startWorkflow({ workspaceRoot: ws, request: "b" });
    const first = e.runOperation(a.sessionId, "invocable-echo");
    await expect(
      e.runOperation(a.sessionId, "invocable-echo"),
    ).rejects.toThrowError(/operation_in_progress/);
    await expect(
      e.runOperation(b.sessionId, "invocable-echo"),
    ).rejects.toThrowError(/operation_in_progress/);
    resolveAll();
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
    // locks released afterwards
    await expect(
      e.runOperation(b.sessionId, "invocable-echo"),
    ).resolves.toMatchObject({ status: "succeeded" });
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
    await expect(
      e.runOperation(b.sessionId, "invocable-echo"),
    ).resolves.toMatchObject({ status: "succeeded" });
  });

  it("exposure: agent-facing result carries no raw op content (SC-004 seam via exposure)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "secret-echo");
    expect(JSON.stringify(res)).not.toContain("sk-abc123deployment");
  });

  it("GDS-4: forwards the complete downstream payload (content, data, warnings) for returnToAgent raw", async () => {
    const contentBearing = {
      execute: (config: { operationId: string }): Promise<NormalizedResult> =>
        Promise.resolve({
          operationId: config.operationId,
          capabilityType: "process",
          capabilityName: config.operationId,
          status: "succeeded",
          summary: "reasoning done",
          validated: true,
          data: { structured: { thoughtNumber: 1 } },
          content: [{ type: "text", text: "SEQUENTIAL-THINKING-PAYLOAD" }],
          warnings: [{ code: "demo", message: "advisory" }],
          errors: [],
          protocolMetadata: { structuredContent: { schema: "thought-v1" } },
        } as unknown as NormalizedResult),
    } as unknown as OperationEngine;
    const engine = makeEngine(contentBearing);
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "content-echo");
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain(
      "SEQUENTIAL-THINKING-PAYLOAD",
    );
    expect(res.data).toMatchObject({ structured: { thoughtNumber: 1 } });
    expect(res.structuredContent).toEqual({ schema: "thought-v1" });
    expect(res.warnings).toEqual([{ code: "demo", message: "advisory" }]);
  });

  it("GDS-4: returnToAgent summary_and_errors still strips content (SC-004 semantics preserved)", async () => {
    const contentBearing = {
      execute: (config: { operationId: string }): Promise<NormalizedResult> =>
        Promise.resolve({
          operationId: config.operationId,
          capabilityType: "process",
          capabilityName: config.operationId,
          status: "succeeded",
          summary: "done",
          validated: true,
          data: {},
          content: [{ type: "text", text: "SHOULD-NOT-LEAK" }],
          warnings: [],
          errors: [],
          protocolMetadata: {},
        } as unknown as NormalizedResult),
    } as unknown as OperationEngine;
    const engine = makeEngine(contentBearing);
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "secret-echo");
    expect(JSON.stringify(res)).not.toContain("SHOULD-NOT-LEAK");
    expect(res.content).toEqual([]);
  });

  it("GDS-5: missing output config defaults to raw (transparent proxy)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "bare-echo");
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("bare");
  });

  it("GDS-5: raw process operation carries capped+redacted stdout in content", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const res = await engine.runOperation(start.sessionId, "content-echo");
    expect(res.status).toBe("succeeded");
    expect(JSON.stringify(res.content)).toContain("hi");
  });

  it.skipIf(process.platform === "win32")(
    "hard-cancel kills a real running child, releases the lock (FR-202, SC-201)",
    async () => {
      const engine = makeEngine();
      const start = await engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
      });
      const marker = `guidance-liveness-${Math.random().toString(36).slice(2, 8)}`;
      writeFileSync(
        join(configDir, "operations.json"),
        JSON.stringify({
          version: 2,
          operations: {
            "invocable-echo": {
              description: "d",
              type: "process",
              executable: "node",
              args: [
                "-e",
                `console.log('${marker}'); setTimeout(()=>{process.exit(0)},30000)`,
              ],
              required: false,
              invocableByAgent: true,
              timeoutSeconds: 30,
              validation: { exitCodeMustBeZero: true },
              output: { returnToAgent: "summary_and_errors" },
            },
            "unmarked-echo": {
              description: "d",
              type: "process",
              executable: "node",
              args: ["-e", "console.log('nope')"],
              required: false,
              timeoutSeconds: 10,
              validation: { exitCodeMustBeZero: true },
              output: { returnToAgent: "summary_and_errors" },
            },
            "secret-echo": {
              description: "d",
              type: "process",
              executable: "node",
              args: ["-e", "console.log('api_key: sk-abc123deployment')"],
              required: false,
              invocableByAgent: true,
              timeoutSeconds: 10,
              validation: { exitCodeMustBeZero: true },
              output: { returnToAgent: "summary_and_errors" },
            },
          },
        }),
      );
      const config = loadConfig(configDir);
      const engine2 = new WorkflowEngine({ config, stateDir });
      const running = engine2.runOperation(start.sessionId, "invocable-echo");
      // L-2: poll until the child is visible in ps (robust against slow starts)
      const psContainsMarker = (): boolean =>
        (spawnSync("ps", ["ax"], { encoding: "utf8" }).stdout ?? "").includes(
          marker,
        );
      let visible = psContainsMarker();
      for (let i = 0; i < 25 && !visible; i++) {
        await new Promise((r) => setTimeout(r, 200));
        visible = psContainsMarker();
      }
      expect(visible).toBe(true);
      await engine2.cancelWorkflow(start.sessionId);
      const res = await running;
      expect(res.status).toBe("failed");
      expect(res.summary).toMatch(/cancel/i);
      // FR-503/SC-501: Child nach Cancel nicht mehr in der Prozessliste
      let gone = false;
      for (let i = 0; i < 10 && !gone; i++) {
        await new Promise((r) => setTimeout(r, 200));
        gone = !psContainsMarker();
      }
      expect(gone).toBe(true);
      // lock released + child dead: another session runs immediately
      const other = await engine.startWorkflow({
        workspaceRoot: ws,
        request: "b",
      });
      await expect(
        engine.runOperation(other.sessionId, "invocable-echo"),
      ).resolves.toMatchObject({ status: "succeeded" });
    },
    20_000,
  );

  it("real-process cross-session contention (FR-109/FR-203, R-006)", async () => {
    const engine = makeEngine();
    const a = await engine.startWorkflow({ workspaceRoot: ws, request: "a" });
    const b = await engine.startWorkflow({ workspaceRoot: ws, request: "b" });
    const first = engine.runOperation(a.sessionId, "slow-echo");
    await new Promise((r) => setTimeout(r, 400)); // child running
    await expect(
      engine.runOperation(b.sessionId, "slow-echo"),
    ).rejects.toThrowError(/operation_in_progress/);
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
    // after release, b can acquire
    await expect(
      engine.runOperation(b.sessionId, "invocable-echo"),
    ).resolves.toMatchObject({ status: "succeeded" });
  }, 20_000);

  it("cancel during composite op kills the child step (HIGH-2 regression, FR-202)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    // composite op mit langem Prozess-Step in die Config injizieren
    const opsPath = join(configDir, "operations.json");
    const ops = JSON.parse(readFileSync(opsPath, "utf8")) as {
      operations: Record<string, unknown>;
    };
    ops.operations["slow-composite"] = {
      description: "composite with a slow process step",
      type: "composite",
      strategy: "firstAvailable",
      required: false,
      invocableByAgent: true,
      timeoutSeconds: 30,
      steps: [
        {
          type: "process",
          executable: "node",
          args: ["-e", "setTimeout(()=>{process.exit(0)},30000)"],
        },
      ],
    };
    writeFileSync(opsPath, JSON.stringify(ops, null, 2));
    // Engine liest operations beim Start → neue Engine mit erweiterter Config
    const config = loadConfig(configDir);
    const engine2 = new WorkflowEngine({ config, stateDir });
    const running = engine2.runOperation(start.sessionId, "slow-composite");
    await new Promise((r) => setTimeout(r, 400)); // child started
    await engine2.cancelWorkflow(start.sessionId);
    const res = await running;
    expect(res.summary).toMatch(/cancel/i);
  }, 15_000);

  it("LR-2: router proxies unknown members to the downstream engine (robustness)", async () => {
    const downstreamCfgDir = join(ws, ".guidance-down");
    mkdirSync(downstreamCfgDir, { recursive: true });
    for (const f of [
      "guidance.json",
      "workflow.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
      "policies.json",
    ]) {
      writeFileSync(join(downstreamCfgDir, f), readFileSync(join(FIXTURE, f)));
    }
    writeFileSync(
      join(downstreamCfgDir, "downstream-servers.json"),
      JSON.stringify({
        version: 2,
        servers: {
          g: {
            enabled: true,
            transport: {
              type: "http",
              http: { url: "http://127.0.0.1:1/mcp" },
            },
          },
        },
      }),
    );
    writeFileSync(
      join(downstreamCfgDir, "policies.json"),
      JSON.stringify({
        version: 2,
        trustLevels: { trusted: { dataEgress: "project_data" } },
        egress: { httpHostAllowlist: ["127.0.0.1:1"] },
      }),
    );
    const config = loadConfig(downstreamCfgDir);
    const engine = new WorkflowEngine({
      config,
      stateDir: join(ws, "state-down"),
      clientOperationEngine: new (
        await import("../../src/orchestration/OperationEngine.js")
      ).OperationEngine(),
    } as never);
    const op = (
      engine as unknown as { operationEngine: Record<string, unknown> }
    ).operationEngine;
    expect(typeof op["setDownstreamInvoker"]).toBe("function"); // forwarded, bound
    expect(op["nonexistentMemberXyz"]).toBeUndefined();
    expect(typeof op["execute"]).toBe("function");
    expect(typeof op["executeRequired"]).toBe("function");
  });

  it("SC-503: different workspaces run invocable ops in parallel (R-008a)", async () => {
    const engine = makeEngine();
    const wsA = mkdtempSync(join(tmpdir(), "guidance-runop-wsA-"));
    try {
      const a = await engine.startWorkflow({
        workspaceRoot: wsA,
        request: "A",
      });
      const b = await engine.startWorkflow({ workspaceRoot: ws, request: "B" });
      const runA = engine.runOperation(a.sessionId, "slow-echo");
      await new Promise((r) => setTimeout(r, 400));
      // unterschiedliche Workspace-Roots → keine Cross-Workspace-Serialisierung
      await expect(
        engine.runOperation(b.sessionId, "invocable-echo"),
      ).resolves.toMatchObject({ status: "succeeded" });
      await expect(runA).resolves.toMatchObject({ status: "succeeded" });
    } finally {
      rmSync(wsA, { recursive: true, force: true });
    }
  }, 20_000);

  it("workspace lock files are cleaned up after runs (no residue, FR-502)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await engine.runOperation(start.sessionId, "invocable-echo");
    const residue = readdirSync(stateDir).filter(
      (f) => f.startsWith("workspace-ops") && f.endsWith(".lock"),
    );
    expect(residue).toEqual([]);
  });

  it("stale lock recovery (Review R-004): dead-owner lock is stolen, operation proceeds", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const lock = lockPath();
    writeFileSync(lock, "999999999"); // pid existiert nicht → tot
    await expect(
      engine.runOperation(start.sessionId, "invocable-echo"),
    ).resolves.toMatchObject({ status: "succeeded" });
    expect(existsSync(lock)).toBe(false); // regulär released nach dem Run
  });

  it("live owner is NEVER stolen (R-012c): fresh lock from a live pid → contention, lock intact", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const lock = lockPath();
    writeFileSync(lock, String(process.pid)); // lebender Owner, frische mtime
    await expect(
      engine.runOperation(start.sessionId, "invocable-echo"),
    ).rejects.toThrowError(/operation_in_progress/);
    expect(existsSync(lock)).toBe(true); // nicht gerausgenommen
    expect(readFileSync(lock, "utf8").trim()).toBe(String(process.pid));
    // aufräumen, damit afterEach sauber ist
    rmSync(lock);
  });

  it("WC-1-B (WC1B-F3): unconfigured tool on a wildcard server via closure yields recoverable authorization_required", async () => {
    // Wildcard-Server (stdio, executable wird NIE gespawnt: die Policy wirft
    // vor ensureReady). Allowlist tools:["*"] macht den Server wildcard.
    writeFileSync(
      join(configDir, "downstream-servers.json"),
      JSON.stringify({
        version: 2,
        servers: {
          wildcard: {
            displayName: "Wildcard",
            enabled: true,
            required: false,
            trustLevel: "trusted",
            transport: {
              type: "stdio",
              command: { executable: "never-spawned-mcp", args: [] },
            },
            capabilities: {
              allow: { tools: ["*"], resources: [], prompts: [] },
            },
            connection: { startupTimeoutSeconds: 1, requestTimeoutSeconds: 5 },
            environment: {
              inherit: false,
              variables: { PATH: { fromHost: "PATH" } },
            },
          },
        },
      }),
    );
    // Composite-Operation (Form des echten repository-analysis-Gates): ihr
    // mcpTool-Step hat server+capability, die Operation selbst nicht — genau
    // die Verdrahtung, die assertUnconfiguredWildcard im Closure treaten muss.
    const ops = JSON.parse(
      readFileSync(join(configDir, "operations.json"), "utf8"),
    );
    ops.operations["wildcard-probe"] = {
      description: "d",
      type: "composite",
      strategy: "firstAvailable",
      required: false,
      invocableByAgent: true,
      timeoutSeconds: 10,
      riskClass: "read_only",
      steps: [
        {
          type: "mcpTool",
          server: "wildcard",
          capability: "unlisted-tool",
          arguments: { mode: "fixed", value: {} },
        },
      ],
    };
    writeFileSync(join(configDir, "operations.json"), JSON.stringify(ops));

    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    // firstAvailable-Komposite(reportieren das Step-Failaged statt zu werfen —
    // exakt das Live-Bild des repository-analysis-Gates): status failed +
    // recoverable authorization_required mit Server-/Tool-Benennung.
    const res = await engine.runOperation(start.sessionId, "wildcard-probe");
    expect(res.status).toBe("failed");
    const messages = (res.errors ?? []).map((e) => e.message ?? "").join("\n");
    expect(messages).toContain("authorization_required");
    expect(messages).toContain("unlisted-tool");
    expect(messages).toContain("wildcard server");
    // Audit: die Operation wird registriert (operation_invoked, status failed) —
    // die Tool-Denial selbst findet vor jeder Downstream-Ausführung statt.
    const history = rf(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf-8",
    );
    expect(history).toContain("operation_invoked");
    expect(history).toContain('"status":"failed"');
  });
});
