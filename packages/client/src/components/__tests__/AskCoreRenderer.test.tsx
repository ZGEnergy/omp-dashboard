import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AskUserToolRenderer } from "../tool-renderers/AskUserToolRenderer.js";
import type { ToolContext } from "../tool-renderers/types.js";
import { ThemeProvider } from "../ThemeProvider.js";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function renderAsk(context: ToolContext, overrides: { args?: Record<string, unknown>; toolDetails?: Record<string, unknown>; requestId?: string } = {}) {
  return render(
    <ThemeProvider>
      <AskUserToolRenderer
        toolName="ask"
        args={{
          questions: [{
            id: "q1",
            question: "Continue with the **long markdown question**?",
            options: [{ label: "A very long option label that must wrap", description: "A long description that should remain available without truncation." }],
          }],
          ...overrides.args,
        }}
        status="running"
        context={context}
        requestId={overrides.requestId}
        toolDetails={overrides.toolDetails}
      />
    </ThemeProvider>,
  );
}

describe("AskCoreRenderer", () => {
  it("renders running options as buttons and responds to selection", () => {
    const onRespond = vi.fn();
    renderAsk({ onRespond });

    const option = screen.getByRole("button", { name: /A very long option label/ });
    expect(option.className).toContain("whitespace-normal");
    expect(option.className).toContain("break-words");
    expect(screen.getByText("long markdown question", { exact: false })).toBeTruthy();

    fireEvent.click(option);
    expect(onRespond).toHaveBeenCalledWith("A very long option label that must wrap");
  });

  it.each([
    ["args", { args: { requestId: "stale-args-request" } }],
    ["toolDetails", { toolDetails: { requestId: "stale-details-request" } }],
  ] as const)("disables options when %s has a requestId without a pending mapping", (_source, overrides) => {
    const onRespondToUi = vi.fn();
    renderAsk({ onRespondToUi }, overrides);

    const option = screen.getByRole("button", { name: /A very long option label/ });
    expect((option as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(option);
    expect(onRespondToUi).not.toHaveBeenCalled();
  });
});
