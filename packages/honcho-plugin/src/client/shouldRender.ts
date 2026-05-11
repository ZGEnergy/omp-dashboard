/**
 * Manifest-level `shouldRender` callback for honcho's `session-card-memory`
 * claims (`HonchoBadge`, `HonchoCardActions`).
 *
 * Returns `false` when the `pi-memory-honcho` pi extension is not installed,
 * so the host's `MemorySubcard` wrapper hides cleanly instead of rendering an
 * empty translucent panel with the MEMORY capsule legend.
 *
 * Must be synchronous (manifest-level `shouldRender` contract). Reads from the
 * sync cache populated by `useExtensionInstalled` / `primeExtensionInstalledCache`
 * in `./hooks.js`. Default is `false` (closed-by-default) until the first probe
 * completes — prevents the wrapper from flickering visible-then-hidden on cold
 * boot.
 *
 * See change: auto-hide-empty-session-subcards.
 */
import { getHonchoExtensionInstalledSync } from "./hooks.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function shouldRenderHonchoMemory(_session: unknown): boolean {
  return getHonchoExtensionInstalledSync();
}
