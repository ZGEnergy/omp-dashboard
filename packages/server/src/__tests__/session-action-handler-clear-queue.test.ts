/**
 * Tests for pi-native queue control handlers. See change: add-followup-edit-and-steer-cancel.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleClearSteeringQueue,
  handleClearFollowupSlot,
  handleEditFollowupSlot,
  handlePromoteFollowupEntry,
  handleRemoveFollowupEntry,
  handleEditFollowupEntry,
} from "../browser-handlers/session-action-handler.js";

function makeCtx(sessionExists: boolean) {
  const sendToSession = vi.fn();
  return {
    sendToSession,
    ctx: {
      sessionManager: {
        get: vi.fn().mockReturnValue(sessionExists ? { id: "s1", cwd: "/p" } : undefined),
      },
      piGateway: { sendToSession },
    } as never,
  };
}

describe("handleClearSteeringQueue", () => {
  it("forwards clear_steering_queue to the bridge when session exists", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handleClearSteeringQueue({ type: "clear_steering_queue", sessionId: "s1" }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", { type: "clear_steering_queue", sessionId: "s1" });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handleClearSteeringQueue({ type: "clear_steering_queue", sessionId: "missing" }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});

describe("handleClearFollowupSlot", () => {
  it("forwards clear_followup_slot to the bridge when session exists", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handleClearFollowupSlot({ type: "clear_followup_slot", sessionId: "s1" }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", { type: "clear_followup_slot", sessionId: "s1" });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handleClearFollowupSlot({ type: "clear_followup_slot", sessionId: "missing" }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});

describe("handleEditFollowupSlot", () => {
  it("forwards edit_followup_slot with text + images to the bridge", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handleEditFollowupSlot({ type: "edit_followup_slot", sessionId: "s1", text: "revised", images: undefined }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "edit_followup_slot",
      sessionId: "s1",
      text: "revised",
      images: undefined,
    });
  });

  it("preserves images array when provided", () => {
    const { sendToSession, ctx } = makeCtx(true);
    const images = [{ type: "image" as const, data: "AAA", mimeType: "image/png" }];
    handleEditFollowupSlot({ type: "edit_followup_slot", sessionId: "s1", text: "with image", images }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "edit_followup_slot",
      sessionId: "s1",
      text: "with image",
      images,
    });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handleEditFollowupSlot({ type: "edit_followup_slot", sessionId: "missing", text: "hi" }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});

describe("handlePromoteFollowupEntry (v2)", () => {
  it("forwards promote_followup_entry with index", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handlePromoteFollowupEntry({ type: "promote_followup_entry", sessionId: "s1", index: 2 }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "promote_followup_entry",
      sessionId: "s1",
      index: 2,
    });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handlePromoteFollowupEntry({ type: "promote_followup_entry", sessionId: "missing", index: 0 }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});

describe("handleRemoveFollowupEntry (v2)", () => {
  it("forwards remove_followup_entry with index", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handleRemoveFollowupEntry({ type: "remove_followup_entry", sessionId: "s1", index: 1 }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "remove_followup_entry",
      sessionId: "s1",
      index: 1,
    });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handleRemoveFollowupEntry({ type: "remove_followup_entry", sessionId: "missing", index: 0 }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});

describe("handleEditFollowupEntry (v2)", () => {
  it("forwards edit_followup_entry with index + text", () => {
    const { sendToSession, ctx } = makeCtx(true);
    handleEditFollowupEntry({ type: "edit_followup_entry", sessionId: "s1", index: 1, text: "updated" }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "edit_followup_entry",
      sessionId: "s1",
      index: 1,
      text: "updated",
      images: undefined,
    });
  });

  it("preserves images when provided", () => {
    const { sendToSession, ctx } = makeCtx(true);
    const images = [{ type: "image" as const, data: "AAA", mimeType: "image/png" }];
    handleEditFollowupEntry({ type: "edit_followup_entry", sessionId: "s1", index: 0, text: "img", images }, ctx);
    expect(sendToSession).toHaveBeenCalledWith("s1", {
      type: "edit_followup_entry",
      sessionId: "s1",
      index: 0,
      text: "img",
      images,
    });
  });

  it("drops silently when session is unknown", () => {
    const { sendToSession, ctx } = makeCtx(false);
    handleEditFollowupEntry({ type: "edit_followup_entry", sessionId: "missing", index: 0, text: "x" }, ctx);
    expect(sendToSession).not.toHaveBeenCalled();
  });
});
