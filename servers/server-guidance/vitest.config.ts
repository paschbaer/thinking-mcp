import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // forks (statt threads): loopback-HTTP-Tests (stateful MCP-Sessions über
    // StreamableHTTPClientTransport) hängen im threads-Pool, weil der
    // Request-Body-Stream des SDK-Clients kein 'end' auslöst.
    pool: "forks",
  },
});
