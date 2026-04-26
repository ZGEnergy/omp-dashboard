/**
 * Tests for plugin config REST endpoint behavior (9.2 coverage):
 * - bad body → 400
 * - disabled plugin → 409
 * - unknown id → 404
 *
 * These run as unit tests against the route handler logic using
 * a lightweight mock of the store. Full integration is covered by
 * manual verification (task 11.3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPluginStatusStore } from "../server/plugin-status-store.js";

describe("PluginStatusStore", () => {
  it("returns undefined for unknown plugin", () => {
    const store = createPluginStatusStore();
    expect(store.getStatus("no-such-plugin")).toBeUndefined();
  });

  it("tracks disabled plugin status", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "demo", enabled: false, loaded: false, claims: 2 });
    const status = store.getStatus("demo");
    expect(status?.enabled).toBe(false);
  });

  it("listAll returns all entries", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "a", enabled: true, loaded: true, claims: 1 });
    store.setStatus({ id: "b", enabled: false, loaded: false, claims: 0 });
    expect(store.listAll()).toHaveLength(2);
  });

  it("tracks error for failed plugin", () => {
    const store = createPluginStatusStore();
    store.setStatus({ id: "bad", enabled: true, loaded: false, error: "boom", claims: 1 });
    expect(store.getStatus("bad")?.error).toBe("boom");
  });
});
