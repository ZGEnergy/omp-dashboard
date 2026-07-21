import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SKILL_NAME = "omp-dashboard-upstream-sync";
const FIXTURE_SCHEMA_VERSION = 1;
const SHA1 = /^[a-f0-9]{40}$/i;

function fail(message) {
  throw new Error(`Invalid upstream sync fixture: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read fixture ${file}: ${error.message}`);
  }
}

function validateFixture(fixture, source) {
  if (fixture?.schema_version !== FIXTURE_SCHEMA_VERSION) fail(`${source} schema_version must be ${FIXTURE_SCHEMA_VERSION}`);
  if (!/^[a-z][a-z0-9-]+$/.test(fixture.id ?? "")) fail(`${source} id must be kebab-case`);
  const request = fixture.request;
  if (!request || !SHA1.test(request.base_sha) || !SHA1.test(request.upstream_sha) || request.base_sha === request.upstream_sha) {
    fail(`${source} request must contain distinct 40-character pins`);
  }
  if (typeof request.ledger_revision !== "string" || request.ledger_revision.length === 0) fail(`${source} request ledger_revision is required`);
  if (!Array.isArray(request.changed_paths) || request.changed_paths.length === 0) fail(`${source} request changed_paths is required`);
  if (!Array.isArray(fixture.assertions) || fixture.assertions.length === 0) fail(`${source} assertions are required`);
  if (!fixture.outputs?.with_skill || !fixture.outputs?.without_skill) fail(`${source} must provide paired outputs`);
  const assertionIds = new Set();
  for (const [index, assertion] of fixture.assertions.entries()) {
    if (!assertion || typeof assertion.id !== "string" || assertion.id.length === 0) fail(`${source} assertion ${index} has no id`);
    if (assertionIds.has(assertion.id)) fail(`${source} repeats assertion ${assertion.id}`);
    assertionIds.add(assertion.id);
    if (!Array.isArray(assertion.all) || assertion.all.length === 0) fail(`${source} assertion ${assertion.id} has no required actions`);
    if (assertion.none !== undefined && !Array.isArray(assertion.none)) fail(`${source} assertion ${assertion.id} none must be an array`);
  }
  for (const mode of ["with_skill", "without_skill"]) {
    if (!Array.isArray(fixture.outputs[mode].actions)) fail(`${source} ${mode} actions must be an array`);
  }
  return fixture;
}

function discoverFixtures(fixtureRoot) {
  const entries = readdirSync(fixtureRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(fixtureRoot, entry.name);
    if (entry.isFile() && entry.name.endsWith(".json")) files.push(candidate);
    if (entry.isDirectory()) {
      const nested = path.join(candidate, "fixture.json");
      try {
        if (statSync(nested).isFile()) files.push(nested);
      } catch {
        // A directory without fixture.json is not an eval case.
      }
    }
  }
  if (files.length === 0) fail(`no fixture.json files found in ${fixtureRoot}`);
  return files.sort();
}

function grade(actions, assertions) {
  const actionSet = new Set(actions);
  const expectations = assertions.map((assertion) => {
    const missing = assertion.all.filter((action) => !actionSet.has(action));
    const forbidden = (assertion.none ?? []).filter((action) => actionSet.has(action));
    const passed = missing.length === 0 && forbidden.length === 0;
    const evidence = passed
      ? `actions include ${assertion.all.join(", ")}`
      : [missing.length ? `missing: ${missing.join(", ")}` : "", forbidden.length ? `forbidden: ${forbidden.join(", ")}` : ""].filter(Boolean).join("; ");
    return { text: assertion.text ?? assertion.id, passed, evidence };
  });
  const passed = expectations.filter(({ passed: value }) => value).length;
  return {
    assertions: expectations,
    passed,
    failed: expectations.length - passed,
    pass_rate: expectations.length === 0 ? 0 : passed / expectations.length,
  };
}

