/**
 * Wizard trigger + decideStartupAction coverage for the slimmed wizard.
 *
 * Replaces the pre-slim `wizard-state.test.ts` and
 * `wizard-power-user-managed-install.test.ts` (deleted in change:
 * streamline-electron-bootstrap-and-recovery, Group 8).
 *
 * Anchors the contract described in
 * `openspec/changes/streamline-electron-bootstrap-and-recovery/specs/electron-wizard/spec.md`,
 * specifically the "Wizard trigger condition" requirement: the wizard opens
 * iff `~/.pi-dashboard/node_modules/` contains zero whitelisted-package
 * directories AND the bootstrap preflight reports a populated-vs-empty
 * result of empty. Legacy `mode.json` presence MUST NOT affect the
 * decision.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  decideStartupAction,
  isManagedDirPopulated,
} from "../lib/power-user-install.js";
import { cleanupLegacyStateFiles } from "../lib/legacy-cleanup.js";
import { ELECTRON_OWNED_PACKAGES } from "@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist.js";

function seedPackages(managedDir: string, pkgs: Iterable<string>) {
  for (const pkg of pkgs) {
    const dir = path.join(managedDir, "node_modules", ...pkg.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: pkg, version: "1.0.0" }),
    );
  }
}

describe("decideStartupAction (slimmed signature)", () => {
  it("returns kind:'wizard' when managed dir is empty", () => {
    expect(
      decideStartupAction({
        piFound: false,
        bridgeFound: false,
        managedPopulated: false,
        preflightNeedsAction: false,
      }),
    ).toEqual({ kind: "wizard" });
  });

  it("returns kind:'wizard' even when pi+bridge are present (managed dir is the gate)", () => {
    expect(
      decideStartupAction({
        piFound: true,
        bridgeFound: true,
        managedPopulated: false,
        preflightNeedsAction: true,
      }),
    ).toEqual({ kind: "wizard" });
  });

  it("returns kind:'preflight-install' when managed dir is populated but preflight needs action", () => {
    expect(
      decideStartupAction({
        piFound: false,
        bridgeFound: false,
        managedPopulated: true,
        preflightNeedsAction: true,
      }),
    ).toEqual({ kind: "preflight-install" });
  });

  it("returns kind:'skip' when managed dir is populated and preflight is satisfied", () => {
    expect(
      decideStartupAction({
        piFound: true,
        bridgeFound: true,
        managedPopulated: true,
        preflightNeedsAction: false,
      }),
    ).toEqual({ kind: "skip" });
    // pi / bridge state does not affect the verdict in the slimmed model.
    expect(
      decideStartupAction({
        piFound: false,
        bridgeFound: false,
        managedPopulated: true,
        preflightNeedsAction: false,
      }),
    ).toEqual({ kind: "skip" });
  });
});

describe("isManagedDirPopulated (filesystem trigger)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "wizard-trigger-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns false on a fresh / empty managed dir (Scenario: Fresh install)", () => {
    expect(isManagedDirPopulated(tmp)).toBe(false);
  });

  it("returns false when one whitelisted package is missing", () => {
    const all = [...ELECTRON_OWNED_PACKAGES];
    seedPackages(tmp, all.slice(0, all.length - 1));
    expect(isManagedDirPopulated(tmp)).toBe(false);
  });

  it("returns true only when every whitelisted package's package.json is present and parses", () => {
    seedPackages(tmp, ELECTRON_OWNED_PACKAGES);
    expect(isManagedDirPopulated(tmp)).toBe(true);
  });

  it("returns false when a package.json is corrupt JSON", () => {
    for (const pkg of ELECTRON_OWNED_PACKAGES) {
      const dir = path.join(tmp, "node_modules", ...pkg.split("/"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "package.json"), "{ not valid json");
    }
    expect(isManagedDirPopulated(tmp)).toBe(false);
  });
});

describe("Spec: 'Wizard trigger condition' scenarios", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "wizard-trigger-spec-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("Scenario: Existing managed install, no wizard", () => {
    seedPackages(tmp, ELECTRON_OWNED_PACKAGES);
    const action = decideStartupAction({
      piFound: false,
      bridgeFound: false,
      managedPopulated: isManagedDirPopulated(tmp),
      preflightNeedsAction: false,
    });
    expect(action.kind).not.toBe("wizard");
    expect(action).toEqual({ kind: "skip" });
  });

  it("Scenario: Existing managed install but preflight needs action -> preflight-install (still no wizard)", () => {
    seedPackages(tmp, ELECTRON_OWNED_PACKAGES);
    const action = decideStartupAction({
      piFound: false,
      bridgeFound: false,
      managedPopulated: isManagedDirPopulated(tmp),
      preflightNeedsAction: true,
    });
    expect(action.kind).toBe("preflight-install");
  });

  it("Scenario: Legacy mode.json present, no wizard — cleanup removes mode.json AND wizard does not open", () => {
    seedPackages(tmp, ELECTRON_OWNED_PACKAGES);
    // Seed a legacy mode.json file alongside the populated managed dir.
    const modeFile = path.join(tmp, "mode.json");
    writeFileSync(modeFile, JSON.stringify({ mode: "standalone" }));
    expect(existsSync(modeFile)).toBe(true);

    // Cleanup pass (the same one main.ts runs at every launch).
    const cleanup = cleanupLegacyStateFiles(tmp);
    expect(cleanup.removed).toContain(modeFile);
    expect(existsSync(modeFile)).toBe(false);

    // Decision is still based on filesystem state, NOT mode.json.
    const action = decideStartupAction({
      piFound: false,
      bridgeFound: false,
      managedPopulated: isManagedDirPopulated(tmp),
      preflightNeedsAction: false,
    });
    expect(action).toEqual({ kind: "skip" });
  });

  it("Scenario: Fresh install, empty managed dir, mode.json absent -> wizard", () => {
    expect(existsSync(path.join(tmp, "mode.json"))).toBe(false);
    const action = decideStartupAction({
      piFound: false,
      bridgeFound: false,
      managedPopulated: isManagedDirPopulated(tmp),
      preflightNeedsAction: false,
    });
    expect(action).toEqual({ kind: "wizard" });
  });

  it("Scenario: Fresh install but legacy mode.json present -> wizard still opens (managedPopulated is the gate)", () => {
    // mode.json present but managed dir empty: legacy state should NOT
    // suppress the wizard. Verifies the spec rule "wizard SHALL NOT open
    // based on the presence or absence of mode.json".
    mkdirSync(tmp, { recursive: true });
    writeFileSync(path.join(tmp, "mode.json"), JSON.stringify({ mode: "power-user" }));
    const action = decideStartupAction({
      piFound: true,
      bridgeFound: true,
      managedPopulated: isManagedDirPopulated(tmp),
      preflightNeedsAction: false,
    });
    expect(action).toEqual({ kind: "wizard" });
  });
});
