import type { SkippedSeqRange } from "./browser-protocol.js";
import type { SeqEvent } from "./event-window.js";
import type { DashboardEvent } from "./types.js";

export type { SkippedSeqRange };

export interface ReplayProjectionResult {
  events: SeqEvent<DashboardEvent>[];
  skippedSeqRanges: SkippedSeqRange[];
}

export function normalizeSkippedSeqRanges(ranges: readonly SkippedSeqRange[]): SkippedSeqRange[] {
  if (!ranges || ranges.length === 0) return [];
  const valid: SkippedSeqRange[] = [];
  for (const r of ranges) {
    if (
      r &&
      typeof r.fromSeq === "number" &&
      typeof r.toSeq === "number" &&
      Number.isInteger(r.fromSeq) &&
      Number.isInteger(r.toSeq) &&
      r.fromSeq <= r.toSeq
    ) {
      valid.push({ fromSeq: r.fromSeq, toSeq: r.toSeq });
    }
  }
  if (valid.length === 0) return [];

  valid.sort((a, b) => a.fromSeq - b.fromSeq || a.toSeq - b.toSeq);

  const merged: SkippedSeqRange[] = [];
  let current = { ...valid[0]! };

  for (let i = 1; i < valid.length; i += 1) {
    const next = valid[i]!;
    if (next.fromSeq <= current.toSeq + 1) {
      current.toSeq = Math.max(current.toSeq, next.toSeq);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

export function validateSkippedSeqRanges(ranges: readonly SkippedSeqRange[]): void {
  if (!ranges) return;
  for (let i = 0; i < ranges.length; i += 1) {
    const r = ranges[i]!;
    if (
      !r ||
      typeof r.fromSeq !== "number" ||
      typeof r.toSeq !== "number" ||
      !Number.isInteger(r.fromSeq) ||
      !Number.isInteger(r.toSeq) ||
      r.fromSeq > r.toSeq
    ) {
      throw new Error(`Invalid SkippedSeqRange at index ${i}: ${JSON.stringify(r)}`);
    }
    if (i > 0) {
      const prev = ranges[i - 1]!;
      if (r.fromSeq <= prev.toSeq + 1) {
        throw new Error(
          `Overlapping or unmerged SkippedSeqRange at index ${i}: prev=[${prev.fromSeq},${prev.toSeq}], curr=[${r.fromSeq},${r.toSeq}]`,
        );
      }
    }
  }
}

export function clipSkippedSeqRanges(
  ranges: readonly SkippedSeqRange[],
  minSeq: number,
  maxSeq: number,
): SkippedSeqRange[] {
  if (!ranges || ranges.length === 0 || minSeq > maxSeq) return [];
  const clipped: SkippedSeqRange[] = [];
  for (const r of ranges) {
    const fromSeq = Math.max(r.fromSeq, minSeq);
    const toSeq = Math.min(r.toSeq, maxSeq);
    if (fromSeq <= toSeq) {
      clipped.push({ fromSeq, toSeq });
    }
  }
  return normalizeSkippedSeqRanges(clipped);
}

export function computeLogicalSeqBounds(
  events: readonly SeqEvent[],
  skippedSeqRanges: readonly SkippedSeqRange[] = [],
): { minSeq: number | null; maxSeq: number | null } {
  let minSeq: number | null = null;
  let maxSeq: number | null = null;

  if (events.length > 0) {
    minSeq = events[0]!.seq;
    maxSeq = events[events.length - 1]!.seq;
  }

  const norm = normalizeSkippedSeqRanges(skippedSeqRanges);
  if (norm.length > 0) {
    const firstRangeMin = norm[0]!.fromSeq;
    const lastRangeMax = norm[norm.length - 1]!.toSeq;
    minSeq = minSeq === null ? firstRangeMin : Math.min(minSeq, firstRangeMin);
    maxSeq = maxSeq === null ? lastRangeMax : Math.max(maxSeq, lastRangeMax);
  }

  return { minSeq, maxSeq };
}

export function computeLogicalSeqCount(
  events: readonly SeqEvent[],
  skippedSeqRanges: readonly SkippedSeqRange[] = [],
): number {
  let count = events.length;
  const norm = normalizeSkippedSeqRanges(skippedSeqRanges);
  for (const r of norm) {
    count += r.toSeq - r.fromSeq + 1;
  }
  return count;
}

export function isCoverageContiguous(
  events: readonly { seq: number }[],
  skippedSeqRanges: readonly SkippedSeqRange[] = [],
  expectedMinSeq?: number,
  expectedMaxSeq?: number,
): boolean {
  const intervals: { fromSeq: number; toSeq: number }[] = [];
  if (events) {
    for (const e of events) {
      if (e && typeof e.seq === "number" && Number.isInteger(e.seq)) {
        intervals.push({ fromSeq: e.seq, toSeq: e.seq });
      }
    }
  }
  if (skippedSeqRanges) {
    for (const r of skippedSeqRanges) {
      if (
        r &&
        typeof r.fromSeq === "number" &&
        typeof r.toSeq === "number" &&
        Number.isInteger(r.fromSeq) &&
        Number.isInteger(r.toSeq) &&
        r.fromSeq <= r.toSeq
      ) {
        intervals.push({ fromSeq: r.fromSeq, toSeq: r.toSeq });
      }
    }
  }

  if (intervals.length === 0) {
    return expectedMinSeq === undefined && expectedMaxSeq === undefined;
  }

  intervals.sort((a, b) => a.fromSeq - b.fromSeq || a.toSeq - b.toSeq);

  const minSeq = intervals[0]!.fromSeq;
  let currentEnd = intervals[0]!.toSeq;

  for (let i = 1; i < intervals.length; i += 1) {
    const next = intervals[i]!;
    if (next.fromSeq <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, next.toSeq);
    } else {
      return false;
    }
  }

  if (expectedMinSeq !== undefined && minSeq > expectedMinSeq) return false;
  if (expectedMaxSeq !== undefined && currentEnd < expectedMaxSeq) return false;
  return true;
}

export function projectReplayEvents(
  eventsAsc: readonly SeqEvent<DashboardEvent>[],
): ReplayProjectionResult {
  if (!eventsAsc || eventsAsc.length === 0) {
    return { events: [], skippedSeqRanges: [] };
  }

  const skippedSeqsSet = new Set<number>();

  interface ToolCallGroup {
    toolCallId: string;
    events: SeqEvent<DashboardEvent>[];
    startEvent?: SeqEvent<DashboardEvent>;
    updateEvents: SeqEvent<DashboardEvent>[];
    endEvent?: SeqEvent<DashboardEvent>;
  }

  const toolGroups = new Map<string, ToolCallGroup>();

  for (const entry of eventsAsc) {
    const eventType = entry.event.eventType;
    if (typeof eventType === "string" && eventType.startsWith("tool_execution_")) {
      const data = entry.event.data as Record<string, unknown> | null | undefined;
      const toolCallId = typeof data?.toolCallId === "string" ? data.toolCallId : null;
      if (toolCallId) {
        let group = toolGroups.get(toolCallId);
        if (!group) {
          group = { toolCallId, events: [], updateEvents: [] };
          toolGroups.set(toolCallId, group);
        }
        group.events.push(entry);
        if (eventType === "tool_execution_start") {
          group.startEvent = entry;
        } else if (eventType === "tool_execution_end") {
          group.endEvent = entry;
        } else if (eventType === "tool_execution_update") {
          group.updateEvents.push(entry);
        }
      }
    }
  }

  const representatives = new Map<string, SeqEvent<DashboardEvent>>();

  for (const [toolCallId, group] of toolGroups) {
    const repEvent = group.endEvent || group.updateEvents.at(-1) || group.startEvent || group.events[0]!;

    for (const ev of group.events) {
      if (ev.seq !== repEvent.seq) {
        skippedSeqsSet.add(ev.seq);
      }
    }

    const mergedData: Record<string, unknown> = { toolCallId };

    for (const ev of group.events) {
      const data = ev.event.data as Record<string, unknown> | null | undefined;
      if (!data) continue;

      if (data.toolName !== undefined && mergedData.toolName === undefined) {
        mergedData.toolName = data.toolName;
      }
      if (data.args !== undefined && mergedData.args === undefined) {
        mergedData.args = data.args;
      }
    }

    let mergedDetails: Record<string, unknown> | undefined = undefined;
    const mergeDetailsObj = (d: unknown) => {
      if (d && typeof d === "object" && !Array.isArray(d)) {
        if (!mergedDetails) mergedDetails = {};
        Object.assign(mergedDetails, d);
      }
    };

    for (const ev of group.events) {
      const data = ev.event.data as Record<string, unknown> | null | undefined;
      if (!data) continue;
      mergeDetailsObj(data.details);
      if (data.partialResult && typeof data.partialResult === "object" && !Array.isArray(data.partialResult)) {
        const pr = data.partialResult as Record<string, unknown>;
        mergeDetailsObj(pr.details);
      }
    }

    const repData = (repEvent.event.data as Record<string, unknown> | null | undefined) || {};

    if (repEvent === group.endEvent) {
      if (repData.isError !== undefined) {
        mergedData.isError = repData.isError;
      }

      if ("result" in repData && repData.result !== undefined) {
        mergedData.result = repData.result;
      } else {
        let extractedResult: unknown = undefined;
        for (let i = group.updateEvents.length - 1; i >= 0; i -= 1) {
          const upData = group.updateEvents[i]!.event.data as Record<string, unknown> | null | undefined;
          if (upData && "partialResult" in upData && upData.partialResult !== undefined) {
            const pr = upData.partialResult;
            if (pr && typeof pr === "object" && !Array.isArray(pr) && "content" in (pr as Record<string, unknown>)) {
              extractedResult = { content: (pr as Record<string, unknown>).content };
            } else {
              extractedResult = pr;
            }
            break;
          }
        }
        if (extractedResult !== undefined) {
          mergedData.result = extractedResult;
        }
      }
    } else if (group.updateEvents.includes(repEvent)) {
      if ("partialResult" in repData && repData.partialResult !== undefined) {
        mergedData.partialResult = repData.partialResult;
      } else {
        for (let i = group.updateEvents.length - 1; i >= 0; i -= 1) {
          const upData = group.updateEvents[i]!.event.data as Record<string, unknown> | null | undefined;
          if (upData && "partialResult" in upData && upData.partialResult !== undefined) {
            mergedData.partialResult = upData.partialResult;
            break;
          }
        }
      }
    } else if (repEvent === group.startEvent) {
      Object.assign(mergedData, repData);
    }

    for (const [k, v] of Object.entries(repData)) {
      if (k !== "details" && k !== "result" && k !== "partialResult" && !(k in mergedData)) {
        mergedData[k] = v;
      }
    }

    if (mergedDetails) {
      mergedData.details = mergedDetails;
    }

    representatives.set(toolCallId, {
      seq: repEvent.seq,
      event: {
        ...repEvent.event,
        data: mergedData,
      },
    });
  }

  interface MessageTurn {
    id: string;
    updates: SeqEvent<DashboardEvent>[];
    hasEnd: boolean;
  }

  const messageTurns = new Map<string, MessageTurn>();
  let activeAssistantTurnId: string | null = null;
  let turnCounter = 0;

  for (const entry of eventsAsc) {
    const eventType = entry.event.eventType;
    if (typeof eventType !== "string") continue;

    if (eventType === "user_prompt" || eventType === "system_prompt" || eventType.startsWith("user_") || eventType.startsWith("system_")) {
      activeAssistantTurnId = null;
      continue;
    }

    if (eventType.startsWith("message_")) {
      const data = entry.event.data as Record<string, unknown> | null | undefined;
      let msgId: string | null = null;
      let isAssistant = false;
      let isUserOrSystem = false;

      if (data) {
        if (typeof data.messageId === "string" && data.messageId) msgId = data.messageId;
        else if (data.message && typeof data.message === "object") {
          const m = data.message as Record<string, unknown>;
          if (typeof m.id === "string" && m.id) msgId = m.id;
          if (m.role === "assistant") isAssistant = true;
          if (m.role === "user" || m.role === "system") isUserOrSystem = true;
        } else if (typeof data.id === "string" && data.id) msgId = data.id;

        if (data.role === "assistant" || data.assistantMessageEvent !== undefined) isAssistant = true;
        if (data.role === "user" || data.role === "system") isUserOrSystem = true;
      }

      if (isUserOrSystem && !isAssistant) {
        activeAssistantTurnId = null;
      }

      if (eventType === "message_start") {
        if (isAssistant) {
          turnCounter += 1;
          activeAssistantTurnId = msgId || `assistant_turn_${turnCounter}`;
        } else {
          activeAssistantTurnId = null;
        }
      } else if (isAssistant) {
        if (msgId) {
          activeAssistantTurnId = msgId;
        } else if (!activeAssistantTurnId) {
          turnCounter += 1;
          activeAssistantTurnId = `assistant_turn_${turnCounter}`;
        }
      }

      const key = msgId || activeAssistantTurnId;
      if (key && (isAssistant || (!isUserOrSystem && activeAssistantTurnId))) {
        let turn = messageTurns.get(key);
        if (!turn) {
          turn = { id: key, updates: [], hasEnd: false };
          messageTurns.set(key, turn);
        }

        if (eventType === "message_update") {
          turn.updates.push(entry);
        } else if (eventType === "message_end") {
          turn.hasEnd = true;
          activeAssistantTurnId = null;
        }
      }
    }
  }

  for (const turn of messageTurns.values()) {
    if (turn.updates.length === 0) continue;

    if (turn.hasEnd) {
      for (const updateEv of turn.updates) {
        skippedSeqsSet.add(updateEv.seq);
      }
    } else {
      const latestUpdate = turn.updates[turn.updates.length - 1]!;
      for (const updateEv of turn.updates) {
        if (updateEv.seq !== latestUpdate.seq) {
          skippedSeqsSet.add(updateEv.seq);
        }
      }
    }
  }

  const resultEvents: SeqEvent<DashboardEvent>[] = [];

  for (const entry of eventsAsc) {
    if (skippedSeqsSet.has(entry.seq)) {
      continue;
    }

    const eventType = entry.event.eventType;
    if (typeof eventType === "string" && eventType.startsWith("tool_execution_")) {
      const data = entry.event.data as Record<string, unknown> | null | undefined;
      const toolCallId = typeof data?.toolCallId === "string" ? data.toolCallId : null;
      if (toolCallId) {
        const rep = representatives.get(toolCallId);
        if (rep && rep.seq === entry.seq) {
          resultEvents.push(rep);
        }
        continue;
      }
    }

    resultEvents.push(entry);
  }

  const sortedSkippedSeqs = Array.from(skippedSeqsSet).sort((a, b) => a - b);
  const rawSkippedRanges: SkippedSeqRange[] = [];
  for (const seq of sortedSkippedSeqs) {
    if (rawSkippedRanges.length === 0) {
      rawSkippedRanges.push({ fromSeq: seq, toSeq: seq });
    } else {
      const last = rawSkippedRanges[rawSkippedRanges.length - 1]!;
      if (seq === last.toSeq + 1) {
        last.toSeq = seq;
      } else {
        rawSkippedRanges.push({ fromSeq: seq, toSeq: seq });
      }
    }
  }

  return {
    events: resultEvents,
    skippedSeqRanges: normalizeSkippedSeqRanges(rawSkippedRanges),
  };
}

/**
 * Normalizes ranges, keeps only ranges owned by the surviving exact suffix,
 * requiring a leading range ending exactly at firstExactSeq - 1,
 * and excludes older ranges separated by dropped exact events.
 *
 * Runs in O(events + ranges) without sequence expansion.
 */
export function retainSkippedSeqRangesForEventSuffix(
  events: readonly { seq: number }[],
  ranges: readonly SkippedSeqRange[],
): SkippedSeqRange[] {
  if (!ranges || ranges.length === 0 || !events || events.length === 0) {
    return [];
  }

  const normalized = normalizeSkippedSeqRanges(ranges);
  if (normalized.length === 0) {
    return [];
  }

  const firstExactSeq = events[0]!.seq;
  const result: SkippedSeqRange[] = [];

  const suffixRanges = normalized.filter((r) => r.fromSeq >= firstExactSeq);
  const preExactRanges = normalized.filter((r) => r.fromSeq < firstExactSeq);

  if (preExactRanges.length > 0) {
    const newestPreExact = preExactRanges[preExactRanges.length - 1]!;
    // Require leading block end to reach exactly firstExactSeq - 1 (or span across it)
    if (newestPreExact.toSeq >= firstExactSeq - 1) {
      const leadingBlock: SkippedSeqRange[] = [newestPreExact];
      let expectedEnd = newestPreExact.fromSeq - 1;

      for (let i = preExactRanges.length - 2; i >= 0; i--) {
        const r = preExactRanges[i]!;
        if (r.toSeq >= expectedEnd) {
          leadingBlock.unshift(r);
          expectedEnd = Math.min(expectedEnd, r.fromSeq - 1);
        } else {
          break;
        }
      }

      for (const r of leadingBlock) {
        result.push({
          fromSeq: r.fromSeq,
          toSeq: r.toSeq,
        });
      }
    }
  }

  for (const r of suffixRanges) {
    result.push({
      fromSeq: r.fromSeq,
      toSeq: r.toSeq,
    });
  }

  return result;
}
