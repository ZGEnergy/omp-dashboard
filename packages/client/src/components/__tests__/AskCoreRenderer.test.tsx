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

function renderAsk(context: ToolContext) {
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
        }}
        status="running"
        context={context}
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
});
