/**
 * Managed install paths for the Electron app.
 * Mirrors packages/shared/src/managed-paths.ts but defined locally
 * to avoid importing from @blackbelt-technology/pi-dashboard-shared
 * (which is not on the ESM resolution path in packaged Electron apps).
 */
import path from "node:path";
import os from "node:os";

/** Root directory for managed installs (pi, openspec, tsx). */
export const MANAGED_DIR = path.join(os.homedir(), ".omp-dashboard");

/** Bin directory for managed install executables. */
export const MANAGED_BIN = path.join(MANAGED_DIR, "node_modules", ".bin");

/** Path to pi's global settings file. */
export const OMP_SETTINGS_PATH = path.join(os.homedir(), ".omp", "agent", "settings.json");
