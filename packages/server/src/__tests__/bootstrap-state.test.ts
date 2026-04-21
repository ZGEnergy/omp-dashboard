/**
 * Unit tests for the in-memory bootstrap state store.
 *
 * See change: unified-bootstrap-install.
 */
import { describe, it, expect } from "vitest";
import { createBootstrapState } from "../bootstrap-state.js";

describe("bootstrap-state", () => {
  it("defaults to status=ready", () => {
    const s = createBootstrapState();
    expect(s.get()).toEqual({ status: "ready" });
  });

  it("applies initial overrides", () => {
    const s = createBootstrapState({
      status: "installing",
      progress: { step: "pi", output: "starting" },
    });
    const state = s.get();
    expect(state.status).toBe("installing");
    expect(state.progress).toEqual({ step: "pi", output: "starting" });
  });

  it("set merges partial into state", () => {
    const s = createBootstrapState();
    s.set({ status: "installing", progress: { step: "pi" } });
    expect(s.get().status).toBe("installing");
    s.set({ progress: { step: "openspec" } });
    expect(s.get().progress).toEqual({ step: "openspec" });
    expect(s.get().status).toBe("installing");
  });

  it("set with undefined explicitly clears a key", () => {
    const s = createBootstrapState({ progress: { step: "pi" } });
    expect(s.get().progress).toBeDefined();
    s.set({ progress: undefined });
    expect(s.get().progress).toBeUndefined();
  });

  it("notifies subscribers on set", () => {
    const s = createBootstrapState();
    const calls: string[] = [];
    s.subscribe((st) => calls.push(st.status));
    s.set({ status: "installing" });
    s.set({ status: "ready" });
    expect(calls).toEqual(["installing", "ready"]);
  });

  it("subscribe returns an unsubscribe function", () => {
    const s = createBootstrapState();
    const calls: string[] = [];
    const off = s.subscribe((st) => calls.push(st.status));
    s.set({ status: "installing" });
    off();
    s.set({ status: "ready" });
    expect(calls).toEqual(["installing"]);
  });

  it("listener errors do not stop other listeners", () => {
    const s = createBootstrapState();
    const calls: string[] = [];
    s.subscribe(() => {
      throw new Error("boom");
    });
    s.subscribe((st) => calls.push(st.status));
    s.set({ status: "installing" });
    expect(calls).toEqual(["installing"]);
  });

  it("dispose clears all listeners", () => {
    const s = createBootstrapState();
    const calls: string[] = [];
    s.subscribe((st) => calls.push(st.status));
    s.dispose();
    s.set({ status: "installing" });
    expect(calls).toEqual([]);
  });

  it("get returns a fresh snapshot (external mutation does not affect store)", () => {
    const s = createBootstrapState({ progress: { step: "pi" } });
    const snap = s.get();
    snap.status = "failed";
    expect(s.get().status).toBe("ready");
  });

  describe("lastInstallPackages", () => {
    it("defaults to an empty array", () => {
      const s = createBootstrapState();
      expect(s.getLastInstallPackages()).toEqual([]);
    });

    it("records and returns a fresh copy", () => {
      const s = createBootstrapState();
      s.setLastInstallPackages(["pi", "openspec"]);
      const got = s.getLastInstallPackages();
      expect(got).toEqual(["pi", "openspec"]);
      // External mutation does not affect the stored value.
      got.push("tsx");
      expect(s.getLastInstallPackages()).toEqual(["pi", "openspec"]);
    });

    it("accepts a readonly input without type error", () => {
      const s = createBootstrapState();
      const readonlyInput: readonly string[] = ["a", "b"];
      s.setLastInstallPackages(readonlyInput);
      expect(s.getLastInstallPackages()).toEqual(["a", "b"]);
    });

    it("is independent of status broadcast (not part of snapshot)", () => {
      const s = createBootstrapState();
      const seen: string[] = [];
      s.subscribe((st) => seen.push(st.status));
      s.setLastInstallPackages(["pi"]);
      // setLastInstallPackages MUST NOT trigger a listener.
      expect(seen).toEqual([]);
    });
  });
});
