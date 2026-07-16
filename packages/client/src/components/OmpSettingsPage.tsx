/**
 * Schema-driven mirror of OMP agent settings via `/api/omp-config`.
 *
 * `modelRoles` is intentionally hidden — Roles UI is the only writer.
 * `cycleOrder` remains editable as a JSON array field.
 */

import { useSettingsDraftSource } from "@blackbelt-technology/dashboard-plugin-runtime";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOmpConfig,
  OmpConfigApiError,
  type OmpConfigEntry,
  type OmpConfigSnapshot,
  resetOmpConfig,
  setOmpConfig,
} from "../lib/omp-config-api.js";
import { enumOptionsFor } from "../lib/omp-enum-options.js";

const PRIORITY_KEYS = ["defaultThinkingLevel", "cycleOrder"] as const;

type OmpConfigEntryWithValues = OmpConfigEntry & {
  values?: readonly string[];
};

type OmpConfigSnapshotMeta = OmpConfigSnapshot & {
  ompBin?: string | null;
  ompVersion?: string | null;
};

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

function humanizeKey(key: string): string {
  const segment = key.split(".").at(-1) ?? key;
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
    (value) => typeof value === "string" && value.trim() !== "",
  ).length;
}

function errorMessage(error: unknown): string {
  return error instanceof OmpConfigApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);
}

function enumOptions(entry: OmpConfigEntry): readonly string[] {
  const withValues = entry as OmpConfigEntryWithValues;
  if (withValues.values && withValues.values.length > 0) return withValues.values;
  return enumOptionsFor(entry.key) ?? [];
}

