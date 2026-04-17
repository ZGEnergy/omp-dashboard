import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichRecommendedEntries } from "../lib/recommended-enricher.js";

// Minimal shape matching the RecommendedExtension interface; keeps this
// test independent from the real manifest so entries here stay stable
// even as the canonical 5-entry list evolves.
const FIXTURE = [
	{
		id: "pi-web-access",
		displayName: "pi-web-access",
		source: "npm:pi-web-access",
		status: "strongly-suggested" as const,
		fallbackDescription: "",
		unlocks: [] as string[],
	},
	{
		id: "pi-flows",
		displayName: "pi-flows",
		source: "git@github.com:BlackBeltTechnology/pi-flows.git",
		status: "optional" as const,
		fallbackDescription: "",
		unlocks: [] as string[],
	},
	{
		id: "pi-agent-browser",
		displayName: "pi-agent-browser",
		source: "npm:pi-agent-browser",
		status: "optional" as const,
		fallbackDescription: "",
		unlocks: [] as string[],
	},
];

describe("enrichRecommendedEntries", () => {
	let tmpHome: string;
	let origHome: string | undefined;

	beforeEach(() => {
		tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-enricher-"));
		origHome = process.env.HOME;
		process.env.HOME = tmpHome;
	});

	afterEach(() => {
		if (origHome !== undefined) process.env.HOME = origHome;
		else delete process.env.HOME;
		if (fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
	});

	it("returns entries untouched when pi is not installed (no ~/.pi/agent)", () => {
		const result = enrichRecommendedEntries(FIXTURE);
		expect(result).toHaveLength(3);
		for (const r of result) {
			expect(r.activeInPi).toBeUndefined();
			expect(r.installedGlobal).toBeUndefined();
		}
	});

	it("returns entries untouched when ~/.pi/agent exists but settings.json is missing", () => {
		fs.mkdirSync(path.join(tmpHome, ".pi", "agent"), { recursive: true });
		const result = enrichRecommendedEntries(FIXTURE);
		// pi IS installed (directory exists) but settings.json is absent →
		// enrichment proceeds with empty active list, all entries inactive.
		for (const r of result) {
			expect(r.activeInPi).toBe(false);
			expect(r.installedGlobal).toBe(false);
		}
	});

	it("flags entries present in ~/.pi/agent/settings.json as active", () => {
		const agentDir = path.join(tmpHome, ".pi", "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "settings.json"),
			JSON.stringify({
				packages: [
					"npm:pi-web-access",
					"git@github.com:BlackBeltTechnology/pi-flows.git",
				],
			}),
		);
		const result = enrichRecommendedEntries(FIXTURE);
		const byId = Object.fromEntries(result.map((r) => [r.id, r]));
		expect(byId["pi-web-access"].activeInPi).toBe(true);
		expect(byId["pi-flows"].activeInPi).toBe(true);
		expect(byId["pi-agent-browser"].activeInPi).toBe(false);
	});

	it("applies the cross-kind basename heuristic (local path vs git URL)", () => {
		const agentDir = path.join(tmpHome, ".pi", "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "settings.json"),
			JSON.stringify({ packages: ["../pi-flows"] }),
		);
		const result = enrichRecommendedEntries(FIXTURE);
		const flows = result.find((r) => r.id === "pi-flows")!;
		expect(flows.activeInPi).toBe(true);
	});

	it("does NOT read project-local .pi/settings.json (global-only scope)", () => {
		// Simulate a project-local settings.json elsewhere listing pi-flows.
		// The enricher must ignore it \u2014 first-launch wizard has no project CWD.
		const agentDir = path.join(tmpHome, ".pi", "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "settings.json"),
			JSON.stringify({ packages: [] }),
		);
		// Also create a project-local settings that WOULD match if we read it.
		const projectDir = path.join(tmpHome, "workspace");
		fs.mkdirSync(path.join(projectDir, ".pi"), { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: ["npm:pi-web-access"] }),
		);
		const result = enrichRecommendedEntries(FIXTURE);
		const pwa = result.find((r) => r.id === "pi-web-access")!;
		// Global is empty; local is ignored by design; entry stays inactive.
		expect(pwa.activeInPi).toBe(false);
	});

	it("handles malformed settings.json gracefully (no enrichment, no throw)", () => {
		const agentDir = path.join(tmpHome, ".pi", "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(path.join(agentDir, "settings.json"), "{ not valid json");
		const result = enrichRecommendedEntries(FIXTURE);
		for (const r of result) {
			expect(r.activeInPi).toBeUndefined();
			expect(r.installedGlobal).toBeUndefined();
		}
	});

	it("preserves all manifest fields on the enriched output", () => {
		fs.mkdirSync(path.join(tmpHome, ".pi", "agent"), { recursive: true });
		fs.writeFileSync(
			path.join(tmpHome, ".pi", "agent", "settings.json"),
			JSON.stringify({ packages: ["npm:pi-web-access"] }),
		);
		const result = enrichRecommendedEntries(FIXTURE);
		expect(result[0].id).toBe("pi-web-access");
		expect(result[0].displayName).toBe("pi-web-access");
		expect(result[0].source).toBe("npm:pi-web-access");
		expect(result[0].status).toBe("strongly-suggested");
	});
});
