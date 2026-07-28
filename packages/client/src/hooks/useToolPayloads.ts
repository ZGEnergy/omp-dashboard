/**
 * Owns the client half of the `fetch_tool_payload` round trip.
 *
 * Server hydration and client eviction both degrade oversized tool payloads to
 * a `ToolCallStub`. This hook is how a degraded row gets its payload back: it
 * sends `fetch_tool_payload`, correlates the `tool_payload` response by
 * `requestId`, and parks the result in a `ToolPayloadCache`.
 *
 * The cache is deliberately NOT the replay ledger. Re-inflating a few old tools
 * into the ledger would walk the client straight back into the memory ceiling
 * that eviction just relieved, so fetched payloads live in their own bounded
 * LRU and are dropped whenever the selected session changes.
 *
 * See change: hydration-tool-stub-projection.
 */
import type {
  BrowserToServerMessage,
  ServerToBrowserMessage,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CachedPayload, ToolPayloadCache } from "../lib/tool-payload-cache.js";

/** Read-side view a transcript row needs to render one degraded tool call. */
export interface ToolPayloadController {
  get(toolCallId: string): CachedPayload | undefined;
  isLoading(toolCallId: string): boolean;
  isError(toolCallId: string): boolean;
  fetch(toolCallId: string): void;
}

export function useToolPayloads(
  sessionId: string | null | undefined,
  send: (msg: BrowserToServerMessage) => void,
  onMessage: (handler: (msg: ServerToBrowserMessage) => void) => () => void,
): ToolPayloadController {
  const cacheRef = useRef(new ToolPayloadCache());
  // `pending` maps requestId → toolCallId. Correlating on requestId (not
  // toolCallId) keeps a stale response from a previous session or a superseded
  // retry from landing on the current row.
  const pendingRef = useRef(new Map<string, string>());
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  // Cache mutation is invisible to React; bump a counter so a landed payload
  // re-renders the row that asked for it.
  const [version, setVersion] = useState(0);

  // A tool id is only unique within a session, and a payload fetched for the
  // previous session must never render against this one.
  useEffect(() => {
    cacheRef.current.clear();
    pendingRef.current.clear();
    setLoading(new Set());
    setErrors(new Set());
    setVersion((v) => v + 1);
  }, [sessionId]);

  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type !== "tool_payload") return;
      const toolCallId = pendingRef.current.get(msg.requestId);
      if (toolCallId === undefined) return; // stale or foreign response
      pendingRef.current.delete(msg.requestId);
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(toolCallId);
        return next;
      });
      if (msg.payload === undefined) {
        setErrors((prev) => new Set(prev).add(toolCallId));
        return;
      }
      cacheRef.current.set(toolCallId, msg.payload, msg.truncated === true);
      setVersion((v) => v + 1);
    });
  }, [onMessage]);

  const fetch = useCallback(
    (toolCallId: string) => {
      if (!sessionId) return;
      // Already resident or already in flight — a second click is a no-op
      // rather than a duplicate request.
      if (cacheRef.current.has(toolCallId)) return;
      for (const inFlight of pendingRef.current.values()) if (inFlight === toolCallId) return;
      const requestId = crypto.randomUUID();
      pendingRef.current.set(requestId, toolCallId);
      setLoading((prev) => new Set(prev).add(toolCallId));
      setErrors((prev) => {
        if (!prev.has(toolCallId)) return prev;
        const next = new Set(prev);
        next.delete(toolCallId);
        return next;
      });
      send({ type: "fetch_tool_payload", sessionId, toolCallId, requestId });
    },
    [sessionId, send],
  );

  return useMemo<ToolPayloadController>(() => {
    // The cache is mutable and invisible to React. `version` is a dependency
    // purely so a landed payload rebuilds this object, giving ChatView a fresh
    // identity and re-rendering the degraded rows.
    void version;
    return {
      get: (toolCallId) => cacheRef.current.get(toolCallId),
      isLoading: (toolCallId) => loading.has(toolCallId),
      isError: (toolCallId) => errors.has(toolCallId),
      fetch,
    };
  }, [version, loading, errors, fetch]);
}
