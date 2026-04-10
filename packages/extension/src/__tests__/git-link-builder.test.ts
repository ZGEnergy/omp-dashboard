import { describe, it, expect } from "vitest";
import { parseRemoteUrl, detectPlatform, buildGitLinks } from "../git-link-builder.js";

describe("parseRemoteUrl", () => {
  it("parses SSH URL", () => {
    expect(parseRemoteUrl("git@github.com:user/repo.git")).toEqual({
      host: "github.com", user: "user", repo: "repo",
    });
  });

  it("parses SSH URL without .git suffix", () => {
    expect(parseRemoteUrl("git@github.com:user/repo")).toEqual({
      host: "github.com", user: "user", repo: "repo",
    });
  });

  it("parses HTTPS URL", () => {
    expect(parseRemoteUrl("https://github.com/user/repo.git")).toEqual({
      host: "github.com", user: "user", repo: "repo",
    });
  });

  it("parses HTTPS URL without .git suffix", () => {
    expect(parseRemoteUrl("https://gitlab.com/user/repo")).toEqual({
      host: "gitlab.com", user: "user", repo: "repo",
    });
  });

  it("parses nested group paths", () => {
    expect(parseRemoteUrl("git@gitlab.com:group/subgroup/repo.git")).toEqual({
      host: "gitlab.com", user: "group/subgroup", repo: "repo",
    });
  });

  it("returns undefined for invalid URL", () => {
    expect(parseRemoteUrl("not-a-url")).toBeUndefined();
  });
});

describe("detectPlatform", () => {
  it("detects GitHub", () => expect(detectPlatform("github.com")).toBe("github"));
  it("detects GitLab", () => expect(detectPlatform("gitlab.com")).toBe("gitlab"));
  it("detects Bitbucket", () => expect(detectPlatform("bitbucket.org")).toBe("bitbucket"));
  it("detects Gitea", () => expect(detectPlatform("gitea.com")).toBe("gitea"));
  it("detects Codeberg", () => expect(detectPlatform("codeberg.org")).toBe("codeberg"));
  it("detects SourceHut", () => expect(detectPlatform("sr.ht")).toBe("sourcehut"));
  it("returns undefined for unknown host", () => expect(detectPlatform("self-hosted.example.com")).toBeUndefined());
});

describe("buildGitLinks", () => {
  it("builds GitHub branch and PR links", () => {
    const links = buildGitLinks("git@github.com:user/repo.git", "main", 42);
    expect(links.branchUrl).toBe("https://github.com/user/repo/tree/main");
    expect(links.prUrl).toBe("https://github.com/user/repo/pull/42");
  });

  it("builds GitLab branch and MR links", () => {
    const links = buildGitLinks("https://gitlab.com/user/repo.git", "main", 10);
    expect(links.branchUrl).toBe("https://gitlab.com/user/repo/-/tree/main");
    expect(links.prUrl).toBe("https://gitlab.com/user/repo/-/merge_requests/10");
  });

  it("builds Bitbucket links", () => {
    const links = buildGitLinks("git@bitbucket.org:user/repo.git", "develop", 5);
    expect(links.branchUrl).toBe("https://bitbucket.org/user/repo/src/develop");
    expect(links.prUrl).toBe("https://bitbucket.org/user/repo/pull-requests/5");
  });

  it("builds Codeberg links", () => {
    const links = buildGitLinks("https://codeberg.org/user/repo.git", "main", 3);
    expect(links.branchUrl).toBe("https://codeberg.org/user/repo/src/branch/main");
    expect(links.prUrl).toBe("https://codeberg.org/user/repo/pulls/3");
  });

  it("builds SourceHut links", () => {
    const links = buildGitLinks("git@sr.ht:user/repo.git", "main", 1);
    expect(links.branchUrl).toBe("https://sr.ht/user/repo/tree/main");
    expect(links.prUrl).toBe("https://sr.ht/user/repo/patches/1");
  });

  it("URL-encodes branch names with slashes", () => {
    const links = buildGitLinks("git@github.com:user/repo.git", "feat/my-feature");
    expect(links.branchUrl).toBe("https://github.com/user/repo/tree/feat%2Fmy-feature");
  });

  it("returns empty for unknown host", () => {
    const links = buildGitLinks("git@self-hosted.example.com:user/repo.git", "main");
    expect(links.branchUrl).toBeUndefined();
    expect(links.prUrl).toBeUndefined();
  });

  it("does not generate branch URL for detached HEAD", () => {
    const links = buildGitLinks("git@github.com:user/repo.git", "HEAD");
    expect(links.branchUrl).toBeUndefined();
  });

  it("builds branch URL without PR", () => {
    const links = buildGitLinks("git@github.com:user/repo.git", "main");
    expect(links.branchUrl).toBe("https://github.com/user/repo/tree/main");
    expect(links.prUrl).toBeUndefined();
  });
});
