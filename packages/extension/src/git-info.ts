/**
 * Git info gathering — detects branch, remote URL, and PR number.
 */
import { execSync } from "node:child_process";
import { buildGitLinks, type GitLinks } from "./git-link-builder.js";

export interface GitInfo {
  gitBranch: string;
  gitBranchUrl?: string;
  gitPrNumber?: number;
  gitPrUrl?: string;
}

/** Run a shell command and return trimmed stdout, or undefined on failure. */
function runGit(command: string, cwd: string): string | undefined {
  try {
    return execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000 }).trim();
  } catch {
    return undefined;
  }
}

/** Detect the current git branch. Returns short SHA for detached HEAD. */
export function detectBranch(cwd: string): string | undefined {
  const ref = runGit("git rev-parse --abbrev-ref HEAD", cwd);
  if (!ref) return undefined;
  if (ref === "HEAD") {
    // Detached HEAD — return short commit SHA
    return runGit("git rev-parse --short HEAD", cwd) ?? "HEAD";
  }
  return ref;
}

/** Detect the remote origin URL. */
export function detectRemoteUrl(cwd: string): string | undefined {
  return runGit("git remote get-url origin", cwd);
}

/** Detect the PR number via gh CLI (best effort). */
export function detectPrNumber(cwd: string): number | undefined {
  const result = runGit("gh pr view --json number -q .number", cwd);
  if (result) {
    const num = parseInt(result, 10);
    if (!isNaN(num)) return num;
  }
  return undefined;
}

/** Gather all git info for a directory. Returns undefined if not a git repo. */
export function gatherGitInfo(cwd: string): GitInfo | undefined {
  const branch = detectBranch(cwd);
  if (!branch) return undefined;

  const remoteUrl = detectRemoteUrl(cwd);
  const prNumber = detectPrNumber(cwd);

  const links: GitLinks = remoteUrl ? buildGitLinks(remoteUrl, branch, prNumber) : {};

  return {
    gitBranch: branch,
    gitBranchUrl: links.branchUrl,
    gitPrNumber: prNumber,
    gitPrUrl: links.prUrl,
  };
}
