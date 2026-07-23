import { describe, expect, it } from "vitest";
import { SessionReplayLedger } from "../session-replay-ledger.js";

function frame(seqs: number[], isLast = true) {
  return {
    type: "event_replay", sessionId: "s", requestId: "r", replayKind: "cold",
    sourceGeneration: "g", isLast,
    events: seqs.map((seq) => ({ seq, event: { eventType: "x", timestamp: 0, data: {} } })),
  } as any;
}

describe("LedgerAdmission.minSeq", () => {
  it("reports the retained floor on the admission result", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "r", kind: "cold", sourceGeneration: "g" });
    const result = ledger.admit(frame([1, 2, 3]));
    expect(result.minSeq).toBe(ledger.minSeq);
    expect(result.minSeq).toBe(1);
  });
});
