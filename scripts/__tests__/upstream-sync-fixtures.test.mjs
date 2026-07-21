import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFixtures } from "../upstream-sync/run-fixtures.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const fixtureRoot = path.join(repoRoot, ".pi/skills/omp-dashboard-upstream-sync/evals/fixtures");
const skillPath = path.join(repoRoot, ".pi/skills/omp-dashboard-upstream-sync/SKILL.md");

describe("upstream sync fixture benchmark", () => {
  it("pairs three skill and baseline runs with graded assertions", () => {
    const result = runFixtures({ fixtureRoot, skillPath });

    expect(result.schema_version).toBe(1);
    expect(result.skill).toBe("omp-dashboard-upstream-sync");
    expect(result.results.map(({ scenario_id }) => scenario_id)).toEqual([
      "adopt-upstream-ui",
      "combine-shared-hub",
      "preserve-zge-wiring",
    ]);
    for (const scenario of result.results) {
      expect(scenario.with_skill.grading.assertions.length).toBeGreaterThan(0);
      expect(scenario.with_skill.grading.failed).toBe(0);
      expect(scenario.without_skill.grading.failed).toBeGreaterThan(0);
      expect(scenario.with_skill.timing.duration_ms).toBeGreaterThan(0);
      expect(scenario.without_skill.timing.duration_ms).toBeGreaterThan(0);
    }
    expect(result.benchmark.with_skill.pass_rate).toBe(1);
    expect(result.benchmark.without_skill.pass_rate).toBeLessThan(1);
  });

  it("reports failed assertions and supports nonzero CLI failure mode", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "upstream-sync-fixtures-"));
    const source = path.join(fixtureRoot, "adopt-upstream-ui/fixture.json");
    const broken = JSON.parse(readFileSync(source, "utf8"));
    broken.outputs.with_skill.actions = ["consume-exact-request"];
    writeFileSync(path.join(tempRoot, "broken.json"), JSON.stringify(broken));

    const result = runFixtures({ fixtureRoot: tempRoot, skillPath, failOnAssertion: false });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].with_skill.grading.failed).toBeGreaterThan(0);
    expect(() => runFixtures({ fixtureRoot: tempRoot, skillPath })).toThrow(/fixture assertions failed/);
  });

  it("is deterministic for grading, benchmark, timing, and nested output paths", () => {
      const first = runFixtures({ fixtureRoot, skillPath, failOnAssertion: false });
      const second = runFixtures({ fixtureRoot, skillPath, failOnAssertion: false });
      const outputPath = path.join(mkdtempSync(path.join(os.tmpdir(), "upstream-sync-output-")), "nested", "benchmark.json");
      runFixtures({ fixtureRoot, skillPath, outputPath });
  
      expect(second).toEqual(first);
      expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(first);
    });
});
