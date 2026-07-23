import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatMessage, createInitialState, type PendingPrompt } from "../../lib/event-reducer.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const virtualizerProbe = vi.hoisted(() => ({
  onChange: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
      const onChange = vi.fn(options.onChange);
      virtualizerProbe.onChange = onChange;
      return actual.useVirtualizer({ ...options, onChange });
    },
  };
});

const defaultToolContext: ToolContext = {};

type WindowVirtualizerChangeHandler = NonNullable<Parameters<typeof useWindowVirtualizer>[0]["onChange"]>;

function WindowVirtualizerProbe({ onChange }: { onChange?: WindowVirtualizerChangeHandler } = {}) {
  useWindowVirtualizer({ count: 1, estimateSize: () => 1, onChange });
  return null;
}

beforeAll(() => {
  // jsdom doesn't implement scrollTo
  Element.prototype.scrollTo = () => {};
  // jsdom doesn't implement matchMedia
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function stateWithMessages(messages: Array<{ id: string; role: "user" | "assistant"; content: string }>) {
  const state = createInitialState();
  for (const msg of messages) {
    state.messages.push({ ...msg, timestamp: Date.now() });
  }
  return state;
}

function stateWithToolMessage(overrides: Partial<ChatMessage> = {}) {
  const state = createInitialState();
  state.messages.push({
    id: "tool-1",
    role: "toolResult",
    content: "bash",
    toolName: "bash",
    toolCallId: "tc-1",
    args: { command: "ls -la" },
    toolStatus: "complete",
    result: "file1\nfile2",
    timestamp: Date.now(),
    ...overrides,
  });
  return state;
}

describe("ChatView", () => {
  it("does not retain a timer after ChatView unmount", () => {
    vi.useFakeTimers();
    const timerCountBeforeRender = vi.getTimerCount();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let view: { unmount: () => void } | undefined;

    try {
      view = render(
        <ThemeProvider><ChatView state={createInitialState()} toolContext={defaultToolContext} /></ThemeProvider>,
      );
      const onChange = virtualizerProbe.onChange;
      onChange.mockClear();

      expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeRender);
      view.unmount();
      view = undefined;

      // Let TanStack Virtual pending debounce drain after unmount so this
      // verifies no timer remains and no update reaches the dead tree.
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(vi.getTimerCount()).toBe(timerCountBeforeRender);
      expect(onChange).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.clearAllTimers();
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not retain a timer after WindowVirtualizerProbe unmount", () => {
    vi.useFakeTimers();
    const timerCountBeforeRender = vi.getTimerCount();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onChange = vi.fn();
    let view: { unmount: () => void } | undefined;

    try {
      view = render(<WindowVirtualizerProbe onChange={onChange} />);
      onChange.mockClear();

      expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeRender);
      view.unmount();
      view = undefined;

      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(vi.getTimerCount()).toBe(timerCountBeforeRender);
      expect(onChange).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      vi.clearAllTimers();
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not render the display-prefs View menu (relocated to the StatusBar)", () => {
    // The ⚙ View trigger moved out of ChatView into the composer StatusBar.
    // Guards against a duplicate ChatViewMenu re-appearing here. See change:
    // relocate-view-menu-to-status-bar.
    const state = stateWithMessages([{ id: "1", role: "user", content: "hi" }]);
    const { container } = render(
      <ThemeProvider><ChatView sessionId="s1" state={state} toolContext={defaultToolContext} /></ThemeProvider>,
    );
    expect(container.querySelector('button[title="View options"]')).toBeNull();
  });

  it("renders user message with copy buttons", () => {
    const state = stateWithMessages([
      { id: "1", role: "user", content: "Hello **world**" },
    ]);
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const mdBtn = container.querySelector('button[title="Copy as Markdown"]');
    const plainBtn = container.querySelector('button[title="Copy as plain text"]');
    expect(mdBtn).not.toBeNull();
    expect(plainBtn).not.toBeNull();
  });

  it("renders assistant message with copy buttons", () => {
    const state = stateWithMessages([
      { id: "1", role: "assistant", content: "Here is the answer" },
    ]);
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const mdBtn = container.querySelector('button[title="Copy as Markdown"]');
    const plainBtn = container.querySelector('button[title="Copy as plain text"]');
    expect(mdBtn).not.toBeNull();
    expect(plainBtn).not.toBeNull();
  });

  it("renders toolResult messages using ToolCallStep", () => {
    const state = stateWithToolMessage();
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

    // Should show the tool summary (ToolCallStep renders a button with summary text)
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("$ ls -la");

    // Should show status icon (SVG check for complete)
    expect(button!.querySelector("svg")).not.toBeNull();
  });

  it("renders expandable tool call with args and result", () => {
    const state = stateWithToolMessage();
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

    // A single tool call now forms a burst group (universal grouping, threshold
    // 1). First click expands the group body (revealing the ToolCallStep);
    // second click expands the ToolCallStep to show its args + result.
    if (!container.querySelector('[data-testid="tool-burst-body"]')) {
      fireEvent.click(container.querySelector('[data-testid="tool-burst-header"]')!);
    }
    const stepButton = container.querySelector('[data-testid="tool-burst-body"] button');
    expect(stepButton).not.toBeNull();
    fireEvent.click(stepButton!);

    // Should show args and result in expanded view
    const expanded = container.querySelector(".bg-\\[var\\(--bg-secondary\\)\\]");
    expect(expanded).not.toBeNull();
    expect(expanded!.textContent).toContain("ls -la");
    expect(expanded!.textContent).toContain("file1");
    expect(expanded!.textContent).toContain("file2");
  });

  it("renders running tool call with spinner icon", () => {
    const state = stateWithToolMessage({ toolStatus: "running" });
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

    const button = container.querySelector("button");
    expect(button!.querySelector("svg")).not.toBeNull();
  });

  it("renders error tool call with error icon", () => {
    const state = stateWithToolMessage({ toolStatus: "error" });
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

    const button = container.querySelector("button");
    expect(button!.querySelector("svg")).not.toBeNull();
  });

  it("renders user message bubble with subtle blue tint and accent border", () => {
    const state = stateWithMessages([
      { id: "1", role: "user", content: "Hello" },
    ]);
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const userBubble = container.querySelector(".bg-blue-500\\/10");
    expect(userBubble).not.toBeNull();
    expect(userBubble?.className).toContain("border-l-blue-400");
    expect(userBubble?.className).toContain("rounded-xl");
    expect(userBubble?.className).toContain("shadow-md");
  });

  it("renders assistant message bubble with 3D styling", () => {
    const state = stateWithMessages([
      { id: "1", role: "assistant", content: "Hi there" },
    ]);
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const assistantBubble = container.querySelector(".bg-\\[var\\(--bg-tertiary\\)\\]");
    expect(assistantBubble?.className).toContain("border-[var(--border-subtle)]");
    expect(assistantBubble?.className).toContain("rounded-xl");
    expect(assistantBubble?.className).toContain("shadow-md");
  });

  it("renders copy button divider in message bubbles", () => {
    const state = stateWithMessages([
      { id: "1", role: "assistant", content: "Test message" },
    ]);
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    // The divider between content and copy buttons
    const divider = container.querySelector(".border-t.border-\\[var\\(--border-secondary\\)\\]");
    expect(divider).not.toBeNull();
  });

  it("renders tool call step with left accent border", () => {
    const state = stateWithToolMessage();
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const toolStep = container.querySelector(".border-l-2.border-\\[var\\(--border-secondary\\)\\]");
    expect(toolStep).not.toBeNull();
  });

  it("does not show copy buttons on streaming text", () => {
    const state = createInitialState();
    state.streamingText = "Partial response...";
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    // Streaming bubble doesn't have message-level copy buttons
    const mdBtns = container.querySelectorAll('button[title="Copy as Markdown"]');
    expect(mdBtns.length).toBe(0);
  });

  it("renders optimistic pending prompt card with spinner", () => {
    const state = createInitialState();
    state.pendingPrompt = { text: "Fix the bug", status: "sending" };
    const { getByTestId, container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const card = getByTestId("pending-prompt-card");
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("Fix the bug");
    // Should have animate-spin spinner
    const spinner = card.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("sending state: dimmed bubble, sweep clipped to bubble, spinner + sending label", () => {
    const state = createInitialState();
    state.pendingPrompt = { text: "Fix the bug", status: "sending" };
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const card = container.querySelector('[data-testid="pending-prompt-card"]') as HTMLElement;
    expect(card.getAttribute("data-status")).toBe("sending");
    const bubble = card.firstElementChild as HTMLElement;
    // Dimmed + sweep clip lives on the bubble (overflow:hidden via prompt-sending-fx).
    expect(bubble.className).toContain("opacity-60");
    expect(bubble.className).toContain("prompt-sending-fx");
    expect(bubble.className).toContain("prompt-edge-pulse");
    expect(card.querySelector(".animate-spin")).not.toBeNull();
    expect(card.textContent).toContain("sending");
  });

  it("sent state: full opacity, success check + sent label, no dim/sweep", () => {
    const state = createInitialState();
    state.pendingPrompt = { text: "Fix the bug", status: "sent" };
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const card = container.querySelector('[data-testid="pending-prompt-card"]') as HTMLElement;
    expect(card.getAttribute("data-status")).toBe("sent");
    const bubble = card.firstElementChild as HTMLElement;
    expect(bubble.className).not.toContain("opacity-60");
    expect(bubble.className).not.toContain("prompt-sending-fx");
    expect(card.querySelector(".animate-spin")).toBeNull();
    expect(card.textContent).toContain("sent");
  });

  it("zero layout shift: sending and sent share identical bubble geometry classes", () => {
    const geom = (status: "sending" | "sent") => {
      const state = createInitialState();
      state.pendingPrompt = { text: "same text", status };
      const { container, unmount } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
      const bubble = (container.querySelector('[data-testid="pending-prompt-card"]') as HTMLElement).firstElementChild as HTMLElement;
      const cls = new Set(bubble.className.split(/\s+/));
      // Only the geometry/box classes must match across states.
      const geometry = ["rounded-xl", "border", "border-l-2", "border-l-blue-400", "px-4", "py-2", "max-w-[80%]"].filter((c) => cls.has(c));
      unmount();
      return geometry.sort().join(" ");
    };
    expect(geom("sending")).toBe(geom("sent"));
  });

  it("does not render pending prompt card when pendingPrompt is undefined", () => {
    const state = createInitialState();
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const card = container.querySelector('[data-testid="pending-prompt-card"]');
    expect(card).toBeNull();
  });

  it("renders pending prompt card with images", () => {
    const state = createInitialState();
    state.pendingPrompt = {
      text: "Check this",
      status: "sending",
      images: [{ data: "abc123", mimeType: "image/png" }],
    };
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const card = container.querySelector('[data-testid="pending-prompt-card"]');
    expect(card).not.toBeNull();
    const img = card!.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("data:image/png;base64,abc123");
  });

  it("opens lightbox when clicking a user message image", () => {
    const state = createInitialState();
    state.messages.push({
      id: "img-msg",
      role: "user",
      content: "See this",
      timestamp: Date.now(),
      images: [{ data: "abc123", mimeType: "image/png" }],
    });
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.className).toContain("cursor-pointer");
    fireEvent.click(img!);
    const lightbox = document.body.querySelector("[data-testid='lightbox-backdrop']");
    expect(lightbox).not.toBeNull();
  });

  it("hides empty-state message when pendingPrompt is set", () => {
    const state = createInitialState();
    state.pendingPrompt = { text: "Hello", status: "sending" };
    const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);
    expect(container.textContent).not.toContain("No messages yet");
  });

  // See change: show-chat-history-loading-indicator.
  describe("history loading 3-way empty state", () => {
    // Task 2.2 (bounded-hot-transcript-state): the skeleton is gated behind
    // useDelayedSkeleton's ~150ms threshold — a fresh loadingHistory=true
    // must NOT paint the skeleton immediately.
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("shows nothing (calm blank load state) immediately when loadingHistory flips true", () => {
      const state = createInitialState();
      const { container } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={true} /></ThemeProvider>,
      );
      expect(container.querySelector("[data-testid='chat-history-skeleton']")).toBeNull();
      expect(container.textContent).not.toContain("No messages yet");
      expect(container.textContent).not.toContain("Loading conversation…");
    });

    it("renders skeleton bubbles (not the placeholder) once loadingHistory has stayed true past the threshold", () => {
      const state = createInitialState();
      const { container } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={true} /></ThemeProvider>,
      );
      act(() => { vi.advanceTimersByTime(150); });
      // Content-layout load -> bubble skeletons, not a centered spinner.
      // See change: extend-client-utils-state-feedback-primitives.
      const skeleton = container.querySelector("[data-testid='chat-history-skeleton']");
      expect(skeleton).not.toBeNull();
      expect(skeleton?.getAttribute("aria-label")).toContain("Loading conversation…");
      expect(container.querySelector("[data-skeleton='bubble']")).not.toBeNull();
      expect(container.textContent).not.toContain("No messages yet");
    });

    it("never shows the skeleton for a cache-hit that resolves before the threshold (single stable paint)", () => {
      const state = createInitialState();
      const { container, rerender } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={true} /></ThemeProvider>,
      );
      act(() => { vi.advanceTimersByTime(100); });
      expect(container.querySelector("[data-testid='chat-history-skeleton']")).toBeNull();
      // Cache hit resolves: history stops loading and messages land in the same tick.
      const resolved = stateWithMessages([{ id: "1", role: "user", content: "hi" }]);
      rerender(
        <ThemeProvider><ChatView state={resolved} toolContext={defaultToolContext} loadingHistory={false} /></ThemeProvider>,
      );
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(container.querySelector("[data-testid='chat-history-skeleton']")).toBeNull();
      expect(container.querySelector('button[title="Copy as Markdown"]')).not.toBeNull();
    });

    it("renders 'No messages yet' when not loading and empty (existing behavior)", () => {
      const state = createInitialState();
      const { container } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={false} /></ThemeProvider>,
      );
      expect(container.textContent).toContain("No messages yet");
      expect(container.textContent).not.toContain("Loading conversation…");
    });

    it("renders bubbles and no spinner when messages are present, regardless of loadingHistory", () => {
      const state = stateWithMessages([{ id: "1", role: "user", content: "hi" }]);
      const { container } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={true} /></ThemeProvider>,
      );
      expect(container.textContent).not.toContain("Loading conversation…");
      expect(container.textContent).not.toContain("No messages yet");
      // the user bubble's copy buttons confirm bubbles rendered
      expect(container.querySelector('button[title="Copy as Markdown"]')).not.toBeNull();
    });
  });

  it("shows an empty fallback when all history rows are filtered", () => {
    const state = createInitialState();
    state.messages.push({
      id: "thinking-only",
      role: "thinking",
      content: "hidden reasoning",
      timestamp: Date.now(),
    } as ChatMessage);
    const { container } = render(
      <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} loadingHistory={false} /></ThemeProvider>,
    );

    expect(state.messages.length).toBe(1);
    expect(container.textContent).toContain("No messages yet");
    expect(container.querySelector("[data-testid=\"chat-history-skeleton\"]")).toBeNull();
  });

  describe("scroll lock", () => {
    let scrollToSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scrollToSpy = vi.fn();
      Element.prototype.scrollTo = scrollToSpy as any;
    });

    /** Helper to set scroll geometry on the scroll container */
    function setScrollPosition(el: Element, scrollTop: number, scrollHeight: number, clientHeight: number) {
      Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
      Object.defineProperty(el, "scrollHeight", { value: scrollHeight, writable: true, configurable: true });
      Object.defineProperty(el, "clientHeight", { value: clientHeight, writable: true, configurable: true });
    }

    function getScrollContainer(container: HTMLElement): HTMLElement {
      return container.querySelector("[class*='overflow-y-auto']")!;
    }

    it("auto-scrolls when near bottom (default behavior)", () => {
      const state = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
      ]);
      const { container, rerender } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
      );

      const scrollEl = getScrollContainer(container);
      // Start at the bottom of current content
      setScrollPosition(scrollEl, 1000, 1000, 400);
      fireEvent.scroll(scrollEl);

      // Content grows; layout-effect auto-scroll should snap to the new tail
      setScrollPosition(scrollEl, 1000, 1500, 400);
      const state2 = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
        { id: "2", role: "assistant", content: "Hi" },
      ]);
      rerender(<ThemeProvider><ChatView state={state2} toolContext={defaultToolContext} /></ThemeProvider>);

      expect(scrollEl.scrollTop).toBe(1500);
    });

    it("does NOT auto-scroll when scrolled away from bottom", () => {
      const state = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
      ]);
      const { container, rerender } = render(
        <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
      );

      const scrollEl = getScrollContainer(container);
      // Simulate user scrolling up: far from bottom
      setScrollPosition(scrollEl, 0, 1000, 400);
      fireEvent.scroll(scrollEl);

      const state2 = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
        { id: "2", role: "assistant", content: "Hi" },
      ]);
      rerender(<ThemeProvider><ChatView state={state2} toolContext={defaultToolContext} /></ThemeProvider>);

      // Scroll position must stay where the user left it
      expect(scrollEl.scrollTop).toBe(0);
    });

    it("shows scroll-to-bottom button when not near bottom", () => {
      const state = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
      ]);
      const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 0, 1000, 400);
      fireEvent.scroll(scrollEl);

      const btn = container.querySelector('[data-testid="scroll-to-bottom"]');
      expect(btn).not.toBeNull();
    });

    it("hides scroll-to-bottom button when near bottom", () => {
      const state = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
      ]);
      const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

      // Default state — near bottom
      const btn = container.querySelector('[data-testid="scroll-to-bottom"]');
      expect(btn).toBeNull();

      // Scroll up then back to bottom
      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 0, 1000, 400);
      fireEvent.scroll(scrollEl);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();

      setScrollPosition(scrollEl, 970, 1000, 400);
      fireEvent.scroll(scrollEl);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
    });

    it("clicking scroll-to-bottom button calls scrollTo and hides button", () => {
      const state = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
      ]);
      const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 0, 1000, 400);
      fireEvent.scroll(scrollEl);

      scrollToSpy.mockClear();
      const btn = container.querySelector('[data-testid="scroll-to-bottom"]')!;
      fireEvent.click(btn);

      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
      // Button should be hidden after click
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
    });

    it("scrollToTurn disables sticky bottom so streaming does not pull the view away", async () => {
      const state = stateWithMessages([{ id: "1", role: "user", content: "Hello" }]);
      state.messages[0] = { ...state.messages[0], turnIndex: 0 };
      const chatRef = React.createRef<import("../ChatView.js").ChatViewHandle>();
      const { container, rerender } = render(
        <ThemeProvider>
          <ChatView ref={chatRef} state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );

      // Start at bottom, then navigate to a turn
      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 950, 1000, 400);
      fireEvent.scroll(scrollEl);

      await act(async () => {
        chatRef.current?.scrollToTurn(0);
      });

      // Ref is wired and the navigated element exists
      expect(chatRef.current).not.toBeNull();
      expect(scrollEl.querySelector('[data-turn="0"]')).not.toBeNull();

      // Escape button must appear
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
      setScrollPosition(scrollEl, 950, 1500, 400);
      const state2 = stateWithMessages([
        { id: "1", role: "user", content: "Hello" },
        { id: "2", role: "assistant", content: "Hi" },
      ]);
      rerender(
        <ThemeProvider>
          <ChatView ref={chatRef} state={state2} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );

      // Navigation owns the viewport; replay/stream growth must not compensate it.
      expect(scrollEl.scrollTop).toBe(950);
    });

    it("clicking scroll-to-bottom button uses instant scroll while streaming", () => {
      const state = createInitialState();
      state.streamingText = "Streaming...";
      const { container } = render(<ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>);

      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 0, 1000, 400);
      fireEvent.scroll(scrollEl);

      scrollToSpy.mockClear();
      const btn = container.querySelector('[data-testid="scroll-to-bottom"]')!;
      fireEvent.click(btn);

      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    });
  });

  // RetryBanner + ErrorBanner moved to the unified SessionBanner mounted in
  // App.tsx (sticky above the command input). ChatView no longer renders
  // banners regardless of retryState/lastError. See change:
  // unify-status-banner-and-terminal-limit-stop.
  describe("banners no longer rendered inside ChatView (moved to App.tsx SessionBanner)", () => {
    it("does not render error-banner when lastError is set", () => {
      const state = createInitialState();
      state.lastError = { message: "Rate limit exceeded", timestamp: Date.now() };
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      expect(container.querySelector('[data-testid="error-banner"]')).toBeNull();
    });

    it("does not render retry-banner when retryState is set", () => {
      const state = {
        ...createInitialState(),
        retryState: { attempt: 1, maxAttempts: 3, delayMs: 2000, reason: "rate limit", startedAt: 0 },
      };
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      expect(container.querySelector('[data-testid="retry-banner"]')).toBeNull();
    });
  });

  // See change: render-skill-invocations-collapsibly.
  describe("skill-invocation routing", () => {
    it("routes user messages with skill metadata to SkillInvocationCard", () => {
      const state = createInitialState();
      const wrapped = `<skill name="openspec-explore" location="/x/SKILL.md">\nbody\n</skill>\n\nfollow up`;
      state.messages.push({
        id: "u-skill",
        role: "user",
        content: wrapped,
        timestamp: 1,
        skill: {
          name: "openspec-explore",
          location: "/x/SKILL.md",
          body: "body",
          args: "follow up",
          condensed: "/skill:openspec-explore follow up",
        },
      } as ChatMessage);
      state.messages.push({
        id: "u-plain",
        role: "user",
        content: "plain prompt",
        timestamp: 2,
      } as ChatMessage);
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      // The skill card uses aria-expanded for its toggle button. The plain bubble does not.
      const expandToggles = container.querySelectorAll("button[aria-expanded]");
      expect(expandToggles.length).toBe(1);
      // The condensed slash form appears in the document
      expect(container.textContent).toContain("/skill:openspec-explore follow up");
      // The plain prompt also renders
      expect(container.textContent).toContain("plain prompt");
    });

    it("plain user messages without skill stamp render as the regular bubble", () => {
      const state = stateWithMessages([
        { id: "u", role: "user", content: "hello" },
      ]);
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      // No card-style toggle button
      expect(container.querySelectorAll("button[aria-expanded]").length).toBe(0);
      // Standard MessageBubble copy buttons present
      expect(container.querySelector('button[title="Copy as Markdown"]')).not.toBeNull();
    });
  });

  // Banner-coexistence is impossible by construction: the unified
  // SessionBanner selector picks exactly one variant per render. See change:
  // unify-status-banner-and-terminal-limit-stop.
  describe("banner-state derivation is single-variant (moved to SessionBanner)", () => {
    it("chat view stays banner-free even when both retryState and lastError are set", () => {
      const state = {
        ...createInitialState(),
        retryState: { attempt: 2, maxAttempts: 3, delayMs: 4000, reason: "x", startedAt: 0 },
        lastError: { message: "boom", timestamp: 0 },
      };
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      expect(container.querySelector('[data-testid="retry-banner"]')).toBeNull();
      expect(container.querySelector('[data-testid="error-banner"]')).toBeNull();
    });
  });

  // See change: unify-status-banner-and-terminal-limit-stop.
  describe("manual-retry visual dedup", () => {
    it("skips rendering a user bubble flagged `retriedFrom`", () => {
      const state = createInitialState();
      const ts = Date.now();
      // Original user message (retained for findLastUserPrompt etc.)
      state.messages.push({
        id: "u1",
        role: "user",
        content: "fix the bug",
        timestamp: ts,
        entryId: "u1",
      } as ChatMessage);
      // Errored assistant turn
      state.messages.push({
        id: "a1",
        role: "assistant",
        content: "",
        timestamp: ts + 1,
        toolStatus: "error" as const,
      } as ChatMessage);
      // Manual-retry duplicate flagged with retriedFrom
      state.messages.push({
        id: "u2",
        role: "user",
        content: "fix the bug",
        timestamp: ts + 2,
        entryId: "u2",
        retriedFrom: "u1",
      } as ChatMessage);
      const { container } = render(
        <ThemeProvider>
          <ChatView state={state} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      // Both user entries are in state.messages, but the chat view should
      // render only ONE "fix the bug" bubble.
      const bubbles = Array.from(container.querySelectorAll("*"))
        .filter((el) => el.textContent === "fix the bug" && el.children.length === 0);
      // Exactly one text-node carrying the duplicate text. (The same string
      // may appear inside the markdown structure in slightly different DOM
      // shapes; what matters is that we don't see TWO message bubbles.)
      // The strict assertion: state.messages.length === 3 but the rendered
      // node count for that exact text === 1.
      expect(state.messages.length).toBe(3);
      expect(bubbles.length).toBe(1);
    });
  });
});


