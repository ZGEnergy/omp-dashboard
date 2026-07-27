import type { DashboardEvent } from "./types.js";

export const MAX_REPLAY_DISPLAY_LINES = 200;
export const DEFAULT_MAX_REPLAY_TEXT_BYTES = 192 * 1024;
export const MAX_REPLAY_EVENT_BYTES = 256 * 1024;
export const MAX_REPLAY_ASSET_REFERENCES = 128;
export const REPLAY_BYTE_TRUNCATION_MARKER = "«earlier output hidden by byte limit»\n";

const TRUNCATION_HEADER_RE = /^«\d+ earlier lines hidden»\n/;
const ASSET_HASH_PATTERN = /^[A-Za-z0-9_-]+$/;
const ASSET_REFERENCE_RE = /pi-asset:([A-Za-z0-9_-]+)/g;
const ASSET_REFERENCE_ANY_RE = /pi-asset:([^\s\])}>,"']*)/g;
const CIRCULAR_REFERENCE_MARKER = "[unavailable: circular reference]";

export type ReplayPreparationIssueCode =
  | "malformed_content_block"
  | "malformed_event"
  | "malformed_tool_event"
  | "serialization_failed"
  | "event_truncated"
  | "asset_reference_limit"
  | "inline_asset_unavailable";

export interface ReplayPreparationIssue {
  code: ReplayPreparationIssueCode;
  detail?: string;
}

export interface InlineReplayAsset {
  data: string;
  mimeType: string;
}

export interface PrepareEventForReplayOptions {
  maxTextBytes?: number;
  maxEventBytes?: number;
  maxToolPayloadBytes?: number;
  registerInlineAsset?: (asset: InlineReplayAsset) => string | undefined;
}

export interface PreparedReplayEvent {
  event: DashboardEvent;
  assetHashes: string[];
  issues: ReplayPreparationIssue[];
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function addIssue(
  issues: ReplayPreparationIssue[],
  code: ReplayPreparationIssueCode,
  detail?: string,
): void {
  if (!issues.some((issue) => issue.code === code && issue.detail === detail)) {
    issues.push(detail ? { code, detail } : { code });
  }
}

function sanitizeValue(
  value: unknown,
  issues: ReplayPreparationIssue[],
  ancestors: WeakSet<object>,
): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    addIssue(issues, "serialization_failed", "bigint");
    return value.toString();
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    addIssue(issues, "serialization_failed", typeof value);
    return null;
  }
  if (typeof value !== "object") return String(value);
  if (ancestors.has(value)) {
    addIssue(issues, "serialization_failed", "circular_reference");
    return CIRCULAR_REFERENCE_MARKER;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((child) => sanitizeValue(child, issues, ancestors));
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sanitizeValue(child, issues, ancestors);
    }
    return output;
  } catch (error) {
    addIssue(issues, "serialization_failed", error instanceof Error ? error.name : "unknown");
    return "[unavailable: value could not be serialized]";
  } finally {
    ancestors.delete(value);
  }
}

function extractContentBlockText(
  blocks: unknown[],
  issues: ReplayPreparationIssue[],
): string | null {
  const texts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      addIssue(issues, "malformed_content_block");
      continue;
    }
    const candidate = block as { type?: unknown; text?: unknown };
    if (candidate.type === "text" && typeof candidate.text === "string") {
      texts.push(candidate.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : null;
}

function safeJson(value: unknown, issues: ReplayPreparationIssue[]): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch (error) {
    addIssue(issues, "serialization_failed", error instanceof Error ? error.name : "unknown");
    return "[unavailable: value could not be serialized]";
  }
}

export function toReplayDisplayString(
  value: unknown,
  issues: ReplayPreparationIssue[] = [],
): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return extractContentBlockText(value, issues) ?? safeJson(value, issues);
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.content)) {
      return extractContentBlockText(record.content, issues) ?? safeJson(value, issues);
    }
    return safeJson(value, issues);
  }
  return String(value);
}

function suffixWithinUtf8Budget(value: string, budgetBytes: number): string {
  if (budgetBytes <= 0) return "";
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= budgetBytes) return value;

  let start = encoded.byteLength - budgetBytes;
  while (start < encoded.byteLength && (encoded[start]! & 0xc0) === 0x80) start += 1;
  return new TextDecoder().decode(encoded.subarray(start));
}

export function truncateReplayDisplayLines(
  value: unknown,
  maxLines = MAX_REPLAY_DISPLAY_LINES,
  issues: ReplayPreparationIssue[] = [],
): string {
  const text = toReplayDisplayString(value, issues);
  if (TRUNCATION_HEADER_RE.test(text) || text.startsWith(REPLAY_BYTE_TRUNCATION_MARKER)) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const dropped = lines.length - maxLines;
  return `«${dropped} earlier lines hidden»\n${lines.slice(-maxLines).join("\n")}`;
}

