/**
 * Unit tests for the SW push payload → notification-args + click→url helpers.
 * (The service worker inlines the same logic; this is the tested source.)
 * See change: add-server-push-notifications.
 */
import { describe, expect, it } from "vitest";
import {
  clickTargetUrl,
  notificationOptionsFromPayload,
} from "../push-notification-payload.js";

describe("notificationOptionsFromPayload", () => {
  it("maps a full payload to showNotification args", () => {
    const result = notificationOptionsFromPayload({
      title: "Pi session needs your input",
      body: "worker is waiting",
      url: "/session/abc",
      sessionId: "abc",
    });
    expect(result.title).toBe("Pi session needs your input");
    expect(result.options.body).toBe("worker is waiting");
    expect(result.options.data).toEqual({ url: "/session/abc", sessionId: "abc" });
    expect(result.options.icon).toBe("/icon-192.png");
    expect(result.options.badge).toBe("/icon-192.png");
  });

  it("falls back to defaults on an empty payload", () => {
    const result = notificationOptionsFromPayload({});
    expect(result.title).toBe("Pi Dashboard");
    expect(result.options.body).toBe("");
    expect(result.options.data).toEqual({ url: "/" });
  });
});

describe("clickTargetUrl", () => {
  it("returns the notification url when present", () => {
    expect(clickTargetUrl({ url: "/session/abc" })).toBe("/session/abc");
  });

  it("falls back to / when url is missing or empty", () => {
    expect(clickTargetUrl({})).toBe("/");
    expect(clickTargetUrl({ url: "" })).toBe("/");
    expect(clickTargetUrl(undefined)).toBe("/");
    expect(clickTargetUrl(null)).toBe("/");
  });
});
