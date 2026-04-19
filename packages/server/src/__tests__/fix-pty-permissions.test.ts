/**
 * Regression test for the postinstall `fix-pty-permissions.cjs` script.
 *
 * Ensures that after `npm install` the native `spawn-helper` binary in the
 * current platform's `node-pty` prebuild directory has at least one execute
 * bit set. Without this, `pty.spawn(...)` fails with "posix_spawnp failed."
 * and the dashboard's "New Terminal" button appears dead.
 */
import { describe, it, expect } from "vitest";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

describe("fix-pty-permissions", () => {
  it.skipIf(process.platform === "win32")(
    "spawn-helper for current platform is executable",
    () => {
      const require = createRequire(import.meta.url);
      const ptyPkg = require.resolve("node-pty/package.json");
      const platformDir =
        process.platform === "darwin"
          ? process.arch === "arm64"
            ? "darwin-arm64"
            : "darwin-x64"
          : process.arch === "arm64"
          ? "linux-arm64"
          : "linux-x64";
      const helper = join(dirname(ptyPkg), "prebuilds", platformDir, "spawn-helper");

      const mode = statSync(helper).mode;
      // At least one execute bit (owner/group/other) must be set.
      expect(mode & 0o111).not.toBe(0);
    },
  );
});
