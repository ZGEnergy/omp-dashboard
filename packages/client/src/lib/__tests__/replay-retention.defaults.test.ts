import { describe, expect, it } from "vitest";
import { DEFAULT_REPLAY_RETENTION_BYTES } from "../replay-retention.js";

describe("replay-retention defaults", () => {
  it("retention default is 6 MiB", () => {
    expect(DEFAULT_REPLAY_RETENTION_BYTES).toBe(6 * 1024 * 1024);
  });
});
