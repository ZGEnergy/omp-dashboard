/**
 * Demo plugin client entry.
 * Fixture for dashboard-plugin-runtime end-to-end tests.
 * DO NOT use in production.
 */
import React, { useState } from "react";
import { usePluginConfig, usePluginSend } from "@blackbelt-technology/dashboard-plugin-runtime/context";

export interface DemoConfig {
  greeting: string;
  count: number;
}

/**
 * DemoSettings — rendered in the General tab of SettingsPanel.
 */
export function DemoSettings() {
  const config = usePluginConfig<DemoConfig>();
  const send = usePluginSend();
  const [greeting, setGreeting] = useState(config.greeting ?? "");
  const [count, setCount] = useState(String(config.count ?? 0));

  return (
    <div
      data-testid="demo-settings"
      style={{ border: "1px dashed #555", padding: "8px", borderRadius: "4px" }}
    >
      <div style={{ fontSize: "11px", color: "#999", marginBottom: "4px" }}>
        Demo Plugin (fixture — dev/test only)
      </div>
      <label style={{ display: "block", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px" }}>Greeting</span>
        <input
          data-testid="demo-greeting"
          type="text"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          style={{ marginLeft: "8px", fontSize: "12px" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px" }}>Count</span>
        <input
          data-testid="demo-count"
          type="number"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          style={{ marginLeft: "8px", fontSize: "12px" }}
        />
      </label>
      <button
        data-testid="demo-save"
        onClick={() =>
          send({
            type: "plugin_config_write",
            id: "demo",
            config: { greeting, count: parseInt(count, 10) || 0 },
          })
        }
        style={{ fontSize: "12px", padding: "2px 8px" }}
      >
        Save
      </button>
    </div>
  );
}

/**
 * DemoToolRenderer — renders any tool_call with toolName "DashboardDemo".
 */
export function DemoToolRenderer({
  toolName,
  toolInput,
}: {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
}) {
  return (
    <div
      data-testid="demo-tool-renderer"
      style={{
        background: "#1a3a1a",
        border: "1px solid #4a9a4a",
        borderRadius: "4px",
        padding: "8px",
        fontFamily: "monospace",
        fontSize: "12px",
      }}
    >
      <span style={{ color: "#4a9a4a" }}>✓ DemoPlugin</span>{" "}
      <span style={{ color: "#ccc" }}>{toolName}</span>
      {Object.keys(toolInput).length > 0 && (
        <pre style={{ margin: "4px 0 0 0", color: "#aaa" }}>
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      )}
    </div>
  );
}
