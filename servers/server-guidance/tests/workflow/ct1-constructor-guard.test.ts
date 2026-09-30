/**
 * CT-1 regression: a schema-valid guidance.json that references operations
 * but NOT workflow.file (legitimate per FR-1101 for registry-only instances)
 * must fail closed with a classified `configuration_invalid` error when used
 * as a process config (registryOnly=false) — instead of an unguarded
 * TypeError from the WorkflowEngine constructor (unguarded dereference of
 * config.workflow at the former ~L281).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { GuidanceError } from "../../src/types/errors.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";

let ws: string;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ct1-guard-"));
  const fixtureDir = join(process.cwd(), "tests/workflow/fixtures/guidance");
  mkdirSync(join(ws, "schemas"), { recursive: true });
  for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
    writeFileSync(join(ws, f), readFileSync(join(fixtureDir, f), "utf8"));
  }
  for (const s of ["understand.schema.json"]) {
    writeFileSync(join(ws, "schemas", s), readFileSync(join(fixtureDir, "schemas", s), "utf8"));
  }
});

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

describe("CT-1: missing workflow.file fails closed as configuration_invalid", () => {
  it("constructor throws configuration_invalid (not TypeError) when operations.file is set but workflow.file is missing", () => {
    const guidance = JSON.parse(readFileSync(join(ws, "guidance.json"), "utf8"));
    delete guidance.workflow;
    writeFileSync(join(ws, "guidance.json"), JSON.stringify(guidance, null, 2));

    const config = loadConfig(ws);
    expect(config.registryOnly).toBe(false);
    expect(config.workflow).toBeUndefined();

    let caught: unknown;
    try {
      new WorkflowEngine({ config, stateDir: join(ws, "state") });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GuidanceError);
    const ge = caught as GuidanceError;
    expect(ge.code).toBe("configuration_invalid");
    expect(ge.message).toContain("workflow.file");
    expect(ge.recoverable).toBe(false);
  });

  it("guard also fires when the workflow key exists but has no file field", () => {
    const guidance = JSON.parse(readFileSync(join(ws, "guidance.json"), "utf8"));
    guidance.workflow = {}; // present-but-empty: no workflow.file either
    writeFileSync(join(ws, "guidance.json"), JSON.stringify(guidance, null, 2));

    // Either layer may reject this: loadConfig's referenced-file validation
    // (FR-1101) or the constructor guard — both must classify as
    // configuration_invalid, never a bare TypeError.
    let caught: unknown;
    try {
      const config = loadConfig(ws);
      expect(config.registryOnly).toBe(false);
      new WorkflowEngine({ config, stateDir: join(ws, "state") });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as { code?: string }).code).toBe("configuration_invalid");
  });

  it("registry-only config (no file refs at all) still constructs", () => {
    const guidance = JSON.parse(readFileSync(join(ws, "guidance.json"), "utf8"));
    for (const k of ["workflow", "responses", "operations", "downstreamServers", "policies"]) delete guidance[k];
    writeFileSync(join(ws, "guidance.json"), JSON.stringify(guidance, null, 2));

    const config = loadConfig(ws);
    expect(config.registryOnly).toBe(true);
    expect(() => new WorkflowEngine({ config, stateDir: join(ws, "state") })).not.toThrow();
  });

  it("full process config still constructs (happy path unchanged)", () => {
    const config = loadConfig(ws);
    expect(config.registryOnly).toBe(false);
    expect(() => new WorkflowEngine({ config, stateDir: join(ws, "state") })).not.toThrow();
  });
});
