import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { PinDirectoryDialog } from "../PinDirectoryDialog.js";

// Mock browse-api
const mockBrowse = vi.fn();
vi.mock("../../lib/browse-api.js", () => ({
  browseDirectory: (...args: unknown[]) => mockBrowse(...args),
}));

afterEach(() => cleanup());

describe("PinDirectoryDialog", () => {
  const onPin = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowse.mockResolvedValue({
      current: "/Users/robson",
      parent: "/Users",
      entries: [
        { name: "Project", path: "/Users/robson/Project", isGit: false, isPi: false },
      ],
    });
  });

  function renderDialog() {
    return render(<PinDirectoryDialog onPin={onPin} onCancel={onCancel} />);
  }

  it("should render title and PathPicker", async () => {
    renderDialog();
    expect(screen.getByText("Pin Directory")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeTruthy();
    });
  });

  it("should call onCancel when Cancel button clicked", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("should call onCancel when Escape pressed", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("should call onPin when Enter pressed with a path", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/Users/robson/Project/" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onPin).toHaveBeenCalledWith("/Users/robson/Project");
  });

  it("should call onPin when Select button clicked", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/Users/robson/Project/" } });
    fireEvent.click(screen.getByText("Select"));

    expect(onPin).toHaveBeenCalledWith("/Users/robson/Project");
  });
});
