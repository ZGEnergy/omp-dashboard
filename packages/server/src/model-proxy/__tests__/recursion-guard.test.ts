import { describe, it, expect } from "vitest";
import { isSelfPointing, collectDashboardOrigins } from "../recursion-guard.js";

const origins = [
  "localhost:8000",
  "127.0.0.1:8000",
  "[::1]:8000",
  "192.168.1.10:8000",
  "abcdef.share.zrok.io",
];

describe("isSelfPointing", () => {
  it("catches localhost variants", () => {
    expect(isSelfPointing("http://localhost:8000/v1", origins)).toBe(true);
    expect(isSelfPointing("http://127.0.0.1:8000/v1", origins)).toBe(true);
    expect(isSelfPointing("http://[::1]:8000/v1", origins)).toBe(true);
  });

  it("catches LAN IP self", () => {
    expect(isSelfPointing("http://192.168.1.10:8000/v1", origins)).toBe(true);
  });

  it("catches tunnel hostname self", () => {
    expect(isSelfPointing("https://abcdef.share.zrok.io/v1", origins)).toBe(true);
  });

  it("passes legitimate external URL", () => {
    expect(isSelfPointing("https://api.openai.com/v1", origins)).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isSelfPointing("http://LOCALHOST:8000/v1", origins)).toBe(true);
  });

  it("handles different port", () => {
    expect(isSelfPointing("http://localhost:9999/v1", origins)).toBe(false);
  });

  it("handles malformed URL gracefully", () => {
    expect(isSelfPointing("not-a-url", origins)).toBe(false);
  });

  it("handles HTTPS with default port", () => {
    const httpsOrigins = ["abcdef.share.zrok.io"];
    expect(isSelfPointing("https://abcdef.share.zrok.io/v1", httpsOrigins)).toBe(true);
  });
});

describe("collectDashboardOrigins", () => {
  it("includes localhost variants", () => {
    const origins = collectDashboardOrigins(8000);
    expect(origins).toContain("localhost:8000");
    expect(origins).toContain("127.0.0.1:8000");
    expect(origins).toContain("[::1]:8000");
  });

  it("includes tunnel hostname when provided", () => {
    const origins = collectDashboardOrigins(8000, { tunnelHostname: "my.tunnel.io" });
    expect(origins).toContain("my.tunnel.io");
  });
});
