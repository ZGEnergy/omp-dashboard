import { describe, expect, it } from "vitest";
import { shouldReconnectForForeground } from "../foreground-replay.js";

describe("shouldReconnectForForeground", () => {
  it("keeps a healthy connection and its retained transcript intact", () => {
    expect(shouldReconnectForForeground("connected")).toBe(false);
    expect(shouldReconnectForForeground("connecting")).toBe(false);
  });

  it("reconnects only after the socket is offline", () => {
    expect(shouldReconnectForForeground("offline")).toBe(true);
    expect(shouldReconnectForForeground("auth_required")).toBe(false);
  });
});
