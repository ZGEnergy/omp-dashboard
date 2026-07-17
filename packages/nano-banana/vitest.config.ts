import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    // Match monorepo packages (e.g. shared). Do not pin maxWorkers:1 — Vitest 4
    // rejects mixed maxWorkers within the same sequence.groupOrder.
    maxWorkers: "50%",
    testTimeout: 30000,
  },
});
