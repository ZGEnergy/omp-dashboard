/**
 * Unit tests for `managed-paths.ts` getters.
 *
 * The constants (MANAGED_DIR, MANAGED_BIN, PI_SETTINGS_PATH) reflect
 * the live environment at module-load time — those are covered by
 * implicit use throughout the codebase. These tests pin the
 * getter-with-override path used by the bootstrap harness and by
 * future tests/proposals that need HOME injection.
 */
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANAGED_BIN,
  MANAGED_DIR,
  PI_SETTINGS_PATH,
  getManagedBin,
  getManagedDir,
  getPiSettingsPath,
} from "../managed-paths.js";

describe("managed-paths getters", () => {
  it("getManagedDir() with no arg matches live MANAGED_DIR", () => {
    expect(getManagedDir()).toBe(MANAGED_DIR);
    expect(getManagedDir()).toBe(path.join(os.homedir(), ".omp-dashboard"));
  });

  it("getManagedBin() with no arg matches live MANAGED_BIN", () => {
    expect(getManagedBin()).toBe(MANAGED_BIN);
  });

  it("getPiSettingsPath() with no arg matches live PI_SETTINGS_PATH", () => {
    expect(getPiSettingsPath()).toBe(PI_SETTINGS_PATH);
    expect(getPiSettingsPath()).toBe(
      path.join(os.homedir(), ".omp", "agent", "settings.json"),
    );
  });

  it("getManagedDir({ homedir }) uses the override", () => {
    expect(getManagedDir({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".omp-dashboard"),
    );
  });

  it("getManagedBin({ homedir }) composes from override", () => {
    expect(getManagedBin({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".omp-dashboard", "node_modules", ".bin"),
    );
  });

  it("getPiSettingsPath({ homedir }) uses the override", () => {
    expect(getPiSettingsPath({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".omp", "agent", "settings.json"),
    );
  });

  it("override-less getManagedDir and live MANAGED_DIR constant are in sync", () => {
    // Sanity: if someone accidentally drifts the constant from the
    // getter default, this catches it.
    expect(getManagedDir()).toEqual(MANAGED_DIR);
    expect(getManagedBin()).toEqual(MANAGED_BIN);
  });
});
