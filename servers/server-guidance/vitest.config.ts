import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // Scaffold phase: first test files land in Phase 2 (T006). Remove once
    // tests/contract/config-loader.test.ts exists.
    passWithNoTests: true,
  },
});
