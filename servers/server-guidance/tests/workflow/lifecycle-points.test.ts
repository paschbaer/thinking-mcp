import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let stateDir: string;
let configDir: string;
const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-lc-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  for (const f of ["guidance.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(FIXTURE, "schemas", f)));
  }
});

function writeWorkflow(phases: Record<string, unknown>): void {
  writeFileSync(join(configDir, "workflow.json"), JSON.stringify({
    version: 2,
    workflow: { id: "w", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
    phases,
    states: { completed: { terminal: true }, blocked: { system: true }, cancelled: { terminal: true } },
  }, null, 2));
}

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine({ config: loadConfig(configDir), stateDir });
}

const schemas = () => {
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const name of ["understand", "plan", "review-plan", "implement", "review-implementation", "verify", "complete"]) {
    const exists = existsSync(join(configDir, "schemas", `${name}.schema.json`));
    if (!exists) {
      writeFileSync(join(configDir, "schemas", `${name}.schema.json`), JSON.stringify({ type: "object", additionalProperties: false, required: [], properties: {} }));
    }
  }
};

import { existsSync } from "node:fs";

describe("lifecycle points beforeEnter/afterExit (FR-008/FR-038, Review Finding 4)", () => {
  it("runs afterExit of the previous phase after the transition, results in operations[]", async () => {
    schemas();
    writeWorkflow({
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        lifecycle: { afterExit: ["goodbye-op"] },
        transitions: [{ to: "plan", when: "submission_valid" }],
      },
      plan: { response: "plan", transitions: [] },
    });
    writeFileSync(join(configDir, "operations.json"), JSON.stringify({
      version: 2,
      operations: { "goodbye-op": { description: "bye", type: "process", executable: "node", args: ["-e", "process.exit(0)"], required: false, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } } },
    }));
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const out = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(out.accepted).toBe(true);
    expect(out.operations?.some((o) => o.id === "goodbye-op" && o.status === "succeeded")).toBe(true);
  });

  it("required beforeEnter failure blocks the transition; session stays in previous phase", async () => {
    writeWorkflow({
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        transitions: [{ to: "plan", when: "submission_valid" }],
      },
      plan: {
        response: "plan",
        submissionSchema: "schemas/plan.schema.json",
        lifecycle: { beforeEnter: ["gate-op"] },
        transitions: [{ to: "implement", when: "submission_valid" }],
      },
      implement: { response: "implement", transitions: [] },
    });
    writeFileSync(join(configDir, "operations.json"), JSON.stringify({
      version: 2,
      operations: { "gate-op": { description: "gate", type: "process", executable: "node", args: ["-e", "process.stderr.write('gate says no'); process.exit(1)"], required: true, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } } },
    }));
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // understand→plan triggert plan.beforeEnter (gate-op, required) → blockiert
    const out = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(out.accepted).toBe(false);
    if (!out.accepted) {
      expect(out.error!.code).toBe("required_hook_failed");
      expect(out.currentPhase).toBe("understand"); // alte Phase bleibt
    }
    const state = await engine.getWorkflowState(start.sessionId);
    expect(state.currentPhase).toBe("understand");
    expect(state.downstream.operations["gate-op"]!.status).toBe("failed");
  });

  it("optional beforeEnter failure does not block the transition", async () => {
    writeWorkflow({
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        transitions: [{ to: "plan", when: "submission_valid" }],
      },
      plan: {
        response: "plan",
        submissionSchema: "schemas/plan.schema.json",
        lifecycle: { beforeEnter: ["optional-gate"] },
        transitions: [],
      },
    });
    writeFileSync(join(configDir, "operations.json"), JSON.stringify({
      version: 2,
      operations: { "optional-gate": { description: "g", type: "process", executable: "node", args: ["-e", "process.exit(1)"], required: false, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "summary_and_errors" } } },
    }));
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const out = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
    expect(out.operations?.some((o) => o.status === "failed")).toBe(true); // optional: Warning, nicht blockierend
  });

  it("required beforeEnter failure at session start blocks the new session (FR-040)", async () => {
    schemas();
    writeWorkflow({
      understand: {
        response: "understand",
        submissionSchema: "schemas/understand.schema.json",
        lifecycle: { beforeEnter: ["fail-op"] },
        transitions: [{ to: "plan", when: "submission_valid" }],
      },
      plan: { response: "plan", transitions: [] },
    });
    writeFileSync(join(configDir, "operations.json"), JSON.stringify({
      version: 2,
      operations: { "fail-op": { description: "f", type: "process", executable: "node", args: ["-e", "process.exit(1)"], required: true, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "status_only" } } },
    }));
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    expect(start.status).toBe("blocked");
    const s = await engine.getWorkflowState(start.sessionId);
    expect(s.status).toBe("blocked");
    expect(s.blockers.length).toBe(1);
  });
});
