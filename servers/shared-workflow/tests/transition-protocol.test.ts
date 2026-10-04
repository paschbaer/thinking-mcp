import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationRegistry } from "../src/operation-registry.js";
import type { GateEvent, ProgressChannel } from "../src/transition-protocol.js";
import {
  createCumulativeGateObserver,
  hooksFromContext,
} from "../src/transition-protocol.js";

describe("hooksFromContext", () => {
  it("returns empty hooks without a progress channel (FR-9 default path)", () => {
    expect(hooksFromContext(undefined)).toEqual({});
    expect(hooksFromContext({ asyncAcceptance: true })).toEqual({});
  });

  it("maps started/finished to monotonic progress within one group", async () => {
    const sent: Array<{ progress: number; total?: number; message: string }> =
      [];
    const progress: ProgressChannel = {
      token: "tok",
      send: async (u) => {
        sent.push(u);
      },
    };
    const hooks = hooksFromContext({ progress });
    hooks.onGateEvent!({
      operationId: "lint",
      index: 0,
      total: 2,
      phase: "started",
    });
    hooks.onGateEvent!({
      operationId: "lint",
      index: 0,
      total: 2,
      phase: "succeeded",
      status: "succeeded",
    });
    hooks.onGateEvent!({
      operationId: "build",
      index: 1,
      total: 2,
      phase: "started",
    });
    expect(sent.map((s) => s.progress)).toEqual([0, 1, 1]);
    // FR-8: gate status only, never output/credentials.
    expect(sent.every((s) => !JSON.stringify(s).includes("secret"))).toBe(true);
  });

  it("swallows progress-channel failures (progress is best-effort)", async () => {
    const progress: ProgressChannel = {
      token: "tok",
      send: async () => {
        throw new Error("stream gone");
      },
    };
    const hooks = hooksFromContext({ progress });
    expect(() =>
      hooks.onGateEvent!({
        operationId: "lint",
        index: 0,
        total: 1,
        phase: "started",
      }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("createCumulativeGateObserver (S016-N3 multi-group monotonicity)", () => {
  it("progress is cumulative-monotonic across multiple gate groups", async () => {
    const sent: Array<{ progress: number; total?: number }> = [];
    const progress: ProgressChannel = {
      token: "tok",
      send: async (u) => {
        sent.push(u);
      },
    };
    const observe = createCumulativeGateObserver(progress);
    const gate = (
      operationId: string,
      index: number,
      total: number,
      phase: GateEvent["phase"],
    ): GateEvent => ({ operationId, index, total, phase, status: "succeeded" });

    // Group A: two gates.
    observe(gate("a1", 0, 2, "started"));
    observe(gate("a1", 0, 2, "succeeded"));
    observe(gate("a2", 1, 2, "started"));
    observe(gate("a2", 1, 2, "succeeded"));
    // Group B: three gates — progress MUST NOT restart at 0.
    observe(gate("b1", 0, 3, "started"));
    observe(gate("b1", 0, 3, "succeeded"));
    observe(gate("b2", 1, 3, "started"));
    observe(gate("b2", 1, 3, "succeeded"));
    observe(gate("b3", 2, 3, "started"));
    observe(gate("b3", 2, 3, "succeeded"));

    const values = sent.map((s) => s.progress);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(values).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    // total reflects the gates known so far and only ever grows.
    expect(sent.map((s) => s.total)).toEqual([2, 2, 2, 2, 5, 5, 5, 5, 5, 5]);
  });

  it("a failed gate still keeps progress monotonic", () => {
    const sent: Array<{ progress: number }> = [];
    const observe = createCumulativeGateObserver({
      token: "tok",
      send: async (u) => {
        sent.push(u);
      },
    });
    observe({ operationId: "g", index: 0, total: 2, phase: "started" });
    observe({
      operationId: "g",
      index: 0,
      total: 2,
      phase: "failed",
      status: "failed",
    });
    expect(sent.map((s) => s.progress)).toEqual([0, 1]);
  });
});

describe("restart reclassification fixture (S016-RESTART-TEST / F2)", () => {
  it("in_flight records from a previous boot become failed/operation_interrupted on first read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "opreg-restart-"));
    const operationsDir = join(dir, "operations");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(operationsDir, { recursive: true });
    // A registry from a PREVIOUS process boot persisted an in_flight record.
    writeFileSync(
      join(operationsDir, "session-z.json"),
      `${JSON.stringify(
        {
          version: 1,
          operations: {
            submit_phase: {
              operationId: "op-crashed",
              tool: "submit_phase",
              sessionId: "session-z",
              fingerprint: "fp",
              status: "in_flight",
              acceptedAt: new Date().toISOString(),
              bootId: "boot-previous-process",
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    // The server restarts: a NEW registry instance has a NEW bootId.
    const registry = new OperationRegistry(dir);
    const recovered = await registry.allFor("session-z");
    expect(recovered.submit_phase.status).toBe("failed");
    expect(recovered.submit_phase.error?.code).toBe("operation_interrupted");
    expect(recovered.submit_phase.error?.recoverable).toBe(true);
    expect(recovered.submit_phase.completedAt).toBeDefined();

    // The reclassification is persisted (not just in-memory).
    const persisted = JSON.parse(
      readFileSync(join(operationsDir, "session-z.json"), "utf8"),
    );
    expect(persisted.operations.submit_phase.status).toBe("failed");

    // And a resubmit after the interruption creates a fresh record.
    const resubmit = await registry.begin("session-z", "submit_phase", "fp");
    expect(resubmit.created).toBe(true);
    expect(resubmit.record.operationId).not.toBe("op-crashed");
  });
});
