/**
 * `flipHasUI(ctx)` — flip `ctx.hasUI` to `true` on the live pi extension
 * context after the bridge has installed PromptBus wrappers on `ctx.ui.*`.
 *
 * Rationale: extensions (`context-mode`, `pi-agent-browser`, …) branch on
 * `ctx.hasUI` to decide whether to call `ctx.ui.notify`, render dialogs, or
 * short-circuit interactive flows. The bridge already provides a working UI
 * surface via PromptBus over the patched `ctx.ui.*` methods, so `ctx.hasUI`
 * MUST reflect that reality.
 *
 * Contract:
 *   - Makes the live `ctx.hasUI` read `true`.
 *   - Caller MUST have captured the original `ctx.hasUI` into its own state
 *     BEFORE invoking this helper, since `source-detector.detectSessionSource`
 *     depends on the pi-supplied original value.
 *   - pi <0.80 exposed `hasUI` as a writable data property, so a direct
 *     assignment sufficed. pi >=0.80 exposes it as a getter-only own accessor
 *     (`get hasUI()` in the extension-runner context object), so assignment
 *     throws `TypeError: Cannot set property hasUI ... which has only a getter`.
 *     Since that accessor is `configurable`, we redefine the descriptor via
 *     `Object.defineProperty` instead. See change:
 *     fix-bridge-hasui-getter-redefine.
 *   - A truly non-configurable / frozen `ctx.hasUI` still degrades gracefully:
 *     a single `[dashboard] failed to flip ctx.hasUI` warning, no throw.
 *   - `null` / `undefined` ctx is a silent no-op (defensive).
 *
 * Spec: openspec/changes/fix-bridge-hasui-for-headless-rpc/
 *       specs/bridge-extension/spec.md
 */
export function flipHasUI(ctx: { hasUI?: boolean } | null | undefined): void {
  if (ctx == null) return;
  const desc = Object.getOwnPropertyDescriptor(ctx, "hasUI");
  // Fast path: absent or writable data property (pi <0.80) — plain assignment
  // keeps the descriptor shape untouched.
  if (!desc || desc.writable === true) {
    try {
      (ctx as { hasUI: boolean }).hasUI = true;
    } catch (err) {
      console.warn("[dashboard] failed to flip ctx.hasUI", err);
    }
    return;
  }
  // Getter-only accessor or read-only data property (pi >=0.80): assignment
  // would throw, so replace the descriptor. Non-configurable / frozen props
  // make defineProperty throw — caught below and degraded to a warning.
  try {
    Object.defineProperty(ctx, "hasUI", {
      value: true,
      writable: true,
      configurable: true,
      enumerable: desc.enumerable ?? true,
    });
  } catch (err) {
    console.warn("[dashboard] failed to flip ctx.hasUI", err);
  }
}
