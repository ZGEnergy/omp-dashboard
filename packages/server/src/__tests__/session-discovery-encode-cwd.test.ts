/**
 * Patch 2 (omp minimal fork): encodeCwd must produce omp's session-dir name
 * (oh-my-pi getDefaultSessionDirName), not pi's legacy `--<abs>--` form, so
 * discoverSessionsForCwd finds omp's `~/.omp/agent/sessions/-<relpath>` dirs.
 *
 * Mirrors oh-my-pi packages/coding-agent/src/session/session-paths.ts:
 *   under $HOME  -> `-` + relpath (separators -> `-`); home root -> `-`
 *   under tmpdir -> `-tmp` [ + `-` + relpath ]; tmp root -> `-tmp`
 *   otherwise    -> legacy `--<abs-with-dashes>--`
 */
import { describe, it, expect } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { encodeCwd } from "../session-discovery.js";

describe("encodeCwd (omp session-dir scheme)", () => {
  it("home root -> `-`", () => {
    expect(encodeCwd(homedir())).toBe("-");
  });

  it("one level under home -> `-<name>`", () => {
    expect(encodeCwd(join(homedir(), "repos"))).toBe("-repos");
  });

  it("nested under home -> separators become `-`", () => {
    expect(encodeCwd(join(homedir(), "repos", "omp-dashboard"))).toBe("-repos-omp-dashboard");
  });

  it("tmp root -> `-tmp`", () => {
    expect(encodeCwd(tmpdir())).toBe("-tmp");
  });

  it("under tmp -> `-tmp-<rel>`", () => {
    expect(encodeCwd(join(tmpdir(), "work", "proj"))).toBe("-tmp-work-proj");
  });

  it("outside home and tmp -> legacy `--<abs>--`", () => {
    expect(encodeCwd("/opt/some/where")).toBe("--opt-some-where--");
  });
});
