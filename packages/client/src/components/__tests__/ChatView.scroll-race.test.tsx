import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/event-reducer.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const defaultToolContext: ToolContext = {};

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

function setScrollPosition(el: Element, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, writable: true, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, writable: true, configurable: true });
}

function getScrollContainer(container: HTMLElement): HTMLElement {
  return container.querySelector("[class*='overflow-y-auto']")!;
}

function getRowTop(row: Element): number {
  const match = row.getAttribute("style")?.match(/translateY\(([-\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

function findRowContaining(scrollEl: Element, text: string): Element | undefined {
  return Array.from(scrollEl.querySelectorAll("[data-index]"))
    .find((row) => row.textContent?.includes(text));
}

function stateWith(n: number) {
  const s = createInitialState();
  for (let i = 0; i < n; i++) {
    s.messages.push({ id: String(i), role: "user", content: `m${i}`, timestamp: Date.now() });
  }
  return s;
}

function stateWithRange(start: number, end: number) {
  const s = createInitialState();
  for (let i = start; i < end; i++) {
    s.messages.push({ id: `row-${i}`, role: "user", content: `m${i}`, timestamp: i });
  }
  return s;
}

/** Flush one animation frame — some React updates still flush through rAF in tests */
async function flushRaf() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

describe("ChatView sticky scroll", () => {
  it("keeps the scroll-to-bottom button hidden after programmatic auto-scroll", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={createInitialState()} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    // Simulate content streaming in while the user is already at the bottom
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 950, 1000, 400);
    fireEvent.scroll(scrollEl); // sets stickToBottomRef = true

    setScrollPosition(scrollEl, 950, 1500, 400);
    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );

    // Programmatic auto-scroll must not surface the escape button
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
  });

  it("lets the user escape sticky bottom immediately on scroll-up", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={createInitialState()} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    // Start at bottom, then scroll up
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 0, 1000, 400);
    fireEvent.scroll(scrollEl);
    setScrollPosition(scrollEl, 0, 1000, 400);
    fireEvent.scroll(scrollEl);

    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();

    // More content arrives; scroll must stay where the user left it
    const previousTop = scrollEl.scrollTop;
    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );

    expect(scrollEl.scrollTop).toBe(previousTop);
  });

  it("re-arms sticky bottom when the user scrolls back to the end", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={createInitialState()} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    const scrollEl = getScrollContainer(container);
    // Escape
    setScrollPosition(scrollEl, 0, 1000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();

    // Return to bottom
    setScrollPosition(scrollEl, 950, 1000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();

    // New content should now be chased again
    setScrollPosition(scrollEl, 950, 1500, 400);
    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    expect(scrollEl.scrollTop).toBe(1500);
  });

  it("one click on scroll-to-bottom survives mid-flight height growth (virtualized rows measuring in)", async () => {
    // Regression: under TanStack virtualization the rows below the viewport
    // are ESTIMATED; while the smooth scroll descends they mount + measure and
    // scrollHeight grows past the click-time target. The in-flight scroll
    // events see nearBottom=false and used to clear stickToBottomRef, so the
    // descent stalled short of the bottom and the button had to be clicked
    // repeatedly. One click must latch "descend to bottom" until arrival.
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    const scrollEl = getScrollContainer(container);
    // User is far up the transcript — button visible.
    setScrollPosition(scrollEl, 0, 2000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();

    // Click the button (scrollTo is stubbed in jsdom — the descent is
    // represented by the scroll events we fire below).
    fireEvent.click(container.querySelector('[data-testid="scroll-to-bottom"]')!);

    // Mid-flight: not yet at the bottom AND scrollHeight grew (rows measured).
    setScrollPosition(scrollEl, 900, 2600, 400);
    fireEvent.scroll(scrollEl);

    // The single click must keep the descent latched: button stays hidden…
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();

    // …and the sticky pin must still chase the (grown) bottom on next content.
    setScrollPosition(scrollEl, 900, 3000, 400);
    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(51)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    expect(scrollEl.scrollTop).toBe(3000);
  });

  it("user wheel input cancels an in-flight scroll-to-bottom descent", async () => {
    const { container } = render(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 0, 2000, 400);
    fireEvent.scroll(scrollEl);
    const scrollToSpy = vi.spyOn(scrollEl, "scrollTo");
    fireEvent.click(container.querySelector('[data-testid="scroll-to-bottom"]')!);
    const callsAfterClick = scrollToSpy.mock.calls.length;

    // The user grabs the wheel mid-descent — that must cancel both the latch
    // and the already queued rAF write.
    fireEvent.wheel(scrollEl, { deltaY: -100 });
    setScrollPosition(scrollEl, 700, 2600, 400);
    fireEvent.scroll(scrollEl);
    await flushRaf();

    // Escape respected: button re-appears, no forced pin.
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
    expect(scrollToSpy.mock.calls.length).toBe(callsAfterClick);
  });

  /**
   * Cold return / full replay often wipes then rebuilds messages without
   * changing `sessionId`. Restore only runs on sessionId change, so a prior
   * scroll-lock would leave stickToBottom=false while history floods in.
   * loadingHistory true→false re-pins bottom unless the user escapes mid-hydrate.
   * See change: session-tail-rehydrate.
   */
  describe("hydrate land after same-session wipe/rebuild", () => {
    it("re-pins to bottom after empty wipe + full history even if stick was escaped before hydrate", async () => {
      const { container, rerender } = render(
        <ThemeProvider>
          <ChatView sessionId="s-hydrate" state={stateWith(40)} toolContext={defaultToolContext} />
        </ThemeProvider>,
      );
      await flushRaf();

      const scrollEl = getScrollContainer(container);
      // User (or estimate-correction scroll event) leaves the bottom.
      setScrollPosition(scrollEl, 200, 4000, 400);
      fireEvent.scroll(scrollEl);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();

      // Full wipe: same sessionId, empty transcript + loadingHistory.
      rerender(
        <ThemeProvider>
          <ChatView
            sessionId="s-hydrate"
            state={createInitialState()}
            toolContext={defaultToolContext}
            loadingHistory={true}
          />
        </ThemeProvider>,
      );
      await flushRaf();

      const rebuilt = stateWith(80);
      rebuilt.messages[rebuilt.messages.length - 1] = {
        id: "asst-last",
        role: "assistant",
        content: "final agent reply",
        timestamp: Date.now(),
      };
      rebuilt.messages[40] = {
        id: "asst-mid",
        role: "assistant",
        content: "mid-history agent reply that looks like a resume target",
        timestamp: Date.now(),
      };

      // Layout lag: content taller than viewport, scrollTop still mid.
      setScrollPosition(scrollEl, 200, 8000, 400);
      rerender(
        <ThemeProvider>
          <ChatView sessionId="s-hydrate" state={rebuilt} toolContext={defaultToolContext} loadingHistory={false} />
        </ThemeProvider>,
      );
      await flushRaf();

      expect(scrollEl.scrollTop).toBe(8000);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
    });

    it("first visit with empty then hydrate still chases bottom while stick is armed", async () => {
      const { container, rerender } = render(
        <ThemeProvider>
          <ChatView
            sessionId="s-cold"
            state={createInitialState()}
            toolContext={defaultToolContext}
            loadingHistory={true}
          />
        </ThemeProvider>,
      );
      await flushRaf();

      const scrollEl = getScrollContainer(container);
      setScrollPosition(scrollEl, 0, 400, 400);
      fireEvent.scroll(scrollEl);

      setScrollPosition(scrollEl, 0, 5000, 400);
      rerender(
        <ThemeProvider>
          <ChatView sessionId="s-cold" state={stateWith(60)} toolContext={defaultToolContext} loadingHistory={false} />
        </ThemeProvider>,
      );
      await flushRaf();

      expect(scrollEl.scrollTop).toBe(5000);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
    });

    // Session-switch + cold return is covered by the wipe/rebuild case above
    // (same-session loadingHistory true→false re-pin) plus cold-open stick arming.

    it("programmatic mid-list scroll during hydrate does not kill live stick after land", async () => {
      // Regression: virtualizer pin/measurement fires scroll without a user
      // gesture. Treating those as escape left stick=false after tail hydrate,
      // so live streaming no longer auto-followed.
      // See change: session-tail-rehydrate (live-follow after hydrate).
      const { container, rerender } = render(
        <ThemeProvider>
          <ChatView
            sessionId="s-live"
            state={createInitialState()}
            toolContext={defaultToolContext}
            loadingHistory={true}
          />
        </ThemeProvider>,
      );
      await flushRaf();

      const scrollEl = getScrollContainer(container);
      // Programmatic "jump" mid-list while hydrating — no wheel/touch.
      setScrollPosition(scrollEl, 100, 5000, 400);
      fireEvent.scroll(scrollEl);

      // Hydrate completes with content; must re-pin and keep stick.
      setScrollPosition(scrollEl, 100, 5000, 400);
      rerender(
        <ThemeProvider>
          <ChatView
            sessionId="s-live"
            state={stateWith(40)}
            toolContext={defaultToolContext}
            loadingHistory={false}
          />
        </ThemeProvider>,
      );
      await flushRaf();
      expect(scrollEl.scrollTop).toBe(5000);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();

      // Further content growth must still be chased (live follow).
      setScrollPosition(scrollEl, 5000, 6000, 400);
      rerender(
        <ThemeProvider>
          <ChatView
            sessionId="s-live"
            state={stateWith(55)}
            toolContext={defaultToolContext}
            loadingHistory={false}
          />
        </ThemeProvider>,
      );
      await flushRaf();
      expect(scrollEl.scrollTop).toBe(6000);
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
    });

    it("real wheel during hydrate still allows escape from stick", async () => {
      const { container, rerender } = render(
        <ThemeProvider>
          <ChatView
            sessionId="s-esc"
            state={createInitialState()}
            toolContext={defaultToolContext}
            loadingHistory={true}
          />
        </ThemeProvider>,
      );
      await flushRaf();

      const scrollEl = getScrollContainer(container);
      fireEvent.wheel(scrollEl, { deltaY: -40 });
      setScrollPosition(scrollEl, 50, 5000, 400);
      fireEvent.scroll(scrollEl);

      setScrollPosition(scrollEl, 50, 5000, 400);
      rerender(
        <ThemeProvider>
          <ChatView
            sessionId="s-esc"
            state={stateWith(40)}
            toolContext={defaultToolContext}
            loadingHistory={false}
          />
        </ThemeProvider>,
      );
      await flushRaf();

      // Escaped mid-hydrate: do not force re-pin; scroll-to-bottom button shows.
      expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
    });
  });
});

// Scroll-to-top affordance (change: fix-chat-scroll-to-top-estimate-drift,
// Decision 3). These are LOGIC guards on the state machine — the browser-
// timing convergence guarantee (scrollTop lands on 0 through the bounded
// scrollToIndex retries + async image remeasure) is Playwright-gated; jsdom's
// virtualizer shim reports 0-height rows and a no-op ResizeObserver, so a
// scrollTop===0 assertion here would be vacuous.
describe("ChatView scroll-to-top", () => {
  it("shows the scroll-to-top button when scrolled away from the top, hides it at the top", async () => {
    const { container } = render(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);

    // Scrolled down (away from the top) → button appears.
    setScrollPosition(scrollEl, 900, 2000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-top"]')).not.toBeNull();

    // Back at the very top → button hidden.
    setScrollPosition(scrollEl, 0, 2000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-top"]')).toBeNull();
  });

  it("does not fight the bottom-pin: activating scroll-to-top from the bottom while streaming stays scroll-locked", async () => {
    // The re-arm race: starting the ascent from the bottom means handleScroll
    // fires with nearBottom=true during the scroll-to-top; without the
    // ascendingRef latch it would flip stickToBottomRef back to true and the
    // onChange/auto-scroll pin would yank the view back to the bottom.
    const streaming = stateWith(50);
    streaming.streamingText = "assistant is typing…";
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={streaming} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);

    // User is at the bottom (following).
    setScrollPosition(scrollEl, 950, 1000, 400);
    fireEvent.scroll(scrollEl);
    expect(container.querySelector('[data-testid="scroll-to-top"]')).not.toBeNull();

    // Activate scroll-to-top. scrollTo is stubbed, so the DOM position does not
    // move here — we assert the STATE MACHINE stays scroll-locked.
    fireEvent.click(container.querySelector('[data-testid="scroll-to-top"]')!);

    // A scroll event still reporting near-bottom must NOT re-arm the pin
    // (ascendingRef branch holds stickToBottomRef false).
    setScrollPosition(scrollEl, 950, 1000, 400);
    fireEvent.scroll(scrollEl);

    // More streaming content arrives with grown height. Because follow is
    // suspended, the view must NOT be pinned to the (grown) bottom.
    const before = scrollEl.scrollTop;
    const more = stateWith(60);
    more.streamingText = "still typing…";
    setScrollPosition(scrollEl, 950, 2000, 400);
    rerender(
      <ThemeProvider>
        <ChatView state={more} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    expect(scrollEl.scrollTop).toBe(before); // not yanked to scrollHeight (2000)
  });
});

describe("ChatView mobile scroll owner", () => {
  it("lands latest when only the same-session mobile activation epoch changes", async () => {
    const state = stateWith(60);
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView
          sessionId="same"
          state={state}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={1}
        />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 175, 4_000, 400);

    rerender(
      <ThemeProvider>
        <ChatView
          sessionId="same"
          state={state}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={2}
          replayGeneration={1}
        />
      </ThemeProvider>,
    );
    await flushRaf();

    expect(scrollEl.scrollTop).toBe(4_000);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
  });

  it("does not page when a programmatic top navigation emits scroll", async () => {
    const onLoadOlder = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <ChatView
          sessionId="programmatic-top"
          state={stateWith(50)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={1}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
        />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 800, 2_000, 400);
    fireEvent.scroll(scrollEl);
    fireEvent.click(container.querySelector('[data-testid="scroll-to-top"]')!);
    setScrollPosition(scrollEl, 0, 2_000, 400);
    fireEvent.scroll(scrollEl);

    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it("consumes one older page for a burst of older-directed wheel callbacks", async () => {
    const onLoadOlder = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <ChatView
          sessionId="wheel-burst"
          state={stateWithRange(0, 50)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={7}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
        />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 20, 2_000, 400);

    for (let i = 0; i < 4; i++) {
      fireEvent.wheel(scrollEl, { deltaY: -30 });
      fireEvent.scroll(scrollEl);
    }

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(onLoadOlder).toHaveBeenCalledWith(expect.stringMatching(/^wheel-burst:/));
  });

  it("lets touch input escape a hydrate before replay completion", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView
          sessionId="touch-escape"
          state={createInitialState()}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={2}
          loadingHistory
        />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 40, 3_000, 400);
    fireEvent.touchStart(scrollEl, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(scrollEl, { touches: [{ clientY: 150 }] });
    fireEvent.scroll(scrollEl);

    rerender(
      <ThemeProvider>
        <ChatView
          sessionId="touch-escape"
          state={stateWith(60)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={2}
          loadingHistory={false}
        />
      </ThemeProvider>,
    );
    await flushRaf();

    expect(scrollEl.scrollTop).toBe(40);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
  });

  it("restores only the matching completed older anchor and ignores generic height growth", async () => {
    const onLoadOlder = vi.fn();
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView
          sessionId="anchor"
          state={stateWithRange(0, 3)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={3}
          replayGeneration={4}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
        />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 20, 2_000, 400);
    // TanStack's jsdom range is intentionally narrow; anchor whichever row is
    // actually mounted at this viewport rather than assuming row zero exists.
    const mountedRows = Array.from(scrollEl.querySelectorAll("[data-index]"));
    // ChatView captures the first virtual item whose end is below scrollTop;
    // at this near-top position that is the first mounted row.
    const capturedRow = mountedRows[0];
    expect(capturedRow).toBeDefined();
    const capturedIdentity = capturedRow!.textContent ?? "";
    expect(capturedIdentity).not.toBe("");
    const capturedRowTop = getRowTop(capturedRow!);
    const capturedOffset = 20 - capturedRowTop;
    fireEvent.wheel(scrollEl, { deltaY: -30 });
    fireEvent.scroll(scrollEl);
    const anchorToken = onLoadOlder.mock.calls[0]?.[0] as string;
    expect(anchorToken).toBeTruthy();

    setScrollPosition(scrollEl, 20, 3_000, 400);
    rerender(
      <ThemeProvider>
        <ChatView
          sessionId="anchor"
          state={stateWithRange(-1, 3)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={3}
          replayGeneration={4}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
          completedOlderAnchorToken="some-other-request"
        />
      </ThemeProvider>,
    );
    await flushRaf();
    expect(scrollEl.scrollTop).toBe(20);

    rerender(
      <ThemeProvider>
        <ChatView
          sessionId="anchor"
          state={stateWithRange(-1, 3)}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={3}
          replayGeneration={4}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
          completedOlderAnchorToken={anchorToken}
        />
      </ThemeProvider>,
    );
    for (let i = 0; i < 4; i++) await flushRaf();
    // jsdom does not emit the native scroll notification for the virtualizer's
    // direct anchor write. Drive that real event once so its mounted range
    // catches up before checking the retained row identity.
    fireEvent.scroll(scrollEl);
    for (let i = 0; i < 2; i++) await flushRaf();

    // The removed total-height compensation would jump to 1020. Correlated
    // restoration must converge on the same row and its captured offset.
    const restoredRow = Array.from(scrollEl.querySelectorAll("[data-index]")).find(
      (row) => row.textContent === capturedIdentity,
    );
    expect(restoredRow).toBeDefined();
    expect(scrollEl.scrollTop).toBe(getRowTop(restoredRow!) + capturedOffset);
    expect(scrollEl.scrollTop).not.toBe(1_020);
  });

  it("keeps the desktop saved anchor across session switches", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView sessionId="desktop-a" state={stateWithRange(0, 50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 240, 2_000, 400);
    fireEvent.scroll(scrollEl);

    rerender(
      <ThemeProvider>
        <ChatView sessionId="desktop-b" state={stateWithRange(100, 150)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    setScrollPosition(scrollEl, 900, 2_000, 400);

    rerender(
      <ThemeProvider>
        <ChatView sessionId="desktop-a" state={stateWithRange(0, 50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();
    await flushRaf();

    const restoredScrollEl = getScrollContainer(container);
    expect(restoredScrollEl.scrollTop).toBe(240);
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
  });

  it("keeps the explicit older button and captures an anchor token", async () => {
    const onLoadOlder = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <ChatView
          sessionId="button"
          state={stateWith(5)}
          toolContext={defaultToolContext}
          hasMoreOlder
          onLoadOlder={onLoadOlder}
        />
      </ThemeProvider>,
    );
    await flushRaf();

    fireEvent.click(container.querySelector('[data-testid="load-older-button"]')!);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(onLoadOlder).toHaveBeenCalledWith(expect.stringMatching(/^button:/));
  });
});
