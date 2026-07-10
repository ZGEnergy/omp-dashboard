/**
 * Unit tests for the `push` config block validator.
 *
 * Covers: default when absent, `enabled` boolean coercion,
 * `coalesceWindowMs` clamp bounds, and `webPush.contactEmail` passthrough.
 * Mirrors the OpenSpec-poll validator test style.
 * See change: add-server-push-notifications.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_PUSH_CONFIG, parsePushConfig } from "../config.js";

describe("parsePushConfig", () => {
  it("returns the default block when raw is absent", () => {
    expect(parsePushConfig(undefined)).toEqual({ ...DEFAULT_PUSH_CONFIG });
    expect(parsePushConfig(null)).toEqual({ ...DEFAULT_PUSH_CONFIG });
    expect(parsePushConfig("nope")).toEqual({ ...DEFAULT_PUSH_CONFIG });
  });

  it("defaults enabled to false", () => {
    expect(parsePushConfig({}).enabled).toBe(false);
  });

  it("coerces enabled to a boolean", () => {
    expect(parsePushConfig({ enabled: true }).enabled).toBe(true);
    expect(parsePushConfig({ enabled: false }).enabled).toBe(false);
    // non-boolean falls back to the default
    expect(parsePushConfig({ enabled: "yes" }).enabled).toBe(false);
    expect(parsePushConfig({ enabled: 1 }).enabled).toBe(false);
  });

  it("defaults coalesceWindowMs to 30000 when absent or non-number", () => {
    expect(parsePushConfig({}).coalesceWindowMs).toBe(30_000);
    expect(parsePushConfig({ coalesceWindowMs: "soon" }).coalesceWindowMs).toBe(30_000);
    expect(parsePushConfig({ coalesceWindowMs: Number.NaN }).coalesceWindowMs).toBe(30_000);
  });

  it("clamps coalesceWindowMs below the 5000 floor", () => {
    expect(parsePushConfig({ coalesceWindowMs: 0 }).coalesceWindowMs).toBe(5_000);
    expect(parsePushConfig({ coalesceWindowMs: 4_999 }).coalesceWindowMs).toBe(5_000);
  });

  it("clamps coalesceWindowMs above the 300000 ceiling", () => {
    expect(parsePushConfig({ coalesceWindowMs: 300_001 }).coalesceWindowMs).toBe(300_000);
    expect(parsePushConfig({ coalesceWindowMs: 10_000_000 }).coalesceWindowMs).toBe(300_000);
  });

  it("accepts an in-range coalesceWindowMs verbatim", () => {
    expect(parsePushConfig({ coalesceWindowMs: 45_000 }).coalesceWindowMs).toBe(45_000);
  });

  it("passes through webPush.contactEmail", () => {
    const cfg = parsePushConfig({
      enabled: true,
      webPush: { contactEmail: "ops@example.com" },
    });
    expect(cfg.webPush).toEqual({ contactEmail: "ops@example.com" });
  });

  it("omits webPush when contactEmail is missing or not a string", () => {
    expect(parsePushConfig({ webPush: {} }).webPush).toBeUndefined();
    expect(parsePushConfig({ webPush: { contactEmail: 42 } }).webPush).toBeUndefined();
    expect(parsePushConfig({}).webPush).toBeUndefined();
  });

  it("passes through fcm.serviceAccountPath (stub transport, kept for the union)", () => {
    const cfg = parsePushConfig({
      enabled: true,
      fcm: { serviceAccountPath: "/etc/pi/fcm.json" },
    });
    expect(cfg.fcm).toEqual({ serviceAccountPath: "/etc/pi/fcm.json" });
  });

  it("omits fcm when serviceAccountPath is missing or not a string", () => {
    expect(parsePushConfig({ fcm: {} }).fcm).toBeUndefined();
    expect(parsePushConfig({ fcm: { serviceAccountPath: 7 } }).fcm).toBeUndefined();
  });
});
