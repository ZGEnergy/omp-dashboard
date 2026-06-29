/**
 * Pi core package updater.
 *
 * Runs `npm install -g <pkg>@latest` for globally-installed packages or
 * `npm install <pkg>@latest` in `~/.pi-dashboard/` for managed installs.
 * The `@latest` suffix is required because the consuming `package.json`
 * dependency range (e.g. `^0.70.0`) would otherwise pin updates to the
 * same minor — breaking cross-minor upgrades that pi now ships routinely
 * (0.71+ minors carry breaking changes per its CHANGELOG).
 * Coordinates with PackageManagerWrapper's busy-lock so extension
 * operations and core updates can't run concurrently.
 *
 * See change: fix-pi-core-update-cross-minor.
 */
import { spawn } from "node:child_process"; // ban:child_process-ok npm-update streams stdout/stderr via pipe for progress events; refactor to platform/spawn Recipe is tracked tech debt
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import type { PiCorePackage, PiCoreUpdateResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import { getDefaultRegistry } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { prependManagedNodeToPath } from "@blackbelt-technology/pi-dashboard-shared/platform/managed-node-path.js";
import type { PackageManagerWrapper } from "./package-manager-wrapper.js";
import {
	resolveWiredPi,
	classifyPiInstall,
	buildPiUpdateArgv,
	isSelfUpdateUnavailable,
	type PiUpdateMode,
	type WiredPi,
	type PiInstallInfo,
} from "./resolved-pi.js";
import { detectInstallLayout, suggestedReinstallCommand } from "./recovery-server.js";

/** pi-coding-agent package names (current + legacy fork). */
const PI_PACKAGE_NAMES = [
	"@earendil-works/pi-coding-agent",
	"@mariozechner/pi-coding-agent",
];
const DASHBOARD_PACKAGE = "@blackbelt-technology/pi-agent-dashboard";
const isPiPackage = (name: string): boolean => PI_PACKAGE_NAMES.includes(name);

const UPDATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per package

const MANAGED_DIR = path.join(os.homedir(), ".pi-dashboard");

export interface UpdateProgressEvent {
	name: string;
	phase: "start" | "output" | "complete" | "error";
	message?: string;
}

export type UpdateProgressListener = (event: UpdateProgressEvent) => void;

export interface PiCoreUpdaterOptions {
	packageManagerWrapper: PackageManagerWrapper;
	/** Test seam: override per-package update runner. */
	runNpmUpdate?: (pkg: PiCorePackage, onOutput: (line: string) => void) => Promise<void>;
	/** Test seam: override the resolved-pi delegation runner (`pi update <mode>`). */
	runPiUpdate?: (mode: PiUpdateMode, onOutput: (line: string) => void) => Promise<void>;
	/** Optional: called after successful update of at least one package. */
	onAllComplete?: () => Promise<number>;
}

/**
 * Test seams for `defaultRunNpmUpdate`. Production callers omit
 * `_seams`; tests inject fakes to avoid real spawns.
 *
 * `_resolveNpm` defaults to `getDefaultRegistry().resolveExecutor("npm")`.
 * `_spawn` defaults to `node:child_process` `spawn`.
 * `_envBuilder` defaults to `prependManagedNodeToPath(process.env)`.
 */
export interface DefaultRunNpmUpdateSeams {
	_resolveNpm?: () =>
		| { ok: true; argv: string[] }
		| { ok: false; reason: string };
	_spawn?: typeof spawn;
	_envBuilder?: () => NodeJS.ProcessEnv;
	/** Test seam: override resolved-pi lookup for the delegation path. */
	_resolveWiredPi?: () => WiredPi | null;
	/** Test seam: override install-layout detection for the dashboard package. */
	_detectInstallLayout?: () => ReturnType<typeof detectInstallLayout>;
	/** Test seam: override resolved-pi install classification for the fallback. */
	_classifyPiInstall?: (wired: WiredPi) => PiInstallInfo;
}

/**
 * Fallback when pi's own `pi update --self` declines a non-global install:
 * the dashboard updates pi IN PLACE at its resolved prefix with the package
 * manager that governs that prefix (`npm install` / `pnpm|yarn|bun add`).
 * Refuses only when the install path is read-only (e.g. a packaged app).
 * Cross-OS: the PM is resolved via ToolRegistry / PATH, no OS-specific code.
 * See change: align-pi-update-with-resolved-pi.
 */
export function runResolvedInstall(
	wired: WiredPi,
	pkgName: string,
	onOutput: (line: string) => void,
	seams: DefaultRunNpmUpdateSeams = {},
): Promise<void> {
	return new Promise((resolve, reject) => {
		const info = (seams._classifyPiInstall ?? classifyPiInstall)(wired);
		if (!info.updatable) {
			reject(new Error(
				info.manualAction ??
					`This pi install cannot be updated in place (${wired.pkgRoot}). Update via the package manager or installer that provides it.`,
			));
			return;
		}
		const spec = `${pkgName}@latest`;
		let cmd: string;
		let argvPrefix: string[] = [];
		let installArgs: string[];
		if (info.packageManager === "npm") {
			const resolveNpm =
				seams._resolveNpm ??
				(() => {
					const r = getDefaultRegistry().resolveExecutor("npm");
					return r.ok && r.path
						? { ok: true as const, argv: r.argv }
						: { ok: false as const, reason: "no managed runtime, no npm on PATH" };
				});
			const npmRes = resolveNpm();
			if (!npmRes.ok) {
				reject(new Error(`npm could not be resolved (${npmRes.reason}).`));
				return;
			}
			[cmd, ...argvPrefix] = npmRes.argv;
			// `--ignore-scripts` mirrors pi's own self-update: never run the host
			// project's lifecycle scripts (postinstall/prepare) during a pi bump —
			// they routinely exit non-zero (e.g. 127) in a non-interactive spawn.
			// Only managed / simple-local installs reach here; workspace installs
			// are not auto-updated (classify => updatable:false), so no peer-deps
			// bypass is needed. See change: align-pi-update-with-resolved-pi.
			installArgs = ["install", spec, "--ignore-scripts", "--no-audit", "--no-fund"];
		} else {
			cmd = info.packageManager; // pnpm | yarn | bun on PATH
			installArgs = ["add", spec, "--ignore-scripts"];
		}
		const spawnFn = seams._spawn ?? spawn;
		const envFn = seams._envBuilder ?? (() => prependManagedNodeToPath(process.env));
		onOutput(`$ ${cmd} ${[...argvPrefix, ...installArgs].join(" ")}  (cwd: ${info.installPrefix})`);
		const child = spawnFn(cmd, [...argvPrefix, ...installArgs], {
			cwd: info.installPrefix,
			stdio: ["ignore", "pipe", "pipe"],
			env: envFn(),
			windowsHide: true,
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`install timed out after ${UPDATE_TIMEOUT_MS / 1000}s`));
		}, UPDATE_TIMEOUT_MS);
		const onChunk = (chunk: Buffer) => {
			for (const line of chunk.toString().split("\n").filter((l) => l.trim())) onOutput(line);
		};
		child.stdout?.on("data", onChunk);
		child.stderr?.on("data", onChunk);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`${cmd} install exited with code ${code}`));
		});
	});
}