export function truncateReplayText(
  value: unknown,
  maxTextBytes = DEFAULT_MAX_REPLAY_TEXT_BYTES,
  issues: ReplayPreparationIssue[] = [],
): string {
  const text = truncateReplayDisplayLines(value, MAX_REPLAY_DISPLAY_LINES, issues);
  const limit = Number.isFinite(maxTextBytes) && maxTextBytes > 0
    ? Math.floor(maxTextBytes)
    : DEFAULT_MAX_REPLAY_TEXT_BYTES;
  if (utf8ByteLength(text) <= limit) return text;

  addIssue(issues, "event_truncated", "text_byte_limit");
  const markerBytes = utf8ByteLength(REPLAY_BYTE_TRUNCATION_MARKER);
  if (markerBytes >= limit) return suffixWithinUtf8Budget(REPLAY_BYTE_TRUNCATION_MARKER, limit);
  return REPLAY_BYTE_TRUNCATION_MARKER + suffixWithinUtf8Budget(text, limit - markerBytes);
}

export function truncateStructuredResult(value: unknown, maxTextBytes: number | undefined, issues: ReplayPreparationIssue[]): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (Array.isArray(rec.content)) {
      const contentBlocks: unknown[] = [];
      for (const block of rec.content) {
        if (block && typeof block === "object" && !Array.isArray(block)) {
          const bRec = block as Record<string, unknown>;
          if (typeof bRec.text === "string") {
            contentBlocks.push({
              ...bRec,
              text: truncateReplayText(bRec.text, maxTextBytes, issues),
            });
          } else {
            contentBlocks.push(bRec);
          }
        } else {
          contentBlocks.push(block);
        }
      }
      return { ...rec, content: contentBlocks };
    }
  }
  return truncateReplayText(value, maxTextBytes, issues);
}

interface AssetRewriteState {
  hashes: Set<string>;
  inlineHashesByMime: Map<string, Map<string, string>>;
}

function unavailableAsset(parentKey?: string, mimeType?: string): Record<string, unknown> {
  return parentKey === "images"
    ? { type: "asset_unavailable", ...(mimeType ? { mimeType } : {}) }
    : { type: "text", text: "[image unavailable]" };
}

function admitAssetHash(
  hash: string,
  state: AssetRewriteState,
  issues: ReplayPreparationIssue[],
): boolean {
  if (!ASSET_HASH_PATTERN.test(hash)) return false;
  if (state.hashes.has(hash)) return true;
  if (state.hashes.size >= MAX_REPLAY_ASSET_REFERENCES) {
    addIssue(issues, "asset_reference_limit");
    return false;
  }
  state.hashes.add(hash);
  return true;
}

function rewriteAssetReferences(
  value: string,
  state: AssetRewriteState,
  issues: ReplayPreparationIssue[],
): string {
  return value.replace(ASSET_REFERENCE_ANY_RE, (reference, hash: string) => {
    if (!ASSET_HASH_PATTERN.test(hash)) return "[asset unavailable]";
    return admitAssetHash(hash, state, issues) ? reference : "[asset unavailable]";
  });
}

