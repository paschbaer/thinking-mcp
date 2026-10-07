/** specs/017 Final#1: visible degradation when a variant definition file
 *  becomes unresolvable after session creation.
 *
 *  Registry-cache caveat: a LIVE engine serves its cached variant definition
 *  even after the file disappears — degradation is observable on a fresh
 *  engine instance sharing the session store, i.e. the realistic
 *  restart-after-config-change scenario. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

const FIXTURE_SOURCE = join(import.meta.dirname, "fixtures/guidance-speckit");

let ws: string;
let configDir: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ws-"));
  configDir = mkdtempSync(join(tmpdir(), "guidance-cfg-"));
  cpSync(FIXTURE_SOURCE, configDir, { recursive: true });
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

function makeEngine(): WorkflowEngine {
  const config = loadConfig(configDir);
  return new WorkflowEngine({ config, stateDir: join(ws, "state") });
}

const startVariant = (engine: WorkflowEngine) =>
  engine.startWorkflow({
    workspaceRoot: ws,
    request: "r",
    workflowId: "spec-kit-development",
  });

describe("variant degradation visibility (specs/017 Final#1)", () => {
  it("marks the session degraded and audits once when the variant file disappears", async () => {
    const engineA = makeEngine();
    const res = await startVariant(engineA);
    expect(res.workflowId).toBe("spec-kit-development");
    rmSync(join(configDir, "workflows", "spec-kit-development.json"));

    // Fresh engine (restart after config change) sharing the session store.
    const engineB = makeEngine();
    const state = await engineB.getWorkflowState(res.sessionId);
    expect(state.variantResolved).toBe(true);
    expect(state.variantDegraded).toBe(true);

    // Audit event emitted exactly once (second read does not duplicate).
    await engineB.getWorkflowState(res.sessionId);
    const events = engineB.audit
      .read(res.sessionId)
      .filter((e) => e.eventType === "variant_degraded");
    expect(events).toHaveLength(1);
    expect(events[0]?.data?.workflowId).toBe("spec-kit-development");

    // Guidance carries the degradation note.
    const guidance = engineB.guidanceForPublic(
      engineB.getSession(res.sessionId),
    );
    expect(guidance.instruction).toContain("VARIANT DEGRADED");
  });

  it("keeps corrupt variant files fail-closed (configuration_invalid)", async () => {
    const engineA = makeEngine();
    const res = await startVariant(engineA);
    writeFileSync(
      join(configDir, "workflows", "spec-kit-development.json"),
      "{ not json",
    );
    const engineB = makeEngine();
    // The state read flags the degradation; the next MUTATING path still
    // fails closed with the classified error.
    const state = await engineB.getWorkflowState(res.sessionId);
    expect(state.variantDegraded).toBe(true);
    await expect(
      engineB.submit(res.sessionId, "understand", { summary: "s" }),
    ).rejects.toMatchObject({ code: "configuration_invalid" });
  });

  it("keeps legacy workflowId labels silent (no flag, no event)", async () => {
    const engine = makeEngine();
    const res = await engine.startWorkflow({ workspaceRoot: ws, request: "r" });
    // Forge a legacy label directly on the persisted session (pre-017 shape).
    engine.sessions.update(res.sessionId, (s) => {
      s.workflowId = "some-legacy-chain-label";
      s.variantResolved = undefined;
    });
    const state = await engine.getWorkflowState(res.sessionId);
    expect(state.variantDegraded).toBeFalsy();
    expect(
      engine.audit
        .read(res.sessionId)
        .filter((e) => e.eventType === "variant_degraded"),
    ).toHaveLength(0);
  });
});
