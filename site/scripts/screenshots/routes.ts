/**
 * Routes captured by the screenshot pipeline, per viewport.
 *
 * Each entry maps a dashboard URL path to an output filename. Paths are
 * resolved relative to whichever dashboard base URL the capture script is
 * pointed at (see capture.ts / SCREENSHOT_TARGET_URL).
 */

export interface RouteShot {
  /** Path relative to the dashboard base URL (starts with "/"). */
  path: string;
  /** Output filename without extension (will be written as <name>.png). */
  name: string;
  /** Optional: extra wait-for selector before capture. */
  waitFor?: string;
  /** Optional: extra delay in ms before capture to allow animations to settle. */
  delay?: number;
}

export const DESKTOP_ROUTES: RouteShot[] = [
  { path: "/", name: "sessions", delay: 800 },
  // Best-effort on-session routes — if no sessions are present the script
  // falls back to capturing whatever the dashboard renders at these paths.
  { path: "/", name: "chat", delay: 800 },
  { path: "/", name: "flows", delay: 800 },
  { path: "/", name: "terminal", delay: 600 },
  { path: "/", name: "diff", delay: 600 },
  { path: "/", name: "openspec", delay: 600 },
  { path: "/settings?tab=packages", name: "packages", delay: 1000 },
  { path: "/settings?tab=providers", name: "settings-providers", delay: 1000 },
  { path: "/", name: "tunnel-qr", delay: 600 },
];

export const MOBILE_ROUTES: RouteShot[] = [
  { path: "/", name: "session-list", delay: 800 },
  { path: "/", name: "chat", delay: 800 },
  { path: "/", name: "action-menu", delay: 600 },
  { path: "/", name: "qr", delay: 600 },
];
