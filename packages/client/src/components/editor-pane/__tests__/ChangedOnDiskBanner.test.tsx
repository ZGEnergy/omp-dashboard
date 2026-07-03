import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangedOnDiskBanner } from "../ChangedOnDiskBanner.js";

afterEach(() => cleanup());

describe("ChangedOnDiskBanner", () => {
  it("shows the changed file name and both actions", () => {
    render(<ChangedOnDiskBanner fileName="src/foo.ts" onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("src/foo.ts")).toBeTruthy();
    expect(screen.getByTestId("changed-refresh")).toBeTruthy();
    expect(screen.getByTestId("changed-dismiss")).toBeTruthy();
  });

  it("invokes onRefresh when Refresh is clicked", () => {
    const onRefresh = vi.fn();
    render(<ChangedOnDiskBanner fileName="a.ts" onRefresh={onRefresh} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByTestId("changed-refresh"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("invokes onDismiss when the dismiss control is clicked", () => {
    const onDismiss = vi.fn();
    render(<ChangedOnDiskBanner fileName="a.ts" onRefresh={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("changed-dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
