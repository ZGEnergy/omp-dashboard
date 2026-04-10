import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import { CommandInput } from "../CommandInput.js";
import type { CommandInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";

const commands: CommandInfo[] = [
  { name: "deploy", description: "Deploy to production", source: "extension" },
  { name: "test", description: "Run test suite", source: "skill" },
  { name: "review", description: "Code review", source: "prompt" },
];

function renderInput(props: Partial<React.ComponentProps<typeof CommandInput>> = {}) {
  const onSend = vi.fn();
  const result = render(
    <CommandInput commands={commands} onSend={onSend} {...props} />
  );
  const textarea = result.container.querySelector("textarea")!;
  return { ...result, textarea, onSend };
}

function getDropdownItems(container: HTMLElement): string[] {
  // Command items have font-mono text-blue-400 class and start with /
  const buttons = container.querySelectorAll("button");
  const items: string[] = [];
  for (const btn of buttons) {
    const cmdSpan = btn.querySelector(".font-mono");
    if (cmdSpan?.textContent?.startsWith("/")) {
      items.push(cmdSpan.textContent);
    }
  }
  return items;
}

describe("CommandInput autocomplete", () => {
  it("should show command dropdown when typing /", () => {
    const { container, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: "/" } });
    const items = getDropdownItems(container);
    expect(items).toContain("/deploy");
    expect(items).toContain("/test");
    expect(items).toContain("/review");
  });

  it("should filter commands as user types", () => {
    const { container, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: "/dep" } });
    const items = getDropdownItems(container);
    expect(items).toContain("/deploy");
    expect(items).not.toContain("/test");
    expect(items).not.toContain("/review");
  });

  it("should hide dropdown when no commands match", () => {
    const { container, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: "/zzz" } });
    const items = getDropdownItems(container);
    expect(items).toHaveLength(0);
  });

  it("should reopen dropdown after Escape when user types more", () => {
    const { container, textarea } = renderInput();

    // Type / to open dropdown
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(getDropdownItems(container).length).toBeGreaterThan(0);

    // Press Escape to dismiss
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(getDropdownItems(container)).toHaveLength(0);

    // Type more - dropdown should reopen
    fireEvent.change(textarea, { target: { value: "/d" } });
    expect(getDropdownItems(container)).toContain("/deploy");
  });

  it("should show only builtin commands when commands prop is empty", () => {
    const { container, textarea } = renderInput({ commands: [] });
    fireEvent.change(textarea, { target: { value: "/" } });
    // Built-in commands like /compact are always available
    expect(getDropdownItems(container)).toContain("/compact");
  });

  it("should select command with Tab", () => {
    const { container, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: "/dep" } });
    expect(getDropdownItems(container)).toContain("/deploy");

    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(textarea.value).toBe("/deploy ");
    // Dropdown should close after selection
    expect(getDropdownItems(container)).toHaveLength(0);
  });

  it("should reopen dropdown after Escape even when filtered count stays the same", () => {
    const { container, textarea } = renderInput();

    // Type /dep to get exactly 1 match (deploy)
    fireEvent.change(textarea, { target: { value: "/dep" } });
    let items = getDropdownItems(container);
    expect(items).toHaveLength(1);
    expect(items).toContain("/deploy");

    // Press Escape
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(getDropdownItems(container)).toHaveLength(0);

    // Type more but same number of matches: /depl still matches only deploy
    fireEvent.change(textarea, { target: { value: "/depl" } });
    items = getDropdownItems(container);
    expect(items).toHaveLength(1);
    expect(items).toContain("/deploy");
  });

  it("should navigate with arrow keys", () => {
    const { container, textarea } = renderInput();
    fireEvent.change(textarea, { target: { value: "/" } });

    // Get command buttons (excluding the Send button)
    const getCommandButtons = () => {
      const buttons = Array.from(container.querySelectorAll("button"));
      return buttons.filter(b => b.querySelector(".font-mono"));
    };

    // First item should be highlighted
    let cmdButtons = getCommandButtons();
    expect(cmdButtons[0]?.className).toContain("bg-[var(--bg-tertiary)]");

    // Arrow down - second item highlighted
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    cmdButtons = getCommandButtons();
    expect(cmdButtons[1]?.className).toContain("bg-[var(--bg-tertiary)]");
  });
});