function rewriteInlineAssets(
  value: unknown,
  options: PrepareEventForReplayOptions,
  issues: ReplayPreparationIssue[],
  state: AssetRewriteState,
  parentKey?: string,
  ancestors = new WeakSet<object>(),
  legacyImagesContainer = false,
): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    if (value === CIRCULAR_REFERENCE_MARKER) return value;
    if (legacyImagesContainer && parentKey === "images") {
      addIssue(issues, "malformed_content_block", "image");
      return unavailableAsset(parentKey);
    }
    if (typeof value === "string") return rewriteAssetReferences(value, state, issues);
    return value;
  }
  if (ancestors.has(value)) {
    addIssue(issues, "serialization_failed", "circular_reference");
    return CIRCULAR_REFERENCE_MARKER;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((child) => rewriteInlineAssets(
        child,
        options,
        issues,
        state,
        parentKey,
        ancestors,
        legacyImagesContainer,
      ));
    }

    const record = value as Record<string, unknown>;
    const type = record.type;
    if (type === "asset_unavailable") {
      const mimeType = typeof record.mimeType === "string" && record.mimeType.length > 0
        ? record.mimeType
        : undefined;
      const allowedKeys = new Set(["type", "mimeType"]);
      if (Object.keys(record).some((key) => !allowedKeys.has(key)) ||
        (Object.hasOwn(record, "mimeType") && !mimeType)) {
        addIssue(issues, "malformed_content_block", "asset_unavailable");
      }
      return unavailableAsset(parentKey, mimeType);
    }
    if (type === "asset") {
      const hash = record.hash;
      const mimeType = record.mimeType;
      const src = record.src;
      const allowedKeys = new Set(["type", "hash", "mimeType", "src"]);
      const hasUnexpectedFields = Object.keys(record).some((key) => !allowedKeys.has(key));
      if (
        typeof hash !== "string" || !ASSET_HASH_PATTERN.test(hash) ||
        typeof mimeType !== "string" || mimeType.length === 0 ||
        src !== `pi-asset:${hash}`
      ) {
        addIssue(issues, "malformed_content_block", "asset");
        return unavailableAsset(parentKey, typeof mimeType === "string" ? mimeType : undefined);
      }
      if (hasUnexpectedFields) addIssue(issues, "malformed_content_block", "asset");
      if (!admitAssetHash(hash, state, issues)) return unavailableAsset(parentKey, mimeType);
      return legacyImagesContainer && parentKey === "images"
        ? { type: "asset", hash, mimeType, src }
        : { type: "text", text: `![image](pi-asset:${hash})` };
    }
    const isInlineImage = type === "image" || (legacyImagesContainer && parentKey === "images");
    if (isInlineImage) {
      const allowedKeys = new Set(["type", "data", "mimeType"]);
      if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
        addIssue(issues, "malformed_content_block", "image");
      }
      const data = record.data;
      const mimeType = record.mimeType;
      if (typeof data !== "string" || data.length === 0 ||
        typeof mimeType !== "string" || mimeType.length === 0) {
        addIssue(issues, "malformed_content_block", "image");
        return unavailableAsset(parentKey, typeof mimeType === "string" ? mimeType : undefined);
      }

      const hashesByData = state.inlineHashesByMime.get(mimeType);
      const knownHash = hashesByData?.get(data);
      if (knownHash) {
        return legacyImagesContainer && parentKey === "images"
          ? { type: "asset", hash: knownHash, mimeType, src: `pi-asset:${knownHash}` }
          : { type: "text", text: `![image](pi-asset:${knownHash})` };
      }
      if (state.hashes.size >= MAX_REPLAY_ASSET_REFERENCES) {
        addIssue(issues, "asset_reference_limit");
        return unavailableAsset(parentKey, mimeType);
      }

      let hash: string | undefined;
      try {
        hash = options.registerInlineAsset?.({ data, mimeType });
      } catch (error) {
        addIssue(issues, "inline_asset_unavailable", error instanceof Error ? error.name : "unknown");
        return unavailableAsset(parentKey, mimeType);
      }
      if (typeof hash !== "string" || !ASSET_HASH_PATTERN.test(hash)) {
        addIssue(issues, "inline_asset_unavailable");
        return unavailableAsset(parentKey, mimeType);
      }
      if (!admitAssetHash(hash, state, issues)) return unavailableAsset(parentKey, mimeType);

      let hashesByMime = state.inlineHashesByMime.get(mimeType);
      if (!hashesByMime) {
        hashesByMime = new Map<string, string>();
        state.inlineHashesByMime.set(mimeType, hashesByMime);
      }
      hashesByMime.set(data, hash);
      return legacyImagesContainer && parentKey === "images"
        ? { type: "asset", hash, mimeType, src: `pi-asset:${hash}` }
        : { type: "text", text: `![image](pi-asset:${hash})` };
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      output[key] = rewriteInlineAssets(
        child,
        options,
        issues,
        state,
        key,
        ancestors,
        legacyImagesContainer || (parentKey === undefined && key === "images"),
      );
    }
    return output;
  } catch (error) {
    addIssue(issues, "serialization_failed", error instanceof Error ? error.name : "unknown");
    if (parentKey === "images") addIssue(issues, "malformed_content_block", "image");
    return unavailableAsset(parentKey);
  } finally {
    ancestors.delete(value);
  }
}

function validateBlockArray(blocks: unknown[], issues: ReplayPreparationIssue[]): void {
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      addIssue(issues, "malformed_content_block");
      continue;
    }
    const content = block as Record<string, unknown>;
    if (typeof content.type !== "string") {
      addIssue(issues, "malformed_content_block");
    } else if (content.type === "text" && typeof content.text !== "string") {
      addIssue(issues, "malformed_content_block");
    } else if (
      content.type === "toolCall" &&
      (typeof content.id !== "string" || typeof content.name !== "string")
    ) {
      addIssue(issues, "malformed_tool_event");
    }
  }
}

function validateContentBlocks(value: unknown, issues: ReplayPreparationIssue[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) validateContentBlocks(child, issues);
    return;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.content)) validateBlockArray(record.content, issues);
  if (Array.isArray(record.result)) validateBlockArray(record.result, issues);
  for (const child of Object.values(record)) validateContentBlocks(child, issues);
}

function collectAssetHashes(
  value: unknown,
  hashes: Set<string>,
  issues: ReplayPreparationIssue[],
): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      ASSET_REFERENCE_RE.lastIndex = 0;
      for (let match = ASSET_REFERENCE_RE.exec(current); match; match = ASSET_REFERENCE_RE.exec(current)) {
        const hash = match[1]!;
        if (hashes.has(hash)) continue;
        if (hashes.size >= MAX_REPLAY_ASSET_REFERENCES) {
          addIssue(issues, "asset_reference_limit");
          return;
        }
        hashes.add(hash);
      }
    } else if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
    } else if (current && typeof current === "object") {
      for (const child of Object.values(current as Record<string, unknown>)) stack.push(child);
    }
  }
}

