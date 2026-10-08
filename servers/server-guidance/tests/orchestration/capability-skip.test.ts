/** GN-D1 three-valued gate outcomes (unit level): an mcpTool operation on a
 *  server declared as an optional capability that fails with a TRANSPORT
 *  error reports skipped(capability-absent) instead of failed — but only
 *  when the operation is non-required. A reachable server that reports an
 *  error (configured-but-broken) stays failed with a loud warning, and
 *  required operations keep failing closed in every case. */
import { describe, expect, it } from "vitest";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";

const ctx = { workspaceRoot: "/ws" };

function makeEngine(optional: boolean): OperationEngine {
  const engine = new OperationEngine();
  engine.setDownstreamInvoker({
    invokeTool: async () => ({
      kind: "transport",
      message: "connect ECONNREFUSED",
    }),
  });
  if (optional) engine.setOptionalCapabilityServers(["gitnexus"]);
  return engine;
}

describe("three-valued gate outcomes (GN-D1)", () => {
  it("optional server + transport failure + non-required op → skipped(capability-absent) with loud warning", async () => {
    const engine = makeEngine(true);
    const res = await engine.execute(
      {
        operationId: "gitnexus-check",
        type: "mcpTool",
        server: "gitnexus",
        capability: "check",
        required: false,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("skipped");
    expect(res.data.reason).toBe("capability-absent");
    expect(res.data.server).toBe("gitnexus");
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toEqual([
      expect.objectContaining({ code: "capability_absent_skipped" }),
    ]);
  });

  it("optional server + transport failure + REQUIRED op → still failed (fail-closed invariant)", async () => {
    const engine = makeEngine(true);
    const res = await engine.execute(
      {
        operationId: "repository-analysis",
        type: "mcpTool",
        server: "gitnexus",
        capability: "check",
        required: true,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.errors).toEqual([
      expect.objectContaining({ code: "downstream_connection_failed" }),
    ]);
    const run = await engine.executeRequired(
      [
        {
          operationId: "repository-analysis",
          type: "mcpTool",
          server: "gitnexus",
          capability: "check",
          required: true,
        },
      ],
      ctx,
    );
    expect(run.allSucceeded).toBe(false);
  });

  it("skipped keeps allSucceeded=true and the observer reports phase 'skipped'", async () => {
    const engine = makeEngine(true);
    const events: { phase: string; status?: string }[] = [];
    const run = await engine.executeRequired(
      [
        {
          operationId: "gitnexus-check",
          type: "mcpTool",
          server: "gitnexus",
          capability: "check",
          required: false,
        },
      ],
      ctx,
      (e) => events.push({ phase: e.phase, status: e.status }),
    );
    expect(run.allSucceeded).toBe(true);
    expect(run.results[0]!.status).toBe("skipped");
    expect(events).toEqual([
      { phase: "started", status: undefined },
      { phase: "skipped", status: "skipped" },
    ]);
  });

  it("optional server + tool-reported error → failed (configured-but-broken) with loud warning", async () => {
    const engine = new OperationEngine();
    engine.setDownstreamInvoker({
      invokeTool: async () => ({
        kind: "tool_reported",
        message: "index corrupt",
        content: [],
      }),
    });
    engine.setOptionalCapabilityServers(["gitnexus"]);
    const res = await engine.execute(
      {
        operationId: "gitnexus-check",
        type: "mcpTool",
        server: "gitnexus",
        capability: "check",
        required: false,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.errors).toEqual([
      expect.objectContaining({ code: "operation_result_invalid" }),
    ]);
    expect(res.warnings).toEqual([
      expect.objectContaining({ code: "optional_capability_broken" }),
    ]);
  });

  it("no optional-capability set configured → transport failure on the same server stays failed (legacy byte-identical)", async () => {
    const engine = makeEngine(false);
    const res = await engine.execute(
      {
        operationId: "gitnexus-check",
        type: "mcpTool",
        server: "gitnexus",
        capability: "check",
        required: false,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.errors).toEqual([
      expect.objectContaining({ code: "downstream_connection_failed" }),
    ]);
    expect(res.warnings).toHaveLength(0);
  });

  it("optional server declared but a DIFFERENT server failing transport → no skip", async () => {
    const engine = makeEngine(true);
    const res = await engine.execute(
      {
        operationId: "insight-check",
        type: "mcpTool",
        server: "insight",
        capability: "experience_search",
        required: false,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.errors[0]).toEqual(
      expect.objectContaining({ code: "downstream_connection_failed" }),
    );
  });

  it("no downstream invoker at all + optional server + non-required op → skipped(capability-absent)", async () => {
    const engine = new OperationEngine();
    engine.setOptionalCapabilityServers(["gitnexus"]);
    const res = await engine.execute(
      {
        operationId: "gitnexus-check",
        type: "mcpTool",
        server: "gitnexus",
        capability: "check",
        required: false,
      },
      ctx,
      1,
    );
    expect(res.status).toBe("skipped");
    expect(res.data.reason).toBe("capability-absent");
  });
});
