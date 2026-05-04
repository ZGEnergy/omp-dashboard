/**
 * Pure peer-presence probe.
 *
 * Extracted as a standalone module so the bridge entry's activation logic is
 * unit-testable without a running pi runtime. The probe is sync, side-effect
 * free, and deterministic given a `resolve` function.
 */

export const PEER_AM = "@pi/anthropic-messages";
export const PEER_FLOWS = "pi-flows";

export interface PeerProbe {
  ok: boolean;
  reason?: string;
}

export interface ProbeResult {
  am: PeerProbe;
  flows: PeerProbe;
  bothPresent: boolean;
}

export interface ProbeDeps {
  /** Synchronous module-spec resolver (typically `createRequire(...).resolve`). */
  resolve: (spec: string) => string;
  /** Optional pi-flows event-listener counter as a backup signal. */
  flowsListenerCount?: () => number;
}

function probePeer(spec: string, resolve: ProbeDeps["resolve"]): PeerProbe {
  try {
    resolve(spec);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Probe both peers. pi-flows is considered present if EITHER its module
 * resolves OR there is at least one active listener for the
 * `flow:register-agent-extension` event (covers cases where pi-flows is
 * loaded under a different module spec than the canonical "pi-flows").
 */
export function probeAll(deps: ProbeDeps): ProbeResult {
  const am = probePeer(PEER_AM, deps.resolve);
  const flowsModule = probePeer(PEER_FLOWS, deps.resolve);
  const flowsListener = (deps.flowsListenerCount?.() ?? 0) > 0;
  const flows: PeerProbe = flowsModule.ok || flowsListener
    ? { ok: true }
    : { ok: false, reason: flowsModule.reason ?? "pi-flows event listeners absent" };
  return { am, flows, bothPresent: am.ok && flows.ok };
}
