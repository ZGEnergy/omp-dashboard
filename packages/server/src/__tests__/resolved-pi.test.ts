/**
 * Tests for resolveWiredPi() — the single pi resolution authority shared by
 * spawn, stats, and update. See change: align-pi-update-with-resolved-pi.
 */
import { describe, it, expect } from "vitest";
import { resolveWiredPi, classifyPiInstall, type WiredPi } from "../resolved-pi.js";

/** Build a fake registry whose resolveExecutor("pi") returns a fixed result. */
function fakeRegistry(exec: { ok: boolean; path: string | null; argv: string[] }) {
	return {
		resolveExecutor: (name: string) => {
			if (name !== "pi") throw new Error(`unexpected tool ${name}`);
			return { name, ...exec, source: exec.ok ? "managed" : null, tried: [], resolvedAt: 0 };
		},
	} as any;
}

describe("resolveWiredPi", () => {
	it("returns null when pi does not resolve", () => {
		const wired = resolveWiredPi({
			_registry: fakeRegistry({ ok: false, path: null, argv: [] }),
		});
		expect(wired).toBeNull();
	});

	it("managed install: reads version from the resolved package.json", () => {
		const cli = "/home/u/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
		const root = "/home/u/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent";
		const wired = resolveWiredPi({
			_registry: fakeRegistry({ ok: true, path: cli, argv: [cli] }),
			_realpath: (p) => p,
			_existsSync: (p) => p === `${root}/package.json`,
			_readFile: () => JSON.stringify({ version: "0.73.1" }),
		});
		expect(wired).not.toBeNull();
		expect(wired!.version).toBe("0.73.1");
		expect(wired!.pkgRoot).toBe(root);
		expect(wired!.argv).toEqual([cli]);
	});

	it("npm-global symlink: realpaths the bin launcher before reading version", () => {
		const bin = "/usr/local/bin/pi";
		const real = "/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
		const root = "/usr/lib/node_modules/@earendil-works/pi-coding-agent";
		const wired = resolveWiredPi({
			_registry: fakeRegistry({ ok: true, path: bin, argv: [bin] }),
			_realpath: (p) => (p === bin ? real : p),
			_existsSync: (p) => p === `${root}/package.json`,
			_readFile: () => JSON.stringify({ version: "0.80.2" }),
		});
		expect(wired!.version).toBe("0.80.2");
		expect(wired!.pkgRoot).toBe(root);
		expect(wired!.path).toBe(real);
	});

	it("repo-local (bare-import) install resolves its own pkgRoot/version", () => {
		const cli = "/repo/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
		const root = "/repo/node_modules/@earendil-works/pi-coding-agent";
		const wired = resolveWiredPi({
			_registry: fakeRegistry({ ok: true, path: cli, argv: [cli] }),
			_realpath: (p) => p,
			_existsSync: (p) => p === `${root}/package.json`,
			_readFile: () => JSON.stringify({ version: "0.78.0" }),
		});
		expect(wired!.version).toBe("0.78.0");
		expect(wired!.pkgRoot).toBe(root);
	});

	it("version is null when no package.json is found while ascending", () => {
		const cli = "/weird/place/pi";
		const wired = resolveWiredPi({
			_registry: fakeRegistry({ ok: true, path: cli, argv: [cli] }),
			_realpath: (p) => p,
			_existsSync: () => false,
			_readFile: () => "{}",
		});
		expect(wired).not.toBeNull();
		expect(wired!.version).toBeNull();
	});
});

describe("classifyPiInstall", () => {
	const mk = (pkgRoot: string): WiredPi => ({
		argv: ["/x"], path: pkgRoot + "/dist/cli.js", pkgRoot, name: "@earendil-works/pi-coding-agent", version: "0.78.0",
	});

	it("classifies a writable repo-local install as updatable npm/local", () => {
		const info = classifyPiInstall(mk("/repo/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: () => false,
			_accessSync: () => {},
		});
		expect(info.installPrefix).toBe("/repo");
		expect(info.method).toBe("npm");
		expect(info.scope).toBe("local");
		expect(info.updatable).toBe(true);
	});

	it("detects pnpm from a sole lockfile at the prefix", () => {
		const info = classifyPiInstall(mk("/ws/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: (p) => p === "/ws/pnpm-lock.yaml",
			_accessSync: () => {},
		});
		expect(info.method).toBe("pnpm");
		expect(info.packageManager).toBe("pnpm");
		expect(info.updatable).toBe(true);
	});

	it("prefers npm when BOTH package-lock and pnpm-lock exist (npm built node_modules)", () => {
		const info = classifyPiInstall(mk("/repo/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: (p) => p === "/repo/package-lock.json" || p === "/repo/pnpm-lock.yaml",
			_accessSync: () => {},
		});
		expect(info.method).toBe("npm");
	});

	it("packageManager field wins over lockfiles", () => {
		const info = classifyPiInstall(mk("/repo/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: (p) => p === "/repo/package.json" || p === "/repo/package-lock.json",
			_readFile: () => JSON.stringify({ packageManager: "pnpm@9.1.0" }),
			_accessSync: () => {},
		});
		expect(info.method).toBe("pnpm");
	});

	it("marks read-only installs not updatable with an instruction", () => {
		const info = classifyPiInstall(mk("/app/resources/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: () => false,
			_accessSync: () => { throw new Error("EACCES"); },
		});
		expect(info.writable).toBe(false);
		expect(info.updatable).toBe(false);
		expect(info.manualAction).toMatch(/read-only/);
	});

	it("refuses a global pnpm store path (handled by pi --self) but marks updatable", () => {
		const info = classifyPiInstall({
			argv: ["/x"], path: "/home/u/.pnpm/global/5/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
			pkgRoot: "/home/u/.pnpm/global/5/node_modules/@earendil-works/pi-coding-agent", name: "@earendil-works/pi-coding-agent", version: "0.80.2",
		}, { _existsSync: () => false, _accessSync: () => {} });
		expect(info.method).toBe("pnpm");
		expect(info.scope).toBe("global");
	});

	it("refuses npx/bunx transient runs", () => {
		const info = classifyPiInstall({
			argv: ["/x"], path: "/home/u/.npm/_npx/abc/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
			pkgRoot: "/home/u/.npm/_npx/abc/node_modules/@earendil-works/pi-coding-agent", name: "@earendil-works/pi-coding-agent", version: "0.80.2",
		}, { _existsSync: () => false, _accessSync: () => {} });
		expect(info.method).toBe("npx");
		expect(info.updatable).toBe(false);
	});

	it("classifies a workspace/monorepo checkout as NOT auto-updatable (instruction)", () => {
		const info = classifyPiInstall(mk("/repo/node_modules/@earendil-works/pi-coding-agent"), {
			_existsSync: (p) => p === "/repo/package.json",
			_readFile: () => JSON.stringify({ workspaces: ["packages/*"] }),
			_accessSync: () => {},
		});
		expect(info.method).toBe("workspace");
		expect(info.installPrefix).toBe("/repo");
		expect(info.updatable).toBe(false);
		expect(info.manualAction).toMatch(/workspace dependency/i);
	});

	it("refuses a source/git checkout (pi outside node_modules)", () => {
		const info = classifyPiInstall({
			argv: ["/x"], path: "/clone/pi/dist/cli.js", pkgRoot: "/clone/pi", name: "@earendil-works/pi-coding-agent", version: "0.80.2",
		}, { _existsSync: (p) => p === "/clone/pi/.git", _accessSync: () => {} });
		expect(info.method).toBe("source");
		expect(info.updatable).toBe(false);
		expect(info.manualAction).toMatch(/git pull/);
	});
});
