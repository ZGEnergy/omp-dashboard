/**
 * Universal back-arrow helper for shell overlays.
 *
 * Replaces the priority-chain `selectDesktopBackTarget` + the inline mobile
 * switch + the per-overlay `setXxx(null)` callbacks. With URL-driven
 * overlays, the browser history stack is the single source of truth, and
 * `window.history.back()` pops the previous URL — which may be the prior
 * session view, Settings, the landing page, etc.
 *
 * Cold-load fallback: when `window.history.length === 1` the user opened
 * this URL directly (deep link / hard refresh / new tab). `history.back()`
 * would be a silent no-op, so we fall back to `navigate("/")` to get a
 * predictable landing page.
 *
 * See change: overlay-url-routing.
 */

export function goBackOrHome(navigate: (to: string) => void): void {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate("/");
  }
}
