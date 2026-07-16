/**
 * Tests for role-manager.ts — OMP config.yml#modelRoles SSOT.
 *
 * HOME is overridden by the vitest globalSetup to a tmp dir.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  activate,
  addRoleName,
  DEFAULT_ROLE_NAMES,
  effectiveRoleNames,
  getModelRole,
  loadRoleConfig,
  lookupRole,
  overlayDefaultRoles,
  overlayRoles,
  type RoleConfig,
  removeRoleFromSchema,
  saveRoleConfig,
} from "../role-manager.js";

function withDefaults(assigned: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of DEFAULT_ROLE_NAMES) out[name] = "";
  return { ...out, ...assigned };
}

const AGENT_DIR = () => join(homedir(), ".omp", "agent");
const CONFIG = () => join(AGENT_DIR(), "config.yml");

type Handler = (data: Record<string, unknown>) => void | Promise<void>;

function makeFakePi() {
  const handlers = new Map<string, Handler>();
  const pi = {
    events: {
      on: (name: string, fn: Handler) => {
        handlers.set(name, fn);
      },
      emit: async (name: string, data: Record<string, unknown>) => {
        const fn = handlers.get(name);
        if (fn) await fn(data);
      },
    },
  };
  return { pi: pi as unknown as ExtensionAPI, handlers };
}

function resetConfig() {
  if (existsSync(CONFIG())) rmSync(CONFIG());
  mkdirSync(AGENT_DIR(), { recursive: true });
}

function writeRolesYaml(roles: Record<string, string>, extra: Record<string, unknown> = {}) {
  mkdirSync(AGENT_DIR(), { recursive: true });
  // Minimal YAML without depending on stringify in the test setup path for
  // simple maps; keep extra keys as JSON-in-YAML via write of a small blob.
  const lines = ["modelRoles:"];
  for (const [k, v] of Object.entries(roles)) {
    lines.push(`  ${k}: ${JSON.stringify(v)}`);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (k === "modelRoles") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  writeFileSync(CONFIG(), lines.join("\n") + "\n");
}

function readModelRoles(): Record<string, string> {
  const doc = parseYaml(readFileSync(CONFIG(), "utf-8")) as Record<string, unknown>;
  const raw = doc.modelRoles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

beforeEach(() => {
  resetConfig();
  // Force YAML path in tests: empty OMP_BIN and ensure agent dir under HOME.
  delete process.env.OMP_BIN;
  process.env.PI_CODING_AGENT_DIR = AGENT_DIR();
});

afterEach(() => {
  resetConfig();
  delete process.env.PI_CODING_AGENT_DIR;
});

describe("loadRoleConfig", () => {
  it("returns empty when file is missing", () => {
    const cfg = loadRoleConfig();
    expect(cfg).toEqual({ roles: {}, rolePresets: [], activePreset: null });
  });

  it("returns empty when file is malformed YAML", () => {
    writeFileSync(CONFIG(), "modelRoles: [\n");
    const cfg = loadRoleConfig();
    expect(cfg).toEqual({ roles: {}, rolePresets: [], activePreset: null });
  });

  it("reads modelRoles from config.yml", () => {
    writeRolesYaml({ smol: "anthropic/haiku", default: "xai/grok" });
    const cfg = loadRoleConfig();
    expect(cfg.roles).toEqual({ smol: "anthropic/haiku", default: "xai/grok" });
    expect(cfg.rolePresets).toEqual([]);
    expect(cfg.activePreset).toBeNull();
  });
});

describe("saveRoleConfig", () => {
  it("writes modelRoles and preserves other YAML keys", () => {
    writeFileSync(
      CONFIG(),
      "setupVersion: 1\nautoResume: false\nmodelRoles:\n  old: x/y\n",
    );
    saveRoleConfig({ roles: { smol: "a/b" }, rolePresets: [], activePreset: null });
    const raw = readFileSync(CONFIG(), "utf-8");
    const doc = parseYaml(raw) as Record<string, unknown>;
    expect(doc.setupVersion).toBe(1);
    expect(doc.autoResume).toBe(false);
    expect(doc.modelRoles).toEqual({ smol: "a/b" });
  });

  it("writes atomically (no .tmp- file left behind)", () => {
    saveRoleConfig({ roles: { smol: "x/y" }, rolePresets: [], activePreset: null });
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const leftovers = readdirSync(AGENT_DIR()).filter((n) => n.includes(".tmp-"));
    expect(leftovers).toEqual([]);
  });
  it("refuses malformed YAML fallback without modifying the config", () => {
    const originalBin = process.env.OMP_BIN;
    const raw = "setupVersion: 1\nmodelRoles: [\n";
    writeFileSync(CONFIG(), raw);
    process.env.OMP_BIN = "/nonexistent/omp";
    try {
      expect(() =>
        saveRoleConfig({ roles: { smol: "a/b" }, rolePresets: [], activePreset: null }),
      ).toThrow(/Refusing to rewrite malformed OMP config\.yml/);
      expect(readFileSync(CONFIG(), "utf-8")).toBe(raw);
    } finally {
      if (originalBin === undefined) delete process.env.OMP_BIN;
      else process.env.OMP_BIN = originalBin;
    }
  });

});

describe("overlay helpers", () => {
  it("overlayDefaultRoles fills OMP defaults then assigned", () => {
    expect(overlayDefaultRoles({ smol: "a/b" })).toEqual(withDefaults({ smol: "a/b" }));
  });

  it("effectiveRoleNames includes defaults and extras", () => {
    const names = effectiveRoleNames({ roles: { custom: "x/y" } });
    expect(names).toContain("default");
    expect(names).toContain("smol");
    expect(names).toContain("custom");
  });

  it("overlayRoles uses effective schema", () => {
    const over = overlayRoles({ roles: { smol: "a/b" } });
    expect(over.smol).toBe("a/b");
    expect(over.default).toBe("");
  });
});

describe("lookupRole / getModelRole", () => {
  it("resolves configured role", () => {
    writeRolesYaml({ smol: "openrouter/minimax" });
    expect(lookupRole("@smol")).toEqual({ literal: "openrouter/minimax" });
    expect(getModelRole("smol")).toBe("openrouter/minimax");
  });

  it("reports not configured", () => {
    expect(lookupRole("@missing").reason).toMatch(/not configured/);
  });
});

describe("roles event handlers", () => {
  it("roles:get-all returns overlay + empty presets", async () => {
    writeRolesYaml({ default: "xai/grok" });
    const { pi } = makeFakePi();
    activate(pi);
    const data: Record<string, unknown> = {};
    await pi.events.emit("roles:get-all", data);
    expect((data.roles as Record<string, string>).default).toBe("xai/grok");
    expect(data.presets).toEqual([]);
    expect(data.activePreset).toBeNull();
  });

  it("roles:set merges and writes modelRoles", async () => {
    writeRolesYaml({ default: "xai/grok" });
    const { pi } = makeFakePi();
    activate(pi);
    const data: Record<string, unknown> = { role: "smol", modelId: "openai/gpt" };
    await pi.events.emit("roles:set", data);
    expect(data.success).toBe(true);
    expect(readModelRoles()).toEqual({ default: "xai/grok", smol: "openai/gpt" });
  });

  it("roles:set with empty modelId drops the key", async () => {
    writeRolesYaml({ smol: "a/b", default: "x/y" });
    const { pi } = makeFakePi();
    activate(pi);
    const data: Record<string, unknown> = { role: "smol", modelId: "" };
    await pi.events.emit("roles:set", data);
    expect(data.success).toBe(true);
    expect(readModelRoles()).toEqual({ default: "x/y" });
  });

  it("preset handlers refuse writes", async () => {
    const { pi } = makeFakePi();
    activate(pi);
    for (const name of ["roles:preset-load", "roles:preset-save", "roles:preset-delete"] as const) {
      const data: Record<string, unknown> = { name: "x" };
      await pi.events.emit(name, data);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/no role presets/i);
    }
  });
});

describe("schema helpers still work in-memory", () => {
  it("addRoleName / removeRoleFromSchema mutate cfg", () => {
    const cfg: RoleConfig = { roles: {}, rolePresets: [], activePreset: null };
    addRoleName(cfg, "review");
    expect(cfg.roleNames).toEqual(["review"]);
    removeRoleFromSchema(cfg, "vision");
    expect(cfg.removedRoles).toContain("vision");
  });
});
