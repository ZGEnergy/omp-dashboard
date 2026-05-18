/**
 * managed-package-whitelist.ts — single source of truth for "Electron-owned"
 * npm packages installed into `~/.pi-dashboard/node_modules/`.
 *
 * The Electron app bundles these packages in the offline cacache and is
 * responsible for installing, version-checking, reinstalling, and (during
 * force-reinstall) wiping them. Every package present in
 * `~/.pi-dashboard/node_modules/` that is NOT in this set is considered
 * user-owned (e.g. user manual `npm install`, `/api/pi-core/update` installs
 * of `pi-*` ecosystem packages) and SHALL be preserved by every reinstall /
 * force-reinstall code path.
 *
 * PARITY CONTRACT — this set MUST equal the `packages[].name` array in
 * `packages/electron/offline-packages.json`. A regression test
 * (`__tests__/managed-package-whitelist-parity.test.ts`) asserts this on
 * every test run. Adding a package to one side without the other will fail
 * the test.
 *
 * Out of scope (intentionally not in the whitelist):
 *   - The bundled Node runtime (`~/.pi-dashboard/node/`) — handled separately
 *     by `installManagedNode` with its own `.version` marker mechanism.
 *   - pi-core ecosystem packages installed via `/api/pi-core/update` — those
 *     are reconciled by the server's `pi-core-checker`/`pi-core-updater`.
 *   - Pi extensions/skills/themes via `DefaultPackageManager` — those live
 *     under pi's own management.
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */

export const ELECTRON_OWNED_PACKAGES: ReadonlySet<string> = new Set([
  "@earendil-works/pi-coding-agent",
  "@fission-ai/openspec",
  "tsx",
]);

/**
 * Type guard: is the given package name in the Electron-owned whitelist?
 *
 * Use this in classification code (e.g. `planSafeWipe`, preflight inventory)
 * instead of inline `.has()` calls so the intent is unambiguous at call sites.
 */
export function isElectronOwnedPackage(name: string): boolean {
  return ELECTRON_OWNED_PACKAGES.has(name);
}
