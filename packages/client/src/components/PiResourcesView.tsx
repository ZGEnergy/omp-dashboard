import React, { useState, useMemo } from "react";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiLoading, mdiRefresh, mdiPuzzleOutline, mdiBookOpenPageVariant, mdiTextBoxOutline, mdiChevronRight, mdiChevronDown } from "@mdi/js";
import { usePiResources } from "../hooks/usePiResources.js";
import { PackageBrowser } from "./PackageBrowser.js";
import { PackageInstallConfirmDialog } from "./PackageInstallConfirmDialog.js";
import { PackageReadmeDialog } from "./PackageReadmeDialog.js";
import { useInstalledPackages } from "../hooks/useInstalledPackages.js";
import { usePackageOperations } from "../hooks/usePackageOperations.js";
import type { PiResource, PiResourceScope, PiPackageInfo, NpmPackageResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

interface Props {
  cwd: string;
  onBack: () => void;
  onViewFile: (filePath: string, title: string) => void;
}

function ResourceIcon({ type }: { type: PiResource["type"] }) {
  const iconPath =
    type === "skill" ? mdiBookOpenPageVariant :
    type === "extension" ? mdiPuzzleOutline :
    mdiTextBoxOutline;
  return <Icon path={iconPath} size={0.5} className="shrink-0 text-[var(--text-muted)]" />;
}

function ResourceItem({ resource, onView, depth = 0 }: { resource: PiResource; onView: () => void; depth?: number }) {
  return (
    <div
      className="flex items-start gap-2 py-1 px-2 rounded hover:bg-[var(--bg-hover)] group cursor-pointer"
      style={{ paddingLeft: `${(depth + 1) * 16}px` }}
      data-testid="resource-item"
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(); } }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-[var(--text-primary)]">{resource.name}</span>
        {resource.description && (
          <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{resource.description}</p>
        )}
      </div>
      <ResourceIcon type={resource.type} />
    </div>
  );
}

function ResourceGroup({ label, resources, onView, depth = 1 }: { label: string; resources: PiResource[]; onView: (r: PiResource) => void; depth?: number }) {
  const [collapsed, setCollapsed] = useState(true);
  if (resources.length === 0) return null;
  const icon = label === "Skills" ? mdiBookOpenPageVariant : label === "Extensions" ? mdiPuzzleOutline : mdiTextBoxOutline;
  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-[var(--bg-hover)] rounded"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.4} className="text-[var(--text-tertiary)]" />
        <Icon path={icon} size={0.45} className="text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          ({resources.length})
        </span>
      </button>
      {!collapsed && (
        <div>
          {resources.map((r) => (
            <ResourceItem key={r.filePath} resource={r} onView={() => onView(r)} depth={depth} />
          ))}
        </div>
      )}
    </div>
  );
}

