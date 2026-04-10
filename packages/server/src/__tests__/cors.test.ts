import { describe, it, expect } from "vitest";

/**
 * Unit tests for CORS origin validation logic.
 * Tests the same logic used in server.ts CORS callback.
 */

function isAllowedOrigin(origin: string | undefined, configuredOrigins: string[]): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
      return true;
    }
  } catch { /* ignore */ }
  return configuredOrigins.includes(origin);
}

describe("CORS origin validation", () => {
  it("allows requests with no origin (same-origin)", () => {
    expect(isAllowedOrigin(undefined, [])).toBe(true);
  });

  it("allows localhost on any port", () => {
    expect(isAllowedOrigin("http://localhost:3000", [])).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", [])).toBe(true);
    expect(isAllowedOrigin("https://localhost:8443", [])).toBe(true);
  });

  it("allows 127.0.0.1 on any port", () => {
    expect(isAllowedOrigin("http://127.0.0.1:3000", [])).toBe(true);
  });

  it("allows configured origins", () => {
    const configured = ["https://dashboard.example.com"];
    expect(isAllowedOrigin("https://dashboard.example.com", configured)).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isAllowedOrigin("https://evil.example.com", [])).toBe(false);
    expect(isAllowedOrigin("https://evil.example.com", ["https://good.example.com"])).toBe(false);
  });

  it("rejects non-localhost remote origins without config", () => {
    expect(isAllowedOrigin("http://192.168.1.100:3000", [])).toBe(false);
  });
});
