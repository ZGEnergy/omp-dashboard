/**
 * Roles settings — OMP `modelRoles` via `/api/omp-config`.
 *
 * Built-in OMP roles always shown; extras from the live record included.
 * No pi-flows presets. Save writes one full `modelRoles` record after a
 * re-read merge so concurrent editors do not clobber each other.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePluginConfig } from "@blackbelt-technology/dashboard-plugin-runtime/context";
import {
  useUiPrimitive,
  useSettingsDraftSource,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import {
  fetchOmpConfig,
  mergeOmpModelRoles,
} from "./omp-config-client.js";
/** Canonical OMP built-in role ids (docs settings.md Models section). */
export const OMP_BUILTIN_ROLES = [
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

interface ModelInfo {
  provider: string;
  id: string;
}

/**
 * Read-time migration helper for legacy bare-id role values.
 */
export function inferProviderForBareId(
  stored: string,
  models: ModelInfo[],
): string {
  if (!stored || stored.includes("/")) return stored;
  const match = models.find((m) => m.id === stored);
  return match ? `${match.provider}/${stored}` : stored;
}

export function computeEffectiveRoles(
  rolesMap: Record<string, string>,
  pending: Record<string, string>,
): Record<string, string> {
  return { ...rolesMap, ...pending };
}

export function computeDirtyRoles(
  rolesMap: Record<string, string>,
  pending: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const role of Object.keys(pending)) {
    if (pending[role] !== (rolesMap[role] ?? "")) out.push(role);
  }
  return out;
}

function shortModel(fullId: string): string {
  const parts = fullId.split("/");
  return parts[parts.length - 1] ?? fullId;
}

function asRolesMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function BuiltInRolesSettings() {
  const ModelSelectorPrimitive = useUiPrimitive(UI_PRIMITIVE_KEYS.modelSelector);

  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Models arrive via WS models_list → applyPluginConfigUpdate({ id: "roles", models }).
  const pluginCfg = usePluginConfig<{ models?: ModelInfo[] }>();
  const models: ModelInfo[] = Array.isArray(pluginCfg?.models) ? pluginCfg.models : [];

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await fetchOmpConfig(signal);
      setRolesMap(asRolesMap(snap.settings.modelRoles?.value));
      setPending({});
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void reload(ac.signal);
    return () => ac.abort();
  }, [reload]);

  const roleKeys = useMemo(() => {
    const extras = Object.keys(rolesMap).filter(
      (k) => !(OMP_BUILTIN_ROLES as readonly string[]).includes(k),
    );
    extras.sort((a, b) => a.localeCompare(b));
    return [...OMP_BUILTIN_ROLES, ...extras];
  }, [rolesMap]);

  const dirtyRoles = computeDirtyRoles(rolesMap, pending);
  const isDirty = dirtyRoles.length > 0;
  const effective = (role: string) => pending[role] ?? rolesMap[role] ?? "";
  const isAssigned = (role: string) => effective(role).trim() !== "";
  const hasAnyAssigned = roleKeys.some((role) => isAssigned(role));

  function setRole(role: string, modelLabel: string) {
    setPending((prev) => {
      if (modelLabel === (rolesMap[role] ?? "")) {
        const { [role]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [role]: modelLabel };
    });
    setEditingRole(null);
  }

  const commit = useCallback(async () => {
    // Re-read-merge-write via mergeOmpModelRoles so Sessions defaultModel
    // edits landing between load and save are preserved.
    await mergeOmpModelRoles(pending);
    await reload();
  }, [pending, reload]);

  const reset = useCallback(() => setPending({}), []);

  useSettingsDraftSource({ id: "plugin:roles", page: "general", isDirty, commit, reset });

  return (
    <section
      data-testid="roles-settings"
      className="border border-[var(--border-primary)] rounded-lg p-4 space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Roles
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">
          OMP modelRoles → provider/model
        </span>
      </div>

      {loading && (
        <p className="text-[11px] text-[var(--text-muted)]">Loading roles…</p>
      )}
      {loadError && (
        <div className="text-[11px] text-[var(--accent-red)] space-y-1">
          <p>{loadError}</p>
          <button
            type="button"
            className="text-[var(--accent-blue)]"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !hasAnyAssigned && !loadError && (
        <div
          data-testid="roles-settings-setup-banner"
          className="text-[11px] text-[var(--accent-warning,#f59e0b)] border border-[var(--border-secondary)] rounded px-2 py-1.5 bg-[var(--bg-tertiary)]"
        >
          No roles have been set up — assign a model to a role below. Writes
          OMP <code>modelRoles</code> in <code>~/.omp/agent/config.yml</code>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {roleKeys.map((role) => {
          const isEditing = editingRole === role;
          const dirty = role in pending && pending[role] !== (rolesMap[role] ?? "");
          const assigned = isAssigned(role);
          const displayLabel = inferProviderForBareId(effective(role), models);
          return (
            <button
              key={role}
              type="button"
              data-testid={`roles-row-${role}`}
              onClick={() => setEditingRole(isEditing ? null : role)}
              className={`flex items-center gap-2 px-2 py-1 rounded text-left min-w-0 transition-all ${
                isEditing
                  ? "bg-[color-mix(in_srgb,var(--accent-blue)_25%,transparent)] outline outline-2 outline-[var(--accent-blue)]"
                  : "bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]"
              }`}
              title={assigned ? displayLabel : `Set a model for @${role}`}
            >
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  isEditing ? "text-[var(--accent-blue)]" : "text-[var(--accent-blue)]/70"
                }`}
              >
                @{role}
              </span>
              {assigned ? (
                <span className="text-[11px] text-[var(--text-muted)] font-mono truncate flex-1">
                  {shortModel(displayLabel)}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--accent-blue)] truncate flex-1">
                  + Add model
                </span>
              )}
              {dirty && (
                <span
                  data-testid={`roles-row-${role}-dirty`}
                  aria-label="unsaved"
                  className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-warning,#f59e0b)] shrink-0"
                />
              )}
            </button>
          );
        })}
      </div>

      {editingRole && (
        <div
          data-testid="roles-model-picker"
          className="border border-[var(--border-primary)] rounded p-2"
        >
          <div className="text-[11px] text-[var(--text-muted)] mb-1">
            Assign model to{" "}
            <span className="font-semibold text-[var(--accent-blue)]">@{editingRole}</span>
          </div>
          <ModelSelectorPrimitive
            current={inferProviderForBareId(effective(editingRole), models)}
            models={models}
            onSelect={(modelLabel: string) => setRole(editingRole, modelLabel)}
          />
        </div>
      )}
    </section>
  );
}
