/**
 * Extract session status/tool updates from forwarded events.
 * Returns partial DashboardSession updates, or null if the event is not relevant.
 */
import type { DashboardEvent, DashboardSession } from "../shared/types.js";

// Use null (not undefined) for fields that must be cleared — undefined is
// dropped during JSON serialisation so the browser would keep the stale value.
type SessionUpdates = Partial<Pick<DashboardSession, "status" | "model" | "thinkingLevel">> & {
  currentTool?: string | null;
};

/**
 * Accumulate token/cost stats from a batch of events (e.g. loaded from disk).
 * Returns partial session updates with totals, or null if no stats found.
 */
export function extractStatsFromEvents(
  events: Array<{ eventType: string; data: Record<string, unknown> }>,
): Partial<DashboardSession> | null {
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let contextTokens: number | undefined;
  let contextWindow: number | undefined;
  let found = false;

  for (const evt of events) {
    if (evt.eventType !== "stats_update") continue;
    found = true;
    const d = evt.data;
    if (d.tokensIn) tokensIn += d.tokensIn as number;
    if (d.tokensOut) tokensOut += d.tokensOut as number;
    if (d.cost) cost += d.cost as number;
    const turn = d.turnUsage as { cacheRead?: number; cacheWrite?: number } | undefined;
    if (turn) {
      if (turn.cacheRead) cacheRead += turn.cacheRead;
      if (turn.cacheWrite) cacheWrite += turn.cacheWrite;
    }
    const ctx = d.contextUsage as { tokens?: number | null; contextWindow?: number } | undefined;
    if (ctx) {
      if (ctx.tokens != null) contextTokens = ctx.tokens;
      if (ctx.contextWindow) contextWindow = ctx.contextWindow;
    }
  }

  if (!found) return null;
  const updates: Partial<DashboardSession> = { tokensIn, tokensOut, cacheRead, cacheWrite, cost };
  if (contextTokens !== undefined) updates.contextTokens = contextTokens;
  if (contextWindow !== undefined) updates.contextWindow = contextWindow;
  return updates;
}

export function extractSessionUpdates(event: DashboardEvent): SessionUpdates | null {
  switch (event.eventType) {
    case "agent_start":
      return { status: "streaming", currentTool: null };

    case "agent_end":
      return { status: "idle", currentTool: null };

    case "tool_execution_start":
      return { currentTool: (event.data.toolName as string) ?? null };

    case "tool_execution_end":
      return { currentTool: null };

    case "model_select": {
      const model = event.data.model as { provider?: string; id?: string } | undefined;
      if (model?.provider && model?.id) {
        const updates: SessionUpdates = { model: `${model.provider}/${model.id}` };
        const thinkingLevel = event.data.thinkingLevel as string | undefined;
        if (thinkingLevel !== undefined) {
          updates.thinkingLevel = thinkingLevel;
        }
        return updates;
      }
      return null;
    }

    default:
      return null;
  }
}
