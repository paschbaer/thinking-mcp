import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { WorkflowTools } from "../../src/mcp-server/ToolHandlers.js";

let ws: string;
let tools: WorkflowTools;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-tools-"));
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({ name: "ws", scripts: { lint: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"", build: "node -e \"process.exit(0)\"" } }),
  );
  const config = loadConfig(join(import.meta.dirname, "../workflow/fixtures/guidance"));
  tools = new WorkflowTools(new WorkflowEngine({ config, stateDir: join(ws, "state") }));
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("workflow tool handlers (FR-016)", () => {
  it("start_workflow returns accepted start result", async () => {
    const res = await tools.startWorkflow({ workspaceRoot: ws, request: "r" });
    expect(res.accepted).toBe(true);
  });

  it("get_current_guidance is read-only and idempotent", async () => {
    const start = (await tools.startWorkflow({ workspaceRoot: ws, request: "r" })) as { sessionId: string };
    const a = await tools.getCurrentGuidance(start.sessionId);
    const b = await tools.getCurrentGuidance(start.sessionId);
    expect(a).toEqual(b);
  });

  it("get_workflow_state returns the persisted session", async () => {
    const start = (await tools.startWorkflow({ workspaceRoot: ws, request: "r" })) as { sessionId: string };
    const state = await tools.getWorkflowState(start.sessionId);
    expect(state.currentPhase).toBe("understand");
  });
});
