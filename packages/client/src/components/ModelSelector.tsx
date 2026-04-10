import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@mdi/react";
import { mdiChevronDown, mdiChevronRight, mdiLoading } from "@mdi/js";
import type { ModelInfo, RoleInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";

interface Props {
  current?: string;
  models?: ModelInfo[];
  roles?: RoleInfo;
  onSelect: (model: string) => void;
  onRoleSet?: (role: string, modelId: string) => void;
  onPresetLoad?: (presetName: string) => void;
  onPresetSave?: (presetName: string) => void;
  onPresetDelete?: (presetName: string) => void;
}

/** Extract short model name: "provider/sub/model-name" → "model-name" */
function shortModel(fullId: string): string {
  const parts = fullId.split("/");
  return parts[parts.length - 1];
}

export function ModelSelector({ current, models, roles, onSelect, onRoleSet, onPresetLoad, onPresetSave, onPresetDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [rolesCollapsed, setRolesCollapsed] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasModels = models && models.length > 0;
  const hasRoles = roles && Object.keys(roles.roles).length > 0;

  // Clear pending state when current model updates to match
  useEffect(() => {
    if (pendingModel && current === pendingModel) setPendingModel(null);
  }, [current, pendingModel]);

  // Safety timeout: clear pending after 10s if no update arrives
  useEffect(() => {
    if (!pendingModel) return;
    const timer = setTimeout(() => setPendingModel(null), 10_000);
    return () => clearTimeout(timer);
  }, [pendingModel]);

  const filtered = hasModels
    ? models.filter((m) => {
        const q = filter.toLowerCase();
        return `${m.provider}/${m.id}`.toLowerCase().includes(q);
      })
    : [];

  // Reset filter and index when opening
  useEffect(() => {
    if (open) {
      setFilter("");
      setSelectedIndex(0);
      setEditingRole(null);
      setSavingPreset(false);
      setPresetName("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-model-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback((m: ModelInfo) => {
    const label = `${m.provider}/${m.id}`;
    if (editingRole && onRoleSet) {
      onRoleSet(editingRole, label);
      setEditingRole(null);
      setFilter("");
    } else {
      setPendingModel(label);
      onSelect(label);
      setOpen(false);
    }
  }, [editingRole, onRoleSet, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      if (editingRole) {
        setEditingRole(null);
        setFilter("");
      } else {
        setOpen(false);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative" data-testid="model-selector">
      <button
        onClick={() => hasModels && setOpen(!open)}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
          hasModels
            ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            : "text-[var(--text-muted)]"
        }`}
        disabled={!hasModels}
        data-testid="model-selector-button"
      >
        <span className="font-mono truncate max-w-[200px]">
          {pendingModel ? <>{pendingModel} <Icon path={mdiLoading} size={0.4} className="inline animate-spin" /></> : (current ?? "no model")}
        </span>
        {hasModels && !pendingModel && <Icon path={mdiChevronDown} size={0.5} />}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg shadow-lg z-50 overflow-hidden"
          style={{ width: hasRoles ? "26rem" : "18rem" }}
          data-testid="model-dropdown"
        >
          {/* ── Roles section ── */}
          {hasRoles && (
            <div className="border-b border-[var(--border-primary)]">
              {/* Roles header + Preset row */}
              <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5 overflow-x-auto">
                  <button
                    onClick={() => setRolesCollapsed((c) => !c)}
                    className="flex items-center gap-0 shrink-0 mr-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Icon path={rolesCollapsed ? mdiChevronRight : mdiChevronDown} size={0.45} />
                    <span className="text-[10px] uppercase tracking-wider">Roles</span>
                  </button>
                  {roles.presets.map((preset) => (
                    <span key={preset.name} className="relative shrink-0 group/preset">
                      <button
                        onClick={() => onPresetLoad?.(preset.name)}
                        className={`px-1.5 py-px text-[10px] rounded transition-colors ${
                          roles.activePreset === preset.name
                            ? "bg-[var(--accent-blue)] text-white"
                            : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        {preset.name}
                      </button>
                      {onPresetDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPresetDelete(preset.name); }}
                          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-red-500/30 text-[8px] leading-none flex items-center justify-center opacity-0 group-hover/preset:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {onPresetSave && !savingPreset && (
                    <button
                      onClick={() => { setSavingPreset(true); setPresetName(""); requestAnimationFrame(() => presetInputRef.current?.focus()); }}
                      className="px-1.5 py-px text-[10px] rounded shrink-0 bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      +
                    </button>
                  )}
                  {savingPreset && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <input
                        ref={presetInputRef}
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && presetName.trim()) {
                            onPresetSave?.(presetName.trim());
                            setSavingPreset(false);
                            setPresetName("");
                          } else if (e.key === "Escape") {
                            setSavingPreset(false);
                            setPresetName("");
                          }
                        }}
                        placeholder="name…"
                        className="w-16 px-1 py-px text-[10px] bg-[var(--bg-tertiary)] border border-[var(--accent-blue)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                      />
                      <button
                        onClick={() => { if (presetName.trim()) { onPresetSave?.(presetName.trim()); setSavingPreset(false); setPresetName(""); } }}
                        className="text-[10px] text-[var(--accent-blue)] hover:text-[var(--text-primary)]"
                      >
                        ✓
                      </button>
                    </span>
                  )}
                </div>
              {/* Roles grid — 2-column, ultra-compact */}
              {!rolesCollapsed && <div className="grid grid-cols-2 gap-x-0.5 gap-y-0 px-1.5 py-1">
                {Object.entries(roles.roles).map(([role, modelId]) => {
                  const isEditing = editingRole === role;
                  return (
                    <button
                      key={role}
                      onClick={() => {
                        setEditingRole(isEditing ? null : role);
                        setFilter("");
                        setSelectedIndex(0);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                      className={`flex items-baseline gap-1 px-1.5 py-0.5 rounded text-left min-w-0 transition-colors ${
                        isEditing
                          ? "bg-[color-mix(in_srgb,var(--accent-blue)_15%,transparent)] outline outline-1 outline-[var(--accent-blue)]"
                          : "hover:bg-[var(--bg-hover)]"
                      }`}
                      title={modelId}
                    >
                      <span className={`text-[10px] font-semibold shrink-0 ${isEditing ? "text-[var(--accent-blue)]" : "text-[var(--accent-blue)]/70"}`}>
                        @{role}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono truncate leading-tight">
                        {shortModel(modelId)}
                      </span>
                    </button>
                  );
                })}
              </div>}
            </div>
          )}

          {/* ── Filter input ── */}
          <div className="p-1.5 pb-1">
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder={editingRole ? `Model for @${editingRole}…` : "Filter models…"}
              className={`w-full px-2 py-1 text-xs bg-[var(--bg-tertiary)] border rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
                editingRole
                  ? "border-[var(--accent-blue)] focus:border-[var(--accent-blue)]"
                  : "border-[var(--border-primary)] focus:border-[var(--accent-blue)]"
              }`}
              data-testid="model-filter"
            />
            {editingRole && (
              <div className="flex items-center justify-between mt-0.5 px-0.5">
                <span className="text-[10px] text-[var(--accent-blue)]">
                  Assign model to <span className="font-semibold">@{editingRole}</span>
                </span>
                <button
                  onClick={() => { setEditingRole(null); setFilter(""); }}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  esc
                </button>
              </div>
            )}
          </div>

          {/* ── Model list ── */}
          <div ref={listRef} className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No models match</div>
            ) : (
              filtered.map((m, i) => {
                const label = `${m.provider}/${m.id}`;
                const isCurrent = !editingRole && label === current;
                const isRoleTarget = editingRole && roles?.roles[editingRole] === label;
                return (
                  <button
                    key={label}
                    data-model-item
                    onClick={() => handleSelect(m)}
                    className={`w-full px-3 py-1 min-h-[44px] md:min-h-0 md:py-1 text-left text-xs font-mono flex items-center gap-2 ${
                      i === selectedIndex ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-hover)]"
                    } ${isCurrent || isRoleTarget ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}
                  >
                    {label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
