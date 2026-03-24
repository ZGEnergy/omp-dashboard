import { describe, it, expect, vi } from "vitest";
import { detectPlatform, buildTmuxCommand } from "../process-manager.js";

describe("Process Manager", () => {
  describe("detectPlatform", () => {
    it("should detect macOS", () => {
      const result = detectPlatform("darwin");
      expect(result.strategy).toBe("tmux");
    });

    it("should detect Linux", () => {
      const result = detectPlatform("linux");
      expect(result.strategy).toBe("tmux");
    });

    it("should detect Windows with WSL fallback", () => {
      const result = detectPlatform("win32");
      expect(result.strategy).toBe("wsl");
    });
  });

  describe("buildTmuxCommand", () => {
    it("should create new session when no pi-dashboard session exists", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).toContain("new-session");
      expect(cmd).toContain("pi-dashboard");
    });

    it("should create new window when pi-dashboard session exists", () => {
      const cmd = buildTmuxCommand("/home/user/project", true);
      expect(cmd).toContain("new-window");
    });

    it("should set PI_DASHBOARD_SPAWNED env var", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).toContain("PI_DASHBOARD_SPAWNED=1");
    });

    it("should include --session flag for continue mode", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        sessionFile: "/path/to/session.jsonl",
        mode: "continue",
      });
      expect(cmd).toContain("--session /path/to/session.jsonl");
      expect(cmd).toContain("PI_DASHBOARD_SPAWNED=1");
      expect(cmd).not.toContain("--fork");
    });

    it("should include --fork flag for fork mode", () => {
      const cmd = buildTmuxCommand("/home/user/project", true, {
        sessionFile: "/path/to/session.jsonl",
        mode: "fork",
      });
      expect(cmd).toContain("--fork /path/to/session.jsonl");
      expect(cmd).toContain("PI_DASHBOARD_SPAWNED=1");
      expect(cmd).not.toContain("--session");
    });

    it("should not include session flags when no options provided", () => {
      const cmd = buildTmuxCommand("/home/user/project", false);
      expect(cmd).not.toContain("--session");
      expect(cmd).not.toContain("--fork");
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
});
