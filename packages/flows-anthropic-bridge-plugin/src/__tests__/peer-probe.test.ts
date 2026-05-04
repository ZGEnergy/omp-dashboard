import { describe, expect, it } from "vitest";
import { probeAll, PEER_AM, PEER_FLOWS } from "../peer-probe.js";

function makeResolver(present: Set<string>): (spec: string) => string {
  return (spec) => {
    if (present.has(spec)) return `/fake/path/${spec}`;
    throw new Error(`Cannot find module '${spec}'`);
  };
}

describe("probeAll", () => {
  it("reports both peers ok when both resolve", () => {
    const r = probeAll({
      resolve: makeResolver(new Set([PEER_AM, PEER_FLOWS])),
    });
    expect(r.am.ok).toBe(true);
    expect(r.flows.ok).toBe(true);
    expect(r.bothPresent).toBe(true);
  });

  it("reports am missing when only flows resolves", () => {
    const r = probeAll({
      resolve: makeResolver(new Set([PEER_FLOWS])),
    });
    expect(r.am.ok).toBe(false);
    expect(r.am.reason).toMatch(/Cannot find module/);
    expect(r.flows.ok).toBe(true);
    expect(r.bothPresent).toBe(false);
  });

  it("reports flows missing when only am resolves", () => {
    const r = probeAll({
      resolve: makeResolver(new Set([PEER_AM])),
    });
    expect(r.am.ok).toBe(true);
    expect(r.flows.ok).toBe(false);
    expect(r.bothPresent).toBe(false);
  });

  it("falls back to event-listener count for pi-flows", () => {
    const r = probeAll({
      resolve: makeResolver(new Set([PEER_AM])),
      flowsListenerCount: () => 1,
    });
    expect(r.flows.ok).toBe(true);
    expect(r.bothPresent).toBe(true);
  });

  it("event-listener count of 0 does not save flows", () => {
    const r = probeAll({
      resolve: makeResolver(new Set([PEER_AM])),
      flowsListenerCount: () => 0,
    });
    expect(r.flows.ok).toBe(false);
    expect(r.bothPresent).toBe(false);
  });

  it("reports both missing when neither resolves", () => {
    const r = probeAll({
      resolve: makeResolver(new Set()),
    });
    expect(r.am.ok).toBe(false);
    expect(r.flows.ok).toBe(false);
    expect(r.bothPresent).toBe(false);
  });
});
