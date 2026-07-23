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

type StringParent = Record<string, unknown> | unknown[];
interface StringLocation {
  parent: StringParent;
  key: string | number;
  value: string;
  bytes: number;
}

function collectStringLocations(value: unknown, locations: StringLocation[]): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      if (typeof child === "string") {
        locations.push({ parent: value, key: index, value: child, bytes: utf8ByteLength(child) });
      } else collectStringLocations(child, locations);
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (typeof child === "string") {
        locations.push({ parent: record, key, value: child, bytes: utf8ByteLength(child) });
      } else collectStringLocations(child, locations);
    }
  }
}

function boundEventBytes(
  event: DashboardEvent,
  maxEventBytes: number,
  issues: ReplayPreparationIssue[],
): DashboardEvent {
  const limit = Number.isFinite(maxEventBytes) && maxEventBytes > 0
    ? Math.floor(maxEventBytes)
    : MAX_REPLAY_EVENT_BYTES;
  let bytes = utf8ByteLength(JSON.stringify(event));
  if (bytes <= limit) return event;

  const locations: StringLocation[] = [];
  collectStringLocations(event.data, locations);
  locations.sort((left, right) => right.bytes - left.bytes);
  // Bounded multi-pass shrink: a single pass sizes the replacement from its
  // raw UTF-8 byte length, but the wire size is its JSON-serialized length —
  // `REPLAY_BYTE_TRUNCATION_MARKER`'s embedded `\n` escapes to `\n` (+1 byte)
  // under JSON.stringify, so a target computed to land exactly at `limit` can
  // still serialize a few bytes over. Re-scan and re-shrink until the event
  // actually fits (or no location can shrink further), instead of falling
  // straight to the full-data `replayUnavailable` wipe on a near-boundary miss.
  const markerBytes = utf8ByteLength(REPLAY_BYTE_TRUNCATION_MARKER);
  for (let pass = 0; pass < 5 && bytes > limit; pass++) {
    let progressed = false;
    for (const location of locations) {
      if (bytes <= limit) break;
      const overage = bytes - limit;
      const current = location.parent[location.key as never] as unknown as string;
      const currentBytes = utf8ByteLength(current);
      const target = Math.max(1, currentBytes - overage - markerBytes);
      const replacement = REPLAY_BYTE_TRUNCATION_MARKER + suffixWithinUtf8Budget(location.value, target);
      if (replacement === current) continue;
      location.parent[location.key as never] = replacement as never;
      progressed = true;
      bytes = utf8ByteLength(JSON.stringify(event));
    }
    if (!progressed) break;
  }

  addIssue(issues, "event_truncated", "event_byte_limit");
  if (bytes <= limit) return event;
  const fallback: DashboardEvent = {
    ...event,
    data: { replayUnavailable: true },
  };
  return utf8ByteLength(JSON.stringify(fallback)) <= limit ? fallback : {
    eventType: event.eventType.slice(0, 32),
    timestamp: event.timestamp,
    data: {},
  };
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
    return { eventType, timestamp, data: data as Record<string, unknown> };
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

  if (envelope.eventType === "tool_execution_end" && Object.hasOwn(data, "result")) {
    data.result = truncateReplayText(data.result, options.maxTextBytes, issues);
  }

  const preparedEvent = boundEventBytes(
    { ...envelope, data },
    options.maxEventBytes ?? MAX_REPLAY_EVENT_BYTES,
    issues,
  );
  const hashes = new Set<string>();
  collectAssetHashes(preparedEvent, hashes, issues);
  return { event: preparedEvent, assetHashes: [...hashes], issues };
}