/**
 * Update pi: try its own `pi update --self` first (handles global npm/pnpm/bun,
 * version pinning, scope migration); if pi declines a non-global install, fall
 * back to installing in place at the resolved prefix. See change:
 * align-pi-update-with-resolved-pi.
 */
export async function runPiSelfUpdateWithFallback(
	pkgName: string,
	onOutput: (line: string) => void,
	seams: DefaultRunNpmUpdateSeams = {},
): Promise<void> {
	try {
		await defaultRunPiUpdate({ kind: "self" }, onOutput, seams);
		return;
	} catch (err) {
		const msg = (err as Error).message ?? "";
		if (!isSelfUpdateUnavailable(msg)) throw err;
		const wired = (seams._resolveWiredPi ?? resolveWiredPi)();
		if (!wired) throw err;
		onOutput("pi declined to self-update this install; updating in place via the resolved package manager\u2026");
		await runResolvedInstall(wired, pkgName, onOutput, seams);
	}
}

/**
 * Delegate an update to the resolved pi's OWN updater
 * (`<resolvedPi> update --self|--all|--extensions|--extension <src>`).
 * Resolves on exit 0; rejects with pi's self-update-unavailable instruction
 * (verbatim) when pi refuses this install. See change:
 * align-pi-update-with-resolved-pi.
 */
