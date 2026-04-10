import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gatherGitInfo, detectBranch, detectRemoteUrl, detectPrNumber } from "../git-info.js";

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: { execSync: execSyncMock },
  execSync: execSyncMock,
}));

describe("git-info", () => {
  beforeEach(() => {
    execSyncMock.mockReset();
  });

  describe("detectBranch", () => {
    it("returns branch name", () => {
      execSyncMock.mockReturnValue("main\n");
      expect(detectBranch("/test")).toBe("main");
    });

    it("returns undefined when not a git repo", () => {
      execSyncMock.mockImplementation(() => { throw new Error("not a git repo"); });
      expect(detectBranch("/test")).toBeUndefined();
    });

    it("returns short SHA for detached HEAD", () => {
      execSyncMock
        .mockReturnValueOnce("HEAD\n")       // rev-parse --abbrev-ref HEAD
        .mockReturnValueOnce("abc1234\n");   // rev-parse --short HEAD
      expect(detectBranch("/test")).toBe("abc1234");
    });

    it("returns 'HEAD' as fallback if short SHA fails", () => {
      execSyncMock
        .mockReturnValueOnce("HEAD\n")
        .mockImplementationOnce(() => { throw new Error("fail"); });
      expect(detectBranch("/test")).toBe("HEAD");
    });
  });

  describe("detectRemoteUrl", () => {
    it("returns remote URL", () => {
      execSyncMock.mockReturnValue("git@github.com:user/repo.git\n");
      expect(detectRemoteUrl("/test")).toBe("git@github.com:user/repo.git");
    });

    it("returns undefined when no origin", () => {
      execSyncMock.mockImplementation(() => { throw new Error("no remote"); });
      expect(detectRemoteUrl("/test")).toBeUndefined();
    });
  });

  describe("detectPrNumber", () => {
    it("returns PR number from gh CLI", () => {
      execSyncMock.mockReturnValue("42\n");
      expect(detectPrNumber("/test")).toBe(42);
    });

    it("returns undefined when gh CLI fails", () => {
      execSyncMock.mockImplementation(() => { throw new Error("gh not found"); });
      expect(detectPrNumber("/test")).toBeUndefined();
    });
  });

  describe("gatherGitInfo", () => {
    it("returns full git info with links", () => {
      execSyncMock
        .mockReturnValueOnce("feat/foo\n")    // branch
        .mockReturnValueOnce("git@github.com:user/repo.git\n")  // remote
        .mockReturnValueOnce("7\n");          // PR

      const info = gatherGitInfo("/test");
      expect(info).toEqual({
        gitBranch: "feat/foo",
        gitBranchUrl: "https://github.com/user/repo/tree/feat%2Ffoo",
        gitPrNumber: 7,
        gitPrUrl: "https://github.com/user/repo/pull/7",
      });
    });

    it("returns undefined when not a git repo", () => {
      execSyncMock.mockImplementation(() => { throw new Error("not a git repo"); });
      expect(gatherGitInfo("/test")).toBeUndefined();
    });

    it("returns info without PR when gh fails", () => {
      execSyncMock
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("git@github.com:user/repo.git\n")
        .mockImplementationOnce(() => { throw new Error("gh not found"); });

      const info = gatherGitInfo("/test");
      expect(info?.gitBranch).toBe("main");
      expect(info?.gitPrNumber).toBeUndefined();
      expect(info?.gitPrUrl).toBeUndefined();
    });

    it("returns info without links when no remote", () => {
      execSyncMock
        .mockReturnValueOnce("main\n")
        .mockImplementationOnce(() => { throw new Error("no remote"); })
        .mockImplementationOnce(() => { throw new Error("gh not found"); });

      const info = gatherGitInfo("/test");
      expect(info?.gitBranch).toBe("main");
      expect(info?.gitBranchUrl).toBeUndefined();
    });
  });
});
