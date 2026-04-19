/**
 * Fix node-pty native prebuild permissions after npm install.
 *
 * The prebuilt `spawn-helper` (and occasionally `pty.node`) may be unpacked
 * without the execute bit, which causes `posix_spawnp failed` errors when
 * calling `pty.spawn(...)` on macOS/Linux.
 *
 * This script is hoist-aware: it locates `node-pty` via `require.resolve`
 * rather than a hardcoded relative path, so it works whether the dependency
 * is nested under a workspace package's node_modules or hoisted to the
 * workspace root.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

if (os.platform() === "win32") process.exit(0);

let prebuildsDir;
try {
  const ptyPkg = require.resolve("node-pty/package.json");
  prebuildsDir = path.join(path.dirname(ptyPkg), "prebuilds");
} catch {
  // node-pty not installed (e.g. running from a workspace that doesn't depend
  // on it, or the package hasn't been installed yet). Silent no-op.
  process.exit(0);
}

let prebuildDirs;
try {
  prebuildDirs = fs.readdirSync(prebuildsDir);
} catch {
  // prebuilds dir missing — unusual, but not fatal. Silent no-op.
  process.exit(0);
}

for (const dir of prebuildDirs) {
  for (const name of ["spawn-helper", "pty.node"]) {
    const target = path.join(prebuildsDir, dir, name);
    try {
      fs.chmodSync(target, 0o755);
    } catch (err) {
      // Individual chmod failures are logged to stderr (not swallowed) so
      // real problems become visible, but we still try remaining files.
      if (err && err.code !== "ENOENT") {
        process.stderr.write(
          `[fix-pty-permissions] chmod ${target} failed: ${err.message}\n`,
        );
      }
    }
  }
}
