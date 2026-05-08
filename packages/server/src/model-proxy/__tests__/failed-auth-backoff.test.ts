import { describe, it, expect } from "vitest";
import { FailedAuthBackoff } from "../failed-auth-backoff.js";

describe("FailedAuthBackoff", () => {
  it("starts at 10ms on first failure", () => {
    const b = new FailedAuthBackoff();
    const delay = b.record("1.2.3.4");
    expect(delay).toBe(10);
  });

  it("doubles on each failure", () => {
    const b = new FailedAuthBackoff();
    expect(b.record("1.2.3.4")).toBe(10);
    expect(b.record("1.2.3.4")).toBe(20);
    expect(b.record("1.2.3.4")).toBe(40);
    expect(b.record("1.2.3.4")).toBe(80);
  });

  it("caps at 10s", () => {
    const b = new FailedAuthBackoff();
    for (let i = 0; i < 20; i++) b.record("1.2.3.4");
    expect(b.getDelayMs("1.2.3.4")).toBe(10_000);
  });

  it("resets on success", () => {
    const b = new FailedAuthBackoff();
    b.record("1.2.3.4");
    b.record("1.2.3.4");
    b.reset("1.2.3.4");
    expect(b.getDelayMs("1.2.3.4")).toBe(0);
  });

  it("isolates different IPs", () => {
    const b = new FailedAuthBackoff();
    b.record("1.1.1.1");
    b.record("1.1.1.1");
    b.record("2.2.2.2");
    expect(b.getDelayMs("1.1.1.1")).toBe(20);
    expect(b.getDelayMs("2.2.2.2")).toBe(10);
  });

  it("getDelayMs returns 0 for unknown IP", () => {
    const b = new FailedAuthBackoff();
    expect(b.getDelayMs("unknown")).toBe(0);
  });
});
