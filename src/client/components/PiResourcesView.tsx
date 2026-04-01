import React from "react";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiLoading, mdiRefresh, mdiPuzzleOutline, mdiBookOpenPageVariant, mdiTextBoxOutline } from "@mdi/js";
import { usePiResources } from "../hooks/usePiResources.js";
import type { PiResource, PiResourceScope, PiPackageInfo } from "../../shared/rest-api.js";

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

function ResourceItem({ resource, onView }: { resource: PiResource; onView: () => void }) {
  return (
    <div
      className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-hover)] group cursor-pointer"
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

function ResourceGroup({ label, resources, onView }: { label: string; resources: PiResource[]; onView: (r: PiResource) => void }) {
  if (resources.length === 0) return null;
  const icon = label === "Skills" ? mdiBookOpenPageVariant : label === "Extensions" ? mdiPuzzleOutline : mdiTextBoxOutline;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1 px-2">
        <Icon path={icon} size={0.5} className="text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {label} ({resources.length})
        </span>
      </div>
      <div>
        {resources.map((r) => (
          <ResourceItem key={r.filePath} resource={r} onView={() => onView(r)} />
        ))}
      </div>
    </div>
  );
}

function ScopeSection({ title, scope, onView }: { title: string; scope: PiResourceScope; onView: (r: PiResource) => void }) {
  const isEmpty = scope.extensions.length === 0 && scope.skills.length === 0 && scope.prompts.length === 0;
  return (
    <div className="mb-4" data-testid={`scope-${title.toLowerCase()}`}>
      <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-2 border-b border-[var(--border-secondary)] pb-1">
        {title}
      </h3>
      {isEmpty ? (
        <p className="text-[11px] text-[var(--text-muted)] px-2 italic">(none)</p>
      ) : (
        <>
          <ResourceGroup label="Skills" resources={scope.skills} onView={onView} />
          <ResourceGroup label="Extensions" resources={scope.extensions} onView={onView} />
          <ResourceGroup label="Prompts" resources={scope.prompts} onView={onView} />
        </>
      )}
    </div>
  );
}

function PackageSection({ packages, onView }: { packages: PiPackageInfo[]; onView: (r: PiResource) => void }) {
  if (packages.length === 0) return null;
  return (
    <div className="mb-4" data-testid="scope-packages">
      <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-2 border-b border-[var(--border-secondary)] pb-1">
        Packages
      </h3>
      {packages.map((pkg) => {
        const hasResources =
          pkg.resources.extensions.length > 0 ||
          pkg.resources.skills.length > 0 ||
          pkg.resources.prompts.length > 0;
        return (
          <div key={pkg.source} className="mb-3 ml-1 pl-2 border-l-2 border-[var(--border-secondary)]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-[var(--text-primary)]">📦 {pkg.name}</span>
              <span className="text-[10px] text-[var(--text-muted)]">({pkg.source})</span>
            </div>
            {pkg.description && (
              <p className="text-[10px] text-[var(--text-muted)] mb-1 ml-1">{pkg.description}</p>
            )}
            {hasResources ? (
              <>
                <ResourceGroup label="Skills" resources={pkg.resources.skills} onView={onView} />
                <ResourceGroup label="Extensions" resources={pkg.resources.extensions} onView={onView} />
                <ResourceGroup label="Prompts" resources={pkg.resources.prompts} onView={onView} />
              </>
            ) : (
              <p className="text-[10px] text-[var(--text-muted)] italic ml-1">(no resources)</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PiResourcesView({ cwd, onBack, onViewFile }: Props) {
  const { data, isLoading, error, refresh } = usePiResources(cwd);

  const handleView = (resource: PiResource) => {
    onViewFile(resource.filePath, resource.name);
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
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
            <ScopeSection title="Local" scope={data.local} onView={handleView} />
            <ScopeSection title="Global" scope={data.global} onView={handleView} />
            <PackageSection packages={data.packages} onView={handleView} />
          </>
        )}
      </div>
    </div>
  );
}
