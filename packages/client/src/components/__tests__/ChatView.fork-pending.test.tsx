/**
 * Issue #107 (b) + (c) at the per-message fork control: clicking Fork gives
 * immediate feedback (spinner + disabled) instead of looking inert, and a
 * second click while the first is in flight sends nothing.
 *
 * Drives the real `ForkPendingProvider` + `useForkPendingController` so the
 * settle paths (`resume_result` either arm, correlated `session_added`, the
 * safety timeout) are exercised rather than mocked.
 *
 * See change: fork-action-opens-an-empty-chat.
 */
import { act, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/event-reducer.js";
import {
  FORK_PENDING_TIMEOUT_MS,
  ForkPendingProvider,
  useForkPendingController,
} from "../../lib/ForkPendingContext.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const ENTRY_ID = "entry-123";
const defaultToolContext: ToolContext = {};

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
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

function makeState() {
  const state = createInitialState();
  state.messages.push({
    id: "a0",
    role: "assistant",
    content: "answer",
    entryId: ENTRY_ID,
    timestamp: Date.now(),
  });
  return state;
}

/**
 * Mirrors App.tsx's wiring: the controller owns the pending set, the provider
 * publishes it, and `send` only fires when `beginFork` grants the slot.
 */
function Harness({
  send,
  onSettle,
  bind,
}: {
  send: (requestId: string) => void;
  onSettle?: (sessionId: string) => void;
  bind: (api: { settleFork: (requestId: string) => void }) => void;
}) {
  const { pendingKeys, beginFork, settleFork } = useForkPendingController(onSettle);
  bind({ settleFork });
  let n = 0;
  const handleFork = (entryId: string) => {
    const requestId = `rq_${++n}_${Math.random().toString(36).slice(2)}`;
    if (!beginFork(entryId, "s1", requestId)) return;
    send(requestId);
  };
  return (
    <ThemeProvider>
      <ForkPendingProvider pendingKeys={pendingKeys}>
        <ChatView
          sessionId="s1"
          state={makeState()}
          toolContext={defaultToolContext}
          onForkFromMessage={handleFork}
        />
      </ForkPendingProvider>
    </ThemeProvider>
  );
}

function setup(onSettle?: (sessionId: string) => void) {
  const send = vi.fn();
  const api: { settleFork: (requestId: string) => void } = { settleFork: () => {} };
  const { container } = render(
    <Harness send={send} onSettle={onSettle} bind={(a) => { api.settleFork = a.settleFork; }} />,
  );
  const btn = () => container.querySelector<HTMLButtonElement>('[data-testid="fork-from-here-btn"]')!;
  return { send, api, btn };
}

describe("ChatView fork-from-here — pending feedback + dedup", () => {
  it("shows a spinner and disables the button synchronously on click", () => {
    const { send, btn } = setup();
    expect(btn().disabled).toBe(false);
    expect(btn().title).toBe("Fork from here");

    act(() => { btn().click(); });

    // No server message has arrived — the feedback is purely local.
    expect(send).toHaveBeenCalledTimes(1);
    expect(btn().disabled).toBe(true);
    expect(btn().title).toBe("Forking…");
    expect(btn().querySelector(".animate-spin")).not.toBeNull();
  });

  it("sends once for two rapid clicks", () => {
    const { send, btn } = setup();
    act(() => { btn().click(); btn().click(); });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(["resume_result (either arm)", "correlated session_added"])(
    "re-enables the button when %s settles the requestId",
    () => {
      const onSettle = vi.fn();
      const { send, api, btn } = setup(onSettle);
      act(() => { btn().click(); });
      const requestId = send.mock.calls[0][0];
      expect(btn().disabled).toBe(true);

      act(() => { api.settleFork(requestId); });

      expect(btn().disabled).toBe(false);
      expect(btn().title).toBe("Fork from here");
      // The source session's optimistic `resuming` gets cleared too — fork
      // leaves that session alive, so nothing else ever would.
      expect(onSettle).toHaveBeenCalledWith("s1");
    },
  );

  it("settling an unrelated requestId leaves the button pending", () => {
    const { btn, api } = setup();
    act(() => { btn().click(); });
    act(() => { api.settleFork("rq_someone_else"); });
    expect(btn().disabled).toBe(true);
  });

  it("the safety timeout settles a lost response so no control stays disabled", () => {
    vi.useFakeTimers();
    try {
      const onSettle = vi.fn();
      const { btn } = setup(onSettle);
      act(() => { btn().click(); });
      expect(btn().disabled).toBe(true);

      act(() => { vi.advanceTimersByTime(FORK_PENDING_TIMEOUT_MS); });

      expect(btn().disabled).toBe(false);
      expect(onSettle).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });
});
