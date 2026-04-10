import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isLocalhost } from "../editor-api.js";

describe("isLocalhost", () => {
  const originalLocation = window.location;

  function mockHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, hostname },
      writable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("should return true for localhost", () => {
    mockHostname("localhost");
    expect(isLocalhost()).toBe(true);
  });

  it("should return true for 127.0.0.1", () => {
    mockHostname("127.0.0.1");
    expect(isLocalhost()).toBe(true);
  });

  it("should return true for ::1", () => {
    mockHostname("::1");
    expect(isLocalhost()).toBe(true);
  });

  it("should return false for remote hostname", () => {
    mockHostname("dashboard.example.com");
    expect(isLocalhost()).toBe(false);
  });
});
