/**
 * Model resolution at spawn time.
 *
 * `model` may be a bare provider/model id (passthrough) or an `@role` alias.
 * `@role` is resolved against OMP `config.yml#modelRoles` (the same map the
 * roles plugin writes). An unresolvable role falls back to the configured
 * default model AND surfaces a run error — never a silent pick.
 *
 * See change: add-automation-plugin; OMP settings mirror cutover.
 */
import fs from "node:fs";
import os from "node:os";
import { resolveOmpConfigYml } from "@blackbelt-technology/pi-dashboard-shared/omp-agent-paths.js";
import { parse as parseYaml } from "yaml";

export interface ResolveResult {
  /** Concrete provider/model id to spawn with (empty → shell default). */
  model: string;
  /** Set when an `@role` could not be resolved; the run records this error. */
  error?: string;
}

function asRolesMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return out;
}

/**
 * Read `modelRoles` from OMP agent config.yml.
 * Precedence: PI_CODING_AGENT_DIR, else `~/.omp/agent/config.yml`.
 * Returns `{}` on any failure.
 */
export function readRolesFromDisk(homeDir: string = os.homedir()): Record<string, string> {
  const p = resolveOmpConfigYml({
    homedir: homeDir,
    agentDirEnv: process.env.PI_CODING_AGENT_DIR,
  });
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const doc: unknown = parseYaml(raw);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {};
    return asRolesMap((doc as Record<string, unknown>).modelRoles);
  } catch {
    return {};
  }
}

export interface ResolveOptions {
  /** Role map (injectable for tests). Defaults to on-disk OMP modelRoles. */
  readRoles?: () => Record<string, string>;
  /** Configured fallback model id when an `@role` is unresolved. */
  defaultModel?: string;
}

/**
 * Resolve an automation `model` field. `@role` → concrete model via the role
 * map; bare ids pass through. Unresolved `@role` → `{ model: defaultModel,
 * error }`.
 */
export function resolveModel(model: string, opts: ResolveOptions = {}): ResolveResult {
  const trimmed = model.trim();
  if (!trimmed.startsWith("@")) {
    return { model: trimmed };
  }
  const roleName = trimmed.slice(1);
  const roles = (opts.readRoles ?? readRolesFromDisk)();
  const resolved = roles[roleName];
  if (resolved && resolved.length > 0) {
    return { model: resolved };
  }
  return {
    model: opts.defaultModel ?? "",
    error: `unresolved role "${trimmed}"${opts.defaultModel ? ` — falling back to default model "${opts.defaultModel}"` : " — no default model configured"}`,
  };
}
