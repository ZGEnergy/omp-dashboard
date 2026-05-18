/**
 * Regression test: `ELECTRON_OWNED_PACKAGES` MUST equal the set of
 * `packages[].name` values declared in `packages/electron/offline-packages.json`.
 *
 * Drift between the two sides indicates either:
 *   - A package was added to the Electron offline bundle without being added
 *     to the whitelist (force-reinstall would not wipe it, leaving stale
 *     copies behind).
 *   - A package was added to the whitelist without being bundled (preflight
 *     would always report it as missing, prompting reinstall every launch
 *     against a registry the offline cacache cannot satisfy).
 *
 * On failure the message identifies exactly which entries are only on each
 * side so the fix is mechanical.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ELECTRON_OWNED_PACKAGES } from "../managed-package-whitelist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const OFFLINE_PACKAGES_PATH = path.join(
  REPO_ROOT,
  "packages",
  "electron",
  "offline-packages.json",
);

interface OfflinePackagesManifest {
  packages?: Array<{ name?: string; version?: string }>;
}

function loadOfflinePackageNames(): Set<string> {
  const raw = readFileSync(OFFLINE_PACKAGES_PATH, "utf8");
  const parsed = JSON.parse(raw) as OfflinePackagesManifest;
  const names = new Set<string>();
  for (const pkg of parsed.packages ?? []) {
    if (pkg.name && typeof pkg.name === "string") {
      names.add(pkg.name);
    }
  }
  return names;
}

function setDiff(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  out.sort();
  return out;
}

describe("managed-package-whitelist parity", () => {
  test("ELECTRON_OWNED_PACKAGES equals offline-packages.json package names", () => {
    const offlineNames = loadOfflinePackageNames();
    const whitelist = new Set(ELECTRON_OWNED_PACKAGES);

    const onlyInWhitelist = setDiff(whitelist, offlineNames);
    const onlyInOffline = setDiff(offlineNames, whitelist);

    if (onlyInWhitelist.length || onlyInOffline.length) {
      const msg = [
        "Whitelist / offline-packages.json drift detected:",
        onlyInWhitelist.length
          ? `  In ELECTRON_OWNED_PACKAGES but NOT in offline-packages.json: ${onlyInWhitelist.join(", ")}`
          : null,
        onlyInOffline.length
          ? `  In offline-packages.json but NOT in ELECTRON_OWNED_PACKAGES: ${onlyInOffline.join(", ")}`
          : null,
        "Fix: update both sides simultaneously. See `packages/shared/src/managed-package-whitelist.ts`.",
      ]
        .filter(Boolean)
        .join("\n");
      throw new Error(msg);
    }

    // Belt-and-suspenders: exact size match too.
    expect(whitelist.size).toBe(offlineNames.size);
  });

  test("ELECTRON_OWNED_PACKAGES is non-empty", () => {
    expect(ELECTRON_OWNED_PACKAGES.size).toBeGreaterThan(0);
  });
});
