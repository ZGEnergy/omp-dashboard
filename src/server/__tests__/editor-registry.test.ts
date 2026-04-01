import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedExecSync } = vi.hoisted(() => ({
  mockedExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: { execSync: mockedExecSync },
  execSync: mockedExecSync,
}));

import { detectEditors, isProcessRunning, EDITORS, type DetectedEditor } from "../editor-registry.js";

describe("editor-registry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("EDITORS", () => {
    it("should have entries for zed, vscode, and idea", () => {
      expect(EDITORS).toHaveLength(3);
      expect(EDITORS.map((e) => e.id)).toEqual(["zed", "vscode", "idea"]);
    });
  });

  describe("isProcessRunning", () => {
    it("should return true when pgrep finds matching process", () => {
      mockedExecSync.mockReturnValue(Buffer.from("12345\n"));
      expect(isProcessRunning("/Applications/Zed.app")).toBe(true);
    });

    it("should return false when pgrep finds no match", () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error("exit code 1");
      });
      expect(isProcessRunning("/Applications/Zed.app")).toBe(false);
    });

    it("should return false when pgrep is not available", () => {
      mockedExecSync.mockImplementation(() => {
        const err = new Error("command not found") as any;
        err.status = 127;
        throw err;
      });
      expect(isProcessRunning("/Applications/Zed.app")).toBe(false);
    });
  });

  describe("detectEditors", () => {
    it("should return editor when process is running AND CLI is available", () => {
      mockedExecSync.mockImplementation((cmd) => {
        const s = String(cmd);
        if (s.includes("pgrep")) {
          // Only Zed is running
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

    it("should return multiple editors when multiple are running", () => {
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

    it("should return empty when no editors are running", () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error("not found");
      });

      const result = detectEditors("/some/project");
      expect(result).toEqual([]);
    });
  });
});
