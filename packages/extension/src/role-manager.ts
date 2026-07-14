/**
 * Role Manager Extension (Dashboard) — OMP `modelRoles` SSOT.
 *
 * Reads/writes OMP agent `config.yml#modelRoles` (default
 * `~/.omp/agent/config.yml`). Preset handlers are stubs (OMP has no
 * rolePresets). Writes prefer `omp config set modelRoles … --json`; fall
 * back to atomic YAML merge of only the `modelRoles` key.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { execFileSync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import { getDefaultRegistry } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { resolveOmpAgentDir, resolveOmpConfigYml } from "@blackbelt-technology/pi-dashboard-shared/omp-agent-paths.js";

// -- Types ----------------------------------------------------------------

export interface RolePreset {
  name: string;
  roles: Record<string, string>;
}

export interface RoleConfig {
  roles: Record<string, string>;
  rolePresets: RolePreset[];
  activePreset: string | null;
  roleNames?: string[];
  removedRoles?: string[];
}

/** Canonical OMP built-in role ids. */
export const DEFAULT_ROLE_NAMES = [
  "default",
  "smol",
  "slow",
  "plan",
  "task",
  "tiny",
  "advisor",
  "designer",
  "commit",
  "vision",
] as const;

// -- Paths ----------------------------------------------------------------

function agentDir(): string {
  return resolveOmpAgentDir({
    homedir: homedir(),
    agentDirEnv: process.env.PI_CODING_AGENT_DIR,
  });
}

function configYmlPath(): string {
  return resolveOmpConfigYml({
    homedir: homedir(),
    agentDirEnv: process.env.PI_CODING_AGENT_DIR,
  });
}

// -- Roles I/O ------------------------------------------------------------

function asRolesMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return out;
}

function readModelRolesFromYaml(): Record<string, string> {
  const path = configYmlPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    const doc: unknown = parseYaml(raw);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {};
    const modelRoles = (doc as Record<string, unknown>).modelRoles;
    return asRolesMap(modelRoles);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[dashboard] config.yml parse failed at ${path}: ${message}`);
    return {};
  }
}

function resolveOmpBinary(): string | null {
  const override = process.env.OMP_BIN?.trim();
  if (override) return override;
  try {
    const res = getDefaultRegistry().resolve("pi");
    if (res.ok && res.path && !/\.(?:js|cjs|mjs)$/i.test(res.path)) {
      const base = res.path.split(/[/\\]/).pop()?.toLowerCase() ?? "";
      if (base === "node" || base === "node.exe") return null;
      return res.path;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeModelRolesViaCli(roles: Record<string, string>): boolean {
  const bin = resolveOmpBinary();
  if (!bin) return false;
  try {
    execFileSync(bin, ["config", "set", "modelRoles", JSON.stringify(roles), "--json"], {
      encoding: "utf-8",
      timeout: 15_000,
      env: process.env,
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[dashboard] omp config set modelRoles failed: ${message}`);
    return false;
  }
}

function writeModelRolesViaYaml(roles: Record<string, string>): void {
  const path = configYmlPath();
  const dir = agentDir();
  mkdirSync(dir, { recursive: true });
  let doc: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed: unknown = parseYaml(readFileSync(path, "utf-8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        doc = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      doc = {};
    }
  }
  doc.modelRoles = roles;
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, stringifyYaml(doc));
  renameSync(tmp, path);
}

function writeModelRoles(roles: Record<string, string>): void {
  if (!writeModelRolesViaCli(roles)) {
    writeModelRolesViaYaml(roles);
  }
}

/**
 * Read OMP modelRoles. Tolerant of missing/malformed config.yml.
 * Presets are always empty — OMP has no rolePresets.
 */
export function loadRoleConfig(): RoleConfig {
  const roles = readModelRolesFromYaml();
  return {
    roles,
    rolePresets: [],
    activePreset: null,
  };
}

/**
 * Write roles map to OMP modelRoles. Preserves other config.yml keys.
 * rolePresets/activePreset/roleNames/removedRoles are ignored (OMP surface).
 */
export function saveRoleConfig(roleConfig: RoleConfig): void {
  writeModelRoles(roleConfig.roles ?? {});
}

export function overlayDefaultRoles(
  roles: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of DEFAULT_ROLE_NAMES) out[name] = "";
  return { ...out, ...roles };
}

