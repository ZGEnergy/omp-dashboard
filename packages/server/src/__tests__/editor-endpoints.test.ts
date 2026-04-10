import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { isLoopback } from "../localhost-guard.js";

// Unit tests for localhost guard
describe("isLoopback", () => {
  it("should accept 127.0.0.1", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
  });

  it("should accept ::1", () => {
    expect(isLoopback("::1")).toBe(true);
  });

  it("should accept ::ffff:127.0.0.1", () => {
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
  });

  it("should reject remote IPs", () => {
    expect(isLoopback("192.168.1.1")).toBe(false);
    expect(isLoopback("10.0.0.1")).toBe(false);
  });
});

// Unit tests for detectEditors are in editor-registry.test.ts
// Integration tests for the full endpoints would require spinning up the server,
// which is covered by manual testing. Here we test the core logic units.
