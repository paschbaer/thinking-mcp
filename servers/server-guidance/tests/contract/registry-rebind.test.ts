import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type LoadedConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { SessionRepository } from "../../src/state/SessionRepository.js";

/** specs/015 US1 contract tests: AC-5 rebind semantics (addendum AC-13..17),
 *  registry_register gating/persistence (FR-1201..1210) and the AC-16
 *  successor-access routing regression (successor sessions were born-invalid
 *  when accessed through a fresh parent engine). */

const FIXTURE = join(import.meta.dirname, "../workflow/fixtures/guidance");

let root: string; // pool root (parent composition)
let ws: string; // workspace root (child composition, full process config)
let poolDir: string; // pool .guidance
let stateDir: string; // workspace state dir
let configDir: string; // workspace config dir

function copyFixture(target: string): void {
  mkdirSync(target, { recursive: true });
  for (const f of [
    "guidance.json",
    "workflow.json",
    "responses.json",
    "operations.json",
    "downstream-servers.json",
    "policies.json",
  ]) {
    writeFileSync(join(target, f), readFileSync(join(FIXTURE, f)));
  }
  mkdirSync(join(target, "schemas"), { recursive: true });
  for (const f of readdirSync(join(FIXTURE, "schemas"))) {
    writeFileSync(
      join(target, "schemas", f),
      readFileSync(join(FIXTURE, "schemas", f)),
    );
  }
}

function writePoolConfig(opts: { registerWs: boolean; flag?: boolean }): void {
  const workspaces = [
    { name: "default", root },
    ...(opts.registerWs ? [{ name: "ws", root: ws }] : []),
  ];
  writeFileSync(
    join(poolDir, "guidance.json"),
    JSON.stringify({
      version: 2,
      profile: "spec-kit",
      project: { name: "pool" },
      ...(workspaces.length > 0 ? { workspaces } : {}),
      ...(opts.flag !== undefined
        ? { registryRegister: { enabled: opts.flag } }
        : {}),
    }),
  );
}

function poolEngine(): WorkflowEngine {
  const config = loadConfig(poolDir, { workspaceRoot: root });
  return new WorkflowEngine({ config, stateDir: join(poolDir, "state") });
}

function wsEngine(): WorkflowEngine {
  const config: LoadedConfig = loadConfig(configDir, { workspaceRoot: ws });
  return new WorkflowEngine({ config, stateDir });
}

function touchConfig(): void {
  // valid mutation: append an operation (changes the composition hash)
  const ops = JSON.parse(
    readFileSync(join(configDir, "operations.json"), "utf8"),
  );
  ops.operations["extra-op"] = {
    description: "d",
    type: "process",
    executable: "node",
    args: ["-e", "console.log('x')"],
    required: false,
    timeoutSeconds: 5,
  };
  writeFileSync(join(configDir, "operations.json"), JSON.stringify(ops));
}

