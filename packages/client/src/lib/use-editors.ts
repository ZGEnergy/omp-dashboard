/**
 * React hook to fetch and cache detected editors per unique cwd.
 */
import { useState, useEffect, useMemo } from "react";
import { fetchEditors, isLocalhost, type DetectedEditor } from "./editor-api.js";

/** Map from cwd → detected editors */
export type EditorMap = Map<string, DetectedEditor[]>;

export function useEditors(cwds: string[]): EditorMap {
  const [editorMap, setEditorMap] = useState<EditorMap>(new Map());

  // Stable key for the cwds array
  const cwdKey = useMemo(() => [...new Set(cwds)].sort().join("\n"), [cwds]);

  useEffect(() => {
    if (!isLocalhost()) return;

    const uniqueCwds = [...new Set(cwds)];
    let cancelled = false;

    async function detect() {
      const results = new Map<string, DetectedEditor[]>();
      await Promise.all(
        uniqueCwds.map(async (cwd) => {
          const editors = await fetchEditors(cwd);
          results.set(cwd, editors);
        })
      );
      if (!cancelled) {
        setEditorMap(results);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, [cwdKey]);

  return editorMap;
}
