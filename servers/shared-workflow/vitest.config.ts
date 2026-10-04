import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // forks (not threads): matches the per-server convention; registry tests
    // exercise sync fs + promise chains, no native modules involved.
    pool: "forks",
    testTimeout: 15_000,
  },
});
