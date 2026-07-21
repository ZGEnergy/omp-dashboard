import { isWidgetBarPrompt } from "@blackbelt-technology/dashboard-plugin-runtime";
import { EmptyState } from "@blackbelt-technology/pi-dashboard-client-utils/EmptyState";
import { Skeleton } from "@blackbelt-technology/pi-dashboard-client-utils/Skeleton";
import { toolCallPrefKey } from "@blackbelt-technology/pi-dashboard-shared/display-prefs.js";
import { isInputNeededTool } from "@blackbelt-technology/pi-dashboard-shared/input-needed-tools.js";
import { mdiCheck, mdiChevronDown, mdiChevronUp, mdiClose, mdiContentCopy, mdiLoading, mdiSourceFork, mdiTextBox } from "@mdi/js";
import { Icon } from "@mdi/react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveChatSelection } from "../hooks/useActiveChatSelection.js";
import { isDebugTool } from "../hooks/useDebugToolsVisible.js";
import { useDisplayPrefs } from "../hooks/useDisplayPrefs.js";
import { useFxVisibility } from "../hooks/useFxVisibility.js";
import { useMobile } from "../hooks/useMobile.js";
import { buildSelectionClipboardText } from "../lib/chat-selection-copy.js";
import { buildTurnToFirstRowIndex, computeRowTextChars, estimateVirtualRowSize, extendRangeWithSelection, isBurst, isGroup, rangeToRowIndexSpan, type SelectionRowSpan, virtualRowKey } from "../lib/chat-virtual-rows.js";
import { findActiveInteractiveToolResultIds, findRetriedErrorIds, findSurfaceSuppressedErrorIds } from "../lib/collapse-retried-errors.js";
// RetryBanner + ErrorBanner replaced by the unified SessionBanner mounted
// in App.tsx (sticky above the command input). See change:
// unify-status-banner-and-terminal-limit-stop.
import type { ChatImage, InteractiveUiRequest, SessionState } from "../lib/event-reducer.js";
import { formatMessageTime } from "../lib/format.js";
import { type BurstItem, groupToolBursts, type ToolBurstGroup as ToolBurstGroupData } from "../lib/group-tool-bursts.js";
import type { ToolCallGroup } from "../lib/group-tool-calls.js";
import { t as i18nT } from "../lib/i18n";
import { buildTurnSummaries, type TurnSummary } from "../lib/lineDelta.js";
import { isOutOfCwd, normalizeUnderCwd } from "../lib/normalize-path.js";
import { AdvisorCard } from "./AdvisorCard.js";
import { BashOutputCard } from "./BashOutputCard.js";
import { ChangeSummaryBlock } from "./ChangeSummaryBlock.js";
import { CollapsedToolGroup } from "./CollapsedToolGroup.js";
import { CommandFeedbackCard } from "./CommandFeedbackCard.js";
import { CopyButton } from "./CopyButton.js";
import { MissingToolInlineError } from "./chat/MissingToolInlineError.js";
import { FilePreviewHost, FilePreviewProvider } from "./FilePreviewContext.js";
import { ImageLightbox } from "./ImageLightbox.js";
import { InlineTerminalCard } from "./InlineTerminalCard.js";
import { getInteractiveRenderer } from "./interactive-renderers/registry.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { PreviewCard } from "./PreviewCard.js";
import { RawEventCard } from "./RawEventCard.js";
import { RetriedErrorBadge } from "./RetriedErrorBadge.js";
import { SkillInvocationCard } from "./SkillInvocationCard.js";
import { useOptionalSplitWorkspace } from "./SplitWorkspaceContext.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { ToolBurstGroup } from "./ToolBurstGroup.js";
import { ToolCallStep } from "./ToolCallStep.js";
import type { ToolContext } from "./tool-renderers/index.js";

interface Props {
  sessionId?: string;
  state: SessionState;
  toolContext: ToolContext;
  // onCancelPending removed — pi exposes no queue-mutation API, so the
  // cancel-pending callback was always a shadow-only lie. See change:
  // honest-mid-turn-queue-surface.
  onRespondToUi?: (requestId: string, result?: unknown, cancelled?: boolean) => void;
  onAbort?: () => void;
  onForceKill?: () => void;
  onForkFromMessage?: (entryId: string) => void;
  /**
   * Close a live inline terminal card (sends close_inline_terminal). The
   * parent binds the owning sessionId. See change: add-inline-terminal-card.
   */
  onCloseInlineTerminal?: (terminalId: string) => void;
  // onDismissError / onRetryAfterError moved to App.tsx → SessionBanner.
  // See change: unify-status-banner-and-terminal-limit-stop.
  /**
   * Pending steer messages from `Session.pendingQueues.steering`. Rendered
   * inline at the bottom of the chat list as user-style bubbles with a
   * "STEERING" header + spinner + ✕ cancel. Once pi drains them on
   * `turn_end`, the bridge clears the shadow and the chat naturally shows
   * the real user message via `message_end`. See change: add-followup-edit-and-steer-cancel.
   */
  pendingSteering?: string[];
  /**
   * Selected session's "history loading" flag. When true and the chat is
   * empty, render a loading indicator instead of the "No messages yet"
   * placeholder — distinguishes history-in-flight from a genuinely empty
   * session. See change: show-chat-history-loading-indicator.
   */
  loadingHistory?: boolean;
  /**
   * Client-only signal: the user manually collapsed the LIVE streaming
   * reasoning block. Sets `streamingThinkingCollapsed` on the session state so
   * the collapse survives the streaming→committed swap (committed block stays
   * collapsed, no hold-open timer). No server round-trip.
   * See change: reasoning-auto-collapse-timer.
   */
  onCollapseStreamingThinking?: () => void;
  // onCancelSteering / onCancelPending omitted: pi exposes no queue-mutation
  // API. Steering bubbles render display-only; cancellation requires upstream
  // pi support (tracked separately). See change: honest-mid-turn-queue-surface.
  /**
   * Send the per-session display-prefs override. Optional — omit when the
   * menu should not render (e.g. archived/dataUnavailable views).
   * See change: configurable-chat-display.
   */
  /** Current sparse override for the session, or `undefined`. */
  /**
   * Older messages remain on the server for this session — renders the
   * "load older" affordance at the top of the virtual list.
   * See change: session-tail-rehydrate.
   */
  hasMoreOlder?: boolean;
  /** True when the retained replay window starts after the session head. */
  partialHead?: boolean;
  /** Older-history fetch in flight — renders a spinner in the load-older affordance. See change: session-tail-rehydrate. */
  loadingOlder?: boolean;
  /** Visible mobile-detail ownership. Omit on desktop/legacy callers. */
  mobileActive?: boolean;
  /** Increments for every visible mobile activation, including same-session returns. */
  mobileActivationEpoch?: number;
  /** Invalidates scroll work when replay/source/reset authority changes. */
  replayGeneration?: number;
  /**
   * Request an older page. ChatView captures the visible row first and mints
   * the anchor token synchronously; the replay controller retains the token
   * across retries and returns it only with the matching terminal.
   */
  onLoadOlder?: (anchorToken: string) => void;
  /** Anchor token returned by the matching older terminal. */
  completedOlderAnchorToken?: string | null;
}

