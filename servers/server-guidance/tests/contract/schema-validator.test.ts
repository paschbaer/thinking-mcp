import { describe, expect, it } from "vitest";
import { createValidator } from "../../src/workflow/schema-validator.js";

const schema = {
  type: "object", additionalProperties: false, required: ["summary"],
  properties: { summary: { type: "string" }, items: { type: "array", items: { type: "string" } } },
};

describe("schema validator factory (FR-007, FR-030, FR-042)", () => {
  it("accepts a valid payload", () => {
    const v = createValidator(schema);
    expect(v.validate({ summary: "ok", items: ["a"] }).valid).toBe(true);
  });

  it("rejects missing required fields", () => {
    const v = createValidator(schema);
    expect(v.validate({ items: [] }).valid).toBe(false);
  });

  it("rejects unknown/extra fields (strict, FR-030)", () => {
    const v = createValidator(schema);
    const res = v.validate({ summary: "ok", extra: 1 });
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/additional/i);
  });

  it("produces a stable schema hash for drift pinning (FR-042)", () => {
    expect(createValidator(schema).schemaHash).toBe(createValidator({ ...schema }).schemaHash);
    expect(createValidator(schema).schemaHash).not.toBe(createValidator({ ...schema, required: [] }).schemaHash);
  });
});
