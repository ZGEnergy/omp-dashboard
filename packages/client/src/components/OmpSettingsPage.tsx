/**
 * Schema-driven mirror of OMP agent settings via `/api/omp-config`.
 *
 * `modelRoles` is intentionally hidden — Roles UI is the only writer.
 * `cycleOrder` remains editable as a JSON array field.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSettingsDraftSource } from "@blackbelt-technology/dashboard-plugin-runtime";
import {
  fetchOmpConfig,
  resetOmpConfig,
  setOmpConfig,
  type OmpConfigEntry,
  type OmpConfigSnapshot,
  OmpConfigApiError,
} from "../lib/omp-config-api.js";

const PRIORITY_KEYS = ["defaultThinkingLevel", "cycleOrder"] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isSecretKey(key: string): boolean {
  return key === "auth.broker.token" || key.endsWith(".token");
}

function groupKey(key: string): string {
  const dot = key.indexOf(".");
  return dot > 0 ? key.slice(0, dot) : key;
}

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = (PRIORITY_KEYS as readonly string[]).indexOf(a);
    const bi = (PRIORITY_KEYS as readonly string[]).indexOf(b);
    if (ai >= 0 || bi >= 0) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
}

function roleCount(settings: Record<string, OmpConfigEntry>): number {
  const raw = settings.modelRoles?.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  return Object.values(raw as Record<string, unknown>).filter(
    (v) => typeof v === "string" && v.trim() !== "",
  ).length;
}

export function OmpSettingsPage(): React.ReactElement {
  const [snapshot, setSnapshot] = useState<OmpConfigSnapshot | null>(null);
  const [draft, setDraft] = useState<Map<string, unknown>>(new Map());
  const [jsonDraft, setJsonDraft] = useState<Map<string, string>>(new Map());
  const [jsonErrors, setJsonErrors] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await fetchOmpConfig(signal);
      setSnapshot(snap);
      setDraft(new Map());
      setJsonDraft(new Map());
      setJsonErrors(new Map());
    } catch (err) {
      const message =
        err instanceof OmpConfigApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void reload(ac.signal);
    return () => ac.abort();
  }, [reload]);

  const settings = snapshot?.settings ?? {};
  const visibleKeys = useMemo(
    () => Object.keys(settings).filter((k) => k !== "modelRoles"),
    [settings],
  );

  const isDirty = useMemo(() => {
    if (draft.size === 0 && jsonDraft.size === 0) return false;
    for (const [key, value] of draft.entries()) {
      if (!deepEqual(value, settings[key]?.value)) return true;
    }
    // Pending JSON text that differs from committed draft/loaded value counts dirty
    for (const [key, text] of jsonDraft.entries()) {
      const loaded = settings[key]?.value;
      try {
        const parsed: unknown = text.trim() === "" ? null : JSON.parse(text);
        const baseline = draft.has(key) ? draft.get(key) : loaded;
        if (!deepEqual(parsed, baseline)) return true;
      } catch {
        return true; // invalid JSON blocks clean state
      }
    }
    return false;
  }, [draft, jsonDraft, settings]);

  const commit = useCallback(async () => {
    if (!snapshot) return;
    // Flush JSON drafts into draft map first
    const nextDraft = new Map(draft);
    const nextJsonErrors = new Map<string, string>();
    for (const [key, text] of jsonDraft.entries()) {
      try {
        const parsed: unknown = text.trim() === "" ? null : JSON.parse(text);
        nextDraft.set(key, parsed);
      } catch {
        nextJsonErrors.set(key, "Invalid JSON");
      }
    }
    if (nextJsonErrors.size > 0) {
      setJsonErrors(nextJsonErrors);
      throw new Error("Fix invalid JSON before saving");
    }
    setJsonErrors(new Map());

    const dirtyKeys = [...nextDraft.entries()].filter(
      ([key, value]) => !deepEqual(value, settings[key]?.value),
    );
    for (const [key, value] of dirtyKeys) {
      await setOmpConfig(key, value);
    }
    await reload();
  }, [draft, jsonDraft, reload, settings, snapshot]);

  const reset = useCallback(() => {
    setDraft(new Map());
    setJsonDraft(new Map());
    setJsonErrors(new Map());
  }, []);

  useSettingsDraftSource({ id: "omp-config", page: "omp", isDirty, commit, reset });

  const setValue = (key: string, value: unknown) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (deepEqual(value, settings[key]?.value)) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };

  const currentValue = (key: string): unknown =>
    draft.has(key) ? draft.get(key) : settings[key]?.value;

  const onResetKey = async (key: string) => {
    setRowBusy(key);
    try {
      await resetOmpConfig(key);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of sortKeys(visibleKeys)) {
      const g = groupKey(key);
      const list = map.get(g) ?? [];
      list.push(key);
      map.set(g, list);
    }
    // Priority groups first if present
    const names = [...map.keys()].sort((a, b) => {
      const aPri = a === "defaultThinkingLevel" || a === "cycleOrder" ? 0 : 1;
      const bPri = b === "defaultThinkingLevel" || b === "cycleOrder" ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      return a.localeCompare(b);
    });
    return names.map((name) => ({ name, keys: map.get(name) ?? [] }));
  }, [visibleKeys]);

  if (loading && !snapshot) {
    return (
      <div data-testid="omp-settings-page" className="p-4 text-sm text-[var(--text-muted)]">
        Loading OMP settings…
      </div>
    );
  }

  if (loadError && !snapshot) {
    return (
      <div data-testid="omp-settings-page" className="p-4 space-y-2">
        <p className="text-sm text-[var(--accent-red)]">{loadError}</p>
        <button
          type="button"
          className="text-xs text-[var(--accent-blue)]"
          onClick={() => void reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  const rolesConfigured = roleCount(settings);

  return (
    <div data-testid="omp-settings-page" className="space-y-4 p-1">
      <div className="border border-[var(--border-primary)] rounded-lg p-3 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Agent directory
        </div>
        <code className="text-[11px] text-[var(--text-muted)] break-all">
          {snapshot?.agentDir || "(unknown)"}
        </code>
        {loadError && (
          <p className="text-[11px] text-[var(--accent-warning,#f59e0b)]">{loadError}</p>
        )}
      </div>

      <div
        data-testid="omp-settings-roles-card"
        className="border border-[var(--border-primary)] rounded-lg p-3 flex items-center justify-between gap-3"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Model roles
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            {rolesConfigured} role{rolesConfigured === 1 ? "" : "s"} configured. Edited under
            Settings → General → Roles.
          </p>
        </div>
        <a
          href="/settings/general"
          className="shrink-0 px-2.5 py-1 text-[11px] rounded-md bg-[var(--bg-tertiary)] text-[var(--accent-blue)] hover:bg-[var(--bg-hover)]"
        >
          Edit roles
        </a>
      </div>

      {groups.map((group) => (
        <section
          key={group.name}
          className="border border-[var(--border-primary)] rounded-lg p-3 space-y-2"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {group.name}
          </h3>
          <div className="space-y-2">
            {group.keys.map((key) => {
              const entry = settings[key];
              if (!entry) return null;
              const value = currentValue(key);
              const dirty =
                draft.has(key) && !deepEqual(draft.get(key), entry.value);
              return (
                <div
                  key={key}
                  data-testid={`omp-setting-row-${key}`}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 items-start border-t border-[var(--border-secondary)] pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[11px] text-[var(--text-primary)] break-all">
                        {key}
                      </code>
                      {dirty && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-warning,#f59e0b)]"
                          aria-label="unsaved"
                        />
                      )}
                    </div>
                    {entry.description ? (
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {entry.description}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-[var(--text-muted)]">type: {entry.type}</p>
                  </div>
                  <div className="min-w-0">
                    <OmpSettingControl
                      entry={entry}
                      value={value}
                      jsonText={jsonDraft.get(key)}
                      jsonError={jsonErrors.get(key)}
                      onChange={(v) => setValue(key, v)}
                      onJsonChange={(text) => {
                        setJsonDraft((prev) => {
                          const next = new Map(prev);
                          next.set(key, text);
                          return next;
                        });
                        setJsonErrors((prev) => {
                          if (!prev.has(key)) return prev;
                          const next = new Map(prev);
                          next.delete(key);
                          return next;
                        });
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={rowBusy === key}
                    onClick={() => void onResetKey(key)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap"
                  >
                    {rowBusy === key ? "…" : "Reset"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function OmpSettingControl(props: {
  entry: OmpConfigEntry;
  value: unknown;
  jsonText?: string;
  jsonError?: string;
  onChange: (value: unknown) => void;
  onJsonChange: (text: string) => void;
}): React.ReactElement {
  const { entry, value, jsonText, jsonError, onChange, onJsonChange } = props;

  if (entry.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {value ? "true" : "false"}
      </label>
    );
  }

  if (entry.type === "number") {
    return (
      <input
        type="number"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
        value={typeof value === "number" ? value : value == null ? "" : Number(value)}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    );
  }

  if (entry.type === "array" || entry.type === "record") {
    const text =
      jsonText ??
      (value === undefined ? "" : JSON.stringify(value, null, 2));
    return (
      <div className="space-y-1">
        <textarea
          className="w-full min-h-[72px] font-mono text-[11px] bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-[var(--text-primary)]"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            onJsonChange(next);
            try {
              const parsed: unknown = next.trim() === "" ? null : JSON.parse(next);
              onChange(parsed);
            } catch {
              /* keep draft text; commit will validate */
            }
          }}
        />
        {jsonError ? (
          <p className="text-[10px] text-[var(--accent-red)]">{jsonError}</p>
        ) : null}
      </div>
    );
  }

  // string / enum
  return (
    <input
      type={isSecretKey(entry.key) ? "password" : "text"}
      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
