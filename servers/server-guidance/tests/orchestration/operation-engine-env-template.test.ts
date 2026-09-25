import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { OperationEngine, type OperationContext } from "../../src/orchestration/OperationEngine.js";
import type { OperationConfig } from "../../src/types/index.js";

const ctx: OperationContext = {
  workspaceRoot: tmpdir(),
  templateVars: { "session.request": "add rate limiting", "project.name": "my-project" },
};

function processConfig(overrides: Partial<OperationConfig>): OperationConfig {
  return {
    operationId: "op",
    type: "process",
    executable: "node",
    args: ["-e", "process.exit(0)"],
    required: true,
    ...overrides,
  } as OperationConfig;
}

describe("operation engine: env/shell for process operations (GUID-5)", () => {
  it("passes config.env to the child process (merged over inherited env)", async () => {
    const engine = new OperationEngine();
    const config = processConfig({
      // exits 0 only when FOO is set exactly as configured → proves propagation
      args: ["-e", "process.exit(process.env.FOO === 'bar-123' ? 0 : 1)"],
      env: { FOO: "bar-123" },
      output: { returnToAgent: "summary_and_errors" },
    });
    const res = await engine.execute(config, ctx, 1) as unknown as { status: string };
    expect(res.status).toBe("succeeded");
  });

  it("without config.env the variable is absent in the child", async () => {
    const engine = new OperationEngine();
    const config = processConfig({
      args: ["-e", "process.exit(process.env.FOO === 'bar-123' ? 0 : 1)"],
      output: { returnToAgent: "summary_and_errors" },
    });
    const res = await engine.execute(config, ctx, 1) as unknown as { status: string };
    expect(res.status).toBe("failed");
  });

  it("shell option executes the command via the shell", async () => {
    const engine = new OperationEngine();
    const config = processConfig({
      executable: "echo",
      args: ["hello-shell"],
      shell: true,
      output: { returnToAgent: "summary_and_errors" },
    });
    const res = await engine.execute(config, ctx, 1) as unknown as { status: string };
    expect(res.status).toBe("succeeded");
  });
});

describe("operation engine: template placeholder resolution (GUID-3)", () => {
  function mcpEngine() {
    const engine = new OperationEngine();
    const seen: Record<string, unknown>[] = [];
    engine.setDownstreamInvoker({
      async invokeTool(_server, _tool, args) {
        seen.push(args);
        return { kind: "success", content: [{ type: "text", text: "ok" }] };
      },
    });
    return { engine, seen };
  }

  const config: OperationConfig = {
    operationId: "op",
    type: "mcpTool",
    server: "gitnexus",
    capability: "check",
    required: true,
    arguments: { mode: "template", value: { repo: "${project.name}", q: "${session.request}" } },
  };

  it("resolves known tokens deeply (nested objects)", async () => {
    const { engine, seen } = mcpEngine();
    const res = await engine.execute(config, ctx, 1) as unknown as { status: string };
    expect(res.status).toBe("succeeded");
    expect(seen[0]).toEqual({ repo: "my-project", q: "add rate limiting" });
  });

  it("fails fast with operation_arguments_invalid on unknown tokens (no literal passthrough)", async () => {
    const { engine } = mcpEngine();
    const bad: OperationConfig = {
      ...config,
      arguments: { mode: "template", value: { repo: "${not.a.token}" } },
    };
    const res = await engine.execute(bad, ctx, 1) as unknown as { status: string; summary: string; errors: { message: string }[] };
    expect(res.status).toBe("failed");
    expect(res.summary).toContain("template arguments invalid");
    expect(res.errors[0]!.message).toContain("not.a.token");
  });

  it("mode fixed stays literal (no resolution)", async () => {
    const { engine, seen } = mcpEngine();
    const fixed: OperationConfig = {
      ...config,
      arguments: { mode: "fixed", value: { repo: "${project.name}" } },
    };
    await engine.execute(fixed, ctx, 1);
    expect(seen[0]).toEqual({ repo: "${project.name}" });
  });
});
