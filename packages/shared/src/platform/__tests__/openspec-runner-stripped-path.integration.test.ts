/**
 * Integration proof: the REAL production openspec config-read path
 * (`OPENSPEC_CONFIG_LIST` recipe → `run` / `runAsync` / `configListAsync`)
 * survives a bundled-Electron GUI launch whose child PATH has NO `node`.
 *
 * Where the sibling unit suites test pieces in isolation
 * (`node-script-argv-matrix` proves the argv SHAPE; `runner-spawn-env`
 * proves the ELECTRON_RUN_AS_NODE flag), this drives the whole chain
 * end-to-end through the runner:
 *
 *   run(OPENSPEC_CONFIG_LIST)
 *     → resolveExecutorArgv (registry.resolveExecutor → node-wrap)
 *     → buildSpawnEnvForArgv
 *     → spawnSync  with  env: { PATH: "" }
 *
 * Topology mirrors the confirmed macOS bug (design.md): openspec resolves
 * to a `.bin/openspec` `#!/usr/bin/env node` shebang SYMLINK (the managed
 * install), and the child PATH lacks a binary named `node`. A raw shebang
 * spawn exits 127 (`env: node: No such file`); the node-wrap resolves it.
 *
 * The CONTROL case spawns the bare symlink with the same empty PATH and
 * asserts exit 127 — proving the wrap is what saves the real path, not the
 * ambient host env.
 *
 * This is the CI form of DEFERRED task 1.2 / 5.5 (which needed a real
 * bundled macOS `.app`): it reproduces the failing spawn env without a
 * bundle, on the ordinary Linux/macOS CI host.
 *
 * See change: fix-openspec-config-read-bundled-node.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPENSPEC_CONFIG_LIST } from "../openspec.js";
import { run, runAsync } from "../runner.js";
import { OverridesStore, registerDefaultTools, ToolRegistry } from "../../tool-registry/index.js";

const GLOBAL_KEY = Symbol.for("pi-dashboard.tool-registry");
type GlobalSlot = { [GLOBAL_KEY]?: unknown };

/** JSON the fake openspec CLI emits for `config list --json`. */
const FAKE_CONFIG = { profile: "expanded", workflows: ["a", "b", "c"] };

let tmp: string;
let dotBinSymlink: string;
let priorRegistry: unknown;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-integ-"));

  // Fake managed openspec package: bin/openspec.js is a real Node script
  // with the exact `#!/usr/bin/env node` shebang the managed install ships.
  const pkgBin = path.join(tmp, "node_modules", "@fission-ai", "openspec", "bin");
  fs.mkdirSync(pkgBin, { recursive: true });
  const jsTarget = path.join(pkgBin, "openspec.js");
  fs.writeFileSync(
    jsTarget,
    "#!/usr/bin/env node\n" +
      "const a = process.argv.slice(2).join(' ');\n" +
      `if (a === 'config list --json') { process.stdout.write(JSON.stringify(${JSON.stringify(FAKE_CONFIG)})); process.exit(0); }\n` +
      "process.stderr.write('unexpected argv: ' + a); process.exit(2);\n",
  );
  fs.chmodSync(jsTarget, 0o755);

  // `.bin/openspec` shebang symlink — the managed-install topology.
  const dotBin = path.join(tmp, "node_modules", ".bin");
  fs.mkdirSync(dotBin, { recursive: true });
  dotBinSymlink = path.join(dotBin, "openspec");
  fs.symlinkSync(jsTarget, dotBinSymlink);

  // Registry the runner will read off the globalThis symbol. openspec
  // overrides to the `.bin` symlink (deref'd + node-wrapped); node
  // overrides to this test runner's own real interpreter.
  const store = new OverridesStore({
    filePath: path.join(tmp, "overrides.json"),
    warn: () => {},
  });
  store.set("node", process.execPath);
  store.set("openspec", dotBinSymlink);
  const registry = new ToolRegistry({ overrides: store, platform: process.platform });
  registerDefaultTools(registry, {
    exists: (p) => p === process.execPath || fs.existsSync(p),
    which: () => null,
    npmRootGlobal: () => "",
  });

  const slot = globalThis as unknown as GlobalSlot;
  priorRegistry = slot[GLOBAL_KEY];
  slot[GLOBAL_KEY] = registry;
});

afterAll(() => {
  (globalThis as unknown as GlobalSlot)[GLOBAL_KEY] = priorRegistry;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("openspec config read — bundled-Electron stripped-PATH integration", () => {
  it("CONTROL: raw `.bin/openspec` shebang spawn exits 127 with an empty PATH", () => {
    // Proves the failure is real in this env: the bare shebang cannot find
    // `node`, exactly as on the affected macOS bundle.
    const res = spawnSync(dotBinSymlink, ["config", "list", "--json"], {
      env: { PATH: "", HOME: os.tmpdir() },
      encoding: "utf-8",
    });
    // env(1) reports 127 when the interpreter is missing.
    expect(res.status === 127 || res.error != null).toBe(true);
    expect(res.stdout ?? "").not.toContain("expanded");
  });

  it("sync run(): OPENSPEC_CONFIG_LIST succeeds through the runner with an empty PATH", () => {
    const result = run(OPENSPEC_CONFIG_LIST, { cwd: tmp }, { env: { PATH: "", HOME: os.tmpdir() } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(FAKE_CONFIG);
  });

  it("async runAsync(): OPENSPEC_CONFIG_LIST succeeds through the runner with an empty PATH", async () => {
    const result = await runAsync(OPENSPEC_CONFIG_LIST, { cwd: tmp }, { env: { PATH: "", HOME: os.tmpdir() } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(FAKE_CONFIG);
  });
});
