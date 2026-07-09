import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PackageManagerWrapper } from "../package-manager-wrapper.js";
import type { SubprocessAdapter } from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";
import type { OperationResult, ProgressEvent } from "../package-manager-wrapper.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Helper: redirect os.homedir() by setting the env vars libuv reads.
 * Returns a cleanup function that restores the original values.
 */
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

interface MockSubprocessAdapter extends SubprocessAdapter {
  calls: Array<{ command: string; args: readonly string[] }>;
}

/**
 * Create a mock SubprocessAdapter that records spawnSync calls and
 * returns configurable results.
 */
function makeMockAdapter(): MockSubprocessAdapter {
  const calls: MockSubprocessAdapter["calls"] = [];
  return {
    calls,
    spawn(command: string, args?: readonly string[]) {
      void command;
      void args;
      throw new Error("spawn not implemented in mock");
    },
    spawnSync<T extends string | Buffer = Buffer>(command: string, args: readonly string[] = []) {
      calls.push({ command, args });
      return {
        pid: -1,
        output: [],
        stdout: "" as unknown as T,
        stderr: "" as unknown as T,
        status: 0,
        signal: null,
        error: undefined,
      };
    },
  };
}

/**
 * Set up a fake OMP plugins directory with the given dependencies.
 */
function setupPluginsDir(pluginsDir: string, deps: Record<string, string>): void {
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginsDir, "package.json"),
    JSON.stringify({ name: "omp-plugins", private: true, dependencies: deps }, null, 2) + "\n",
    "utf-8",
  );
  // Create a minimal lockfile
  fs.writeFileSync(
    path.join(pluginsDir, "omp-plugins.lock.json"),
    JSON.stringify({ plugins: {} }, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Create a fake node_modules entry for a package.
 */
function createFakePackage(pluginsDir: string, name: string, version: string, description?: string): void {
  const pkgDir = path.join(pluginsDir, "node_modules", name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, version, description: description ?? `Fake ${name}` }, null, 2) + "\n",
    "utf-8",
  );
}

