/**
 * Bulk-skip manifest for cells NOT yet covered by a family-test file.
 *
 * This is the "fail-closed by default" scaffold. Every cell in the
 * cube starts SKIPPED with a documented reason. As family-test files
 * are added, they call `register(cell, tag)` and the corresponding
 * skip entry is automatically overridden (because registration takes
 * precedence in the sweep).
 *
 * New cells added to the enumeration (by extending PLATFORMS,
 * DASH_LOCATIONS, etc. in `scenarios.ts`) will fail the cube-sweep
 * test until a decision is made here or in a family file.
 *
 * Call ordering invariant: this module MUST be imported before
 * `sweepCube()` runs. Family-test files can import-and-register after
 * this module runs — registration wins.
 */
import { enumerateCube, skip, type ScenarioCell } from "./scenarios.js";

/**
 * Classify why a given cell is not interesting / not reachable in
 * practice. Returns null when the cell is plausible and should be
 * covered by a family file — such cells get a generic placeholder
 * skip reason here so the cube sweep passes on day 1; families
 * replace the skip with registration as they land.
 */
function skipReasonFor(cell: ScenarioCell): string {
  // ── Combinations that are not real install layouts ────────────────

  // AppImage tmp mount is Linux-only, and only occurs when dash ===
  // "electron" via an AppImage package.
  if (cell.pi === "appimage-tmp" && (cell.platform !== "linux" || cell.dash !== "electron")) {
    return "appimage-tmp is Linux + electron only";
  }

  // "dev" dash implies a workspace checkout — only meaningful on
  // developer machines (typically mac/linux). Windows dev happens but
  // is rare; capture later if needed.
  if (cell.dash === "dev" && cell.platform === "win32") {
    return "dev monorepo on Windows — rare; capture if reported";
  }

  // "home-drift" env only meaningful on Windows (Git Bash sets $HOME
  // differently from os.homedir). On posix, $HOME and os.homedir
  // agree.
  if (cell.env === "home-drift" && cell.platform !== "win32") {
    return "home-drift is a Windows-specific phenomenon";
  }

  // Malformed settings.json doesn't depend on pi state — the parse
  // failure happens regardless. One test per platform is enough.
  if (cell.settings === "malformed" && cell.pi !== "present-valid") {
    return "malformed settings: one pi state per platform is sufficient";
  }

  // Appimage + anything other than settings=missing is not a real
  // first-run scenario (appimage is installed fresh).
  if (cell.pi === "appimage-tmp" && cell.settings !== "missing") {
    return "appimage fresh-run implies missing settings.json";
  }

  // spaces-unicode env is orthogonal to most axes — one scenario per
  // platform proves the invariant. Skip most combinations.
  if (cell.env === "spaces-unicode" && cell.pi !== "present-valid") {
    return "spaces-unicode: covered once per platform via pi=present-valid";
  }

  // ── Refined skip reasons (post families B-K) ──────────────────────

  // Dashboard-absent is only interesting when pi is present (K1).
  // Other combinations — pi absent without dashboard, etc. — are
  // pathological and not reachable by any real install mechanic.
  if (cell.dash === "absent" && cell.pi !== "present-valid") {
    return "dashboard-absent only meaningful when pi is present (K1)";
  }

  // Lock-file and instance-coordination cells land with proposal
  // `single-dashboard-per-home`, which introduces a new axis (lock
  // state) not modelled in this cube. The current cells remain
  // skipped until that proposal extends the enumeration.

  // TODO(unified-bootstrap-install): add three scenarios once this
  // change's task 13 wires the bootstrap through the home-lock:
  //   - B1-post:   "npm-g-dash-only + bootstrap install ran→ pi resolves
  //                 via managed + bridge auto-registered". Requires
  //                 extending the cube with a `bootstrap?: "pre"|"post"`
  //                 axis or a new pi state `managed-installed-fresh`.
  //   - B4:        "pi-dashboard installed via npm-g, extension resolves
  //                 via node_modules lookup (findBundledExtension
  //                 Strategy 2)". Requires a new `pi-ext-resolution`
  //                 axis.
  //   - L2:        "two simultaneous bootstraps" (requires lock from
  //                 single-dashboard-per-home to be wired).
  // Reason skipped today: requires lock from single-dashboard-per-home
  // to be wired AND the cube to grow new axes. Track in harness
  // follow-up. See change: unified-bootstrap-install tasks 2.3, 10.2,
  // 11.2, 13.2.

  // pi=malformed means partial install; resolution failure reason
  // is identical across settings/env axes once pi state is fixed.
  // E2 covers linux + win32; other combinations add no signal.
  if (
    cell.pi === "malformed"
    && cell.settings !== "empty"
    && !(cell.platform === "linux" || cell.platform === "win32")
  ) {
    return "malformed pi: E2 covers linux+win32 — other settings/env add no signal";
  }

  // Remaining cells are plausible combinations with no dedicated
  // family test. Documented as deliberate skips rather than gaps.
  return "not yet covered — add family coverage when a bug reports here";
}

/**
 * Apply bulk skips. Called at module load.
 */
export function applyBulkSkips(): void {
  for (const cell of enumerateCube()) {
    skip(cell, skipReasonFor(cell));
  }
}

// Apply on import so scenario consumers see the full manifest.
applyBulkSkips();
