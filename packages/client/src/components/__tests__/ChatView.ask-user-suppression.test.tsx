import { render, within } from "@testing-library/react";
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type ChatMessage, createInitialState } from "../../lib/chat/event-reducer.js";
import { ChatView } from "../chat/ChatView.js";
import { ThemeProvider } from "../settings/ThemeProvider.js";
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

const TITLE = "Deploy to production?";

function askUserToolResult(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "tool-t1",
    role: "toolResult",
    content: "ask_user",
    toolName: "ask_user",
    toolCallId: "t1",
    args: { method: "confirm", title: TITLE, message: "This is irreversible." },
    toolStatus: "running",
    timestamp: Date.now(),
    ...overrides,
  };
}

function interactiveUi(status: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "ui-r1",
    role: "interactiveUi",
    content: "confirm",
    toolCallId: "t1",
    timestamp: Date.now(),
    args: {
      requestId: "r1",
      method: "confirm",
      params: { title: TITLE, message: "This is irreversible." },
      status,
    } as Record<string, unknown>,
    ...overrides,
  };
}

function toolBurst(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tool-burst-${index}`,
    role: "toolResult",
    content: `output-${index}`,
    toolName: "bash",
    toolCallId: `burst-${index}`,
    args: { command: `printf output-${index}` },
    toolStatus: "complete",
    timestamp: Date.now() + index,
  }));
}

function renderChat(messages: ChatMessage[]) {
  const state = createInitialState();
  state.messages.push(...messages);
  return render(
    <ThemeProvider>
      <ChatView state={state} toolContext={defaultToolContext} />
    </ThemeProvider>,
  );
}

describe("ChatView — ask_user tool-card suppression (change: fix-ask-user-card-duplication)", () => {
  // The ask_user tool card is ToolCallStep's collapse toggle <button>, whose
  // summary text is getSummary(ask_user) === the ask_user title. A button
  // containing the title exists ONLY for the tool card (the interactive card
  // renders the title in a non-button span), so it proves the tool card
  // rendered. Same detection strategy as ChatView.streaming-text-flush.test.
  const toolCardButton = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.includes(TITLE)) ?? null;

  it("T.1 (pending live): suppresses the ask_user tool card when a paired pending interactiveUi exists; interactive card renders", () => {
    const { container, getByText } = renderChat([
      askUserToolResult({ toolStatus: "running" }),
      interactiveUi("pending"),
    ]);
    expect(toolCardButton(container)).toBeNull();
    // pending ConfirmRenderer widget is the single card
    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
  });

  it("T.1 (answered but still live): suppresses the tool card when the paired interactiveUi is RESOLVED but still in the list — the case the adjacency/pending helper misses", () => {
    const { container, getByText } = renderChat([
      askUserToolResult({ toolStatus: "complete", result: 'User responded: true' }),
      interactiveUi("resolved", { args: {
        requestId: "r1",
        method: "confirm",
        params: { title: TITLE, message: "This is irreversible." },
        status: "resolved",
        result: { confirmed: true },
      } as Record<string, unknown> }),
    ]);
    expect(toolCardButton(container)).toBeNull();
    // resolved ConfirmRenderer still shows the question + both options
    expect(getByText(TITLE)).toBeTruthy();
  });

  it("T.2 (history reload): renders the ask_user tool card when there is NO paired interactiveUi", () => {
    const { container } = renderChat([
      askUserToolResult({ toolStatus: "complete", result: 'User responded: true' }),
    ]);
    expect(toolCardButton(container)).not.toBeNull();
  });
  it("T.3 (pending prompt): keeps the latest non-widget prompt persistent after a large tool burst", () => {
    const { container, getByTestId } = renderChat([
      ...toolBurst(80),
      askUserToolResult({ toolStatus: "running" }),
      interactiveUi("pending"),
    ]);
    const scroll = getByTestId("chat-scroll-container");
    const prompt = getByTestId("active-interactive-prompt");

    expect(scroll.contains(prompt)).toBe(false);
    expect(scroll.nextElementSibling).toBe(prompt);
    expect(within(prompt).getByText("Yes")).toBeTruthy();
    expect(within(prompt).getByText("No")).toBeTruthy();
    expect(within(scroll).queryByText(TITLE)).toBeNull();
    expect(toolCardButton(container)).toBeNull();
    expect(container.querySelectorAll('[data-testid="active-interactive-prompt"]')).toHaveLength(1);
  });

  it("T.4 (resolved prompt): keeps the historical prompt inline without a persistent bar", () => {
    const { container, getByTestId, queryByTestId } = renderChat([
      ...toolBurst(80),
      askUserToolResult({ toolStatus: "complete", result: 'User responded: true' }),
      interactiveUi("resolved", {
        args: {
          requestId: "r1",
          method: "confirm",
          params: { title: TITLE, message: "This is irreversible." },
          status: "resolved",
          result: { confirmed: true },
        } as Record<string, unknown>,
      }),
    ]);
    const scroll = getByTestId("chat-scroll-container");

    expect(queryByTestId("active-interactive-prompt")).toBeNull();
    expect(within(scroll).getByText(TITLE)).toBeTruthy();
    expect(toolCardButton(container)).toBeNull();
  });
});