function breakConfig(): void {
  writeFileSync(join(configDir, "operations.json"), "{ not json");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rebind-pool-"));
  ws = join(root, "ws");
  poolDir = join(root, "pool", ".guidance");
  mkdirSync(poolDir, { recursive: true });
  configDir = join(ws, ".guidance");
  copyFixture(configDir); // workspace process config (full fixture)
  stateDir = join(configDir, "state");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("AC-5 rebind semantics (specs/015 addendum AC-13..17)", () => {
  it("AC-14/AC-17: an active session rebinds to the current configuration after a valid config change and audits session_rebound", async () => {
    writePoolConfig({ registerWs: false });
    const engine1 = wsEngine();
    const start = await engine1.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    touchConfig(); // config B (valid)
    const engine2 = wsEngine(); // composed against config B
    const state = await engine2.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    expect(state.configurationVersion).toBe(
      loadConfig(configDir, { workspaceRoot: ws }).configVersion,
    );
    const history = readFileSync(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf8",
    );
    expect(history).toContain("session_rebound");
  });

  it("AC-13: a completed session survives a config change without rebind", async () => {
    writePoolConfig({ registerWs: false });
    const engine1 = wsEngine();
    const start = await engine1.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const repo = new SessionRepository(join(stateDir, "sessions"));
    repo.update(start.sessionId, (s) => {
      s.status = "completed";
      s.completedAt = new Date().toISOString();
    });
    touchConfig();
    const engine2 = wsEngine();
    const state = await engine2.getWorkflowState(start.sessionId);
    expect(state.status).toBe("completed");
    const history = readFileSync(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf8",
    );
    expect(history).not.toContain("session_rebound");
  });

  it("AC-15: an active session fails closed when re-validation hits an invalid config", async () => {
    writePoolConfig({ registerWs: false });
    const engine1 = wsEngine();
    const start = await engine1.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    touchConfig(); // config B (valid) — the serving engine composes B
    const engine2 = wsEngine();
    breakConfig(); // config C (invalid) — re-validation must fail closed
    await expect(
      engine2.getWorkflowState(start.sessionId),
    ).rejects.toThrowError(/configuration_invalid|re-validation/);
  });
});

describe("registry_register (specs/015 US1, FR-1201..1210)", () => {
  it("is fail-closed when the flag is off (FR-1207 default)", async () => {
    writePoolConfig({ registerWs: false });
    const engine = poolEngine();
    await expect(
      engine.registerWorkspace({ name: "ws", root: ws }),
    ).rejects.toThrowError(/disabled/);
  });

  it("registers a root fail-closed: valid input persists + audits, invalid input leaves the registry untouched", async () => {
    writePoolConfig({ registerWs: false, flag: true });
    const engine = poolEngine();
    const before = readFileSync(join(poolDir, "guidance.json"), "utf8");
    await expect(
      engine.registerWorkspace({
        name: "bad",
        root: join(root, "does-not-exist"),
      }),
    ).rejects.toThrowError(/root does not exist/);
    expect(readFileSync(join(poolDir, "guidance.json"), "utf8")).toBe(before);
    const res = await engine.registerWorkspace({
      name: "ws",
      root: ws,
      projectName: "WS",
    });
    expect(res.registry).toContainEqual({
      name: "ws",
      root: ws,
      projectName: "WS",
    });
    const written = JSON.parse(
      readFileSync(join(poolDir, "guidance.json"), "utf8"),
    );
    expect(written.workspaces).toContainEqual({
      name: "ws",
      root: ws,
      projectName: "WS",
    });
    expect(res.configurationVersion).toBe(
      loadConfig(poolDir, { workspaceRoot: root }).configVersion,
    );
    const history = readFileSync(
      join(poolDir, "state", "history", "instance.jsonl"),
      "utf8",
    );
    expect(history).toContain("registry_changed");
  });

  it("remove: drops an unknown workspace with a recoverable error, a known one from the registry", async () => {
    writePoolConfig({ registerWs: true, flag: true });
    const engine = poolEngine();
    await expect(
      engine.registerWorkspace({ name: "nope", root: ws, remove: true }),
    ).rejects.toThrowError(/unknown workspace/);
    const res = await engine.registerWorkspace({
      name: "ws",
      root: ws,
      remove: true,
    });
    expect(res.registry).toHaveLength(1); // default entry remains
    expect(res.registry[0]!.name).toBe("default");
    expect(
      JSON.parse(readFileSync(join(poolDir, "guidance.json"), "utf8"))
        .workspaces,
    ).toHaveLength(1);
  });
});

describe("AC-16: workspace sessions survive access through a fresh parent engine", () => {
  it("a workspace session (successor access pattern) routed via probe composes/validates against its OWN workspace root", async () => {
    writePoolConfig({ registerWs: true });
    const parent = poolEngine();
    const start = await parent.startWorkflow({ workspace: "ws", request: "r" });
    const startState = await parent.getWorkflowState(start.sessionId);
    expect(startState.configurationVersion).toBe(
      loadConfig(configDir, { workspaceRoot: ws }).configVersion,
    );
    // Fresh parent instance = restart/routing-loss simulation (the production
    // successor access pattern): probe-routing must delegate the ENTIRE guard
    // to the workspace engine instead of applying the pool hash.
    const freshParent = poolEngine();
    const state = await freshParent.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    expect(state.configurationVersion).toBe(startState.configurationVersion);
    expect(
      existsSync(
        join(ws, ".guidance", "state", "sessions", `${start.sessionId}.json`),
      ),
    ).toBe(true);
  });

  it("review F1: removing a workspace purges stale session routes — the removed workspace's sessions are no longer served", async () => {
    writePoolConfig({ registerWs: true, flag: true });
    const parent = poolEngine();
    const start = await parent.startWorkflow({ workspace: "ws", request: "r" });
    expect((await parent.getWorkflowState(start.sessionId)).sessionId).toBe(
      start.sessionId,
    );
    await parent.registerWorkspace({ name: "ws", root: ws, remove: true });
    // Stale-route regression: pre-fix, the cached child engine kept serving
    // the removed workspace's session; now the purge forces a fail-closed
    // re-probe (the workspace is no longer registered).
    await expect(
      parent.getWorkflowState(start.sessionId),
    ).rejects.toThrowError();
  });

  it("review F2: a live long-lived engine recomposes on config drift and rebinds (no silent stale pass)", async () => {
    writePoolConfig({ registerWs: false });
    const engine1 = wsEngine();
    const start = await engine1.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    touchConfig(); // config drift on disk, SAME engine instance
    const state = await engine1.getWorkflowState(start.sessionId);
    expect(state.configurationVersion).toBe(
      loadConfig(configDir, { workspaceRoot: ws }).configVersion,
    );
    const history = readFileSync(
      join(stateDir, "history", `${start.sessionId}.jsonl`),
      "utf8",
    );
    expect(history).toContain("session_rebound");
  });

  it("FR-1208: onboarding without restart — registerWorkspace then startWorkflow in the new workspace", async () => {
    writePoolConfig({ registerWs: false, flag: true });
    const parent = poolEngine();
    const res = await parent.registerWorkspace({ name: "ws", root: ws });
    expect(res.registry).toContainEqual({ name: "ws", root: ws });
    const start = await parent.startWorkflow({ workspace: "ws", request: "r" });
    const state = await parent.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    // The session binds the WORKSPACE composition (repo config), not the pool
    // composition — different hashes by design (specs/014 composition v2).
    expect(state.configurationVersion).toBe(
      loadConfig(configDir, { workspaceRoot: ws }).configVersion,
    );
  });
});