export function effectiveRoleNames(
  cfg: Pick<RoleConfig, "roles" | "roleNames" | "removedRoles">,
): string[] {
  const removed = new Set(cfg.removedRoles ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of [...DEFAULT_ROLE_NAMES, ...(cfg.roleNames ?? []), ...Object.keys(cfg.roles)]) {
    if (removed.has(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function overlayRoles(
  cfg: Pick<RoleConfig, "roles" | "roleNames" | "removedRoles">,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of effectiveRoleNames(cfg)) out[name] = "";
  return { ...out, ...cfg.roles };
}

export function addRoleName(cfg: RoleConfig, role: string): void {
  if (cfg.removedRoles) cfg.removedRoles = cfg.removedRoles.filter((r) => r !== role);
  const isDefault = (DEFAULT_ROLE_NAMES as readonly string[]).includes(role);
  if (!isDefault) {
    cfg.roleNames = cfg.roleNames ?? [];
    if (!cfg.roleNames.includes(role)) cfg.roleNames.push(role);
  }
}

export function removeRoleFromSchema(cfg: RoleConfig, role: string): void {
  delete cfg.roles[role];
  for (const p of cfg.rolePresets) delete p.roles[role];
  if (cfg.roleNames) cfg.roleNames = cfg.roleNames.filter((r) => r !== role);
  const isDefault = (DEFAULT_ROLE_NAMES as readonly string[]).includes(role);
  if (isDefault) {
    cfg.removedRoles = cfg.removedRoles ?? [];
    if (!cfg.removedRoles.includes(role)) cfg.removedRoles.push(role);
  }
}

let currentRoles: Record<string, string> = {};

export function lookupRole(ref: string): { literal?: string; reason?: string } {
  const roleName = ref.startsWith("@") ? ref.slice(1) : ref;
  if (!roleName) return { reason: "empty role name" };
  const cfg = loadRoleConfig();
  currentRoles = cfg.roles;
  const mapped = cfg.roles[roleName];
  if (typeof mapped === "string" && mapped.trim() !== "") {
    return { literal: mapped.trim() };
  }
  return { reason: `role '${roleName}' not configured yet` };
}

export function getModelRole(role: string): string | undefined {
  return lookupRole(role).literal;
}

type RolesEventData = {
  role?: string;
  modelId?: string;
  name?: string;
  success?: boolean;
  error?: string;
  roles?: Record<string, string>;
  presets?: RolePreset[];
  activePreset?: string | null;
  ref?: string;
  available?: Record<string, string>;
  resolved?: string;
  reason?: string;
};

export function activate(pi: ExtensionAPI): void {
  const initial = loadRoleConfig();
  currentRoles = initial.roles;

  pi.events.on("role:resolve-model", (probe: RolesEventData) => {
    if (!probe || typeof probe.ref !== "string") return;
    const ref = probe.ref.trim();
    const roleName = ref.startsWith("@") ? ref.slice(1) : ref;
    if (!roleName) return;
    const cfg = loadRoleConfig();
    currentRoles = cfg.roles;
    probe.available = cfg.roles;
    const { literal, reason } = lookupRole(ref);
    if (literal) {
      probe.resolved = literal;
    } else {
      probe.reason = reason;
    }
  });

  pi.events.on("roles:get-all", (data: RolesEventData) => {
    const cfg = loadRoleConfig();
    data.roles = overlayRoles(cfg);
    data.presets = [];
    data.activePreset = null;
  });

  pi.events.on("roles:set", (data: RolesEventData) => {
    const role = data?.role;
    const modelId = data?.modelId;
    if (!role || typeof role !== "string") {
      if (data) data.success = false;
      return;
    }
    const cfg = loadRoleConfig();
    const next = { ...cfg.roles };
    if (!modelId || String(modelId).trim() === "") {
      delete next[role];
    } else {
      next[role] = String(modelId).trim();
    }
    writeModelRoles(next);
    currentRoles = next;
    if (data) {
      data.success = true;
      data.roles = overlayRoles({ roles: next });
      data.presets = [];
      data.activePreset = null;
    }
  });

  // OMP has no role presets — stubs that refuse writes.
  const presetStub = (data: RolesEventData) => {
    if (data) {
      data.success = false;
      data.error = "OMP has no role presets";
    }
  };
  pi.events.on("roles:preset-load", presetStub);
  pi.events.on("roles:preset-save", presetStub);
  pi.events.on("roles:preset-delete", presetStub);
}
