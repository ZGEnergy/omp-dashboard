/**
 * Pi ecosystem (core) version section for the Settings panel.
 *
 * Complements GlobalPackagesSection (which manages extensions). This
 * section covers globally-installed pi CLI packages that pi's
 * PackageManager does NOT manage — pi itself, pi-dashboard, etc.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@mdi/react";
import { mdiLoading, mdiRefresh, mdiArrowUpBold, mdiAlertCircle, mdiCheckCircle } from "@mdi/js";
import { getApiBase } from "../lib/api-context.js";
import { usePiCoreVersions } from "../hooks/usePiCoreVersions.js";
import type {
	PiCorePackage,
	PiCoreUpdateResponse,
} from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

type ProgressMap = Map<string, { phase: "start" | "output" | "complete" | "error"; message?: string }>;

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (isNaN(then)) return iso;
	const diff = Math.floor((Date.now() - then) / 1000);
	if (diff < 5) return "just now";
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
}

export function PiCoreVersionsSection() {
	const { status, isLoading, error, refresh } = usePiCoreVersions();
	const [updating, setUpdating] = useState<Set<string>>(new Set());
	const [progress, setProgress] = useState<ProgressMap>(new Map());
	const [lastErrors, setLastErrors] = useState<Map<string, string>>(new Map());

	// Live tick for "last checked N min ago"
	const [, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((n) => n + 1), 30_000);
		return () => clearInterval(id);
	}, []);

	// Listen to pi_core_update_* events
	useEffect(() => {
		const handler = (e: Event) => {
			const msg = (e as CustomEvent).detail;
			if (msg?.type === "pi_core_update_progress") {
				setProgress((prev) => {
					const next = new Map(prev);
					next.set(msg.name, { phase: msg.phase, message: msg.message });
					return next;
				});
			} else if (msg?.type === "pi_core_update_complete") {
				setUpdating(new Set());
				setProgress(new Map());
				// Capture per-package errors for display
				const errs = new Map<string, string>();
				for (const r of (msg.results ?? []) as Array<{ name: string; success: boolean; error?: string }>) {
					if (!r.success && r.error) errs.set(r.name, r.error);
				}
				setLastErrors(errs);
			}
		};
		window.addEventListener("pi-core-event", handler);
		return () => window.removeEventListener("pi-core-event", handler);
	}, []);

	const doUpdate = useCallback(
		async (packages: string[]) => {
			if (packages.length === 0) return;
			setUpdating(new Set(packages));
			setLastErrors(new Map());
			try {
				const res = await fetch(`${getApiBase()}/api/pi-core/update`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ packages }),
				});
				const body = await res.json();
				if (!body.success) {
					// Surface top-level error against each target package
					const errs = new Map<string, string>();
					for (const name of packages) errs.set(name, body.error ?? "Update failed");
					setLastErrors(errs);
					setUpdating(new Set());
				} else {
					// Per-package results applied by WS complete handler;
					// but also apply here for sync response path (no WS).
					const data = body.data as PiCoreUpdateResponse;
					const errs = new Map<string, string>();
					for (const r of data.results) if (!r.success && r.error) errs.set(r.name, r.error);
					setLastErrors(errs);
					setUpdating(new Set());
					// Refresh versions (the hook also listens for the event)
					refresh(true);
				}
			} catch (err: any) {
				const errs = new Map<string, string>();
				for (const name of packages) errs.set(name, err?.message ?? "Network error");
				setLastErrors(errs);
				setUpdating(new Set());
			}
		},
		[refresh],
	);

	const updatable = useMemo(
		() => (status?.packages ?? []).filter((p) => p.updateAvailable),
		[status],
	);

	return (
		<div>
			<h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 pb-1 border-b border-[var(--border-secondary)] flex items-center justify-between">
				<span>Pi Ecosystem</span>
				<div className="flex items-center gap-2">
					{status?.lastChecked && (
						<span className="text-[10px] font-normal text-[var(--text-muted)]">
							Last checked: {relativeTime(status.lastChecked)}
						</span>
					)}
					<button
						onClick={() => refresh(true)}
						disabled={isLoading}
						className="text-xs px-2 py-1 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-primary)] disabled:opacity-50 flex items-center gap-1"
						data-testid="pi-core-check-now"
					>
						<Icon path={isLoading ? mdiLoading : mdiRefresh} size={0.5} spin={isLoading} />
						{isLoading ? "Checking..." : "Check Now"}
					</button>
				</div>
			</h2>

			<p className="text-xs text-[var(--text-tertiary)] mb-2">
				Globally-installed pi CLI packages. Extensions are managed separately below.
			</p>

			{error && (
				<div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
					<Icon path={mdiAlertCircle} size={0.6} className="flex-shrink-0 mt-0.5" />
					<span>{error}</span>
				</div>
			)}

			{status && status.packages.length === 0 && (
				<p className="text-xs text-[var(--text-muted)] italic">No pi ecosystem packages detected.</p>
			)}

			{updatable.length > 1 && (
				<div className="mb-2">
					<button
						onClick={() => doUpdate(updatable.map((p) => p.name))}
						disabled={updating.size > 0}
						className="text-xs px-3 py-1 rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/30 disabled:opacity-50 flex items-center gap-1"
						data-testid="pi-core-update-all"
					>
						<Icon path={updating.size > 0 ? mdiLoading : mdiArrowUpBold} size={0.55} spin={updating.size > 0} />
						Update All ({updatable.length})
					</button>
				</div>
			)}

			<div className="space-y-1">
				{status?.packages.map((pkg) => (
					<PackageRow
						key={pkg.name}
						pkg={pkg}
						busy={updating.has(pkg.name)}
						progress={progress.get(pkg.name)?.message}
						error={lastErrors.get(pkg.name)}
						onUpdate={() => doUpdate([pkg.name])}
					/>
				))}
			</div>
		</div>
	);
}

interface PackageRowProps {
	pkg: PiCorePackage;
	busy: boolean;
	progress: string | undefined;
	error: string | undefined;
	onUpdate: () => void;
}

function PackageRow({ pkg, busy, progress, error, onUpdate }: PackageRowProps) {
	return (
		<div
			className="py-1.5 px-2 rounded hover:bg-[var(--bg-hover)] text-xs"
			data-testid={`pi-core-row-${pkg.name}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-[var(--text-primary)] font-medium">{pkg.displayName}</span>
						<span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-muted)]">
							{pkg.installSource}
						</span>
					</div>
					<code className="text-[10px] text-[var(--text-muted)] font-mono">{pkg.name}</code>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{pkg.updateAvailable ? (
						<span className="text-[10px] text-[var(--text-muted)]">
							<span className="text-[var(--text-secondary)]">{pkg.currentVersion}</span>
							{" → "}
							<span className="text-[var(--accent-primary)]">{pkg.latestVersion}</span>
						</span>
					) : (
						<span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
							<Icon path={mdiCheckCircle} size={0.45} className="text-green-500" />
							{pkg.currentVersion}
							{pkg.latestVersion === null && <span className="italic">(registry unreachable)</span>}
						</span>
					)}
					{pkg.updateAvailable && (
						<button
							onClick={onUpdate}
							disabled={busy}
							className="px-2 py-0.5 rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/30 disabled:opacity-50 flex items-center gap-1"
							data-testid={`pi-core-update-${pkg.name}`}
						>
							{busy ? <Icon path={mdiLoading} size={0.45} spin /> : <Icon path={mdiArrowUpBold} size={0.45} />}
							Update
						</button>
					)}
				</div>
			</div>
			{busy && progress && (
				<div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 truncate" title={progress}>
					{progress}
				</div>
			)}
			{error && (
				<div className="text-[10px] text-red-400 mt-0.5 flex items-start gap-1">
					<Icon path={mdiAlertCircle} size={0.4} className="flex-shrink-0 mt-0.5" />
					<span>{error}</span>
				</div>
			)}
		</div>
	);
}
