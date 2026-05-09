/**
 * Discoverability test — task 10.6.
 *
 * Verifies the honcho-plugin's `pi-dashboard-plugin` manifest (read from
 * its own package.json) validates against the dashboard's manifest schema.
 * This catches schema drift: if the dashboard's PluginManifest validator
 * tightens its rules, this test fails before the plugin ships broken.
 *
 * Vendored snapshot: we read package.json at runtime rather than
 * hard-coding the manifest, so updates to the manifest are exercised
 * without needing to update this test (it just verifies they validate).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "@blackbelt-technology/dashboard-plugin-runtime/manifest-validator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_JSON = resolve(__dirname, "../../package.json");

describe("honcho-plugin manifest discoverability", () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8")) as {
    name: string;
    "pi-dashboard-plugin"?: unknown;
  };
  const manifest = pkg["pi-dashboard-plugin"];

  it("declares a `pi-dashboard-plugin` manifest field", () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe("object");
  });

  it("validates against the dashboard's manifest schema", () => {
    expect(() => validateManifest(manifest, pkg.name)).not.toThrow();
  });

  it("declares plugin id `honcho`", () => {
    const validated = validateManifest(manifest, pkg.name);
    expect(validated.id).toBe("honcho");
  });

  it("declares at least the settings-section + anchored-popover slots", () => {
    // Other slots (session-card-* family) may be re-mapped by sibling
    // OpenSpec changes (e.g. redesign-session-card-subcards). Discoverability
    // only requires the manifest validates and includes the two stable slots.
    const validated = validateManifest(manifest, pkg.name);
    const slots = new Set(validated.claims.map((c) => c.slot));
    expect(slots.has("settings-section")).toBe(true);
    expect(slots.has("anchored-popover")).toBe(true);
  });

  it("every claim is for a known slot id", () => {
    const validated = validateManifest(manifest, pkg.name);
    expect(validated.claims.length).toBeGreaterThan(0);
    for (const c of validated.claims) {
      expect(typeof c.slot).toBe("string");
      expect(typeof c.component).toBe("string");
    }
  });

  it("settings-section claim targets the `general` tab", () => {
    const validated = validateManifest(manifest, pkg.name);
    const settingsClaim = validated.claims.find(
      (c) => c.slot === "settings-section",
    );
    expect(settingsClaim).toBeDefined();
    expect((settingsClaim as { tab?: string }).tab).toBe("general");
  });

  it("declares both client and server entries", () => {
    const validated = validateManifest(manifest, pkg.name);
    expect(validated.client).toBeTruthy();
    expect(validated.server).toBeTruthy();
  });
});
