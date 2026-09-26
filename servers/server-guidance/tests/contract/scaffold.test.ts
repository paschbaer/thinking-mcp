import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeApplication, ensureConfiguration } from "../../src/main.js";
import { scaffoldIfMissing } from "../../src/scaffold.js";

let ws: string;
let cfgDir: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-scaffold-"));
  cfgDir = join(ws, ".guidance");
  delete process.env.GUIDANCE_SCAFFOLD;
});
afterEach(() => {
  delete process.env.GUIDANCE_SCAFFOLD;
  rmSync(ws, { recursive: true, force: true });
});

describe("scaffold-on-first-start (Option D)", () => {
  it("scaffolds a complete valid configuration when guidance.json is missing", () => {
    const result = ensureConfiguration(cfgDir);
    expect(result.scaffolded).toBe(true);
    for (const f of ["guidance.json", "workflow.json", "responses.json", "operations.json", "downstream-servers.json", "policies.json"]) {
      expect(existsSync(join(cfgDir, f))).toBe(true);
    }
    // Schemas vollständig
    for (const p of ["understand", "plan", "review_plan", "implement", "review_implementation", "verify", "complete"]) {
      expect(existsSync(join(cfgDir, "schemas", `${p}.schema.json`))).toBe(true);
    }
    // Die gescaffoldete Konfiguration muss durch den Loader gehen (compose startet)
    const app = composeApplication(ws, cfgDir, join(ws, "state"));
    expect(app.config.profile).toBe("plain");
    expect(app.config.main.project.name).toBe("my-project");
  });

  it("second run is a no-op (idempotent, never overwrites)", () => {
    ensureConfiguration(cfgDir);
    const before = readFileSync(join(cfgDir, "guidance.json"), "utf-8");
    const result = ensureConfiguration(cfgDir);
    expect(result.scaffolded).toBe(false);
    expect(readFileSync(join(cfgDir, "guidance.json"), "utf-8")).toBe(before);
  });

  it("never overwrites existing files (user customization survives)", () => {
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "workflow.json"), JSON.stringify({ version: 2, custom: true }));
    ensureConfiguration(cfgDir);
    expect(JSON.parse(readFileSync(join(cfgDir, "workflow.json"), "utf-8")).custom).toBe(true);
  });

  it("GUIDANCE_SCAFFOLD=off preserves fail-closed behavior (throws)", () => {
    process.env.GUIDANCE_SCAFFOLD = "off";
    expect(() => ensureConfiguration(cfgDir)).toThrowError(/configuration_not_found/);
    expect(existsSync(join(cfgDir, "guidance.json"))).toBe(false);
  });

  it("invalid existing configuration still throws (fail-closed, not repaired)", () => {
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "guidance.json"), "{ invalid json !!");
    expect(() => composeApplication(ws, cfgDir, join(ws, "state"))).toThrowError();
  });

  it("scaffoldIfMissing reports existing entry as no-op", () => {
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "guidance.json"), "{}");
    expect(scaffoldIfMissing(cfgDir)).toEqual({ scaffolded: false, createdFiles: [] });
  });
});

describe("scaffold language detection (spec 005 FR-407/SC-404)", () => {
  it("pyproject.toml in the workspace selects the uv op set", () => {
    writeFileSync(join(ws, "pyproject.toml"), "[project]\nname='x'\n");
    ensureConfiguration(cfgDir);
    const ops = JSON.parse(readFileSync(join(cfgDir, "operations.json"), "utf8")) as { operations: Record<string, { executable: string; invocableByAgent?: boolean }> };
    expect(ops.operations["toolchain-sync"]!.executable).toBe("uv");
    expect(ops.operations["lint"]!.invocableByAgent).toBe(true);
    expect(ops.operations["build"]).toBeUndefined();
    const wf = JSON.parse(readFileSync(join(cfgDir, "workflow.json"), "utf8")) as { phases: { verify: { lifecycle: { beforeExit: string[] } } } };
    expect(wf.phases.verify!.lifecycle.beforeExit).toEqual(["lint", "test", "check"]);
  });

  it("without pyproject.toml the npm op set is unchanged (backward compatible)", () => {
    ensureConfiguration(cfgDir);
    const ops = JSON.parse(readFileSync(join(cfgDir, "operations.json"), "utf8")) as { operations: Record<string, { executable: string }> };
    expect(ops.operations["build"]!.executable).toBe("npm");
    expect(ops.operations["toolchain-sync"]).toBeUndefined();
    const wf = JSON.parse(readFileSync(join(cfgDir, "workflow.json"), "utf8")) as { phases: { verify: { lifecycle: { beforeExit: string[] } } } };
    expect(wf.phases.verify!.lifecycle.beforeExit).toEqual(["lint", "test", "build"]);
  });
});