const PRIORITY_KEYS = new Set([
  "toolcallid",
  "callid",
  "tool_call_id",
  "description",
  "tags",
  "error",
  "errors",
  "errorcode",
  "errormessage",
  "name",
  "tool",
  "toolname",
  "tool_name",
  "id",
  "role",
  "status",
  "state",
  "stats",
  "statistics",
  "type",
  "eventtype",
  "event_type",
  "seq",
  "timestamp",
  "mimetype",
  "hash",
  "src",
  "channel",
  "command",
  "action",
  "mode",
  "kind",
  "label",
  "reason",
  "path",
  "tooluses",
  "tokens",
  "tokensusage",
  "agentmdpath",
  "inputtokens",
  "outputtokens",
  "totaltokens",
  "turncount",
  "maxturns",
  "durationms",
  "iserror",
  "agent",
  "agentid",
  "model",
  "session",
  "sessionid",
]);

const BULKY_KEYS = new Set([
  "content",
  "output",
  "entries",
  "result",
  "stdout",
  "stderr",
  "diff",
  "logs",
  "body",
  "response",
  "payload",
  "buffer",
  "raw",
  "details",
]);

function isPriorityKey(key: string | number): boolean {
  if (typeof key === "number") return false;
  const k = key.toString().toLowerCase();
  if (BULKY_KEYS.has(k)) return false;
  if (PRIORITY_KEYS.has(k)) return true;
  return (
    k.endsWith("status") ||
    k.includes("stats") ||
    k.endsWith("tag") ||
    k.endsWith("tags") ||
    k.includes("error") ||
    k.includes("description") ||
    k.includes("tokensusage") ||
    k.includes("agentmdpath") ||
    k.includes("toolcallid") ||
    k.includes("toolname") ||
    k.endsWith("id") ||
    k.endsWith("count") ||
    k.endsWith("ms") ||
    k.endsWith("turns") ||
    k.endsWith("uses") ||
    k.endsWith("mode")
  );
}

function isBulkyKey(key: string | number): boolean {
  if (typeof key === "number") return false;
  const k = key.toString().toLowerCase();
  if (BULKY_KEYS.has(k)) return true;
  return (
    k.includes("content") ||
    k.includes("output") ||
    k.includes("entries") ||
    k.includes("stdout") ||
    k.includes("stderr")
  );
}

function computeKeyPriorityRank(key: string | number, value: string): number {
  if (isPriorityKey(key)) {
    return 2;
  }
  if (isBulkyKey(key)) {
    return 0;
  }
  return 1;
}

type StringParent = Record<string, unknown> | unknown[];
interface StringLocation {
  parent: StringParent;
  key: string | number;
  value: string;
  bytes: number;
  priorityRank: number;
  isPriority: boolean;
}

function collectStringLocations(
  value: unknown,
  locations: StringLocation[],
  parentKey?: string | number,
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      if (typeof child === "string") {
        const keyForCheck = parentKey !== undefined ? parentKey : index;
        const priorityRank = computeKeyPriorityRank(keyForCheck, child);
        const isPriority = priorityRank === 2;
        locations.push({ parent: value, key: index, value: child, bytes: utf8ByteLength(child), priorityRank, isPriority });
      } else collectStringLocations(child, locations, index);
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (typeof child === "string") {
        const priorityRank = computeKeyPriorityRank(key, child);
        const isPriority = priorityRank === 2;
        locations.push({ parent: record, key, value: child, bytes: utf8ByteLength(child), priorityRank, isPriority });
      } else collectStringLocations(child, locations, key);
    }
  }
}
function truncateReplayJsonText(value: unknown, maxBytes: number | undefined, issues: ReplayPreparationIssue[]): string {
  const source = String(value ?? "");
  const limit = Number.isFinite(maxBytes) && maxBytes! > 0 ? Math.floor(maxBytes!) : Number.POSITIVE_INFINITY;
  if (utf8ByteLength(JSON.stringify(source)) <= limit) return source;
  let target = Math.max(1, limit - utf8ByteLength(JSON.stringify(REPLAY_BYTE_TRUNCATION_MARKER)));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const truncated = REPLAY_BYTE_TRUNCATION_MARKER + suffixWithinUtf8Budget(source, target);
    if (utf8ByteLength(JSON.stringify(truncated)) <= limit) {
      addIssue(issues, "event_truncated", "tool_payload_limit");
      return truncated;
    }
    target = Math.max(1, Math.floor(target / 2));
  }
  addIssue(issues, "event_truncated", "tool_payload_limit");
  return "";
}

export const DEFAULT_MAX_TOOL_PAYLOAD_BYTES = 20 * 1024;