function MergedScopeSection({ title, scope, packages, onView }: {
  title: string;
  scope: PiResourceScope;
  packages: PiPackageInfo[];
  onView: (r: PiResource) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const looseCount = scope.extensions.length + scope.skills.length + scope.prompts.length;
  const pkgResourceCount = packages.reduce((sum, p) =>
    sum + p.resources.extensions.length + p.resources.skills.length + p.resources.prompts.length, 0);
  const totalCount = looseCount + pkgResourceCount;
  const hasLoose = looseCount > 0;
  const hasPkgs = packages.length > 0;
  const isEmpty = !hasLoose && !hasPkgs;

  return (
    <div className="mb-4" data-testid={`scope-${title.toLowerCase()}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 w-full text-left px-2 pb-1 mb-1 border-b border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] rounded-t"
      >
        <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.5} className="text-[var(--text-tertiary)]" />
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-[10px] text-[var(--text-muted)] ml-1">
          ({totalCount}{hasPkgs ? ` · ${packages.length} pkg${packages.length !== 1 ? "s" : ""}` : ""})
        </span>
      </button>
      {!collapsed && (
        isEmpty ? (
          <p className="text-[11px] text-[var(--text-muted)] pl-6 italic">(none)</p>
        ) : (
          <>
            {hasLoose && (
              <>
                <ResourceGroup label="Skills" resources={scope.skills} onView={onView} depth={1} />
                <ResourceGroup label="Extensions" resources={scope.extensions} onView={onView} depth={1} />
                <ResourceGroup label="Prompts" resources={scope.prompts} onView={onView} depth={1} />
              </>
            )}
            {packages.map((pkg) => (
              <PackageItem key={pkg.source} pkg={pkg} onView={onView} />
            ))}
          </>
        )
      )}
    </div>
  );
}

function PackageItem({ pkg, onView }: { pkg: PiPackageInfo; onView: (r: PiResource) => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const hasResources =
    pkg.resources.extensions.length > 0 ||
    pkg.resources.skills.length > 0 ||
    pkg.resources.prompts.length > 0;
  const count = pkg.resources.extensions.length + pkg.resources.skills.length + pkg.resources.prompts.length;
  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 w-full text-left hover:bg-[var(--bg-hover)] rounded py-0.5"
        style={{ paddingLeft: "16px" }}
      >
        <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.4} className="text-[var(--text-tertiary)]" />
        <span className="text-xs font-medium text-[var(--text-primary)]">📦 {pkg.name}</span>
        <span className="text-[10px] text-[var(--text-muted)]">
          ({count})
        </span>
      </button>
      {!collapsed && (
        <>
          {pkg.description && (
            <p className="text-[10px] text-[var(--text-muted)] mb-1" style={{ paddingLeft: "40px" }}>{pkg.description}</p>
          )}
          {hasResources ? (
            <>
              <ResourceGroup label="Skills" resources={pkg.resources.skills} onView={onView} depth={2} />
              <ResourceGroup label="Extensions" resources={pkg.resources.extensions} onView={onView} depth={2} />
              <ResourceGroup label="Prompts" resources={pkg.resources.prompts} onView={onView} depth={2} />
            </>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)] italic" style={{ paddingLeft: "40px" }}>(no resources)</p>
          )}
        </>
      )}
    </div>
  );
}

export function PiResourcesView({ cwd, onBack, onViewFile }: Props) {
  const [activeTab, setActiveTab] = useState<"installed" | "packages">("installed");
  const { data, isLoading, error, refresh } = usePiResources(cwd);
  const installed = useInstalledPackages("local", cwd);
  const operations = usePackageOperations("local", cwd, installed.refresh);
  const [confirmInstall, setConfirmInstall] = useState<{ source: string; pkg?: NpmPackageResult } | null>(null);
  const [readmePkg, setReadmePkg] = useState<NpmPackageResult | null>(null);

  const handleView = (resource: PiResource) => {
    onViewFile(resource.filePath, resource.name);
  };

  const handleConfirmInstall = (source: string, pkg?: NpmPackageResult) => {
    setConfirmInstall({ source, pkg });
  };

  const doInstall = () => {
    if (!confirmInstall) return;
    operations.install(confirmInstall.source);
    setConfirmInstall(null);
  };

  const dirName = cwd.split("/").pop() ?? cwd;

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="pi-resources-view">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-secondary)]">
        <button
          onClick={onBack}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--bg-surface)]"
          data-testid="pi-resources-back"
          title="Back"
        >
          <Icon path={mdiArrowLeft} size={0.7} />
        </button>
        <span className="text-sm font-medium text-[var(--text-secondary)] truncate">
          Pi Resources: {dirName}
        </span>
        <button
          onClick={refresh}
          className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--bg-surface)]"
          title="Refresh"
          data-testid="pi-resources-refresh"
        >
          <Icon path={mdiRefresh} size={0.6} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-secondary)] px-4" data-testid="resources-tab-bar">
        {(["installed", "packages"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
              activeTab === tab
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab === "installed" ? "Installed" : "Packages"}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        {activeTab === "installed" && (
          <>
            {isLoading && !data && (
              <div className="flex items-center justify-center py-8">
                <Icon path={mdiLoading} size={1} className="text-[var(--text-muted)] animate-spin" />
              </div>
            )}

            {error && !data && (
              <div className="text-center py-8">
                <p className="text-sm text-red-400 mb-2">{error}</p>
                <button onClick={refresh} className="text-xs text-[var(--accent-primary)] hover:underline">
                  Retry
                </button>
              </div>
            )}

            {data && (
              <>
                <MergedScopeSection
                  title="Local"
                  scope={data.local}
                  packages={data.packages.filter((p) => p.scope === "local" || !p.scope)}
                  onView={handleView}
                />
                <MergedScopeSection
                  title="Global"
                  scope={data.global}
                  packages={data.packages.filter((p) => p.scope === "global")}
                  onView={handleView}
                />
              </>
            )}
          </>
        )}

        {activeTab === "packages" && (
          <PackageBrowser
            scope="local"
            cwd={cwd}
            onViewReadme={setReadmePkg}
            onConfirmInstall={handleConfirmInstall}
          />
        )}
      </div>

      {/* Dialogs */}
      {confirmInstall && (
        <PackageInstallConfirmDialog
          source={confirmInstall.source}
          packageName={confirmInstall.pkg?.name}
          scope="local"
          onConfirm={doInstall}
          onCancel={() => setConfirmInstall(null)}
        />
      )}
      {readmePkg && (
        <PackageReadmeDialog
          pkg={readmePkg}
          installed={installed.packages.some((p) => p.source === `npm:${readmePkg.name}`)}
          onInstall={() => { handleConfirmInstall(`npm:${readmePkg.name}`, readmePkg); setReadmePkg(null); }}
          onUninstall={() => { operations.remove(`npm:${readmePkg.name}`); setReadmePkg(null); }}
          onClose={() => setReadmePkg(null)}
        />
      )}
    </div>
  );
}
