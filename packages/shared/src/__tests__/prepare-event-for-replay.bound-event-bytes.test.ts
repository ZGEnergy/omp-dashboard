import { describe, expect, it } from "vitest";
import { prepareEventForReplay, utf8ByteLength } from "../prepare-event-for-replay.js";
import type { DashboardEvent } from "../types.js";

/**
 * Regression: `boundEventBytes`'s single-pass shrink can miss the target by a
 * handful of bytes and fall straight through to a full-data wipe
 * (`{ replayUnavailable: true }`) instead of shrinking further.
 *
 * Root cause: the shrink target is computed from the REPLACEMENT string's raw
 * UTF-8 byte length (`utf8ByteLength`), but the wire size is its
 * JSON-serialized length. `REPLAY_BYTE_TRUNCATION_MARKER` embeds a literal
 * `\n`, which JSON.stringify escapes to `\n` (2 chars) — +1 byte per escaped
 * control character not accounted for in the target math. When the shrink
 * target lands within a few bytes of `limit`, this escape inflation pushes
 * the final serialized event just OVER `limit`; since there is only one
 * dominant string location, the single `for` pass then exits having "used
 * up" its only shrink candidate, and the function falls to the
 * `replayUnavailable` fallback — discarding the ENTIRE assistant message
 * body instead of trimming a few more bytes.
 *
 * This bug is pre-existing on `main` (same file, byte-identical) but was
 * effectively unreachable there: it only fires when an event needs shrinking
 * to within a few bytes of `maxEventBytes`, which requires content within a
 * few bytes of the (formerly 4 MiB, now 1 MiB after commit 7b995de9) tail
 * window budget. Lowering the default budget 4x makes ordinary (not
 * exotic) assistant-message sizes hit this edge far more often — turning a
 * latent bug into a frequently-observed one on cold-start/reconnect and
 * "Load older" paging.
 */
describe("boundEventBytes near-boundary shrink (event_window / prepare-event-for-replay)", () => {
  it("shrinks a large single-block assistant message to fit the budget instead of wiping it to replayUnavailable", () => {
    const text = "x".repeat(1.5 * 1024 * 1024);
    const event: DashboardEvent = {
      eventType: "message_update",
      timestamp: 0,
      data: { message: { role: "assistant", content: [{ type: "text", text }] } },
    };
    const maxEventBytes = 1024 * 1024; // the current (post-7b995de9) default tail-window budget
    const out = prepareEventForReplay(event, { maxEventBytes, maxTextBytes: maxEventBytes });

    // Must NOT discard the message wholesale.
    expect(out.event.data).not.toHaveProperty("replayUnavailable");
    const content = (out.event.data as any).message?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(typeof content[0].text).toBe("string");
    expect(content[0].text.length).toBeGreaterThan(0);

    // The event must actually fit the requested budget.
    expect(utf8ByteLength(JSON.stringify(out.event))).toBeLessThanOrEqual(maxEventBytes);
  });
});