describe("advisor transcript rows", () => {
  it("renders an advisor row through the virtualized ChatView", () => {
    const state = createInitialState();
    state.messages.push({
      id: "advisor-1",
      role: "advisor",
      content: "raw advisory",
      timestamp: Date.now(),
      advisorDetails: { notes: [{ note: "fix the type", severity: "concern", advisor: "Scout" }] },
    });

    const { getByRole } = render(
      <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
    );
    expect(getByRole("button", { name: /scout.*concern/i })).not.toBeNull();
  });
});

// Task 1.7 (change: bounded-hot-transcript-state).
describe("evicted tool-burst markers", () => {
  it("renders a collapsed marker with count and seq range for each evicted burst", () => {
    const state = createInitialState();
    state.messages.push({ id: "1", role: "user", content: "hi", timestamp: Date.now(), seq: 100 });
    state.evictedToolBursts = [{ fromSeq: 10, toSeq: 42, count: 7 }];

    const { container } = render(
      <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
    );
    const markers = container.querySelectorAll('[data-testid="evicted-tool-burst-marker"]');
    expect(markers.length).toBe(1);
    expect(markers[0]!.textContent).toContain("7");
    expect(markers[0]!.textContent).toContain("10");
    expect(markers[0]!.textContent).toContain("42");
  });

  it("renders nothing when there are no evicted bursts", () => {
    const state = createInitialState();
    state.messages.push({ id: "1", role: "user", content: "hi", timestamp: Date.now() });

    const { container } = render(
      <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
    );
    expect(container.querySelector('[data-testid="evicted-tool-burst-marker"]')).toBeNull();
  });

  it("renders multiple markers ordered by fromSeq ascending", () => {
    const state = createInitialState();
    state.messages.push({ id: "1", role: "user", content: "hi", timestamp: Date.now(), seq: 100 });
    state.evictedToolBursts = [
      { fromSeq: 50, toSeq: 60, count: 3 },
      { fromSeq: 10, toSeq: 20, count: 2 },
    ];

    const { container } = render(
      <ThemeProvider><ChatView state={state} toolContext={defaultToolContext} /></ThemeProvider>,
    );
    const markers = container.querySelectorAll('[data-testid="evicted-tool-burst-marker"]');
    expect(markers.length).toBe(2);
    expect(markers[0]!.textContent).toContain("10");
    expect(markers[1]!.textContent).toContain("50");
  });
});