function capResultOrContent(value: unknown, limit: number, issues: ReplayPreparationIssue[]): unknown {
  if (typeof value === "string") {
    if (value === "{}") return {};
    if (value === "[]") return [];
    return truncateReplayText(value, limit, issues);
  }
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      if (value.length === 0) return [];
      return truncateReplayText(JSON.stringify(value), limit, issues);
    }
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 0) {
      return {};
    }
    if (Array.isArray(obj.content)) {
      const contentBlocks: unknown[] = [];
      for (const block of obj.content) {
        if (block && typeof block === "object" && !Array.isArray(block)) {
          const bRec = block as Record<string, unknown>;
          if (typeof bRec.text === "string") {
            contentBlocks.push({
              type: bRec.type ?? "text",
              text: truncateReplayText(bRec.text, limit, issues),
            });
          } else {
            contentBlocks.push(bRec);
          }
        } else {
          contentBlocks.push(block);
        }
      }
      return { content: contentBlocks };
    }
    if (typeof obj.text === "string") {
      return { text: truncateReplayText(obj.text, limit, issues) };
    }
    return truncateReplayText(JSON.stringify(obj), limit, issues);
  }
  return value;
}

function capToolEventPayload(
  eventType: string,
  data: Record<string, unknown>,
  toolCapBytes: number,
  issues: ReplayPreparationIssue[],
): Record<string, unknown> {
  const limit = Number.isFinite(toolCapBytes) && toolCapBytes > 0
    ? Math.floor(toolCapBytes)
    : DEFAULT_MAX_TOOL_PAYLOAD_BYTES;

  const rawBytes = utf8ByteLength(JSON.stringify(data));
  if (rawBytes <= limit) {
    return data;
  }

  addIssue(issues, "event_truncated", "tool_payload_limit");

  const priorityKeys = [
    "toolCallId",
    "callId",
    "toolName",
    "tool",
    "name",
    "agentId",
    "state",
    "status",
    "activity",
    "displayName",
    "title",
    "subagentType",
    "modelName",
    "description",
    "toolUses",
    "tokens",
    "tokensUsage",
    "agentMdPath",
    "turnCount",
    "maxTurns",
    "durationMs",
    "tags",
    "error",
    "id",
    "role",
    "seq",
    "timestamp",
    "command",
    "path",
    "exitCode",
    "mode",
    "agent",
  ];

  const extractCappedDetails = (rawDetails: Record<string, unknown>): Record<string, unknown> => {
    const details: Record<string, unknown> = { truncated: true };
    for (const key of priorityKeys) {
      if (rawDetails[key] !== undefined) {
        details[key] = rawDetails[key];
      }
    }
    return details;
  };

  const capped: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(data)) {
    if (isPriorityKey(k) || priorityKeys.includes(k)) {
      if (typeof v === "object" && v !== null) {
        capped[k] = pruneDataPreservingPriority(v, k);
      } else {
        capped[k] = v;
      }
    }
  }
  if (data.args !== undefined) {
    if (typeof data.args === "object" && data.args !== null && !Array.isArray(data.args)) {
      const rawArgs = data.args as Record<string, unknown>;
      const cappedArgs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawArgs)) {
        if (priorityKeys.includes(k) || isPriorityKey(k)) {
          cappedArgs[k] = v;
        } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
          cappedArgs[k] = v;
        } else if (typeof v === "string") {
          cappedArgs[k] = v.length > 256 ? truncateReplayText(v, limit, issues) : v;
        } else if (Array.isArray(v)) {
          if (k === "tags" || (v.length <= 100 && v.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean"))) {
            cappedArgs[k] = v;
          } else {
            cappedArgs[k] = [REPLAY_BYTE_TRUNCATION_MARKER];
          }
        } else if (typeof v === "object" && v !== null) {
          if (k === "details") {
            cappedArgs[k] = extractCappedDetails(v as Record<string, unknown>);
          } else {
            const innerObj = v as Record<string, unknown>;
            const innerCapped: Record<string, unknown> = {};
            for (const [ik, iv] of Object.entries(innerObj)) {
              if (priorityKeys.includes(ik) || isPriorityKey(ik) || typeof iv === "number" || typeof iv === "boolean" || iv === null) {
                innerCapped[ik] = iv;
              }
            }
            cappedArgs[k] = innerCapped;
          }
        }
      }
      capped.args = cappedArgs;
    } else if (typeof data.args === "string") {
      capped.args = truncateReplayText(data.args, limit, issues);
    } else {
      capped.args = data.args;
    }
  }

  let textSource: string | undefined;
  let textTargetSetter: ((txt: string) => void) | undefined;

  if (eventType === "tool_execution_end") {
    if (data.details && typeof data.details === "object" && !Array.isArray(data.details)) {
      capped.details = extractCappedDetails(data.details as Record<string, unknown>);
    }

    if (data.result === "") {
      capped.result = "";
    } else if (data.result !== undefined) {
      const res = capResultOrContent(data.result, limit, issues);
      capped.result = res;
      if (typeof res === "string") {
        textSource = String(data.result);
        textTargetSetter = (txt) => { capped.result = txt; };
      } else if (res && typeof res === "object" && Array.isArray((res as any).content)) {
        const c0 = (res as any).content[0];
        if (c0 && typeof c0 === "object" && typeof c0.text === "string") {
          textSource = String(((data.result as any)?.content?.[0] as any)?.text ?? c0.text);
          textTargetSetter = (txt) => { (capped.result as any).content = [{ type: c0.type ?? "text", text: txt }]; };
        }
      }
    }
  } else {
    // tool_execution_update
    let rawDetails: Record<string, unknown> | undefined;
    if (
      data.partialResult &&
      typeof data.partialResult === "object" &&
      !Array.isArray(data.partialResult) &&
      (data.partialResult as Record<string, unknown>).details &&
      typeof (data.partialResult as Record<string, unknown>).details === "object"
    ) {
      rawDetails = (data.partialResult as Record<string, unknown>).details as Record<string, unknown>;
    } else if (data.details && typeof data.details === "object" && !Array.isArray(data.details)) {
      rawDetails = data.details as Record<string, unknown>;
    }

    const cappedDetails = rawDetails ? extractCappedDetails(rawDetails) : undefined;
    const rawPR = data.partialResult;

    if (rawPR === "") {
      capped.partialResult = cappedDetails ? { details: cappedDetails } : "";
    } else if (rawPR !== undefined) {
      if (typeof rawPR === "string") {
        const text = truncateReplayText(rawPR, limit, issues);
        capped.partialResult = cappedDetails ? { details: cappedDetails, content: text } : text;
        textSource = rawPR;
        textTargetSetter = (txt) => {
          capped.partialResult = cappedDetails ? { details: cappedDetails, content: txt } : txt;
        };
      } else if (typeof rawPR === "object" && rawPR !== null) {
        const prObj = rawPR as Record<string, unknown>;
        const prCapped: Record<string, unknown> = {};
        if (cappedDetails) {
          prCapped.details = cappedDetails;
        }

        if (Array.isArray(prObj.content)) {
          const c0 = prObj.content[0];
          let blockText = "";
          if (c0 && typeof c0 === "object" && typeof (c0 as any).text === "string") {
            blockText = (c0 as any).text;
          }
          prCapped.content = [{ type: "text", text: truncateReplayText(blockText, limit, issues) }];
          textSource = blockText;
          textTargetSetter = (txt) => {
            (capped.partialResult as any).content = [{ type: "text", text: txt }];
          };
        } else if (typeof prObj.text === "string") {
          prCapped.text = truncateReplayText(prObj.text, limit, issues);
          textSource = prObj.text;
          textTargetSetter = (txt) => {
            (capped.partialResult as any).text = txt;
          };
        }

        capped.partialResult = prCapped;
      } else {
        capped.partialResult = rawPR;
      }
    } else if (cappedDetails) {
      capped.partialResult = { details: cappedDetails };
    }
  }

  for (const [k, v] of Object.entries(data)) {
    if (
      k !== "toolCallId" &&
      k !== "toolName" &&
      k !== "args" &&
      k !== "isError" &&
      k !== "details" &&
      k !== "result" &&
      k !== "partialResult" &&
      !(k in capped)
    ) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
        capped[k] = v;
      }
    }
  }

  let currentBytes = utf8ByteLength(JSON.stringify(capped));
  if (currentBytes > limit && textSource && textTargetSetter) {
    const markerOverhead = utf8ByteLength(JSON.stringify(REPLAY_BYTE_TRUNCATION_MARKER));
    const baseOverhead = currentBytes - utf8ByteLength(JSON.stringify(textSource));
    let allowedTextBytes = Math.max(1, limit - baseOverhead - markerOverhead - 32);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const truncatedText = truncateReplayText(textSource, allowedTextBytes, issues);
      textTargetSetter(truncatedText);
      currentBytes = utf8ByteLength(JSON.stringify(capped));
      if (currentBytes <= limit) break;
      allowedTextBytes = Math.max(1, Math.floor(allowedTextBytes / 2));
    }
  }

  if (currentBytes > limit && capped.args && typeof capped.args === "object" && !Array.isArray(capped.args)) {
    const argsObj = capped.args as Record<string, unknown>;
    const stringEntries = Object.entries(argsObj)
      .filter(([k, v]) => typeof v === "string" && !priorityKeys.includes(k) && !isPriorityKey(k))
      .map(([k, v]) => ({ key: k, value: v as string, bytes: utf8ByteLength(v as string) }))
      .sort((a, b) => b.bytes - a.bytes);

    for (const item of stringEntries) {
      if (currentBytes <= limit) break;
      const over = currentBytes - limit;
      const target = Math.max(10, item.bytes - over - 64);
      argsObj[item.key] = truncateReplayText(item.value, target, issues);
      currentBytes = utf8ByteLength(JSON.stringify(capped));
    }
  }

  if (utf8ByteLength(JSON.stringify(capped)) > limit) {
    if (capped.details && typeof capped.details === "object") {
      capped.details = extractCappedDetails(capped.details as Record<string, unknown>);
    }
    if (
      capped.partialResult &&
      typeof capped.partialResult === "object" &&
      (capped.partialResult as any).details
    ) {
      (capped.partialResult as any).details = extractCappedDetails(
        (capped.partialResult as any).details as Record<string, unknown>,
      );
    }
  }

  if (utf8ByteLength(JSON.stringify(capped)) > limit) {
    const minimal = pruneDataPreservingPriority(data) as Record<string, unknown>;
    if (eventType === "tool_execution_end") {
      if (data.result === "") minimal.result = "";
      else if (data.result && typeof data.result === "object" && Object.keys(data.result as object).length === 0) {
        minimal.result = Array.isArray(data.result) ? [] : {};
      }
    } else {
      if (data.partialResult === "") minimal.partialResult = "";
    }
    return utf8ByteLength(JSON.stringify(minimal)) <= limit ? minimal : {
      toolCallId: typeof data.toolCallId === "string" ? data.toolCallId.slice(0, 32) : "",
      toolName: typeof data.toolName === "string" ? data.toolName.slice(0, 32) : "",
      ...(data.result && typeof data.result === "object" && Object.keys(data.result as object).length === 0
        ? { result: Array.isArray(data.result) ? [] : {} }
        : {}),
    };
  }

  return capped;
}