export function defaultRunPiUpdate(
	mode: PiUpdateMode,
	onOutput: (line: string) => void,
	seams: DefaultRunNpmUpdateSeams = {},
): Promise<void> {
	return new Promise((resolve, reject) => {
		const wired = (seams._resolveWiredPi ?? resolveWiredPi)();
		if (!wired) {
			reject(new Error("pi could not be resolved (not found via managed install or PATH)."));
			return;
		}
		const argv = buildPiUpdateArgv(wired, mode);
		const [cmd, ...rest] = argv;
		const spawnFn = seams._spawn ?? spawn;
		const envFn = seams._envBuilder ?? (() => prependManagedNodeToPath(process.env));
		const child = spawnFn(cmd, rest, {
			cwd: wired.pkgRoot,
			stdio: ["ignore", "pipe", "pipe"],
			env: envFn(),
			windowsHide: true,
		});

		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`pi update timed out after ${UPDATE_TIMEOUT_MS / 1000}s`));
		}, UPDATE_TIMEOUT_MS);

		let buf = "";
		const onChunk = (chunk: Buffer) => {
			const text = chunk.toString();
			buf += text;
			for (const line of text.split("\n").filter((l) => l.trim())) onOutput(line);
		};
		child.stdout?.on("data", onChunk);
		child.stderr?.on("data", onChunk);

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) {
				resolve();
				return;
			}
			if (isSelfUpdateUnavailable(buf)) {
				reject(new Error(buf.trim() || "pi cannot self-update this installation."));
				return;
			}
			reject(new Error(`pi update exited with code ${code}`));
		});
	});
}

/**
 * Default npm-update runner.
 *
 * After change `embed-managed-node-runtime`:
 *   - Resolves the `npm` binary via `ToolRegistry.resolve("npm")` so
 *     the managed-Node runtime (when installed) is preferred over the
 *     system PATH — the user-visible regression class this change
 *     exists to prevent (`npm update exited with code 1` on a fresh
 *     Windows install with no system Node).
 *   - Refuses to spawn a bare `"npm"` if the registry can't resolve
 *     it. Surfaces a clear `npm` unresolved error per the spec
 *     scenario "ToolRegistry resolution failure surfaces a clear
 *     error".
 *   - Prepends the managed Node directory to the spawned child's
 *     `PATH` via `prependManagedNodeToPath`, so any nested `node` /
 *     `npm` invocation inside the npm subprocess also resolves to the
 *     managed runtime.
 */
