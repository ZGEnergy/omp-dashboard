import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import { createInitialState } from "../../lib/event-reducer.js";
import type { ToolContext } from "../tool-renderers/index.js";

const defaultToolContext: ToolContext = { editors: [] };

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

function stateWith(n: number) {
  const s = createInitialState();
  for (let i = 0; i < n; i++) {
    s.messages.push({ id: String(i), role: "user", content: `m${i}`, timestamp: Date.now() });
  }
  return s;
}

/** Flush one animation frame — auto-scroll effect schedules its scrollTo via rAF */
async function flushRaf() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

describe("ChatView scroll race during multi-batch replay", () => {
  it("ignores racing onScroll events while a programmatic scroll is in flight", async () => {
    // Mount with empty state
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={createInitialState()} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    // Simulate replay batch arriving: messages.length grows → auto-scroll effect
    // schedules a programmatic scrollTo and marks the suppression flag.
    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf(); // run the rAF callback that performs scrollTo and sets the flag

    // While the flag is set, fire a racing onScroll event with geometry that
    // *would* normally indicate "user scrolled up": scrollHeight grew (next
    // batch already arrived) but scrollTop is still old. handleScroll must
    // ignore this measurement.
    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 100, 5000, 400);
    fireEvent.scroll(scrollEl);

    // Button must remain hidden — the spurious "scrolled away" write was suppressed
    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).toBeNull();
  });

  it("real user scroll-up after the suppression window shows the button", async () => {
    const { container, rerender } = render(
      <ThemeProvider>
        <ChatView state={createInitialState()} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    rerender(
      <ThemeProvider>
        <ChatView state={stateWith(50)} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    await flushRaf();

    // Wait past the 150 ms suppression window
    await new Promise<void>((r) => setTimeout(r, 200));

    const scrollEl = getScrollContainer(container);
    setScrollPosition(scrollEl, 100, 5000, 400);
    fireEvent.scroll(scrollEl);

    expect(container.querySelector('[data-testid="scroll-to-bottom"]')).not.toBeNull();
  });
});
