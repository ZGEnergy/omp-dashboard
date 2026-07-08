/**
 * Stale running-tool reconcile (primary heal for a dropped `tool_execution_end`).
 *
 * A tool card can stay stuck on the running spinner when its terminal
 * `tool_execution_end` is dropped on the server→browser WebSocket hop under
 * back-pressure (`ws.bufferedAmount > MAX_WS_BUFFER`). The event is still
 * recorded in the server store, so it is recoverable over an INDEPENDENT
 * channel: `GET /api/sessions/:sessionId/tool-result/:toolCallId` (HTTP, not
 * WS). Because HTTP does not ride the overflowing send buffer, the heal
 * cannot be re-dropped by the same condition.
 *
 * This hook is SESSION/STATE-SCOPED (scans `sessionStates` for running rows),
 * never a per-row `useEffect` — so virtualizing / unmounting a stuck card off
 * screen (`virtualize-chat-transcript-tanstack`) does NOT cancel the heal.
 *
 * The client applies only the authoritative server result; it never
 * synthesizes a completion of its own. On 404 / in-flight it keeps the row
 * running and re-arms.
 *
 * See change: fix-stuck-tool-card-on-dropped-event.
 */
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { useEffect, useRef } from "react";
import { reduceEvent, type SessionState } from "../lib/event-reducer.js";

/**
 * A running tool row is considered stale (candidate for reconcile) once it
 * has been running this long with no terminal event. Conservative so it can
 * never race a legitimately slow tool. See design.md D1.
 */
export const STALE_TOOL_MS = 25_000;

/** How often the session-scoped scan runs. */
export const RECONCILE_POLL_MS = 5_000;

/**
 * After a 404 / in-flight result (tool genuinely still running, or the end
 * event was evicted), wait this long before probing the same row again.
 */
export const RECONCILE_REARM_MS = 15_000;

export interface StaleToolRef {
  sessionId: string;
  toolCallId: string;
}

/**
 * Pure scan: every `status:"running"` tool row across all sessions whose
 * `startedAt` is older than `staleMs`. `skip(key)` excludes rows already
 * in-flight or recently probed (re-arm window). Keyed by `sessionId:toolCallId`.
 */
export function selectStaleRunningTools(
  sessionStates: Map<string, SessionState>,
  now: number,
  staleMs: number,
  skip: (key: string) => boolean,
): StaleToolRef[] {
  const out: StaleToolRef[] = [];
  for (const [sessionId, state] of sessionStates) {
    for (const [toolCallId, tc] of state.toolCalls) {
      if (tc.status !== "running") continue;
      if (tc.startedAt === undefined || now - tc.startedAt < staleMs) continue;
      if (skip(`${sessionId}:${toolCallId}`)) continue;
      out.push({ sessionId, toolCallId });
    }
  }
  return out;
}

/**
 * Build the synthetic `tool_execution_end` event that carries the
 * authoritative server result into the existing (idempotent, toolCallId-keyed)
 * reducer path.
 */
export function synthesizeToolEndEvent(
  toolCallId: string,
  body: { result?: unknown; isError?: unknown },
  now: number,
): DashboardEvent {
  return {
    eventType: "tool_execution_end",
    timestamp: now,
    data: {
      toolCallId,
      result: typeof body.result === "string" ? body.result : String(body.result ?? ""),
      isError: body.isError === true,
    },
  };
}

export function useStaleToolReconcile(
  sessionStates: Map<string, SessionState>,
  setSessionStates: React.Dispatch<React.SetStateAction<Map<string, SessionState>>>,
  apiBase: string,
): void {
  // Live snapshot read by the interval without re-arming it every render.
  const statesRef = useRef(sessionStates);
  statesRef.current = sessionStates;

  const inFlightRef = useRef<Set<string>>(new Set());
  const lastAttemptRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const reconcile = async (sessionId: string, toolCallId: string, key: string) => {
      try {
        const res = await fetch(`${apiBase}/api/sessions/${sessionId}/tool-result/${toolCallId}`);
        // 404 / in-flight (or the end event was evicted): leave the row
        // running and re-arm. Never synthesize a completion.
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const event = synthesizeToolEndEvent(toolCallId, body, Date.now());
        setSessionStates((prev) => {
          const current = prev.get(sessionId);
          if (!current) return prev;
          // Only apply if still running — a live `tool_execution_end` may
          // have raced in between scan and fetch; do not clobber it.
          const tc = current.toolCalls.get(toolCallId);
          if (tc?.status !== "running") return prev;
          const next = new Map(prev);
          next.set(sessionId, reduceEvent(current, event));
          return next;
        });
      } catch {
        // Network error: keep the row running, re-arm on the next tick.
      } finally {
        inFlightRef.current.delete(key);
      }
    };

    const tick = () => {
      const now = Date.now();
      const skip = (key: string) => {
        if (inFlightRef.current.has(key)) return true;
        const last = lastAttemptRef.current.get(key);
        return last !== undefined && now - last < RECONCILE_REARM_MS;
      };
      const stale = selectStaleRunningTools(statesRef.current, now, STALE_TOOL_MS, skip);
      for (const { sessionId, toolCallId } of stale) {
        const key = `${sessionId}:${toolCallId}`;
        inFlightRef.current.add(key);
        lastAttemptRef.current.set(key, now);
        void reconcile(sessionId, toolCallId, key);
      }
    };

    const id = setInterval(tick, RECONCILE_POLL_MS);
    return () => clearInterval(id);
  }, [apiBase, setSessionStates]);
}