// Task 1.7 (change: bounded-hot-transcript-state).
describe("viewport-floor reporting", () => {
  it("reports the lowest visible seq up to the caller", () => {
    const state = createInitialState();
    state.messages.push(
      { id: "1", role: "user", content: "one", timestamp: Date.now(), seq: 5 },
      { id: "2", role: "assistant", content: "two", timestamp: Date.now(), seq: 6 },
    );
    const onVisibleFloorSeqChange = vi.fn();
    render(
      <ThemeProvider>
        <ChatView state={state} toolContext={defaultToolContext} onVisibleFloorSeqChange={onVisibleFloorSeqChange} />
      </ThemeProvider>,
    );
    expect(onVisibleFloorSeqChange).toHaveBeenCalled();
    const calls = onVisibleFloorSeqChange.mock.calls.map((c) => c[0]);
    expect(calls.at(-1)).toBe(5);
  });

  it("reports null when the transcript is empty", () => {
    const state = createInitialState();
    const onVisibleFloorSeqChange = vi.fn();
    render(
      <ThemeProvider>
        <ChatView state={state} toolContext={defaultToolContext} onVisibleFloorSeqChange={onVisibleFloorSeqChange} />
      </ThemeProvider>,
    );
    expect(onVisibleFloorSeqChange).toHaveBeenCalledWith(null);
  });
});

// See change: hot-window-metrics.
describe("renderRows derivation timing", () => {
  it("reports (sessionId, ms) with a finite non-negative ms for a non-empty transcript", () => {
    const state = stateWithMessages([
      { id: "1", role: "user", content: "one" },
      { id: "2", role: "assistant", content: "two" },
    ]);
    const onDerivationTiming = vi.fn();
    render(
      <ThemeProvider>
        <ChatView sessionId="s1" state={state} toolContext={defaultToolContext} onDerivationTiming={onDerivationTiming} />
      </ThemeProvider>,
    );
    expect(onDerivationTiming).toHaveBeenCalled();
    const [sid, ms] = onDerivationTiming.mock.calls.at(-1)!;
    expect(sid).toBe("s1");
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
