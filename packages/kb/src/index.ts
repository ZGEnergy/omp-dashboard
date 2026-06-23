// Public API barrel for @blackbelt-technology/pi-dashboard-kb (Phase 1 slice).
export type {
  Chunk,
  DocType,
  FileState,
  GraphEdge,
  GraphNode,
  KbHit,
  KbStore,
  SearchOpts,
} from "./types.js";
export { chunkMarkdown } from "./chunker.js";
export type { ChunkInput, ParseResult } from "./chunker.js";
export { SqliteFtsStore } from "./sqlite-store.js";
export { indexSource } from "./indexer.js";
export type { IndexSource, IndexOptions, IndexStats } from "./indexer.js";
