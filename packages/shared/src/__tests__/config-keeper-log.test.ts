import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, DEFAULT_KEEPER_LOG } from "../config.js";

describe("loadConfig — keeperLog block", () => {
  let testDir: string;
  let configFile: string;
  let origHome: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `test-config-keeperlog-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(path.join(testDir, ".omp", "dashboard"), { recursive: true });
    configFile = path.join(testDir, ".omp", "dashboard", "config.json");
    origHome = process.env.HOME!;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it("defaults capturePiOutput to false when keeperLog block is absent", () => {
    fs.writeFileSync(configFile, JSON.stringify({ port: 8000 }));
    const cfg = loadConfig();
    expect(cfg.keeperLog).toEqual(DEFAULT_KEEPER_LOG);
    expect(cfg.keeperLog.capturePiOutput).toBe(false);
  });

  it("defaults to false when keeperLog is present but capturePiOutput is absent", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: {} }));
    expect(loadConfig().keeperLog.capturePiOutput).toBe(false);
  });

  it("preserves explicit true", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: { capturePiOutput: true } }));
    expect(loadConfig().keeperLog.capturePiOutput).toBe(true);
  });

  it("preserves explicit false", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: { capturePiOutput: false } }));
    expect(loadConfig().keeperLog.capturePiOutput).toBe(false);
  });

  it("falls back to default false on non-boolean", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: { capturePiOutput: "yes" } }));
    expect(loadConfig().keeperLog.capturePiOutput).toBe(false);
  });

  it("falls back to default when keeperLog is not an object", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: "on" }));
    expect(loadConfig().keeperLog.capturePiOutput).toBe(false);
  });

  it("ignores unknown keys in the keeperLog block", () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({ keeperLog: { capturePiOutput: true, nonsense: 42 } }),
    );
    const cfg = loadConfig();
    expect(cfg.keeperLog.capturePiOutput).toBe(true);
    expect((cfg.keeperLog as any).nonsense).toBeUndefined();
  });

  it("round-trips through load → stringify → load", () => {
    fs.writeFileSync(configFile, JSON.stringify({ keeperLog: { capturePiOutput: true } }));
    const first = loadConfig();
    fs.writeFileSync(configFile, JSON.stringify(first));
    const second = loadConfig();
    expect(second.keeperLog.capturePiOutput).toBe(true);
  });
});
