import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpecKitEngine } from "../../src/integrations/spec-kit/SpecKitEngine.js";

// 2a: snapshot chaining + internal staleness machinery (Phase 7a MEDIUMs).

let ws: string;
let stateDir: string;
const config = {
  featureRoot: "specs", strategy: "explicit" as const, requireUniqueMatch: true,
  artifactPatterns: {}, maxTasks: 3, maxEntities: 2000, maxExcerptBytes: 65536,
};
const specPath = () => join(ws, "specs/valid-full/spec.md");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-2a-"));
  stateDir = join(ws, "state");
  const src = join(import.meta.dirname, "../fixtures/speckit/valid-full");
  const dest = join(ws, "specs/valid-full");
  mkdirSync(dest, { recursive: true });
  for (const f of ["spec.md", "plan.md", "tasks.md"]) {
    writeFileSync(join(dest, f), readFileSync(join(src, f)));
  }
});

afterEach(() => rmSync(ws, { recursive: true, force: true }));

function makeEngine(): SpecKitEngine {
  return new SpecKitEngine(ws, stateDir, "sha256:cfg", config, () => {}, "session-2a");
}

describe("2a: snapshot chaining", () => {
  it("first import has previousSnapshotId null", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("valid-full"));
    const active = state.snapshots.find((s) => s.snapshotId === state.activeSnapshotId)!;
    expect(active.previousSnapshotId).toBeNull();
  });

  it("refresh with previous state chains snapshots and preserves history", () => {
    const engine = makeEngine();
    const first = engine.importArtifacts(engine.discoverFeature("valid-full"));
    // change artifacts so the refresh is a real re-import
    writeFileSync(specPath(), readFileSync(specPath()) + "\n<!-- refreshed -->\n");
    const second = engine.importArtifacts(engine.discoverFeature("valid-full"), first);

    expect(second.activeSnapshotId).not.toBe(first.activeSnapshotId);
    const active = second.snapshots.find((s) => s.snapshotId === second.activeSnapshotId)!;
    expect(active.previousSnapshotId).toBe(first.activeSnapshotId);
    expect(second.snapshots.some((s) => s.snapshotId === first.activeSnapshotId)).toBe(true);
  });

  it("a blocking refresh preserves the previous chain and marks the state invalid", () => {
    const engine = makeEngine();
    const first = engine.importArtifacts(engine.discoverFeature("valid-full"));
    // corrupt tasks.md with a duplicate task id => blocking finding
    const tasks = readFileSync(join(ws, "specs/valid-full/tasks.md"), "utf-8");
    writeFileSync(join(ws, "specs/valid-full/tasks.md"), tasks + "\n- [ ] **T001**: duplicate id\n");

    const second = engine.importArtifacts(engine.discoverFeature("valid-full"), first);
    expect(second.validation.valid).toBe(false);
    expect(second.activeSnapshotId).toBe(first.activeSnapshotId); // chain intact
    expect(second.snapshots.length).toBe(first.snapshots.length);
  });
});

describe("2a: internal staleness machinery", () => {
  it("detects stale artifacts internally (no caller-supplied flag)", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("valid-full"));
    writeFileSync(specPath(), readFileSync(specPath()) + "\n<!-- drifted -->\n");

    const result = engine.evaluateCompletionInvariants(state, { requiredVerificationSucceeded: true, completionOpsSucceeded: true });
    expect(result.violations).toContain("snapshot_stale");
  });

  it("current artifacts produce no snapshot_stale violation", () => {
    const engine = makeEngine();
    const state = engine.importArtifacts(engine.discoverFeature("valid-full"));
    const result = engine.evaluateCompletionInvariants(state, { requiredVerificationSucceeded: true, completionOpsSucceeded: true });
    expect(result.violations).not.toContain("snapshot_stale");
  });
});
