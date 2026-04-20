/**
 * Tests for packages/shared/src/platform/process.ts.
 *
 * Every helper accepts injectable `platform`, `exec`, and `kill` parameters,
 * so no `Object.defineProperty(process, "platform", ...)` mutation is needed.
 * See change: consolidate-platform-handlers.
 */
import { describe, it, expect, vi } from "vitest";
import {
  findPortHolders,
  parseNetstatListeners,
  isProcessAlive,
  killProcess,
  killPidWithGroup,
  parseEtime,
  isProcessRunning,
  findPidByMarker,
  isProcessLikePi,
  isPiCommandLine,
} from "../platform/process.js";

describe("parseNetstatListeners", () => {
  const selfPid = 99999;

  it("parses a Windows netstat listener", () => {
    const output = [
      "  Proto  Local Address     Foreign Address   State       PID",
      "  TCP    0.0.0.0:8000      0.0.0.0:0         LISTENING   12345",
    ].join("\r\n");
    expect(parseNetstatListeners(output, 8000, selfPid)).toEqual([12345]);
  });

  it("excludes non-LISTENING rows", () => {
    const output = "  TCP    0.0.0.0:8000    0.0.0.0:0    ESTABLISHED    1111";
    expect(parseNetstatListeners(output, 8000, selfPid)).toEqual([]);
  });

  it("excludes current process PID", () => {
    const output = `  TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    ${selfPid}`;
    expect(parseNetstatListeners(output, 8000, selfPid)).toEqual([]);
  });

  it("only matches the requested port", () => {
    const output = [
      "  TCP    0.0.0.0:8000     0.0.0.0:0    LISTENING    1111",
      "  TCP    0.0.0.0:18000    0.0.0.0:0    LISTENING    2222",
    ].join("\n");
    expect(parseNetstatListeners(output, 8000, selfPid)).toEqual([1111]);
  });

  it("handles IPv6 addresses", () => {
    const output = "  TCP    [::]:8000    [::]:0    LISTENING    7777";
    expect(parseNetstatListeners(output, 8000, selfPid)).toEqual([7777]);
  });
});

describe("findPortHolders", () => {
  it("uses netstat when platform=win32 is injected", () => {
    const exec = vi.fn().mockReturnValue(
      "  TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    12345\n",
    );
    const result = findPortHolders(8000, { platform: "win32", exec });
    expect(exec).toHaveBeenCalledOnce();
    expect(exec.mock.calls[0][0]).toMatch(/netstat/i);
    expect(result).toEqual([12345]);
  });

  it("uses lsof when platform=linux is injected", () => {
    const exec = vi.fn().mockReturnValue("12345\n67890\n");
    const result = findPortHolders(8000, { platform: "linux", exec });
    expect(exec).toHaveBeenCalledOnce();
    expect(exec.mock.calls[0][0]).toMatch(/lsof.*:8000/);
    expect(result.sort()).toEqual([12345, 67890]);
  });

  it("returns [] on exec failure (best-effort)", () => {
    const exec = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    expect(findPortHolders(8000, { platform: "win32", exec })).toEqual([]);
  });
});

describe("isProcessAlive", () => {
  it("returns true when kill(pid, 0) succeeds", () => {
    const kill = vi.fn().mockReturnValue(undefined);
    expect(isProcessAlive(12345, { kill })).toBe(true);
    expect(kill).toHaveBeenCalledWith(12345, 0);
  });

  it("returns false when kill(pid, 0) throws", () => {
    const kill = vi.fn().mockImplementation(() => {
      throw new Error("ESRCH");
    });
    expect(isProcessAlive(12345, { kill })).toBe(false);
  });
});

