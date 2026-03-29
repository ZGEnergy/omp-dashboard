/**
 * Fix node-pty spawn-helper permissions after npm install.
 * The prebuilt spawn-helper binary may be installed without execute permission,
 * which causes "posix_spawnp failed" errors on macOS/Linux.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

if (os.platform() === "win32") process.exit(0);

const prebuildsDir = path.join(__dirname, "..", "node_modules", "node-pty", "prebuilds");

try {
  for (const dir of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, dir, "spawn-helper");
    try {
      fs.chmodSync(helper, 0o755);
    } catch {}
  }
} catch {}
