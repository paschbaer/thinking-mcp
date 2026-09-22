import { describe, expect, it } from "vitest";
import { createGuidanceServer } from "../../src/mcp-server/GuidanceServer.js";
import { GUIDANCE_SERVER_NAME, SERVER_VERSION } from "../../src/index.js";

describe("upstream MCP server skeleton (T015, FR-016/027/031)", () => {
  it("creates an McpServer instance with Guidance identity", () => {
    const server = createGuidanceServer();
    expect(server).toBeTruthy();
    expect(typeof server.connect).toBe("function");
  });

  it("exports stable server identity", () => {
    expect(GUIDANCE_SERVER_NAME).toBe("guidance");
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
