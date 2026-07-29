import { describe, expect, it } from "vitest";
import biomeConfig from "../../biome.json" with { type: "json" };
import packageJson from "../../package.json" with { type: "json" };

// Guard for issue #94: `defaultBranch: "develop"` is inherited from upstream and
// names a branch that does not exist in this fork, which made `biome check
// --changed` resolve zero files and hard-error, short-circuiting tsc + npm test.
// Pure file-content assertions — no git calls, because CI checks out a detached
// PR merge ref where a local `main` branch does not exist.
describe("biome vcs config", () => {
  it("compares --changed against this fork's default branch", () => {
    expect(biomeConfig.vcs.enabled).toBe(true);
    expect(biomeConfig.vcs.defaultBranch).toBe("main");
  });

  it("keeps the quality oracle tolerant of an empty changed-set", () => {
    const oracle = packageJson.scripts["quality:changed"];
    expect(oracle).toContain("--no-errors-on-unmatched");
    expect(oracle).toContain("--error-on-warnings");
    expect(oracle).toContain("tsc --noEmit");
    expect(oracle).toContain("npm test");
  });

  it("keeps fix:changed tolerant of an empty changed-set", () => {
    expect(packageJson.scripts["fix:changed"]).toContain("--no-errors-on-unmatched");
  });
});