describe("PackageManagerWrapper", () => {
  let wrapper: PackageManagerWrapper;
  let mockAdapter: MockSubprocessAdapter;
  let tmpHome: string;
  let pluginsDir: string;
  let cleanupHome: (() => void) | undefined;

  beforeEach(() => {
    // Create ephemeral temp home so the module-level OMP_PLUGINS_DIR
    // resolves to our test directory.
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pmw-omp-test-"));
    pluginsDir = path.join(tmpHome, ".omp", "plugins");
    setupPluginsDir(pluginsDir, {
      "pi-doom": "npm:pi-doom@1.0.0",
      "pi-local": "npm:pi-local@2.0.0",
    });
    createFakePackage(pluginsDir, "pi-doom", "1.0.0", "Doom clone");
    createFakePackage(pluginsDir, "pi-local", "2.0.0", "Local helper");

    cleanupHome = withFakeHome(tmpHome);
    // Re-evaluate module-level constants by resetting modules
    vi.resetModules();
    mockAdapter = makeMockAdapter();
  });

  afterEach(() => {
    cleanupHome?.();
    cleanupHome = undefined;
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    } catch { /* ignore */ }
    vi.restoreAllMocks();
    vi.doUnmock("../npm-search-proxy.js");
  });

  /**
   * Dynamically import the wrapper after HOME is set so module-level
   * constants (OMP_PLUGINS_DIR) resolve to the temp directory.
   */
  async function createWrapper(adapter?: SubprocessAdapter): Promise<PackageManagerWrapper> {
    const mod = await import("../package-manager-wrapper.js");
    return new mod.PackageManagerWrapper(adapter ?? mockAdapter);
  }

  it("returns operationId on run", async () => {
    wrapper = await createWrapper();
    const id = await wrapper.run({ action: "install", source: "npm:test-pkg", scope: "global" });
    expect(id).toMatch(/^[0-9a-f-]+$/);
  });

  it("throws PackageOperationBusyError on concurrent operations", async () => {
    wrapper = await createWrapper();

    // Start first operation — sets busy=true; do NOT await so the
    // operation stays in flight when we test the second call.
    const firstRun = wrapper.run({ action: "install", source: "npm:a", scope: "global" });

    // The wrapper should now be busy (executeOperation is running async)
    // Second run should throw
    await expect(
      wrapper.run({ action: "install", source: "npm:b", scope: "global" }),
    ).rejects.toThrow(expect.objectContaining({ name: "PackageOperationBusyError" }));

    // Cleanup: await the first operation
    const opId = await firstRun;
    expect(opId).toMatch(/^[0-9a-f-]+$/);
  });

  it("forwards progress events via listener", async () => {
    wrapper = await createWrapper();

    const progressEvents: Array<{ opId: string; event: ProgressEvent }> = [];
    wrapper.setProgressListener((opId, event) => {
      progressEvents.push({ opId, event });
    });

    const opId = await wrapper.run({ action: "install", source: "npm:test-pkg", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    expect(progressEvents.length).toBe(2);
    expect(progressEvents[0].opId).toBe(opId);
    expect(progressEvents[0].event.type).toBe("start");
    expect(progressEvents[1].event.type).toBe("complete");
  });

  it("calls reloadSessions on success", async () => {
    wrapper = await createWrapper();

    const reloadFn = vi.fn().mockResolvedValue(3);
    wrapper.setReloadSessions(reloadFn);

    const completions: OperationResult[] = [];
    wrapper.setCompleteListener((result) => completions.push(result));

    await wrapper.run({ action: "install", source: "npm:test-pkg", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    expect(reloadFn).toHaveBeenCalledOnce();
    expect(completions[0].success).toBe(true);
    expect((completions[0] as OperationResult & { sessionsReloaded?: number }).sessionsReloaded).toBe(3);
  });

  it("does NOT call reloadSessions on failure", async () => {
    // Make spawnSync fail
    const failAdapter: SubprocessAdapter = {
      spawn() { throw new Error("not implemented"); },
      spawnSync<T extends string | Buffer = Buffer>() {
        return {
          pid: -1, output: [], stdout: "" as unknown as T, stderr: "bun exploded" as unknown as T,
          status: 1, signal: null, error: undefined,
        };
      },
    };
    wrapper = await createWrapper(failAdapter);

    const reloadFn = vi.fn().mockResolvedValue(0);
    wrapper.setReloadSessions(reloadFn);

    const completions: OperationResult[] = [];
    wrapper.setCompleteListener((result) => completions.push(result));

    await wrapper.run({ action: "install", source: "npm:test-pkg", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    expect(reloadFn).not.toHaveBeenCalled();
    expect(completions[0].success).toBe(false);
    expect(completions[0].error).toMatch(/exited with code 1/);
  });

  it("listInstalled returns OMP plugins for global scope", async () => {
    wrapper = await createWrapper();
    const global = await wrapper.listInstalled("global");
    const sources = global.map((r) => r.source);
    expect(sources).toContain("npm:pi-doom");
    expect(sources).toContain("npm:pi-local");
  });

  it("listInstalled returns empty for local scope", async () => {
    wrapper = await createWrapper();
    const local = await wrapper.listInstalled("local");
    expect(local).toEqual([]);
  });

  it("checkUpdates returns packages with newer versions available", async () => {
    // Mock fetchPackageMeta to return a newer version for pi-doom
    vi.doMock("../npm-search-proxy.js", () => ({
      fetchPackageMeta: vi.fn(async (pkgName: string) => {
        if (pkgName === "pi-doom") return { version: "2.0.0", description: "Doom clone" };
        return { version: "2.0.0", description: "Local helper" };
      }),
    }));

    wrapper = await createWrapper();
    const updates = await wrapper.checkUpdates();

    expect(updates.length).toBeGreaterThanOrEqual(1);
    const doomUpdate = updates.find((u) => u.displayName === "pi-doom");
    expect(doomUpdate).toBeDefined();
    expect(doomUpdate?.latestVersion).toBe("2.0.0");
    expect(doomUpdate?.installedVersion).toBe("1.0.0");
  });

  it("install runs bun install and updates lockfile", async () => {
    wrapper = await createWrapper();

    const completions: OperationResult[] = [];
    wrapper.setCompleteListener((result) => completions.push(result));

    await wrapper.run({ action: "install", source: "npm:new-plugin", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    // Verify bun install was called
    expect(mockAdapter.calls.some((c) => c.command === "bun" && c.args[0] === "install")).toBe(true);

    // Verify package.json was updated
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pluginsDir, "package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkgJson.dependencies["new-plugin"]).toBe("new-plugin");

    // Verify lockfile was updated
    const lock = JSON.parse(fs.readFileSync(path.join(pluginsDir, "omp-plugins.lock.json"), "utf-8")) as {
      plugins: Record<string, { enabled: boolean; version: string }>;
    };
    expect(lock.plugins["new-plugin"]).toBeDefined();
    expect(lock.plugins["new-plugin"].enabled).toBe(true);

    expect(completions[0].success).toBe(true);
  });

  it("remove runs bun uninstall and updates lockfile", async () => {
    wrapper = await createWrapper();

    const completions: OperationResult[] = [];
    wrapper.setCompleteListener((result) => completions.push(result));

    await wrapper.run({ action: "remove", source: "npm:pi-doom", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    // Verify bun uninstall was called with the package name
    expect(mockAdapter.calls.some(
      (c) => c.command === "bun" && c.args[0] === "uninstall" && c.args[1] === "pi-doom",
    )).toBe(true);

    // Verify package.json no longer has pi-doom
    const pkgJson = JSON.parse(fs.readFileSync(path.join(pluginsDir, "package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkgJson.dependencies["pi-doom"]).toBeUndefined();

    expect(completions[0].success).toBe(true);
  });

  it("update runs bun update", async () => {
    wrapper = await createWrapper();

    const completions: OperationResult[] = [];
    wrapper.setCompleteListener((result) => completions.push(result));

    await wrapper.run({ action: "update", source: "npm:pi-doom", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    // Verify bun update was called
    expect(mockAdapter.calls.some(
      (c) => c.command === "bun" && c.args[0] === "update" && c.args[1] === "pi-doom",
    )).toBe(true);

    expect(completions[0].success).toBe(true);
  });

  it("update with empty source runs bun update (all)", async () => {
    wrapper = await createWrapper();

    await wrapper.run({ action: "update", source: "", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));

    // Should call `bun update` without a package name
    expect(mockAdapter.calls.some(
      (c) => c.command === "bun" && c.args[0] === "update" && c.args.length === 1,
    )).toBe(true);
  });
});
