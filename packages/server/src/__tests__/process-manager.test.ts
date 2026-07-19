import path from "node:path";
import { MANAGED_BIN } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import type { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWslTmuxCacheForTests, buildHeadlessArgs, buildSpawnEnv, buildTmuxCommand as buildTmuxCommandForProduction, type SessionOptions, resetResolver, setResolver, shellEscape, spawnPiSession, stripZellijClientEnv, zellijEnvUnsetPrefix } from "../process-manager.js";

vi.mock("@blackbelt-technology/pi-dashboard-shared/managed-paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blackbelt-technology/pi-dashboard-shared/managed-paths.js")>()),
  MANAGED_BIN: String.raw`C:\Users\Test\.pi-dashboard\node_modules\.bin`,
}));

const { execFileSyncMock, execSyncMock, spawnDetachedMock, spawnSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  execSyncMock: vi.fn(),
  spawnDetachedMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock("@blackbelt-technology/pi-dashboard-shared/platform/detached-spawn.js", async (importOriginal) => ({
  ...(await importOriginal()),
  spawnDetached: spawnDetachedMock,
}));

vi.mock("@blackbelt-technology/pi-dashboard-shared/platform/exec.js", async (importOriginal) => ({
  ...(await importOriginal()),
  execFileSync: execFileSyncMock,
  execSync: execSyncMock,
  spawnSync: spawnSyncMock,
}));

const { readFileSyncMock, realpathSyncMock, statSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  realpathSyncMock: vi.fn((target: string) => target),
  statSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  readFileSync: readFileSyncMock,
  realpathSync: realpathSyncMock,
  statSync: statSyncMock,
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: platform });
}

function makeFakeResolver(piCmd: string[], tools: Record<string, string | null>): ToolResolver {
  return {
    resolvePi: () => piCmd,
    resolveNode: () => "/usr/bin/node",
    which: (tool: string) => tools[tool] ?? null,
    buildSpawnEnv: (env: NodeJS.ProcessEnv) => env,
  } as unknown as ToolResolver;
}

function buildTmuxCommand(cwd: string, sessionExists: boolean, options?: SessionOptions): string {
  return buildTmuxCommandForProduction(cwd, sessionExists, ["pi"], options);
}

beforeEach(() => {
  realpathSyncMock.mockImplementation((target: string) => target);
});

afterEach(() => {
  resetResolver();
  _resetWslTmuxCacheForTests();
  setPlatform(originalPlatform.value);
  readFileSyncMock.mockReset();
  realpathSyncMock.mockReset();
  statSyncMock.mockReset();
  vi.clearAllMocks();
});

// Note: platform-dispatch tests live in packages/shared/src/__tests__/
// spawn-mechanism.test.ts. `detectPlatform` was removed in change:
// consolidate-windows-spawn-and-platform-handlers — its job is now
// owned by platform/spawn-mechanism.ts `selectMechanism`.

