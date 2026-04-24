import { describe, it, expect } from "vitest";
import { isSameOriginUrl } from "../lib/link-handling.js";

describe("isSameOriginUrl", () => {
	const origin = "http://localhost:8000";

	it("returns true for a same-origin absolute URL", () => {
		expect(isSameOriginUrl("http://localhost:8000/settings", origin)).toBe(true);
	});

	it("returns true for the auth-login redirect style URL", () => {
		// Mirrors App.tsx:673 — /auth/login?return=/ resolved against server origin
		expect(isSameOriginUrl("http://localhost:8000/auth/login?return=/", origin)).toBe(true);
	});

	it("returns true for a relative path", () => {
		expect(isSameOriginUrl("/settings", origin)).toBe(true);
	});

	it("returns true for a relative path with query and fragment", () => {
		expect(isSameOriginUrl("/auth/login?return=/#top", origin)).toBe(true);
	});

	it("returns true for a fragment-only href", () => {
		expect(isSameOriginUrl("#section", origin)).toBe(true);
	});

	it("returns false for a different-origin https URL", () => {
		expect(isSameOriginUrl("https://example.com", origin)).toBe(false);
	});

	it("returns false for a different-scheme URL against http origin", () => {
		expect(isSameOriginUrl("https://localhost:8000/", origin)).toBe(false);
	});

	it("returns false for a different port", () => {
		expect(isSameOriginUrl("http://localhost:9000/", origin)).toBe(false);
	});

	it("returns false for different host even if port matches", () => {
		expect(isSameOriginUrl("http://127.0.0.1:8000/", origin)).toBe(false);
	});

	it("returns false for a javascript: URL", () => {
		// Parses with origin "null" — not same-origin — so caller routes it
		// through shell.openExternal, which Electron refuses by default.
		expect(isSameOriginUrl("javascript:alert(1)", origin)).toBe(false);
	});

	it("returns false for a mailto: URL", () => {
		expect(isSameOriginUrl("mailto:foo@example.com", origin)).toBe(false);
	});

	it("returns false for a malformed URL", () => {
		expect(isSameOriginUrl("http:///", origin)).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(isSameOriginUrl("", origin)).toBe(false);
	});

	it("returns true for a same-origin URL with implicit default port", () => {
		// https://example.com on https origin → both normalize to port 443
		expect(isSameOriginUrl("https://example.com/foo", "https://example.com")).toBe(true);
	});

	it("returns false when the server origin itself is malformed", () => {
		// Defensive: if the caller passes a broken origin we should not crash
		// and should not treat anything as same-origin.
		expect(isSameOriginUrl("http://localhost:8000/", "not a url")).toBe(false);
	});
});
