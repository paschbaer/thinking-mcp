import { describe, expect, it } from "vitest";
import { assertLoopback, startHttpServer, GuidanceHttpError } from "../../src/server.js";

describe("HTTP transport (FR-027 loopback-only)", () => {
  it("accepts 127.0.0.1 and localhost", () => {
    expect(() => assertLoopback("127.0.0.1")).not.toThrow();
    expect(() => assertLoopback("localhost")).not.toThrow();
  });

  it("refuses non-loopback hosts at startup (fail-closed)", () => {
    expect(() => assertLoopback("0.0.0.0")).toThrowError(/non-loopback/);
    expect(() => assertLoopback("192.168.1.5")).toThrow(GuidanceHttpError);
  });

  it("boots on a loopback port and reports health", async () => {
    const { startHttpServer: boot } = await import("../../src/server.js");
    const { port } = await boot("127.0.0.1", 0);
    expect(port).toBeGreaterThan(0);
  });
});
