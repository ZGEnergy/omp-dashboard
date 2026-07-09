/**
 * Tests for OMP plugin directory resolution in package-manager-wrapper.ts.
 *
 * Verifies that the wrapper correctly reads installed plugins from
 * ~/.omp/plugins/package.json and node_modules, and handles edge cases
 * like missing directories, empty dependencies, and corrupt lockfiles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

/** Override os.homedir() by setting the env vars libuv reads. */
function withFakeHome(tmpHome: string): () => void {
  const prev = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  return () => {
    if (prev.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = prev.HOME;
    if (prev.USERPROFILE === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prev.USERPROFILE;
  };
}

describe("OMP plugin directory resolution", () => {
  const cleanupPaths: string[] = [];
  const restoreFns: Array<() => void> = [];

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const r of restoreFns) r();
    restoreFns.length = 0;
    vi.restoreAllMocks();
    for (const p of cleanupPaths) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    cleanupPaths.length = 0;
  });

  it("reads installed plugins from ~/.omp/plugins when it exists", async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resolve-test-"));
    cleanupPaths.push(tmpHome);

    const pluginsDir = path.join(tmpHome, ".omp", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, "package.json"),
      JSON.stringify({
        name: "omp-plugins",
        private: true,
        dependencies: { "pi-flows": "^1.0.0", "pi-tools": "^2.0.0" },
      }, null, 2) + "\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pluginsDir, "omp-plugins.lock.json"),
      JSON.stringify({ plugins: {} }, null, 2) + "\n",
      "utf-8",
    );

    // Create fake node_modules entries
    for (const [name, version] of [["pi-flows", "1.2.0"], ["pi-tools", "2.1.0"]] as const) {
      const pkgDir = path.join(pluginsDir, "node_modules", name);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name, version }, null, 2) + "\n",
        "utf-8",
      );
    }

    restoreFns.push(withFakeHome(tmpHome));

    const mockAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
      },
    };

    const { PackageManagerWrapper } = await import("../package-manager-wrapper.js");
    const wrapper = new PackageManagerWrapper(mockAdapter);
    const result = await wrapper.listInstalled("global");

    const sources = result.map((r) => r.source);
    expect(sources).toContain("npm:pi-flows");
    expect(sources).toContain("npm:pi-tools");

    const flows = result.find((r) => r.source === "npm:pi-flows");
    expect(flows?.version).toBe("1.2.0");
    expect(flows?.scope).toBe("user");
  });

  it("returns empty list when ~/.omp/plugins/package.json is absent", async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resolve-empty-"));
    cleanupPaths.push(tmpHome);

    // No .omp/plugins directory at all
    restoreFns.push(withFakeHome(tmpHome));

    const mockAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
      },
    };

    const { PackageManagerWrapper } = await import("../package-manager-wrapper.js");
    const wrapper = new PackageManagerWrapper(mockAdapter);
    const result = await wrapper.listInstalled("global");

    expect(result).toEqual([]);
  });

  it("returns empty list for local scope regardless of installed plugins", async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resolve-local-"));
    cleanupPaths.push(tmpHome);

    const pluginsDir = path.join(tmpHome, ".omp", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, "package.json"),
      JSON.stringify({ name: "omp-plugins", private: true, dependencies: { "pi-flows": "^1.0.0" } }, null, 2) + "\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pluginsDir, "omp-plugins.lock.json"),
      JSON.stringify({ plugins: {} }, null, 2) + "\n",
      "utf-8",
    );

    restoreFns.push(withFakeHome(tmpHome));

    const mockAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
      },
    };

    const { PackageManagerWrapper } = await import("../package-manager-wrapper.js");
    const wrapper = new PackageManagerWrapper(mockAdapter);
    const result = await wrapper.listInstalled("local");

    expect(result).toEqual([]);
  });

  it("handles corrupt package.json gracefully", async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resolve-corrupt-"));
    cleanupPaths.push(tmpHome);

    const pluginsDir = path.join(tmpHome, ".omp", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(path.join(pluginsDir, "package.json"), "NOT VALID JSON{{{", "utf-8");

    restoreFns.push(withFakeHome(tmpHome));

    const mockAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
      },
    };

    const { PackageManagerWrapper } = await import("../package-manager-wrapper.js");
    const wrapper = new PackageManagerWrapper(mockAdapter);
    const result = await wrapper.listInstalled("global");

    // Should not throw; returns empty since package.json is unreadable
    expect(result).toEqual([]);
  });

  it("respects lockfile filtered state for disabled plugins", async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "omp-resolve-filtered-"));
    cleanupPaths.push(tmpHome);

    const pluginsDir = path.join(tmpHome, ".omp", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, "package.json"),
      JSON.stringify({
        name: "omp-plugins",
        private: true,
        dependencies: { "pi-flows": "^1.0.0", "pi-tools": "^2.0.0" },
      }, null, 2) + "\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pluginsDir, "omp-plugins.lock.json"),
      JSON.stringify({
        plugins: {
          "pi-flows": { enabled: false, version: "1.0.0" },
          "pi-tools": { enabled: true, version: "2.0.0" },
        },
      }, null, 2) + "\n",
      "utf-8",
    );

    restoreFns.push(withFakeHome(tmpHome));

    const mockAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
      },
    };

    const { PackageManagerWrapper } = await import("../package-manager-wrapper.js");
    const wrapper = new PackageManagerWrapper(mockAdapter);
    const result = await wrapper.listInstalled("global");

    const flows = result.find((r) => r.source === "npm:pi-flows");
    const tools = result.find((r) => r.source === "npm:pi-tools");
    expect(flows?.filtered).toBe(true);
    expect(tools?.filtered).toBe(false);
  });
});
