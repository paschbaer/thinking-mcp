/**
 * FR-053 approval gate (REV-US2-F1 rework) + REV-F2F3F4-1 warnings
 * pass-through + REV-F053-1 all-or-nothing hook lists:
 * - The approval decision resolves from policies.approvals (defaults:
 *   destructive/credential_sensitive → 'require' (interactive ceremony via
 *   report_blocker + resume 'approve <operation-id>', one-shot
 *   success-based grants); workspace_write/external_write/read_only →
 *   'allow' (unattended operation).
 * - Op-by-op lifecycle hook lists validate the WHOLE list before any op
 *   executes (all-or-nothing); consumption stays success-based per op.
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

const FIXTURE = join(import.meta.dirname, "fixtures/guidance");

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

/** Copies the fixture into ws/.guidance and sets policies.approvals — for
 *  tests that need the interactive ceremony ('require') instead of the
 *  unattended default. */
function useRequirePolicy(): void {
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
  const policiesPath = join(dir, "policies.json");
  const policies = JSON.parse(readFileSync(policiesPath, "utf8"));
  policies.approvals = { workspace_write: "require" };
  writeFileSync(policiesPath, JSON.stringify(policies));
  config = loadConfig(dir, { workspaceRoot: ws });
  config.chain = { enabled: true, maxChainDepth: 8, maxStepsPerManifest: 16 };
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

describe("FR-053 approval policy (REV-US2-F1 rework)", () => {
  it("DEFAULT: workspace_write ops run unattended (no grant, no denial)", async () => {
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const result = await engine.runOperation(start.sessionId, "build");
    expect(result.status).toBe("succeeded");
  });

  it("policies.approvals { workspace_write: 'require' } gates the op; the ceremony grants a one-shot execution", async () => {
    useRequirePolicy();
    makeEngine();

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

  it("lifecycle path: with 'require' policy a workspace_write verify gate fails the submit and completes after the ceremony", async () => {
    useRequirePolicy();
    makeEngine();

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
    // gate (require); the throw aborts with the phase parked on verify.
    await expect(
      sub("verify", { verificationSummary: ["ok"] }),
    ).rejects.toThrowError(/authorization_required|FR-053/);
    expect((await engine.getSession(sid)).currentPhase).toBe("verify");

    grant(sid, "build");
    grant(sid, "repository-analysis");
    await sub("verify", { verificationSummary: ["ok"] });
    expect((await engine.getSession(sid)).currentPhase).toBe("complete");
  });

  it("read_only ops are unaffected by the gate (default and require policy)", async () => {
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const result = await engine.runOperation(start.sessionId, "lint");
    expect(result.status).toBe("succeeded");
  });

  it("config validation fails closed on unknown approvals classes and values", () => {
    const writeBad = (dir: string, policies: object): void => {
      mkdirSync(join(dir, "schemas"), { recursive: true });
      for (const f of readdirSync(FIXTURE, { withFileTypes: true })) {
        if (!f.isFile()) continue;
        if (f.name === "policies.json") {
          writeFileSync(join(dir, f.name), JSON.stringify(policies));
        } else {
          writeFileSync(join(dir, f.name), readFileSync(join(FIXTURE, f.name)));
        }
      }
      for (const f of readdirSync(join(FIXTURE, "schemas"))) {
        writeFileSync(
          join(dir, "schemas", f),
          readFileSync(join(FIXTURE, "schemas", f)),
        );
      }
    };

    const dir = join(ws, "bad-approvals-class");
    writeBad(dir, { version: 2, approvals: { teleportation: "allow" } });
    expect(() => loadConfig(dir, { workspaceRoot: ws })).toThrowError(
      /not a known risk class/,
    );

    const dir2 = join(ws, "bad-approvals-value");
    writeBad(dir2, { version: 2, approvals: { destructive: "maybe" } });
    expect(() => loadConfig(dir2, { workspaceRoot: ws })).toThrowError(
      /must be "allow" or "require"/,
    );
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
 *  (gated)] with the 'require' policy — a denial on the LAST gated op must
 *  fire BEFORE any op of the list executes and must not burn the earlier
 *  gated op's grant. */
describe("REV-F053-1: lifecycle hook lists are all-or-nothing", () => {
  function wsGuidanceMultiGate(): string {
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
    const wf = JSON.parse(readFileSync(join(dir, "workflow.json"), "utf8"));
    wf.phases.plan.lifecycle = {
      ...wf.phases.plan.lifecycle,
      beforeEnter: ["query-project-insights", "build", "repository-analysis"],
    };
    const policiesPath = join(dir, "policies.json");
    const policies = JSON.parse(readFileSync(policiesPath, "utf8"));
    policies.approvals = { workspace_write: "require" };
    writeFileSync(policiesPath, JSON.stringify(policies));
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

    await engine.submit(sid, "understand", {
      summary: "s",
      acceptanceCriteria: ["a"],
    });
    const history = readFileSync(
      join(ws, "state", "history", `${sid}.jsonl`),
      "utf8",
    );
    expect(history.match(/approval_consumed/g) ?? []).toHaveLength(2);
    const s = new SessionRepository(join(ws, "state", "sessions")).load(sid);
    expect(s.approvedOperations ?? []).toHaveLength(0);
  });
});
