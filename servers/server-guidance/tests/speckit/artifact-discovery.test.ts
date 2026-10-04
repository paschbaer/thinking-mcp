import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  isInsideWorkspace,
  SpecKitEngine,
  type SpecKitState,
} from "../../src/integrations/spec-kit/SpecKitEngine.js";

// ---------------------------------------------------------------------------
// Direct helper tests — pre-resolved literal strings, platform-independent.
// (path.resolve normalizes separators per host, so the guard itself is tested
// with already-resolved inputs; integration tests below use path.resolve.)
// ---------------------------------------------------------------------------

describe("isInsideWorkspace (shared guard, SKP-3 separator handling)", () => {
  it("accepts forward-slash separators", () => {
    expect(isInsideWorkspace("/ws/specs/001-feat", "/ws")).toBe(true);
  });

  it("accepts backslash separators below a resolved root (native Windows paths)", () => {
    // Mixed case: a POSIX resolve() over a Windows-style input keeps backslash
    // separators below the forward-slash root — exactly the shape SKP-3 broke.
    expect(isInsideWorkspace("/ws\\specs\\001-feat", "/ws")).toBe(true);
    // Fully Windows-native shape.
    expect(isInsideWorkspace("C:\\ws\\specs\\001-feat", "C:\\ws")).toBe(true);
  });

  it("accepts the workspace root itself (equality allow)", () => {
    expect(isInsideWorkspace("/ws", "/ws")).toBe(true);
  });

  it("rejects sibling directories with a shared prefix", () => {
    expect(isInsideWorkspace("/ws-sibling/specs/001-feat", "/ws")).toBe(false);
  });

  it("rejects paths outside the workspace root", () => {
    expect(isInsideWorkspace("/other/specs/001-feat", "/ws")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — self-contained fixture workspace, host-correct
// expectations via path.resolve / relative().
// ---------------------------------------------------------------------------

const auditEvents: { eventType: string }[] = [];
const audit = (e: { eventType: string }) => {
  auditEvents.push(e);
};

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    featureRoot: "specs",
    strategy: "explicit" as const,
    requireUniqueMatch: true,
    artifactPatterns: {},
    maxTasks: 3,
    maxEntities: 2000,
    maxExcerptBytes: 65536,
    ...overrides,
  };
}

let ws: string;
let stateDir: string;

function makeEngine(configOverrides: Record<string, unknown> = {}) {
  return new SpecKitEngine(
    ws,
    stateDir,
    "sha256:cfg",
    makeConfig(configOverrides),
    audit,
    "session-test",
  );
}

function writeFeature(
  featureId: string,
  files: Record<string, string>,
): string {
  const dir = join(ws, "specs", featureId);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const TASKS = `# Tasks\n\n- [ ] T001 Do the thing\n`;

const BASE_FILES: Record<string, string> = {
  "spec.md": "# Spec\n\n## Fr: something\n",
  "plan.md": "# Plan\n",
  "tasks.md": TASKS,
};

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-sk-artdisc-"));
  stateDir = join(ws, "state");
  mkdirSync(join(ws, "specs"), { recursive: true });
  auditEvents.length = 0;
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("artifact discovery — unified traversal (C-Full)", () => {
  it("imports checklists/** artifacts with real relative paths", () => {
    const dir = writeFeature("with-checklists", {
      ...BASE_FILES,
      "checklists/arch.md": "# Arch checklist\n",
      "checklists/sub/rev.md": "# Rev checklist\n",
    });
    const engine = makeEngine();
    const state: SpecKitState = engine.importArtifacts(
      engine.discoverFeature("with-checklists"),
    );
    const checklists = state.snapshots
      .flatMap((s) => s.artifacts)
      .filter((a) => a.type === "checklists");
    expect(checklists.length).toBe(2);
    const relPaths = checklists.map((a) => a.relativePath).sort();
    expect(relPaths).toEqual(
      [
        relative(dir, join(dir, "checklists", "arch.md")),
        relative(dir, join(dir, "checklists", "sub", "rev.md")),
      ].sort(),
    );
  });

  it("still imports contracts/** artifacts (regression)", () => {
    writeFeature("with-contracts", {
      ...BASE_FILES,
      "contracts/api.json": "{}",
    });
    const engine = makeEngine();
    const state = engine.importArtifacts(
      engine.discoverFeature("with-contracts"),
    );
    const contracts = state.snapshots
      .flatMap((s) => s.artifacts)
      .filter((a) => a.type === "contracts");
    expect(contracts.length).toBe(1);
    expect(contracts[0]!.relativePath).toBe(
      relative(
        join(ws, "specs", "with-contracts"),
        join(ws, "specs", "with-contracts", "contracts", "api.json"),
      ),
    );
  });

  it("keeps top-level relativePath identical to the previous convention", () => {
    writeFeature("top-level", BASE_FILES);
    const engine = makeEngine();
    const state = engine.importArtifacts(
      engine.discoverFeature("top-level"),
    );
    const artifacts = state.snapshots[0]!.artifacts;
    const spec = artifacts.find((a) => a.type === "specification")!;
    expect(spec.relativePath).toBe("spec.md");
  });

  it("imports config-provided dir patterns (artifactPatterns extension)", () => {
    writeFeature("custom-dir", {
      ...BASE_FILES,
      "audit/trace.log": "trace-1\n",
    });
    const engine = makeEngine({
      artifactPatterns: { audit: { required: false, patterns: ["audit/**"] } },
    });
    const state = engine.importArtifacts(engine.discoverFeature("custom-dir"));
    const audits = state.snapshots
      .flatMap((s) => s.artifacts)
      .filter((a) => a.type === "audit");
    expect(audits.length).toBe(1);
  });

  it("flags empty artifacts as blocking, including in dir patterns", () => {
    writeFeature("empty-checklist", {
      ...BASE_FILES,
      "checklists/blank.md": "   \n",
    });
    const engine = makeEngine();
    const state = engine.importArtifacts(
      engine.discoverFeature("empty-checklist"),
    );
    expect(state.validation.valid).toBe(false);
    expect(
      state.validation.findings.some((f) =>
        f.message.includes("checklists: artifact is empty"),
      ),
    ).toBe(true);
  });

  it("still rejects required artifacts missing (FR-063 regression)", () => {
    writeFeature("missing-plan", {
      "spec.md": "# Spec\n",
      "tasks.md": TASKS,
    });
    const engine = makeEngine();
    const state = engine.importArtifacts(
      engine.discoverFeature("missing-plan"),
    );
    expect(state.validation.valid).toBe(false);
    expect(
      state.validation.findings.some((f) =>
        f.message.includes("plan: required artifact missing"),
      ),
    ).toBe(true);
  });

  it("rejects a feature directory outside the workspace via discovery guard", () => {
    const outside = mkdtempSync(join(tmpdir(), "guidance-sk-outside-"));
    try {
      mkdirSync(join(outside, "evil"), { recursive: true });
      writeFileSync(join(outside, "evil", "spec.md"), "# evil");
      const engine = makeEngine();
      expect(() =>
        engine.importArtifacts({
          featureId: "evil",
          directory: join(outside, "evil"),
        }),
      ).toThrowError(/escapes the workspace/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("detects staleness through checklists entries (relativePath round-trip)", () => {
    const dir = writeFeature("stale-check", {
      ...BASE_FILES,
      "checklists/rev.md": "# Rev v1\n",
    });
    const engine = makeEngine();
    const state = engine.importArtifacts(
      engine.discoverFeature("stale-check"),
    );
    expect(engine.isSnapshotStale(state, dir)).toBe(false);
    writeFileSync(join(dir, "checklists", "rev.md"), "# Rev v2\n");
    expect(engine.isSnapshotStale(state, dir)).toBe(true);
  });

  it("produces deterministic artifact ordering across imports", () => {
    writeFeature("ordered", {
      ...BASE_FILES,
      "checklists/b.md": "# B\n",
      "checklists/a.md": "# A\n",
      "contracts/z.json": "{}",
      "contracts/y.json": "{}",
    });
    const engine = makeEngine();
    const s1 = engine.importArtifacts(engine.discoverFeature("ordered"));
    const s2 = engine.importArtifacts(engine.discoverFeature("ordered"));
    const keys = (s: SpecKitState) =>
      s.snapshots[0]!.artifacts.map((a) => `${a.type}:${a.relativePath}`);
    expect(keys(s1)).toEqual(keys(s2));
  });
});

describe("resolve-based guard consistency", () => {
  it("helper agrees with resolve() output for a resolved workspace root", () => {
    const wsResolved = resolve("/ws");
    expect(isInsideWorkspace(resolve(join("/ws", "specs", "f")), wsResolved)).toBe(
      true,
    );
    expect(isInsideWorkspace(resolve("/wsX/specs/f"), wsResolved)).toBe(false);
  });
});
