import type { ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolPayloadController } from "../../hooks/useToolPayloads.js";
import { createInitialState } from "../../lib/event-reducer.js";
import { ChatView } from "../ChatView.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const defaultToolContext: ToolContext = {};

const stub: ToolCallStub = {
  toolCallId: "t1",
  toolName: "Read",
  argsSummary: 'Read("src/a.ts")',
  status: "ok",
  startedAt: 1,
  fullBytes: 2_411_724,
  head: "sliced head",
  detailLevel: "sliced",
};

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

function stateWithStubbedTool() {
  const state = createInitialState();
  state.messages.push(
    { id: "u1", role: "user", content: "go", timestamp: 1, seq: 1 },
    {
      id: "tool-t1",
      role: "toolResult",
      content: "Read",
      toolName: "Read",
      toolCallId: "t1",
      toolStatus: "complete",
      toolStub: stub,
      timestamp: 2,
      seq: 2,
    },
  );
  return state;
}

function controller(overrides: Partial<ToolPayloadController> = {}): ToolPayloadController {
  return {
    get: () => undefined,
    isLoading: () => false,
    isError: () => false,
    fetch: vi.fn(),
    ...overrides,
  };
}

function renderChat(toolPayloads?: ToolPayloadController) {
  return render(
    <ThemeProvider>
      <ChatView
        sessionId="s1"
        state={stateWithStubbedTool()}
        toolContext={defaultToolContext}
        toolPayloads={toolPayloads}
      />
    </ThemeProvider>,
  );
}

describe("ChatView tool-stub routing", () => {
  it("routes a stubbed tool row to ToolStubRow instead of the full tool card", () => {
    renderChat(controller());
    const row = screen.getByTestId("tool-stub-row");
    expect(row.textContent).toContain('Read("src/a.ts")');
    expect(row.textContent).toContain("2.3 MB not loaded");
  });

  it("clicking load asks the controller for that toolCallId", () => {
    const fetch = vi.fn();
    renderChat(controller({ fetch }));
    fireEvent.click(screen.getByTestId("tool-stub-load"));
    expect(fetch).toHaveBeenCalledWith("t1");
  });

  it("renders the fetched payload once the controller has it", () => {
    renderChat(controller({ get: () => ({ payload: "the whole thing", truncated: false }) }));
    expect(screen.getByTestId("tool-stub-row").textContent).toContain("the whole thing");
    expect(screen.queryByTestId("tool-stub-load")).toBeNull();
  });

  it("surfaces the loading state on the row", () => {
    renderChat(controller({ isLoading: () => true }));
    expect(screen.getByTestId("tool-stub-load")).toHaveProperty("disabled", true);
  });

  it("surfaces the error state on the row", () => {
    renderChat(controller({ isError: () => true }));
    expect(screen.getByTestId("tool-stub-error")).toBeTruthy();
  });

  it("renders a stub read-only when no controller is wired", () => {
    renderChat(undefined);
    expect(screen.getByTestId("tool-stub-row")).toBeTruthy();
    expect(screen.queryByTestId("tool-stub-load")).toBeNull();
  });
});
