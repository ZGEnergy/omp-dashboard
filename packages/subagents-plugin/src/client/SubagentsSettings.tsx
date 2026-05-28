/**
 * SubagentsSettings — single-toggle settings panel for the subagents plugin.
 *
 * Claims slot `settings-section` (tab: "general"). Surfaces ONE producer
 * setting: `inheritContext`. The other producer settings
 * (`exposeInheritanceInTool`, `inheritance.*`) remain editable only via
 * the producer's `~/.pi/agent/extensions/pi-dashboard-subagents/config.json`
 * file for power users.
 *
 * Uses the canonical plugin-settings flow:
 *   - reads via `usePluginConfig<{ inheritContext?: boolean }>()`
 *   - writes via `POST /api/config/plugins/subagents`
 *   - plugin server's onResponse hook mirrors the write into the producer
 *     file (see ../server/index.ts)
 *
 * See change: add-subagent-inspector §16.
 */
import React, { useState } from "react";
import { usePluginConfig } from "@blackbelt-technology/dashboard-plugin-runtime";

interface SubagentsPluginConfig {
	inheritContext?: boolean;
}

export function SubagentsSettings() {
	const config = usePluginConfig<SubagentsPluginConfig>();
	const checked = config.inheritContext ?? true;
	const [inFlight, setInFlight] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleToggle(next: boolean) {
		setError(null);
		setInFlight(true);
		try {
			const res = await fetch("/api/config/plugins/subagents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ inheritContext: next }),
				credentials: "include",
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
			}
			// usePluginConfig will refresh via plugin_config_update broadcast
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setInFlight(false);
		}
	}

	return (
		<section className="space-y-3 p-4">
			<header>
				<h3 className="text-sm font-semibold text-[var(--text-primary)]">
					Subagent Inspector
				</h3>
				<p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
					Settings for the <code className="font-mono">pi-dashboard-subagents</code> producer.
				</p>
			</header>

			{/*
			  Plugin-level dep on the Roles plugin is declared in this plugin's
			  manifest (`dependsOn: ["roles"]`). The Plugins tab already surfaces
			  the relationship with cascade enable/disable; this inline disclaimer
			  is for users who land directly on Subagent settings and would
			  otherwise be surprised when the bundled Explore agent fails to
			  resolve `@fast` after they disable Roles.
			*/}
			<div
				data-testid="subagents-settings-roles-dep"
				className="text-[11px] text-[var(--text-tertiary)] border border-[var(--border-secondary)] rounded px-2 py-1.5 bg-[var(--bg-tertiary)]"
			>
				Requires the{" "}
				<code className="font-mono text-[var(--text-secondary)]">Roles</code> plugin
				— the bundled <code className="font-mono">Explore</code> agent uses{" "}
				<code className="font-mono">@fast</code> for model resolution. Disabling{" "}
				<code className="font-mono">Roles</code> from the Plugins tab will cascade-disable
				Subagents.
			</div>

			<label className="flex items-start gap-2 cursor-pointer">
				<input
					type="checkbox"
					className="mt-0.5"
					checked={checked}
					disabled={inFlight}
					onChange={(e) => handleToggle(e.target.checked)}
				/>
				<span className="flex-1">
					<span className="block text-sm text-[var(--text-primary)]">
						Fork parent context into every subagent
					</span>
					<span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">
						When on, the subagent inherits a compressed copy of the parent's recent turns.
						When off, every subagent starts with an empty conversation (isolated).
					</span>
				</span>
				{inFlight && (
					<span className="text-[10px] text-[var(--text-muted)]">saving…</span>
				)}
			</label>

			{error && (
				<div className="text-[11px] text-red-400 px-1">
					Failed to save: {error}
				</div>
			)}
		</section>
	);
}
