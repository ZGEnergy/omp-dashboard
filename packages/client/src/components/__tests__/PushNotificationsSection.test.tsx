/**
 * Component tests for PushNotificationsSection — the four UI states
 * (unsupported, unsubscribed, subscribed, denied) plus the enable/disable
 * toggle and send-test actions. The `usePushSubscription` hook is mocked.
 * See change: add-server-push-notifications.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookState = {
  supported: true,
  status: "unsubscribed" as "unknown" | "unsubscribed" | "subscribed" | "denied",
  subscribe: vi.fn(async () => {}),
  unsubscribe: vi.fn(async () => {}),
  sendTest: vi.fn(async () => {}),
};

vi.mock("../../hooks/usePushSubscription.js", () => ({
  usePushSubscription: () => hookState,
}));

import { PushNotificationsSection } from "../PushNotificationsSection.js";

describe("PushNotificationsSection", () => {
  beforeEach(() => {
    hookState.supported = true;
    hookState.status = "unsubscribed";
    hookState.subscribe = vi.fn(async () => {});
    hookState.unsubscribe = vi.fn(async () => {});
    hookState.sendTest = vi.fn(async () => {});
  });

  afterEach(() => cleanup());

  it("renders the unsupported note when push is not supported", () => {
    hookState.supported = false;
    render(<PushNotificationsSection />);
    expect(screen.getByTestId("push-unsupported")).toBeTruthy();
  });

  it("renders an Enable toggle when unsubscribed and calls subscribe on click", async () => {
    render(<PushNotificationsSection />);
    const toggle = screen.getByTestId("push-toggle");
    expect(toggle.textContent).toContain("Enable");
    fireEvent.click(toggle);
    await waitFor(() => expect(hookState.subscribe).toHaveBeenCalledTimes(1));
  });

  it("renders a Disable toggle + Send test when subscribed", async () => {
    hookState.status = "subscribed";
    render(<PushNotificationsSection />);
    const toggle = screen.getByTestId("push-toggle");
    expect(toggle.textContent).toContain("Disable");
    fireEvent.click(toggle);
    await waitFor(() => expect(hookState.unsubscribe).toHaveBeenCalledTimes(1));

    const testBtn = screen.getByTestId("push-test");
    fireEvent.click(testBtn);
    await waitFor(() => expect(hookState.sendTest).toHaveBeenCalledTimes(1));
  });

  it("shows a delivery error when Send test notification fails", async () => {
    hookState.status = "subscribed";
    hookState.sendTest = vi.fn(async () => {
      throw new Error("delivery failed");
    });
    render(<PushNotificationsSection />);

    fireEvent.click(screen.getByTestId("push-test"));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not send a test notification/i);
  });

  it("renders the denied notice (no toggle) when permission was denied", () => {
    hookState.status = "denied";
    render(<PushNotificationsSection />);
    expect(screen.getByTestId("push-denied")).toBeTruthy();
    expect(screen.queryByTestId("push-toggle")).toBeNull();
  });

  it("disables the toggle while status is unknown (no-op enable)", () => {
    hookState.status = "unknown";
    render(<PushNotificationsSection />);
    const toggle = screen.getByTestId("push-toggle") as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.textContent).toContain("Checking");
    fireEvent.click(toggle);
    expect(hookState.subscribe).not.toHaveBeenCalled();
  });
  it("renders both delivery controls enabled by default and explains unread/urgency are unchanged", () => {
    render(<PushNotificationsSection />);
    expect((screen.getByTestId("push-actions-required") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("push-claude-decides") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("push-preferences-description").textContent).toMatch(/push delivery only/i);
    expect(screen.getByTestId("push-preferences-description").textContent).toMatch(/unread stripes/i);
    expect(screen.getByTestId("push-preferences-description").textContent).toMatch(/urgency ordering/i);
  });

  it("updates the two delivery controls independently", () => {
    const onActionsRequiredChange = vi.fn();
    const onClaudeDecidesChange = vi.fn();
    render(
      <PushNotificationsSection
        actionsRequired={true}
        claudeDecides={true}
        onActionsRequiredChange={onActionsRequiredChange}
        onClaudeDecidesChange={onClaudeDecidesChange}
      />,
    );

    fireEvent.click(screen.getByTestId("push-actions-required"));
    expect((screen.getByTestId("push-actions-required") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("push-claude-decides") as HTMLInputElement).checked).toBe(true);
    expect(onActionsRequiredChange).toHaveBeenCalledWith(false);
    expect((screen.getByTestId("push-claude-decides") as HTMLInputElement).checked).toBe(true);
    expect(onClaudeDecidesChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("push-claude-decides"));
    expect((screen.getByTestId("push-actions-required") as HTMLInputElement).checked).toBe(true);
    expect(onClaudeDecidesChange).toHaveBeenCalledWith(false);
    expect(onActionsRequiredChange).toHaveBeenCalledTimes(1);
  });
  it("shows an error when disabling push fails", async () => {
    hookState.status = "subscribed";
    hookState.unsubscribe = vi.fn(async () => {
      throw new Error("unregister failed");
    });
    render(<PushNotificationsSection />);

    fireEvent.click(screen.getByTestId("push-toggle"));

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not update push notifications/i);
    expect(screen.getByTestId("push-toggle").textContent).toContain("Disable");
  });
});
