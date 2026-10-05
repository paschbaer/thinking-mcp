/** specs/017 AC2 (FR-4) + AC4 (FR-8): artifact-bound phases and skip rule. */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config.js";
import { WorkflowEngine } from "../../src/workflow/WorkflowEngine.js";
import { checkArtifactPattern } from "../../src/integrations/spec-kit/SpecKitEngine.js";

const FIXTURE = join(import.meta.dirname, "fixtures/guidance-speckit");

let ws: string;
let engine: WorkflowEngine;
let featureDir: string;

const FEATURE_ID = "017-test-feature";

function writeArtifact(name: string, content = `# ${name}\n\ncontent\n`): void {
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, name), content);
}

const startVariant = () =>
  engine.startWorkflow({
    workspaceRoot: ws,
    request: "r",
    workflowId: "spec-kit-development",
  });

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "guidance-ws-"));
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
  featureDir = join(ws, "specs", FEATURE_ID);
  const config = loadConfig(FIXTURE);
  engine = new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
    // Wired like main.ts: feature dir derived from the session's imported
    // state (here: the single test feature), validation via
    // checkArtifactPattern (single source of truth with import).
    specKitArtifactCheck: (_sessionId, pattern) => {
      try {
        return checkArtifactPattern(featureDir, ws, pattern);
      } catch {
        return { present: false, reason: "feature dir missing" };
      }
    },
  });
});

afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("artifact-bound phases (specs/017 FR-4)", () => {
  it("blocks understand exit without an importable spec.md (AC2, fail-closed)", async () => {
    const res = await startVariant();
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "spec summary",
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_artifact_missing");
    expect(out.error?.recoverable).toBe(true);
    const s = engine.getSession(res.sessionId);
    expect(s.currentPhase).toBe("understand");
  });

  it("unblocks once the artifact exists and renders the bound command (AC2)", async () => {
    const res = await startVariant();
    const before = await engine.submit(res.sessionId, "understand", {
      summary: "spec summary",
    });
    expect(before.accepted).toBe(false);
    writeArtifact("spec.md");
    const after = await engine.submit(res.sessionId, "understand", {
      summary: "spec summary",
    });
    expect(after.accepted).toBe(true);
    expect(after.currentPhase).toBe("plan");
    expect(after.guidance?.instruction).toContain("/speckit-plan");
  });

  it("plan exit is gated by plan.md", async () => {
    writeArtifact("spec.md");
    const res = await startVariant();
    // spec.md present => understand skipped at start; session begins at plan.
    expect(res.currentPhase).toBe("plan");
    const out = await engine.submit(res.sessionId, "plan", { tasks: [] });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_artifact_missing");
    writeArtifact("plan.md");
    const ok = await engine.submit(res.sessionId, "plan", { tasks: [] });
    expect(ok.accepted).toBe(true);
    expect(ok.currentPhase).toBe("checklist");
  });
});

describe("skip on existing artifacts (specs/017 FR-8 / US6)", () => {
  it("skips understand via artifacts_present at session start (AC4)", async () => {
    writeArtifact("spec.md");
    const res = await startVariant();
    expect(res.currentPhase).toBe("plan");
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.skips).toEqual([
      {
        phase: "understand",
        reason: "artifacts_present",
        at: expect.any(String),
      },
    ]);
  });

  it("partial artifact sets skip only the matching phases (AC4)", async () => {
    writeArtifact("spec.md");
    const res = await startVariant();
    expect(res.currentPhase).toBe("plan"); // plan.md missing -> no skip
    writeArtifact("plan.md");
    const out = await engine.submit(res.sessionId, "plan", { tasks: [] });
    expect(out.accepted).toBe(true);
    const s = engine.getSession(res.sessionId);
    // plan was exited normally (submission), understand skipped at start
    expect(s.specKit?.skips.map((x) => x.phase)).toEqual(["understand"]);
    expect(s.currentPhase).toBe("checklist");
  });

  it("an empty artifact is not importable and does not skip", async () => {
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "spec.md"), "   \n");
    const res = await startVariant();
    expect(res.currentPhase).toBe("understand");
    const s = engine.getSession(res.sessionId);
    expect(s.specKit?.skips ?? []).toHaveLength(0);
  });
});
