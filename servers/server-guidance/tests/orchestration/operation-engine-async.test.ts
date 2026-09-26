import { describe, expect, it } from "vitest";
import { OperationEngine } from "../../src/orchestration/OperationEngine.js";

/**
 * spec 004 US1 (FR-201): process operations execute on a non-blocking async
 * spawn with parity to the former spawnSync semantics (exit codes, timeout
 * escalation, per-op env, maxBuffer).
 */
const ctx = { workspaceRoot: process.cwd() };

function procOp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operationId: "op",
    type: "process",
    executable: "node",
    args: ["-e", "process.exit(0)"],
    required: false,
    timeoutSeconds: 30,
    validation: { exitCodeMustBeZero: true },
    output: { returnToAgent: "summary_and_errors" },
    ...overrides,
  };
}

describe("async process execution (spec 004 FR-201)", () => {
  it("does not block the event loop: a fast op resolves while a slow op is still pending", async () => {
    const engine = new OperationEngine();
    const slow = engine.execute(
      procOp({ operationId: "slow", args: ["-e", "setTimeout(()=>{},5000)"], timeoutSeconds: 10 }) as never,
      ctx,
      1,
    );
    const fast = engine.execute(procOp({ operationId: "fast" }) as never, ctx, 1);
    const fastRes = await fast;
    expect(fastRes.status).toBe("succeeded"); // would fail under spawnSync (blocked loop)
    const slowRes = await slow;
    expect(slowRes.status).toBe("succeeded");
  }, 20_000);

  it("escalates kill on timeout and reports operation_timed_out well before the child would exit", async () => {
    const engine = new OperationEngine();
    const t0 = Date.now();
    const res = await engine.execute(
      procOp({ operationId: "hang", args: ["-e", "setTimeout(()=>{},60000)"], timeoutSeconds: 1 }) as never,
      ctx,
      1,
    );
    expect(res.status).toBe("timed_out");
    expect(Date.now() - t0).toBeLessThan(10_000); // killed, not waited out
  }, 20_000);

  it("reports non-zero exit codes as failures (parity)", async () => {
    const res = await new OperationEngine().execute(
      procOp({ args: ["-e", "process.exit(3)"] }) as never,
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(res.summary).toMatch(/exit code 3/);
  });

  it("passes per-op environment to the child (GUID-5 parity)", async () => {
    const res = await new OperationEngine().execute(
      procOp({
        args: ["-e", "process.exit(process.env.MY_FLAG === '1' ? 0 : 7)"],
        env: { MY_FLAG: "1" },
      }) as never,
      ctx,
      1,
    );
    expect(res.status).toBe("succeeded");
  });

  it("aborts a running child via signal and resolves as cancelled (FR-202 seam)", async () => {
    const engine = new OperationEngine();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200); // abort mid-run
    const res = await engine.execute(
      procOp({ operationId: "abortable", args: ["-e", "setTimeout(()=>{},60000)"], timeoutSeconds: 30 }) as never,
      ctx,
      1,
      controller.signal,
    );
    expect(res.status).toBe("cancelled");
    expect(res.errors[0]?.code).toBe("operation_cancelled");
    controller.abort(); // idempotent late abort must not throw
  }, 20_000);

  it("maxBuffer parity: exceeding the cap kills the child and fails the op", async () => {
    const res = await new OperationEngine().execute(
      procOp({
        args: ["-e", "console.log('x'.repeat(50000))"],
        output: { returnToAgent: "summary_and_errors", maximumBytes: 1024 },
      }) as never,
      ctx,
      1,
    );
    expect(res.status).toBe("failed");
    expect(JSON.stringify(res.errors)).toMatch(/maxBuffer/);
  }, 20_000);

  it("stderr redaction honours context-configured patterns (final review HIGH-1)", async () => {
    const engine = new OperationEngine();
    const res = await engine.execute(
      procOp({ args: ["-e", "console.error('corp_token: xyz123secretvalue'); process.exit(3)"] }) as never,
      { ...ctx, redactionPatterns: ["corp_token"] },
      1,
    );
    expect(res.status).toBe("failed");
    const message = res.errors[0]?.message ?? "";
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("xyz123secretvalue");
  });
});
