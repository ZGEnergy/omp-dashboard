/**
 * provide/consume cross-plugin service seam on ServerPluginContext.
 *
 * The host owns ONE registry Map shared across every plugin context; a value
 * provided through one context is consumable through another (modeling
 * provider plugin → dependent plugin). Absent names return undefined, never
 * throw. See change: register-plugin-automation-events.
 */
import { describe, it, expect } from "vitest";
import { createServerPluginContext, type ServerContextDeps } from "../server/server-context.js";

function depsWithSharedRegistry(): ServerContextDeps {
  const registry = new Map<string, unknown>();
  return {
    fastify: {} as ServerContextDeps["fastify"],
    sessionManager: { listActive: () => [], listAll: () => [], getSession: () => undefined },
    eventStore: { getEvents: () => [], getLatestEvent: () => undefined },
    broadcastToSubscribers: () => {},
    registerPiHandler: () => {},
    registerBrowserHandler: () => {},
    onEvent: () => () => {},
    sendToSession: () => true,
    spawnSession: async () => ({ success: true }),
    abortSession: () => true,
    provide: (name, value) => { registry.set(name, value); },
    consume: <T = unknown>(name: string) => registry.get(name) as T | undefined,
    getPluginConfig: () => ({}),
    updatePluginConfig: async () => {},
  };
}

describe("ServerPluginContext provide/consume", () => {
  it("a value provided by one plugin context is consumable by another", () => {
    const deps = depsWithSharedRegistry();
    const provider = createServerPluginContext(deps, "automation");
    const consumer = createServerPluginContext(deps, "flows");

    const service = { register: () => {} };
    provider.provide("automation.action-registry", service);

    expect(consumer.consume("automation.action-registry")).toBe(service);
  });

  it("consume returns undefined for an absent name without throwing", () => {
    const deps = depsWithSharedRegistry();
    const ctx = createServerPluginContext(deps, "flows");
    expect(() => ctx.consume("absent-service")).not.toThrow();
    expect(ctx.consume("absent-service")).toBeUndefined();
  });

  it("provide is last-write-wins under the same name", () => {
    const deps = depsWithSharedRegistry();
    const ctx = createServerPluginContext(deps, "automation");
    ctx.provide("svc", 1);
    ctx.provide("svc", 2);
    expect(ctx.consume<number>("svc")).toBe(2);
  });
});
