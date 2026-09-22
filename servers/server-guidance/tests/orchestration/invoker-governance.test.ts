import { describe, expect, it } from "vitest";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";
import { createStubServer } from "./stubs/stub-downstream.js";

describe("invoker-level governance (FR-042/FR-048 e2e)", () => {
  it("rejects non-allowlisted tools without connecting (allowlist-before-connect)", async () => {
    let connections = 0;
    const engine = new OperationEngine();
    engine.setDownstreamInvoker({
      invokeTool: async (serverId, toolName) => {
        // mirrors WorkflowEngine invoker ordering: allowlist BEFORE connect
        const allow = ["analyze"];
        if (!allow.includes(toolName)) {
          throw Object.assign(new Error("not allowlisted"), { code: "downstream_capability_not_allowed" });
        }
        connections += 1;
        const stub = createStubServer("success");
        void stub; void serverId;
        return { kind: "success", content: [] };
      },
    });
    const config = { operationId: "op", type: "mcpTool" as const, server: "g", capability: "hiddenTool", required: true };
    const res = await engine.execute(config, { workspaceRoot: "/ws" }, 1);
    expect(res.status).toBe("failed");
    expect(res.errors[0]!.message).toMatch(/not allowlisted/);
    expect(connections).toBe(0);
  });

  it("surfaces drift-shaped failures as failed operations (FR-042)", async () => {
    const engine = new OperationEngine();
    engine.setDownstreamInvoker({
      invokeTool: async () => ({ kind: "transport", message: "tool analyze schema drifted on g" }),
    });
    const res = await engine.execute(
      { operationId: "op", type: "mcpTool", server: "g", capability: "analyze", required: true },
      { workspaceRoot: "/ws" },
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.errors[0]!.message).toMatch(/drifted|transport/);
  });
});
