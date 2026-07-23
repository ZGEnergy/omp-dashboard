/**
 * Regression lock for issue #69: "Fork from here" on a completed assistant
 * message must render the fork button and dispatch onForkFromMessage(entryId)
 * on click — proving the client wiring is intact end-to-end (not inert).
 */
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/event-reducer.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

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

describe("ChatView fork-from-here", () => {
  it("renders the fork button and dispatches onForkFromMessage(entryId) on click", () => {
    const state = createInitialState();
    state.messages.push({
      id: "a0",
      role: "assistant",
      content: "answer",
      entryId: "entry-123",
      timestamp: Date.now(),
    });
    const onForkFromMessage = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <ChatView
          sessionId="s1"
          state={state}
          toolContext={defaultToolContext}
          onForkFromMessage={onForkFromMessage}
        />
      </ThemeProvider>,
    );

    const btn = container.querySelector<HTMLButtonElement>('button[title="Fork from here"]');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(onForkFromMessage).toHaveBeenCalledTimes(1);
    expect(onForkFromMessage).toHaveBeenCalledWith("entry-123");
  });

  it("hides the fork button when no onForkFromMessage handler is bound", () => {
    const state = createInitialState();
    state.messages.push({
      id: "a0",
      role: "assistant",
      content: "answer",
      entryId: "entry-123",
      timestamp: Date.now(),
    });
    const { container } = render(
      <ThemeProvider>
        <ChatView sessionId="s1" state={state} toolContext={defaultToolContext} />
      </ThemeProvider>,
    );
    expect(container.querySelector('button[title="Fork from here"]')).toBeNull();
  });
});
