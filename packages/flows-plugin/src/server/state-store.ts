/**
 * Per-session flow state holder on the server.
 *
 * Holds Map<sessionId, FlowsSessionServerState>. Subscribes (TODO 17.3)
 * to event broadcasts and applies the pure reducer from flow-reducer.ts.
 *
 * See change: adopt-server-driven-intent-rendering.
 */
import type { FlowState, FlowInfo, CommandInfo, DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { isFlowEvent, reduceFlowEvent } from "../flow-reducer.js";

export interface FlowsSessionServerState {
  /** Available flows for this session (from pi-flows extension). */
  flows: FlowInfo[];
  /** Available commands for this session. */
  commands: CommandInfo[];
  /** Current flow state derived from event stream. Null when no flow active. */
  flowState?: FlowState | null;
}

class StateStore {
  private map = new Map<string, FlowsSessionServerState>();

  /** Initialize state for a session if it doesn't exist. */
  ensure(sessionId: string): FlowsSessionServerState {
    let s = this.map.get(sessionId);
    if (!s) {
      s = { flows: [], commands: [] };
      this.map.set(sessionId, s);
    }
    return s;
  }

  getState(sessionId: string): FlowsSessionServerState | undefined {
    return this.map.get(sessionId);
  }

  /** Apply an event from pi (flow_*, etc.) to the session's state. */
  applyEvent(sessionId: string, event: DashboardEvent): boolean {
    const s = this.ensure(sessionId);
    let changed = false;
    if (isFlowEvent(event.eventType)) {
      const next = reduceFlowEvent(s.flowState ?? null, event);
      if (next !== s.flowState) {
        s.flowState = next;
        changed = true;
      }
    }
    return changed;
  }

  /** Update available flows list (from pi flows_list message). */
  setFlows(sessionId: string, flows: FlowInfo[]): void {
    const s = this.ensure(sessionId);
    s.flows = flows;
  }

  /** Update available commands list. */
  setCommands(sessionId: string, commands: CommandInfo[]): void {
    const s = this.ensure(sessionId);
    s.commands = commands;
  }

  clearSession(sessionId: string): void {
    this.map.delete(sessionId);
  }

  /** Test-only: reset all state. */
  __resetForTests(): void {
    this.map.clear();
  }
}

export const stateStore = new StateStore();
