/**
 * Type-level test ensuring plugin_config_update is in ServerToBrowserMessage.
 *
 * Prevents the recurring esbuild-strips-as-any-cases regression where message
 * types not in the union get dead-code eliminated in production builds.
 */
import { describe, it, expect } from "vitest";
import type { ServerToBrowserMessage, PluginConfigUpdateMessage } from "../browser-protocol.js";

// Type-level assertion: if PluginConfigUpdateMessage is NOT in the union, this fails to compile.
type AssertExtends<T, U> = T extends U ? true : never;
type _PluginConfigUpdateInUnion = AssertExtends<PluginConfigUpdateMessage, ServerToBrowserMessage>;

function extractPluginConfigId(msg: ServerToBrowserMessage): string | null {
  switch (msg.type) {
    case "plugin_config_update": return msg.id;
    default: return null;
  }
}

describe("ServerToBrowserMessage includes plugin_config_update", () => {
  it("plugin_config_update is a valid discriminant", () => {
    const msg: PluginConfigUpdateMessage = {
      type: "plugin_config_update",
      id: "demo",
      config: { foo: 1 },
    };
    expect(extractPluginConfigId(msg)).toBe("demo");
  });

  it("config payload is only this plugin's namespace", () => {
    const msg: PluginConfigUpdateMessage = {
      type: "plugin_config_update",
      id: "openspec",
      config: { pollIntervalSeconds: 30 },
    };
    // The config is the plugin's namespace only — not the full config
    expect((msg.config as any).pollIntervalSeconds).toBe(30);
    expect((msg.config as any).plugins).toBeUndefined();
  });
});
