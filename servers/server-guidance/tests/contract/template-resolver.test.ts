import { describe, expect, it } from "vitest";
import { resolveTemplate, TemplateError } from "../../src/orchestration/template-resolver.js";

const ctx = {
  project: { name: "demo" },
  session: { workspaceRoot: "/ws", request: "do it" },
  submissions: { understand: { summary: "the summary" } },
};

describe("template resolver (R6, closed namespace)", () => {
  it("resolves simple references in strings", () => {
    expect(resolveTemplate("${project.name}", ctx)).toBe("demo");
    expect(resolveTemplate("root=${session.workspaceRoot}!", ctx)).toBe("root=/ws!");
  });

  it("resolves nested objects recursively", () => {
    expect(resolveTemplate({ q: "${submissions.understand.summary}", n: 1 }, ctx)).toEqual({
      q: "the summary", n: 1,
    });
  });

  it("leaves non-string primitives untouched", () => {
    expect(resolveTemplate(42, ctx)).toBe(42);
    expect(resolveTemplate(null, ctx)).toBe(null);
  });

  it("fails closed on unknown variables (FR-041 preparation)", () => {
    expect(() => resolveTemplate("${session.unknown}", ctx)).toThrowError(TemplateError);
    expect(() => resolveTemplate("${submissions.nope.summary}", ctx)).toThrowError(TemplateError);
  });

  it("never executes code from templates", () => {
    expect(() => resolveTemplate("${constructor.constructor('return 1')()}", ctx)).toThrowError(TemplateError);
  });
});
