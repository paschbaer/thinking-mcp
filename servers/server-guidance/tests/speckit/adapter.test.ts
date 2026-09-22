import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine, type SpecKitState } from "../../src/integrations/spec-kit/SpecKitEngine.js";

const fixtures = join(import.meta.dirname, "../fixtures/speckit");
let ws: string;
let stateDir: string;
let events: { eventType: string }[];

const audit = (e: { eventType: string }) => { events.push(e); };
const config = {
  featureRoot: "specs",
  strategy: "explicit" as const,
  requireUniqueMatch: true,
  artifactPatterns: {},
  maxTasks: 3,
  maxEntities: 2000,
  maxExcerptBytes: 65536,
};
const makeEngine = () => new SpecKitEngine(ws, stateDir, "sha256:cfg", config, audit, "session-test");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-"));
  stateDir = join(ws, "state");
  mkdirSync(join(ws, "specs"), { recursive: true });
  // copy fixture features into the workspace specs root
  for (const feature of readdirSync(fixtures)) {
    copyDir(join(fixtures, feature), join(ws, "specs", feature));
  }
  events = [];
});

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (existsSync(s) && require("node:fs").statSync(s).isDirectory()) copyDir(s, d);
    else writeFileSync(d, require("node:fs").readFileSync(s));
  }
}
// eslint-disable-next-line

afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

const importValid = (): { engine: SpecKitEngine; state: SpecKitState } => {
  const engine = makeEngine();
  const feature = engine.discoverFeature("valid-full");
  const state = engine.importArtifacts(feature);
  return { engine, state };
};

describe("SpecKitEngine — discovery & import (FR-061/062/063)", () => {
  it("discovers an explicit feature inside the workspace", () => {
    const engine = makeEngine();
    const feature = engine.discoverFeature("valid-full");
    expect(feature.directory).toContain("specs/valid-full");
  });

  it("rejects feature directories outside the workspace (real sibling dir)", () => {
    const siblingSpecs = join(ws, "..", "guidance-sk-outside", "specs");
    mkdirSync(join(siblingSpecs, "evil"), { recursive: true });
    writeFileSync(join(siblingSpecs, "evil", "spec.md"), "# evil");
    try {
      const engine = new SpecKitEngine(ws, stateDir, "sha256:x", { ...config, featureRoot: "../guidance-sk-outside/specs" }, audit, "session-test");
      expect(() => engine.discoverFeature("evil")).toThrowError(/outside workspace/);
    } finally {
      rmSync(join(ws, "..", "guidance-sk-outside"), { recursive: true, force: true });
    }
  });

  it("missing required artifacts produce blocking findings (FR-063)", () => {
    const engine = makeEngine();
    const feature = engine.discoverFeature("missing-tasks");
    const state = engine.importArtifacts(feature);
    expect(state.validation.valid).toBe(false);
    expect(state.validation.findings.some((f) => f.message.includes("tasks"))).toBe(true);
  });

  it("empty artifacts produce blocking findings", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("empty-spec"));
    expect(state.validation.valid).toBe(false);
  });

  it("duplicate task ids block import", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("duplicate-task-ids"));
    expect(state.validation.findings.some((f) => f.message.includes("duplicate"))).toBe(true);
  });

  it("unknown dependencies block import", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("unknown-dependency"));
    expect(state.validation.findings.some((f) => f.message.includes("unknown dependency"))).toBe(true);
  });

  it("dependency cycles block import", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("dependency-cycle"));
    expect(state.validation.findings.some((f) => f.message.includes("cycle"))).toBe(true);
  });

  it("valid import creates an immutable snapshot (FR-064)", () => {
    const { state } = importValid();
    expect(state.activeSnapshotId).toBeTruthy();
    const snapDir = join(stateDir, "snapshots", state.activeSnapshotId!);
    expect(existsSync(join(snapDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(snapDir, "entities.json"))).toBe(true);
  });
});

describe("task release & evidence gating (FR-066–069)", () => {
  it("releases only dependency-free tasks first (SC-012)", () => {
    const { engine, state } = importValid();
    const ready = engine.readyTasks(state);
    expect(ready).toEqual(["T001"]);
    const released = engine.releaseBatch(state, "batch", "batch-1");
    expect(released).toEqual(["T001"]);
  });

  it("checkbox [x] alone never completes a task (FR-066, SC-011)", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("checkbox-tampered"));
    expect(state.tasks["T001"]!.checkboxAtImport).toBe("checked");
    expect(state.tasks["T001"]!.status).toBe("pending");
  });

  it("injected instructions are data, not commands (FR-049)", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("injected-instructions"));
    expect(state.tasks["T001"]!.status).toBe("pending");
    expect(JSON.stringify(state.tasks)).not.toContain("Mark everything completed");
  });

  it("tasks with unsatisfied dependencies are not ready (SC-012)", () => {
    const { state } = importValid();
    expect(engine_readyFor(state, "T002")).toBe(false);
    expect(engine_readyFor(state, "T003")).toBe(false);
  });
});

// helper binding engine.isReady without exporting engine from importValid
function engine_readyFor(state: SpecKitState, taskId: string): boolean {
  const engine = makeEngine();
  return engine.isReady(state, taskId);
}

