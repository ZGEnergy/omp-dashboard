import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedExecSync } = vi.hoisted(() => ({
  mockedExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: { execSync: mockedExecSync },
  execSync: mockedExecSync,
}));

import { detectEditors, isProcessRunning, isProcessRunningWin32, EDITORS, type DetectedEditor } from "../editor-registry.js";

describe("editor-registry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("EDITORS", () => {
    it("should have entries for zed, vscode, and idea", () => {
      expect(EDITORS).toHaveLength(3);
      expect(EDITORS.map((e) => e.id)).toEqual(["zed", "vscode", "idea"]);
    });

    it("should have win32 patterns for vscode and idea", () => {
      const vscode = EDITORS.find(e => e.id === "vscode")!;
      const idea = EDITORS.find(e => e.id === "idea")!;
      expect(vscode.processPattern.win32).toBe("Code.exe");
      expect(vscode.winCli).toBe("code.cmd");
      expect(idea.processPattern.win32).toBe("idea64.exe");
      expect(idea.winCli).toBe("idea64.exe");
    });

    it("should not have win32 pattern for zed", () => {
      const zed = EDITORS.find(e => e.id === "zed")!;
      expect(zed.processPattern.win32).toBeUndefined();
    });
  });

  // Note: dedicated `isProcessRunning` / `isProcessRunningWin32` tests are
  // intentionally absent — both wrappers now delegate to the shared primitive
  // in `packages/shared/src/platform/process-scan.ts`, whose tests
  // (`platform-process-scan.test.ts`) cover the pgrep / tasklist branches
  // directly via injected `platform`. The detectEditors tests below still
  // exercise the end-to-end integration.
  // See change: consolidate-platform-handlers.

  describe("detectEditors", () => {
    // Unix: fixture uses Zed, which has no Windows process pattern.
    it.skipIf(process.platform === "win32")("should return editor when process is running AND CLI is available (unix: Zed)", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("pgrep")) {
          if (s.includes("Zed")) return Buffer.from("12345\n");
          throw new Error("not found");
        }
        if (s.includes("which")) {
          if (s.includes("zed")) return Buffer.from("/usr/local/bin/zed\n");
          throw new Error("not found");
        }
        throw new Error("unexpected command");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([{ id: "zed", name: "Zed" }]);
    });

    // Windows equivalent: VS Code is in EDITORS.processPattern.win32, Zed is not.
    it.skipIf(process.platform !== "win32")("should return editor when process is running AND CLI is available (win32: VS Code)", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("tasklist")) {
          if (s.includes("Code.exe")) {
            return Buffer.from("Code.exe                    12345 Console                    1    50,000 K\n");
          }
          throw new Error("not found");
        }
        if (s.includes("where")) {
          if (s.includes("code.cmd") || s.includes("code")) return Buffer.from("C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd\n");
          throw new Error("not found");
        }
        throw new Error("unexpected command");
      });

      const result = detectEditors("C:\\some\\project");
      expect(result).toEqual([{ id: "vscode", name: "VS Code" }]);
    });

    it("should return empty when process not running even if CLI available", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("pgrep")) throw new Error("not found");
        if (s.includes("which")) return Buffer.from("/usr/local/bin/zed\n");
        throw new Error("unexpected command");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([]);
    });

    it("should return empty when process running but CLI not available", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("pgrep")) return Buffer.from("12345\n");
        if (s.includes("which")) throw new Error("not found");
        throw new Error("unexpected command");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([]);
    });

    // Unix path: Zed + VS Code. Zed has no Windows process pattern so this
    // specific fixture can't run on Windows (production code skips Zed on
    // win32). A Windows-equivalent test below uses VS Code + IntelliJ — both
    // of which do have win32 process patterns.
    it.skipIf(process.platform === "win32")("should return multiple editors when multiple are running (unix: Zed + VS Code)", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("pgrep")) {
          if (s.includes("Zed") || s.includes("zed")) return Buffer.from("12345\n");
          if (s.includes("Visual Studio Code") || s.includes("code")) return Buffer.from("67890\n");
          throw new Error("not found");
        }
        if (s.includes("which")) {
          if (s.includes("zed")) return Buffer.from("/usr/local/bin/zed\n");
          if (s.includes("code")) return Buffer.from("/usr/local/bin/code\n");
          throw new Error("not found");
        }
        throw new Error("unexpected command");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([
        { id: "zed", name: "Zed" },
        { id: "vscode", name: "VS Code" },
      ]);
    });

    it.skipIf(process.platform !== "win32")("should return multiple editors when multiple are running (win32: VS Code + IntelliJ)", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        // tasklist output needs to include the image name for isProcessRunningWin32's .includes() check
        if (s.includes("tasklist")) {
          if (s.includes("Code.exe")) {
            return Buffer.from("Code.exe                    12345 Console                    1    50,000 K\n");
          }
          if (s.includes("idea64.exe")) {
            return Buffer.from("idea64.exe                  67890 Console                    1   100,000 K\n");
          }
          throw new Error("not found");
        }
        if (s.includes("where")) {
          if (s.includes("code.cmd") || s.includes("code")) return Buffer.from("C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd\n");
          if (s.includes("idea64.exe") || s.includes("idea")) return Buffer.from("C:\\Program Files\\JetBrains\\IntelliJ\\bin\\idea64.exe\n");
          throw new Error("not found");
        }
        throw new Error("unexpected command");
      });

      const result = detectEditors("C:\\some\\project");
      expect(result).toEqual([
        { id: "vscode", name: "VS Code" },
        { id: "idea", name: "IntelliJ" },
      ]);
    });

    it("should return empty when no editors are running", () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error("not found");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([]);
    });
  });
});
