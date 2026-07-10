/**
 * Repo-level lint test: the push dispatcher MUST NOT be awaited in
 * `event-wiring.ts`. Awaiting it would make transport latency/failure block the
 * WebSocket fan-out to connected browsers.
 * Spec: `Requirement: Fire-and-forget dispatch` → Scenario: Lint enforcement.
 * See change: add-server-push-notifications.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const eventWiringPath = path.join(here, "..", "event-wiring.ts");

describe("push dispatcher fire-and-forget lint", () => {
  it("event-wiring.ts does not await the push dispatcher", () => {
    const source = fs.readFileSync(eventWiringPath, "utf-8");
    expect(source).not.toMatch(/await\s+pushDispatcher/);
    expect(source).not.toMatch(/await\s+deps\.pushDispatcher/);
    expect(source).not.toMatch(/await\s+pushDispatcher\?\.fanout/);
  });

  it("event-wiring.ts calls pushDispatcher?.fanout (wired in)", () => {
    const source = fs.readFileSync(eventWiringPath, "utf-8");
    expect(source).toMatch(/pushDispatcher\?\.fanout\(/);
  });
});
