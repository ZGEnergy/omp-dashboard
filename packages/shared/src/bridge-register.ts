/**
 * Shared bridge extension registration for pi's settings.json.
 * Used by both the server and Electron app to register the dashboard
 * bridge extension so pi sessions can discover and load it.
 *
 * Single source of truth — replaces the near-identical implementations
 * in packages/server/src/extension-register.ts and
 * packages/electron/src/lib/bridge-register.ts.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Find the bundled extension directory relative to a base directory.
 * Looks for `packages/extension/` (monorepo layout) under baseDir.
 *
 * Returns null if:
 * - Directory not found
 * - No package.json in the directory
 * - Path is under /tmp/.mount_* (unstable AppImage mount)
 */
export function findBundledExtension(baseDir: string): string | null {
  const candidate = path.resolve(baseDir, "packages", "extension");
  if (!fs.existsSync(candidate) || !fs.existsSync(path.join(candidate, "package.json"))) {
    return null;
  }

  // Reject unstable AppImage temp mount paths
  if (candidate.includes("/tmp/.mount_")) {
    console.warn("[dashboard] AppImage detected — extension path is temporary, skipping registration:", candidate);
    return null;
  }

  return candidate;
}

/**
 * Register an extension path in pi's settings.json packages array.
 *
 * Non-destructive cleanup: only removes dashboard-related paths
 * that point to non-existent directories or directories without package.json.
 * Existing valid registrations (dev, global, other bundled) are preserved.
 *
 * No-op if the path is already registered.
 */
export function registerBridgeExtension(extensionPath: string): void {
  // Compute at call time so tests can override HOME
  const settingsPath = path.join(
    process.env.HOME || process.env.USERPROFILE || os.homedir(),
    ".pi", "agent", "settings.json",
  );
  const settingsDir = path.dirname(settingsPath);
  fs.mkdirSync(settingsDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf-8").trim();
      if (raw) settings = JSON.parse(raw);
    }
  } catch { /* start fresh */ }

  const packages = Array.isArray(settings.packages) ? settings.packages as string[] : [];

  // Already registered?
  if (packages.includes(extensionPath)) return;

  // Non-destructive cleanup: only remove broken dashboard paths
  const cleaned = packages.filter((p) => {
    if (typeof p !== "string") return true;
    const isLocalPath = p.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(p);
    if (!isLocalPath) return true;
    // Only consider dashboard-related paths for cleanup
    if (!p.includes("pi-dashboard") && !p.includes("pi-agent-dashboard")) return true;
    // Keep paths that point to existing directories with a package.json
    try {
      return fs.existsSync(p) && fs.existsSync(path.join(p, "package.json"));
    } catch {
      return false; // Can't check — treat as stale
    }
  });

  cleaned.push(extensionPath);
  settings.packages = cleaned;

  try {
    const tmp = settingsPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
    fs.renameSync(tmp, settingsPath);
    console.log(`[dashboard] Registered bridge extension in pi settings: ${extensionPath}`);
  } catch (err) {
    console.error("[dashboard] Failed to register bridge extension:", err);
  }
}