function pruneDataPreservingPriority(data: unknown, parentKey?: string | number): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "number" || typeof data === "boolean") return data;
  if (typeof data === "string") {
    if (parentKey !== undefined && isPriorityKey(parentKey)) {
      return data;
    }
    return REPLAY_BYTE_TRUNCATION_MARKER;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (parentKey !== undefined && isPriorityKey(parentKey)) {
      return data.map((item) => pruneDataPreservingPriority(item, parentKey));
    }
    const prunedList = data.map((item) => pruneDataPreservingPriority(item, parentKey)).filter((item) => item !== undefined);
    return prunedList;
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) return {};
    const pruned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (isPriorityKey(k) || (parentKey !== undefined && isPriorityKey(parentKey))) {
        pruned[k] = pruneDataPreservingPriority(v, k);
      } else if (v && typeof v === "object") {
        if (Array.isArray(v)) {
          if (v.length === 0) pruned[k] = [];
          else {
            const innerPruned = pruneDataPreservingPriority(v, k);
            pruned[k] = Array.isArray(innerPruned) ? innerPruned : [];
          }
        } else {
          const innerKeys = Object.keys(v as object);
          if (innerKeys.length === 0) {
            pruned[k] = {};
          } else {
            const innerPruned = pruneDataPreservingPriority(v, k);
            pruned[k] = innerPruned;
          }
        }
      } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
        pruned[k] = v;
      }
    }
    return pruned;
  }
  return data;
}

