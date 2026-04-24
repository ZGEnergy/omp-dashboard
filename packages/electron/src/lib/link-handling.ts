/**
 * Pure link-handling helpers used by the Electron shell to keep external
 * URL clicks from stranding the user on a page outside the dashboard.
 *
 * This module intentionally imports NOTHING from electron so it can be
 * unit-tested in isolation. The shell wiring in `main.ts` is the only
 * code that ties these decisions to `shell.openExternal` /
 * `setWindowOpenHandler` / `will-navigate`.
 *
 * See issue #13 and change: harden-external-link-handling.
 */

/**
 * Returns true when `href` resolves to the same origin as `serverOrigin`.
 *
 * Handles:
 *   - Absolute URLs with matching origin → true
 *   - Absolute URLs with different origin → false
 *   - Relative paths (`/settings`) → true (resolved against serverOrigin)
 *   - Fragment-only hrefs (`#top`) → true
 *   - Malformed hrefs or broken serverOrigin → false (caller treats as
 *     external and routes through shell.openExternal, which itself filters
 *     by scheme).
 *   - `javascript:` / `mailto:` / `data:` etc. → origin is "null", so
 *     these are classified as external. shell.openExternal refuses
 *     `javascript:` by default.
 */
export function isSameOriginUrl(href: string, serverOrigin: string): boolean {
	if (!href) return false;
	let serverOriginParsed: string;
	try {
		serverOriginParsed = new URL(serverOrigin).origin;
	} catch {
		return false;
	}
	try {
		const resolved = new URL(href, serverOrigin);
		return resolved.origin === serverOriginParsed;
	} catch {
		return false;
	}
}
