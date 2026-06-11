/**
 * OpenSpec Workflow Profile settings section.
 *
 * Lets the user set the GLOBAL OpenSpec profile (core / expanded / custom)
 * from the dashboard, then explicitly refresh projects via `openspec update`
 * (per-cwd or all). Save writes only the global config — it never mutates a
 * project repo. A collapsible per-cwd list shows staleness so the user knows
 * which projects lag the current profile.
 *
 * See change: add-openspec-profile-settings.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  CORE_WORKFLOWS,
  EXPANDED_WORKFLOWS,
  type OpenSpecConfig,
} from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  saveOpenSpecConfig,
  runOpenSpecUpdate,
  fetchUpdateStatus,
  type CwdUpdateStatus,
} from "../lib/openspec-config-api.js";

type Profile = OpenSpecConfig["profile"];

const ALL_WORKFLOWS = [...EXPANDED_WORKFLOWS];

const STATUS_LABEL: Record<CwdUpdateStatus["status"], string> = {
  "up-to-date": "up to date",
  "needs-update": "needs update",
  "unknown": "unknown",
};

export function OpenSpecProfileSection() {
  const [profile, setProfile] = useState<Profile>("core");
  const [workflows, setWorkflows] = useState<string[]>([...CORE_WORKFLOWS]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<CwdUpdateStatus[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null); // cwd or "__all__"

  const refreshStatus = useCallback(async () => {
    try {
      setStatuses(await fetchUpdateStatus());
    } catch {
      /* tolerate */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  function selectProfile(p: Profile) {
    setProfile(p);
    if (p === "core") setWorkflows([...CORE_WORKFLOWS]);
    else if (p === "expanded") setWorkflows([...EXPANDED_WORKFLOWS]);
    // custom: leave the current selection so the user can tweak it
  }

  function toggleWorkflow(wf: string) {
    if (profile !== "custom") return;
    setWorkflows((prev) => (prev.includes(wf) ? prev.filter((w) => w !== wf) : [...prev, wf]));
  }

  async function handleSave() {
    setSaving(true);
    setSavedMsg(null);
    try {
      await saveOpenSpecConfig(profile, workflows);
      setSavedMsg("Saved");
      // Saving may change the current signature → refresh staleness badges.
      await refreshStatus();
    } catch (err: any) {
      setSavedMsg(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(target: { cwd: string } | { all: true }) {
    setUpdating("all" in target ? "__all__" : target.cwd);
    try {
      await runOpenSpecUpdate(target);
      await refreshStatus();
    } catch {
      /* tolerate */
    } finally {
      setUpdating(null);
    }
  }

  const staleCount = statuses.filter((s) => s.status !== "up-to-date").length;

  return (
    <div data-testid="openspec-profile-settings">
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1 pb-1 border-b border-[var(--border-secondary)]">
        OpenSpec Workflow Profile
      </h2>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">
        Controls which <code>/opsx:</code> workflow buttons appear on session cards and the composer.
      </p>

      {/* Profile radios */}
      <div className="space-y-2" data-testid="profile-options">
        <ProfileOption
          id="core" label="Core" selected={profile === "core"}
          flows="propose · explore · apply · archive"
          onSelect={() => selectProfile("core")}
        />
        <ProfileOption
          id="expanded" label="Expanded" selected={profile === "expanded"}
          flows="core + new · continue · ff · verify · sync · bulk-archive · onboard"
          onSelect={() => selectProfile("expanded")}
        />
        <ProfileOption
          id="custom" label="Custom" selected={profile === "custom"}
          flows="pick any subset"
          onSelect={() => selectProfile("custom")}
        >
          <div
            className={`mt-2 flex flex-wrap gap-1.5 ${profile === "custom" ? "" : "opacity-40 pointer-events-none"}`}
            data-testid="workflow-multiselect"
          >
            {ALL_WORKFLOWS.map((wf) => {
              const on = workflows.includes(wf);
              return (
                <button
                  key={wf}
                  type="button"
                  data-testid={`wf-chip-${wf}`}
                  data-on={on}
                  onClick={(e) => { e.stopPropagation(); toggleWorkflow(wf); }}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    on
                      ? "text-blue-400 border-blue-500/50 bg-blue-500/8"
                      : "text-[var(--text-tertiary)] border-[var(--border-secondary)]"
                  }`}
                >
                  {on ? "✓ " : ""}{wf}
                </button>
              );
            })}
          </div>
        </ProfileOption>
      </div>

      {/* Warning banner */}
      <div className="mt-3 flex items-start gap-2 p-2.5 rounded border border-yellow-500/30 bg-yellow-500/[0.06] text-[11px] text-yellow-400 leading-relaxed">
        <span aria-hidden="true">⚠️</span>
        <span>
          This changes the <b className="text-[var(--text-primary)]">global</b> OpenSpec config for every tool on this machine
          (Claude Code, Cursor, the CLI). Saving does not touch project files — use the Update buttons below to regenerate
          a project's <code>/opsx:</code> skill files.
        </span>
      </div>

      {/* Save row */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          data-testid="save-profile-btn"
          disabled={saving}
          onClick={handleSave}
          className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white border border-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {savedMsg && <span className="text-[11px] text-[var(--text-tertiary)]" data-testid="save-msg">{savedMsg}</span>}
      </div>

      {/* Projects: update-all + collapsible per-cwd list */}
      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-testid="update-all-btn"
            disabled={updating !== null}
            onClick={() => handleUpdate({ all: true })}
            className="text-xs px-3 py-1.5 rounded text-cyan-400 border border-cyan-500/40 bg-cyan-500/[0.06] disabled:opacity-50"
          >
            {updating === "__all__" ? "Updating…" : "↻ Update all projects"}
          </button>
          {staleCount > 0 && (
            <span className="text-[11px] text-orange-400">{staleCount} of {statuses.length} projects need update</span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            data-testid="collapse-toggle"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)]"
          >
            {expanded ? "▾ Hide projects" : "▸ Show projects"}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-1.5" data-testid="cwd-list">
            {statuses.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">No known projects.</p>
            )}
            {statuses.map((s) => {
              const fresh = s.status === "up-to-date";
              return (
                <div
                  key={s.cwd}
                  data-testid={`cwd-row-${s.cwd}`}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded border bg-[var(--bg-tertiary)] ${
                    fresh ? "border-[var(--border-subtle)]" : "border-orange-500/30"
                  }`}
                >
                  <span
                    data-testid={`status-badge-${s.cwd}`}
                    className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full border ${
                      fresh
                        ? "text-green-400 border-green-500/30 bg-green-500/8"
                        : s.status === "needs-update"
                          ? "text-orange-400 border-orange-500/35 bg-orange-500/8"
                          : "text-[var(--text-muted)] border-[var(--border-secondary)]"
                    }`}
                  >
                    {fresh ? "✓ " : ""}{STATUS_LABEL[s.status]}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate">{s.cwd}</span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    data-testid={`update-btn-${s.cwd}`}
                    disabled={fresh || updating !== null}
                    onClick={() => handleUpdate({ cwd: s.cwd })}
                    className="text-[10px] px-2 py-1 rounded text-cyan-400 border border-cyan-500/40 bg-cyan-500/[0.06] disabled:opacity-35"
                  >
                    {updating === s.cwd ? "Updating…" : "↻ Update"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileOption({
  id, label, flows, selected, onSelect, children,
}: {
  id: string;
  label: string;
  flows: string;
  selected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={`profile-option-${id}`}
      data-selected={selected}
      onClick={onSelect}
      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer ${
        selected ? "border-blue-500 bg-blue-500/[0.06]" : "border-[var(--border-secondary)]"
      }`}
    >
      <span
        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          selected ? "border-blue-400" : "border-[var(--border-primary)]"
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-blue-400" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
        <div className="text-[10px] text-[var(--text-tertiary)] font-mono">{flows}</div>
        {children}
      </div>
    </div>
  );
}
