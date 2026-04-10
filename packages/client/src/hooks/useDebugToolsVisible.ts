import { useState, useCallback } from "react";

const STORAGE_KEY = "show-debug-tools";

/** Set of tool names considered "debug" — hidden by default */
export const DEBUG_TOOL_NAMES = new Set([
  "flow:list-flows",
  "flow:rediscover",
  "resources_discover",
]);

export function isDebugTool(toolName: string): boolean {
  return DEBUG_TOOL_NAMES.has(toolName);
}

export function useDebugToolsVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const update = useCallback((v: boolean) => {
    setVisible(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch { /* noop */ }
  }, []);

  return [visible, update];
}
