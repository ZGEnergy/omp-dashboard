import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ExploreDialog } from "../ExploreDialog.js";

afterEach(() => cleanup());

describe("ConfirmDialog", () => {
  it("renders message and buttons", () => {
    render(<ConfirmDialog message='Archive "feat"?' onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Archive "feat"?')).toBeTruthy();
    expect(screen.getByTestId("confirm-cancel")).toBeTruthy();
    expect(screen.getByTestId("confirm-ok")).toBeTruthy();
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog message="Sure?" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId("confirm-ok"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog message="Sure?" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses custom confirmLabel", () => {
    render(<ConfirmDialog message="Sure?" confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("confirm-ok").textContent).toBe("Delete");
  });
});

describe("ExploreDialog", () => {
  it("renders with change name", () => {
    render(<ExploreDialog changeName="feat-a" onSend={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Explore: feat-a")).toBeTruthy();
  });

  it("calls onSend with text when Send clicked", () => {
    const onSend = vi.fn();
    render(<ExploreDialog changeName="feat-a" onSend={onSend} onClose={() => {}} />);
    const textarea = screen.getByTestId("explore-textarea");
    fireEvent.change(textarea, { target: { value: "my question" } });
    fireEvent.click(screen.getByTestId("explore-send"));
    expect(onSend).toHaveBeenCalledWith("my question", undefined);
  });

  it("does not send when text is empty", () => {
    const onSend = vi.fn();
    render(<ExploreDialog changeName="feat-a" onSend={onSend} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("explore-send"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel clicked", () => {
    const onClose = vi.fn();
    render(<ExploreDialog changeName="feat-a" onSend={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("explore-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
