import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { ToolCallStep } from "../ToolCallStep.js";
import { ThemeProvider } from "../ThemeProvider.js";
import type { ToolContext } from "../tool-renderers/index.js";

const defaultContext: ToolContext = { editors: [] };

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function renderStep(props: Partial<React.ComponentProps<typeof ToolCallStep>> = {}) {
  return render(
    <ThemeProvider>
      <ToolCallStep
        toolName="bash"
        toolCallId="tc-1"
        status="complete"
        context={defaultContext}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("ToolCallStep", () => {
  it("renders ask_user as a standard collapsible tool step, not an InteractiveRenderer", () => {
    const { container, getByText } = renderStep({
      toolName: "ask_user",
      toolCallId: "tc-ask-1",
      args: { method: "confirm", title: "Are you sure?" },
      status: "complete",
      result: 'User responded: true',
    });

    // Should render the summary button (collapsible tool step)
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain("Are you sure?");

    // Should NOT render an interactive renderer (no confirm/select UI)
    // InteractiveRenderers have data-testid or specific class patterns
    // The collapsible step has a chevron icon and border-l-2 wrapper
    expect(container.querySelector("[data-testid='confirm-renderer']")).toBeNull();
    expect(container.querySelector("[data-testid='select-renderer']")).toBeNull();
  });

  it("renders ask_user summary with title from args", () => {
    const { container } = renderStep({
      toolName: "ask_user",
      toolCallId: "tc-ask-2",
      args: { method: "select", title: "Pick a color", options: ["red", "blue"] },
      status: "running",
    });

    const button = container.querySelector("button");
    expect(button!.textContent).toContain("Pick a color");
  });

  it("renders non-ask_user tools normally", () => {
    const { container } = renderStep({
      toolName: "bash",
      toolCallId: "tc-bash-1",
      args: { command: "echo hello" },
      status: "complete",
      result: "hello",
    });

    const button = container.querySelector("button");
    expect(button!.textContent).toContain("echo hello");
  });
});
