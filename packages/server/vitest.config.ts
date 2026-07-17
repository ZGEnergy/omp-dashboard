import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: "50%",
    globalSetup: ["@blackbelt-technology/pi-dashboard-shared/test-support/setup-home.ts"],
    // Config-relative path (not the package name) so the worktree-local source
    // wins over the hoisted-workspace node_modules symlink, mirroring the
    // client config's resolve.alias rationale. See change: parallelize-test-suite.
    setupFiles: [path.resolve(__dirname, "../shared/src/test-support/setup-home-perfile.ts")],
  },
  resolve: {
    // Worktree-local shared source wins over hoisted node_modules symlink so
    // new modules (e.g. event-window) resolve during tests. Mirrors client.
    alias: {
      "@blackbelt-technology/pi-dashboard-shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
