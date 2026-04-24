import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ConnectionStatusBanner } from "../ConnectionStatusBanner.js";

describe("ConnectionStatusBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not render when status is 'connected'", () => {
    render(
      <ConnectionStatusBanner
        status="connected"
        currentServerHost="my-pc"
        inFlightSwitch={false}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not render before threshold elapses", () => {
    render(
      <ConnectionStatusBanner
        status="connecting"
        currentServerHost="my-pc"
        inFlightSwitch={false}
        thresholdMs={3000}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders after threshold when status stays non-connected", () => {
    render(
      <ConnectionStatusBanner
        status="connecting"
        currentServerHost="my-pc"
        inFlightSwitch={false}
        thresholdMs={3000}
      />,
    );
    act(() => vi.advanceTimersByTime(3001));
    expect(screen.queryByRole("alert")).not.toBeNull();
    expect(screen.queryByText(/Disconnected from/i)).not.toBeNull();
  });

  it("does not render during in-flight staging switch even if status flapped", () => {
    render(
      <ConnectionStatusBanner
        status="connecting"
        currentServerHost="my-pc"
        inFlightSwitch={true}
        thresholdMs={3000}
      />,
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides immediately when status returns to connected", () => {
    const { rerender } = render(
      <ConnectionStatusBanner
        status="connecting"
        currentServerHost="my-pc"
        inFlightSwitch={false}
        thresholdMs={3000}
      />,
    );
    act(() => vi.advanceTimersByTime(3001));
    expect(screen.queryByRole("alert")).not.toBeNull();
    rerender(
      <ConnectionStatusBanner
        status="connected"
        currentServerHost="my-pc"
        inFlightSwitch={false}
        thresholdMs={3000}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders Switch server button that calls onOpenServerSelector", () => {
    const spy = vi.fn();
    render(
      <ConnectionStatusBanner
        status="offline"
        currentServerHost="my-pc"
        inFlightSwitch={false}
        thresholdMs={3000}
        onOpenServerSelector={spy}
      />,
    );
    act(() => vi.advanceTimersByTime(3001));
    const btn = screen.getByRole("button", { name: /switch server/i });
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
