import { describe, expect, it } from "vitest";
import { DEFAULT_TAIL_WINDOW_BYTES } from "../event-window.js";

describe("event-window defaults", () => {
  it("tail default is 1 MiB", () => {
    expect(DEFAULT_TAIL_WINDOW_BYTES).toBe(1 * 1024 * 1024);
  });
});
