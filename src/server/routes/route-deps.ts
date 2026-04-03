/**
 * Shared dependency types for route modules.
 * Each route module receives only the deps it needs.
 */
import type { SessionManager } from "../memory-session-manager.js";
import type { EventStore } from "../memory-event-store.js";
import type { PreferencesStore } from "../preferences-store.js";
import type { MetaPersistence } from "../meta-persistence.js";
import type { DirectoryService } from "../directory-service.js";
import type { ServerConfig } from "../server.js";

export interface RouteDeps {
  sessionManager: SessionManager;
  eventStore: EventStore;
  preferencesStore: PreferencesStore;
  metaPersistence: MetaPersistence;
  directoryService: DirectoryService;
  config: ServerConfig;
}
