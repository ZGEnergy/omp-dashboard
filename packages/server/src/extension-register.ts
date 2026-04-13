/**
 * Ensures the pi-dashboard bridge extension is registered in pi's global settings
 * so all pi sessions (headless or interactive) can discover and load it.
 *
 * On bundled installs (Electron DEB/DMG), the extension lives inside the server
 * bundle at packages/extension/. This module detects the bundled extension path
 * and adds it to ~/.pi/agent/settings.json if not already present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Locate the bundled extension package directory, if it exists. */
function findBundledExtension(): string | null {
  // From packages/server/src/ → ../extension/
  const candidate = path.resolve(__dirname, "..", "..", "extension");
  if (
    fs.existsSync(candidate) &&
    fs.existsSync(path.join(candidate, "package.json"))
  ) {
    return candidate;
  }
  return null;
}

/** Read ~/.pi/agent/settings.json (returns {} if missing/invalid). */
function readSettings(settingsPath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(settingsPath)) return {};
    const raw = fs.readFileSync(settingsPath, "utf-8").trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write settings back to disk atomically. */
function writeSettings(settingsPath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = settingsPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, settingsPath);
}

/**
 * Ensure the bridge extension is registered in pi's global settings.
 * No-op if:
 * - No bundled extension found (development mode uses package.json pi field)
 * - Extension path already present in settings
 */
export function ensureBridgeExtensionRegistered(): void {
  const extPath = findBundledExtension();
  if (!extPath) return; // Not bundled — development mode

  const settingsPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".pi",
    "agent",
    "settings.json",
  );

  const settings = readSettings(settingsPath);
  const packages = Array.isArray(settings.packages) ? settings.packages as string[] : [];

  // Check if already registered (exact path match)
  if (packages.includes(extPath)) return;

  // Remove any stale dashboard extension paths (different install location)
  const cleaned = packages.filter((p) => {
    if (typeof p !== "string") return true;
    // Keep non-local-path entries (npm:, git:, etc.)
    // Local paths start with / (Unix) or X:\ (Windows)
    const isLocalPath = p.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(p);
    if (!isLocalPath) return true;
    // Remove stale dashboard extension paths
    return !p.includes("pi-dashboard");
  });

  cleaned.push(extPath);
  settings.packages = cleaned;

  try {
    writeSettings(settingsPath, settings);
    console.log(`[dashboard] Registered bridge extension in pi settings: ${extPath}`);
  } catch (err) {
    console.error("[dashboard] Failed to register bridge extension:", err);
  }
}