describe("killProcess", () => {
  it("uses taskkill on Windows", async () => {
    const exec = vi.fn().mockReturnValue("");
    const kill = vi.fn().mockReturnValue(undefined); // isProcessAlive → true
    const result = await killProcess(12345, { platform: "win32", exec, kill });
    expect(exec).toHaveBeenCalledWith(
      expect.stringMatching(/taskkill\s+\/F\s+\/T\s+\/PID\s+12345/),
      expect.any(Object),
    );
    expect(result).toEqual({ ok: true, forced: false });
  });

  it("returns { ok: false } when pid already dead", async () => {
    const kill = vi.fn().mockImplementation(() => {
      throw new Error("ESRCH");
    });
    const result = await killProcess(12345, { platform: "linux", kill });
    expect(result).toEqual({ ok: false, forced: false });
  });

  it("sends SIGTERM on Unix and reports clean stop when process dies", async () => {
    let aliveCount = 0;
    const kill = vi.fn().mockImplementation((_pid, sig) => {
      // isProcessAlive pre-check (signal 0) must succeed once to enter the branch
      if (sig === 0) {
        aliveCount++;
        if (aliveCount === 1) return; // alive
        throw new Error("ESRCH"); // dead after SIGTERM
      }
      if (sig === "SIGTERM") return;
      throw new Error("unexpected signal");
    });
    const result = await killProcess(12345, { platform: "linux", kill, timeoutMs: 500 });
    expect(kill).toHaveBeenCalledWith(12345, "SIGTERM");
    expect(result).toEqual({ ok: true, forced: false });
  });

  it("forces SIGKILL when process survives SIGTERM", async () => {
    const kill = vi.fn().mockImplementation((_pid, sig) => {
      if (sig === 0) return; // always alive during polling
      if (sig === "SIGTERM" || sig === "SIGKILL") return;
    });
    const result = await killProcess(12345, { platform: "linux", kill, timeoutMs: 300 });
    expect(kill).toHaveBeenCalledWith(12345, "SIGKILL");
    expect(result).toEqual({ ok: true, forced: true });
  });
});

