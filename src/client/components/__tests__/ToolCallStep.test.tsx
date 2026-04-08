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

  it("auto-expands when images are present", () => {
    const { container } = renderStep({
      toolName: "read",
      toolCallId: "tc-img-1",
      args: { path: "photo.png" },
      status: "complete",
      result: "Read image file [image/png]",
      images: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }],
    });

    // Should be expanded by default — renderer content should be visible
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("stays collapsed when no images", () => {
    const { container } = renderStep({
      toolName: "read",
      toolCallId: "tc-txt-1",
      args: { path: "file.ts" },
      status: "complete",
      result: "const x = 1;",
    });

    // Should be collapsed — no img or code block visible
    const img = container.querySelector("img");
    expect(img).toBeNull();
  });

  it("renders image in ReadToolRenderer when expanded", () => {
    const { container } = renderStep({
      toolName: "read",
      toolCallId: "tc-img-2",
      args: { path: "screenshot.jpg" },
      status: "complete",
      result: "Read image file [image/jpeg]",
      images: [{ data: "abc123", mimeType: "image/jpeg" }],
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("alt")).toBe("screenshot.jpg");
    expect(img!.className).toContain("max-w-[512px]");
  });

  it("opens lightbox when clicking a tool result image", () => {
    const { container } = renderStep({
      toolName: "read",
      toolCallId: "tc-img-lb",
      args: { path: "photo.png" },
      status: "complete",
      result: "Read image file [image/png]",
      images: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }],
    });

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.className).toContain("cursor-pointer");
    fireEvent.click(img!);
    const lightbox = document.body.querySelector("[data-testid='lightbox-backdrop']");
    expect(lightbox).not.toBeNull();
  });
});

describe("ToolCallStep inline stop button", () => {
  it("shows stop button when running and onAbort provided", () => {
    const onAbort = vi.fn();
    const { container } = renderStep({ status: "running", onAbort });
    expect(container.querySelector('[data-testid="tool-stop-button"]')).not.toBeNull();
  });

  it("hides stop button when complete", () => {
    const onAbort = vi.fn();
    const { container } = renderStep({ status: "complete", onAbort });
    expect(container.querySelector('[data-testid="tool-stop-button"]')).toBeNull();
  });

  it("hides stop button when no onAbort", () => {
    const { container } = renderStep({ status: "running" });
    expect(container.querySelector('[data-testid="tool-stop-button"]')).toBeNull();
  });

  it("calls onAbort and escalates to force-stop on click", () => {
    const onAbort = vi.fn();
    const onForceKill = vi.fn();
    const { container } = renderStep({ status: "running", onAbort, onForceKill });

    // Click stop
    fireEvent.click(container.querySelector('[data-testid="tool-stop-button"]')!);
    expect(onAbort).toHaveBeenCalledOnce();

    // Should show force-stop button
    expect(container.querySelector('[data-testid="tool-stop-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="tool-force-stop-button"]')).not.toBeNull();

    // Click force-stop
    fireEvent.click(container.querySelector('[data-testid="tool-force-stop-button"]')!);
    expect(onForceKill).toHaveBeenCalledOnce();
  });
});
