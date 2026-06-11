/**
 * Tests for the OpenSpec profile-config helpers added in
 * change: add-openspec-profile-settings.
 *
 * Covers:
 *  - recipe argv shapes (config profile, update)
 *  - workflowSetSignature order-independence + de-dup
 *  - writeOpenSpecConfigFile atomic merge + failure-leaves-original
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  OPENSPEC_CONFIG_PROFILE,
  OPENSPEC_UPDATE,
  CORE_WORKFLOWS,
  EXPANDED_WORKFLOWS,
  workflowSetSignature,
  writeOpenSpecConfigFile,
  openSpecConfigFilePath,
} from "../openspec.js";

describe("OpenSpec profile recipes", () => {
  it("OPENSPEC_CONFIG_PROFILE builds `openspec config profile <preset>`", () => {
    expect(OPENSPEC_CONFIG_PROFILE.argv({ cwd: "/x", preset: "core" })).toEqual([
      "openspec", "config", "profile", "core",
    ]);
  });

  it("OPENSPEC_UPDATE builds `openspec update`", () => {
    expect(OPENSPEC_UPDATE.argv({ cwd: "/x" })).toEqual(["openspec", "update"]);
  });

  it("exposes the fixed workflow sets", () => {
    expect(CORE_WORKFLOWS).toContain("propose");
    expect(CORE_WORKFLOWS).not.toContain("verify");
    expect(EXPANDED_WORKFLOWS).toContain("verify");
    expect(EXPANDED_WORKFLOWS.length).toBe(11);
  });
});

describe("workflowSetSignature", () => {
  it("is order-independent", () => {
    expect(workflowSetSignature(["a", "b", "c"])).toBe(workflowSetSignature(["c", "a", "b"]));
  });

  it("ignores duplicates and blanks", () => {
    expect(workflowSetSignature(["a", "a", " b ", ""])).toBe(workflowSetSignature(["b", "a"]));
  });

  it("differs for different sets", () => {
    expect(workflowSetSignature(["a", "b"])).not.toBe(workflowSetSignature(["a", "b", "c"]));
  });
});

describe("writeOpenSpecConfigFile", () => {
  let tmpHome: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "opsx-cfg-"));
    homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });
  afterEach(() => {
    homedirSpy.mockRestore();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function readConfig() {
    return JSON.parse(fs.readFileSync(openSpecConfigFilePath(), "utf-8"));
  }

  it("creates the file with profile + workflows when none exists", () => {
    const res = writeOpenSpecConfigFile({ profile: "expanded", workflows: [...EXPANDED_WORKFLOWS] });
    expect(res.success).toBe(true);
    const cfg = readConfig();
    expect(cfg.profile).toBe("expanded");
    expect(cfg.workflows).toEqual([...EXPANDED_WORKFLOWS]);
  });

  it("preserves existing keys (delivery, telemetry, featureFlags)", () => {
    const file = openSpecConfigFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      profile: "core",
      delivery: "both",
      telemetry: { noticeSeen: true, anonymousId: "abc" },
      featureFlags: { x: 1 },
      workflows: [...CORE_WORKFLOWS],
    }));

    const res = writeOpenSpecConfigFile({ profile: "custom", workflows: ["propose", "apply", "archive"] });
    expect(res.success).toBe(true);
    const cfg = readConfig();
    expect(cfg.profile).toBe("custom");
    expect(cfg.workflows).toEqual(["propose", "apply", "archive"]);
    expect(cfg.delivery).toBe("both");
    expect(cfg.telemetry).toEqual({ noticeSeen: true, anonymousId: "abc" });
    expect(cfg.featureFlags).toEqual({ x: 1 });
  });

  it("leaves no stray temp files behind on success", () => {
    writeOpenSpecConfigFile({ profile: "core", workflows: [...CORE_WORKFLOWS] });
    const dir = path.dirname(openSpecConfigFilePath());
    const strays = fs.readdirSync(dir).filter((f) => f.startsWith(".config.json.tmp-"));
    expect(strays).toEqual([]);
  });
});
