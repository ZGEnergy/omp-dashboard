/**
 * Unit tests for the pure, ownership-aware tray menu-template builder.
 * See change: electron-server-launch-controls (task 4.6);
 * electron-attach-ownership-fixes (ownership-aware menu).
 */
import { describe, it, expect, vi } from "vitest";
import { buildTrayMenuTemplate } from "../tray.js";

const noop = () => { /* no-op */ };

describe("buildTrayMenuTemplate", () => {
  it("ownership=none → 'Start server'", () => {
    const t = buildTrayMenuTemplate({ ownership: "none", onLaunch: noop, onShow: noop, onQuit: noop });
    const labels = t.map((i) => i.label).filter(Boolean);
    expect(labels).toContain("Start server");
    expect(labels).not.toContain("Restart server");
  });

  it("ownership=electron → 'Restart server'", () => {
    const t = buildTrayMenuTemplate({ ownership: "electron", onLaunch: noop, onShow: noop, onQuit: noop });
    const labels = t.map((i) => i.label).filter(Boolean);
    expect(labels).toContain("Restart server");
    expect(labels).not.toContain("Start server");
  });

  it("ownership=foreign → disabled 'Server managed externally' row", () => {
    const t = buildTrayMenuTemplate({ ownership: "foreign", onLaunch: noop, onShow: noop, onQuit: noop });
    const item = t.find((i) => i.label === "Server managed externally");
    expect(item).toBeDefined();
    expect(item!.enabled).toBe(false);
    expect(item!.click).toBeUndefined();
    const labels = t.map((i) => i.label).filter(Boolean);
    expect(labels).not.toContain("Start server");
    expect(labels).not.toContain("Restart server");
  });

  it("ownership=unknown → omits launch item entirely", () => {
    const t = buildTrayMenuTemplate({ ownership: "unknown", onLaunch: noop, onShow: noop, onQuit: noop });
    const labels = t.map((i) => i.label).filter(Boolean);
    expect(labels).not.toContain("Start server");
    expect(labels).not.toContain("Restart server");
    expect(labels).not.toContain("Server managed externally");
    expect(labels).toEqual(["Show", "Quit"]);
  });

  it("Start server item invokes onLaunch with force=false", () => {
    const onLaunch = vi.fn();
    const t = buildTrayMenuTemplate({ ownership: "none", onLaunch, onShow: noop, onQuit: noop });
    const startItem = t.find((i) => i.label === "Start server");
    (startItem as any).click();
    expect(onLaunch).toHaveBeenCalledWith(false);
  });

  it("Restart server item invokes onLaunch with force=true", () => {
    const onLaunch = vi.fn();
    const t = buildTrayMenuTemplate({ ownership: "electron", onLaunch, onShow: noop, onQuit: noop });
    const restartItem = t.find((i) => i.label === "Restart server");
    (restartItem as any).click();
    expect(onLaunch).toHaveBeenCalledWith(true);
  });

  it("always includes Show and Quit", () => {
    for (const ownership of ["electron", "none", "foreign", "unknown"] as const) {
      const t = buildTrayMenuTemplate({ ownership, onLaunch: noop, onShow: noop, onQuit: noop });
      const labels = t.map((i) => i.label).filter(Boolean);
      expect(labels).toContain("Show");
      expect(labels).toContain("Quit");
    }
  });
});
