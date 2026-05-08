/**
 * Shared helpers for Phase-2 decorator slot components.
 *
 * Decorators live on `DashboardSession.uiDecorators` keyed by
 * `${kind}:${namespace}:${id}`. Slots filter by `kind` and (where relevant)
 * by a payload field (`agentId`, `flowId`).
 *
 * See change: add-extension-ui-decorations.
 */
import type { DecoratorDescriptor, DecoratorKind } from "@blackbelt-technology/pi-dashboard-shared/types.js";

/** Type narrowing: extract descriptors of a specific kind from a record. */
export function decoratorsOfKind<K extends DecoratorKind>(
  decorators: Record<string, DecoratorDescriptor> | undefined,
  kind: K,
): Array<Extract<DecoratorDescriptor, { kind: K }>> {
  if (!decorators) return [];
  const out: Array<Extract<DecoratorDescriptor, { kind: K }>> = [];
  for (const d of Object.values(decorators)) {
    if (d.kind === kind) out.push(d as Extract<DecoratorDescriptor, { kind: K }>);
  }
  return out;
}
