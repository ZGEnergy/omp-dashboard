import { describe, it, expect } from "vitest";
import {
	BUNDLED_EXTENSION_IDS,
	RECOMMENDED_EXTENSIONS,
	getRecommendedExtension,
	getRecommendedByStatus,
	type RecommendedExtension,
} from "../recommended-extensions.js";

describe("RECOMMENDED_EXTENSIONS manifest", () => {
	it("contains exactly the six expected entries", () => {
		const ids = RECOMMENDED_EXTENSIONS.map((e) => e.id).sort();
		expect(ids).toEqual(
			[
				"pi-anthropic-messages",
				"pi-agent-browser",
				"pi-flows",
				"pi-memory-honcho",
				"pi-web-access",
				"tintinweb-pi-subagents",
			].sort(),
		);
	});

	it("every entry has the required shape", () => {
		for (const entry of RECOMMENDED_EXTENSIONS) {
			expect(typeof entry.id).toBe("string");
			expect(entry.id.length).toBeGreaterThan(0);
			expect(typeof entry.source).toBe("string");
			expect(entry.source.length).toBeGreaterThan(0);
			expect(typeof entry.displayName).toBe("string");
			expect(typeof entry.fallbackDescription).toBe("string");
			expect(entry.fallbackDescription.length).toBeGreaterThan(10);
			expect(["required", "strongly-suggested", "optional"]).toContain(entry.status);
			expect(Array.isArray(entry.unlocks)).toBe(true);
			expect(entry.unlocks.length).toBeGreaterThan(0);
		}
	});

	it("pi-anthropic-messages is marked required, npm-sourced, with git bundleSource", () => {
		const entry = getRecommendedExtension("pi-anthropic-messages");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("required");
		expect(entry?.source).toBe("npm:@blackbelt-technology/pi-anthropic-messages");
		expect(entry?.bundleSource).toBe(
			"https://github.com/BlackBeltTechnology/pi-anthropic-messages.git",
		);
		expect(entry?.autowired).toBe(true);
	});

	it("pi-flows is npm-sourced with git bundleSource and registers flow-engine tools", () => {
		const entry = getRecommendedExtension("pi-flows");
		expect(entry).toBeDefined();
		expect(entry?.source).toBe("npm:@blackbelt-technology/pi-flows");
		expect(entry?.bundleSource).toBe(
			"https://github.com/BlackBeltTechnology/pi-flows.git",
		);
		expect(entry?.toolsRegistered).toContain("subagent");
		expect(entry?.toolsRegistered).toContain("flow_write");
	});

	it("tintinweb-pi-subagents registers Agent under its canonical capitalization", () => {
		const entry = getRecommendedExtension("tintinweb-pi-subagents");
		expect(entry).toBeDefined();
		expect(entry?.source).toBe("npm:@tintinweb/pi-subagents");
		expect(entry?.toolsRegistered).toContain("Agent");
	});

	it("every entry is now npm-sourced (post npm-publish migration)", () => {
		const npmEntries = RECOMMENDED_EXTENSIONS.filter((e) => e.source.startsWith("npm:"));
		expect(npmEntries.map((e) => e.id).sort()).toEqual(
			[
				"pi-agent-browser",
				"pi-anthropic-messages",
				"pi-flows",
				"pi-memory-honcho",
				"pi-web-access",
				"tintinweb-pi-subagents",
			].sort(),
		);
	});

	it("bundleSource (when present) is an HTTPS .git URL", () => {
		const withBundle = RECOMMENDED_EXTENSIONS.filter((e) => e.bundleSource);
		for (const entry of withBundle) {
			expect(entry.bundleSource).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/);
		}
		expect(withBundle.map((e) => e.id).sort()).toEqual(
			["pi-anthropic-messages", "pi-flows"].sort(),
		);
	});
});

describe("getRecommendedExtension", () => {
	it("returns the entry when id matches", () => {
		const e = getRecommendedExtension("pi-web-access");
		expect(e?.displayName).toBe("pi-web-access");
	});

	it("returns undefined for unknown ids", () => {
		expect(getRecommendedExtension("does-not-exist")).toBeUndefined();
	});
});

describe("getRecommendedByStatus", () => {
	it("filters by required", () => {
		const required = getRecommendedByStatus("required");
		expect(required.map((e) => e.id)).toEqual(["pi-anthropic-messages"]);
	});

	it("filters by strongly-suggested", () => {
		const suggested = getRecommendedByStatus("strongly-suggested");
		expect(suggested.map((e) => e.id).sort()).toEqual(
			["pi-flows", "pi-web-access", "tintinweb-pi-subagents"].sort(),
		);
	});

	it("filters by optional", () => {
		const optional = getRecommendedByStatus("optional");
		expect(optional.map((e) => e.id).sort()).toEqual(
			["pi-agent-browser", "pi-memory-honcho"].sort(),
		);
	});
});

describe("RecommendedExtension type", () => {
	it("accepts a minimal entry", () => {
		const entry: RecommendedExtension = {
			id: "x",
			source: "npm:x",
			displayName: "X",
			fallbackDescription: "A test extension description.",
			status: "optional",
			unlocks: ["something"],
		};
		expect(entry.id).toBe("x");
	});
});

// ── BUNDLED_EXTENSION_IDS manifest (task 2 of bundle-first-party-extensions) ──

describe("BUNDLED_EXTENSION_IDS manifest", () => {
	it("contains both first-party extensions after npm-publish migration", () => {
		expect([...BUNDLED_EXTENSION_IDS].sort()).toEqual(
			["pi-anthropic-messages", "pi-flows"].sort(),
		);
	});

	it("every bundled id appears in RECOMMENDED_EXTENSIONS", () => {
		const recommendedIds = new Set(RECOMMENDED_EXTENSIONS.map((e) => e.id));
		for (const id of BUNDLED_EXTENSION_IDS) {
			expect(recommendedIds.has(id)).toBe(true);
		}
	});

	it("every bundled id resolves to a git-based effective source", () => {
		// Effective source = bundleSource ?? source. Bundling is git-only.
		for (const id of BUNDLED_EXTENSION_IDS) {
			const entry = RECOMMENDED_EXTENSIONS.find((e) => e.id === id);
			expect(entry, `RECOMMENDED_EXTENSIONS missing entry for ${id}`).toBeDefined();
			const effective = entry!.bundleSource ?? entry!.source;
			const isGit =
				effective.endsWith(".git") ||
				effective.startsWith("git@") ||
				effective.startsWith("git:") ||
				/^https?:\/\/.+\/.+/.test(effective);
			expect(isGit, `${id} effective source is not git-based: ${effective}`).toBe(true);
			expect(effective.startsWith("npm:"), `${id} effective source must not be npm`).toBe(false);
		}
	});
});
