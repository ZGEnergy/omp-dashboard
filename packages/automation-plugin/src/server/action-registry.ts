/**
 * Extensible automation action registry.
 *
 * An action is "what an automation does when it fires". The engine spawns a
 * headless run session and delivers a seed prompt; an action's `buildPrompt`
 * produces that seed from the automation's `action.payload`. Plugins register
 * actions through this registry (published via the cross-plugin service seam
 * `ctx.provide("automation.action-registry", registry)`); the built-ins
 * `core.prompt` and `core.skill` are always present.
 *
 * Ids are namespaced `<source>.<verb>` (e.g. `flows.run`) so multiple plugins
 * never collide. Each source may register at most `MAX_PER_SOURCE` actions.
 *
 * See change: register-plugin-automation-events.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  ActionDescriptor,
  ActionPayloadField,
  DiscoveredAutomation,
} from "../shared/automation-types.js";
import { BUILTIN_ACTION_ALIASES } from "../shared/automation-types.js";

/** Max actions a single source may register (clutter guard). */
export const MAX_PER_SOURCE = 12;

/** Server-side payload field — `enum` options resolve per cwd. */
export interface ActionFieldSpec {
  key: string;
  label: string;
  type: "string" | "multiline" | "text" | "enum";
  help?: string;
  /** Required for `enum`: resolve the selectable options for a cwd. */
  options?: (cwd: string) => string[];
}

/** A registered action (server-side, carries functions). */
export interface ActionRegistration {
  /** Namespaced id `<source>.<verb>`. */
  id: string;
  /** Owning source/plugin id. */
  source: string;
  label: string;
  description?: string;
  /** Usable in this cwd? Defaults to always-available. */
  available?: (cwd: string) => boolean;
  /** Why it is unavailable (shown disabled in the picker). */
  unavailableReason?: string;
  payloadSchema?: ActionFieldSpec[];
  /** Produce the run session's seed prompt from the action payload. */
  buildPrompt: (args: {
    payload: Record<string, unknown>;
    automation: DiscoveredAutomation;
  }) => string;
}

export class ActionRegistry {
  private byId = new Map<string, ActionRegistration>();
  private countBySource = new Map<string, number>();
  private warn: (msg: string) => void;

  constructor(opts?: { warn?: (msg: string) => void }) {
    this.warn = opts?.warn ?? ((m) => console.warn(m));
  }

  /**
   * Register an action. Rejected (with a logged warning, no throw) when the
   * source is already at the per-source cap, when the id is malformed, or on
   * a duplicate id.
   */
  register(reg: ActionRegistration): boolean {
    if (!/^[a-z0-9-]+\.[a-z0-9-]+$/i.test(reg.id)) {
      this.warn(`[action-registry] rejected malformed action id "${reg.id}" (expected <source>.<verb>)`);
      return false;
    }
    if (this.byId.has(reg.id)) {
      this.warn(`[action-registry] rejected duplicate action id "${reg.id}"`);
      return false;
    }
    const count = this.countBySource.get(reg.source) ?? 0;
    if (count >= MAX_PER_SOURCE) {
      this.warn(`[action-registry] source "${reg.source}" at cap (${MAX_PER_SOURCE}); rejected "${reg.id}"`);
      return false;
    }
    this.byId.set(reg.id, reg);
    this.countBySource.set(reg.source, count + 1);
    return true;
  }

  get(id: string): ActionRegistration | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** All registered action ids (for schema validation). */
  ids(): Set<string> {
    return new Set(this.byId.keys());
  }

  /**
   * Serializable descriptors for the dialog, resolved for one cwd: each
   * action's `available(cwd)` is evaluated and `enum` option lists are
   * populated. Sorted by source then id for stable grouping.
   */
  descriptorsForCwd(cwd: string): ActionDescriptor[] {
    const out: ActionDescriptor[] = [];
    for (const reg of this.byId.values()) {
      const available = reg.available ? safeBool(reg.available, cwd) : true;
      const payloadSchema: ActionPayloadField[] = (reg.payloadSchema ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        ...(f.help ? { help: f.help } : {}),
        ...(f.type === "enum" ? { options: f.options ? safeOptions(f.options, cwd) : [] } : {}),
      }));
      out.push({
        id: reg.id,
        source: reg.source,
        label: reg.label,
        ...(reg.description ? { description: reg.description } : {}),
        available,
        ...(!available && reg.unavailableReason ? { unavailableReason: reg.unavailableReason } : {}),
        payloadSchema,
      });
    }
    out.sort((a, b) => (a.source === b.source ? a.id.localeCompare(b.id) : a.source.localeCompare(b.source)));
    return out;
  }
}

function safeBool(fn: (cwd: string) => boolean, cwd: string): boolean {
  try {
    return fn(cwd);
  } catch {
    return false;
  }
}
function safeOptions(fn: (cwd: string) => string[], cwd: string): string[] {
  try {
    return fn(cwd);
  } catch {
    return [];
  }
}

/**
 * Build a registry seeded with the built-in `core.prompt` + `core.skill`
 * actions. These reproduce the legacy prompt/skill seed-prompt behavior.
 */
export function createActionRegistryWithBuiltins(opts?: { warn?: (msg: string) => void }): ActionRegistry {
  const reg = new ActionRegistry(opts);
  reg.register({
    id: "core.prompt",
    source: "core",
    label: "Prompt",
    description: "Seed a fresh session with a prompt file.",
    buildPrompt: ({ automation }) => {
      const action = automation.config?.action;
      const p = action?.prompt;
      if (!p) return "";
      const promptPath = path.isAbsolute(p) ? p : path.join(automation.dir, p);
      try {
        return fs.readFileSync(promptPath, "utf-8").trim();
      } catch {
        return "";
      }
    },
  });
  reg.register({
    id: "core.skill",
    source: "core",
    label: "Skill",
    description: "Invoke a $skill in a fresh session.",
    buildPrompt: ({ automation }) => {
      const skill = automation.config?.action?.skill;
      if (!skill) return "";
      return skill.startsWith("$") ? skill : `$${skill}`;
    },
  });
  return reg;
}

/** Normalize a bare `prompt`/`skill` action kind to its `core.*` id. */
export function normalizeActionKind(kind: string): string {
  return (BUILTIN_ACTION_ALIASES as Record<string, string>)[kind] ?? kind;
}
