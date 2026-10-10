/** specs/017 FR-3 (DQ-2): per-key $include resolution — fail-closed. */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadWorkflowFile,
  WorkflowRegistry,
} from "../../src/workflow/workflow-registry.js";

const basePhase = {
  response: "plan",
  submissionSchema: "schemas/plan.schema.json",
  transitions: [{ to: "review_and_adjust_plan", when: "submission_valid" }],
};

function makeConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "guidance-reg-"));
  writeFileSync(
    join(dir, "workflow.json"),
    JSON.stringify({
      version: 2,
      workflow: {
        id: "standard-development",
        initialPhase: "understand",
        terminalStates: ["completed", "cancelled"],
      },
      phases: { plan: basePhase, understand: { transitions: [] } },
    }),
  );
  mkdirSync(join(dir, "workflows"));
  return dir;
}

describe("workflow registry $include resolution (specs/017 FR-3)", () => {
  it("resolves a per-key include with local override precedence", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: {
              $include: "workflow.json#/phases/plan",
              transitions: [{ to: "done", when: "submission_valid" }],
            },
            done: { transitions: [] },
          },
        }),
      );
      const loaded = loadWorkflowFile(dir, "variant");
      expect(loaded.definition.phases.plan?.response).toBe("plan"); // inherited
      expect(loaded.definition.phases.plan?.transitions).toEqual([
        { to: "done", when: "submission_valid" },
      ]); // local override
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when the include target file is missing", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: { $include: "missing.json#/phases/plan" },
            done: { transitions: [] },
          },
        }),
      );
      expect(() => loadWorkflowFile(dir, "variant")).toThrowError(
        /include target file missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when the include target pointer is missing", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: { $include: "workflow.json#/phases/nope" },
            done: { transitions: [] },
          },
        }),
      );
      expect(() => loadWorkflowFile(dir, "variant")).toThrowError(
        /include target missing/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on include cycles (A -> B -> A) with a classified error", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "a.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "a", initialPhase: "p" },
          phases: {
            p: { $include: "b.json#/phases/p" },
          },
        }),
      );
      writeFileSync(
        join(dir, "workflows", "b.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "b", initialPhase: "p" },
          phases: {
            p: { $include: "a.json#/phases/p" },
          },
        }),
      );
      try {
        loadWorkflowFile(dir, "a");
        expect.unreachable("cycle must fail closed");
      } catch (err) {
        expect((err as { code?: string }).code).toBe("configuration_invalid");
        expect((err as Error).message).toMatch(/include_cycle/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on self-include", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "p" },
          phases: {
            p: { $include: "variant.json#/phases/p" },
          },
        }),
      );
      expect(() => loadWorkflowFile(dir, "variant")).toThrowError(
        /include_cycle/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects transitions to unknown phases (sparse model guard)", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: {
              $include: "workflow.json#/phases/plan",
            },
          },
        }),
      );
      expect(() => loadWorkflowFile(dir, "variant")).toThrowError(
        /unknown phase review_and_adjust_plan/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("caches resolution per configDir/workflowId", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: { $include: "workflow.json#/phases/plan" },
            review_and_adjust_plan: { transitions: [] },
          },
        }),
      );
      const registry = new WorkflowRegistry();
      const a = registry.resolve(dir, "variant");
      const b = registry.resolve(dir, "variant");
      expect(b).toBe(a);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on invalid limits values (C2: no silent defaults)", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: { $include: "workflow.json#/phases/plan" },
            review_and_adjust_plan: { transitions: [] },
          },
          limits: { maxReviewRoundsPerBatch: 0 },
        }),
      );
      expect(() => loadWorkflowFile(dir, "variant")).toThrowError(
        /limits\.maxReviewRoundsPerBatch/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults absent limits keys to 5 (backward compatible)", () => {
    const dir = makeConfigDir();
    try {
      writeFileSync(
        join(dir, "workflows", "variant.json"),
        JSON.stringify({
          version: 2,
          workflow: { id: "variant", initialPhase: "plan" },
          phases: {
            plan: { $include: "workflow.json#/phases/plan" },
            review_and_adjust_plan: { transitions: [] },
          },
          limits: { maxReviewRoundsPerBatch: 2 },
        }),
      );
      const loaded = loadWorkflowFile(dir, "variant");
      expect(loaded.limits.maxReviewRoundsPerBatch).toBe(2);
      expect(loaded.limits.maxConvergencePasses).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
