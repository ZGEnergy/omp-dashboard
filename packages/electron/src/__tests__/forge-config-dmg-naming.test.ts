/**
 * Pin the DMG-maker arch-tagging in `packages/electron/forge.config.ts`.
 *
 * Both macOS matrix legs (`darwin/arm64` on `macos-14`, `darwin/x64` on
 * `macos-15-intel`) used to emit a static `PI Dashboard.dmg` basename,
 * causing `softprops/action-gh-release@v2` to silently overwrite one
 * arch with the other (assets de-dup by basename). This test pins the
 * fix: the DMG maker's `name` config field MUST contain the host arch
 * AND the package version so each leg lands a distinct release asset.
 *
 * `forge.config.ts` evaluates `process.arch` at import time, so the
 * test resets the module cache between the two arch cases via
 * `vi.resetModules()` and overrides `process.arch` with
 * `Object.defineProperty` (which works on Node — `process.arch` is a
 * configurable getter even though it has no setter).
 *
 * See change: fix-darwin-dmg-arch-collision (D1, MODIFIED Requirement:
 * DMG configuration).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import path from "node:path";
import url from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FORGE_CONFIG_PATH = path.resolve(__dirname, "..", "..", "forge.config.ts");
const PKG_JSON_PATH = path.resolve(__dirname, "..", "..", "package.json");

function readPkgVersion(): string {
  return JSON.parse(fs.readFileSync(PKG_JSON_PATH, "utf8")).version;
}

const ORIGINAL_ARCH = process.arch;

function setProcessArch(arch: NodeJS.Architecture): void {
  Object.defineProperty(process, "arch", {
    value: arch,
    configurable: true,
    writable: false,
  });
}

async function loadForgeConfig(): Promise<{
  default: { makers: Array<{ name: string; config: Record<string, unknown> }> };
}> {
  vi.resetModules();
  return import(`${url.pathToFileURL(FORGE_CONFIG_PATH).href}?cache=${Date.now()}`);
}

function findDmgMaker(
  config: { makers: Array<{ name: string; config: Record<string, unknown> }> },
): { name: string; config: Record<string, unknown> } {
  const m = config.makers.find((it) => it.name === "@electron-forge/maker-dmg");
  if (!m) throw new Error("DMG maker not found in forge.config.ts");
  return m;
}

describe("forge.config.ts DMG maker arch-tagging", () => {
  beforeEach(() => {
    setProcessArch(ORIGINAL_ARCH);
  });

  afterAll(() => {
    setProcessArch(ORIGINAL_ARCH);
  });

  it("DMG maker `name` contains 'darwin-arm64' when process.arch === 'arm64'", async () => {
    setProcessArch("arm64");
    const mod = await loadForgeConfig();
    const dmg = findDmgMaker(mod.default);
    expect(typeof dmg.config.name).toBe("string");
    expect(dmg.config.name as string).toContain("darwin-arm64");
    expect(dmg.config.name as string).not.toContain("darwin-x64");
  });

  it("DMG maker `name` contains 'darwin-x64' when process.arch === 'x64'", async () => {
    setProcessArch("x64");
    const mod = await loadForgeConfig();
    const dmg = findDmgMaker(mod.default);
    expect(typeof dmg.config.name).toBe("string");
    expect(dmg.config.name as string).toContain("darwin-x64");
    expect(dmg.config.name as string).not.toContain("darwin-arm64");
  });

  it("DMG maker `name` contains the package version on both arches", async () => {
    const expectedVersion = readPkgVersion();

    setProcessArch("arm64");
    const armMod = await loadForgeConfig();
    expect(findDmgMaker(armMod.default).config.name as string).toContain(expectedVersion);

    setProcessArch("x64");
    const x64Mod = await loadForgeConfig();
    expect(findDmgMaker(x64Mod.default).config.name as string).toContain(expectedVersion);
  });

  it("DMG maker `title` remains 'PI Dashboard' (D1 trade-off — verbose basename, friendly window title)", async () => {
    setProcessArch("arm64");
    const mod = await loadForgeConfig();
    const dmg = findDmgMaker(mod.default);
    expect(dmg.config.title).toBe("PI Dashboard");
  });

  it("DMG maker keeps icon and format pointing at the same resources", async () => {
    setProcessArch("arm64");
    const mod = await loadForgeConfig();
    const dmg = findDmgMaker(mod.default);
    expect(dmg.config.format).toBe("ULFO");
    expect(typeof dmg.config.icon).toBe("string");
    expect(dmg.config.icon as string).toMatch(/icon\.icns$/);
  });

  it("DMG maker `name` matches the documented PI-Dashboard-darwin-${arch}-${version} pattern exactly", async () => {
    const expectedVersion = readPkgVersion();

    setProcessArch("arm64");
    const armMod = await loadForgeConfig();
    expect(findDmgMaker(armMod.default).config.name).toBe(
      `PI-Dashboard-darwin-arm64-${expectedVersion}`,
    );

    setProcessArch("x64");
    const x64Mod = await loadForgeConfig();
    expect(findDmgMaker(x64Mod.default).config.name).toBe(
      `PI-Dashboard-darwin-x64-${expectedVersion}`,
    );
  });
});
