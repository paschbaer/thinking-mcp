import { describe, expect, it } from "vitest";
import { OperationalLogger } from "../../src/policy/logger.js";

describe("operational logger (FR-059)", () => {
  it("emits JSON lines at or above the minimum level", () => {
    const captured: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    const logger = new OperationalLogger("info");
    logger.info("operation_completed", { operationId: "op-1" });
    logger.debug("should_be_filtered", {});
    process.stderr.write = orig;
    const infoLines = captured.filter((c) => c.includes("operation_completed"));
    expect(infoLines).toHaveLength(1);
    expect(captured.some((c) => c.includes("should_be_filtered"))).toBe(false);
  });

  it("redacts secret-looking values in log payload", () => {
    const logger = new OperationalLogger("info");
    let captured = "";
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      captured += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    logger.warn("operation_failed", { apiKey: "super-secret" });
    process.stderr.write = orig;
    expect(captured).not.toContain("super-secret");
  });
});
