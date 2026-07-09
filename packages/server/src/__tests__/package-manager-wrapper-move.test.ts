import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PackageManagerWrapper } from "../package-manager-wrapper.js";
import type { SubprocessAdapter } from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** Override os.homedir() by setting the env vars libuv reads. */
function withFakeHome(tmpHome: string): () => void {
	const prev = {
		HOME: process.env.HOME,
		USERPROFILE: process.env.USERPROFILE,
	};
	process.env.HOME = tmpHome;
	process.env.USERPROFILE = tmpHome;
	return () => {
		if (prev.HOME === undefined) delete process.env.HOME;
		else process.env.HOME = prev.HOME;
		if (prev.USERPROFILE === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = prev.USERPROFILE;
	};
}

const noopAdapter: SubprocessAdapter = {
	spawn() { throw new Error("not implemented in noop adapter"); },
	spawnSync<T extends string | Buffer = Buffer>() {
		return { pid: -1, output: [], stdout: "" as unknown as T, stderr: "" as unknown as T, status: 0, signal: null, error: undefined };
	},
};

describe("PackageManagerWrapper.move()", () => {
	let wrapper: PackageManagerWrapper;
	let tmpHome: string;
	let pluginsDir: string;
	let cleanupHome: (() => void) | undefined;

	beforeEach(() => {
		tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pmw-move-omp-"));
		pluginsDir = path.join(tmpHome, ".omp", "plugins");
		fs.mkdirSync(pluginsDir, { recursive: true });
		fs.writeFileSync(
			path.join(pluginsDir, "package.json"),
			JSON.stringify({ name: "omp-plugins", private: true, dependencies: {} }, null, 2) + "\n",
			"utf-8",
		);
		fs.writeFileSync(
			path.join(pluginsDir, "omp-plugins.lock.json"),
			JSON.stringify({ plugins: {} }, null, 2) + "\n",
			"utf-8",
		);
		cleanupHome = withFakeHome(tmpHome);
		vi.resetModules();
	});

	afterEach(() => {
		cleanupHome?.();
		cleanupHome = undefined;
		try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
		vi.restoreAllMocks();
	});

	async function createWrapper(): Promise<PackageManagerWrapper> {
		const mod = await import("../package-manager-wrapper.js");
		return new mod.PackageManagerWrapper(noopAdapter);
	}

	// ── Synchronous validation throws ──────────────────────────────────────

	it("throws InvalidMoveRequestError when fromScope === toScope", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "npm:foo",
				fromScope: "global",
				toScope: "global",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	it("throws InvalidMoveRequestError when moving global to local", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "npm:foo",
				fromScope: "global",
				toScope: "local",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	it("throws InvalidMoveRequestError when moving local to global", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "npm:foo",
				fromScope: "local",
				toScope: "global",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	it("rejects with clear message mentioning OMP global-only model", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "npm:pi-flows",
				fromScope: "global",
				toScope: "local",
				toCwd: "/proj",
			}),
		).rejects.toThrow(/not supported in Oh My Pi/i);
	});

	it("throws PackageOperationBusyError when busy", async () => {
		wrapper = await createWrapper();

		// Start an install to make the wrapper busy; do NOT await —
		// the operation must stay in flight when move() checks busy.
		const installPromise = wrapper.run({ action: "install", source: "npm:a", scope: "global" });

		// move should fail while busy
		await expect(
			wrapper.move({
				entry: "npm:foo",
				fromScope: "global",
				toScope: "local",
			}),
		).rejects.toThrow(/already in progress/);

		await installPromise; // cleanup
	});

	// ── Path source moves also rejected ────────────────────────────────────

	it("rejects path source move from local to global", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "..",
				fromScope: "local",
				fromCwd: "/proj",
				toScope: "global",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	it("rejects path source move from global to local", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: "/abs/path",
				fromScope: "global",
				toScope: "local",
				toCwd: "/proj",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	// ── Filter object entries also rejected ────────────────────────────────

	it("rejects object entry with filters", async () => {
		wrapper = await createWrapper();
		await expect(
			wrapper.move({
				entry: { source: "npm:pi-flows", extensions: ["a.ts"] },
				fromScope: "global",
				toScope: "local",
				toCwd: "/proj",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));
	});

	// ── Completion listener receives the error ─────────────────────────────

	it("emits completion with success=false on move rejection", async () => {
		wrapper = await createWrapper();

		// move() throws directly, not via the async executeOperation path.
		// The completion listener is NOT called for move rejections because
		// move() throws before any operation is dispatched.
		await expect(
			wrapper.move({
				entry: "npm:pi-flows",
				fromScope: "global",
				toScope: "local",
			}),
	).rejects.toThrow(expect.objectContaining({ name: "InvalidMoveRequestError" }));

		// Wrapper should NOT be busy after a synchronous rejection
		expect(wrapper.isBusy()).toBe(false);
	});
});
