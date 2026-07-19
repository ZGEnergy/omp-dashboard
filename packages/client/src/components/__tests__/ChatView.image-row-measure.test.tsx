import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatImage, createInitialState } from "../../lib/event-reducer.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const defaultToolContext: ToolContext = {};

// 1×1 transparent PNG.
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function img(): ChatImage {
  return { data: PNG_1x1, mimeType: "image/png" };
}

function stateWithUserImages(images: ChatImage[]) {
  const state = createInitialState();
  state.messages.push({
    id: "u-img",
    role: "user",
    content: "here is an image",
    images,
    timestamp: Date.now(),
  });
  return state;
}

function setScrollPosition(el: Element, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, writable: true, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, writable: true, configurable: true });
}

function rowTop(row: Element): number {
  const match = row.getAttribute("style")?.match(/translateY\(([-\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

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

describe("ChatView image-row re-measure", () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Deferred rAF: capture callbacks so we control flush timing and can count
    // how many measure passes were scheduled.
    rafSpy = vi.spyOn(window, "requestAnimationFrame");
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it("re-measures an attached image without moving the active mobile row anchor", async () => {
    const state = stateWithUserImages([img()]);
    state.messages.push({ id: "after-image", role: "assistant", content: "row after image", timestamp: Date.now() });
    const { container } = render(
      <ThemeProvider>
        <ChatView
          sessionId="s1"
          state={state}
          toolContext={defaultToolContext}
          mobileActive
          mobileActivationEpoch={1}
          replayGeneration={1}
        />
      </ThemeProvider>,
    );
    const image = container.querySelector("img");
    const scrollEl = container.querySelector("[data-testid='chat-scroll-container']")!;
    const row = image?.closest("[data-index]");
    expect(image).not.toBeNull();
    expect(row).not.toBeNull();
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    // A real image decode changes row geometry. While the user is reading
    // history, that measurement must not hand ownership back to follow mode.
    setScrollPosition(scrollEl, 25, 2_000, 400);
    fireEvent.wheel(scrollEl, { deltaY: -20 });
    fireEvent.scroll(scrollEl);
    const anchorTop = rowTop(row!);
    const followingTopBefore = rowTop(container.querySelector('[data-index="1"]')!);
    Object.defineProperty(row!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: anchorTop, bottom: anchorTop + 180, height: 180, width: 320, left: 0, right: 320 }),
    });

    rafSpy.mockClear();
    act(() => {
      image?.dispatchEvent(new Event("load"));
    });

    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(scrollEl.scrollTop).toBe(25);
    expect(rowTop(row!)).toBe(anchorTop);
    // The next virtual row must move after the decoded image changes this row's measurement.
    expect(rowTop(container.querySelector('[data-index="1"]')!)).toBeGreaterThan(followingTopBefore);
  });

  it("coalesces multiple images in one row to a single re-measure per frame", async () => {
    const state = stateWithUserImages([img(), img(), img()]);
    state.messages.push({ id: "after-images", role: "assistant", content: "row after images", timestamp: Date.now() });
    const { container } = render(
      <ThemeProvider>
        <ChatView sessionId="s1" state={state} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    const images = container.querySelectorAll("img");
    expect(images.length).toBe(3);
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const scrollEl = container.querySelector("[data-testid='chat-scroll-container']")!;
    const row = images[0]?.closest("[data-index]");
    expect(row).not.toBeNull();
    setScrollPosition(scrollEl, 30, 2_000, 400);
    fireEvent.wheel(scrollEl, { deltaY: -20 });
    fireEvent.scroll(scrollEl);
    const anchorTop = rowTop(row!);
    const followingTopBefore = rowTop(container.querySelector('[data-index="1"]')!);
    Object.defineProperty(row!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: anchorTop, bottom: anchorTop + 220, height: 220, width: 320, left: 0, right: 320 }),
    });

    rafSpy.mockClear();
    act(() => {
      for (const el of images) el.dispatchEvent(new Event("load"));
    });

    // Three decodes in the same frame → one measure pass, with the reading
    // anchor and its offset unchanged.
    expect(rafSpy).toHaveBeenCalledTimes(1);
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(scrollEl.scrollTop).toBe(30);
    expect(rowTop(row!)).toBe(anchorTop);
    expect(rowTop(container.querySelector('[data-index="1"]')!)).toBeGreaterThan(followingTopBefore);
  });

  it("does not schedule a re-measure when an image fails to decode (onError)", () => {
    // Only onLoad drives the re-measure; a broken data-URL fires onError and
    // must NOT schedule a measure pass (the reserved loading box keeps the row
    // bounded, so nothing collapses). Guards against wiring onError by mistake.
    const state = stateWithUserImages([img()]);
    const { container } = render(
      <ThemeProvider>
        <ChatView sessionId="s1" state={state} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    rafSpy.mockClear();
    act(() => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(rafSpy).not.toHaveBeenCalled();
  });
});
