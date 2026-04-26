/**
 * One slot consumer component per slot id.
 *
 * Each consumer:
 * 1. Reads the slot registry via PluginContextProvider.
 * 2. Filters claims for its slot id (and any additional prop-based filter).
 * 3. Renders each contribution wrapped in a per-claim SlotErrorBoundary
 *    and a CurrentPluginLayer (so plugin hooks work correctly).
 * 4. Renders nothing when zero claims match.
 */
import React from "react";
import { useSlotRegistryOrNull, CurrentPluginLayer } from "./plugin-context.js";
import { forSession, forFolder, forTab, forToolName } from "./slot-registry.js";
import { SlotErrorBoundary } from "./slot-error-boundary.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { FolderDescriptor } from "./slot-registry.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderClaim(
  claim: { pluginId: string; Component?: React.ComponentType<Record<string, unknown>> },
  slotId: string,
  props: Record<string, unknown>,
) {
  if (!claim.Component) return null;
  const Comp = claim.Component;
  return (
    <SlotErrorBoundary key={`${claim.pluginId}:${slotId}`} pluginId={claim.pluginId} slotId={slotId}>
      <CurrentPluginLayer pluginId={claim.pluginId}>
        <Comp {...props} />
      </CurrentPluginLayer>
    </SlotErrorBoundary>
  );
}

// ── Slot consumers ────────────────────────────────────────────────────────────

export function SidebarFolderSectionSlot({ folder }: { folder: FolderDescriptor }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forFolder(registry.getClaims("sidebar-folder-section"), folder);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "sidebar-folder-section", { folder }),
      )}
    </>
  );
}

export function SessionCardBadgeSlot({ session }: { session: DashboardSession }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forSession(registry.getClaims("session-card-badge"), session);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "session-card-badge", { session }),
      )}
    </>
  );
}

export function SessionCardActionBarSlot({ session }: { session: DashboardSession }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forSession(registry.getClaims("session-card-action-bar"), session);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "session-card-action-bar", { session }),
      )}
    </>
  );
}

export function ContentViewSlot({
  session,
  routeParams,
  onClose,
}: {
  session: DashboardSession;
  routeParams: Record<string, string>;
  onClose: () => void;
}) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = registry.getClaims("content-view");
  if (!claims.length) return null;
  // one-active: render only the first matching claim
  const claim = claims[0];
  return renderClaim(claim as Parameters<typeof renderClaim>[0], "content-view", {
    session,
    routeParams,
    onClose,
  });
}

export function ContentHeaderStickySlot({ session }: { session: DashboardSession }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forSession(registry.getClaims("content-header-sticky"), session);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "content-header-sticky", { session }),
      )}
    </>
  );
}

export function ContentInlineFooterSlot({ session }: { session: DashboardSession }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forSession(registry.getClaims("content-inline-footer"), session);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "content-inline-footer", { session }),
      )}
    </>
  );
}

export function AnchoredPopoverSlot({
  anchorEl,
  onDismiss,
}: {
  anchorEl: HTMLElement;
  onDismiss: () => void;
}) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = registry.getClaims("anchored-popover");
  if (!claims.length) return null;
  // one-at-a-time: render the first claim only
  const claim = claims[0];
  return renderClaim(claim as Parameters<typeof renderClaim>[0], "anchored-popover", {
    anchorEl,
    onDismiss,
  });
}

export function CommandRouteSlot({
  command,
  session,
  routeParams,
  onClose,
}: {
  command: string;
  session: DashboardSession;
  routeParams: Record<string, string>;
  onClose: () => void;
}) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const allClaims = registry.getClaims("command-route");
  const claims = allClaims.filter(c => c.command === command);
  if (!claims.length) return null;
  const claim = claims[0];
  return renderClaim(claim as Parameters<typeof renderClaim>[0], "command-route", {
    session,
    routeParams,
    onClose,
  });
}

export function SettingsSectionSlot({ tab = "general" }: { tab?: string }) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forTab(registry.getClaims("settings-section"), tab);
  if (!claims.length) return null;
  return (
    <>
      {claims.map(c =>
        renderClaim(c as Parameters<typeof renderClaim>[0], "settings-section", {}),
      )}
    </>
  );
}

export function ToolRendererSlot({
  toolName,
  toolInput,
  sessionId,
  FallbackComponent,
}: {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  FallbackComponent?: React.ComponentType<{
    toolName: string;
    toolInput: Record<string, unknown>;
    sessionId: string;
  }>;
}) {
  const registry = useSlotRegistryOrNull();
  if (!registry) return null;
  const claims = forToolName(registry.getClaims("tool-renderer"), toolName);
  if (!claims.length) {
    return FallbackComponent ? (
      <FallbackComponent toolName={toolName} toolInput={toolInput} sessionId={sessionId} />
    ) : null;
  }
  const claim = claims[0];
  return renderClaim(claim as Parameters<typeof renderClaim>[0], "tool-renderer", {
    toolName,
    toolInput,
    sessionId,
  });
}
