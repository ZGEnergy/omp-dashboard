import React, { useState, useMemo, useCallback } from "react";
import { getApiBase } from "../lib/api-context.js";
import { Icon } from "@mdi/react";
import { mdiMagnify, mdiLoading, mdiPackageVariantClosed, mdiLink, mdiFilterOutline } from "@mdi/js";
import { usePackageSearch } from "../hooks/usePackageSearch.js";
import { useInstalledPackages } from "../hooks/useInstalledPackages.js";
import { usePackageOperations } from "../hooks/usePackageOperations.js";
import { PackageCard } from "./PackageCard.js";
import type { NpmPackageResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

const TYPE_PILLS = ["extension", "skill", "theme", "prompt"] as const;

interface PackageBrowserProps {
  scope: "global" | "local";
  cwd?: string;
  onViewReadme?: (pkg: NpmPackageResult) => void;
  onConfirmInstall?: (source: string, pkg?: NpmPackageResult) => void;
}

export function PackageBrowser({ scope, cwd, onViewReadme, onConfirmInstall }: PackageBrowserProps) {
  const search = usePackageSearch();
  const installedOwn = useInstalledPackages(scope, cwd);
  // Also fetch the other scope to show cross-scope badges
  const otherScope = scope === "global" ? "local" : "global";
  const installedOther = useInstalledPackages(otherScope, scope === "local" ? cwd : undefined);
  const operations = usePackageOperations(scope, cwd, installedOwn.refresh);
  const [urlInput, setUrlInput] = useState("");
  const [showInstalled, setShowInstalled] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState<Set<string>>(new Set());
  const [checkingUpdateFor, setCheckingUpdateFor] = useState<Set<string>>(new Set());

  /** Map npm package name → which scope(s) it's installed in */
  const installedInfo = useMemo(() => {
    const map = new Map<string, { own: boolean; other: boolean }>();
    const addEntries = (packages: typeof installedOwn.packages, key: "own" | "other") => {
      for (const p of packages) {
        const npmMatch = p.source.match(/^npm:(.+?)(?:@.*)?$/);
        const name = npmMatch ? npmMatch[1] : p.source;
        const existing = map.get(name) ?? { own: false, other: false };
        existing[key] = true;
        map.set(name, existing);
        // Also store by source
        if (npmMatch) {
          const ex2 = map.get(p.source) ?? { own: false, other: false };
          ex2[key] = true;
          map.set(p.source, ex2);
        }
      }
    };
    addEntries(installedOwn.packages, "own");
    addEntries(installedOther.packages, "other");
    return map;
  }, [installedOwn.packages, installedOther.packages]);

  const isInstalled = (name: string) => {
    const info = installedInfo.get(name) ?? installedInfo.get(`npm:${name}`);
    return !!(info && (info.own || info.other));
  };

  const getInstalledScope = (name: string): "global" | "local" | "both" | undefined => {
    const info = installedInfo.get(name) ?? installedInfo.get(`npm:${name}`);
    if (!info) return undefined;
    const ownScope = scope;
    const otherScopeLabel = otherScope;
    const inOwn = info.own;
    const inOther = info.other;
    if (inOwn && inOther) return "both";
    if (inOwn) return ownScope;
    if (inOther) return otherScopeLabel;
    return undefined;
  };

  const handleCheckUpdate = useCallback(async (pkgName: string) => {
    setCheckingUpdateFor((prev) => new Set(prev).add(pkgName));
    try {
      const res = await fetch(`${getApiBase()}/api/packages/check-updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const body = await res.json();
      if (body.success) {
        const sources = new Set(body.data.map((u: any) => u.source));
        setUpdatesAvailable((prev) => {
          const next = new Set(prev);
          // Check if this package has an update
          if (sources.has(`npm:${pkgName}`)) next.add(pkgName);
          return next;
        });
      }
    } catch { /* ignore */ }
    setCheckingUpdateFor((prev) => { const next = new Set(prev); next.delete(pkgName); return next; });
  }, [cwd]);

  // When "installed" filter is active, merge installed packages that aren't in search results
  const displayPackages = useMemo(() => {
    if (!showInstalled) return search.packages;

    // Start with search results that are installed
    const fromSearch = search.packages.filter((pkg) => isInstalled(pkg.name));
    const seen = new Set(fromSearch.map((p) => p.name));

    // Add installed packages not in search results as synthetic entries
    const allInstalled = [...installedOwn.packages, ...installedOther.packages];
    for (const pkg of allInstalled) {
      const npmMatch = pkg.source.match(/^npm:(.+?)(?:@.*)?$/);
      const name = npmMatch ? npmMatch[1] : null;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      fromSearch.push({
        name,
        description: undefined,
        version: "",
        keywords: [],
        date: "",
        types: [],
        downloads: undefined,
      });
    }

    return fromSearch;
  }, [search.packages, showInstalled, installedInfo, installedOwn.packages, installedOther.packages]);

  const handleInstall = (pkg: NpmPackageResult) => {
    const source = `npm:${pkg.name}`;
    if (onConfirmInstall) {
      onConfirmInstall(source, pkg);
    } else {
      operations.install(source);
    }
  };

  const handleUrlInstall = () => {
    const source = urlInput.trim();
    if (!source) return;
    if (onConfirmInstall) {
      onConfirmInstall(source);
    } else {
      operations.install(source);
    }
    setUrlInput("");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="package-browser">
      {/* URL input for manual install */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Icon
            path={mdiLink}
            size={0.45}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleUrlInstall(); }}
            placeholder="npm:@scope/pkg or git:github.com/user/repo"
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-secondary)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            data-testid="package-url-input"
          />
        </div>
        <button
          onClick={handleUrlInstall}
          disabled={!urlInput.trim() || operations.operation.status === "running"}
          className="px-3 py-1.5 text-xs bg-[var(--accent-primary)] text-white rounded hover:bg-[var(--accent-primary)]/80 disabled:opacity-50 font-medium"
        >
          Install
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Icon
          path={mdiMagnify}
          size={0.45}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder="Search pi packages on npm..."
          className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-secondary)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          data-testid="package-search-input"
        />
      </div>

      {/* Type filter pills + installed filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setShowInstalled(!showInstalled)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors flex items-center gap-0.5 ${
            showInstalled
              ? "border-green-400 bg-green-400/20 text-green-400"
              : "border-[var(--border-secondary)] text-[var(--text-muted)] hover:border-[var(--text-tertiary)]"
          }`}
        >
          <Icon path={mdiFilterOutline} size={0.35} />
          installed
        </button>
        {TYPE_PILLS.map((type) => (
          <button
            key={type}
            onClick={() => search.setTypeFilter(search.typeFilter === type ? null : type)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
              search.typeFilter === type
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                : "border-[var(--border-secondary)] text-[var(--text-muted)] hover:border-[var(--text-tertiary)]"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Operation status */}
      {operations.operation.status !== "idle" && (
        <div
          className={`text-xs px-2 py-1.5 rounded ${
            operations.operation.status === "running"
              ? "bg-blue-500/10 text-blue-400"
              : operations.operation.status === "success"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
          }`}
        >
          {operations.operation.status === "running" && (
            <Icon path={mdiLoading} size={0.4} className="inline animate-spin mr-1" />
          )}
          {operations.operation.message}
        </div>
      )}

      {/* Results */}
      {search.isLoading && search.packages.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <Icon path={mdiLoading} size={0.8} className="text-[var(--text-muted)] animate-spin" />
        </div>
      )}

      {search.error && (
        <div className="text-xs text-red-400 px-2">{search.error}</div>
      )}

      {!search.isLoading && displayPackages.length === 0 && !search.error && (
        <div className="text-center py-6 text-[var(--text-muted)]">
          <Icon path={mdiPackageVariantClosed} size={1.2} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">{showInstalled ? "No installed packages found" : "No packages found"}</p>
        </div>
      )}

      {displayPackages.length > 0 && (
        <>
          <div className="text-[10px] text-[var(--text-muted)]">
            {displayPackages.length} package{displayPackages.length !== 1 ? "s" : ""}
            {showInstalled ? " (installed)" : ""}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {displayPackages.map((pkg) => {
              const pkgInstalled = isInstalled(pkg.name);
              return (
                <PackageCard
                  key={pkg.name}
                  pkg={pkg}
                  installed={pkgInstalled}
                  installedScope={getInstalledScope(pkg.name)}
                  updateAvailable={updatesAvailable.has(pkg.name)}
                  checkingUpdate={checkingUpdateFor.has(pkg.name)}
                  operationStatus={
                    operations.operation.source === `npm:${pkg.name}` ? operations.operation.status : undefined
                  }
                  operationMessage={
                    operations.operation.source === `npm:${pkg.name}` ? operations.operation.message : undefined
                  }
                  onInstall={() => handleInstall(pkg)}
                  onUninstall={() => operations.remove(`npm:${pkg.name}`)}
                  onUpdate={() => operations.update(`npm:${pkg.name}`)}
                  onCheckUpdate={pkgInstalled ? () => handleCheckUpdate(pkg.name) : undefined}
                  onClick={() => onViewReadme?.(pkg)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
