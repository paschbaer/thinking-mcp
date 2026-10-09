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
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
      expect(stateB.currentPhase).toBe("understand");
      expect(stateB.status).toBe("active");
    } catch (e) {
      err = e;
    }
    expect(err).toBeUndefined();
  });
});

describe("CHFIX-9: pool sessions survive instance restarts (registry-only pool)", () => {
  it("a fresh instance engine re-resolves a workspace session after restart", async () => {
    // specs/014 pool topology: registry-only pool root + one registered
    // workspace with a full process config (second-workspace.test.ts pattern).
    const wsB = mkdtempSync(join(tmpdir(), "chfix9-wsb-"));
    const cfgDir = join(wsB, ".guidance");
    mkdirSync(cfgDir, { recursive: true });
    for (const f of [
      "workflow.json",
      "responses.json",
      "operations.json",
      "downstream-servers.json",
      "policies.json",
      "guidance.json",
    ] as const) {
      writeFileSync(join(cfgDir, f), readFileSync(join(configDir, f)));
    }
    mkdirSync(join(cfgDir, "schemas"), { recursive: true });
    for (const f of readdirSync(join(configDir, "schemas"))) {
      writeFileSync(
        join(cfgDir, "schemas", f),
        readFileSync(join(configDir, "schemas", f)),
      );
    }
    const poolRoot = mkdtempSync(join(tmpdir(), "chfix9-pool-"));
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
    writeFileSync(
      join(wsB, "package.json"),
      JSON.stringify({
        name: "wsb",
        scripts: {
          lint: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
        },
      }),
    );
    try {
      const engineA = new WorkflowEngine({
        config: loadConfig(join(poolRoot, ".guidance"), {
          workspaceRoot: poolRoot,
        }),
        stateDir: join(poolRoot, ".guidance", "state"),
      });
      const start = await engineA.startWorkflow({
        workspace: wsB,
        request: "pool-restart",
      });
      expect(start.accepted).toBe(true);

      // Restart: fresh instance engine, same registry on disk.
      const engineB = new WorkflowEngine({
        config: loadConfig(join(poolRoot, ".guidance"), {
          workspaceRoot: poolRoot,
        }),
        stateDir: join(poolRoot, ".guidance", "state"),
      });
      const state = await engineB.getWorkflowState(start.sessionId);
      expect(state.currentPhase).toBe("understand");
      expect(state.status).toBe("active");
    } finally {
      rmSync(wsB, { recursive: true, force: true });
      rmSync(poolRoot, { recursive: true, force: true });
    }
  });
});
