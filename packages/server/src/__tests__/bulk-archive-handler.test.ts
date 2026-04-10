import { describe, it, expect } from "vitest";
import type { OpenSpecBulkArchiveBrowserMessage, BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

describe("openspec_bulk_archive message type", () => {
  it("is a valid BrowserToServerMessage", () => {
    const msg: OpenSpecBulkArchiveBrowserMessage = {
      type: "openspec_bulk_archive",
      cwd: "/project/foo",
    };
    // Type-check: ensure it's assignable to the union
    const _: BrowserToServerMessage = msg;
    expect(msg.type).toBe("openspec_bulk_archive");
    expect(msg.cwd).toBe("/project/foo");
  });
});
