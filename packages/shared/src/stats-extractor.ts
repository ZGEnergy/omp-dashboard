/**
 * Extract token stats from a turn_end event.
 * Reads usage from event.message.usage (the pi SDK's TurnEndEvent shape).
 */

export interface StatsData {
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turnUsage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
  };
}

/**
 * Extract stats from a turn_end event and context usage.
 * Returns null if the event has no usage data.
 */
export function extractTurnStats(
  event: Record<string, unknown>,
  contextUsage?: { tokens: number | null; contextWindow: number },
): StatsData | null {
  const message = event.message as Record<string, unknown> | undefined;
  const usage = message?.usage as Record<string, unknown> | undefined;

  if (!usage) return null;

  const cost = usage.cost as Record<string, number> | undefined;

  const stats: StatsData = {
    tokensIn: (usage.input as number) ?? 0,
    tokensOut: (usage.output as number) ?? 0,
    cost: cost?.total ?? 0,
    turnUsage: {
      input: (usage.input as number) ?? 0,
      output: (usage.output as number) ?? 0,
      cacheRead: (usage.cacheRead as number) ?? 0,
      cacheWrite: (usage.cacheWrite as number) ?? 0,
    },
  };

  if (contextUsage) {
    stats.contextUsage = contextUsage;
  }

  return stats;
}
