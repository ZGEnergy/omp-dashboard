import React, { useState, useEffect, useCallback } from "react";
import { getApiBase } from "../lib/api-context.js";
import { Icon } from "@mdi/react";
import { mdiClose, mdiLoading, mdiDownload } from "@mdi/js";
import { DialogPortal } from "./DialogPortal.js";
import { MarkdownContent } from "./MarkdownContent.js";
import type { NpmPackageResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

interface PackageReadmeDialogProps {
  pkg: NpmPackageResult;
  installed: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onClose: () => void;
}

export function PackageReadmeDialog({
  pkg,
  installed,
  onInstall,
  onUninstall,
  onClose,
}: PackageReadmeDialogProps) {
  const [readme, setReadme] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`${getApiBase()}/api/packages/readme?pkg=${encodeURIComponent(pkg.name)}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success) {
          setReadme(body.data.readme);
        } else {
          setError(body.error ?? "Failed to fetch README");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [pkg.name]);

  return (
    <DialogPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        data-testid="package-readme-dialog"
      >
        <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-secondary)]">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{pkg.name}</h3>
              <span className="text-[10px] text-[var(--text-muted)]">v{pkg.version}</span>
            </div>
            <div className="flex items-center gap-2">
              {installed ? (
                <button
                  onClick={onUninstall}
                  className="text-[11px] px-3 py-1 rounded text-red-400 border border-red-400/30 hover:bg-red-400/10"
                >
                  Uninstall
                </button>
              ) : (
                <button
                  onClick={onInstall}
                  className="text-[11px] px-3 py-1 rounded bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/80 font-medium"
                >
                  <Icon path={mdiDownload} size={0.4} className="inline mr-1" />
                  Install
                </button>
              )}
              <button
                onClick={onClose}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
              >
                <Icon path={mdiClose} size={0.6} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            {isLoading && (
              <div className="flex justify-center py-8">
                <Icon path={mdiLoading} size={1} className="text-[var(--text-muted)] animate-spin" />
              </div>
            )}
            {error && (
              <p className="text-sm text-red-400 text-center py-4">{error}</p>
            )}
            {readme && (
              <MarkdownContent content={readme} />
            )}
          </div>
        </div>
      </div>
    </DialogPortal>
  );
}

