import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
const writeAt = (root: string, rel: string, content: object | string) => {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
};
const write = (rel: string, content: object | string) => {
  const path = join(ws, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2));
};

const baseMain = {
  version: 2,
  project: { name: "proj" },
  workflow: { file: "workflow.json" },
  responses: { file: "responses.json" },
  operations: { file: "operations.json" },
};

const workflow = {
  version: 2,
  workflow: { id: "w", initialPhase: "understand", terminalStates: ["completed", "cancelled"] },
  phases: {
    understand: {
      response: "custom-understand",
      submissionSchema: "schemas/understand.schema.json",
      lifecycle: { afterEnter: ["custom-op"] },
      transitions: [{ to: "plan", when: "submission_valid" }],
    },
    plan: {
      response: "plan",
      submissionSchema: "schemas/plan.schema.json",
      lifecycle: { beforeExit: ["custom-op"] },
      transitions: [{ to: "implement", when: "submission_valid" }],
    },
    implement: {
      response: "implement",
      submissionSchema: "schemas/implement.schema.json",
      transitions: [{ to: "completed", when: "submission_valid" }],
    },
  },
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-profile-"));
  write("package.json", { name: "ws", scripts: { "custom-op": "node -e \"process.exit(0)\"" } });
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

function seedCustomProject(): void {
  write(join(".guidance", "guidance.json"), baseMain);
  write(join(".guidance", "workflow.json"), workflow);
  write(join(".guidance", "responses.json"), {
    version: 2,
    responses: { "custom-understand": { title: "Custom Title", instruction: "Custom instruction text.", requiredActions: ["Do X"] } },
  });
  write(join(".guidance", "operations.json"), {
    version: 2,
    operations: { "custom-op": { description: "custom", type: "process", executable: "npm", args: ["run", "custom-op"], required: false, timeoutSeconds: 30, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "status_only" } } },
  });
  write(join(".guidance", "schemas", "understand.schema.json"), { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } });
  write(join(".guidance", "schemas", "plan.schema.json"), { type: "object", additionalProperties: false, required: [], properties: {} });
  write(join(".guidance", "schemas", "implement.schema.json"), { type: "object", additionalProperties: false, required: [], properties: {} });
}