function boundEventBytes(
  event: DashboardEvent,
  maxEventBytes: number,
  issues: ReplayPreparationIssue[],
  maxToolPayloadBytes?: number,
): DashboardEvent {
  const limit = Number.isFinite(maxEventBytes) && maxEventBytes > 0
    ? Math.floor(maxEventBytes)
    : MAX_REPLAY_EVENT_BYTES;
  const toolCapApplies = maxToolPayloadBytes !== undefined && event.eventType.startsWith("tool_execution_");
  const toolDataLimit = toolCapApplies ? maxToolPayloadBytes : Number.POSITIVE_INFINITY;
  let bytes = utf8ByteLength(JSON.stringify(event));
  let dataBytes = utf8ByteLength(JSON.stringify(event.data));
  if (bytes <= limit && (!toolCapApplies || dataBytes <= toolDataLimit)) return event;

  const locations: StringLocation[] = [];
  collectStringLocations(event.data, locations);
  locations.sort((left, right) => {
    if (left.priorityRank !== right.priorityRank) {
      return left.priorityRank - right.priorityRank;
    }
    return right.bytes - left.bytes;
  });

  const markerBytes = utf8ByteLength(REPLAY_BYTE_TRUNCATION_MARKER);
  for (let pass = 0; pass < 5; pass++) {
    if (bytes <= limit && (!toolCapApplies || dataBytes <= toolDataLimit)) break;
    let progressed = false;
    for (const location of locations) {
      if (bytes <= limit && (!toolCapApplies || dataBytes <= toolDataLimit)) break;
      if (location.priorityRank === 2) continue;
      const overage = Math.max(
        bytes > limit ? bytes - limit : 0,
        toolCapApplies && dataBytes > toolDataLimit ? dataBytes - toolDataLimit : 0,
      );
      const current = location.parent[location.key as never] as unknown as string;
      if (typeof current !== "string") continue;
      const currentBytes = utf8ByteLength(current);
      const target = Math.max(1, currentBytes - overage - markerBytes);
      const replacement = REPLAY_BYTE_TRUNCATION_MARKER + suffixWithinUtf8Budget(location.value, target);
      if (replacement === current) continue;
      location.parent[location.key as never] = replacement as never;
      progressed = true;
      bytes = utf8ByteLength(JSON.stringify(event));
      dataBytes = utf8ByteLength(JSON.stringify(event.data));
    }
    if (!progressed) break;
  }

  addIssue(issues, "event_truncated", "event_byte_limit");
  if (bytes <= limit && (!toolCapApplies || dataBytes <= toolDataLimit)) return event;

  const priorityPreservedData = pruneDataPreservingPriority(event.data) as Record<string, unknown>;
  const fallback: DashboardEvent = {
    ...event,
    data: priorityPreservedData,
  };
  bytes = utf8ByteLength(JSON.stringify(fallback));
  dataBytes = utf8ByteLength(JSON.stringify(fallback.data));
  if (bytes <= limit && (!toolCapApplies || dataBytes <= toolDataLimit)) return fallback;

  return {
    eventType: event.eventType.slice(0, 32),
    timestamp: event.timestamp,
    data: priorityPreservedData,
  };
}

