/**
 * ensure-gh-default.cjs — pin `gh` to origin (ZGEnergy/omp-dashboard).
 *
 * Bare `gh issue|pr|repo` without --repo falls back to package.json#repository
 * when remote.origin.gh-resolved is unset. Our package.json still points at
 * BlackBeltTechnology/pi-agent-dashboard (npm package identity), so agents and
 * humans silently file issues upstream.
 *
 * This script sets `remote.origin.gh-resolved=base` (same as
 * `gh repo set-default origin`) for ZGEnergy/omp-dashboard checkouts.
 * Safe no-op outside git, without origin, or when already set.
 *
 * Wired from package.json postinstall + scripts/upstream-sync.sh.
 */
"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ORIGIN_MARKERS = [/ZGEnergy\/omp-dashboard/i, /github\.com[:/]ZGEnergy\/omp-dashboard/i];

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function runOk(cmd, args) {
  try {
    execFileSync(cmd, args, {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (run("git", ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    return;
  }

  const originUrl = run("git", ["remote", "get-url", "origin"]);
  if (!originUrl) return;
  if (!ORIGIN_MARKERS.some((re) => re.test(originUrl))) return;

  const resolved = run("git", ["config", "--get", "remote.origin.gh-resolved"]);
  if (resolved === "base") return;

  // Prefer the official CLI path when available.
  if (run("gh", ["--version"]) && runOk("gh", ["repo", "set-default", "origin"])) {
    return;
  }

  // Fallback: write the same git config key gh uses.
  runOk("git", ["config", "remote.origin.gh-resolved", "base"]);
}

main();