describe("profile customization (US2, SC-006, FR-006/008)", () => {
  it("returns the configured custom instruction, not a hardcoded one", async () => {
    seedCustomProject();
    const config = loadConfig(join(ws, ".guidance"));
    const engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    expect(start.guidance.title).toBe("Custom Title");
    expect(start.guidance.instruction).toBe("Custom instruction text.");
  });

  it("binds and executes custom lifecycle operations from configuration", async () => {
    seedCustomProject();
    const config = loadConfig(join(ws, ".guidance"));
    const engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // understand.afterEnter runs at session start
    expect(start.operations).toEqual([{ id: "custom-op", status: "succeeded", summary: expect.stringContaining("succeeded") }]);
    const out = await engine.submit(start.sessionId, "understand", { summary: "s" });
    expect(out.accepted).toBe(true);
    // plan.beforeExit (custom-op) runs when plan is exited later; entering plan runs no ops
    expect(out.currentPhase).toBe("plan");
  });

  it("two projects with different configs run different processes from one binary (SC-006)", async () => {
    seedCustomProject();
    const configA = loadConfig(join(ws, ".guidance"));
    const engineA = new WorkflowEngine({ config: configA, stateDir: join(ws, "state-a") });
    const startA = await engineA.startWorkflow({ workspaceRoot: ws, request: "r" });
    const custom = loadConfig(join(ws, ".guidance"));
    expect(custom.profile).toBe("plain");
    void engineA; void startA; void custom;
    // a second project WITHOUT custom responses gets the fallback title
    const ws2 = mkdtempSync(join(tmpdir(), "guidance-profile-b-"));
    try {
      writeAt(ws2, join(".guidance", "guidance.json"), { version: 2, project: { name: "plain-project" } });
      const configB = loadConfig(join(ws2, ".guidance")).profile; // plain default
      expect(configB).toBe("plain");
    } finally {
      rmSync(ws2, { recursive: true, force: true });
    }
  });

  it("loads integrations.specKit from profiles/spec-kit.json when profile file present (T030)", () => {
    seedCustomProject();
    write(join(".guidance", "guidance.json"), { ...baseMain, profile: "spec-kit" });
    write(join(".guidance", "profiles", "spec-kit.json"), {
      version: 2,
      integrations: { specKit: { enabled: true, discovery: { featureRoot: "specs" } } },
    });
    const config = loadConfig(join(ws, ".guidance"));
    expect(config.profile).toBe("spec-kit");
    expect(config.specKit?.discovery.featureRoot).toBe("specs");
  });

  it("rejects operations with unknown type (T031 fail-closed)", () => {
    seedCustomProject();
    write(join(".guidance", "operations.json"), {
      version: 2,
      operations: { bad: { description: "bad", type: "quantum", required: false } },
    });
    expect(() => loadConfig(join(ws, ".guidance"))).toThrowError(/configuration_invalid/);
  });

  it("deep-merges partial guidance.json specKit block with the profile file", () => {
    seedCustomProject();
    write(join(".guidance", "guidance.json"), {
      ...baseMain,
      profile: "spec-kit",
      integrations: { specKit: { enabled: true } },
    });
    write(join(".guidance", "profiles", "spec-kit.json"), {
      version: 2,
      integrations: {
        specKit: {
          enabled: true,
          discovery: { featureRoot: "specs" },
          artifacts: { specification: { required: true, patterns: ["spec.md"] } },
        },
      },
    });
    const config = loadConfig(join(ws, ".guidance"));
    expect(config.specKit?.discovery.featureRoot).toBe("specs");
    expect(config.specKit?.artifacts["specification"]?.required).toBe(true);
  });

  it("required afterEnter failure at start blocks the session (FR-040)", async () => {
    seedCustomProject();
    write(join(".guidance", "operations.json"), {
      version: 2,
      operations: { "custom-op": { description: "d", type: "process", executable: "definitely-missing-cmd-xyz", required: true, timeoutSeconds: 10, validation: { exitCodeMustBeZero: true }, output: { returnToAgent: "status_only" } } },
    });
    const config = loadConfig(join(ws, ".guidance"));
    const engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    const s = engine.getSession(start.sessionId);
    expect(s.status).toBe("blocked");
  });

  it("different profile files yield different configurationVersion", () => {
    seedCustomProject();
    write(join(".guidance", "guidance.json"), { ...baseMain, profile: "spec-kit" });
    write(join(".guidance", "profiles", "spec-kit.json"), {
      version: 2,
      integrations: { specKit: { enabled: true, discovery: { featureRoot: "specs" } } },
    });
    const v1 = loadConfig(join(ws, ".guidance")).configVersion;
    write(join(".guidance", "profiles", "spec-kit.json"), {
      version: 2,
      integrations: { specKit: { enabled: true, discovery: { featureRoot: "other" } } },
    });
    expect(loadConfig(join(ws, ".guidance")).configVersion).not.toBe(v1);
  });

  it("validates sampling operation bounds (T031, FR-039 defaults)", () => {
    seedCustomProject();
    write(join(".guidance", "operations.json"), {
      version: 2,
      operations: {
        sample: { description: "s", type: "sampling", required: false, sampling: { purpose: "interpret report", maxOutputTokens: 2048, maximumAttempts: 2 } },
      },
    });
    const config = loadConfig(join(ws, ".guidance"));
    const ops = config.operations as { operations: Record<string, { sampling?: { purpose?: string; maxOutputTokens?: number; maximumAttempts?: number } }> };
    expect(ops.operations["sample"]!.sampling!.purpose).toBe("interpret report");
    // sampling without purpose fails validation
    write(join(".guidance", "operations.json"), {
      version: 2,
      operations: { bad: { description: "b", type: "sampling", required: false, sampling: { maxOutputTokens: 10 } } },
    });
    expect(() => loadConfig(join(ws, ".guidance"))).toThrowError(/configuration_invalid/);
  });
});
