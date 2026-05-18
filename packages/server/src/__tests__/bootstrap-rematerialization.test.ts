/**
 * Acceptance test for Failure 1 of streamline-electron-bootstrap-and-recovery.
 *
 * Pins the contract that `materializeWorkspaceSymlinks(managedDir)` rebuilds
 * the `@blackbelt-technology/*` scope dir from the workspace sources under
 * `<managedDir>/packages/`, so a post-`npm install` wipe is recoverable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  materializeWorkspaceSymlinks,
  BUNDLED_WORKSPACE_PKGS,
} from "@blackbelt-technology/pi-dashboard-shared/managed-workspace-materialize.js";

const WORKSPACE_PKG_MAP: Record<string, string> = {
  "pi-dashboard-shared": "shared",
  "pi-dashboard-server": "server",
  "pi-dashboard-extension": "extension",
  "dashboard-plugin-runtime": "dashboard-plugin-runtime",
};

function seedWorkspaceSource(managedDir: string, shortname: string, name: string): void {
  const dir = path.join(managedDir, "packages", shortname);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, version: "0.0.1-test" }, null, 2),
  );
  // Plant a marker file so we can verify the copy is real.
  fs.writeFileSync(path.join(dir, "marker.txt"), `marker-${shortname}\n`);
}

function seedBuiltClient(managedDir: string): void {
  const dir = path.join(managedDir, "packages", "dist", "client");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
  // Plant a synthetic client/package.json for the helper to pull metadata from.
  const clientPkgDir = path.join(managedDir, "packages", "client");
  fs.mkdirSync(clientPkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(clientPkgDir, "package.json"),
    JSON.stringify({ name: "@blackbelt-technology/pi-dashboard-web", version: "0.0.1-test" }, null, 2),
  );
}

describe("materializeWorkspaceSymlinks (Failure 1 acceptance)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-rematerialize-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rebuilds every scope-dir entry after an npm-install wipe", () => {
    // Seed workspace sources for the 4 workspace-backed packages.
    for (const [name, shortname] of Object.entries(WORKSPACE_PKG_MAP)) {
      seedWorkspaceSource(tmp, shortname, name);
    }
    seedBuiltClient(tmp);

    // Simulate the wipe: scope dir absent.
    const scopeDir = path.join(tmp, "node_modules", "@blackbelt-technology");
    expect(fs.existsSync(scopeDir)).toBe(false);

    const result = materializeWorkspaceSymlinks(tmp);

    expect(result.errors).toEqual({});
    // Every expected package should now exist in the scope dir.
    for (const name of BUNDLED_WORKSPACE_PKGS) {
      const dest = path.join(scopeDir, name);
      expect(fs.existsSync(dest)).toBe(true);
      expect(result.materialized).toContain(name);
    }
    // pi-dashboard-web must have a `dist/index.html`.
    expect(
      fs.existsSync(path.join(scopeDir, "pi-dashboard-web", "dist", "index.html")),
    ).toBe(true);
    // pi-dashboard-web's package.json `name` must match for createRequire.resolve().
    const webPkg = JSON.parse(
      fs.readFileSync(
        path.join(scopeDir, "pi-dashboard-web", "package.json"),
        "utf-8",
      ),
    );
    expect(webPkg.name).toBe("@blackbelt-technology/pi-dashboard-web");
  });

  it("is idempotent — re-running skips already-materialized entries", () => {
    for (const [name, shortname] of Object.entries(WORKSPACE_PKG_MAP)) {
      seedWorkspaceSource(tmp, shortname, name);
    }
    seedBuiltClient(tmp);

    materializeWorkspaceSymlinks(tmp);
    const result2 = materializeWorkspaceSymlinks(tmp);

    expect(result2.materialized).toEqual([]);
    expect(result2.skipped.length).toBe(BUNDLED_WORKSPACE_PKGS.length);
  });

  it("records missingSource when workspace source is absent — does not throw", () => {
    // Only seed one of four workspace-backed packages.
    seedWorkspaceSource(tmp, "shared", "pi-dashboard-shared");

    const result = materializeWorkspaceSymlinks(tmp);

    expect(result.materialized).toContain("pi-dashboard-shared");
    expect(result.missingSource).toContain("pi-dashboard-server");
    expect(result.missingSource).toContain("pi-dashboard-extension");
    expect(result.missingSource).toContain("dashboard-plugin-runtime");
    expect(result.missingSource).toContain("pi-dashboard-web");
  });

  it("preserves user-installed extensions in the scope dir (no force)", () => {
    for (const [name, shortname] of Object.entries(WORKSPACE_PKG_MAP)) {
      seedWorkspaceSource(tmp, shortname, name);
    }
    seedBuiltClient(tmp);

    // Pre-populate scope dir with a user-installed extension.
    const userExt = path.join(
      tmp,
      "node_modules",
      "@blackbelt-technology",
      "pi-some-user-extension",
    );
    fs.mkdirSync(userExt, { recursive: true });
    fs.writeFileSync(path.join(userExt, "marker.txt"), "user\n");

    materializeWorkspaceSymlinks(tmp);

    expect(fs.existsSync(path.join(userExt, "marker.txt"))).toBe(true);
  });

  it("preserves pre-existing scope-dir entries by default (idempotency invariant)", () => {
    for (const [name, shortname] of Object.entries(WORKSPACE_PKG_MAP)) {
      seedWorkspaceSource(tmp, shortname, name);
    }
    seedBuiltClient(tmp);

    // Pre-populate one expected entry with a sentinel file.
    const dest = path.join(
      tmp,
      "node_modules",
      "@blackbelt-technology",
      "pi-dashboard-server",
    );
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "sentinel.txt"), "preexisting\n");

    const result = materializeWorkspaceSymlinks(tmp);

    expect(result.skipped).toContain("pi-dashboard-server");
    expect(result.materialized).not.toContain("pi-dashboard-server");
    expect(fs.existsSync(path.join(dest, "sentinel.txt"))).toBe(true);
  });
});