describe("Process Manager", () => {
  describe("buildTmuxCommand", () => {
    it("should create new session when no pi-dashboard session exists", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).toContain("new-session");
      expect(cmd).toContain("pi-dashboard");
    });

    it("scrubs ZELLIJ* inside the pane command (tmux session env re-injects)", () => {
      const cmd = buildTmuxCommand("/home/user/project", true);
      expect(cmd).toContain(zellijEnvUnsetPrefix());
      expect(cmd).toMatch(/env -u ZELLIJ -u ZELLIJ_PANE_ID.*pi/);
      // prefix must wrap pi, not only the outer tmux client
      expect(cmd.indexOf("env -u ZELLIJ")).toBeLessThan(cmd.lastIndexOf(" pi"));
    });

    it("scrubs ZELLIJ* for new-session path as well", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).toContain(zellijEnvUnsetPrefix());
      expect(cmd).toContain("new-session");
    });

    it("should create new window when pi-dashboard session exists", () => {
      const cmd = buildTmuxCommand("/home/user/project", true);
      expect(cmd).toContain("new-window");
    });

    it("should not set PI_DASHBOARD_SPAWNED env var", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).not.toContain("PI_DASHBOARD_SPAWNED");
    });

    it("should shell-escape cwd with spaces", () => {
      const cmd = buildTmuxCommand("/home/user/my project", false);
      expect(cmd).toContain("'/home/user/my project'");
      expect(cmd).not.toContain('cd /home/user/my project &&');
    });

    it("should shell-escape cwd with semicolons to prevent injection", () => {
      const cmd = buildTmuxCommand("/tmp/test; rm -rf /", false);
      expect(cmd).toContain("'/tmp/test; rm -rf /'");
    });

    it("should shell-escape cwd with backticks to prevent injection", () => {
      const cmd = buildTmuxCommand("/tmp/`whoami`", false);
      expect(cmd).toContain("'/tmp/`whoami`'");
    });

    it("should shell-escape sessionFile with special characters", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        sessionFile: "/path/to/my session; cat /etc/passwd",
        mode: "continue",
      });
      expect(cmd).toContain("--session '/path/to/my session; cat /etc/passwd'");
    });

    it("should not double-quote safe paths", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      // Safe path should not be wrapped in single quotes
      expect(cmd).toContain("cd /home/user/project &&");
    });

    it("should include --session flag for continue mode", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        sessionFile: "/path/to/session.jsonl",
        mode: "continue",
      });
      expect(cmd).toContain("--session /path/to/session.jsonl");
      expect(cmd).not.toContain("--fork");
    });

    it("should include --fork flag for fork mode", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        sessionFile: "/path/to/session.jsonl",
        mode: "fork",
      });
      expect(cmd).toContain("--fork /path/to/session.jsonl");
      expect(cmd).not.toContain("--session");
    });

    it("should not include session flags when no options provided", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).not.toContain("--session");
      expect(cmd).not.toContain("--fork");
      expect(cmd).not.toContain("--advisor");
    });

    it("adds one --advisor to tmux commands only when true", () => {
      const enabled = buildTmuxCommand("/home/user/project", false, { advisor: true });
      const disabled = buildTmuxCommand("/home/user/project", false, { advisor: false });

      expect(enabled.match(/--advisor/g)).toHaveLength(1);
      expect(disabled).not.toContain("--advisor");
    });

    it("injects the exact spawn token inside tmux pane commands", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        spawnToken: "tmux-token-123",
      });

      expect(cmd).toContain("PI_DASHBOARD_SPAWN_TOKEN=tmux-token-123 pi");
      expect(cmd.indexOf("PI_DASHBOARD_SPAWN_TOKEN=tmux-token-123")).toBeGreaterThan(
        cmd.indexOf("new-window"),
      );
    });

    it("injects the exact spawn token inside WSL tmux pane commands", () => {
      const cmd = `wsl ${buildTmuxCommand("/home/user/project", false, {
        spawnToken: "wsl-token-456",
      })}`;

      expect(cmd).toContain("PI_DASHBOARD_SPAWN_TOKEN=wsl-token-456 pi");
    });

    it("adds one --advisor to WSL tmux commands only when true", () => {
      const wslTmuxCommand = (options?: SessionOptions) =>
        `wsl ${buildTmuxCommand("/home/user/project", false, options)}`;
      const enabled = wslTmuxCommand({ advisor: true });
      const disabled = wslTmuxCommand({ advisor: false });
      const absent = wslTmuxCommand();

      expect(enabled).toMatch(/^wsl tmux /);
      expect(enabled.match(/--advisor/g)).toHaveLength(1);
      expect(disabled).not.toContain("--advisor");
      expect(absent).not.toContain("--advisor");
    });

    it("passes metacharacter-bearing OMP argv to native tmux without an outer shell parse", async () => {
      const piCmd = ["/managed/bin/omp$HOME", "--runtime=`id`", "$literal"];
      setResolver(makeFakeResolver(piCmd, { tmux: "/usr/bin/tmux" }));

      const result = await spawnPiSession(process.cwd(), { advisor: true, spawnToken: "native-token" });

      expect(result.success).toBe(true);
      expect(execSyncMock).not.toHaveBeenCalled();
      expect(execFileSyncMock).toHaveBeenLastCalledWith(
        "/usr/bin/tmux",
        expect.arrayContaining([
          "new-window",
          expect.stringContaining("PI_DASHBOARD_SPAWN_TOKEN=native-token '/managed/bin/omp$HOME' '--runtime=`id`' '$literal' --advisor"),
        ]),
        expect.objectContaining({ stdio: "ignore" }),
      );
    });

    it("resolves OMP inside WSL instead of passing a host Windows resolution to the Linux pane", async () => {
      setPlatform("win32");
      spawnSyncMock.mockReturnValue({ status: 0, stdout: "/home/linux/.local/bin/omp\n" });
      setResolver(makeFakeResolver([String.raw`C:\\Program Files\\OMP\\omp.exe`, "--host-only"], { wt: null }));

      const result = await spawnPiSession(process.cwd(), { advisor: true, spawnToken: "wsl-token" });

      expect(result.success).toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "wsl.exe",
        ["--exec", "sh", "-lc", "command -v omp"],
        expect.objectContaining({ encoding: "utf-8", shell: false }),
      );
      expect(execFileSyncMock).toHaveBeenLastCalledWith(
        "wsl.exe",
        expect.arrayContaining([
          "--exec",
          "tmux",
          expect.stringContaining("PI_DASHBOARD_SPAWN_TOKEN=wsl-token /home/linux/.local/bin/omp --advisor"),
        ]),
        expect.objectContaining({ stdio: "ignore" }),
      );
      expect(execFileSyncMock.mock.calls.at(-1)?.[1].join(" ")).not.toContain("C:\\Program Files\\OMP\\omp.exe");
    });

    it("returns PI_NOT_FOUND when the WSL environment cannot resolve OMP", async () => {
      setPlatform("win32");
      spawnSyncMock
        .mockReturnValueOnce({ status: 0 })
        .mockReturnValueOnce({ status: 1, stdout: "" });
      setResolver(makeFakeResolver([String.raw`C:\\Program Files\\OMP\\omp.exe`], { wt: null }));

      await expect(spawnPiSession(process.cwd())).resolves.toMatchObject({
        success: false,
        code: "PI_NOT_FOUND",
      });
      expect(execFileSyncMock).not.toHaveBeenCalled();
    });

    it("normalizes the managed OMP .cmd shim to Bun plus its CLI script before encoding Windows Terminal argv", async () => {
      const managedOmpShim = path.win32.join(path.win32.normalize(MANAGED_BIN), "omp.cmd");
      const ompPackageDir = path.win32.join(path.win32.dirname(path.win32.normalize(MANAGED_BIN)), "@oh-my-pi", "pi-coding-agent");
      const ompCli = path.win32.join(ompPackageDir, "src", "cli.ts");
      const piCmd = [managedOmpShim, "--percent=%USERPROFILE%", "--ampersand=a&b", "--caret=^value"];
      setPlatform("win32");
      setResolver(makeFakeResolver(piCmd, {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: String.raw`C:\Users\Joe\.bun\bin\bun.exe`,
      }));
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: "src/cli.ts" },
        engines: { bun: ">=1.3.14" },
      }));
      statSyncMock.mockReturnValue({ isFile: () => true });
      spawnDetachedMock.mockResolvedValue({ ok: true, pid: 12345 });

      const result = await spawnPiSession(process.cwd(), { advisor: true, spawnToken: "wt-token" });

      expect(result.success).toBe(true);
      expect(readFileSyncMock).toHaveBeenCalledWith(path.win32.join(ompPackageDir, "package.json"), "utf8");
      const args = spawnDetachedMock.mock.calls.at(-1)?.[0].args as string[];
      expect(args.slice(-6, -1)).toEqual(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"]);
      expect(args).not.toContain("cmd.exe");
      const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
      expect(script).toBe(
        "$env:PI_DASHBOARD_SPAWN_TOKEN = 'wt-token'; " +
        "$pi = 'C:\\Users\\Joe\\.bun\\bin\\bun.exe'; " +
        `$piArgs = @('${ompCli}', '--percent=%USERPROFILE%', '--ampersand=a&b', '--caret=^value', '--advisor'); ` +
        "& $pi @piArgs",
      );
    });

    it("uses the canonical managed CLI target in encoded Windows Terminal argv", async () => {
      const managedOmpShim = path.win32.join(path.win32.normalize(MANAGED_BIN), "omp.cmd");
      const ompPackageDir = path.win32.join(
        path.win32.dirname(path.win32.normalize(MANAGED_BIN)),
        "@oh-my-pi",
        "pi-coding-agent",
      );
      const scriptSpelling = path.win32.join(ompPackageDir, "src", "link", "cli.ts");
      const canonicalCli = path.win32.join(ompPackageDir, "src", "cli.ts");
      setPlatform("win32");
      setResolver(makeFakeResolver([managedOmpShim], {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: String.raw`C:\Users\Joe\.bun\bin\bun.exe`,
      }));
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: "src/link/cli.ts" },
        engines: { bun: ">=1.3.14" },
      }));
      realpathSyncMock.mockImplementation((target: string) =>
        target === scriptSpelling ? canonicalCli : target,
      );
      statSyncMock.mockReturnValue({ isFile: () => true });
      spawnDetachedMock.mockResolvedValue({ ok: true, pid: 12345 });

      await expect(spawnPiSession(process.cwd(), { spawnToken: "canonical-target" })).resolves.toMatchObject({ success: true });

      const args = spawnDetachedMock.mock.calls.at(-1)?.[0].args as string[];
      const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
      expect(script).toContain(`$piArgs = @('${canonicalCli}');`);
      expect(script).not.toContain(scriptSpelling);
    });

    it("normalizes a forward-slash Windows managed OMP shim", async () => {
      const managedOmpShim = path.win32
        .join(path.win32.normalize(MANAGED_BIN), "omp.cmd")
        .replaceAll("\\", "/");
      const ompPackageDir = path.win32.join(
        path.win32.dirname(path.win32.normalize(MANAGED_BIN)),
        "@oh-my-pi",
        "pi-coding-agent",
      );
      const ompCli = path.win32.join(ompPackageDir, "src", "cli.ts");
      setPlatform("win32");
      setResolver(makeFakeResolver([managedOmpShim, "--forward-slash"], {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: String.raw`C:\Users\Joe\.bun\bin\bun.exe`,
      }));
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: "src/cli.ts" },
        engines: { bun: ">=1.3.14" },
      }));
      statSyncMock.mockReturnValue({ isFile: () => true });
      spawnDetachedMock.mockResolvedValue({ ok: true, pid: 12345 });

      await expect(spawnPiSession(process.cwd())).resolves.toMatchObject({ success: true });
      const args = spawnDetachedMock.mock.calls.at(-1)?.[0].args as string[];
      const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
      expect(script).toContain(`$piArgs = @('${ompCli}', '--forward-slash');`);
    });

    it("rejects a CLI target whose realpath escapes the managed package", async () => {
      const managedOmpShim = path.win32.join(path.win32.normalize(MANAGED_BIN), "omp.cmd");
      const ompPackageDir = path.win32.join(
        path.win32.dirname(path.win32.normalize(MANAGED_BIN)),
        "@oh-my-pi",
        "pi-coding-agent",
      );
      setPlatform("win32");
      setResolver(makeFakeResolver([managedOmpShim], {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: String.raw`C:\Users\Joe\.bun\bin\bun.exe`,
      }));
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: "src/cli.ts" },
        engines: { bun: ">=1.3.14" },
      }));
      realpathSyncMock.mockImplementation((target: string) =>
        target === ompPackageDir ? target : String.raw`C:\outside\escaped.ts`,
      );
      statSyncMock.mockReturnValue({ isFile: () => true });

      await expect(spawnPiSession(process.cwd())).resolves.toMatchObject({
        success: false,
        code: "PI_NOT_FOUND",
      });
      expect(statSyncMock).not.toHaveBeenCalled();
      expect(spawnDetachedMock).not.toHaveBeenCalled();
    });

    it.each([
      ["empty", ""],
      ["nonexistent", "src/missing-cli.ts"],
    ])("returns PI_NOT_FOUND for a managed OMP %s CLI target", async (_label, bin) => {
      const managedOmpShim = path.win32.join(path.win32.normalize(MANAGED_BIN), "omp.cmd");
      const piCmd = [managedOmpShim];
      setPlatform("win32");
      setResolver(makeFakeResolver(piCmd, {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: String.raw`C:\Users\Joe\.bun\bin\bun.exe`,
      }));
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: bin },
        engines: { bun: ">=1.3.14" },
      }));
      statSyncMock.mockReturnValue({ isFile: () => false });

      await expect(spawnPiSession(process.cwd(), { spawnToken: "invalid-target" })).resolves.toMatchObject({
        success: false,
        code: "PI_NOT_FOUND",
      });
      expect(spawnDetachedMock).not.toHaveBeenCalled();
    });

    type ManagedRuntimeFixture =
      | [runtime: "bun", extension: ".cmd", engines: { engines: { bun: string } }]
      | [runtime: "node", extension: ".bat", engines: { engines: { node: string } }];

    const managedRuntimeFixtures: ManagedRuntimeFixture[] = [
      ["bun", ".cmd", { engines: { bun: ">=1.3.14" } }],
      ["node", ".bat", { engines: { node: ">=22" } }],
    ];

    it.each(managedRuntimeFixtures)("returns PI_NOT_FOUND when managed %s resolves to a %s shim", async (_runtime, extension, engines) => {
      const managedOmpShim = path.win32.join(path.win32.normalize(MANAGED_BIN), "omp.cmd");
      const ompPackageDir = path.win32.join(path.win32.dirname(path.win32.normalize(MANAGED_BIN)), "@oh-my-pi", "pi-coding-agent");
      setPlatform("win32");
      const runtime = String.raw`C:\Users\Joe\.local\bin\runtime${extension}`;
      setResolver(makeFakeResolver([managedOmpShim], {
        wt: String.raw`C:\Windows\System32\wt.exe`,
        bun: "bun" in engines.engines ? runtime : null,
      }));
      if ("node" in engines.engines) {
        const resolver = makeFakeResolver([managedOmpShim], {
          wt: String.raw`C:\Windows\System32\wt.exe`,
          bun: null,
        });
        resolver.resolveNode = () => runtime;
        setResolver(resolver);
      }
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: "@oh-my-pi/pi-coding-agent",
        bin: { omp: "src/cli.ts" },
        ...engines,
      }));
      statSyncMock.mockReturnValue({ isFile: () => true });

      await expect(spawnPiSession(process.cwd(), { spawnToken: "shim-runtime" })).resolves.toMatchObject({
        success: false,
        code: "PI_NOT_FOUND",
      });
      expect(spawnDetachedMock).not.toHaveBeenCalled();
      expect(readFileSyncMock).toHaveBeenCalledWith(path.win32.join(ompPackageDir, "package.json"), "utf8");
    });

    it("preserves non-.cmd Windows OMP argv without consulting managed metadata", async () => {
      const piCmd = [String.raw`C:\Program Files\OMP\omp.exe`, "--percent=%USERPROFILE%", "--ampersand=a&b"];
      setPlatform("win32");
      setResolver(makeFakeResolver(piCmd, { wt: String.raw`C:\Windows\System32\wt.exe` }));
      spawnDetachedMock.mockResolvedValue({ ok: true, pid: 12345 });

      await expect(spawnPiSession(process.cwd(), { advisor: true, spawnToken: "wt-token" })).resolves.toMatchObject({ success: true });

      expect(readFileSyncMock).not.toHaveBeenCalled();
      const args = spawnDetachedMock.mock.calls.at(-1)?.[0].args as string[];
      const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
      expect(script).toBe(
        "$env:PI_DASHBOARD_SPAWN_TOKEN = 'wt-token'; " +
        "$pi = 'C:\\Program Files\\OMP\\omp.exe'; " +
        "$piArgs = @('--percent=%USERPROFILE%', '--ampersand=a&b', '--advisor'); " +
        "& $pi @piArgs",
      );
    });

    it("should create new session for continue mode when no tmux session exists", () => {
      const cmd = buildTmuxCommand("/home/user/project", false, {
        sessionFile: "/path/to/session.jsonl",
        mode: "continue",
      });
      expect(cmd).toContain("new-session");
      expect(cmd).toContain("--session /path/to/session.jsonl");
    });
  });

  describe("buildHeadlessArgs", () => {
    it("should return --mode rpc for fresh session", () => {
      const args = buildHeadlessArgs();
      expect(args).toEqual(["--mode", "rpc"]);
    });

    it("should include --session for continue mode", () => {
      const args = buildHeadlessArgs({
        sessionFile: "/path/to/session.jsonl",
        mode: "continue",
      });
      expect(args).toEqual(["--mode", "rpc", "--session", "/path/to/session.jsonl"]);
    });

    it("should include --fork for fork mode", () => {
      const args = buildHeadlessArgs({
        sessionFile: "/path/to/session.jsonl",
        mode: "fork",
      });
      expect(args).toEqual(["--mode", "rpc", "--fork", "/path/to/session.jsonl"]);
    });

    it("should not include session flags when no options", () => {
      const args = buildHeadlessArgs({});
      expect(args).toEqual(["--mode", "rpc"]);
    });

    it("adds one --advisor to headless args only when true", () => {
      expect(buildHeadlessArgs({ advisor: true })).toEqual(["--mode", "rpc", "--advisor"]);
      expect(buildHeadlessArgs({ advisor: false })).toEqual(["--mode", "rpc"]);
    });
  });

  describe("spawnPiSession", () => {
    it("should return error for non-existent directory", async () => {
      const result = await spawnPiSession("/tmp/definitely-does-not-exist-" + Date.now());
      expect(result.success).toBe(false);
      expect(result.message).toContain("Directory does not exist");
    });
  });

  describe("SessionOptions strategy field", () => {
    it("should accept tmux strategy", () => {
      const opts: SessionOptions = { strategy: "tmux" };
      expect(opts.strategy).toBe("tmux");
    });

    it("should accept headless strategy", () => {
      const opts: SessionOptions = { strategy: "headless" };
      expect(opts.strategy).toBe("headless");
    });

    it("should allow strategy with session file options", () => {
      const opts: SessionOptions = {
        strategy: "headless",
        sessionFile: "/path/to/session.jsonl",
        mode: "continue",
      };
      const args = buildHeadlessArgs(opts);
      expect(args).toEqual(["--mode", "rpc", "--session", "/path/to/session.jsonl"]);
    });
  });

  describe("buildSpawnEnv", () => {
    it("should prepend managed bin to PATH", () => {
      const env = buildSpawnEnv({ PATH: "/usr/bin" });
      expect(env.PATH).toMatch(/\.pi-dashboard.*node_modules.*\.bin/);
      expect(env.PATH).toContain("/usr/bin");
    });

    it("should not duplicate managed bin if already present", () => {
      const managedBin = require("path").join(require("os").homedir(), ".pi-dashboard", "node_modules", ".bin");
      const env = buildSpawnEnv({ PATH: `${managedBin}:/usr/bin` });
      // Managed bin should appear exactly once
      const parts = env.PATH!.split(":");
      const managedCount = parts.filter(p => p === managedBin).length;
      expect(managedCount).toBe(1);
    });

    it("strips Zellij client identity so headless sessions cannot hijack tabs", () => {
      const env = buildSpawnEnv({
        PATH: "/usr/bin",
        ZELLIJ: "0",
        ZELLIJ_PANE_ID: "5",
        ZELLIJ_SESSION_NAME: "work2",
        ZELLIJ_LAYOUT: "default",
        KEEP_ME: "yes",
      });
      expect(env.ZELLIJ).toBeUndefined();
      expect(env.ZELLIJ_PANE_ID).toBeUndefined();
      expect(env.ZELLIJ_SESSION_NAME).toBeUndefined();
      expect(env.ZELLIJ_LAYOUT).toBeUndefined();
      expect(env.KEEP_ME).toBe("yes");
    });

    it("stripZellijClientEnv only removes ZELLIJ* keys", () => {
      const env = stripZellijClientEnv({
        ZELLIJ: "0",
        ZELLIJ_PANE_ID: "1",
        PATH: "/bin",
        FOO: "bar",
      });
      expect(env).toEqual({ PATH: "/bin", FOO: "bar" });
    });

  });

  describe("electronMode", () => {
    it("should force headless spawn when electronMode is true", async () => {
      // electronMode should bypass tmux detection and use headless directly
      // We test by calling with a non-existent dir to get a quick error without spawning
      const result = await spawnPiSession("/nonexistent-path-12345", { electronMode: true });
      expect(result.success).toBe(false);
      expect(result.message).toContain("does not exist");
    });
  });

  // ── Fork/continue option forwarding ──────────────────────────────────────
  // Regression guard for B1/B2: Windows WSL/cmd fallback used to drop
  // sessionFile + mode silently. buildTmuxCommand and buildHeadlessArgs
  // both go through `sessionFlagsToArgv`; make sure neither drops.
  describe("session-flag forwarding", () => {
    it("buildHeadlessArgs includes --fork for fork mode", () => {
      const args = buildHeadlessArgs({ sessionFile: "C:\\x\\session.jsonl", mode: "fork" });
      expect(args).toEqual(["--mode", "rpc", "--fork", "C:\\x\\session.jsonl"]);
    });

    it("buildHeadlessArgs includes --session for continue mode", () => {
      const args = buildHeadlessArgs({ sessionFile: "/s/abc.jsonl", mode: "continue" });
      expect(args).toEqual(["--mode", "rpc", "--session", "/s/abc.jsonl"]);
    });

    it("buildHeadlessArgs omits session flags when absent", () => {
      const args = buildHeadlessArgs({});
      expect(args).toEqual(["--mode", "rpc"]);
    });

    it("buildTmuxCommand includes --fork in the pi command", () => {
      const cmd = buildTmuxCommand("/project", false, { sessionFile: "/s/abc.jsonl", mode: "fork" });
      expect(cmd).toContain("pi --fork /s/abc.jsonl");
    });

    it("buildTmuxCommand includes --session in the pi command", () => {
      const cmd = buildTmuxCommand("/project", false, { sessionFile: "/s/abc.jsonl", mode: "continue" });
      expect(cmd).toContain("pi --session /s/abc.jsonl");
    });

    it("buildTmuxCommand with special-character sessionFile still shell-escapes", () => {
      const cmd = buildTmuxCommand("/project", false, {
        sessionFile: "/s/with space.jsonl",
        mode: "fork",
      });
      expect(cmd).toContain("--fork '/s/with space.jsonl'");
    });
  });
});
