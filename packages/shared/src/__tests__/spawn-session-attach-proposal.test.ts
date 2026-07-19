/**
 * Type-level + structural tests for the `attachProposal` field on
 * `SpawnSessionBrowserMessage`. See change:
 * add-folder-task-checker-and-spawn-attach.
 */
import { describe, expect, it } from "vitest";
import type {
  BrowserToServerMessage,
  SpawnSessionBrowserMessage,
} from "../browser-protocol.js";
import type { DashboardSession } from "../types.js";

describe("SpawnSessionBrowserMessage.attachProposal", () => {
  it("is optional — the bare-spawn payload still type-checks", () => {
    // Compile-time: omitting attachProposal is allowed.
    const bare: SpawnSessionBrowserMessage = { type: "spawn_session", cwd: "/x" };
    expect(bare.attachProposal).toBeUndefined();
    const _inUnion: BrowserToServerMessage = bare;
    void _inUnion;
  });

  it("accepts a string attachProposal when set", () => {
    const withAttach: SpawnSessionBrowserMessage = {
      type: "spawn_session",
      cwd: "/x",
      attachProposal: "add-foo",
    };
    expect(withAttach.attachProposal).toBe("add-foo");
  });

  it("JSON round-trip preserves the field", () => {
    const sent: SpawnSessionBrowserMessage = {
      type: "spawn_session",
      cwd: "/project/foo",
      attachProposal: "add-auth",
    };
    const parsed = JSON.parse(JSON.stringify(sent)) as SpawnSessionBrowserMessage;
    expect(parsed.type).toBe("spawn_session");
    expect(parsed.cwd).toBe("/project/foo");
    expect(parsed.attachProposal).toBe("add-auth");
  });

  it("JSON round-trip without the field omits it", () => {
    const sent: SpawnSessionBrowserMessage = { type: "spawn_session", cwd: "/x" };
    const parsed = JSON.parse(JSON.stringify(sent)) as SpawnSessionBrowserMessage;
    expect("attachProposal" in parsed).toBe(false);
  });
});

describe("SpawnSessionBrowserMessage.advisor", () => {
  it("preserves an enabled advisor flag through JSON", () => {
    const enabled: SpawnSessionBrowserMessage = {
      type: "spawn_session",
      cwd: "/repo",
      advisor: true,
    };

    expect(JSON.parse(JSON.stringify(enabled))).toMatchObject({ advisor: true });
  });

  it("omits an absent advisor flag from JSON", () => {
    const defaulted: SpawnSessionBrowserMessage = {
      type: "spawn_session",
      cwd: "/repo",
    };

    expect(JSON.parse(JSON.stringify(defaulted))).not.toHaveProperty("advisor");
  });

  it("projects enabled advisor metadata onto dashboard sessions", () => {
    const session: DashboardSession = {
      id: "session-1",
      cwd: "/repo",
      source: "dashboard",
      status: "idle",
      startedAt: Date.now(),
      advisor: true,
    };

    expect(session.advisor).toBe(true);
  });
});
