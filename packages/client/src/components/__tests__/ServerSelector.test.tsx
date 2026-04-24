import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { ServerSelector } from "../ServerSelector.js";

vi.mock("../../lib/known-servers-api.js", () => ({
  listKnownServers: vi.fn(async () => [
    { host: "my-pc", port: 8000, label: "my-pc" },
  ]),
}));

describe("ServerSelector", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      // localhost is dead, my-pc is alive
      if (url.includes("localhost") || url.includes("127.0.0.1")) {
        return Promise.reject(new Error("refused"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
    });
    (globalThis as any).fetch = fetchMock;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does NOT probe on mount—only when dropdown opens", async () => {
    render(
      <ServerSelector
        currentHost="my-pc"
        currentPort={8000}
        connected={true}
        onSwitch={() => {}}
      />,
    );
    // Give the component + knownServers async load a tick.
    await new Promise((r) => setTimeout(r, 50));
    const healthCalls = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .filter((u) => u.includes("/api/health"));
    expect(healthCalls).toHaveLength(0);
  });

  it("probes once when dropdown opens, not again until it reopens", async () => {
    render(
      <ServerSelector
        currentHost="my-pc"
        currentPort={8000}
        connected={true}
        onSwitch={() => {}}
      />,
    );
    const btn = screen.getByTitle("Switch server");
    act(() => btn.click()); // open
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("localhost:8000/api/health"))).toBe(true);
    });
    const countAfterFirstOpen = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/health"),
    ).length;
    // Close dropdown
    act(() => btn.click());
    // Wait a beat — nothing should probe
    await new Promise((r) => setTimeout(r, 50));
    const countAfterClose = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/health"),
    ).length;
    expect(countAfterClose).toBe(countAfterFirstOpen);
  });

  it("renders Unreachable badge for localhost when probe fails", async () => {
    render(
      <ServerSelector
        currentHost="my-pc"
        currentPort={8000}
        connected={true}
        onSwitch={() => {}}
      />,
    );
    // open the dropdown
    const btn = screen.getByTitle("Switch server");
    act(() => btn.click());
    await waitFor(() => {
      const unreachable = screen.queryAllByText(/Unreachable/i);
      expect(unreachable.length).toBeGreaterThan(0);
    });
  });

  it("unreachable entry is disabled and does NOT fire onSwitch when clicked", async () => {
    const onSwitch = vi.fn();
    render(
      <ServerSelector
        currentHost="my-pc"
        currentPort={8000}
        connected={true}
        onSwitch={onSwitch}
      />,
    );
    const btn = screen.getByTitle("Switch server");
    act(() => btn.click());
    await waitFor(() => screen.queryByText(/Unreachable/i));
    const localEntry = screen.getByText("localhost:8000").closest("button") as HTMLButtonElement;
    expect(localEntry).not.toBeNull();
    expect(localEntry.disabled).toBe(true);
    act(() => localEntry.click());
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("shows spinner on the entry that matches inFlightSwitchKey", async () => {
    render(
      <ServerSelector
        currentHost="my-pc"
        currentPort={8000}
        connected={true}
        onSwitch={() => {}}
        inFlightSwitchKey="localhost:8000"
      />,
    );
    const btn = screen.getByTitle("Switch server");
    act(() => btn.click());
    await waitFor(() => {
      const spinner = screen.queryByLabelText(/Switching/i);
      expect(spinner).not.toBeNull();
    });
  });
});
