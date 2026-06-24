/**
 * Tests for pi-update delegation: pi packages update via the resolved pi's
 * own `pi update --self`; refusal text is surfaced; the dashboard package
 * refuses on non-npm-global layouts. See change: align-pi-update-with-resolved-pi.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { defaultRunPiUpdate, defaultRunNpmUpdate, runPiSelfUpdateWithFallback, runResolvedInstall } from "../pi-core-updater.js";
import type { WiredPi } from "../resolved-pi.js";

const WIRED: WiredPi = {
	argv: ["/abs/pi"],
	path: "/abs/.../pi-coding-agent/dist/cli.js",
	pkgRoot: "/abs/.../pi-coding-agent",
	name: "@earendil-works/pi-coding-agent",
	version: "0.78.0",
};

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Fake child process whose close/stdout/stderr we drive manually. */
function makeFakeChild() {
	const child: any = new EventEmitter();
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child;
}

function fakeSpawn(child: any, captured: { cmd?: string; args?: string[] }) {
	return ((cmd: string, args: string[]) => {
		captured.cmd = cmd;
		captured.args = args;
		return child;
	}) as any;
}

describe("defaultRunPiUpdate", () => {
	it("spawns `<pi> update --self` and resolves on exit 0", async () => {
		const child = makeFakeChild();
		const captured: { cmd?: string; args?: string[] } = {};
		const p = defaultRunPiUpdate({ kind: "self" }, () => {}, {
			_resolveWiredPi: () => WIRED,
			_spawn: fakeSpawn(child, captured),
			_envBuilder: () => ({}),
		});
		child.emit("close", 0);
		await expect(p).resolves.toBeUndefined();
		expect(captured.cmd).toBe("/abs/pi");
		expect(captured.args).toEqual(["update", "--self"]);
	});

	it("builds `update --all` for all mode", async () => {
		const child = makeFakeChild();
		const captured: { cmd?: string; args?: string[] } = {};
		const p = defaultRunPiUpdate({ kind: "all" }, () => {}, {
			_resolveWiredPi: () => WIRED,
			_spawn: fakeSpawn(child, captured),
			_envBuilder: () => ({}),
		});
		child.emit("close", 0);
		await p;
		expect(captured.args).toEqual(["update", "--all"]);
	});

	it("surfaces pi's self-update-unavailable instruction on refusal", async () => {
		const child = makeFakeChild();
		const p = defaultRunPiUpdate({ kind: "self" }, () => {}, {
			_resolveWiredPi: () => WIRED,
			_spawn: fakeSpawn(child, {}),
			_envBuilder: () => ({}),
		});
		child.stderr.emit("data", Buffer.from("error: pi cannot self-update this installation.\n"));
		child.emit("close", 1);
		await expect(p).rejects.toThrow(/cannot self-update this installation/);
	});

	it("rejects when pi cannot be resolved", async () => {
		const p = defaultRunPiUpdate({ kind: "self" }, () => {}, {
			_resolveWiredPi: () => null,
		});
		await expect(p).rejects.toThrow(/pi could not be resolved/);
	});
});

describe("defaultRunNpmUpdate delegation", () => {
	it("pi package delegates to `pi update --self`", async () => {
		const child = makeFakeChild();
		const captured: { cmd?: string; args?: string[] } = {};
		const p = defaultRunNpmUpdate(
			{ name: "@earendil-works/pi-coding-agent", displayName: "pi", currentVersion: "0.78.0", latestVersion: "0.80.2", updateAvailable: true, installSource: "global" },
			() => {},
			{ _resolveWiredPi: () => WIRED, _spawn: fakeSpawn(child, captured), _envBuilder: () => ({}) },
		);
		child.emit("close", 0);
		await p;
		expect(captured.args).toEqual(["update", "--self"]);
	});

	it("dashboard package refuses on monorepo layout with the reinstall instruction", async () => {
		const p = defaultRunNpmUpdate(
			{ name: "@blackbelt-technology/pi-agent-dashboard", displayName: "pi-dashboard", currentVersion: "0.5.4", latestVersion: "0.6.0", updateAvailable: true, installSource: "global" },
			() => {},
			{ _detectInstallLayout: () => "monorepo" },
		);
		await expect(p).rejects.toThrow(/npm install/);
	});
});

describe("runPiSelfUpdateWithFallback", () => {
	it("uses pi self-update when it succeeds (no fallback)", async () => {
		const child = makeFakeChild();
		const captured: { cmd?: string; args?: string[] } = {};
		const p = runPiSelfUpdateWithFallback("@earendil-works/pi-coding-agent", () => {}, {
			_resolveWiredPi: () => WIRED,
			_spawn: fakeSpawn(child, captured),
			_envBuilder: () => ({}),
		});
		child.emit("close", 0);
		await p;
		expect(captured.args).toEqual(["update", "--self"]);
	});

	it("falls back to in-place install at the resolved prefix when pi declines", async () => {
		const piChild = makeFakeChild();
		const npmChild = makeFakeChild();
		const queue = [piChild, npmChild];
		const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
		const spawnFn = ((cmd: string, args: string[], opts: any) => {
			calls.push({ cmd, args, cwd: opts?.cwd });
			return queue.shift();
		}) as any;
		const p = runPiSelfUpdateWithFallback("@earendil-works/pi-coding-agent", () => {}, {
			_resolveWiredPi: () => WIRED,
			_spawn: spawnFn,
			_envBuilder: () => ({}),
			_classifyPiInstall: () => ({ method: "npm", scope: "local", installPrefix: "/repo", packageManager: "npm", writable: true, updatable: true }),
			_resolveNpm: () => ({ ok: true, argv: ["npm"] }),
		});
		// pi update --self refuses
		piChild.stderr.emit("data", Buffer.from("error: pi cannot self-update this installation.\n"));
		piChild.emit("close", 1);
		await tick();
		await tick();
		npmChild.emit("close", 0);
		await p;
		expect(calls[0].args).toEqual(["update", "--self"]);
		expect(calls[1].cmd).toBe("npm");
		expect(calls[1].args).toEqual(["install", "@earendil-works/pi-coding-agent@latest", "--ignore-scripts", "--no-audit", "--no-fund"]);
		expect(calls[1].cwd).toBe("/repo");
	});
});

describe("runResolvedInstall", () => {
	it("refuses a read-only install path", async () => {
		const p = runResolvedInstall(WIRED, "@earendil-works/pi-coding-agent", () => {}, {
			_classifyPiInstall: () => ({ method: "npm", scope: "local", installPrefix: "/ro", packageManager: "npm", writable: false, updatable: false, manualAction: "This pi install is read-only (/ro)." }),
		});
		await expect(p).rejects.toThrow(/read-only/);
	});

	it("uses `pnpm add` at the prefix for a pnpm install", async () => {
		const child = makeFakeChild();
		const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
		const spawnFn = ((cmd: string, args: string[], opts: any) => {
			calls.push({ cmd, args, cwd: opts?.cwd });
			return child;
		}) as any;
		const p = runResolvedInstall(WIRED, "@earendil-works/pi-coding-agent", () => {}, {
			_classifyPiInstall: () => ({ method: "pnpm", scope: "local", installPrefix: "/ws", packageManager: "pnpm", writable: true, updatable: true }),
			_spawn: spawnFn,
			_envBuilder: () => ({}),
		});
		child.emit("close", 0);
		await p;
		expect(calls[0].cmd).toBe("pnpm");
		expect(calls[0].args).toEqual(["add", "@earendil-works/pi-coding-agent@latest", "--ignore-scripts"]);
		expect(calls[0].cwd).toBe("/ws");
	});
});
