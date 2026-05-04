/**
 * pi-flows · Anthropic Messages Bridge — pi extension bridge entry.
 *
 * Auto-registered at ~/.pi/agent/settings.json#dashboardPluginBridges
 * (key: dashboard-flows-anthropic-bridge) when the dashboard plugin is
 * enabled; auto-deregistered on disable.
 *
 * Behaviour:
 *   1. On activate, probe for two peers:
 *        - @pi/anthropic-messages (the rename/transform package)
 *        - pi-flows (the multi-agent orchestrator)
 *   2. If BOTH present → load @pi/anthropic-messages, run its default export
 *      against the main pi instance, AND emit `flow:register-agent-extension`
 *      so every spawned flow agent gets the same hooks.
 *   3. If either peer missing → stay in `waiting_peers`, re-probe on every
 *      `session_start` to catch late installs after `/reload`.
 *   4. Hooks are wired exactly once per pi process; subsequent re-probes
 *      only update the broadcasted status.
 *
 * The bridge does NOT reimplement any of @pi/anthropic-messages's transforms
 * — it is pure plumbing. If the package ships a fix, this plugin picks it up
 * via npm without code changes here.
 */
import { createRequire } from "node:module";
import { probeAll, type ProbeResult } from "../peer-probe.js";

type Status = "probing" | "waiting_peers" | "active" | "degraded";

interface BridgeStatusEvent {
  status: Status;
  peers: {
    "@pi/anthropic-messages": { ok: boolean; reason?: string };
    "pi-flows": { ok: boolean; reason?: string };
  };
  pid: number;
  at: number;
}

// Anchor module resolution at process.cwd() — matches the user's mental model
// (peers must be installed in the project pi was launched from).
const requireFromCwd = createRequire(`${process.cwd()}/_`);

export default async function activate(ctx: any): Promise<void> {
  const pi = ctx?.pi ?? ctx;
  const events = ctx?.events ?? pi?.events;

  let status: Status = "probing";
  let wired = false;
  let lastBroadcast = "";

  function broadcast(probe: ProbeResult): void {
    const payload: BridgeStatusEvent = {
      status,
      peers: {
        "@pi/anthropic-messages": probe.am,
        "pi-flows": probe.flows,
      },
      pid: process.pid,
      at: Date.now(),
    };
    const json = JSON.stringify(payload);
    if (json === lastBroadcast) return;
    lastBroadcast = json;
    try {
      events?.emit?.("flows-anthropic-bridge:status", payload);
    } catch {
      /* never throw from broadcast */
    }
  }

  function runProbe(): ProbeResult {
    return probeAll({
      resolve: (spec) => requireFromCwd.resolve(spec),
      flowsListenerCount: () =>
        typeof pi?.events?.listenerCount === "function"
          ? pi.events.listenerCount("flow:register-agent-extension")
          : 0,
    });
  }

  async function tryWire(): Promise<void> {
    if (wired) {
      // Defensive: if a peer disappeared post-wire, drop to "degraded".
      const probe = runProbe();
      if (!probe.bothPresent && status !== "degraded") {
        status = "degraded";
        broadcast(probe);
      }
      return;
    }
    const probe = runProbe();
    if (!probe.bothPresent) {
      status = "waiting_peers";
      broadcast(probe);
      return;
    }
    let mod: any;
    try {
      // Peer dependency, not a direct dep — TS can't see types here. Resolved
      // at runtime via probeAll() before we reach this line.
      // @ts-expect-error optional peer; resolved dynamically
      mod = await import("@pi/anthropic-messages");
    } catch (e) {
      // Resolve said yes, import said no — surface the import error and stay
      // waiting so a later /reload (with the package present) can complete.
      status = "waiting_peers";
      broadcast({
        ...probe,
        am: { ok: false, reason: `import failed: ${(e as Error).message}` },
      });
      return;
    }
    const piAnthropicMessages = mod.default;
    const isClaudeAnthropicMessages = mod.isClaudeAnthropicMessages;

    // 1. Main session.
    await piAnthropicMessages(pi);

    // 2. Every spawned flow agent.
    pi?.events?.emit?.("flow:register-agent-extension", {
      factory: async (agentPi: any) => {
        await piAnthropicMessages(agentPi);
        try {
          agentPi?.on?.("session_start", (_e: unknown, agentCtx: any) => {
            try {
              events?.emit?.("flows-anthropic-bridge:agent-active", {
                pid: process.pid,
                modelId: agentCtx?.model?.id,
                gateOpen: !!isClaudeAnthropicMessages?.(agentCtx),
              });
            } catch {
              /* never throw */
            }
          });
        } catch {
          /* agentPi.on not available — ignore */
        }
      },
    });

    wired = true;
    status = "active";
    broadcast(probe);
  }

  // Initial probe at activation time.
  await tryWire();

  // Re-probe on every session boundary. Cheap; covers late installs after
  // `/reload` and config changes that affect peer resolvability.
  try {
    pi?.on?.("session_start", () => {
      void tryWire();
    });
  } catch {
    /* pi.on not available — stop here, initial probe was the only chance */
  }
}
