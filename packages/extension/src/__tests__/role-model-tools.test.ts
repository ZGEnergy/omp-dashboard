/**
 * Tests for the agent-facing role/model tools (list_models, list_roles,
 * update_roles) registered by role-model-tools.ts.
 *
 * ZGE: roles SSOT is OMP `~/.omp/agent/config.yml#modelRoles` (not
 * `~/.pi/agent/providers.json` presets). Preset actions do not persist because
 * saveRoleConfig only writes the roles map.
 *
 * See change: add-agent-role-model-tools / OMP settings mirror.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { activate as activateProviderRegister } from "../provider-register.js";
import { buildModelRows, registerRoleModelTools } from "../role-model-tools.js";

const AGENT_DIR = () => join(homedir(), ".omp", "agent");
const CONFIG = () => join(AGENT_DIR(), "config.yml");
const PI_PROVIDERS = () => join(homedir(), ".pi", "agent", "providers.json");

function resetConfig() {
  mkdirSync(AGENT_DIR(), { recursive: true });
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  if (existsSync(CONFIG())) rmSync(CONFIG());
  if (existsSync(PI_PROVIDERS())) rmSync(PI_PROVIDERS());
  delete process.env.OMP_BIN;
}

function writeRolesYaml(roles: Record<string, string>) {
  mkdirSync(AGENT_DIR(), { recursive: true });
  const lines = ["modelRoles:"];
  for (const [k, v] of Object.entries(roles)) {
    lines.push(`  ${k}: ${JSON.stringify(v)}`);
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

function mkPi() {
  const tools = new Map<string, any>();
  const pi: any = {
    registerTool: (t: any) => tools.set(t.name, t),
    events: { on: () => {}, emit: async () => {} },
  };
  return { pi, tools };
}

function makeRegistry(available: any[], all?: any[]) {
  return {
    getAvailable: () => available,
    getAll: () => all ?? available,
  };
}

beforeEach(resetConfig);
afterEach(resetConfig);

describe("list_models", () => {
  it("returns assignable refs with capability metadata", async () => {
    const { pi, tools } = mkPi();
    const registry = makeRegistry([
      {
        provider: "anthropic",
        id: "claude-x",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 200000,
        cost: { input: 3, output: 15 },
      },
    ]);
    registerRoleModelTools(pi, { getRegistry: () => registry });
    const res = await tools.get("list_models").execute("id", {}, null, null, {});
    const { models } = res.details;
    expect(models).toHaveLength(1);
    expect(models[0].ref).toBe("anthropic/claude-x");
    expect(models[0].provider).toBe("anthropic");
    expect(models[0].id).toBe("claude-x");
    expect(models[0].reasoning).toBe(true);
    expect(models[0].input).toEqual(["text", "image"]);
    expect(models[0].contextWindow).toBe(200000);
    expect(models[0].cost).toEqual({ input: 3, output: 15 });
  });

  it("works when roles are missing/malformed (roles-independent)", async () => {
    writeFileSync(CONFIG(), "modelRoles: [\n");
    const { pi, tools } = mkPi();
    const registry = makeRegistry([{ provider: "openai", id: "gpt-5" }]);
    registerRoleModelTools(pi, { getRegistry: () => registry });
    const res = await tools.get("list_models").execute("id", {}, null, null, {});
    expect(res.details.models[0].ref).toBe("openai/gpt-5");
  });

  it("flags custom-registered providers with custom:true (matching ModelSelector source)", async () => {
    writeFileSync(
      PI_PROVIDERS(),
      JSON.stringify({
        providers: { mycustom: { baseUrl: "http://x", apiKey: "$MYKEY" } },
      }),
    );
    process.env.MYKEY = "";
    const fakePi: any = {
      events: { on: () => {} },
      on: () => {},
      registerProvider: () => {},
      unregisterProvider: () => {},
    };
    activateProviderRegister(fakePi);

    const { pi, tools } = mkPi();
    const registry = makeRegistry([{ provider: "mycustom", id: "foo-v2" }]);
    registerRoleModelTools(pi, { getRegistry: () => registry });
    const res = await tools.get("list_models").execute("id", {}, null, null, {});
    const row = res.details.models.find((m: any) => m.ref === "mycustom/foo-v2");
    expect(row).toBeDefined();
    expect(row.custom).toBe(true);
  });

  it("annotated mode surfaces uncredentialed models with excludedReason", async () => {
    const { pi, tools } = mkPi();
    const reachable = { provider: "anthropic", id: "claude-x" };
    const excluded = { provider: "mycustom", id: "foo-v2" };
    const registry = makeRegistry([reachable], [reachable, excluded]);
    registerRoleModelTools(pi, { getRegistry: () => registry });

    const def = await tools.get("list_models").execute("id", {}, null, null, {});
    expect(def.details.models.some((m: any) => m.ref === "mycustom/foo-v2")).toBe(false);

    const ann = await tools.get("list_models").execute("id", { annotated: true }, null, null, {});
    const row = ann.details.models.find((m: any) => m.ref === "mycustom/foo-v2");
    expect(row.excludedReason).toBe("no-credential");
    const inc = ann.details.models.find((m: any) => m.ref === "anthropic/claude-x");
    expect(inc.excludedReason).toBeNull();
  });

  it("buildModelRows returns [] when no registry is available", () => {
    expect(buildModelRows(null, false)).toEqual([]);
  });
});

describe("list_roles", () => {
  it("returns bound roles only; OMP has no presets", async () => {
    writeRolesYaml({ planning: "anthropic/claude-x", coding: "openai/gpt-5", vision: "" });
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const res = await tools.get("list_roles").execute("id", {}, null, null, {});
    expect(res.details.roles).toEqual({ planning: "anthropic/claude-x", coding: "openai/gpt-5" });
    expect(res.details.roles.vision).toBeUndefined();
    expect(res.details.presets).toEqual([]);
    expect(res.details.activePreset).toBeNull();
    expect("models" in res.details).toBe(false);
  });

  it("tolerates a missing role config", async () => {
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const res = await tools.get("list_roles").execute("id", {}, null, null, {});
    expect(res.details).toEqual({ roles: {}, presets: [], activePreset: null });
  });
});

describe("update_roles", () => {
  const confirmCtx = (confirmed: boolean) => ({ ui: { confirm: async () => confirmed } });

  it("declining confirmation returns success:false and does NOT write", async () => {
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const res = await tools.get("update_roles").execute(
      "id",
      { action: "set_role", role: "review", ref: "anthropic/claude-x" },
      null,
      null,
      confirmCtx(false),
    );
    expect(res.details.success).toBe(false);
    expect(existsSync(CONFIG())).toBe(false);
  });

  it("set_role creates a new role on first assignment (confirmed)", async () => {
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const res = await tools.get("update_roles").execute(
      "id",
      { action: "set_role", role: "review", ref: "anthropic/claude-x" },
      null,
      null,
      confirmCtx(true),
    );
    expect(res.details.success).toBe(true);
    expect(readModelRoles().review).toBe("anthropic/claude-x");
  });

  it("set_role with unknown preset fails (OMP has no rolePresets)", async () => {
    writeRolesYaml({ coding: "old/model" });
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const res = await tools.get("update_roles").execute(
      "id",
      { action: "set_role", role: "coding", ref: "openai/gpt-5", preset: "premium" },
      null,
      null,
      confirmCtx(true),
    );
    expect(res.details.success).toBe(false);
    expect(readModelRoles().coding).toBe("old/model");
  });

  it("remove_role purges from active map", async () => {
    writeRolesYaml({ vision: "x/y", coding: "a/b" });
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    await tools.get("update_roles").execute(
      "id",
      { action: "remove_role", role: "vision" },
      null,
      null,
      confirmCtx(true),
    );
    const after = readModelRoles();
    expect(after.vision).toBeUndefined();
    expect(after.coding).toBe("a/b");
  });

  it("create_preset is accepted but not persisted (OMP modelRoles only)", async () => {
    writeRolesYaml({ fast: "a/b" });
    const { pi, tools } = mkPi();
    registerRoleModelTools(pi, { getRegistry: () => null });
    const tool = tools.get("update_roles");

    const created = await tool.execute(
      "id",
      { action: "create_preset", name: "snap" },
      null,
      null,
      confirmCtx(true),
    );
    expect(created.details.success).toBe(true);
    const listed = await tools.get("list_roles").execute("id", {}, null, null, {});
    expect(listed.details.presets).toEqual([]);
    expect(listed.details.roles.fast).toBe("a/b");
  });
});
