import { describe, expect, it } from "vitest";
import { redact, createRedactor } from "../../src/policy/redaction.js";

describe("redaction (FR-050, FR-045)", () => {
  it("redacts configured secret patterns", () => {
    expect(redact("api_key=abc123", ["\\bapi[_-]?key\\b"])).not.toContain("abc123");
  });

  it("supports a redactor instance with default patterns", () => {
    const r = createRedactor();
    const out = r.redact('{"password": "p", "Authorization": "Bearer x"}');
    expect(out).not.toContain("Bearer x");
    expect(out).not.toContain('"p"');
  });

  it("does not redact benign identifiers (word boundaries)", () => {
    const r = createRedactor();
    expect(r.redact("store_insight and tokenize and secretary")).toBe("store_insight and tokenize and secretary");
  });
});
