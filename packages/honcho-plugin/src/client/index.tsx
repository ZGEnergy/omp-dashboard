/**
 * Honcho plugin client entry.
 *
 * Exports four slot contributions:
 *   HonchoSettings       → settings-section (tab=general)
 *   HonchoBadge          → session-card-memory
 *   HonchoCardActions    → session-card-memory
 *   HonchoMapPopover     → anchored-popover
 *
 * Also exports a `shouldRender` predicate consumed at manifest level so the
 * host's MEMORY subcard wrapper hides cleanly when the pi-memory-honcho
 * extension is not installed.
 *
 * See change: auto-hide-empty-session-subcards.
 */
export { HonchoSettings } from "./HonchoSettings.js";
export { HonchoBadge } from "./HonchoBadge.js";
export { HonchoCardActions } from "./HonchoCardActions.js";
export { HonchoMapPopover } from "./HonchoMapPopover.js";
export { shouldRenderHonchoMemory } from "./shouldRender.js";
