/**
 * Family-test barrel — imports every family file for its registration
 * side-effects so `cube.test.ts` can sweep a fully-populated
 * REGISTERED_SCENARIOS map.
 *
 * Each family file registers at module top-level via `register(cell, tag)`.
 * When a new family file is added, import it here.
 */
import "./a-electron.test.js";
import "./b-npm-global.test.js";
import "./c-dev-monorepo.test.js";
import "./d-overrides.test.js";
import "./e-stale-partial.test.js";
import "./f-cwd-variants.test.js";
import "./g-windows-specifics.test.js";
import "./h-home-drift.test.js";
import "./i-malformed-settings.test.js";
import "./j-path-gui-minimal.test.js";
import "./k-dashboard-absent.test.js";
