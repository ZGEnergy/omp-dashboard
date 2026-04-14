/**
 * Shared constants for the managed install directory (~/.pi-dashboard/).
 * Single source of truth — all packages import from here.
 */
import path from "node:path";
import os from "node:os";

/** Root directory for managed installs (pi, openspec, tsx). */
export const MANAGED_DIR = path.join(os.homedir(), ".pi-dashboard");

/** Bin directory for managed install executables. */
export const MANAGED_BIN = path.join(MANAGED_DIR, "node_modules", ".bin");

/** Path to pi's global settings file. */
export const PI_SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");