function deepClonePlain(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i += 1) {
      copy[i] = deepClonePlain(value[i], seen);
    }
    return copy;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    copy[k] = deepClonePlain(v, seen);
  }
  return copy;
}

function cloneDataPayload(data: Record<string, unknown>): Record<string, unknown> {
  return deepClonePlain(data) as Record<string, unknown>;
}

function canonicalizeEventEnvelope(
  event: unknown,
  issues: ReplayPreparationIssue[],
): DashboardEvent {
  try {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("envelope");
    const record = event as Record<string, unknown>;
    const eventType = record.eventType;
    const timestamp = record.timestamp;
    const data = record.data;
    if (
      typeof eventType !== "string" ||
      typeof timestamp !== "number" || !Number.isFinite(timestamp) ||
      !data || typeof data !== "object" || Array.isArray(data)
    ) throw new TypeError("envelope");
    return { eventType, timestamp, data: cloneDataPayload(data as Record<string, unknown>) };
  } catch (error) {
    addIssue(issues, "malformed_event", "envelope");
    addIssue(issues, "serialization_failed", error instanceof Error ? error.name : "envelope");
    return { eventType: "unknown", timestamp: 0, data: {} };
  }
}

export function prepareEventForReplay(
  event: DashboardEvent,
  options: PrepareEventForReplayOptions = {},
): PreparedReplayEvent {
  const issues: ReplayPreparationIssue[] = [];
  const envelope = canonicalizeEventEnvelope(event, issues);
  const assetState: AssetRewriteState = {
    hashes: new Set<string>(),
    inlineHashesByMime: new Map<string, Map<string, string>>(),
  };
  // Reserved asset records must be recognized before generic recursion so inline
  // bytes and arbitrary extras never enter the sanitized replay payload.
  const rewritten = rewriteInlineAssets(envelope.data, options, issues, assetState);
  const sanitized = sanitizeValue(rewritten, issues, new WeakSet<object>());
  let data = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
  validateContentBlocks(data, issues);

  if (envelope.eventType.startsWith("tool_execution_")) {
    if (typeof data.toolCallId !== "string" || data.toolCallId.length === 0) {
      addIssue(issues, "malformed_tool_event", "toolCallId");
    }
    if (typeof data.toolName !== "string" || data.toolName.length === 0) {
      addIssue(issues, "malformed_tool_event", "toolName");
    }
  }
  if (options.maxToolPayloadBytes !== undefined && envelope.eventType.startsWith("tool_execution_")) {
    data = capToolEventPayload(envelope.eventType, data, options.maxToolPayloadBytes, issues);
  }

  const textCap = options.maxTextBytes ?? DEFAULT_MAX_REPLAY_TEXT_BYTES;
  if (options.maxToolPayloadBytes === undefined && envelope.eventType === "tool_execution_end" && Object.hasOwn(data, "result")) {
    if (typeof data.result === "string") {
      if (data.result !== "{}" && data.result !== "[]") {
        data.result = truncateReplayText(data.result, textCap, issues);
      }
    } else if (data.result && typeof data.result === "object") {
      if (Array.isArray(data.result)) {
        if (data.result.length > 0) {
          data.result = truncateReplayText(data.result, textCap, issues);
        }
      } else if (Object.keys(data.result as object).length > 0) {
        data.result = truncateReplayText(data.result, textCap, issues);
      }
    }
  }
  if (options.maxToolPayloadBytes === undefined && envelope.eventType === "tool_execution_update" && Object.hasOwn(data, "partialResult")) {
    if (typeof data.partialResult === "string") {
      data.partialResult = truncateReplayText(data.partialResult, textCap, issues);
    }
  }
  const preparedEvent = boundEventBytes(
    { ...envelope, data },
    options.maxEventBytes ?? MAX_REPLAY_EVENT_BYTES,
    issues,
    options.maxToolPayloadBytes,
  );
  const hashes = new Set<string>();
  collectAssetHashes(preparedEvent, hashes, issues);
  return { event: preparedEvent, assetHashes: [...hashes], issues };
}
