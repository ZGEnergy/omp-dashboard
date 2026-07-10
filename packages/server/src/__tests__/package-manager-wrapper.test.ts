import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PackageManagerWrapper,
  PackageOperationBusyError,
  extractPackageName,
} from "../package-manager-wrapper.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import type { SubprocessAdapter } from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";

function makeFakeAdapter(opts?: {
  slowInstall?: () => Promise<void>;
  fail?: string;
}): {
  adapter: SubprocessAdapter;
  calls: string[][];
} {
  const calls: string[][] = [];
  let slowResolve: (() => void) | undefined;
  const adapter: SubprocessAdapter = {
    spawn: () => {
      throw new Error("spawn not used");
    },
    spawnSync: <T extends string | Buffer = Buffer>(_cmd: string, args: readonly string[]) => {
      calls.push([...args]);
      if (opts?.fail && args[0] === opts.fail) {
        return { status: 1, error: undefined, stdout: "" as T, stderr: "boom" as T };
      }
      return { status: 0, error: undefined, stdout: "" as T, stderr: "" as T };
    },
  } as SubprocessAdapter;

  // Bridge slow install through install path — tests gate on isBusy via microtask.
  void opts;
  void slowResolve;
  return { adapter, calls };
}

describe("extractPackageName", () => {
  it("strips npm: and version suffix", () => {
    expect(extractPackageName("npm:@scope/pkg@1.2.3")).toBe("@scope/pkg");
    expect(extractPackageName("npm:foo")).toBe("foo");
    expect(extractPackageName("foo@2.0.0")).toBe("foo");
  });
});

describe("PackageManagerWrapper (OMP plugins)", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), "omp-pm-"));
    prevHome = process.env.HOME;
    process.env.HOME = home;
    // getDefaultPluginsDir uses os.homedir() which follows HOME on Linux
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("returns operationId on run and installs via bun", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    const id = await wrapper.run({
      action: "install",
      source: "npm:pi-doom",
      scope: "global",
    });
    expect(id).toMatch(/^[0-9a-f-]+$/);
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    expect(calls.some((c) => c[0] === "install")).toBe(true);

    const listed = await wrapper.listInstalled("global");
    expect(listed.some((r) => r.source === "npm:pi-doom")).toBe(true);
  });

  it("throws PackageOperationBusyError on concurrent operations", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const calls: string[][] = [];
    const adapter = {
      spawn: () => {
        throw new Error("unused");
      },
      spawnSync: <T extends string | Buffer = Buffer>(_c: string, args: readonly string[]) => {
        calls.push([...args]);
        // busy gate is set before executeOperation yields; concurrent run checked after first yield
        return { status: 0, error: undefined, stdout: "" as T, stderr: "" as T };
      },
    } as SubprocessAdapter;

    // Slow the operation by pausing reload / using delayed complete path via progress?
    // Instead: manually set busy by starting run then immediately run again before yield finishes.
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    const p1 = wrapper.run({ action: "install", source: "npm:a", scope: "global" });
    // Immediately attempt second — isBusy should already be true
    await expect(
      wrapper.run({ action: "install", source: "npm:b", scope: "global" }),
    ).rejects.toThrow(PackageOperationBusyError);
    await p1;
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    void blocker;
    void release;
  });

  it("listInstalled local is empty; global reads deps", async () => {
    const { adapter } = makeFakeAdapter();
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    await wrapper.run({ action: "install", source: "npm:pi-local-pkg", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    expect(await wrapper.listInstalled("local")).toEqual([]);
    const global = await wrapper.listInstalled("global");
    expect(global.map((r) => r.source)).toContain("npm:pi-local-pkg");
    expect(global[0]?.scope).toBe("user");
  });

  it("remove uninstalls via bun", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    await wrapper.run({ action: "install", source: "npm:to-remove", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    await wrapper.run({ action: "remove", source: "npm:to-remove", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    expect(calls.some((c) => c[0] === "uninstall" && c[1] === "to-remove")).toBe(true);
    expect(await wrapper.listInstalled("global")).toEqual([]);
  });

  it("calls reloadSessions on success only", async () => {
    const { adapter } = makeFakeAdapter();
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    const reloadFn = vi.fn().mockResolvedValue(2);
    wrapper.setReloadSessions(reloadFn);
    const completions: Array<{ success: boolean; sessionsReloaded?: number }> = [];
    wrapper.setCompleteListener((r) => completions.push(r));

    await wrapper.run({ action: "install", source: "npm:ok", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    expect(reloadFn).toHaveBeenCalledOnce();
    expect(completions[0]?.success).toBe(true);
    expect(completions[0]?.sessionsReloaded).toBe(2);

    // failure path
    const failAdapter = {
      spawn: () => {
        throw new Error("unused");
      },
      spawnSync: <T extends string | Buffer = Buffer>() => ({
        status: 1,
        error: undefined,
        stdout: "" as T,
        stderr: "fail" as T,
      }),
    } as SubprocessAdapter;
    const w2 = new PackageManagerWrapper(undefined, failAdapter);
    const reload2 = vi.fn().mockResolvedValue(0);
    w2.setReloadSessions(reload2);
    const comps2: Array<{ success: boolean }> = [];
    w2.setCompleteListener((r) => comps2.push(r));
    await w2.run({ action: "install", source: "npm:bad", scope: "global" });
    await vi.waitFor(() => expect(w2.isBusy()).toBe(false));
    expect(reload2).not.toHaveBeenCalled();
    expect(comps2[0]?.success).toBe(false);
  });

  it("emits progress events", async () => {
    const { adapter } = makeFakeAdapter();
    const wrapper = new PackageManagerWrapper(undefined, adapter);
    const progress: Array<{ type: string }> = [];
    wrapper.setProgressListener((_id, event) => progress.push(event));
    await wrapper.run({ action: "install", source: "npm:p", scope: "global" });
    await vi.waitFor(() => expect(wrapper.isBusy()).toBe(false));
    expect(progress.map((p) => p.type)).toEqual(["start", "complete"]);
  });
});