function ImageAttachments({
  images,
  onImageLoad,
}: {
  images: ChatImage[];
  /**
   * Fired when an attached `<img>` finishes decoding. In the virtualized
   * transcript the owning row is first measured pre-decode (img ~0px); this
   * signal lets ChatView re-measure the row at its true post-decode height so
   * the message cannot stay collapsed and overlap its neighbour (issue #267).
   */
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);
  // Track decoded images so the reserved loading box is dropped once the real
  // intrinsic size is known (a bounded box avoids the near-zero pre-decode
  // measurement without distorting small decoded images).
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  return (
    <>
      <div className="flex gap-2 flex-wrap mb-2">
        {images.map((img, i) => {
          const src = `data:${img.mimeType};base64,${img.data}`;
          const reserve = !loaded.has(i) ? "min-w-[80px] min-h-[80px]" : "";
          return (
            <img
              key={i}
              src={src}
              alt={`Attachment ${i + 1}`}
              className={`max-w-[300px] max-h-[300px] ${reserve} rounded border border-white/20 object-contain cursor-pointer`}
              onLoad={(e) => {
                setLoaded((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
                onImageLoad?.(e);
              }}
              onClick={() => setLightboxSrc({ src, alt: `Attachment ${i + 1}` })}
            />
          );
        })}
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc.src} alt={lightboxSrc.alt} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}

/**
 * Inline badge on a user bubble showing how pi delivered the message when it
 * arrived mid-stream (pi 0.77+ `InputEvent.streamingBehavior`). "steer" =
 * interrupted the current turn; "followUp" = queued for after it. Absent for
 * idle / non-interactive inputs. See change: surface-input-streaming-behavior.
 */
function StreamingBehaviorBadge({ behavior }: { behavior: "steer" | "followUp" }) {
  const isSteer = behavior === "steer";
  return (
    <span
      className="inline-flex items-center self-end mb-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300/80"
      title={
        isSteer
          ? "Interrupted and steered the current turn"
          : "Queued — delivered after the current turn ends"
      }
    >
      {isSteer ? "steered" : "queued"}
    </span>
  );
}

function MessageBubble({ content, className, timestamp, entryId, onFork, context }: { content: string; className: string; timestamp?: number; entryId?: string; onFork?: (entryId: string) => void; context?: ToolContext }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const getPlainText = useCallback(() => {
    return contentRef.current?.innerText ?? content;
  }, [content]);

  return (
    <div className={className}>
      <div ref={contentRef}>
        <MarkdownContent content={content} context={context} />
      </div>
      <div className="border-t border-[var(--border-secondary)] mt-2 pt-1.5 flex justify-end items-center gap-0.5 opacity-50 hover:opacity-100 transition-opacity">
        {timestamp != null && (
          <span className="text-[10px] text-[var(--text-tertiary)] mr-auto">{formatMessageTime(timestamp)}</span>
        )}
        <CopyButton getText={() => content} icon={<Icon path={mdiContentCopy} size={0.6} />} title={i18nT("common.copyAsMarkdown", undefined, "Copy as Markdown")} />
        <CopyButton getText={getPlainText} icon={<Icon path={mdiTextBox} size={0.6} />} title={i18nT("common.copyAsPlainText", undefined, "Copy as plain text")} />
        {entryId && onFork && (
          <button
            onClick={() => onFork(entryId)}
            title={i18nT("session.forkFromHere", undefined, "Fork from here")}
            className="p-0.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
          >
            <Icon path={mdiSourceFork} size={0.6} />
          </button>
        )}
      </div>
    </div>
  );
}

function InteractiveUiCard({ request, onRespondToUi }: {
  request: InteractiveUiRequest;
  onRespondToUi?: (requestId: string, result?: unknown, cancelled?: boolean) => void;
}) {
  const Renderer = getInteractiveRenderer(request.method);
  return (
    <Renderer
      requestId={request.requestId}
      method={request.method}
      params={request.params}
      status={request.status}
      result={request.result}
      onRespond={(result) => onRespondToUi?.(request.requestId, result)}
      onCancel={() => onRespondToUi?.(request.requestId, undefined, true)}
    />
  );
}

/** Check if markdown content contains a mermaid code block */
function hasMermaid(content: string): boolean {
  return /```mermaid\b/.test(content);
}

const SCROLL_THRESHOLD = 50;

type ScrollOwner =
  | "HYDRATING"
  | "FOLLOWING"
  | "READING_HISTORY"
  | "RESTORING_ANCHOR"
  | "NAVIGATING_TOP"
  | "NAVIGATING_BOTTOM";

interface ScrollAuthority {
  sessionId: string | null;
  mobileActive: boolean;
  mobileActivationEpoch: number;
  replayGeneration: number;
  element: HTMLDivElement | null;
}

interface CapturedScrollAnchor {
  token: string;
  rowId: string | null;
  offset: number;
  authority: ScrollAuthority;
  cancelled: boolean;
  restoring: boolean;
}

// Retained-row ceiling for an active selection (change:
// preserve-chat-selection-during-churn, D3). The `rangeExtractor` keeps up to
// this many selection-intersecting rows mounted; past it the view actively
// clears the selection rather than force-mounting the span. Device-aware: rows
// carry heavy subtrees (Prism/xterm/mermaid/SubagentDetailView) + one
// ResizeObserver each, so mobile drag stays bounded lower. Coarse interim
// units pending a measured pixel/node budget.
const SELECTION_RETAIN_CAP_DESKTOP = 100;
const SELECTION_RETAIN_CAP_MOBILE = 40;

// Per-session scroll state, persisted across session switches
const scrollStateMap = new Map<string, { anchorRowId: string | null; offset: number; rawTop: number; nearBottom: boolean }>();

export interface ChatViewHandle {
  scrollToTurn: (turnIndex: number) => void;
}

const ChatViewInner = forwardRef<ChatViewHandle, Props>(function ChatView({ sessionId, state, toolContext, onRespondToUi, onAbort, onForceKill, onForkFromMessage, onCloseInlineTerminal, pendingSteering, loadingHistory, hasMoreOlder, loadingOlder, mobileActive, mobileActivationEpoch = 0, replayGeneration = 0, onLoadOlder, completedOlderAnchorToken, onCollapseStreamingThinking }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Desktop retains its saved anchor; mobile ownership is explicit below.
  // These refs were accidentally removed by an interrupted migration and are
  // deliberately kept separate from the generation-bound mobile owner.
  const stickToBottomRef = useRef(true);
  const descendingRef = useRef(false);
  const ascendingRef = useRef(false);
  const loadingHistoryRef = useRef(!!loadingHistory);
  const escapedDuringHydrateRef = useRef(false);
  // One owner decides every transcript write. User input moves ownership to
  // READING_HISTORY synchronously; stale authority/command frames are inert.
  const scrollOwnerRef = useRef<ScrollOwner>(loadingHistory ? "HYDRATING" : "FOLLOWING");
  const commandEpochRef = useRef(0);
  const pendingWriteRef = useRef<{
    authority: ScrollAuthority;
    commandEpoch: number;
    run: (element: HTMLDivElement) => void;
  } | null>(null);
  const pendingMeasureRef = useRef<
    Map<HTMLElement, { authority: ScrollAuthority; commandEpoch: number; measure: (node: HTMLElement) => void }>
  >(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const userGestureRef = useRef(false);
  const gestureSerialRef = useRef(0);
  const olderGestureRef = useRef<{ id: number; olderDirected: boolean; consumed: boolean } | null>(null);
  const touchYRef = useRef<number | null>(null);
  const olderAnchorSerialRef = useRef(0);
  const pendingOlderAnchorRef = useRef<CapturedScrollAnchor | null>(null);
  const olderRequestLatchRef = useRef<string | null>(null);
  const olderContinuationRef = useRef<{ sessionId: string | null; initiated: number; baselineIds: Set<string> } | null>(null);
  const autoContinueAfterRestoreRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  // Streaming-tail selection preservation (change: preserve-streaming-tail-selection).
  // While a selection is anchored inside the live tail, the tail renders from
  // this frozen snapshot instead of the growing `state.streamingText`, so
  // MarkdownContent's memo skips re-rendering and the committed Text nodes under
  // the selection are never replaced on a chunk append. The snapshot is held
  // across `message_end` too (the committed twin is hidden — see displayRows)
  // so the anchored node is not detached at turn completion. Cleared on the
  // selection's collapse → the tail flushes to the latest streamed text.
  const tailContainerRef = useRef<HTMLDivElement>(null);
  const [frozenTailText, setFrozenTailText] = useState<string | null>(null);
  const frozenTailTextRef = useRef<string | null>(null);
  // Mirror of the live streamingText read by the freeze effect (keyed on
  // isSelecting only) so per-chunk changes do not re-run the snapshot.
  const streamingTextRef = useRef("");
  streamingTextRef.current = state.streamingText;
  // Effective display prefs for this session (configurable-chat-display).
  const prefs = useDisplayPrefs(sessionId);
  const showDebugTools = prefs.debugTools;

  // Per-turn change-summary blocks (change: add-change-summary-table). Derived
  // client-side from the raw (unfiltered) Edit/Write events so counts are
  // independent of tool-call display filters; gated on the `changeSummaryTable`
  // display pref. Memoized on message identity (performance-optimization).
  const splitWs = useOptionalSplitWorkspace();
  const cwd = splitWs?.cwd;
  // Normalize an absolute-under-cwd path to the relative-posix key the
  // server's session-diff endpoint uses, so the diff tab resolves the file
  // instead of blanking. See change: fix-session-diff-open-nongit-and-preview.
  const openDiffFile = useCallback(
    (path: string) => splitWs?.openDiffTab(normalizeUnderCwd(path, cwd)),
    [splitWs, cwd],
  );
  const turnSummaries = useMemo(() => {
    if (!prefs.changeSummaryTable) return [];
    const raw = buildTurnSummaries(state.messages);
    // Normalize file paths at the source so the displayed row and the
    // diff-open lookup share the relative key and can never diverge. Files this
    // session wrote OUTSIDE cwd are suppressed unless the opt-in pref is on
    // (opt-in-out-of-cwd-session-diffs); totals recompute over the kept files.
    return raw.map((s) => {
      const files = s.files
        .filter((f) => prefs.showOutOfCwdSessionDiffs || !isOutOfCwd(f.path, cwd))
        .map((f) => ({ ...f, path: normalizeUnderCwd(f.path, cwd) }));
      const totalAdditions = files.reduce((n, f) => n + f.additions, 0);
      const totalDeletions = files.reduce((n, f) => n + f.deletions, 0);
      return { ...s, files, totalAdditions, totalDeletions };
    });
  }, [state.messages, prefs.changeSummaryTable, prefs.showOutOfCwdSessionDiffs, cwd]);
  const { anchoredSummaries, tailSummary } = useMemo(() => {
    const anchored = new Map<string, TurnSummary>();
    let tail: TurnSummary | null = null;
    for (const s of turnSummaries) {
      if (s.boundaryUserMessageId) anchored.set(s.boundaryUserMessageId, s);
      else tail = s;
    }
    return { anchoredSummaries: anchored, tailSummary: tail };
  }, [turnSummaries]);
  const prevSessionRef = useRef(sessionId);
  const isMobile = useMobile();
  // A mobile detail remains mounted while hidden. It must not inherit the
  // desktop scroll owner or issue measurement/paging writes off-screen.
  const mobileInactive = isMobile && mobileActive === false;
  // Pause the streaming bubble's glow/shimmer when it scrolls off-screen.
  // See change: reduce-chat-render-cpu-umbrella (Phase 1, task 2.5).
  const streamFxRef = useFxVisibility<HTMLDivElement>();
  const bubbleMax = isMobile ? "max-w-[95%]" : "max-w-[80%]";
  /** Force wide when message contains a mermaid diagram */
  const bubbleWide = isMobile ? "w-[95%]" : "w-[95%]";

  // Group consecutive repeated tool calls for cleaner display.
  // Also drop user messages flagged `retriedFrom` (manual Retry button
  // produced a duplicate of the prior user bubble after an error). See
  // change: unify-status-banner-and-terminal-limit-stop.
  const filteredMessages = useMemo(() => {
    const base = showDebugTools
      ? state.messages
      : state.messages.filter((m) => m.role !== "toolResult" || !isDebugTool(m.toolName ?? ""));
    return base.filter((m) => !m.retriedFrom);
  }, [state.messages, showDebugTools]);
  const retriedErrorIds = useMemo(() => findRetriedErrorIds(filteredMessages), [filteredMessages]);
  const hiddenToolResultIds = useMemo(() => findActiveInteractiveToolResultIds(filteredMessages), [filteredMessages]);
  const activeInteractivePrompt = useMemo(() => {
    for (let index = filteredMessages.length - 1; index >= 0; index -= 1) {
      const message = filteredMessages[index];
      if (message.role !== "interactiveUi") continue;
      const args = message.args as Record<string, unknown> | undefined;
      if (args?.status !== "pending") continue;
      const cmp = (args?.params as Record<string, unknown> | undefined)?._promptBusComponent as
        | { type?: string }
        | undefined;
      if (cmp?.type && isWidgetBarPrompt(cmp.type)) continue;
      return {
        message,
        request: {
          requestId: String(args.requestId ?? ""),
          method: String(args.method ?? ""),
          params: (args.params as Record<string, unknown> | undefined) ?? {},
          status: "pending" as const,
          result: args.result,
          toolCallId: message.toolCallId,
        } satisfies InteractiveUiRequest,
      };
    }
    return null;
  }, [filteredMessages]);
  // toolCallIds owned by live `interactiveUi` messages still in the list. The
  // paired `ask_user` tool card is redundant with the interactive card (both
  // render title + message), so it is suppressed while the interactive card
  // lives — regardless of pending/resolved status or adjacency (unlike
  // hiddenToolResultIds, which is pending + adjacency only). On history reload
  // an answered prompt has NO interactiveUi row, so the set misses and the tool
  // card renders as the sole record. The reducer stamps `toolCallId` top-level
  // on the interactiveUi row (event-reducer addInteractiveRequest); `requestId`
  // (in args) is the defensive fallback. See change: fix-ask-user-card-duplication.
  const interactiveToolCallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of filteredMessages) {
      if (m.role !== "interactiveUi") continue;
      const key = m.toolCallId ?? (m.args as { requestId?: string } | undefined)?.requestId;
      if (key) ids.add(key);
    }
    return ids;
  }, [filteredMessages]);
  // Drop the redundant `ask_user` tool card BEFORE tool-burst grouping (every
  // toolResult is wrapped in a burst — threshold 1 — so post-group row filtering
  // never reaches it). The interactive card is the single render while its
  // interactiveUi row lives; on history reload (no pair) the tool card stays.
  // See change: fix-ask-user-card-duplication.
  const groupedMessages = useMemo(() => {
    const forGrouping = filteredMessages.filter(
      (m) =>
        !(m.role === "toolResult" && m.toolName === "ask_user" && interactiveToolCallIds.has(m.toolCallId ?? m.id)),
    );
    return groupToolBursts(forGrouping);
  }, [filteredMessages, interactiveToolCallIds]);
  // Single-red-surface: while the error-lifecycle surface (SessionBanner) owns
  // a failure, collapse the trailing inline failed-tool card so red isn't
  // shown twice. See change: unify-error-retry-lifecycle.
  const surfaceActive = !!(state.lastError || state.retryState);
  const surfaceSuppressedIds = useMemo(
    () => findSurfaceSuppressedErrorIds(filteredMessages, surfaceActive),
    [filteredMessages, surfaceActive],
  );

  // Prefs-gated / suppressed rows (the render's ~7 `return null` sites) are
  // filtered OUT here so the virtualizer's `count === displayRows.length` and
  // no index reserves empty spacer space (CR-5). getItemKey, the turn map, and
  // per-session persistence all key off displayRows.
  const isRowVisible = useCallback(
    (item: BurstItem): boolean => {
      if (isBurst(item) || isGroup(item)) return true;
      const msg = item as import("../lib/event-reducer.js").ChatMessage;
      if (msg.view) return true;
      switch (msg.role) {
        case "turnSeparator":
          return prefs.turnMetadata;
        case "thinking":
          return prefs.reasoning;
        case "toolResult": {
          if (!showDebugTools && isDebugTool(msg.toolName ?? "")) return false;
          const kindKey = toolCallPrefKey(msg.toolName ?? "");
          if (kindKey !== null && !prefs.toolCalls[kindKey]) return false;
          if (hiddenToolResultIds.has(msg.id)) return false;
          return true;
        }
        case "interactiveUi": {
          if (activeInteractivePrompt?.message.id === msg.id) return false;
          const args = msg.args as Record<string, unknown> | undefined;
          const cmp = (args?.params as Record<string, unknown> | undefined)?._promptBusComponent as
            | { type?: string }
            | undefined;
          return !(cmp?.type && isWidgetBarPrompt(cmp.type));
        }
        case "rawEvent":
          return showDebugTools;
        default:
          return true;
      }
    },
    [activeInteractivePrompt, prefs, showDebugTools, hiddenToolResultIds],
  );
  const displayRows = useMemo(() => {
    const rows = groupedMessages.filter(isRowVisible);
    // While a tail selection is frozen ACROSS turn completion, the committed
    // assistant twin has appeared as the last row while the frozen tail still
    // shows the same text. Hide the twin (view-only; it is never dropped from
    // state.messages) so the text is not shown twice, until the selection
    // collapses. See change: preserve-streaming-tail-selection.
    if (frozenTailText && !state.streamingText && rows.length > 0) {
      const last = rows[rows.length - 1];
      if (!isBurst(last) && !isGroup(last)) {
        const lastMsg = last as import("../lib/event-reducer.js").ChatMessage;
        if (lastMsg.role === "assistant" && lastMsg.content.startsWith(frozenTailText)) {
          return rows.slice(0, -1);
        }
      }
    }
    return rows;
  }, [groupedMessages, isRowVisible, frozenTailText, state.streamingText]);
  // Precompute each row's aggregate rendered text length ONCE per displayRows
  // rebuild (task 2.1), so `estimateSize` stays O(1) per scroll pass and never
  // walks content blocks. Feeds the content-aware estimate (Decision 1).
  const rowTextChars = useMemo(() => displayRows.map(computeRowTextChars), [displayRows]);
  const turnToFirstRowIndex = useMemo(() => buildTurnToFirstRowIndex(displayRows), [displayRows]);

  // --- Active-selection preservation (change: preserve-chat-selection-during-churn) ---
  // Row count + device-aware retained-row ceiling read as refs so the stable
  // `mapChatRange` closure and the virtualizer `rangeExtractor` always see the
  // latest values without re-subscribing.
  const rowCountRef = useRef(0);
  rowCountRef.current = displayRows.length;
  const selectionCapRef = useRef(SELECTION_RETAIN_CAP_DESKTOP);
  selectionCapRef.current = isMobile ? SELECTION_RETAIN_CAP_MOBILE : SELECTION_RETAIN_CAP_DESKTOP;

  const mapChatRange = useCallback((range: Range): SelectionRowSpan | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const span = rangeToRowIndexSpan(range, el, rowCountRef.current);
    if (span && span.max - span.min + 1 > selectionCapRef.current) {
      // Past the retained-row ceiling (notably Select-All): ACTIVELY clear the
      // selection so the outcome is visible, NOT a silently-truncated copy.
      // Passive non-extension does not collapse a Range whose endpoints sit in
      // two different removed rows — it persists with garbage offsets. See D3.
      window.getSelection()?.removeAllRanges();
      return null;
    }
    return span;
  }, []);

  const { isSelecting, selectionSpanRef } = useActiveChatSelection(scrollRef, mapChatRange);
  // Freeze/flush the streaming tail around an anchored selection (change:
  // preserve-streaming-tail-selection). On the isSelecting false→true edge, if
  // the selection sits inside the live tail, snapshot streamingText so the tail
  // stops re-rendering per chunk (buffer). On the true→false edge, clear the
  // snapshot to flush the latest text. Keyed on isSelecting only — the snapshot
  // value comes from a ref so per-chunk streamingText changes do not re-run it.
  useLayoutEffect(() => {
    if (isSelecting) {
      if (frozenTailTextRef.current == null && streamingTextRef.current) {
        const sel = typeof window !== "undefined" ? window.getSelection() : null;
        const tailEl = tailContainerRef.current;
        const inTail = !!(
          sel &&
          tailEl &&
          ((sel.anchorNode && tailEl.contains(sel.anchorNode)) ||
            (sel.focusNode && tailEl.contains(sel.focusNode)))
        );
        if (inTail) {
          frozenTailTextRef.current = streamingTextRef.current;
          setFrozenTailText(streamingTextRef.current);
        }
      }
    } else if (frozenTailTextRef.current != null) {
      frozenTailTextRef.current = null;
      setFrozenTailText(null);
    }
  }, [isSelecting]);

  // Rebuild clipboard text from the active selection (change:
  // chat-copy-fidelity-intercept). Intercept the container `copy` so partial
  // rows copy exactly the selected characters and capping renderers that opt in
  // via `data-copy-text` copy their full text — never what happens to be
  // mounted. Skip selections that don't touch the transcript so the browser's
  // native copy still owns cross-boundary drags.
  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    const sel = window.getSelection();
    if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const text = buildSelectionClipboardText(range, container);
    if (!text) return;
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  }, []);
  // Mirror into a ref so the virtualizer `onChange` (created once, invoked
  // outside render during scroll) reads the latest value.
  const isSelectingRef = useRef(false);
  isSelectingRef.current = isSelecting;

  const authorityRef = useRef<ScrollAuthority>({
    sessionId: sessionId ?? null,
    mobileActive: !!mobileActive,
    mobileActivationEpoch,
    replayGeneration,
    element: null,
  });
  authorityRef.current = {
    sessionId: sessionId ?? null,
    mobileActive: !!mobileActive,
    mobileActivationEpoch,
    replayGeneration,
    element: scrollRef.current,
  };
  // Closures installed on image nodes carry these render-time values. If the
  // node decodes after a route/source change, its token no longer matches.
  const renderAuthority = {
    sessionId: sessionId ?? null,
    mobileActive: !!mobileActive,
    mobileActivationEpoch,
    replayGeneration,
  };

  const isAuthorityCurrent = useCallback((candidate: ScrollAuthority): boolean => {
    const current = authorityRef.current;
    const element = scrollRef.current;
    return !!(
      element &&
      element.isConnected &&
      candidate.element === element &&
      candidate.sessionId === current.sessionId &&
      candidate.mobileActive === current.mobileActive &&
      candidate.mobileActivationEpoch === current.mobileActivationEpoch &&
      candidate.replayGeneration === current.replayGeneration
    );
  }, []);

  const ensureScrollFrame = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const measures = Array.from(pendingMeasureRef.current.entries());
      pendingMeasureRef.current.clear();
      for (const [node, request] of measures) {
        if (request.commandEpoch !== commandEpochRef.current) continue;
        if (!isAuthorityCurrent(request.authority)) continue;
        const element = scrollRef.current;
        if (!node.isConnected || !element?.contains(node)) continue;
        request.measure(node);
      }

      const write = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (!write || write.commandEpoch !== commandEpochRef.current) return;
      // This is the single gate immediately before every direct DOM scroll
      // write and every TanStack navigation invocation.
      if (!isAuthorityCurrent(write.authority)) return;
      const element = scrollRef.current;
      if (!element) return;
      write.run(element);
    });
  }, [isAuthorityCurrent]);

  const captureAuthority = useCallback(
    (): ScrollAuthority => ({
      sessionId: sessionId ?? null,
      mobileActive: !!mobileActive,
      mobileActivationEpoch,
      replayGeneration,
      element: scrollRef.current,
    }),
    [sessionId, mobileActive, mobileActivationEpoch, replayGeneration],
  );

  const scheduleProgrammaticWrite = useCallback(
    (
      run: (element: HTMLDivElement) => void,
      authority: ScrollAuthority = captureAuthority(),
      commandEpoch: number = commandEpochRef.current,
    ) => {
      if (mobileInactive) return;
      // Desktop scroll behavior remains synchronous: existing navigation and
      // follow effects observe the settled viewport in the same layout pass.
      // Only the mobile active detail needs a queued, generation-fenced write.
      if (!mobileActive) {
        if (commandEpoch !== commandEpochRef.current || !isAuthorityCurrent(authority)) return;
        const element = scrollRef.current;
        if (element) run(element);
        return;
      }
      pendingWriteRef.current = { authority, commandEpoch, run };
      ensureScrollFrame();
    },
    [captureAuthority, ensureScrollFrame, isAuthorityCurrent, mobileActive, mobileInactive],
  );

  const cancelProgrammaticWrites = useCallback(() => {
    commandEpochRef.current += 1;
    pendingWriteRef.current = null;
    pendingMeasureRef.current.clear();
  }, []);

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateVirtualRowSize(displayRows[i], rowTextChars[i]),
    getItemKey: (i) => virtualRowKey(displayRows[i], i),
    overscan: 6,
    // Union any active selection's row span into the mounted range (D3), so
    // rows the selection intersects stay mounted, positioned, and measured by
    // the virtualizer itself. Runs on EVERY recompute before the unmount
    // decision; reading the proactively-tracked span ref here keeps selected
    // rows from ever unmounting (avoids the synchronous Range-mutation race).
    // `getTotalSize()` may change as a retained row measures — accepted normal
    // virtualizer behavior. Past the device-aware ceiling the span ref is null
    // (mapChatRange cleared the selection) so the default range is returned.
    rangeExtractor: (range) =>
      extendRangeWithSelection(
        defaultRangeExtractor(range),
        selectionSpanRef.current,
        selectionCapRef.current,
        range.count,
      ),
    // TanStack owns all measured-row correction. The only scroll reaction to a
    // measurement is a generation-guarded latest follow command; history and
    // prepend restoration never use total-height deltas.
    onChange: () => {
      if (typeof window === "undefined" || isSelectingRef.current || mobileInactive) return;
      const element = scrollRef.current;
      if (element === null || element.isConnected === false) return;
      const follow = mobileActive
        ? scrollOwnerRef.current === "NAVIGATING_BOTTOM"
        : stickToBottomRef.current;
      if (follow) {
        scheduleProgrammaticWrite((target) => { target.scrollTop = target.scrollHeight; });
      }
    },
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Streaming-tail content: the frozen snapshot while a tail selection is held
  // (buffers chunks; survives the message_end unmount), else the live text.
  // See change: preserve-streaming-tail-selection.
  const streamingTailText = frozenTailText ?? state.streamingText;

  // Image decoding changes only its measured virtual row. It shares the same
  // guarded rAF as scroll commands, so a late image from another activation
  // cannot measure or move the newly attached transcript.
  const requestRowMeasure = useCallback(
    (from: HTMLElement | null, authority: ScrollAuthority = captureAuthority()) => {
      const row = from?.closest?.("[data-index]") as HTMLElement | null;
      if (row === null) return;
      if (mobileInactive) return;
      pendingMeasureRef.current.set(row, {
        authority,
        commandEpoch: commandEpochRef.current,
        measure: (node) => {
          const index = Number(node.dataset.index);
          if (Number.isInteger(index) && index >= 0) {
            virtualizer.resizeItem(index, node.getBoundingClientRect().height);
          }
        },
      });
      ensureScrollFrame();
    },
    [captureAuthority, ensureScrollFrame, mobileInactive, virtualizer],
  );

  const pinLatest = useCallback(
    (authority: ScrollAuthority = captureAuthority()) => {
      if (mobileInactive) return;
      scheduleProgrammaticWrite((element) => {
        if (scrollOwnerRef.current === "READING_HISTORY" || scrollOwnerRef.current === "RESTORING_ANCHOR") return;
        element.scrollTop = element.scrollHeight;
      }, authority);
    },
    [captureAuthority, mobileInactive, scheduleProgrammaticWrite],
  );

  const captureOlderAnchor = useCallback((): CapturedScrollAnchor | null => {
    const element = scrollRef.current;
    if (mobileInactive || !element || !sessionId) return null;
    const item = virtualizer.getVirtualItems().find((candidate) => candidate.start + candidate.size > element.scrollTop)
      ?? virtualizer.getVirtualItems()[0];
    const authority = captureAuthority();
    return {
      token: `${sessionId}:${++olderAnchorSerialRef.current}`,
      rowId: item ? String(item.key) : null,
      offset: item ? element.scrollTop - item.start : element.scrollTop,
      authority,
      cancelled: false,
      restoring: false,
    };
  }, [captureAuthority, mobileInactive, sessionId, virtualizer]);

  const requestOlder = useCallback(() => {
    if (!onLoadOlder || loadingOlder || olderRequestLatchRef.current) {
      if (!onLoadOlder) olderContinuationRef.current = null;
      return;
    }
    const anchor = captureOlderAnchor();
    if (!anchor) {
      olderContinuationRef.current = null;
      return;
    }
    const current = olderContinuationRef.current;
    const continuing = Boolean(current && current.sessionId === (sessionId ?? null));
    if (!current || current.sessionId !== (sessionId ?? null)) {
      olderContinuationRef.current = { sessionId: sessionId ?? null, initiated: 0, baselineIds: new Set() };
    }
    olderContinuationRef.current!.initiated += 1;
    olderContinuationRef.current!.baselineIds = new Set(state.messages.map((message) => message.id));
    // The latch is synchronous: a burst of native wheel/scroll events cannot
    // emit a second exclusive older request before the parent rerenders.
    olderRequestLatchRef.current = anchor.token;
    pendingOlderAnchorRef.current = anchor;
    onLoadOlder(anchor.token);
  }, [captureOlderAnchor, loadingOlder, onLoadOlder, sessionId, state.messages]);

  const enterReadingHistory = useCallback((olderDirected: boolean) => {
    if (!mobileActive || mobileInactive) return;
    const pending = pendingOlderAnchorRef.current;
    if (pending?.restoring) {
      // A fast server completes the older page mid-gesture; the same pull's
      // remaining older-directed callbacks must not cancel the anchor settle
      // they triggered. Only newer-directed movement (or a fresh touch, which
      // reports olderDirected=false) is the user taking the viewport back.
      olderContinuationRef.current = null;
      autoContinueAfterRestoreRef.current = false;
      if (olderDirected) return;
      pending.cancelled = true;
      pendingOlderAnchorRef.current = null;
      olderRequestLatchRef.current = null;
    } else {
      // Any fresh user movement starts a new bounded discovery action.
      olderContinuationRef.current = null;
      autoContinueAfterRestoreRef.current = false;
    }
    cancelProgrammaticWrites();
    scrollOwnerRef.current = "READING_HISTORY";
    userGestureRef.current = true;
    olderGestureRef.current = { id: ++gestureSerialRef.current, olderDirected, consumed: false };
  }, [cancelProgrammaticWrites, mobileActive, mobileInactive]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (mobileActive) {
      enterReadingHistory(event.deltaY < 0);
      return;
    }
    // Desktop's bottom button also uses the shared rAF writer. A wheel event
    // must fence that queued write before it can call scrollTo.
    cancelProgrammaticWrites();
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    descendingRef.current = false;
    ascendingRef.current = false;
    userGestureRef.current = true;
  }, [cancelProgrammaticWrites, enterReadingHistory, mobileActive, mobileInactive]);

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchYRef.current = event.touches[0]?.clientY ?? null;
    if (mobileActive && !mobileInactive) enterReadingHistory(false);
    else if (!mobileInactive) {
      cancelProgrammaticWrites();
      olderContinuationRef.current = null;
      autoContinueAfterRestoreRef.current = false;
    }
  }, [cancelProgrammaticWrites, enterReadingHistory, mobileActive, mobileInactive]);

  const onTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const nextY = event.touches[0]?.clientY;
    const previousY = touchYRef.current;
    touchYRef.current = nextY ?? null;
    if (nextY == null || previousY == null) return;
    if (mobileActive) {
      enterReadingHistory(nextY > previousY);
      return;
    }
    if (!mobileInactive) cancelProgrammaticWrites();
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    descendingRef.current = false;
    ascendingRef.current = false;
    userGestureRef.current = true;
  }, [cancelProgrammaticWrites, enterReadingHistory, mobileActive, mobileInactive]);

  const handleScroll = useCallback(() => {
    if (mobileInactive) return;
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_THRESHOLD;
    const nearTop = element.scrollTop <= SCROLL_THRESHOLD;

    if (mobileActive) {
      const owner = scrollOwnerRef.current;
      if (owner === "NAVIGATING_BOTTOM" && nearBottom) scrollOwnerRef.current = "FOLLOWING";
      if (owner === "NAVIGATING_TOP" && nearTop) scrollOwnerRef.current = "READING_HISTORY";
      let reading = scrollOwnerRef.current === "READING_HISTORY";
      if (reading && nearBottom && userGestureRef.current) {
        scrollOwnerRef.current = "FOLLOWING";
        olderGestureRef.current = null;
        reading = false;
      }
      setShowScrollButton(!nearBottom && reading);
      setShowScrollTopButton(!nearTop);
      const gesture = olderGestureRef.current;
      if (
        reading &&
        nearTop &&
        hasMoreOlder &&
        (loadingOlder == null || loadingOlder === false) &&
        olderRequestLatchRef.current === null &&
        gesture?.olderDirected &&
        gesture.consumed === false
      ) {
        gesture.consumed = true;
        requestOlder();
      }
      return;
    }

    if (descendingRef.current) {
      if (nearBottom) descendingRef.current = false;
      stickToBottomRef.current = true;
      setShowScrollButton(false);
    } else if (ascendingRef.current) {
      if (nearTop) ascendingRef.current = false;
      stickToBottomRef.current = false;
      setShowScrollButton(true);
    } else if (loadingHistory) {
      if (userGestureRef.current) {
        stickToBottomRef.current = nearBottom;
        setShowScrollButton(!nearBottom);
        if (!nearBottom) escapedDuringHydrateRef.current = true;
        if (nearBottom) userGestureRef.current = false;
      } else if (nearBottom) {
        stickToBottomRef.current = true;
        setShowScrollButton(false);
      }
    } else {
      stickToBottomRef.current = nearBottom;
      setShowScrollButton(!nearBottom);
      if (nearBottom) userGestureRef.current = false;
    }
    setShowScrollTopButton(!nearTop);
    if (sessionId) {
      const item = virtualizer.getVirtualItems().find((candidate) => candidate.start + candidate.size > element.scrollTop)
        ?? virtualizer.getVirtualItems()[0];
      // A windowed list can transiently report no virtual item during a
      // session switch. The first stable row is still a valid desktop anchor;
      // do not discard its saved position merely because it is between range
      // calculations.
      const fallbackRow = displayRows[0];
      scrollStateMap.set(sessionId, {
        anchorRowId: item ? String(item.key) : fallbackRow ? virtualRowKey(fallbackRow, 0) : null,
        offset: item ? element.scrollTop - item.start : element.scrollTop,
        rawTop: element.scrollTop,
        nearBottom,
      });
    }
  }, [hasMoreOlder, loadingHistory, loadingOlder, mobileActive, mobileInactive, requestOlder, sessionId, virtualizer]);

  const scrollToBottom = useCallback(() => {
    if (mobileInactive) return;
    const authority = captureAuthority();
    descendingRef.current = true;
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    stickToBottomRef.current = true;
    if (mobileActive) scrollOwnerRef.current = "NAVIGATING_BOTTOM";
    setShowScrollButton(false);
    scheduleProgrammaticWrite((element) => {
      const streaming = Boolean(state.streamingText || state.streamingThinking || pendingSteering?.length);
      element.scrollTo({ top: element.scrollHeight, behavior: streaming ? "instant" : "smooth" });
    }, authority);
    if (sessionId) scrollStateMap.set(sessionId, { anchorRowId: null, offset: 0, rawTop: 0, nearBottom: true });
  }, [captureAuthority, mobileActive, mobileInactive, pendingSteering, scheduleProgrammaticWrite, sessionId, state.streamingText, state.streamingThinking]);

  const scrollToTop = useCallback(() => {
    if (mobileInactive) return;
    const authority = captureAuthority();
    descendingRef.current = false;
    ascendingRef.current = true;
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    stickToBottomRef.current = false;
    if (mobileActive) {
      scrollOwnerRef.current = "NAVIGATING_TOP";
      olderGestureRef.current = null;
      userGestureRef.current = false;
    }
    setShowScrollButton(true);
    scheduleProgrammaticWrite(() => virtualizer.scrollToIndex(0, { align: "start" }), authority);
  }, [captureAuthority, mobileActive, mobileInactive, scheduleProgrammaticWrite, virtualizer]);

  // Mobile visible activation is always a fresh follow command. Desktop keeps
  // the saved virtual anchor behavior below and never receives this override.
  const mobileActivationRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!mobileActive) return;
    const key = `${sessionId ?? ""}:${mobileActivationEpoch}:${replayGeneration}`;
    if (mobileActivationRef.current === key) return;
    mobileActivationRef.current = key;
    cancelProgrammaticWrites();
    const pending = pendingOlderAnchorRef.current;
    if (pending !== null) pending.cancelled = true;
    pendingOlderAnchorRef.current = null;
    olderRequestLatchRef.current = null;
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    if (loadingHistory) {
      scrollOwnerRef.current = "HYDRATING";
      return;
    }
    scrollOwnerRef.current = "FOLLOWING";
    pinLatest();
  }, [cancelProgrammaticWrites, loadingHistory, mobileActivationEpoch, mobileActive, pinLatest, replayGeneration, sessionId]);

  // Desktop-only anchor restoration. It is intentionally not shared with the
  // mobile owner: an activation must follow latest instead of resurrecting a
  // saved desktop position.
  useLayoutEffect(() => {
    if (mobileInactive || mobileActive || sessionId === prevSessionRef.current) return;
    // A session swap invalidates every pending desktop write from the outgoing
    // transcript before restoring this session's stored viewport.
    cancelProgrammaticWrites();
    pendingOlderAnchorRef.current = null;
    olderRequestLatchRef.current = null;
    olderContinuationRef.current = null;
    autoContinueAfterRestoreRef.current = false;
    prevSessionRef.current = sessionId;
    escapedDuringHydrateRef.current = false;
    loadingHistoryRef.current = Boolean(loadingHistory);
    const saved = sessionId ? scrollStateMap.get(sessionId) : undefined;
    const coldHydrate = Boolean(loadingHistory) && state.messages.length === 0;
    const authority = captureAuthority();
    if (saved && !saved.nearBottom && !coldHydrate) {
      stickToBottomRef.current = false;
      setShowScrollButton(true);
      // Keep the exact desktop viewport while its mounted range catches up.
      // A missing row key is handled by the next normal scroll, rather than
      // replacing an intentional history position with an unrelated latest pin.
      const element = scrollRef.current;
      if (element !== null) element.scrollTop = saved.rawTop;
      const restoreSession = sessionId;
      requestAnimationFrame(() => {
        if (prevSessionRef.current === restoreSession && scrollRef.current !== null) {
          scrollRef.current.scrollTop = saved.rawTop;
        }
      });
      scheduleProgrammaticWrite((target) => { target.scrollTop = saved.rawTop; });
    } else {
      stickToBottomRef.current = true;
      setShowScrollButton(false);
      scheduleProgrammaticWrite((element) => { element.scrollTop = element.scrollHeight; }, authority);
    }
  }, [cancelProgrammaticWrites, captureAuthority, displayRows, loadingHistory, mobileActive, mobileInactive, scheduleProgrammaticWrite, sessionId, state.messages.length, virtualizer]);

  useLayoutEffect(() => {
    const wasLoading = loadingHistoryRef.current;
    const nowLoading = Boolean(loadingHistory);
    loadingHistoryRef.current = nowLoading;
    if (mobileInactive) return;
    if (!wasLoading && nowLoading) {
      escapedDuringHydrateRef.current = false;
      if (mobileActive) scrollOwnerRef.current = "HYDRATING";
      else stickToBottomRef.current = true;
      return;
    }
    if (wasLoading && !nowLoading) {
      if (mobileActive) {
        if (scrollOwnerRef.current !== "READING_HISTORY") {
          // Replay rows measure after the initial hydration pin. Keep the
          // existing bottom-navigation owner until those measurements settle.
          scrollOwnerRef.current = "NAVIGATING_BOTTOM";
          pinLatest();
        }
      } else if (!escapedDuringHydrateRef.current) {
        stickToBottomRef.current = true;
        setShowScrollButton(false);
        pinLatest();
        if (sessionId) scrollStateMap.set(sessionId, { anchorRowId: null, offset: 0, rawTop: 0, nearBottom: true });
      }
      escapedDuringHydrateRef.current = false;
    }
  }, [loadingHistory, mobileActive, mobileInactive, pinLatest, sessionId]);

  // Content and virtual measurements can only follow latest. TanStack remains
  // the sole owner of row measurement correction; no total-height delta writes
  // compensate history/prepend growth here.
  useLayoutEffect(() => {
    if (isSelecting || mobileInactive) return;
    if (mobileActive) {
      if (scrollOwnerRef.current === "FOLLOWING") pinLatest();
    } else if (stickToBottomRef.current) {
      pinLatest();
    }
  }, [isSelecting, mobileActive, mobileInactive, pendingSteering, pinLatest, state.messages.length, state.pendingPrompt, state.streamingText, state.streamingThinking]);

  useLayoutEffect(() => {
    const anchor = pendingOlderAnchorRef.current;
    if (!anchor || anchor.token !== completedOlderAnchorToken || anchor.cancelled || anchor.restoring) return;
    if (!isAuthorityCurrent(anchor.authority)) {
      pendingOlderAnchorRef.current = null;
      olderRequestLatchRef.current = null;
      olderContinuationRef.current = null;
      autoContinueAfterRestoreRef.current = false;
      return;
    }
    const continuation = olderContinuationRef.current;
    const baselineIds = continuation?.baselineIds ?? new Set<string>();
    const newMessages = state.messages.filter((message) => !baselineIds.has(message.id));
    const hasConversation = newMessages.some((message) => message.role === "user" || message.role === "assistant");
    autoContinueAfterRestoreRef.current = Boolean(
      hasConversation === false &&
      hasMoreOlder === true &&
      loadingOlder !== true &&
      onLoadOlder &&
      continuation &&
      continuation.sessionId === (sessionId ?? null) &&
      continuation.initiated < 3,
    );
    anchor.restoring = true;
    scrollOwnerRef.current = "RESTORING_ANCHOR";
    const commandEpoch = commandEpochRef.current;
    let frames = 0;
    let settled = 0;
    const restore = (element: HTMLDivElement) => {
      if (anchor.cancelled) return;
      if (!isAuthorityCurrent(anchor.authority)) {
        pendingOlderAnchorRef.current = null;
        olderRequestLatchRef.current = null;
        olderContinuationRef.current = null;
        autoContinueAfterRestoreRef.current = false;
        return;
      }
      const index = anchor.rowId == null ? -1 : displayRows.findIndex((row, i) => virtualRowKey(row, i) === anchor.rowId);
      if (index < 0) {
        pendingOlderAnchorRef.current = null;
        olderRequestLatchRef.current = null;
        olderContinuationRef.current = null;
        autoContinueAfterRestoreRef.current = false;
        scrollOwnerRef.current = "READING_HISTORY";
        return;
      }
      virtualizer.scrollToIndex(index, { align: "start" });
      const item = virtualizer.getVirtualItems().find((candidate) => candidate.index === index);
      if (!item) {
        if (++frames < 12) scheduleProgrammaticWrite(restore, anchor.authority, commandEpoch);
        return;
      }
      const target = item.start + anchor.offset;
      if (Math.abs(element.scrollTop - target) <= 1) settled += 1;
      else {
        settled = 0;
        element.scrollTop = target;
      }
      if (settled >= 2 || ++frames >= 12) {
        pendingOlderAnchorRef.current = null;
        olderRequestLatchRef.current = null;
        scrollOwnerRef.current = "READING_HISTORY";
        const continueOlder = autoContinueAfterRestoreRef.current;
        autoContinueAfterRestoreRef.current = false;
        if (continueOlder) requestOlder();
        else olderContinuationRef.current = null;
      } else {
        scheduleProgrammaticWrite(restore, anchor.authority, commandEpoch);
      }
    };
    scheduleProgrammaticWrite(restore, anchor.authority, commandEpoch);
  }, [completedOlderAnchorToken, displayRows, hasMoreOlder, isAuthorityCurrent, loadingOlder, onLoadOlder, requestOlder, scheduleProgrammaticWrite, sessionId, state.messages, virtualizer]);

  useImperativeHandle(ref, () => ({
    scrollToTurn(turnIndex: number) {
      // Map the turn to its first display-row index and scroll there. Unlike
      // the old querySelector([data-turn]) path this works for OFF-SCREEN
      // (unmounted) turns — scrollToIndex scrolls, THEN the row mounts.
      const rowIndex = turnToFirstRowIndex.get(turnIndex);
      if (rowIndex == null || mobileInactive) return;
      // Escape sticky bottom so streaming does not pull the user off the turn.
      descendingRef.current = false;
      olderContinuationRef.current = null;
      autoContinueAfterRestoreRef.current = false;
      stickToBottomRef.current = false;
      setShowScrollButton(true);
      if (mobileActive) scrollOwnerRef.current = "READING_HISTORY";
      scheduleProgrammaticWrite(() => virtualizer.scrollToIndex(rowIndex, { align: "start" }));
    },
  }), [mobileActive, mobileInactive, scheduleProgrammaticWrite, turnToFirstRowIndex, virtualizer]);

  return (
    // Key by sessionId so switching sessions (ChatView is reused, not remounted)
    // resets the hoisted preview — a preview open in session A never leaks into B.
    <FilePreviewProvider key={sessionId}>
    <div className="flex-1 relative overflow-hidden flex flex-col">
    {/* overflowAnchor:"none" is load-bearing: TanStack's built-in above-viewport
        correction (resizeItem) drives scroll compensation itself, so browser
        scroll-anchoring must stay OFF (it would double-move). Do NOT add
        `scroll-behavior: smooth` here or on an ancestor — smooth would animate
        each synchronous measurement correction and race the next, reintroducing
        the scroll-to-top drift. See change: fix-chat-scroll-to-top-estimate-drift. */}
      {hasMoreOlder && state.messages.length > 0 && (
        <div
          className="flex justify-center py-2 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]"
          data-testid="load-older-status"
          role="status"
        >
          {loadingOlder ? (
            i18nT("auto.loading_older", undefined, "Loading older messages…")
          ) : (
            <button
              type="button"
              data-testid="load-older-button"
              className="underline-offset-2 hover:underline text-[var(--text-secondary)]"
              onClick={requestOlder}
            >
              {i18nT("auto.load_older_messages", undefined, "Load older messages")}
            </button>
          )}
        </div>
      )}
    <div ref={scrollRef} onScroll={handleScroll} onCopy={handleCopy} onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} style={{ overflowAnchor: "none" }} data-testid="chat-scroll-container" className={`chat-cv h-full overflow-y-auto ${isMobile ? "p-2" : "p-4"}`}>
      {/* Windowed historical rows (TanStack Virtual): only viewport + overscan
          are mounted. The spacer reserves getTotalSize(); each row is absolutely
          positioned + re-measured on mount. chat-cv-skip keeps Step A's
          content-visibility off the spacer (windowing supersedes it). Bottom-pin
          + scroll-lock stay on the DOM scroll machine (CR-1). See change:
          virtualize-chat-transcript-tanstack. */}
      <div className="chat-cv-skip" style={{ position: "relative", width: "100%", height: totalSize }}>
        {virtualItems.map((vi) => {
          const item: BurstItem = displayRows[vi.index];
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
            >
              {((): React.ReactNode => {
        // Temporal burst group of heterogeneous tool calls (carries collapse
        // state → key by first-member id, NOT positional idx, so event-trim
        // head churn cannot bleed one burst's state into another (finding 3).
        if ((item as ToolBurstGroupData).type === "burst") {
          const burst = item as ToolBurstGroupData;
          return <ToolBurstGroup key={burst.id} burst={burst} toolContext={toolContext} />;
        }
        // Bare semantic ×N group (sub-threshold burst that still folded a poll).
        if ((item as ToolCallGroup).type === "group") {
          const group = item as ToolCallGroup;
          return <CollapsedToolGroup key={group.messages[0]?.id ?? group.toolName} group={group} toolContext={toolContext} />;
        }

        const msg = item as import("../lib/event-reducer.js").ChatMessage;

        // `/view` preview rows render as a `PreviewCard` regardless of role.
        // Filtered out of the pi-bound message stream by the bridge so the
        // agent never observes them. See change: render-file-previews.
        if (msg.view) {
          return (
            <div key={msg.id} className="mt-4 mb-4 flex justify-end" {...(msg.turnIndex != null ? { "data-turn": msg.turnIndex } : {})}>
              <div className={bubbleMax}>
                <PreviewCard target={msg.view} />
              </div>
            </div>
          );
        }

        if (msg.role === "advisor") {
          return <AdvisorCard key={msg.id} message={msg} />;
        }

        if (msg.role === "turnSeparator") {
          if (!prefs.turnMetadata) return null;
          return <div key={msg.id} className="mx-4 my-2 border-t border-[var(--border-subtle)]" />;
        }

        if (msg.role === "user") {
          // Per-turn change block for the turn that ENDS at this user message
          // (change: add-change-summary-table). Renders above the bubble that
          // starts the next turn; the in-progress turn renders at the tail.
          const changeBlock = anchoredSummaries.get(msg.id) ? (
            <ChangeSummaryBlock summary={anchoredSummaries.get(msg.id)!} onOpenFile={openDiffFile} />
          ) : null;
          // Skill invocations render as a distinct collapsible card so chat
          // doesn't show walls of expanded skill body. Plain user messages
          // continue to render as the existing blue bubble.
          // See change: render-skill-invocations-collapsibly.
          if (msg.skill) {
            return (
              <React.Fragment key={msg.id}>
              {changeBlock}
              <div className="mt-4 mb-4 flex flex-col items-end" {...(msg.turnIndex != null ? { "data-turn": msg.turnIndex } : {})}>
                {msg.streamingBehavior && <StreamingBehaviorBadge behavior={msg.streamingBehavior} />}
                <div className={bubbleMax}>
                  {msg.images && msg.images.length > 0 && (
                    <div className="mb-2">
                      <ImageAttachments images={msg.images} onImageLoad={(e) => requestRowMeasure(e.currentTarget, { ...renderAuthority, element: scrollRef.current })} />
                    </div>
                  )}
                  <SkillInvocationCard
                    skill={msg.skill}
                    rawContent={msg.content}
                    timestamp={msg.timestamp}
                    entryId={msg.entryId}
                    onFork={onForkFromMessage}
                  />
                </div>
              </div>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={msg.id}>
            {changeBlock}
            <div className="mt-4 mb-4 flex flex-col items-end" {...(msg.turnIndex != null ? { "data-turn": msg.turnIndex } : {})}>
              {msg.streamingBehavior && <StreamingBehaviorBadge behavior={msg.streamingBehavior} />}
              <div className={`bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md px-4 py-2 ${bubbleMax}`}>
                {msg.images && msg.images.length > 0 && (
                  <ImageAttachments images={msg.images} onImageLoad={(e) => requestRowMeasure(e.currentTarget, { ...renderAuthority, element: scrollRef.current })} />
                )}
                {msg.content && (
                  <MessageBubble
                    content={msg.content}
                    className=""
                    timestamp={msg.timestamp}
                    entryId={msg.entryId}
                    onFork={onForkFromMessage}
                  />
                )}
              </div>
            </div>
            </React.Fragment>
          );
        }

        if (msg.role === "thinking") {
          if (!prefs.reasoning) return null;
          return (
            <ThinkingBlock
              key={msg.id}
              content={msg.content}
              startedAt={msg.startedAt}
              duration={msg.duration}
              streamedLive={msg.streamedLive}
              autoCollapseMs={prefs.reasoningAutoCollapseMs}
              keepOpenUntilTurnEnds={prefs.keepReasoningOpenUntilTurnEnds}
              turnActive={state.status === "streaming"}
            />
          );
        }

        if (msg.role === "toolResult") {
          if (!showDebugTools && isDebugTool(msg.toolName ?? "")) return null;
          // Input-needed tools are non-hidable (toolCallPrefKey returns null).
          // Preserve rich history bodies for both `ask_user` and core `ask`.
          const kindKey = toolCallPrefKey(msg.toolName ?? "");
          if (kindKey !== null && !prefs.toolCalls[kindKey]) return null;
          if (hiddenToolResultIds.has(msg.id)) return null;
          if (retriedErrorIds.has(msg.id) || surfaceSuppressedIds.has(msg.id)) {
            return (
              <RetriedErrorBadge
                key={msg.id}
                toolName={msg.toolName ?? "unknown"}
                toolCallId={msg.toolCallId ?? msg.id}
                args={msg.args}
                result={msg.result}
                context={toolContext}
                startedAt={msg.startedAt}
                duration={msg.duration}
                toolDetails={msg.toolDetails}
              />
            );
          }
          return (
            <ToolCallStep
              key={msg.id}
              toolName={msg.toolName ?? "unknown"}
              toolCallId={msg.toolCallId ?? msg.id}
              args={msg.args}
              status={msg.toolStatus ?? "running"}
              result={msg.result}
              images={msg.images}
              context={toolContext}
              startedAt={msg.startedAt}
              duration={msg.duration}
              toolDetails={msg.toolDetails}
              showResultBody={prefs.toolResults || isInputNeededTool(msg.toolName)}
              onAbort={msg.toolStatus === "running" ? onAbort : undefined}
              onForceKill={msg.toolStatus === "running" ? onForceKill : undefined}
            />
          );
        }

        if (msg.role === "bashOutput") {
          const args = msg.args as any;
          // Missing shell binary: render the actionable inline error with a
          // deep-link into Settings → Tools instead of the output card.
          // See change: register-bash-and-tool-install-help.
          if (args?.missingTool?.kind === "missing-tool") {
            return (
              <MissingToolInlineError key={msg.id} toolName={args.missingTool.toolName} />
            );
          }
          return (
            <BashOutputCard
              key={msg.id}
              command={args?.command ?? ""}
              output={msg.content}
              exitCode={args?.exitCode ?? 0}
              excludeFromContext={args?.excludeFromContext ?? false}
              source={args?.source}
              timestamp={msg.timestamp}
            />
          );
        }

        if (msg.role === "inlineTerminal") {
          const args = msg.args as any;
          return (
            <InlineTerminalCard
              key={msg.id}
              terminalId={args?.terminalId ?? ""}
              closed={args?.closed ?? false}
              transcript={msg.content}
              onClose={(tid) => onCloseInlineTerminal?.(tid)}
            />
          );
        }

        if (msg.role === "commandFeedback") {
          const args = msg.args as any;
          return (
            <CommandFeedbackCard
              key={msg.id}
              command={args?.command ?? ""}
              status={args?.status ?? "started"}
              message={msg.content || undefined}
            />
          );
        }

        if (msg.role === "interactiveUi") {
          const args = msg.args as any;
          // Suppress widget-bar-placed prompts from chat. A widget-bar slot
          // owns the render (e.g. the flow plugin's FlowQuestionCard). The
          // shell uses the placement primitive only — no plugin-specific
          // component-type literals. See change: fix-flows-plugin-polish (B2).
          const cmp = (args?.params as Record<string, unknown> | undefined)?._promptBusComponent as
            | { type?: string }
            | undefined;
          if (cmp?.type && isWidgetBarPrompt(cmp.type)) {
            return null;
          }
          const request: InteractiveUiRequest = {
            requestId: args.requestId,
            method: args.method,
            params: args.params,
            status: args.status,
            result: args.result,
          };
          return (
            <InteractiveUiCard
              key={msg.id}
              request={request}
              onRespondToUi={onRespondToUi}
            />
          );
        }

        if (msg.role === "rawEvent") {
          if (!showDebugTools) return null;
          return (
            <RawEventCard
              key={msg.id}
              eventType={msg.toolName ?? "unknown"}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          );
        }

        // assistant
        const bMax = hasMermaid(msg.content) ? bubbleWide : bubbleMax;
        return (
          <div key={msg.id} className="mt-4 mb-4 flex justify-start">
            <MessageBubble
              content={msg.content}
              className={`bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl shadow-md px-4 py-2 ${bMax}`}
              timestamp={msg.timestamp}
              entryId={msg.entryId}
              onFork={onForkFromMessage}
              context={toolContext}
            />
          </div>
        );
              })()}
            </div>
          );
        })}
      </div>

      {/* Streaming thinking. `chat-cv-skip` opts the live tail out of the
          content-visibility optimization so it is never skipped. See change:
          reduce-chat-render-cpu-umbrella (Phase 2, task 4.2). */}
      {state.streamingThinking && prefs.reasoning && (
        <div className="chat-cv-skip">
          <ThinkingBlock
            content={state.streamingThinking}
            isStreaming
            defaultExpanded
            startedAt={state.thinkingStartedAt}
            onUserCollapse={onCollapseStreamingThinking}
          />
        </div>
      )}

      {/* Streaming text — carries the same liveness cue as a running group
          (edge-pulse glow + shimmer sweep) while the turn is alive. Settles
          static the instant streaming ends. See change: enhance-tool-call-grouping.
          `streamingTailText` is the frozen snapshot while a tail selection is
          held (buffering chunks + surviving the message_end unmount), else the
          live streamingText. See change: preserve-streaming-tail-selection. */}
      {streamingTailText && (
        <div ref={tailContainerRef} className="flex justify-start chat-cv-skip">
          <div ref={streamFxRef} className={`chat-stream-live bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl shadow-md px-4 py-2 ${hasMermaid(streamingTailText) ? bubbleWide : bubbleMax}`}>
            <MarkdownContent content={streamingTailText} context={toolContext} />
            {state.streamingText && (
              <span className="inline-block w-1.5 h-4 bg-[var(--bg-surface)] animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Retry banner + Error banner replaced by the unified SessionBanner
          mounted in App.tsx, sticky above the command input. Race overlap
          between yellow + red is impossible by construction — the selector
          picks exactly one variant. See change:
          unify-status-banner-and-terminal-limit-stop. */}

      {/* In-progress turn change summary (change: add-change-summary-table):
          the final turn has no following user message to anchor above, so its
          block renders at the stream tail. */}
      {tailSummary && (
        <div className="mx-4">
          <ChangeSummaryBlock summary={tailSummary} onOpenFile={openDiffFile} />
        </div>
      )}

      {/* Inline-chat steering: pending steer entries render here as user-style
          bubbles, positioned at the bottom of the chat list. Once pi drains
          the entry on turn_end, the bridge splices the shadow (drain-by-
          matcher), the bubble disappears, and the chat shows the prompt as a
          regular user message via the subsequent `message_end`. Display only
          — pi exposes no queue-mutation API to extensions. See change:
          honest-mid-turn-queue-surface. */}
      {pendingSteering && pendingSteering.length > 0 && pendingSteering.map((steerText, idx) => (
        <div key={`pending-steer-${idx}-${steerText.slice(0, 16)}`} data-testid="pending-steer-card" className="mt-4 mb-4 flex justify-end chat-cv-skip">
          <div className={`relative bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md px-4 py-2 ${bubbleMax}`}>
            <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider text-blue-400/80 font-medium">
              <Icon path={mdiLoading} size={0.45} className="animate-spin" />
              {i18nT("session.steering", undefined, "Steering")}
            </div>
            <MarkdownContent content={steerText} />
          </div>
        </div>
      ))}

      {/* Optimistic pending-prompt card (idle-scoped). Re-wired write site in
          useSessionActions.handleSend / handleSendPromptToSession. Two progress
          states keyed off `pendingPrompt.status`, sharing identical bubble
          geometry with a server-sourced user card so confirmation causes zero
          layout shift. No queue-text suppression: idle-scoping guarantees the
          card can never co-exist with a mid-turn queue chip.
          See change: optimistic-prompt-progress. */}
      {state.pendingPrompt && (
        <div data-testid="pending-prompt-card" data-status={state.pendingPrompt.status} className="mt-4 mb-4 flex justify-end">
          <div className={`bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md px-4 py-2 ${bubbleMax} ${state.pendingPrompt.status === "sending" ? "opacity-60 prompt-sending-fx prompt-edge-pulse" : ""}`}>
            {state.pendingPrompt.images && state.pendingPrompt.images.length > 0 && (
              <ImageAttachments images={state.pendingPrompt.images} />
            )}
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <MarkdownContent content={state.pendingPrompt.text} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {state.pendingPrompt.status === "sending" ? (
                  <>
                    <Icon path={mdiLoading} size={0.7} className="animate-spin text-blue-400" />
                    <span className="text-[10px] text-blue-400/70 font-medium">sending</span>
                  </>
                ) : (
                  <>
                    <Icon path={mdiCheck} size={0.7} className="text-emerald-400 prompt-tick-in" />
                    <span className="text-[10px] text-emerald-400/80 font-medium">sent</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
        3-way empty state (see change: show-chat-history-loading-indicator):
        loading spinner while history is in flight, "No messages yet" when no
        rows can render, else nothing (bubbles render above).
      */}
      {displayRows.length === 0 && !state.streamingText && !state.pendingPrompt && !(pendingSteering && pendingSteering.length > 0) && (
        loadingHistory ? (
          <div
            className="flex flex-col gap-3 px-4 py-3"
            aria-busy="true"
            role="status"
            aria-label={i18nT("status.loadingConversation", undefined, "Loading conversation…")}
            data-testid="chat-history-skeleton"
          >
            <Skeleton variant="bubble" count={3} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              title={i18nT("session.noMessagesYet", undefined, "No messages yet")}
              body={i18nT(
                "session.noMessagesYetBody",
                undefined,
                "Send a prompt below to start the conversation.",
              )}
            />
          </div>
        )
      )}
    </div>
    {activeInteractivePrompt && (
      <div
        data-testid="active-interactive-prompt"
        className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
      >
        <InteractiveUiCard request={activeInteractivePrompt.request} onRespondToUi={onRespondToUi} />
      </div>
    )}
    {showScrollTopButton && (
      <button
        data-testid="scroll-to-top"
        onClick={scrollToTop}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-full p-2 shadow-lg hover:bg-[var(--bg-surface)] transition-colors"
        title={i18nT("common.scrollToTop", undefined, "Scroll to top")}
      >
        <Icon path={mdiChevronUp} size={0.8} className="text-[var(--text-secondary)]" />
      </button>
    )}
    {showScrollButton && (
      <button
        data-testid="scroll-to-bottom"
        onClick={scrollToBottom}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-full p-2 shadow-lg hover:bg-[var(--bg-surface)] transition-colors"
        title={i18nT("common.scrollToBottom", undefined, "Scroll to bottom")}
      >
        <Icon path={mdiChevronDown} size={0.8} className="text-[var(--text-secondary)]" />
      </button>
    )}
    </div>
    <FilePreviewHost />
    </FilePreviewProvider>
  );
});

// Memoized so keystrokes into the command input (which re-render App) do not
// re-render the full transcript. Prerequisite for honest Phase 3 batching
// measurement — un-memoized renders otherwise mask the gains.
// See change: reduce-chat-render-cpu-umbrella (Phase 4).
// Props are stabilized at the call site (App.tsx): the 4 previously-unstable
// props (onForkFromMessage, onCloseInlineTerminal, onCollapseStreamingThinking,
// pendingSteering) are now referentially stable via useCallback / EMPTY const.
export const ChatView = React.memo(ChatViewInner);
