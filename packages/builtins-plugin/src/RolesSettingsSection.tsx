/**
 * BuiltInRolesSettings — roles editing UI, surfaced via the existing
 * `settings-section` slot under General tab.
 *
 * Roles AND models are GLOBAL in pi-flows / pi-coding-agent (single
 * `~/.pi/agent/providers.json`, single ModelRegistry per pi process). The
 * dashboard piggybacks on the existing `usePluginConfig` plumbing — every
 * other plugin's settings UI uses it — by having `useMessageHandler` route
 * incoming `roles_list` and `models_list` payloads through
 * `applyPluginConfigUpdate({ id: "builtins", config: ... })`. The component
 * reads via `usePluginConfig<BuiltinsConfig>()`. No new context primitive,
 * no per-session keying, no sentinel session id.
 *
 * Reuses the pre-existing role protocol (`role_set`, `role_preset_load`,
 * `role_preset_save`, `role_preset_delete`); no new WS messages are
 * introduced.
 *
 * See change: fix-pi-flows-end-to-end (Group 5 — global roles refactor).
 */
import React, { useState } from "react";
import {
  usePluginConfig,
  usePluginSend,
  useAllSessions,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";

interface ModelInfo {
  provider: string;
  /** pi-coding-agent shape uses `id`; full label is `<provider>/<id>`. */
  id: string;
}

/**
 * Plugin config shape for the built-ins plugin. Populated by
 * `useMessageHandler` routing `roles_list` and `models_list` WS payloads
 * through `applyPluginConfigUpdate({id: "builtins", ...})`.
 */
interface BuiltinsConfig {
  roles?: Record<string, string>;
  presets?: Array<{ name: string; roles: Record<string, string> }>;
  activePreset?: string | null;
  models?: ModelInfo[];
}

function shortModel(fullId: string): string {
  const parts = fullId.split("/");
  return parts[parts.length - 1];
}

export function BuiltInRolesSettings() {
  const cfg = usePluginConfig<BuiltinsConfig>();
  const send = usePluginSend();
  // pi-flows roles are GLOBAL, but the server's WS routing forwards
  // role_set / role_preset_* messages to a specific pi session by id
  // (`piGateway.sendToSession(msg.sessionId, ...)`). The bridge handler
  // there ignores the routed sessionId and emits flow:role-* on its own
  // session's pi.events bus — any live session works as a transport.
  // Pick the first non-ended session as the routing target.
  const allSessions = useAllSessions();
  const liveSessionId =
    allSessions.find((s) => (s as any).status !== "ended")?.id;

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  const rolesMap = cfg?.roles ?? {};
  const presets = cfg?.presets ?? [];
  const activePreset = cfg?.activePreset ?? null;
  const models = cfg?.models ?? [];

  if (Object.keys(rolesMap).length === 0) {
    return (
      <section data-testid="roles-settings-empty" className="text-xs text-[var(--text-muted)] py-2">
pi-flows is not installed (or no roles configured yet). Install `pi-flows` to assign per-role models.
      </section>
    );
  }

  const dispatch = (msg: unknown) => send(msg);

  function setRole(role: string, provider: string, modelId: string) {
    if (!liveSessionId) return; // no pi session to route through; UI no-op
    dispatch({
      type: "role_set",
      sessionId: liveSessionId,
      role,
      provider,
      modelId,
    });
    setEditingRole(null);
    setFilter("");
  }

  function loadPreset(name: string) {
    if (!liveSessionId) return;
    dispatch({
      type: "role_preset_load",
      sessionId: liveSessionId,
      presetName: name,
    });
  }

  function savePreset(name: string) {
    if (!liveSessionId) return;
    dispatch({
      type: "role_preset_save",
      sessionId: liveSessionId,
      presetName: name,
    });
    setSavingPreset(false);
    setPresetName("");
  }

  function deletePreset(name: string) {
    if (!liveSessionId) return;
    dispatch({
      type: "role_preset_delete",
      sessionId: liveSessionId,
      presetName: name,
    });
  }

  const modelStrings = models.map((m) => `${m.provider}/${m.id}`);

  const filteredModels = filter
    ? modelStrings.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
    : modelStrings;

  return (
    <section
      data-testid="roles-settings"
      className="border-t border-[var(--border-primary)] pt-3 mt-3"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          pi-flows Roles
        </h3>
        <span className="text-[10px] text-[var(--text-muted)]">
          global role → model assignments (used by pi-flows)
        </span>
      </div>

      {/* Preset row */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {presets.map((preset) => (
          <span key={preset.name} className="relative group/preset shrink-0">
            <button
              data-testid={`roles-preset-load-${preset.name}`}
              onClick={() => loadPreset(preset.name)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                activePreset === preset.name
                  ? "bg-[var(--accent-blue)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {preset.name}
            </button>
            <button
              data-testid={`roles-preset-delete-${preset.name}`}
              onClick={(e) => { e.stopPropagation(); deletePreset(preset.name); }}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-red-500/30 text-[9px] leading-none flex items-center justify-center opacity-0 group-hover/preset:opacity-100 transition-opacity"
              aria-label={`Delete preset ${preset.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {!savingPreset && (
          <button
            data-testid="roles-preset-save-new"
            onClick={() => { setSavingPreset(true); setPresetName(""); }}
            className="px-2 py-0.5 text-[11px] rounded shrink-0 bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            + Save current as preset
          </button>
        )}
        {savingPreset && (
          <span className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              data-testid="roles-preset-name-input"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) savePreset(presetName.trim());
                else if (e.key === "Escape") { setSavingPreset(false); setPresetName(""); }
              }}
              placeholder="preset name…"
              className="w-32 px-2 py-0.5 text-[11px] bg-[var(--bg-tertiary)] border border-[var(--accent-blue)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
            />
            <button
              data-testid="roles-preset-save-confirm"
              onClick={() => { if (presetName.trim()) savePreset(presetName.trim()); }}
              className="text-[11px] text-[var(--accent-blue)] hover:text-[var(--text-primary)]"
            >
              ✓
            </button>
          </span>
        )}
      </div>

      {/* Role grid */}
      <div className="grid grid-cols-2 gap-1 mb-2">
        {Object.entries(rolesMap).map(([role, modelId]) => {
          const isEditing = editingRole === role;
          return (
            <button
              key={role}
              data-testid={`roles-row-${role}`}
              onClick={() => {
                setEditingRole(isEditing ? null : role);
                setFilter("");
              }}
              className={`flex items-baseline gap-2 px-2 py-1 rounded text-left min-w-0 transition-all ${
                isEditing
                  ? "bg-[color-mix(in_srgb,var(--accent-blue)_25%,transparent)] outline outline-2 outline-[var(--accent-blue)]"
                  : "bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]"
              }`}
              title={modelId}
            >
              <span className={`text-[11px] font-semibold shrink-0 ${isEditing ? "text-[var(--accent-blue)]" : "text-[var(--accent-blue)]/70"}`}>
                @{role}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                {shortModel(modelId)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Inline model picker when a role is being edited */}
      {editingRole && (
        <div data-testid="roles-model-picker" className="border border-[var(--border-primary)] rounded p-2">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">
            Assign model to <span className="font-semibold text-[var(--accent-blue)]">@{editingRole}</span>
          </div>
          <input
            autoFocus
            data-testid="roles-model-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter models…"
            className="w-full px-2 py-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
          />
          <div className="mt-1 max-h-60 overflow-y-auto">
            {filteredModels.slice(0, 200).map((modelStr) => {
              const slashIdx = modelStr.indexOf("/");
              const provider = slashIdx > 0 ? modelStr.slice(0, slashIdx) : "";
              const modelId = slashIdx > 0 ? modelStr.slice(slashIdx + 1) : modelStr;
              const isCurrent = rolesMap[editingRole] === modelStr;
              return (
                <button
                  key={modelStr}
                  data-testid={`roles-model-option-${modelStr}`}
                  onClick={() => setRole(editingRole, provider, modelId)}
                  className={`block w-full text-left px-2 py-1 text-[11px] font-mono rounded ${
                    isCurrent
                      ? "bg-[var(--accent-blue)] text-white"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {modelStr}
                </button>
              );
            })}
            {filteredModels.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                No models match.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