describe("Pending prompt behavior", () => {
  it("disables input when pendingPrompt is true", () => {
    const { textarea } = renderInput({ pendingPrompt: true });
    expect(textarea.disabled).toBe(true);
  });

  it("disables send button when pendingPrompt is true", () => {
    const { container, textarea } = renderInput({ pendingPrompt: true });
    fireEvent.change(textarea, { target: { value: "test" } });
    const sendBtn = container.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it("shows Stop button when pendingPrompt is true", () => {
    const onCancelPending = vi.fn();
    const { container } = renderInput({ pendingPrompt: true, onCancelPending, sessionStatus: "idle" });
    const stopBtn = container.querySelector('[data-testid="stop-button"]');
    expect(stopBtn).not.toBeNull();
  });

  it("calls onCancelPending when Stop clicked during pending", () => {
    const onCancelPending = vi.fn();
    const onAbort = vi.fn();
    const { container } = renderInput({ pendingPrompt: true, onCancelPending, onAbort, sessionStatus: "idle" });
    const stopBtn = container.querySelector('[data-testid="stop-button"]')!;
    fireEvent.click(stopBtn);
    expect(onCancelPending).toHaveBeenCalledOnce();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("calls onCancelPending on Escape key during pending", () => {
    const onCancelPending = vi.fn();
    const { textarea } = renderInput({ pendingPrompt: true, onCancelPending });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancelPending).toHaveBeenCalledOnce();
  });

  it("does not call onCancelPending on Escape when not pending", () => {
    const onCancelPending = vi.fn();
    const { textarea } = renderInput({ pendingPrompt: false, onCancelPending });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancelPending).not.toHaveBeenCalled();
  });
});

describe("Play/Stop buttons", () => {
  it("shows Play icon button instead of text Send", () => {
    const { container } = renderInput();
    const sendBtn = container.querySelector('[data-testid="send-button"]');
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.querySelector("svg")).not.toBeNull();
    expect(sendBtn!.textContent).not.toContain("Send");
  });

  it("shows Stop button during streaming", () => {
    const onAbort = vi.fn();
    const { container } = renderInput({ sessionStatus: "streaming", onAbort });
    const stopBtn = container.querySelector('[data-testid="stop-button"]');
    expect(stopBtn).not.toBeNull();
  });

  it("hides Stop button when idle", () => {
    const onAbort = vi.fn();
    const { container } = renderInput({ sessionStatus: "idle", onAbort });
    const stopBtn = container.querySelector('[data-testid="stop-button"]');
    expect(stopBtn).toBeNull();
  });

  it("calls onAbort when Stop clicked", () => {
    const onAbort = vi.fn();
    const { container } = renderInput({ sessionStatus: "streaming", onAbort });
    const stopBtn = container.querySelector('[data-testid="stop-button"]')!;
    fireEvent.click(stopBtn);
    expect(onAbort).toHaveBeenCalledOnce();
  });
});

describe("Force kill escalation", () => {
  it("transitions to Force Stop after first click when onForceKill provided", () => {
    const onAbort = vi.fn();
    const onForceKill = vi.fn();
    const { container } = renderInput({ sessionStatus: "streaming", onAbort, onForceKill });

    // Click Stop
    const stopBtn = container.querySelector('[data-testid="stop-button"]')!;
    fireEvent.click(stopBtn);
    expect(onAbort).toHaveBeenCalledOnce();

    // Stop button should be gone, Force Stop should appear
    expect(container.querySelector('[data-testid="stop-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="force-stop-button"]')).not.toBeNull();
  });

  it("calls onForceKill when Force Stop clicked", () => {
    const onAbort = vi.fn();
    const onForceKill = vi.fn();
    const { container } = renderInput({ sessionStatus: "streaming", onAbort, onForceKill });

    // Click Stop first
    fireEvent.click(container.querySelector('[data-testid="stop-button"]')!);

    // Click Force Stop
    const forceBtn = container.querySelector('[data-testid="force-stop-button"]')!;
    fireEvent.click(forceBtn);
    expect(onForceKill).toHaveBeenCalledOnce();

    // Should show killing state
    expect(container.querySelector('[data-testid="killing-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="force-stop-button"]')).toBeNull();
  });

  it("resets state when session stops streaming", () => {
    const onAbort = vi.fn();
    const onForceKill = vi.fn();
    const { container, rerender } = render(
      <CommandInput commands={commands} onSend={vi.fn()} sessionStatus="streaming" onAbort={onAbort} onForceKill={onForceKill} />
    );

    // Click Stop to enter aborting state
    fireEvent.click(container.querySelector('[data-testid="stop-button"]')!);
    expect(container.querySelector('[data-testid="force-stop-button"]')).not.toBeNull();

    // Session stops streaming
    rerender(
      <CommandInput commands={commands} onSend={vi.fn()} sessionStatus="idle" onAbort={onAbort} onForceKill={onForceKill} />
    );

    // No stop buttons visible (session is idle)
    expect(container.querySelector('[data-testid="stop-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="force-stop-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="killing-button"]')).toBeNull();
  });

  it("does not transition to Force Stop without onForceKill prop", () => {
    const onAbort = vi.fn();
    const { container } = renderInput({ sessionStatus: "streaming", onAbort });

    fireEvent.click(container.querySelector('[data-testid="stop-button"]')!);
    expect(onAbort).toHaveBeenCalledOnce();

    // Should still show the stop button (no escalation without onForceKill)
    expect(container.querySelector('[data-testid="force-stop-button"]')).toBeNull();
  });
});

describe("Image lightbox from paste preview", () => {
  it("opens lightbox when clicking a paste preview image", async () => {
    // Create a mock FileReader class where readAsDataURL triggers onload asynchronously
    let pendingOnload: (() => void) | null = null;
    vi.stubGlobal("FileReader", class {
      result = "data:image/png;base64,iVBORw0KGgo=";
      onload: (() => void) | null = null;
      readAsDataURL() {
        pendingOnload = () => this.onload?.();
      }
    });

    const { container } = renderInput();
    const textarea = container.querySelector("textarea")!;

    const file = new File([new Uint8Array([137, 80, 78, 71])], "test.png", { type: "image/png" });
    const dataTransfer = {
      items: [{ type: "image/png", getAsFile: () => file, kind: "file" }],
    };

    fireEvent.paste(textarea, { clipboardData: dataTransfer });

    // Trigger the captured onload outside React's event dispatch
    await act(async () => {
      pendingOnload?.();
    });

    // Find the preview image
    const img = container.querySelector("img.h-16");
    expect(img).not.toBeNull();
    expect(img!.className).toContain("cursor-pointer");
    fireEvent.click(img!);
    const lightbox = document.body.querySelector("[data-testid='lightbox-backdrop']");
    expect(lightbox).not.toBeNull();

    vi.restoreAllMocks();
  });
});
