import { describe, expect, it } from "vitest";
import type {
  AssetReplayChunkMessage,
  AssetUnavailableMessage,
  BrowserToServerMessage,
  EventReplayMessage,
  ReplayDiagnosticMessage,
  ServerToBrowserMessage,
  SessionStateResetMessage,
  SessionsSnapshotMessage,
  SubscribeMessage,
} from "../browser-protocol.js";

const replay = {
  type: "event_replay",
  sessionId: "session-1",
  requestId: "request-1",
  sourceGeneration: "server-1:3",
  replayKind: "cold",
  events: [],
  isLast: true,
  windowMinSeq: null,
  windowMaxSeq: null,
  retainedMinSeq: null,
  hasMoreOlder: false,
  partialHead: false,
  historyTruncated: false,
} satisfies EventReplayMessage;

const reset = {
  type: "session_state_reset",
  sessionId: "session-1",
  requestId: "request-1",
  sourceGeneration: "server-1:4",
  reason: "source_replaced",
} satisfies SessionStateResetMessage;

const chunk = {
  type: "asset_replay_chunk",
  sessionId: "session-1",
  requestId: "request-1",
  sourceGeneration: "server-1:4",
  hash: "abc123",
  mimeType: "image/png",
  chunkIndex: 0,
  chunkCount: 1,
  data: "AAAA",
} satisfies AssetReplayChunkMessage;

const unavailable = {
  type: "asset_unavailable",
  sessionId: "session-1",
  requestId: "request-1",
  sourceGeneration: "server-1:4",
  hash: "missing",
  reason: "missing",
} satisfies AssetUnavailableMessage;

const subscribe = {
  type: "subscribe",
  sessionId: "session-1",
  requestId: "request-1",
  knownSourceGeneration: "server-1:3",
  lastSeq: 10,
  mode: "tail",
} satisfies SubscribeMessage;

const snapshot = {
  type: "sessions_snapshot",
  serverEpoch: "server-1",
  sessions: [],
  orders: {},
} satisfies SessionsSnapshotMessage;

const diagnostic = {
  type: "replay_diagnostic",
  code: "terminal_timeout",
  sessionId: "session-1",
  requestId: "request-1",
  sourceGeneration: "server-1:3",
  connectionEpoch: 2,
  replayGeneration: 4,
  contiguousMinSeq: 1,
  contiguousMaxSeq: 10,
  eventCount: 10,
  byteCount: 2048,
  durationMs: 15_000,
  scrollOwner: "READING_HISTORY",
} satisfies ReplayDiagnosticMessage;

const serverMessages: ServerToBrowserMessage[] = [replay, reset, chunk, unavailable, snapshot];
const browserMessages: BrowserToServerMessage[] = [subscribe, diagnostic];

describe("generation-bound replay protocol", () => {
  it("round-trips correlated nullable terminal metadata", () => {
    expect(JSON.parse(JSON.stringify(serverMessages))).toEqual(serverMessages);
    expect(replay.windowMinSeq).toBeNull();
    expect(replay.windowMaxSeq).toBeNull();
  });

  it("keeps asset delivery and diagnostics in their protocol unions", () => {
    expect(serverMessages.map((message) => message.type)).toContain("asset_replay_chunk");
    expect(serverMessages.map((message) => message.type)).toContain("asset_unavailable");
    expect(browserMessages.map((message) => message.type)).toContain("replay_diagnostic");
  });
});
