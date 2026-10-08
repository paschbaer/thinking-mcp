/** GN-D1 engine-level contract tests: three-valued gate outcomes wired
 *  through the WorkflowEngine (guidance.json gitnexus.state read path) and
 *  the hybrid capability probe (declared state vs live availability,
 *  capability_state_deviation audit events, exactly-once per session).
 *
 *  The gitnexus downstream server points at an unreachable loopback port so
 *  transport failures are deterministic and fast (connection refused). */
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

const FIXTURE_SOURCE = join(import.meta.dirname, "fixtures/guidance");

let ws: string;
let configDir: string;

interface Scenario {
  declared?: "required" | "optional" | "off";
  opRequired: boolean;
  /** Where the gitnexus gate is bound (default beforeEnter). */
  placement?: "beforeEnter" | "afterEnter";
  /** Add a required noop process op alongside (afterEnter tests). */
  withRequiredNoop?: boolean;
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

function writeJson(p: string, v: unknown): void {
  writeFileSync(p, JSON.stringify(v));
}

function buildConfig(scenario: Scenario): void {
  cpSync(FIXTURE_SOURCE, configDir, { recursive: true });
  const main = readJson(join(configDir, "guidance.json"));
  if (scenario.declared) {
    main.gitnexus = { state: scenario.declared };
  }
  writeJson(join(configDir, "guidance.json"), main);
  // Fail-closed egress: an http downstream server requires an allowlist.
  const policies = readJson(join(configDir, "policies.json"));
  policies.egress = { httpHostAllowlist: ["127.0.0.1:9"] };
  writeJson(join(configDir, "policies.json"), policies);
  // Unreachable gitnexus server (loopback port 9 — connection refused).
  writeJson(join(configDir, "downstream-servers.json"), {
    version: 2,
    servers: {
      gitnexus: {
        displayName: "GitNexus",
        enabled: true,
        required: false,
        trustLevel: "trusted",
        transport: {
          type: "http",
          http: { url: "http://127.0.0.1:9/api/mcp" },
        },
        capabilities: {
          allow: { tools: ["check"], resources: [], prompts: [] },
        },
        connection: {
          startupTimeoutSeconds: 2,
          requestTimeoutSeconds: 5,
        },
      },
    },
  });
  // Single gitnexus mcpTool gate (+ optional noop) bound to understand.
  const ops: Record<string, unknown> = {
    "gitnexus-check": {
      description: "Verify the GitNexus index is queryable.",
      type: "mcpTool",
      server: "gitnexus",
      capability: "check",
      required: scenario.opRequired,
      timeoutSeconds: 10,
      riskClass: "read_only",
      arguments: { mode: "fixed", value: {} },
      validation: {
        protocolRequestMustSucceed: true,
        toolResultMustNotBeError: true,
      },
      output: { returnToAgent: "raw", retainRawResult: false },
    },
  };
  if (scenario.withRequiredNoop) {
    ops["noop"] = {
      description: "No-op required gate.",
      type: "process",
      executable: "node",
      args: ["-e", "process.exit(0)"],
      required: true,
      timeoutSeconds: 30,
      riskClass: "read_only",
      validation: {
        protocolRequestMustSucceed: true,
        exitCodeMustBeZero: true,
      },
      output: { returnToAgent: "summary_and_errors", retainRawResult: false },
    };
  }
  writeJson(join(configDir, "operations.json"), {
    version: 2,
    operations: ops,
  });
  const workflow = readJson(join(configDir, "workflow.json"));
  const phases = workflow.phases as Record<string, Record<string, unknown>>;
  const gateList = scenario.withRequiredNoop
    ? ["gitnexus-check", "noop"]
    : ["gitnexus-check"];
  phases.understand!.lifecycle =
    scenario.placement === "afterEnter"
      ? { afterEnter: gateList }
      : { beforeEnter: gateList };
  delete phases.understand!.afterEnter;
  delete phases.understand!.beforeEnter;
  writeJson(join(configDir, "workflow.json"), workflow);
}

function makeEngine(): WorkflowEngine {
  const config = loadConfig(configDir);
  return new WorkflowEngine({ config, stateDir: join(ws, "state") });
}

type EngineInternals = {
  probeCapabilityState: (sessionId: string) => Promise<void>;
  pingGitnexusServer: () => Promise<boolean | null>;
};

const deviationsOf = (engine: WorkflowEngine, sessionId: string) =>
  engine.audit
    .read(sessionId)
    .filter((e) => e.eventType === "capability_state_deviation");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "gnd1-ws-"));
  configDir = mkdtempSync(join(tmpdir(), "gnd1-cfg-"));
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

