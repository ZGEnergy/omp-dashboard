import type { ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolStubRow } from "../ToolStubRow.js";

const stub: ToolCallStub = {
  toolCallId: "t1",
  toolName: "Read",
  argsSummary: 'Read("src/a.ts")',
  status: "ok",
  startedAt: 1,
  durationMs: 25,
  fullBytes: 2_411_724,
  head: "first bytes",
  tail: "last bytes",
  detailLevel: "sliced",
};

describe("ToolStubRow", () => {
  it("reports the unloaded size honestly", () => {
    render(<ToolStubRow stub={stub} />);
    expect(screen.getByTestId("tool-stub-row").textContent).toContain("2.3 MB not loaded");
  });

  it("renders head and tail slices at the sliced rung", () => {
    render(<ToolStubRow stub={stub} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain("first bytes");
    expect(text).toContain("last bytes");
  });

  it("renders metadata only at the metadata rung", () => {
    render(<ToolStubRow stub={{ ...stub, detailLevel: "metadata", head: undefined, tail: undefined }} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain('Read("src/a.ts")');
    expect(text).not.toContain("first bytes");
  });

  it("calls onFetch when the load affordance is clicked", () => {
    const onFetch = vi.fn();
    render(<ToolStubRow stub={stub} onFetch={onFetch} />);
    fireEvent.click(screen.getByTestId("tool-stub-load"));
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  it("omits the load affordance when no handler is wired", () => {
    render(<ToolStubRow stub={stub} />);
    expect(screen.queryByTestId("tool-stub-load")).toBeNull();
  });

  it("renders the cached payload instead of slices once fetched", () => {
    render(<ToolStubRow stub={stub} cached={{ payload: "the whole thing", truncated: false }} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain("the whole thing");
    expect(screen.queryByTestId("tool-stub-load")).toBeNull();
  });

  it("offers open-raw when the fetched payload was truncated", () => {
    render(<ToolStubRow stub={stub} cached={{ payload: "partial", truncated: true }} />);
    expect(screen.getByTestId("tool-stub-truncated")).toBeTruthy();
  });

  it("shows an error affordance without losing the stub metadata", () => {
    render(<ToolStubRow stub={stub} error />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain('Read("src/a.ts")');
    expect(screen.getByTestId("tool-stub-error")).toBeTruthy();
  });

  it("disables the load affordance while loading", () => {
    render(<ToolStubRow stub={stub} loading onFetch={() => {}} />);
    expect(screen.getByTestId("tool-stub-load")).toHaveProperty("disabled", true);
  });
});