export function defaultRunNpmUpdate(
	pkg: PiCorePackage,
	onOutput: (line: string) => void,
	seams: DefaultRunNpmUpdateSeams = {},
): Promise<void> {
	// pi delegates to its own updater (`pi update --self`) so the exact
	// resolved install is updated and pi owns install-method detection /
	// refusal. See change: align-pi-update-with-resolved-pi.
	if (isPiPackage(pkg.name)) {
		return runPiSelfUpdateWithFallback(pkg.name, onOutput, seams);
	}
	// The dashboard package has no `pi update`. Update via npm only when the
	// install layout supports it; otherwise refuse with the manual instruction.
	if (pkg.name === DASHBOARD_PACKAGE) {
		const layout = (seams._detectInstallLayout ?? detectInstallLayout)();
		if (layout !== "npm-global") {
			return Promise.reject(new Error(suggestedReinstallCommand(layout)));
		}
	}
	return new Promise((resolve, reject) => {
		// Always target the npm `latest` dist-tag — bypasses the
		// consuming package.json range so cross-minor jumps work. See
		// change: fix-pi-core-update-cross-minor.
		const spec = `${pkg.name}@latest`;
		const args =
			pkg.installSource === "global"
				? ["install", "-g", spec]
				: ["install", spec];
		const cwd = pkg.installSource === "managed" ? MANAGED_DIR : process.cwd();

		if (pkg.installSource === "managed" && !existsSync(MANAGED_DIR)) {
			reject(new Error(`Managed install directory not found: ${MANAGED_DIR}`));
			return;
		}

		// Resolve npm via ToolRegistry: managed runtime > override > PATH.
		// On unresolved, refuse — do not fall back to bare spawn("npm").
		const resolveNpm =
			seams._resolveNpm ??
			(() => {
				const r = getDefaultRegistry().resolveExecutor("npm");
				return r.ok && r.path
					? { ok: true as const, argv: r.argv }
					: { ok: false as const, reason: "no override, no managed runtime, no npm on PATH" };
			});
		const npmRes = resolveNpm();
		if (!npmRes.ok) {
			reject(new Error(
				`npm could not be resolved (${npmRes.reason}). ` +
				"Install Node.js or run `pi-dashboard repair` to restore the managed Node runtime.",
			));
			return;
		}

		// `argv` is ready-to-spawn: on Windows + an npm-cli.js resolution
		// it is `[node.exe, npm-cli.js]` (bypasses the .cmd shim and the
		// cmd.exe console flash); elsewhere it is `[npm]`.
		const [cmd, ...argvPrefix] = npmRes.argv;
		const spawnFn = seams._spawn ?? spawn;
		const envFn = seams._envBuilder ?? (() => prependManagedNodeToPath(process.env));
		const child = spawnFn(cmd, [...argvPrefix, ...args], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: envFn(),
			windowsHide: true,
		});

		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`npm update timed out after ${UPDATE_TIMEOUT_MS / 1000}s`));
		}, UPDATE_TIMEOUT_MS);

		let stderrBuf = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			const lines = chunk.toString().split("\n").filter((l) => l.trim());
			for (const line of lines) onOutput(line);
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderrBuf += text;
			const lines = text.split("\n").filter((l) => l.trim());
			for (const line of lines) onOutput(line);
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) {
				resolve();
			} else {
				const hint =
					pkg.installSource === "global" && /permission|EACCES|EPERM|EROFS/i.test(stderrBuf)
						? ` (permission error — try: sudo npm install -g ${pkg.name}@latest)`
						: "";
				reject(new Error(`npm install exited with code ${code}${hint}`));
			}
		});
	});
}

export class PiCoreUpdater {
	private listener: UpdateProgressListener | undefined;
	private readonly pmWrapper: PackageManagerWrapper;
	private readonly runNpmUpdate: (
		pkg: PiCorePackage,
		onOutput: (line: string) => void,
	) => Promise<void>;
	private readonly runPiUpdate: (
		mode: PiUpdateMode,
		onOutput: (line: string) => void,
	) => Promise<void>;
	private readonly onAllComplete: (() => Promise<number>) | undefined;

	constructor(opts: PiCoreUpdaterOptions) {
		this.pmWrapper = opts.packageManagerWrapper;
		this.runNpmUpdate = opts.runNpmUpdate ?? defaultRunNpmUpdate;
		this.runPiUpdate =
			opts.runPiUpdate ?? ((mode, onOutput) => defaultRunPiUpdate(mode, onOutput));
		this.onAllComplete = opts.onAllComplete;
	}

