/**
 * Loading-page recovery contract test (Group 6 / loading-page-recovery spec).
 *
 * The recovery UI in `resources/loading.html` is implemented as an inline
 * `<script>` block — there's no module export to import. We avoid pulling
 * in jsdom for one test by using a regex-based smoke test that asserts the
 * static HTML wires the recovery contract:
 *   - elements with the expected ids exist
 *   - the script references the preload bridge methods we shipped in Group 5
 *   - the diagnosis state-machine helpers are present
 *
 * Behaviour-level coverage of the underlying libs (inventory probe,
 * planSafeWipe, force-reinstall) is in `preflight-reconcile.test.ts` and
 * `force-reinstall-safe-wipe.test.ts`. Renderer-side test would need jsdom;
 * deferred to E2E (Group 14).
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOADING_HTML = path.resolve(__dirname, "..", "..", "resources", "loading.html");

const html = readFileSync(LOADING_HTML, "utf-8");

describe("loading.html — recovery affordances markup", () => {
	it("contains the diagnosis div, reinstall button, and force-reinstall button", () => {
		expect(html).toMatch(/id="diagnosis"/);
		expect(html).toMatch(/id="reinstall-btn"/);
		expect(html).toMatch(/id="force-reinstall-btn"/);
		expect(html).toMatch(/id="advanced-panel"/);
	});

	it("keeps existing affordances (start, doctor, log panel, known-servers)", () => {
		expect(html).toMatch(/id="start-btn"/);
		expect(html).toMatch(/id="doctor-btn"/);
		expect(html).toMatch(/id="log-panel"/);
		expect(html).toMatch(/id="known-servers"/);
	});

	it("diagnosis and reinstall affordances default to hidden", () => {
		// Both ship with style="display:none;" so they don't flash before probe runs.
		expect(html).toMatch(/id="diagnosis"\s+style="display:none;"/);
		expect(html).toMatch(/id="reinstall-btn"\s+style="display:none;"/);
		expect(html).toMatch(/id="advanced-panel"\s+style="display:none;"/);
	});
});

describe("loading.html — script wires preload bridge", () => {
	it("calls api.checkManagedInventory during showError", () => {
		expect(html).toMatch(/api\.checkManagedInventory\s*\(\s*\)/);
		// And it's only invoked inside showError (after the probe gate, not on initial load).
		const showErrorBlock = html.match(/function showError\([\s\S]*?\n\s{6}\}/);
		expect(showErrorBlock).not.toBeNull();
		expect(showErrorBlock?.[0]).toMatch(/api\.checkManagedInventory/);
	});

	it("wires reinstall button to api.reinstallManaged", () => {
		expect(html).toMatch(/api\.reinstallManaged\s*\(\s*\)/);
		// Inside a click handler bound to reinstallBtn.
		expect(html).toMatch(/reinstallBtn\.addEventListener\(\s*"click"/);
	});

	it("wires force-reinstall button to api.forceReinstall", () => {
		expect(html).toMatch(/api\.forceReinstall\s*\(\s*\)/);
		expect(html).toMatch(/forceReinstallBtn\.addEventListener\(\s*"click"/);
	});

	it("subscribes to install progress via api.onInstallProgress", () => {
		expect(html).toMatch(/api\.onInstallProgress\s*\(/);
	});
});

describe("loading.html — diagnosis state machine", () => {
	it("defines applyDiagnosis helper", () => {
		expect(html).toMatch(/function applyDiagnosis\s*\(/);
	});

	it("defines formatFallbackDiagnosis fallback", () => {
		expect(html).toMatch(/function formatFallbackDiagnosis\s*\(/);
	});

	it("defines setReinstallBusy busy-state helper", () => {
		expect(html).toMatch(/function setReinstallBusy\s*\(/);
	});

	it("defines resumePolling to restart connection loop after reinstall", () => {
		expect(html).toMatch(/function resumePolling\s*\(/);
		// Must reset errorShown so the loading status re-appears.
		expect(html).toMatch(/errorShown\s*=\s*false/);
	});
});

describe("loading.html — visibility rules from spec", () => {
	it("Reinstall button shown only when missing or stale entries exist", () => {
		// Spec: "Button hidden when only corrupt"
		// Implementation: `hasFixable = (diff.missing||[]).length > 0 || (diff.stale||[]).length > 0`
		expect(html).toMatch(/hasFixable\s*=\s*\([^)]*missing[^)]*\)\.length\s*>\s*0\s*\|\|\s*\([^)]*stale[^)]*\)\.length\s*>\s*0/);
	});

	it("Advanced panel revealed when corrupt entries present", () => {
		// Spec: "Force reinstall available on corruption" — advanced panel opens.
		expect(html).toMatch(/hasCorrupt[\s\S]{0,120}advancedPanel\.style\.display\s*=\s*"block"/);
	});

	it("Advanced panel revealed after a failed reinstall attempt", () => {
		// Spec: "Force reinstall available after failed reinstall"
		expect(html).toMatch(/reinstallFailed/);
	});

	it("script parses as valid JavaScript", () => {
		const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
		expect(scriptMatch).not.toBeNull();
		expect(() => new Function(scriptMatch![1]!)).not.toThrow();
	});
});
