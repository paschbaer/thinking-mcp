/** specs/017 AC1 + FR-1/FR-2/FR-9: workflow selection at session start. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { checkArtifactPattern } from "../../src/integrations/spec-kit/SpecKitEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance-speckit");

let ws: string;
let engine: WorkflowEngine;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ws-"));
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
  const config = loadConfig(FIXTURE);
  engine = new WorkflowEngine({ config, stateDir: join(ws, "state") });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("workflow selection (specs/017 FR-1/FR-2/FR-9)", () => {
  it("defaults to standard-development without workflowId (FR-2)", async () => {
    const res = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    expect(res.accepted).toBe(true);
    expect(res.workflowId).toBe("standard-development");
    expect(res.currentPhase).toBe("understand");
    const s = engine.getSession(res.sessionId);
    expect(s.specKit).toBeUndefined();
    const guidance = res.guidance?.instruction ?? "";
    expect(guidance).not.toContain("SPEC-KIT MODE");
  });

  it("starts the spec-kit variant with workflowId (AC1)", async () => {
    const res = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      workflowId: "spec-kit-development",
    });
    expect(res.accepted).toBe(true);
    expect(res.workflowId).toBe("spec-kit-development");
    expect(res.currentPhase).toBe("understand");
    const s = engine.getSession(res.sessionId);
    expect(s.workflowId).toBe("spec-kit-development");
    // US7: the guidance names the bound command and the variant.
    expect(res.guidance?.instruction).toContain("SPEC-KIT MODE");
    expect(res.guidance?.instruction).toContain("/speckit-specify");
  });

  it("fails closed on an unknown workflowId (F4)", async () => {
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
        workflowId: "does-not-exist",
      }),
    ).rejects.toMatchObject({ code: "workflow_not_found" });
  });

  it("fails closed on an invalid workflowId (path traversal guard)", async () => {
    await expect(
      engine.startWorkflow({
        workspaceRoot: ws,
        request: "r",
        workflowId: "../standard-development",
      }),
    ).rejects.toMatchObject({ code: "workflow_not_found" });
  });

  it("explicit workflowId equal to the boot id keeps the boot definition (FR-2)", async () => {
    const res = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
      workflowId: "standard-development",
    });
    expect(res.currentPhase).toBe("understand");
    const s = engine.getSession(res.sessionId);
    expect(engine["variantFor"](s)).toBeNull();
  });
});