	/**
	 * Update a whole scope via the resolved pi. NOT a monolithic `pi update
	 * --all`: `mode: "all"` runs TWO steps — pi via runPiSelfUpdateWithFallback
	 * (`pi update --self`, then in-place install when pi declines a non-global
	 * install) PLUS `pi update --extensions`; `mode: "extensions"` runs only
	 * `pi update --extensions`. The split gives the pi step the in-place
	 * fallback that managed/local installs need — pi's own `--all` declines
	 * self-update on those with no fallback, leaving the spawned pi stale.
	 * Serializes through the shared busy-lock.
	 * See change: align-pi-update-with-resolved-pi.
	 */
	async updateViaPi(
		mode: "all" | "extensions",
	): Promise<{ results: PiCoreUpdateResult[]; sessionsReloaded: number }> {
		return this.pmWrapper.runExclusive(async () => {
			const results: PiCoreUpdateResult[] = [];
			const runStep = async (
				label: string,
				fn: (out: (line: string) => void) => Promise<void>,
			) => {
				this.emit({ name: label, phase: "start", message: `Updating ${label}...` });
				try {
					await fn((line) => this.emit({ name: label, phase: "output", message: line }));
					results.push({ name: label, success: true });
					this.emit({ name: label, phase: "complete", message: `Updated ${label}` });
				} catch (err) {
					const msg = (err as Error).message ?? String(err);
					results.push({ name: label, success: false, error: msg });
					this.emit({ name: label, phase: "error", message: msg });
				}
			};

			// "all" = update the pi this dashboard runs (self, or in-place fallback)
			// PLUS extensions; "extensions" = extensions only.
			if (mode === "all") {
				const wired = resolveWiredPi();
				const piName = wired?.name ?? "@earendil-works/pi-coding-agent";
				await runStep("pi", (out) => runPiSelfUpdateWithFallback(piName, out));
			}
			await runStep("extensions", (out) => this.runPiUpdate({ kind: "extensions" }, out));

			let sessionsReloaded = 0;
			if (results.some((r) => r.success) && this.onAllComplete) {
				try {
					sessionsReloaded = await this.onAllComplete();
				} catch (err) {
					console.error("[pi-core-updater] session reload failed:", err);
				}
			}
			return { results, sessionsReloaded };
		});
	}

	setProgressListener(listener: UpdateProgressListener | undefined): void {
		this.listener = listener;
	}

	/**
	 * Update a set of core packages sequentially. Acquires the shared
	 * busy-lock via PackageManagerWrapper.runExclusive — will throw
	 * PackageOperationBusyError if an extension operation is running.
	 *
	 * Returns per-package results plus the count of sessions reloaded
	 * after a successful update.
	 */
	async update(
		packages: PiCorePackage[],
	): Promise<{ results: PiCoreUpdateResult[]; sessionsReloaded: number }> {
		return this.pmWrapper.runExclusive(async () => {
			const results: PiCoreUpdateResult[] = [];

			for (const pkg of packages) {
				this.emit({ name: pkg.name, phase: "start", message: `Updating ${pkg.name}...` });
				try {
					await this.runNpmUpdate(pkg, (line) => {
						this.emit({ name: pkg.name, phase: "output", message: line });
					});
					results.push({ name: pkg.name, success: true });
					this.emit({ name: pkg.name, phase: "complete", message: `Updated ${pkg.name}` });
				} catch (err) {
					const msg = (err as Error).message ?? String(err);
					results.push({ name: pkg.name, success: false, error: msg });
					this.emit({ name: pkg.name, phase: "error", message: msg });
				}
			}

			let sessionsReloaded = 0;
			if (results.some((r) => r.success) && this.onAllComplete) {
				try {
					sessionsReloaded = await this.onAllComplete();
				} catch (err) {
					console.error("[pi-core-updater] session reload failed:", err);
				}
			}

			return { results, sessionsReloaded };
		});
	}

	private emit(event: UpdateProgressEvent): void {
		try {
			this.listener?.(event);
		} catch (err) {
			console.error("[pi-core-updater] progress listener error:", err);
		}
	}
}
