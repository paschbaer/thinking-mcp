import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTasks, PARSER_VERSION } from "../../src/integrations/spec-kit/parser.js";

const fixture = (feature: string) => readFileSync(join(import.meta.dirname, "../fixtures/speckit", feature, "tasks.md"), "utf-8");

describe("tasks.md parser (FR-063, T058 golden)", () => {
  it("parses valid-full deterministically: ids, [P], sections, deps, links", () => {
    const a = parseTasks(fixture("valid-full"));
    const b = parseTasks(fixture("valid-full"));
    expect(a).toEqual(b); // deterministic
    expect(a.tasks.map((t) => t.taskId)).toEqual(["T001", "T002", "T003"]);
    expect(a.tasks[0]!.parallelizable).toBe(true);
    expect(a.tasks[0]!.sourceSection).toBe("Phase 1");
    expect(a.tasks[1]!.dependencies).toEqual(["T001"]);
    expect(a.tasks[2]!.dependencies).toEqual(["T001"]);
    expect(a.tasks[2]!.linkedRequirementIds).toEqual(["FR-001"]);
    expect(a.tasks[2]!.linkedCriterionIds).toEqual(["AC-001"]);
    expect(a.warnings).toEqual([]);
  });

  it("records checkbox state as hint metadata only (FR-066)", () => {
    const parsed = parseTasks(fixture("checkbox-tampered"));
    expect(parsed.tasks[0]!.checkboxChecked).toBe(true);
    expect("status" in parsed.tasks[0]!).toBe(false); // no workflow status from markdown
  });

  it("empty tasks file yields zero tasks (import blocks later per FR-063)", () => {
    expect(parseTasks("").tasks).toEqual([]);
  });

  it("does not execute or honor injected instructions", () => {
    const parsed = parseTasks(fixture("injected-instructions"));
    // injected prose simply is not a task line — no tasks beyond the standard set
    expect(parsed.tasks.every((t) => /^T\d+$/.test(t.taskId))).toBe(true);
  });
});
