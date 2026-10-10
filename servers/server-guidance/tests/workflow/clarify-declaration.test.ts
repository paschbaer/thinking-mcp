/** specs/017 follow-up A2: attended-clarify self-declaration guard. */
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

function writeArtifact(name: string): void {
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, name), `# ${name}\ncontent\n`);
}

const startVariant = () =>
  engine.startWorkflow({
    workspaceRoot: ws,
    request: "r",
    workflowId: "spec-kit-development",
  });

/** Starts the variant session at understand (spec.md written AFTER start so
 *  the artifacts_present skip does not bypass the phase under test). */
const startAtUnderstand = async () => {
  const res = await startVariant();
  writeArtifact("spec.md");
  return res;
};

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
  featureDir = join(ws, "specs", "017-test-feature");
  const config = loadConfig(FIXTURE);
  engine = new WorkflowEngine({
    config,
    stateDir: join(ws, "state"),
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

/** Reports a clarify blocker and answers it via resume_workflow. */
const surfaceAndAnswerClarify = async (sessionId: string): Promise<string> => {
  const blocker = await engine.reportBlocker(sessionId, {
    category: "clarify",
    description: "Should X behave like A or B?",
    requiresUserDecision: true,
  });
  const blockerId = (blocker as { nextBlockerId?: string }).nextBlockerId ?? "";
  const s = engine.getSession(sessionId);
  const live = s.blockers.at(-1)!;
  await engine.resumeWorkflow(sessionId, {
    decision: "behave like A",
    notes: "user answer",
  });
  return live.blockerId;
};

describe("clarify self-declaration guard (specs/017 follow-up A2)", () => {
  it("asked=false (no open questions) exits understand", async () => {
    const res = await startAtUnderstand();
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: false },
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
    expect(
      engine.audit
        .read(res.sessionId)
        .filter((e) => e.eventType === "clarify_declared"),
    ).toHaveLength(1);
  });

  it("asked=true with an answered blocker exits and audits the declaration", async () => {
    const res = await startAtUnderstand();
    const blockerId = await surfaceAndAnswerClarify(res.sessionId);
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: true, blockerId },
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
    expect(
      engine.audit
        .read(res.sessionId)
        .filter((e) => e.eventType === "clarify_declared"),
    ).toHaveLength(1);
  });

  it("asked=true with a fabricated blockerId is rejected (classified, recoverable)", async () => {
    const res = await startAtUnderstand();
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: true, blockerId: "blocker-fabricated" },
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_clarify_declaration_invalid");
    expect(out.error?.recoverable).toBe(true);
  });

  it("asked=true with an UNANSWERED blocker is rejected (defense-in-depth)", async () => {
    const res = await startAtUnderstand();
    // Forge an unresolved blocker directly into the session state (an open
    // report_blocker would block the session and reject earlier with
    // workflow_blocked — the declaration guard is the second line of defense
    // against referencing a blocker that was never answered).
    engine.sessions.update(res.sessionId, (s) => {
      s.blockers.push({
        blockerId: "blocker-open-1",
        category: "clarify",
        description: "open question",
        requiresUserDecision: true,
      });
    });
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: true, blockerId: "blocker-open-1" },
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_clarify_declaration_invalid");
  });

  it("missing clarify field fails schema validation", async () => {
    const res = await startAtUnderstand();
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("submission_invalid");
  });

  it("asked=true with an ANSWERED non-clarify blocker is rejected (F1)", async () => {
    const res = await startAtUnderstand();
    await engine.reportBlocker(res.sessionId, {
      category: "infrastructure",
      description: "unrelated blocker",
      requiresUserDecision: true,
    });
    const s = engine.getSession(res.sessionId);
    const blocker = s.blockers.at(-1)!;
    await engine.resumeWorkflow(res.sessionId, { decision: "ok" });
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: true, blockerId: blocker.blockerId },
    });
    expect(out.accepted).toBe(false);
    expect(out.error?.code).toBe("spec_kit_clarify_declaration_invalid");
  });

  it("asked=false with an empty-string blockerId behaves like absent (F2)", async () => {
    const res = await startAtUnderstand();
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
      clarify: { asked: false, blockerId: "" },
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
  });

  it("standard-development understand submissions are unaffected (FR-2)", async () => {
    const res = await engine.startWorkflow({
      workspaceRoot: ws,
      request: "r",
    });
    const out = await engine.submit(res.sessionId, "understand", {
      summary: "s",
    });
    expect(out.accepted).toBe(true);
    expect(out.currentPhase).toBe("plan");
  });
});