describe("killPidWithGroup", () => {
  it("signals -pid on Unix (process group)", () => {
    const kill = vi.fn();
    killPidWithGroup(12345, "SIGTERM", { platform: "linux", kill });
    expect(kill).toHaveBeenCalledWith(-12345, "SIGTERM");
  });

  it("signals +pid on Windows (no process groups)", () => {
    const kill = vi.fn();
    killPidWithGroup(12345, "SIGTERM", { platform: "win32", kill });
    expect(kill).toHaveBeenCalledWith(12345, "SIGTERM");
  });

  it("signals -pid on macOS", () => {
    const kill = vi.fn();
    killPidWithGroup(99999, "SIGKILL", { platform: "darwin", kill });
    expect(kill).toHaveBeenCalledWith(-99999, "SIGKILL");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ══  Tests merged from platform-process-scan.test.ts                      ══
// ════════════════════════════════════════════════════════════════════════════


describe("parseEtime", () => {
  it("parses mm:ss format", () => expect(parseEtime("02:15")).toBe(135_000));
  it("parses hh:mm:ss format", () => expect(parseEtime("01:30:00")).toBe(5_400_000));
  it("parses dd-hh:mm:ss format", () => expect(parseEtime("2-03:00:00")).toBe(183_600_000));
  it("parses 1-00:00:00 as 1 day", () => expect(parseEtime("1-00:00:00")).toBe(86_400_000));
  it("parses 00:05 as 5 seconds", () => expect(parseEtime("00:05")).toBe(5_000));
  it("returns 0 for empty", () => expect(parseEtime("")).toBe(0));
  it("returns 0 for whitespace", () => expect(parseEtime("   ")).toBe(0));
  it("returns 0 for garbage", () => expect(parseEtime("not-a-time")).toBe(0));
  it("returns 0 for single number (not a time)", () => expect(parseEtime("42")).toBe(0));
});

describe("isProcessRunning", () => {
  it("uses tasklist on Windows and matches image name", () => {
    const exec = vi.fn().mockReturnValue(
      "Code.exe                    12345 Console                    1    50,000 K\n",
    );
    expect(isProcessRunning("Code.exe", { platform: "win32", exec })).toBe(true);
    expect(exec.mock.calls[0][0]).toMatch(/tasklist\s+\/FI\s+"IMAGENAME eq Code\.exe"/);
  });

  it("returns false on Windows when image name is missing from output", () => {
    const exec = vi.fn().mockReturnValue("INFO: No tasks are running.\n");
    expect(isProcessRunning("Missing.exe", { platform: "win32", exec })).toBe(false);
  });

  it("uses pgrep on Unix and returns true when exit code is 0", () => {
    const exec = vi.fn().mockReturnValue("12345\n");
    expect(isProcessRunning("/Applications/Zed.app", { platform: "darwin", exec })).toBe(true);
    expect(exec.mock.calls[0][0]).toMatch(/pgrep\s+-f\s+"\/Applications\/Zed\.app"/);
  });

  it("returns false on Unix when pgrep throws (no match)", () => {
    const exec = vi.fn().mockImplementation(() => {
      throw new Error("exit code 1");
    });
    expect(isProcessRunning("nothing", { platform: "linux", exec })).toBe(false);
  });

  it("returns false on any platform when exec throws unexpectedly", () => {
    const exec = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    expect(isProcessRunning("Code.exe", { platform: "win32", exec })).toBe(false);
    expect(isProcessRunning("zed", { platform: "linux", exec })).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ══  Tests merged from process-identify.test.ts                           ══
// ════════════════════════════════════════════════════════════════════════════


describe("isPiCommandLine", () => {
  it("matches pi", () => {
    expect(isPiCommandLine("/usr/bin/pi --mode rpc")).toBe(true);
  });
  it("matches node", () => {
    expect(isPiCommandLine("node cli.js")).toBe(true);
  });
  it("matches pi even with path prefixes", () => {
    expect(isPiCommandLine("/opt/foo/pi --args")).toBe(true);
  });
  it("does not match unrelated processes", () => {
    expect(isPiCommandLine("/bin/bash")).toBe(false);
    expect(isPiCommandLine("/usr/bin/zsh")).toBe(false);
  });
  it("does not match substrings without word boundary", () => {
    // "pip" and "typescript" must not match pi or node.
    expect(isPiCommandLine("pip install something")).toBe(false);
    expect(isPiCommandLine("/usr/bin/typescript-compiler")).toBe(false);
  });
});

describe("findPidByMarker", () => {
  it("Windows returns empty array without execution", () => {
    const exec = vi.fn(() => "should not be called");
    const result = findPidByMarker("marker", { platform: "win32", exec: exec as any });
    expect(result).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("Linux parses ps output and filters to sentinel lines", () => {
    const fakeOutput = [
      "12345 sh -c tail -f /dev/null | pi --mode rpc session-abc",
      "67890 grep session-abc",
      "11111 sleep 2147483647 | pi --mode rpc session-abc",
      "22222 vim notes-about-session-abc.txt",
    ].join("\n");
    const exec = vi.fn(() => fakeOutput) as any;
    const result = findPidByMarker("session-abc", { platform: "linux", exec });
    expect(result).toEqual([12345, 11111]);
  });

  it("macOS parses ps output similarly", () => {
    const fakeOutput = "99999 tail -f /dev/null | pi --mode rpc s1";
    const exec = vi.fn(() => fakeOutput) as any;
    const result = findPidByMarker("s1", { platform: "darwin", exec });
    expect(result).toEqual([99999]);
  });

  it("returns empty array when no match", () => {
    const exec = vi.fn(() => "") as any;
    const result = findPidByMarker("nothing", { platform: "linux", exec });
    expect(result).toEqual([]);
  });

  it("returns empty array when exec throws (process dead / permission)", () => {
    const exec = vi.fn(() => { throw new Error("no such command"); }) as any;
    const result = findPidByMarker("x", { platform: "linux", exec });
    expect(result).toEqual([]);
  });

  it("excludes lines without pi headless sentinels", () => {
    const fakeOutput = "12345 some-random-process matching-marker-only";
    const exec = vi.fn(() => fakeOutput) as any;
    const result = findPidByMarker("matching-marker", { platform: "linux", exec });
    expect(result).toEqual([]);
  });
});

describe("isProcessLikePi", () => {
  it("Windows returns true unconditionally", () => {
    const exec = vi.fn(() => "should not be called");
    expect(isProcessLikePi(1234, { platform: "win32", exec: exec as any })).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it("Linux matches via /proc cmdline", () => {
    const exec = vi.fn(() => "/usr/bin/node /opt/pi-coding-agent/dist/cli.js") as any;
    expect(isProcessLikePi(1234, { platform: "linux", exec })).toBe(true);
  });

  it("Linux does not match non-pi", () => {
    const exec = vi.fn(() => "/bin/bash") as any;
    expect(isProcessLikePi(1234, { platform: "linux", exec })).toBe(false);
  });

  it("macOS uses ps -p -o command=", () => {
    let capturedCmd = "";
    const exec = ((cmd: string) => {
      capturedCmd = cmd;
      return "node cli.js --mode rpc";
    }) as any;
    expect(isProcessLikePi(555, { platform: "darwin", exec })).toBe(true);
    expect(capturedCmd).toMatch(/ps -p 555 -o command=/);
  });

  it("returns false when process has exited (exec throws)", () => {
    const exec = vi.fn(() => { throw new Error("no such process"); }) as any;
    expect(isProcessLikePi(9999, { platform: "linux", exec })).toBe(false);
  });
});
