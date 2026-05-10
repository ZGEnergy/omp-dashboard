/**
 * Tests for `ContentViewSlot` route filtering. Multiple plugin claims
 * with distinct `route` values coexist; the slot consumer renders the
 * one matching the active route. See change:
 * pluginize-flows-via-registry.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  ContentViewSlot,
  PluginContextProvider,
  createSlotRegistry,
} from "../index.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function fakeSession(id = "s1"): DashboardSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { id, cwd: "/tmp", source: "user", status: "active", startedAt: new Date().toISOString() } as any;
}

function ClaimA() {
  return <div data-testid="claim-a">A</div>;
}
function ClaimB() {
  return <div data-testid="claim-b">B</div>;
}
function ClaimDefault() {
  return <div data-testid="claim-default">DEFAULT</div>;
}

function makeRegistryWith(claims: Array<{ route?: string; Component: React.ComponentType; pluginId?: string; priority?: number }>) {
  const reg = createSlotRegistry();
  for (const c of claims) {
    reg.addClaim({
      pluginId: c.pluginId ?? "test",
      priority: c.priority ?? 100,
      slot: "content-view",
      Component: c.Component,
      route: c.route,
    });
  }
  return reg;
}

describe("ContentViewSlot route filtering", () => {
  afterEach(() => cleanup());

  it("renders only the claim whose route matches", () => {
    const reg = makeRegistryWith([
      { route: "alpha", Component: ClaimA, pluginId: "plugin-a" },
      { route: "beta", Component: ClaimB, pluginId: "plugin-b" },
    ]);
    const { queryByTestId } = render(
      <PluginContextProvider registry={reg}>
        <ContentViewSlot
          session={fakeSession()}
          routeParams={{ route: "alpha" }}
          onClose={() => {}}
        />
      </PluginContextProvider>,
    );
    expect(queryByTestId("claim-a")).not.toBeNull();
    expect(queryByTestId("claim-b")).toBeNull();
  });

  it("matches claims without a route to the empty/default route", () => {
    const reg = makeRegistryWith([
      { route: "alpha", Component: ClaimA, pluginId: "plugin-a" },
      { Component: ClaimDefault, pluginId: "plugin-default" },
    ]);
    const { queryByTestId } = render(
      <PluginContextProvider registry={reg}>
        <ContentViewSlot
          session={fakeSession()}
          routeParams={{}}
          onClose={() => {}}
        />
      </PluginContextProvider>,
    );
    expect(queryByTestId("claim-default")).not.toBeNull();
    expect(queryByTestId("claim-a")).toBeNull();
  });

  it("renders nothing when no claim matches the active route", () => {
    const reg = makeRegistryWith([
      { route: "alpha", Component: ClaimA, pluginId: "plugin-a" },
    ]);
    const { container } = render(
      <PluginContextProvider registry={reg}>
        <ContentViewSlot
          session={fakeSession()}
          routeParams={{ route: "no-such-route" }}
          onClose={() => {}}
        />
      </PluginContextProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("resolves multiple claims for the same route by priority order", () => {
    const reg = makeRegistryWith([
      { route: "shared", Component: ClaimA, pluginId: "plugin-a", priority: 200 },
      { route: "shared", Component: ClaimB, pluginId: "plugin-b", priority: 100 },
    ]);
    const { queryByTestId } = render(
      <PluginContextProvider registry={reg}>
        <ContentViewSlot
          session={fakeSession()}
          routeParams={{ route: "shared" }}
          onClose={() => {}}
        />
      </PluginContextProvider>,
    );
    // Lower priority value = higher rank = rendered first per slot-registry sort.
    expect(queryByTestId("claim-b")).not.toBeNull();
    expect(queryByTestId("claim-a")).toBeNull();
  });
});
