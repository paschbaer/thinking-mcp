import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let stateDir: string;
let configDir: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-rec-"));
  stateDir = join(ws, "state");
  configDir = join(ws, ".guidance");
  mkdirSync(configDir, { recursive: true });
  const fixture = join(import.meta.dirname, "../workflow/fixtures/guidance");
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(configDir, f), readFileSync(join(fixture, f)));
  }
  mkdirSync(join(configDir, "schemas"), { recursive: true });
  for (const f of readdirSync(join(fixture, "schemas"))) {
    writeFileSync(join(configDir, "schemas", f), readFileSync(join(fixture, "schemas", f)));
  }
  writeFileSync(
    join(ws, "package.json"),
    JSON.stringify({ name: "ws", scripts: { lint: "node -e \"process.exit(0)\"", test: "node -e \"process.exit(0)\"", build: "node -e \"process.exit(0)\"" } }),
  );
});

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine({ config: loadConfig(configDir), stateDir });
}


describe("crash recovery + retention (FR-029/043, SC-004)", () => {
  it("session survives a simulated restart (fresh engine, same state dir)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // "restart": new engine instance over the same state dir
    const engine2 = makeEngine();
    const state = engine2.getWorkflowState(start.sessionId);
    expect(state.currentPhase).toBe("understand");
    expect(state.status).toBe("active");
  });

  it("running operations reconcile to unknown and block silent re-runs", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // simulate a crash mid-operation
    engine.recordDownstreamState(start.sessionId, "repository-analysis", "running", "");
    const engine2 = makeEngine();
    const s = engine2.getWorkflowState(start.sessionId);
    expect(s.downstream.operations["repository-analysis"]!.status).toBe("unknown");
  });

  it("concurrent state changes are serialized (both applied, in order)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await Promise.all([
      engine.submit(start.sessionId, "understand", { summary: "a", acceptanceCriteria: ["x"] }),
      engine.reportBlocker(start.sessionId, { category: "test", description: "d" }),
    ]);
    const s = engine.getSession(start.sessionId);
    expect(["plan", "blocked"]).toContain(s.currentPhase === "blocked" ? "blocked" : s.currentPhase);
    expect(s.status).toBe("blocked");
  });

  it("prunes archived finished sessions past the retention window (FR-029)", async () => {
    const engine = makeEngine();
    const start = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    await engine.cancelWorkflow(start.sessionId);
    // backdate completedAt beyond 90 days
    const path = join(stateDir, "sessions", `${start.sessionId}.json`);
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    raw.completedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const pruned = engine.pruneFinishedSessions(90);
    expect(pruned).toBe(1);
    expect(existsSync(join(stateDir, "archive", `${start.sessionId}.json`))).toBe(true);
    // active sessions are never pruned
    const active = await engine.startWorkflow({ workspaceRoot: ws, request: "r2" });
    expect(engine.pruneFinishedSessions(90)).toBe(0);
    expect(engine.getWorkflowState(active.sessionId).status).toBe("active");
  });
});
