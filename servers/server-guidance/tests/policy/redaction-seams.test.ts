import { describe, expect, it } from "vitest";
import { containsSecretPattern, redact, redactUnknown } from "../../src/policy/redaction.js";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";

describe("2c: multi-line redaction coverage", () => {
  it("redacts multi-line quoted values (previously missed)", () => {
    const text = 'config dump:\npassword: "line1\nline2 with secrets"\nend';
    const out = redact(text, ["password"]);
    expect(out).not.toContain("line2 with secrets");
    expect(out).toContain("[REDACTED]");
  });

  it("still redacts single-line values", () => {
    const out = redact('api_key: "abc123"', ["api[_-]?key"]);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abc123");
  });
});

describe("2c: redactUnknown sanitization seam", () => {
  it("deep-walks nested structures and redacts key-bearing strings", () => {
    const input = {
      nested: { authorization: "Bearer abc.def", note: "api_key: xyz" },
      list: [{ token: "topsecret" }, "plain"],
      count: 5,
    };
    const out = redactUnknown(input) as Record<string, unknown>;
    const nested = out.nested as Record<string, string>;
    expect(nested.authorization).toBe("[REDACTED]");
    expect(nested.note).toContain("[REDACTED]");
    expect((out.list as Record<string, unknown>[])[0]?.token).toBe("[REDACTED]");
    expect((out.list as string[])[1]).toBe("plain");
    expect(out.count).toBe(5);
  });

  it("detects high-confidence secret values without key markers", () => {
    expect(containsSecretPattern("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234")).toBe(true);
    expect(containsSecretPattern("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(containsSecretPattern("hello world")).toBe(false);
  });
});

describe("2c: egress content-level secret rejection (restricted servers)", () => {
  const engine = new PolicyEngine();

  it("blocks scalar args containing high-confidence credentials", () => {
    expect(() =>
      engine.evaluateEgress({
        serverId: "srv", trustLevel: "restricted",
        args: { text: "deploy key: -----BEGIN RSA PRIVATE KEY-----" },
      }),
    ).toThrowError(/looks like a credential/);
    expect(() =>
      engine.evaluateEgress({
        serverId: "srv", trustLevel: "restricted",
        args: { token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234" },
      }),
    ).toThrowError(/looks like a credential/);
  });

  it("lets ordinary scalar text pass", () => {
    expect(() =>
      engine.evaluateEgress({ serverId: "srv", trustLevel: "restricted", args: { text: "hello world" } }),
    ).not.toThrow();
  });
});

describe("2c: OperationEngine sanitization seam (mcpTool)", () => {
  it("redacts content and protocolMetadata.structuredContent from downstream", async () => {
    const invoker = {
      invokeTool: async () => ({
        kind: "success" as const,
        content: [{ type: "text", text: 'authorization: "Bearer sk-abcdefghijklmnopqrstuvwx"' }],
        structuredContent: { api_key: "supersecret", plain: "ok" },
      }),
    };
    const engine = new OperationEngine();
    engine.setDownstreamInvoker(invoker as never);
    const result = await engine.execute({
      operationId: "op1", type: "mcpTool", server: "srv", capability: "tool",
    } as never, { workspaceRoot: "/tmp" }, 1);
    const text = JSON.stringify(result);
    expect(text).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(text).not.toContain("supersecret");
    expect(result.status).toBe("succeeded");
  });
});