function timingFor(fixture, mode) {
  const output = fixture.outputs[mode];
  const totalTokens = Math.ceil(JSON.stringify(output).length / 4);
  return {
    total_tokens: totalTokens,
    duration_ms: 5 + fixture.assertions.length + output.actions.length,
    total_duration_seconds: (5 + fixture.assertions.length + output.actions.length) / 1000,
  };
}

function summarize(results, mode) {
  const runs = results.map((result) => result[mode]);
  const assertions = runs.reduce((sum, run) => sum + run.grading.assertions.length, 0);
  const passed = runs.reduce((sum, run) => sum + run.grading.passed, 0);
  const failed = runs.reduce((sum, run) => sum + run.grading.failed, 0);
  return {
    scenarios: runs.length,
    assertions,
    passed,
    failed,
    pass_rate: assertions === 0 ? 0 : passed / assertions,
    total_tokens: runs.reduce((sum, run) => sum + run.timing.total_tokens, 0),
    total_duration_ms: runs.reduce((sum, run) => sum + run.timing.duration_ms, 0),
    per_scenario: Object.fromEntries(results.map((result) => [result.scenario_id, {
      pass_rate: result[mode].grading.pass_rate,
      total_tokens: result[mode].timing.total_tokens,
      duration_ms: result[mode].timing.duration_ms,
    }])),
  };
}

export function runFixtures({ fixtureRoot, skillPath, outputPath, failOnAssertion = true } = {}) {
  if (!fixtureRoot || !skillPath) throw new Error("runFixtures requires fixtureRoot and skillPath");
  const skillText = readFileSync(skillPath, "utf8");
  if (!skillText.includes("omp-dashboard-upstream-sync")) throw new Error(`skill path is not ${SKILL_NAME}: ${skillPath}`);
  const fixtures = discoverFixtures(fixtureRoot).map((file) => validateFixture(readJson(file), file));
  const results = fixtures.map((fixture) => ({
    scenario_id: fixture.id,
    prompt: fixture.prompt,
    with_skill: {
      output: fixture.outputs.with_skill,
      grading: grade(fixture.outputs.with_skill.actions, fixture.assertions),
      timing: timingFor(fixture, "with_skill"),
    },
    without_skill: {
      output: fixture.outputs.without_skill,
      grading: grade(fixture.outputs.without_skill.actions, fixture.assertions),
      timing: timingFor(fixture, "without_skill"),
    },
  }));
  const result = {
    schema_version: 1,
    skill: SKILL_NAME,
    fixture_root: path.relative(process.cwd(), fixtureRoot) || ".",
    skill_sha256: createHash("sha256").update(skillText, "utf8").digest("hex"),
    results,
    benchmark: {
      with_skill: summarize(results, "with_skill"),
      without_skill: summarize(results, "without_skill"),
    },
  };
  const failed = result.benchmark.with_skill.failed;
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  if (failOnAssertion && failed > 0) throw new Error(`fixture assertions failed: ${failed}`);
  return result;
}

function parseArgs(argv) {
  const args = { allowFailures: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture-root") args.fixtureRoot = argv[++index];
    else if (arg === "--skill") args.skillPath = argv[++index];
    else if (arg === "--output") args.outputPath = argv[++index];
    else if (arg === "--allow-failures") args.allowFailures = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  return {
    fixtureRoot: args.fixtureRoot ?? path.join(repoRoot, ".pi/skills/omp-dashboard-upstream-sync/evals/fixtures"),
    skillPath: args.skillPath ?? path.join(repoRoot, ".pi/skills/omp-dashboard-upstream-sync/SKILL.md"),
    outputPath: args.outputPath,
    failOnAssertion: !args.allowFailures,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const result = runFixtures(parsed);
    console.log(JSON.stringify({
      scenarios: result.results.length,
      with_skill_pass_rate: result.benchmark.with_skill.pass_rate,
      without_skill_pass_rate: result.benchmark.without_skill.pass_rate,
      output: parsed.outputPath ?? null,
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
