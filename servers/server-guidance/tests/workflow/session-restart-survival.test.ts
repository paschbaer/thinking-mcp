/**
 * CHFIX-9 regression: a session survives an engine restart — a fresh
 * WorkflowEngine instance over the same stateDir loads the persisted
 * session (SessionRepository is file-backed; no in-memory session map).
 * Pins the engine-level restart-survival contract. The 2026-10-08 live
 * session loss therefore originates ABOVE this layer (pool composition /
 * routing / MCP transport), not in session persistence itself.
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
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;
let configDir: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "chfix9-ws-"));
  configDir = mkdtempSync(join(tmpdir(), "chfix9-cfg-"));
  cpSync(join(import.meta.dirname, "fixtures/guidance"), configDir, {
    recursive: true,
  });
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
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

describe("CHFIX-9: sessions survive engine restarts (state on disk)", () => {
  it("second engine instance over the same stateDir", async () => {
    const config = loadConfig(configDir);
    const engineA = new WorkflowEngine({ config, stateDir: join(ws, "state") });
    const start = await engineA.startWorkflow({
      workspaceRoot: ws,
      request: "restart-repro",
    });
    expect(start.accepted).toBe(true);
    const stateA = await engineA.getWorkflowState(start.sessionId);
    expect(stateA.currentPhase).toBe("understand");

    // "Restart": a fresh engine over the SAME stateDir + config.
    const configB = loadConfig(configDir);
    const engineB = new WorkflowEngine({
      config: configB,
      stateDir: join(ws, "state"),
    });
    let err: unknown;
    try {
      const stateB = await engineB.getWorkflowState(start.sessionId);
      console.log(
        "RESTART-RESULT: loaded, phase =",
        stateB.currentPhase,
        "status =",
        stateB.status,
      );
    } catch (e) {
      err = e;
      console.log("RESTART-RESULT: REJECTED:", String(e));
    }
    expect(err).toBeUndefined();
  });
});
