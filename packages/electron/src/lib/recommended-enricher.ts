// ---------------------------------------------------------------------------
// recommended-enricher — bootstrap enrichment of the recommended-extensions
// manifest for the Electron first-launch wizard.
//
// CONSTRAINTS (per user direction):
//   1. Enrichment is GATED on pi being installed. No pi → zero enrichment,
//      entries go to the wizard as-is. First-launch on a pristine machine
//      must not explode trying to read pi-specific state that doesn't exist.
//   2. GLOBAL scope only. The wizard is a first-launch flow; there is no
//      meaningful "project" CWD at this point. We inspect only
//      ~/.pi/agent/settings.json, never a project-local .pi/settings.json.
//      (The in-app Packages tab uses the server route which DOES consider
//      both scopes — that's the right choice there because by then the
//      user has opened a project.)
//
// The enricher returns entries augmented with two signals:
//   - activeInPi: true iff the entry's source matches any package listed
//     in the global settings.json packages[]. Applies the same
//     cross-kind basename heuristic as the server route, via the shared
//     source-matching module.
//   - installedGlobal: currently an alias for activeInPi because the
//     only scope we check is global. Kept as a separate field so the
//     renderer can evolve independently if we later add disk-only
//     detection (e.g. via getInstalledPath).
//
// Everything here is defensive: ANY failure (fs error, malformed json,
// pi module missing/broken) drops back to "no enrichment" — the wizard
// must keep working on the worst-day imaginable.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourcesMatch } from "@blackbelt-technology/pi-dashboard-shared/source-matching.js";
import type { RecommendedExtension } from "@blackbelt-technology/pi-dashboard-shared/recommended-extensions.js";

/**
 * Manifest entry with the wizard-relevant installed-state signals
 * attached. Fields are optional so downstream code can treat absent
 * values as "unknown / not enriched".
 */
export interface EnrichedWizardEntry extends RecommendedExtension {
	/** True iff the entry's source matches any package in
	 *  ~/.pi/agent/settings.json packages[]. Undefined when pi was not
	 *  resolvable and enrichment was skipped. */
	activeInPi?: boolean;
	/** True iff activeInPi (kept separate for future disk-only detection). */
	installedGlobal?: boolean;
}

/**
 * Best-effort check: is pi-coding-agent reachable from this Electron
 * process right now? Resolves to true only when at least one known
 * install location exists AND parses as a module with the expected
 * exports. Never throws.
 */
function isPiInstalled(): boolean {
	// Match the dependency-installer's detection path: the managed
	// location first, then the system install. We don't actually
	// import() here — just check file/path existence. Importing would
	// cost startup time and force jiti through a transpile for no
	// benefit since we don't need pi's APIs for enrichment (we only
	// need its settings.json, which is a plain json file).
	const home = os.homedir();

	// System install (npm global or via pi's managed dir) — the actual
	// path varies by platform/install method; the one reliable signal
	// is that ~/.pi/agent exists, which pi creates on first run.
	const agentDir = path.join(home, ".pi", "agent");
	if (fs.existsSync(agentDir)) return true;

	// If the dashboard is about to install pi into its managed dir,
	// the dir may not exist yet on first launch — enrichment correctly
	// returns "not installed" in that case. The post-install wizard
	// step runs BEFORE recommended-extensions so by the time the user
	// reaches that step ~/.pi/agent will typically exist.

	return false;
}

/**
 * Parse the `packages[]` array from ~/.pi/agent/settings.json.
 *
 * Return contract (precise — controls enrichment semantics):
 *   - `[]`   when the file doesn't exist OR exists and is empty: pi is
 *            installed but no packages are configured globally. We can
 *            confidently say every entry is "not active".
 *   - `string[]` (non-empty) on successful parse.
 *   - `null` ONLY when the file exists but can't be read or parsed.
 *            In that case we don't trust the state and the enricher
 *            falls back to "unknown" rather than lying.
 *
 * Never throws — a garbage settings file must not block the wizard.
 */
function readGlobalActiveSources(): string[] | null {
	const globalPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
	if (!fs.existsSync(globalPath)) return [];
	try {
		const raw = fs.readFileSync(globalPath, "utf-8").trim();
		if (!raw) return [];
		const data = JSON.parse(raw);
		const pkgs = Array.isArray(data?.packages) ? (data.packages as unknown[]) : [];
		return pkgs.filter((p): p is string => typeof p === "string");
	} catch {
		return null;
	}
}

/**
 * Enrich a manifest array with `activeInPi` / `installedGlobal` signals.
 *
 * Gating:
 *   - If pi is not installed → return entries untouched (no extra fields).
 *   - If global settings.json can't be read → return entries untouched.
 *   - Otherwise → attach boolean signals per entry.
 *
 * Visible to the renderer as: present enriched fields iff enrichment
 * succeeded end-to-end; absent fields (undefined) means "unknown" and
 * the renderer should fall back to its pre-enrichment default behavior.
 */
export function enrichRecommendedEntries<T extends RecommendedExtension>(
	entries: readonly T[],
): Array<T & { activeInPi?: boolean; installedGlobal?: boolean }> {
	if (!isPiInstalled()) {
		return entries.map((e) => ({ ...e }));
	}
	const active = readGlobalActiveSources();
	if (active === null) {
		return entries.map((e) => ({ ...e }));
	}
	return entries.map((entry) => {
		const hit = active.some((src) => sourcesMatch(src, entry.source));
		return { ...entry, activeInPi: hit, installedGlobal: hit };
	});
}
