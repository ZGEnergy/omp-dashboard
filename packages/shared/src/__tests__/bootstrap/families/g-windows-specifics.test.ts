/**
 * Family G — Windows specifics.
 *
 * G1: win-cmd-shim          — pi.cmd found; `toArgv` MUST prepend node.exe.
 * G2: win-appdata-roaming    — npm-g installed at %APPDATA%\Roaming\npm.
 * G3: win-programfiles-cwd   — cwd under "C:\Program Files (x86)\..."
 *                              (covered in F1-win; add a G-variant with
 *                              pi resolution via npm-g).
 * G4: win-programfiles-node  — node.exe at "C:\Program Files\nodejs".
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv, layer } from "../harness.js";
import { registerDefaultTools } from "../../../tool-registry/definitions.js";
import * as fixtures from "../fixtures/index.js";
import { snapshotTrail } from "../assertions.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

// All Family G cells are win32-only.
const G = [
  // G1 is already covered by B2 (npm-g on win32); this family focuses
  // on specific layout variants.
  { platform: "win32", dash: "managed", pi: "present-valid", settings: "valid", env: "normal" },
  { platform: "win32", dash: "npm-g", pi: "present-valid", settings: "valid", env: "normal" },
] as const;
for (const cell of G) {
  register(cell, "families/g-windows-specifics.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family G — Windows specifics", () => {
  it("G1 — pi.cmd resolved + toArgv prepends node.exe (no-cmd-flash)", async () => {
    const homedir = "C:\\Users\\R";
    await withFakeEnv(
      {
        platform: "win32",
        homedir,
        env: { PATH: "C:\\Program Files\\nodejs" },
        fs: layer(
          fixtures.managedInstall({ homedir, platform: "win32", pi: false, openspec: false, tsx: false }),
          {
            // Explicit pi.cmd shim — this is what Windows produces.
            "C:\\Users\\R\\.pi-dashboard\\node_modules\\.bin\\pi.cmd":
              "@node %~dp0\\..\\@mariozechner\\pi-coding-agent\\dist\\cli.js %*",
            // node.exe must be resolvable for toArgv to prepend it.
            "C:\\Program Files\\nodejs\\node.exe": "\x7fELF",
          },
        ),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.path?.endsWith("pi.cmd")).toBe(true);
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });

  it("G2 — npm-g at %APPDATA%\\Roaming\\npm", async () => {
    const homedir = "C:\\Users\\R";
    await withFakeEnv(
      {
        platform: "win32",
        homedir,
        env: {
          PATH: "C:\\Users\\R\\AppData\\Roaming\\npm",
          APPDATA: "C:\\Users\\R\\AppData\\Roaming",
        },
        fs: fixtures.npmGlobalWindowsAppData(homedir, { dashboard: false }),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const res = registry.resolve("pi");
        expect(res.ok).toBe(true);
        expect(res.source).toBe("npm-global");
        expect(snapshotTrail(res, ctx)).toMatchSnapshot();
      },
    );
  });

  it("G4 — node.exe at C:\\Program Files\\nodejs\\node.exe", async () => {
    const homedir = "C:\\Users\\R";
    await withFakeEnv(
      {
        platform: "win32",
        homedir,
        env: { PATH: "C:\\Program Files\\nodejs" },
        fs: layer(
          fixtures.managedInstall({ homedir, platform: "win32" }),
          {
            "C:\\Program Files\\nodejs\\node.exe": "\x7fELF",
          },
        ),
      },
      (ctx) => {
        const registry = ctx.createRegistry();
        registerDefaultTools(registry, ctx.createStrategyDeps());
        const nodeRes = registry.resolve("node");
        expect(nodeRes.ok).toBe(true);
        expect(nodeRes.path).toBe("C:\\Program Files\\nodejs\\node.exe");
        expect(snapshotTrail(nodeRes, ctx)).toMatchSnapshot();
      },
    );
  });
});
