import { observeElementOffset, observeWindowOffset } from "@tanstack/virtual-core";
import { describe, expect, it } from "vitest";

type ListenerMap = Map<string, () => void>;

type TimerWindow = {
  setTimeout: (callback: () => void) => number;
  clearTimeout: (timerId: number) => void;
};

function createTimerWindow() {
  let pendingCallback: (() => void) | undefined;
  const timerWindow: TimerWindow = {
    setTimeout(callback) {
      pendingCallback = callback;
      return 1;
    },
    // Simulate a callback that has already entered the host queue when
    // observer cleanup races with cancellation.
    clearTimeout() {},
  };
  return {
    timerWindow,
    runPendingCallback() {
      pendingCallback?.();
    },
  };
}

describe("TanStack Virtual offset observer teardown", () => {
  it("ignores a late element observer debounce callback after scroll-element replacement", () => {
    const listeners: ListenerMap = new Map();
    const { timerWindow, runPendingCallback } = createTimerWindow();
    const element = {
      addEventListener(type: string, callback: () => void) {
        listeners.set(type, callback);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      ownerDocument: { defaultView: timerWindow },
      scrollTop: 17,
    };
    const instance = {
      scrollElement: element,
      targetWindow: timerWindow,
      options: {
        horizontal: false,
        isRtl: false,
        isScrollingResetDelay: 50,
        useScrollendEvent: false,
      },
    };
    let callbackCount = 0;
    const cleanup = observeElementOffset(instance as never, () => {
      callbackCount += 1;
    });

    callbackCount = 0;
    listeners.get("scroll")?.();
    callbackCount = 0;
    instance.scrollElement = null;
    cleanup?.();
    runPendingCallback();

    expect(callbackCount).toBe(0);
  });

  it("ignores a late window observer debounce callback after scroll-element replacement", () => {
    const listeners: ListenerMap = new Map();
    const { timerWindow, runPendingCallback } = createTimerWindow();
    const element = {
      addEventListener(type: string, callback: () => void) {
        listeners.set(type, callback);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      scrollY: 23,
    };
    const instance = {
      scrollElement: element,
      targetWindow: timerWindow,
      options: {
        horizontal: false,
        isScrollingResetDelay: 50,
        useScrollendEvent: false,
      },
    };
    let callbackCount = 0;
    const cleanup = observeWindowOffset(instance as never, () => {
      callbackCount += 1;
    });

    callbackCount = 0;
    listeners.get("scroll")?.();
    callbackCount = 0;
    instance.scrollElement = null;
    cleanup?.();
    runPendingCallback();

    expect(callbackCount).toBe(0);
  });
});
