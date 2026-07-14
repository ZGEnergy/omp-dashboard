# use-editors.ts — index

React hook fetching + caching detected editors per unique cwd. Exports `EditorMap`, `useEditors(cwds)` → `Map<cwd, DetectedEditor[]>`. Memoizes on sorted-unique cwdKey; no-op fetch when non-localhost (`isLocalhost()` guard). Delegates fetch to `fetchEditors`.