describe("three-valued gate outcomes through the engine (GN-D1)", () => {
  it("gitnexus.state=optional + unreachable server + non-required gate → skipped(capability-absent), session NOT blocked, no deviation event", async () => {
    buildConfig({ declared: "optional", opRequired: false });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () =>
      false;
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    expect(start.accepted).toBe(true);
    const gate = start.operations.find((o) => o.id === "gitnexus-check")!;
    expect(gate.status).toBe("skipped");
    expect(
      (gate as unknown as { warnings?: { code?: string }[] }).warnings,
    ).toEqual([expect.objectContaining({ code: "capability_absent_skipped" })]);
    const state = await engine.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    expect(deviationsOf(engine, start.sessionId)).toHaveLength(0);
  });

  it("gitnexus.state=required + unreachable server + REQUIRED gate → session blocked (fail-closed) + exactly one deviation event", async () => {
    buildConfig({ declared: "required", opRequired: true });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () =>
      false;
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const state = await engine.getWorkflowState(start.sessionId);
    expect(state.status).toBe("blocked");
    const gate = start.operations.find((o) => o.id === "gitnexus-check")!;
    expect(gate.status).toBe("failed");
    // Both detectors (probe + gate) share the once-per-session guard.
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    const deviations = deviationsOf(engine, start.sessionId);
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.data).toMatchObject({
      server: "gitnexus",
      configured: "required",
      live: "unreachable",
      kind: "required-unreachable",
    });
  });

  it("no gitnexus block (legacy config) + unreachable server → tolerated failure as before, no skip, no probe events", async () => {
    buildConfig({ opRequired: false });
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const gate = start.operations.find((o) => o.id === "gitnexus-check")!;
    expect(gate.status).toBe("failed");
    expect(
      (gate as unknown as { warnings?: { code?: string }[] }).warnings ?? [],
    ).toHaveLength(0);
    const state = await engine.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    expect(deviationsOf(engine, start.sessionId)).toHaveLength(0);
  });

  it("optional gate in afterEnter skipping does NOT trip the requiredFailed heuristic (session stays active)", async () => {
    buildConfig({
      declared: "optional",
      opRequired: false,
      placement: "afterEnter",
      withRequiredNoop: true,
    });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () =>
      false;
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const state = await engine.getWorkflowState(start.sessionId);
    expect(state.status).toBe("active");
    const gate = start.operations.find((o) => o.id === "gitnexus-check")!;
    expect(gate.status).toBe("skipped");
    const noop = start.operations.find((o) => o.id === "noop")!;
    expect(noop.status).toBe("succeeded");
  });
});

describe("hybrid capability probe (GN-D1)", () => {
  it("declared required + ping unreachable → one deviation event (probe source), not duplicated on re-probe", async () => {
    buildConfig({ declared: "required", opRequired: false });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () =>
      false;
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    const deviations = deviationsOf(engine, start.sessionId);
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.data).toMatchObject({
      kind: "required-unreachable",
      source: "probe",
    });
  });

  it("declared off + leftover reachable server entry → off-reachable deviation event", async () => {
    buildConfig({ declared: "off", opRequired: false });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () =>
      true;
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    const deviations = deviationsOf(engine, start.sessionId);
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.data).toMatchObject({
      kind: "off-reachable",
      configured: "off",
      live: "reachable",
    });
  });

  it("declared off + no server entry to ping → no event (clean off is undetectable by design)", async () => {
    buildConfig({ declared: "off", opRequired: false });
    // Remove the leftover server entry: nothing to ping. The gate still runs
    // (invoker not configured → tolerated failure, op is non-required).
    writeJson(join(configDir, "downstream-servers.json"), {
      version: 2,
      servers: {},
    });
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    expect(deviationsOf(engine, start.sessionId)).toHaveLength(0);
  });

  it("declared optional → probe never pings and never emits an event (unreachable is the expected skip case)", async () => {
    buildConfig({ declared: "optional", opRequired: false });
    const engine = makeEngine();
    let pings = 0;
    (engine as unknown as EngineInternals).pingGitnexusServer = async () => {
      pings += 1;
      return false;
    };
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    expect(pings).toBe(0);
    expect(deviationsOf(engine, start.sessionId)).toHaveLength(0);
  });

  it("probe failures never reject (best-effort contract)", async () => {
    buildConfig({ declared: "required", opRequired: false });
    const engine = makeEngine();
    (engine as unknown as EngineInternals).pingGitnexusServer = async () => {
      throw new Error("network stack exploded");
    };
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    await expect(
      (engine as unknown as EngineInternals).probeCapabilityState(
        start.sessionId,
      ),
    ).resolves.toBeUndefined();
  });

  it("REAL ping path (no stub): unreachable http server maps to a probe-source deviation event", async () => {
    buildConfig({ declared: "required", opRequired: false });
    const engine = makeEngine();
    const start = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    // No monkey-patch: the real pingGitnexusServer runs — http config
    // mapping, ensureReady handshake against 127.0.0.1:9 (connection
    // refused, fast) and the timeout race are all exercised.
    await (engine as unknown as EngineInternals).probeCapabilityState(
      start.sessionId,
    );
    const deviations = deviationsOf(engine, start.sessionId);
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.data).toMatchObject({
      kind: "required-unreachable",
      source: "probe",
      live: "unreachable",
    });
  });
});
