/**
 * Runtime fix for node-pty spawn-helper permissions.
 *
 * On macOS/Linux, the prebuilt spawn-helper binary may lack the execute bit
 * (especially in Electron bundles where npm hoisting skips the postinstall fix).
 * This module finds and fixes all spawn-helper binaries at runtime.
 *
 * Called once when the terminal manager is created.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

let fixed = false;

export function fixPtyPermissions(): void {
  if (fixed || process.platform === "win32") return;
  fixed = true;

  try {
    // Resolve node-pty's actual location (works with hoisting)
    const require_ = createRequire(import.meta.url);
    const ptyMain = require_.resolve("node-pty");
    const ptyDir = path.dirname(ptyMain);
    const prebuildsDir = path.join(ptyDir, "..", "prebuilds");

    if (!fs.existsSync(prebuildsDir)) return;

    for (const dir of fs.readdirSync(prebuildsDir)) {
      const helper = path.join(prebuildsDir, dir, "spawn-helper");
      try {
        const stat = fs.statSync(helper);
        if (!(stat.mode & 0o111)) {
          fs.chmodSync(helper, 0o755);
          console.log(`[pty] Fixed spawn-helper permissions: ${helper}`);
        }
      } catch {
        // spawn-helper doesn't exist for this platform, skip
      }
    }
  } catch {
    // node-pty not installed or not resolvable, skip silently
  }
}
