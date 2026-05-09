/**
 * Regression test pinning the slash-command routing contract.
 * Drives `command-handler.handle({type:"send_prompt"...})` against a stub pi
 * and asserts the call counts + emitted command_feedback events from
 * `design.md` Decision 5 table.
 *
 * regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/
 */
import { describe, it, expect, vi } from "vitest";
import { createCommandHandler } from "../command-handler.js";
import { hasDispatchCommand } from "../bridge-context.js";
import type { ExtensionToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";

interface StubOpts {
  withDispatch?: boolean;
  dispatchRejects?: Error;
  getCommandsThrows?: boolean;
  commands?: Array<{ name: string; source: string }>;
}

function makeStubPi(opts: StubOpts = {}) {
  const dispatchCommand = opts.withDispatch
    ? vi.fn(async (_text: string, _options?: any) => {
        if (opts.dispatchRejects) throw opts.dispatchRejects;
      })
    : undefined;
  const sendUserMessage = vi.fn();
  const setSessionName = vi.fn();
  const events = { emit: vi.fn() };
  const getCommands = vi.fn(() => {
    if (opts.getCommandsThrows) throw new Error("stale ctx");
    return opts.commands ?? [
      { name: "ctx-stats", source: "extension" },
      { name: "skill:foo", source: "skill" },
      { name: "review", source: "prompt" },
      { name: "__dashboard_reload", source: "extension" },
    ];
  });
  const pi: any = {
    sendUserMessage,
    getCommands,
    setSessionName,
    events,
  };
  if (dispatchCommand) pi.dispatchCommand = dispatchCommand;
  return { pi, sendUserMessage, dispatchCommand, getCommands, events };
}

function feedbackEvents(sink: ReturnType<typeof vi.fn>, command: string) {
  return sink.mock.calls
    .map((c) => c[0] as ExtensionToServerMessage)
    .filter(
      (m) =>
        m.type === "event_forward" &&
        (m as any).event?.eventType === "command_feedback" &&
        ((m as any).event?.data?.command === command),
    )
    .map((m) => (m as any).event.data);
}

async function drive(text: string, stub: ReturnType<typeof makeStubPi>) {
  const sink = vi.fn();
  const handler = createCommandHandler(stub.pi as any, "s1", { eventSink: sink });
  await handler.handle({ type: "send_prompt", sessionId: "s1", text } as any);
  return sink;
}

describe("bridge slash command routing (regression contract)", () => {
  it("extension cmd with dispatchCommand → dispatch called, no sendUserMessage, started+completed", async () => {
    // regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/ctx-stats", stub);

    expect(stub.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(stub.dispatchCommand).toHaveBeenCalledWith("/ctx-stats", { streamingBehavior: "followUp" });
    expect(stub.sendUserMessage).not.toHaveBeenCalled();

    const evs = feedbackEvents(sink, "/ctx-stats");
    expect(evs.map((e) => e.status)).toEqual(["started", "completed"]);
  });

  it("extension cmd, NO dispatchCommand → stopgap error, no sendUserMessage, started+error", async () => {
    // regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/
    const stub = makeStubPi({ withDispatch: false });
    const sink = await drive("/ctx-stats", stub);

    expect(stub.sendUserMessage).not.toHaveBeenCalled();

    const evs = feedbackEvents(sink, "/ctx-stats");
    expect(evs.map((e) => e.status)).toEqual(["started", "error"]);
    expect(evs[1].message).toMatch(/pi 0\.71\+/);
  });

  it("extension cmd dispatch rejects → started+error with err.message, no sendUserMessage", async () => {
    const stub = makeStubPi({ withDispatch: true, dispatchRejects: new Error("boom") });
    const sink = await drive("/ctx-stats", stub);

    expect(stub.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(stub.sendUserMessage).not.toHaveBeenCalled();

    const evs = feedbackEvents(sink, "/ctx-stats");
    expect(evs.map((e) => e.status)).toEqual(["started", "error"]);
    expect(evs[1].message).toBe("boom");
  });

  it("skill command → no dispatch, sendUserMessage called once, no command_feedback", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/skill:foo", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);

    expect(feedbackEvents(sink, "/skill:foo")).toEqual([]);
  });

  it("prompt template → no dispatch, sendUserMessage called once, no command_feedback", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/review", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(feedbackEvents(sink, "/review")).toEqual([]);
  });

  it("passthrough text → no dispatch, sendUserMessage called once, no command_feedback", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("hello world", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it("unrecognized slash → no dispatch, sendUserMessage called once, no command_feedback", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/totally-unknown-command", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(feedbackEvents(sink, "/totally-unknown-command")).toEqual([]);
  });

  it("bridge-native /__dashboard_reload → no dispatch, no error feedback, sendUserMessage fallback", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/__dashboard_reload", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    // It IS in the command list with source: extension, but DASHBOARD_NATIVE_COMMANDS
    // / __-prefix exclusion suppresses it. The slash branch falls through to sendUserMessage.
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(feedbackEvents(sink, "/__dashboard_reload")).toEqual([]);
  });

  it("getCommands throws → no crash, no command_feedback, sendUserMessage fallback fires", async () => {
    const stub = makeStubPi({ withDispatch: true, getCommandsThrows: true });
    const sink = await drive("/ctx-stats", stub);

    expect(stub.dispatchCommand).not.toHaveBeenCalled();
    // helper returns false on throw → caller falls through to sendUserMessage path
    expect(stub.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(feedbackEvents(sink, "/ctx-stats")).toEqual([]);
  });

  it("never duplicates command_feedback on dispatch path (success)", async () => {
    const stub = makeStubPi({ withDispatch: true });
    const sink = await drive("/ctx-stats", stub);
    const evs = feedbackEvents(sink, "/ctx-stats");
    expect(evs.filter((e) => e.status === "started")).toHaveLength(1);
    expect(evs.filter((e) => e.status === "completed" || e.status === "error")).toHaveLength(1);
  });

  it("never duplicates command_feedback on stopgap path", async () => {
    const stub = makeStubPi({ withDispatch: false });
    const sink = await drive("/ctx-stats", stub);
    const evs = feedbackEvents(sink, "/ctx-stats");
    expect(evs.filter((e) => e.status === "started")).toHaveLength(1);
    expect(evs.filter((e) => e.status === "completed" || e.status === "error")).toHaveLength(1);
  });

  it("anti-regression: /ctx-stats NEVER reaches sendUserMessage", async () => {
    // regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/
    for (const withDispatch of [true, false]) {
      const stub = makeStubPi({ withDispatch });
      await drive("/ctx-stats", stub);
      expect(stub.sendUserMessage, `withDispatch=${withDispatch}`).not.toHaveBeenCalled();
    }
  });
});

describe("hasDispatchCommand", () => {
  it("returns true when field is a function", () => {
    expect(hasDispatchCommand({ dispatchCommand: () => {} })).toBe(true);
  });
  it("returns false when field is absent", () => {
    expect(hasDispatchCommand({})).toBe(false);
  });
  it("returns false when field is not a function", () => {
    expect(hasDispatchCommand({ dispatchCommand: "yes" })).toBe(false);
  });
  it("returns false on null/undefined", () => {
    expect(hasDispatchCommand(null)).toBe(false);
    expect(hasDispatchCommand(undefined)).toBe(false);
  });
});
