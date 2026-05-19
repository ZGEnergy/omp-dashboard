/**
 * Tests for QueuePanel: v2 multi-entry cycling follow-up rendering.
 * Steer chips moved to inline-chat rendering in ChatView (see
 * ChatView.inline-steer.test.tsx).
 * See change: add-followup-edit-and-steer-cancel.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { QueuePanel } from "../QueuePanel.js";

afterEach(() => cleanup());

function renderPanel(overrides: Partial<Parameters<typeof QueuePanel>[0]> = {}) {
  const props = {
    followUp: [] as string[],
    onClearFollowup: vi.fn(),
    onEditFollowup: vi.fn(),
    onEditFollowupEntry: vi.fn(),
    onRemoveFollowupEntry: vi.fn(),
    onPromoteFollowupEntry: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<QueuePanel {...props} />) };
}

describe("QueuePanel — empty state", () => {
  it("renders nothing when follow-up queue is empty", () => {
    const { container } = renderPanel();
    expect(container.firstChild).toBeNull();
  });
});

describe("QueuePanel — followUp single entry", () => {
  it("renders the entry with click-to-edit + remove button, no cycling controls", () => {
    const { getByTestId, queryByTestId } = renderPanel({ followUp: ["run tests when done"] });
    const chip = getByTestId("queue-chip-followup");
    expect(chip.textContent).toContain("run tests when done");
    expect(getByTestId("queue-followup-edit")).toBeTruthy();
    expect(getByTestId("queue-followup-remove")).toBeTruthy();
    // Cycling controls hidden for single-entry queue.
    expect(queryByTestId("queue-followup-prev")).toBeNull();
    expect(queryByTestId("queue-followup-next")).toBeNull();
    expect(queryByTestId("queue-followup-promote")).toBeNull();
    expect(queryByTestId("queue-followup-position")).toBeNull();
  });

  it("invokes onRemoveFollowupEntry(0) when ✕ is clicked", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["x"] });
    fireEvent.click(getByTestId("queue-followup-remove"));
    expect(props.onRemoveFollowupEntry).toHaveBeenCalledWith(0);
  });
});

describe("QueuePanel — followUp multi-entry cycling", () => {
  it("renders cycling controls + position indicator when length > 1", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    expect(getByTestId("queue-followup-prev")).toBeTruthy();
    expect(getByTestId("queue-followup-next")).toBeTruthy();
    expect(getByTestId("queue-followup-promote")).toBeTruthy();
    const pos = getByTestId("queue-followup-position");
    // Initial render: queue length transitioned 0 → 3 so currentIndex jumps to last.
    expect(pos.textContent).toMatch(/3 of 3/);
  });

  it("shows last entry initially (append behaviour)", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    expect(getByTestId("queue-chip-followup").textContent).toBe("c");
  });

  it("up arrow navigates to previous entry", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    fireEvent.click(getByTestId("queue-followup-prev"));
    expect(getByTestId("queue-chip-followup").textContent).toBe("b");
    fireEvent.click(getByTestId("queue-followup-prev"));
    expect(getByTestId("queue-chip-followup").textContent).toBe("a");
  });

  it("up arrow disabled at first entry", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b"] });
    fireEvent.click(getByTestId("queue-followup-prev"));
    const prev = getByTestId("queue-followup-prev") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it("down arrow navigates forward + disabled at last entry", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b"] });
    // initial: shows "b" (last), down should be disabled
    const next = getByTestId("queue-followup-next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    // Navigate up to "a", then down should re-enable
    fireEvent.click(getByTestId("queue-followup-prev"));
    expect(getByTestId("queue-chip-followup").textContent).toBe("a");
    fireEvent.click(getByTestId("queue-followup-next"));
    expect(getByTestId("queue-chip-followup").textContent).toBe("b");
  });

  it("promote dispatches onPromoteFollowupEntry with currentIndex", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    // Initial currentIndex = 2 (last); navigate to index 1 = "b"
    fireEvent.click(getByTestId("queue-followup-prev"));
    fireEvent.click(getByTestId("queue-followup-promote"));
    expect(props.onPromoteFollowupEntry).toHaveBeenCalledWith(1);
  });

  it("promote disabled when at index 0", () => {
    const { getByTestId } = renderPanel({ followUp: ["a", "b"] });
    fireEvent.click(getByTestId("queue-followup-prev")); // now at "a"
    const promote = getByTestId("queue-followup-promote") as HTMLButtonElement;
    expect(promote.disabled).toBe(true);
  });

  it("edit dispatches onEditFollowupEntry with currentIndex + new text", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    fireEvent.click(getByTestId("queue-followup-prev")); // navigate to "b" (index 1)
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "b-revised" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(props.onEditFollowupEntry).toHaveBeenCalledWith(1, "b-revised");
  });

  it("remove dispatches onRemoveFollowupEntry with currentIndex", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["a", "b", "c"] });
    fireEvent.click(getByTestId("queue-followup-prev")); // navigate to "b"
    fireEvent.click(getByTestId("queue-followup-remove"));
    expect(props.onRemoveFollowupEntry).toHaveBeenCalledWith(1);
  });
});

describe("QueuePanel — editor key bindings still work", () => {
  it("Escape cancels without calling onEditFollowupEntry", () => {
    const { props, getByTestId, queryByTestId } = renderPanel({ followUp: ["v1"] });
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "changed but cancelled" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(props.onEditFollowupEntry).not.toHaveBeenCalled();
    expect(queryByTestId("queue-followup-editor")).toBeNull();
  });

  it("Enter saves", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["old"] });
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "via enter" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(props.onEditFollowupEntry).toHaveBeenCalledWith(0, "via enter");
  });

  it("blur saves", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["old"] });
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "via blur" } });
    fireEvent.blur(editor);
    expect(props.onEditFollowupEntry).toHaveBeenCalledWith(0, "via blur");
  });

  it("editing to identical text does NOT invoke handler", () => {
    const { props, getByTestId } = renderPanel({ followUp: ["unchanged"] });
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(props.onEditFollowupEntry).not.toHaveBeenCalled();
  });
});

describe("QueuePanel — v1 backward-compat fallbacks", () => {
  it("falls back to onEditFollowup (legacy) when onEditFollowupEntry not provided", () => {
    const onEditFollowup = vi.fn();
    const { getByTestId } = render(
      <QueuePanel
        followUp={["x"]}
        onClearFollowup={vi.fn()}
        onEditFollowup={onEditFollowup}
        // no onEditFollowupEntry
      />,
    );
    fireEvent.click(getByTestId("queue-followup-edit"));
    const editor = getByTestId("queue-followup-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "via legacy" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onEditFollowup).toHaveBeenCalledWith("via legacy");
  });

  it("falls back to onClearFollowup when onRemoveFollowupEntry not provided", () => {
    const onClearFollowup = vi.fn();
    const { getByTestId } = render(
      <QueuePanel
        followUp={["x"]}
        onClearFollowup={onClearFollowup}
        onEditFollowup={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId("queue-followup-remove"));
    expect(onClearFollowup).toHaveBeenCalledTimes(1);
  });
});
