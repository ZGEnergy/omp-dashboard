/**
 * Group 6 (wire-flow-inputs-in-automation) — FlowInputWiring: reads a flow's
 * declared inputs, binds each to a literal or the trigger value, writes only
 * payload.inputs, and drops orphan keys when the selected flow changes.
 */
import React, { useState } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FlowInputWiring } from "../client/FlowInputWiring.js";

const INPUTS: Record<string, Array<{ name: string; type: string; required: boolean }>> = {
  "ns:a": [
    { name: "invoice", type: "string", required: true },
    { name: "priority", type: "number", required: false },
  ],
  "ns:b": [{ name: "region", type: "string", required: false }],
};

beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    const flow = new URL(url, "http://x").searchParams.get("flow") ?? "";
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ inputs: INPUTS[flow] ?? [] }),
    }) as unknown as Promise<Response>;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Controlled harness so onChange feeds back into payload (real re-render loop). */
function Harness({ startFlow }: { startFlow: string }) {
  const [payload, setPayload] = useState<Record<string, unknown>>({ flow: startFlow });
  return (
    <div>
      <button data-testid="switch-b" onClick={() => setPayload((p) => ({ ...p, flow: "ns:b" }))}>
        switch
      </button>
      <FlowInputWiring payload={payload} onChange={setPayload} cwd="/repo" />
      <pre data-testid="payload">{JSON.stringify(payload)}</pre>
    </div>
  );
}

function payloadOf(getByTestId: (id: string) => HTMLElement): Record<string, unknown> {
  return JSON.parse(getByTestId("payload").textContent || "{}");
}

describe("FlowInputWiring", () => {
  it("renders one row per declared flow input", async () => {
    const { getByTestId } = render(<Harness startFlow="ns:a" />);
    await waitFor(() => expect(getByTestId("flow-input-invoice")).toBeTruthy());
    expect(getByTestId("flow-input-priority")).toBeTruthy();
  });

  it("binding a row to the trigger writes ${{trigger}} into payload.inputs", async () => {
    const { getByTestId } = render(<Harness startFlow="ns:a" />);
    await waitFor(() => expect(getByTestId("flow-input-invoice-mode-trigger")).toBeTruthy());
    fireEvent.click(getByTestId("flow-input-invoice-mode-trigger"));
    await waitFor(() => {
      const inputs = payloadOf(getByTestId).inputs as Record<string, unknown>;
      expect(inputs.invoice).toBe("${{trigger}}");
    });
  });

  it("a typed number literal persists as a number", async () => {
    const { getByTestId } = render(<Harness startFlow="ns:a" />);
    await waitFor(() => expect(getByTestId("flow-input-priority")).toBeTruthy());
    fireEvent.change(getByTestId("flow-input-priority"), { target: { value: "5" } });
    await waitFor(() => {
      const inputs = payloadOf(getByTestId).inputs as Record<string, unknown>;
      expect(inputs.priority).toBe(5);
    });
  });

  it("dropping to a new flow prunes orphan wired keys", async () => {
    const { getByTestId } = render(<Harness startFlow="ns:a" />);
    await waitFor(() => expect(getByTestId("flow-input-invoice-mode-trigger")).toBeTruthy());
    fireEvent.click(getByTestId("flow-input-invoice-mode-trigger"));
    await waitFor(() => expect((payloadOf(getByTestId).inputs as any).invoice).toBe("${{trigger}}"));
    // Switch to a flow that does not declare `invoice`.
    fireEvent.click(getByTestId("switch-b"));
    await waitFor(() => {
      const inputs = (payloadOf(getByTestId).inputs as Record<string, unknown>) ?? {};
      expect(inputs.invoice).toBeUndefined();
    });
  });

  it("renders nothing for a flow with no declared inputs", async () => {
    const { queryByTestId } = render(<Harness startFlow="ns:none" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(queryByTestId("flow-input-wiring")).toBeNull();
  });
});