export function OmpSettingsPage(): React.ReactElement {
  const [snapshot, setSnapshot] = useState<OmpConfigSnapshot | null>(null);
  const [draft, setDraft] = useState<Map<string, unknown>>(new Map());
  const [jsonDraft, setJsonDraft] = useState<Map<string, string>>(new Map());
  const [jsonErrors, setJsonErrors] = useState<Map<string, string>>(new Map());
  const [saveErrors, setSaveErrors] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal, preserveDraft = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await fetchOmpConfig(signal);
      setSnapshot(snap);
      if (!preserveDraft) {
        setDraft(new Map());
        setJsonDraft(new Map());
        setJsonErrors(new Map());
        setSaveErrors(new Map());
      }
      return snap;
    } catch (error) {
      if (!signal?.aborted) setLoadError(errorMessage(error));
      return null;
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
  const visibleKeys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return Object.keys(settings)
      .filter((key) => key !== "modelRoles")
      .filter((key) => {
        if (!needle) return true;
        const entry = settings[key];
        return `${key} ${entry?.description ?? ""}`.toLowerCase().includes(needle);
      });
  }, [search, settings]);

  const isDirty = useMemo(() => {
    if (draft.size === 0 && jsonDraft.size === 0) return false;
    for (const [key, value] of draft.entries()) {
      if (!deepEqual(value, settings[key]?.value)) return true;
    }
    for (const [key, text] of jsonDraft.entries()) {
      const loaded = settings[key]?.value;
      try {
        const parsed: unknown = text.trim() === "" ? null : JSON.parse(text);
        const baseline = draft.has(key) ? draft.get(key) : loaded;
        if (!deepEqual(parsed, baseline)) return true;
      } catch {
        return true;
      }
    }
    return false;
  }, [draft, jsonDraft, settings]);

  const commit = useCallback(async () => {
    if (!snapshot) return;

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
    if (dirtyKeys.length === 0) return;

    const successful = new Set<string>();
    const failed = new Map<string, string>();
    for (const [key, value] of dirtyKeys) {
      try {
        await setOmpConfig(key, value);
        successful.add(key);
      } catch (error) {
        failed.set(key, errorMessage(error));
      }
    }

    setDraft((previous) => {
      const next = new Map(previous);
      for (const key of successful) next.delete(key);
      for (const [key, value] of nextDraft) {
        if (!successful.has(key)) next.set(key, value);
      }
      return next;
    });
    setJsonDraft((previous) => {
      const next = new Map(previous);
      for (const key of successful) next.delete(key);
      return next;
    });
    setSaveErrors((previous) => {
      const next = new Map(previous);
      for (const key of successful) next.delete(key);
      for (const [key, message] of failed) next.set(key, message);
      return next;
    });

    // Preserve failed drafts/errors while refreshing the authoritative values for
    // every successful write. A failed write must remain visible and editable.
    await reload(undefined, true);
    if (successful.size === 0) {
      throw new Error("Failed to save OMP settings");
    }
  }, [draft, jsonDraft, reload, settings, snapshot]);

  const reset = useCallback(() => {
    setDraft(new Map());
    setJsonDraft(new Map());
    setJsonErrors(new Map());
    setSaveErrors(new Map());
  }, []);

  useSettingsDraftSource({ id: "omp-config", page: "omp", isDirty, commit, reset });

  const setValue = useCallback(
    (key: string, value: unknown) => {
      setDraft((previous) => {
        const next = new Map(previous);
        if (deepEqual(value, settings[key]?.value)) next.delete(key);
        else next.set(key, value);
        return next;
      });
      setSaveErrors((previous) => {
        if (!previous.has(key)) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
    },
    [settings],
  );

  const currentValue = useCallback(
    (key: string): unknown => (draft.has(key) ? draft.get(key) : settings[key]?.value),
    [draft, settings],
  );

  const onResetKey = async (key: string) => {
    setRowBusy(key);
    try {
      const entry = await resetOmpConfig(key);
      setSnapshot((previous) => {
        if (!previous) return previous;
        return { ...previous, settings: { ...previous.settings, [key]: entry } };
      });
      setDraft((previous) => {
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      setJsonDraft((previous) => {
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      setJsonErrors((previous) => {
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      setSaveErrors((previous) => {
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setRowBusy(null);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of sortKeys(visibleKeys)) {
      const name = groupKey(key);
      const list = map.get(name) ?? [];
      list.push(key);
      map.set(name, list);
    }
    const names = [...map.keys()].sort((a, b) => {
      const aPriority = a === "defaultThinkingLevel" || a === "cycleOrder" ? 0 : 1;
      const bPriority = b === "defaultThinkingLevel" || b === "cycleOrder" ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
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

  const metadata = snapshot as OmpConfigSnapshotMeta;
  const rolesConfigured = roleCount(settings);

  return (
    <div data-testid="omp-settings-page" className="space-y-4 p-1">
      <div
        data-testid="omp-settings-version-badge"
        className="border border-[var(--border-primary)] rounded-lg p-3 space-y-1 text-[11px] text-[var(--text-muted)] font-mono"
      >
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>agentDir: {metadata.agentDir || "(unknown)"}</span>
          <span>ompVersion: {metadata.ompVersion || "(unknown)"}</span>
          <span className="break-all">ompBin: {metadata.ompBin || "(unknown)"}</span>
        </div>
        {loadError && <p className="font-sans text-[11px] text-[var(--accent-warning,#f59e0b)]">{loadError}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="omp-settings-search" className="sr-only">
          Search OMP settings
        </label>
        <input
          id="omp-settings-search"
          data-testid="omp-settings-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search settings"
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)]"
        />
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
            {humanizeKey(group.name)}
          </h3>
          <div className="space-y-2">
            {group.keys.map((key) => {
              const entry = settings[key];
              if (!entry) return null;
              const value = currentValue(key);
              const dirty = draft.has(key) && !deepEqual(draft.get(key), entry.value);
              return (
                <div
                  key={key}
                  data-testid={`omp-setting-row-${key}`}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 items-start border-t border-[var(--border-secondary)] pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[11px] text-[var(--text-primary)] break-all">{key}</code>
                      {dirty && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-warning,#f59e0b)]"
                          aria-label="unsaved"
                        />
                      )}
                    </div>
                    {entry.description ? (
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{entry.description}</p>
                    ) : null}
                    <p className="text-[10px] text-[var(--text-muted)]">type: {entry.type}</p>
                  </div>
                  <div className="min-w-0">
                    <OmpSettingControl
                      entry={entry}
                      value={value}
                      jsonText={jsonDraft.get(key)}
                      jsonError={jsonErrors.get(key)}
                      onChange={(nextValue) => setValue(key, nextValue)}
                      onJsonChange={(text) => {
                        setJsonDraft((previous) => {
                          const next = new Map(previous);
                          next.set(key, text);
                          return next;
                        });
                        setJsonErrors((previous) => {
                          if (!previous.has(key)) return previous;
                          const next = new Map(previous);
                          next.delete(key);
                          return next;
                        });
                        setSaveErrors((previous) => {
                          if (!previous.has(key)) return previous;
                          const next = new Map(previous);
                          next.delete(key);
                          return next;
                        });
                      }}
                    />
                    {saveErrors.get(key) ? (
                      <p
                        data-testid={`omp-setting-error-${key}`}
                        className="mt-1 text-[10px] text-[var(--accent-red)]"
                      >
                        {saveErrors.get(key)}
                      </p>
                    ) : null}
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
  const options = enumOptions(entry);

  if (options.length > 0) {
    const current = value == null ? "" : String(value);
    const values = options.includes(current) || current === "" ? [...options] : [current, ...options];
    return (
      <select
        data-testid={`omp-setting-control-${entry.key}`}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
        value={current}
        onChange={(event) => onChange(event.target.value)}
      >
        {current === "" ? <option value="">(unset)</option> : null}
        {values
          .filter((option, index, all) => all.indexOf(option) === index)
          .map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
      </select>
    );
  }

  if (entry.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
        <input
          data-testid={`omp-setting-control-${entry.key}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {value ? "true" : "false"}
      </label>
    );
  }

  if (entry.type === "number") {
    return (
      <input
        data-testid={`omp-setting-control-${entry.key}`}
        type="number"
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
        value={typeof value === "number" ? value : value == null ? "" : Number(value)}
        onChange={(event) => {
          const numberValue = event.target.value === "" ? 0 : Number(event.target.value);
          onChange(Number.isFinite(numberValue) ? numberValue : 0);
        }}
      />
    );
  }

  if (entry.type === "array" || entry.type === "record") {
    const text = jsonText ?? (value === undefined ? "" : JSON.stringify(value, null, 2));
    return (
      <div className="space-y-1">
        <textarea
          data-testid={`omp-setting-control-${entry.key}`}
          className="w-full min-h-[72px] font-mono text-[11px] bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-[var(--text-primary)]"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            onJsonChange(next);
            try {
              const parsed: unknown = next.trim() === "" ? null : JSON.parse(next);
              onChange(parsed);
            } catch {
              // Keep draft text; commit reports invalid JSON.
            }
          }}
        />
        {jsonError ? <p className="text-[10px] text-[var(--accent-red)]">{jsonError}</p> : null}
      </div>
    );
  }

  return (
    <input
      data-testid={`omp-setting-control-${entry.key}`}
      type={isSecretKey(entry.key) ? "password" : "text"}
      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
