/** specs/017 AC7 (FR-9/FR-3): per-workspace workflow registry in pool mode. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance");
const VARIANT_DIR = join(
  import.meta.dirname,
  "fixtures/guidance-speckit/workflows",
);
const VARIANT_SCHEMAS = join(
  import.meta.dirname,
  "fixtures/guidance-speckit/schemas/spec-kit",
);

let poolRoot: string;
let wsB: string;
let engine: WorkflowEngine;

function scaffoldFullConfig(dir: string, withVariant: boolean): void {
  const cfgDir = join(dir, ".guidance");
  mkdirSync(cfgDir, { recursive: true });
  for (const f of [
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(cfgDir, f), readFileSync(join(FIXTURE, f)));
  }
  writeFileSync(
    join(cfgDir, "guidance.json"),
    readFileSync(join(FIXTURE, "guidance.json")),
  );
  mkdirSync(join(cfgDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(cfgDir, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
  if (withVariant) {
    // The workspace carries its OWN workflows/ set (FR-9) — including its
    // base workflow.json that the $include references resolve against.
    mkdirSync(join(cfgDir, "workflows"), { recursive: true });
    writeFileSync(
      join(cfgDir, "workflows", "spec-kit-development.json"),
      readFileSync(join(VARIANT_DIR, "spec-kit-development.json")),
    );
    mkdirSync(join(cfgDir, "schemas", "spec-kit"), { recursive: true });
    for (const f of readdirSync(VARIANT_SCHEMAS)) {
      writeFileSync(
        join(cfgDir, "schemas", "spec-kit", f),
        readFileSync(join(VARIANT_SCHEMAS, f)),
      );
    }
  }
}

beforeEach(() => {
  poolRoot = mkdtempSync(join(tmpdir(), "guidance-pool-"));
  wsB = mkdtempSync(join(tmpdir(), "guidance-wsb-"));
  scaffoldFullConfig(wsB, true);
  // specs/014 pool mode: registry-only pool root that registers wsB — the
  // child engine composes from wsB/.guidance (its own workflows/ set).
  mkdirSync(join(poolRoot, ".guidance"), { recursive: true });
  writeFileSync(
    join(poolRoot, ".guidance", "guidance.json"),
    JSON.stringify(
      {
        version: 2,
        project: { name: "pool" },
        workspaces: [{ name: "ws-b", root: wsB }],
        state: { directory: "state", persistAfterEveryOperation: true },
      },
      null,
      2,
    ),
  );
  const config = loadConfig(join(poolRoot, ".guidance"), {
    workspaceRoot: poolRoot,
  });
  engine = new WorkflowEngine({
    config,
    stateDir: join(poolRoot, ".guidance", "state"),
  });
});

afterEach(() => {
  rmSync(poolRoot, { recursive: true, force: true });
  rmSync(wsB, { recursive: true, force: true });
});

describe("per-workspace workflow registry (specs/017 FR-9 / AC7)", () => {
  it("the second workspace can start the variant via its own workflows/ set", async () => {
    const res = await engine.startWorkflow({
      workspace: wsB,
      request: "r",
      workflowId: "spec-kit-development",
    });
    expect(res.accepted).toBe(true);
    expect(res.workflowId).toBe("spec-kit-development");
    expect(res.guidance?.instruction).toContain("/speckit-specify");
    // routing: the session lives on the child engine of wsB
    const state = await engine.getWorkflowState(res.sessionId);
    expect(state.workflowId).toBe("spec-kit-development");
  });

  it("a default (no workflowId) session in the second workspace stays standard-development", async () => {
    const res = await engine.startWorkflow({ workspace: wsB, request: "r" });
    expect(res.accepted).toBe(true);
    expect(res.workflowId).toBe("standard-development");
    expect(res.currentPhase).toBe("understand");
  });

  it("the registry-only pool root refuses to serve sessions itself", async () => {
    await expect(
      engine.startWorkflow({
        workspaceRoot: poolRoot,
        request: "r",
        workflowId: "spec-kit-development",
      }),
    ).rejects.toMatchObject({ code: "workspace_process_config_missing" });
  });
});
