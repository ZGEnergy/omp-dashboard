import { describe, it, expect } from "vitest";
import {
  createSlotRegistry,
  forSession,
  forTab,
  forToolName,
  forCommand,
  type ClaimEntry,
} from "../slot-registry.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function makeClaim(
  pluginId: string,
  priority: number,
  slot: ClaimEntry["slot"] = "session-card-badge",
  extra: Partial<ClaimEntry> = {},
): ClaimEntry {
  return { pluginId, priority, slot, ...extra };
}

function fakeSession(id = "s1"): DashboardSession {
  return {
    id,
    cwd: "/home/user/repo",
    source: "tui",
    status: "active",
    startedAt: Date.now(),
  };
}

describe("createSlotRegistry", () => {
  it("returns empty array for unknown slot", () => {
    const r = createSlotRegistry();
    expect(r.getClaims("session-card-badge")).toEqual([]);
  });

  it("sorts by priority asc, then plugin id asc", () => {
    const r = createSlotRegistry();
    r.addClaim(makeClaim("z-plugin", 100));
    r.addClaim(makeClaim("a-plugin", 200));
    r.addClaim(makeClaim("m-plugin", 100));

    const claims = r.getClaims("session-card-badge");
    expect(claims.map(c => c.pluginId)).toEqual(["m-plugin", "z-plugin", "a-plugin"]);
  });

  it("sort is deterministic across two runs", () => {
    const buildRegistry = () => {
      const r = createSlotRegistry();
      r.addClaim(makeClaim("c", 50));
      r.addClaim(makeClaim("a", 100));
      r.addClaim(makeClaim("b", 100));
      return r.getClaims("session-card-badge").map(c => c.pluginId);
    };
    expect(buildRegistry()).toEqual(buildRegistry());
  });

  it("removeClaims removes all claims for that plugin", () => {
    const r = createSlotRegistry();
    r.addClaim(makeClaim("alpha", 100));
    r.addClaim(makeClaim("beta", 100));
    r.removeClaims("alpha");
    const claims = r.getClaims("session-card-badge");
    expect(claims).toHaveLength(1);
    expect(claims[0].pluginId).toBe("beta");
  });

  it("getAllClaims returns claims from all slots", () => {
    const r = createSlotRegistry();
    r.addClaim(makeClaim("a", 100, "session-card-badge"));
    r.addClaim(makeClaim("b", 100, "tool-renderer"));
    expect(r.getAllClaims()).toHaveLength(2);
  });
});

describe("forSession filter", () => {
  it("returns all claims when no predicate", () => {
    const claims = [makeClaim("a", 100), makeClaim("b", 200)];
    expect(forSession(claims, fakeSession())).toHaveLength(2);
  });

  it("filters by predicate", () => {
    const session = fakeSession();
    const claims = [
      { ...makeClaim("a", 100), predicate: (_: unknown) => true },
      { ...makeClaim("b", 200), predicate: (_: unknown) => false },
    ];
    expect(forSession(claims, session)).toHaveLength(1);
    expect(forSession(claims, session)[0].pluginId).toBe("a");
  });
});

describe("forTab filter", () => {
  it("returns claims matching tab", () => {
    const claims = [
      { ...makeClaim("a", 100, "settings-section"), tab: "general" },
      { ...makeClaim("b", 100, "settings-section"), tab: "security" },
      { ...makeClaim("c", 100, "settings-section") }, // defaults to "general"
    ];
    const generalClaims = forTab(claims, "general");
    expect(generalClaims.map(c => c.pluginId)).toContain("a");
    expect(generalClaims.map(c => c.pluginId)).toContain("c");
    expect(generalClaims.map(c => c.pluginId)).not.toContain("b");
  });
});

describe("forToolName filter", () => {
  it("returns claims matching toolName", () => {
    const claims = [
      { ...makeClaim("a", 100, "tool-renderer"), toolName: "Agent" },
      { ...makeClaim("b", 100, "tool-renderer"), toolName: "Bash" },
    ];
    const matches = forToolName(claims, "Agent");
    expect(matches).toHaveLength(1);
    expect(matches[0].pluginId).toBe("a");
  });
});

describe("forCommand filter", () => {
  it("returns claims matching command", () => {
    const claims = [
      { ...makeClaim("a", 100, "command-route"), command: "/specs" },
      { ...makeClaim("b", 100, "command-route"), command: "/archive" },
    ];
    expect(forCommand(claims, "/specs")).toHaveLength(1);
    expect(forCommand(claims, "/specs")[0].pluginId).toBe("a");
  });
});
