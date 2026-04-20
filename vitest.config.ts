import { defineConfig } from "vitest/config";

/**
 * Root Vitest config (Vitest 4+).
 *
 * Vitest 4 dropped `vitest.workspace.ts` support — projects must live under
 * `test.projects` here. Each entry points at a per-package vitest.config.ts
 * which carries the package-specific `environment` (jsdom for client, node
 * for server/shared/extension), include globs, and pool settings.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/shared",
      "packages/server",
      "packages/extension",
      "packages/client",
    ],
  },
});
