import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fingerprintArgs,
  OperationRegistry,
} from "../src/operation-registry.js";

function newRegistry(): { registry: OperationRegistry; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "opreg-"));
  return { registry: new OperationRegistry(dir), dir: join(dir, "operations") };
}

describe("OperationRegistry", () => {
  it("begin creates an in_flight record; a retry of the same scope is idempotent (FR-2)", async () => {
    const { registry, dir } = newRegistry();
    const fp = fingerprintArgs({ a: 1 });
    const first = await registry.begin("session-1", "submit_phase", fp);
    expect(first.created).toBe(true);
    expect(first.record.status).toBe("in_flight");

    const retry = await registry.begin("session-1", "submit_phase", fp);
    expect(retry.created).toBe(false);
    expect(retry.record.operationId).toBe(first.record.operationId);

    const persisted = JSON.parse(
      readFileSync(join(dir, "session-1.json"), "utf8"),
    );
    expect(Object.keys(persisted.operations)).toEqual(["submit_phase"]);
  });

  it("complete/fail finalize the record and the outcome stays retrievable (FR-3)", async () => {
    const { registry } = newRegistry();
    await registry.begin("session-1", "t", fingerprintArgs({}));
    await registry.complete("session-1", "t", { ok: true });
    const rec = await registry.get("session-1", "t");
    expect(rec?.status).toBe("succeeded");
    expect(rec?.result).toEqual({ ok: true });

    await registry.begin("session-2", "t", fingerprintArgs({}));
    await registry.fail("session-2", "t", {
      code: "gate_failed",
      message: "lint failed",
      recoverable: true,
    });
    const failed = await registry.get("session-2", "t");
    expect(failed?.status).toBe("failed");
    expect(failed?.error?.code).toBe("gate_failed");
  });

  it("fingerprintArgs is order-independent and payload-sensitive (F5 diagnostics)", () => {
    expect(fingerprintArgs({ a: 1, b: [2, 3] })).toBe(
      fingerprintArgs({ b: [2, 3], a: 1 }),
    );
    expect(fingerprintArgs({ a: 1 })).not.toBe(fingerprintArgs({ a: 2 }));
  });

  it("concurrent begin/get/complete on one session never tears the file (F1/F4 + S016-N1)", async () => {
    const { registry, dir } = newRegistry();
    const file = join(dir, "session-x.json");
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        (async () => {
          const { created } = await registry.begin(
            "session-x",
            "tool",
            `fp-${i}`,
          );
          if (created) {
            await registry.complete("session-x", "tool", { i });
          }
          await registry.allFor("session-x");
        })(),
      ),
    );
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(data.version).toBe(1);
    expect(Object.keys(data.operations)).toEqual(["tool"]);
    expect(["in_flight", "succeeded", "failed"]).toContain(
      data.operations.tool.status,
    );
  });

  it("S016-N1: allFor reconcile cannot overwrite a concurrently begun record", async () => {
    // Simulate the reboot race: the file holds a stale in_flight record from
    // a PREVIOUS boot; a concurrent get/allFor (reconcile) and a begin must
    // serialize so the freshly begun record survives the stale save.
    const { registry, dir } = newRegistry();
    const file = join(dir, "session-y.json");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          version: 1,
          operations: {
            tool: {
              operationId: "op-old",
              tool: "tool",
              sessionId: "session-y",
              fingerprint: "old",
              status: "in_flight",
              acceptedAt: new Date().toISOString(),
              bootId: "boot-previous",
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    const [, , rec] = await Promise.all([
      registry.allFor("session-y"),
      registry.get("session-y", "tool"),
      registry.begin("session-y", "tool", fingerprintArgs({ fresh: true })),
    ]);
    expect(rec.created).toBe(true);
    const after = JSON.parse(readFileSync(file, "utf8"));
    expect(after.operations.tool.operationId).toBe(rec.record.operationId);
    expect(after.operations.tool.bootId).not.toBe("boot-previous");
  });

  it("S016-N2: the per-session mutex map does not grow unboundedly", async () => {
    const { registry } = newRegistry();
    for (let i = 0; i < 25; i++) {
      await registry.begin(`session-${i}`, "t", "fp");
      await registry.complete(`session-${i}`, "t", {});
    }
    // Allow the eviction microtasks to run.
    await new Promise((r) => setTimeout(r, 0));
    const internal = registry as unknown as { mutexes: Map<string, unknown> };
    expect(internal.mutexes.size).toBe(0);
  });
});
