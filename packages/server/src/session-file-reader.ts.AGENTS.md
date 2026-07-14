# session-file-reader.ts — index

Standalone JSONL session reader. Exports `SessionEntry`, `loadSessionEntries(filePath)` (leaf→root branch order via parentId), `createBranchedSessionFile(sessionFilePath, targetEntryId)` for fork-from-message. Linear fallback when no tree structure.
