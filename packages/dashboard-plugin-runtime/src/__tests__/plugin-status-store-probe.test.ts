/**
 * Tests for bridge-probe recording in PluginStatusStore — see change
 * fix-pi-flows-end-to-end (Group 2, task 2.5).
 */
import { describe, it, expect } from "vitest";
import { createPluginStatusStore } from "../server/plugin-status-store.js";

describe("PluginStatusStore.recordBridgeProbe", () => {
  it("stores latest probe and exposes via listAll().lastProbe", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "demo", enabled: true, loaded: true, claims: 0 });
    store.recordBridgeProbe("demo", {
      status: "active",
      peers: { "@x": { ok: true } },
      at: 1000,
    });
    const list = store.listAll();
    expect(list).toHaveLength(1);
    expect(list[0].lastProbe?.status).toBe("active");
    expect(list[0].lastProbe?.at).toBe(1000);
  });

  it("keeps the most recent probe (higher `at` wins)", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "demo", enabled: true, loaded: true, claims: 0 });
    store.recordBridgeProbe("demo", { status: "probing", peers: {}, at: 1000 });
    store.recordBridgeProbe("demo", { status: "active", peers: {}, at: 2000 });
    expect(store.getBridgeProbe("demo")?.status).toBe("active");
  });

  it("ignores stale probe (lower `at`)", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "demo", enabled: true, loaded: true, claims: 0 });
    store.recordBridgeProbe("demo", { status: "active", peers: {}, at: 2000 });
    store.recordBridgeProbe("demo", { status: "probing", peers: {}, at: 1000 });
    expect(store.getBridgeProbe("demo")?.status).toBe("active");
  });

  it("does not pollute lastProbe of unrelated plugins", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "a", enabled: true, loaded: true, claims: 0 });
    store.setStatus({ id: "b", enabled: true, loaded: true, claims: 0 });
    store.recordBridgeProbe("a", { status: "active", peers: {}, at: 1000 });
    const list = store.listAll();
    const a = list.find((x) => x.id === "a")!;
    const b = list.find((x) => x.id === "b")!;
    expect(a.lastProbe).toBeDefined();
    expect(b.lastProbe).toBeUndefined();
  });

  it("recordBridgeProbe for unknown pluginId is silently dropped at listAll time", () => {
    const store = createPluginStatusStore();
    // No setStatus for "ghost"
    store.recordBridgeProbe("ghost", { status: "active", peers: {}, at: 1000 });
    expect(store.listAll()).toHaveLength(0);
    // But probe IS retained — if the plugin is registered later, the latest
    // probe is surfaced. This matches the bridge-probe-first-then-discover
    // timing that can happen at server start.
    store.setStatus({ id: "ghost", enabled: true, loaded: true, claims: 0 });
    expect(store.listAll()[0].lastProbe?.status).toBe("active");
  });
});
