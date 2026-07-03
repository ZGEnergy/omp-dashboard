import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SplitWorkspace } from "../SplitWorkspace.js";

afterEach(() => cleanup());

const chat = <div data-testid="chat">chat</div>;
const editor = <div data-testid="editor">editor</div>;

describe("SplitWorkspace", () => {
  it("renders chat alone when closed (no editor, no divider)", () => {
    render(
      <SplitWorkspace open={false} ratio={0.5} orientation="h" onRatioChange={vi.fn()} chat={chat} editor={editor} />,
    );
    expect(screen.getByTestId("chat")).toBeTruthy();
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(screen.queryByTestId("split-divider")).toBeNull();
  });

  it("renders chat + divider + editor when open", () => {
    render(
      <SplitWorkspace open ratio={0.5} orientation="h" onRatioChange={vi.fn()} chat={chat} editor={editor} />,
    );
    expect(screen.getByTestId("chat")).toBeTruthy();
    expect(screen.getByTestId("editor")).toBeTruthy();
    expect(screen.getByTestId("split-divider")).toBeTruthy();
  });

  it("uses a horizontal (col-resize) divider on desktop", () => {
    render(
      <SplitWorkspace open ratio={0.5} orientation="h" onRatioChange={vi.fn()} chat={chat} editor={editor} />,
    );
    const divider = screen.getByTestId("split-divider");
    expect(divider.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("stacks vertically with a row-resize divider on mobile", () => {
    const { container } = render(
      <SplitWorkspace open ratio={0.5} orientation="v" onRatioChange={vi.fn()} chat={chat} editor={editor} />,
    );
    const divider = screen.getByTestId("split-divider");
    expect(divider.getAttribute("aria-orientation")).toBe("horizontal");
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex-col");
  });

  it("reflects the ratio as flex-grow on the two panes", () => {
    render(
      <SplitWorkspace open ratio={0.6} orientation="h" onRatioChange={vi.fn()} chat={chat} editor={editor} />,
    );
    const chatPane = screen.getByTestId("split-chat-pane");
    const editorPane = screen.getByTestId("split-editor-pane");
    expect(Number(chatPane.style.flexGrow)).toBeCloseTo(0.6);
    expect(Number(editorPane.style.flexGrow)).toBeCloseTo(0.4);
  });
});
