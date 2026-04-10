import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the storage and handlers to avoid touching real auth.json
vi.mock("../provider-auth-storage.js", () => ({
  getOAuthProvidersMeta: () => [
    { id: "anthropic", name: "Anthropic", flowType: "auth_code" },
    { id: "github-copilot", name: "GitHub Copilot", flowType: "device_code" },
  ],
  getAuthStatus: () => [
    { id: "anthropic", name: "Anthropic", flowType: "auth_code", authenticated: false },
    { id: "github-copilot", name: "GitHub Copilot", flowType: "device_code", authenticated: true, expires: Date.now() + 86400000 },
  ],
  writeCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

import Fastify from "fastify";
import { registerProviderAuthRoutes } from "../routes/provider-auth-routes.js";

function createMockPiGateway() {
  return {
    broadcast: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    sendToSession: vi.fn(),
    connectionCount: () => 0,
    findSessionByCwd: () => undefined,
    getConnectedSessionIds: () => [],
    isSessionConnected: () => false,
  } as any;
}

describe("provider-auth-routes", () => {
  let app: ReturnType<typeof Fastify>;
  let piGateway: ReturnType<typeof createMockPiGateway>;

  beforeEach(async () => {
    app = Fastify();
    piGateway = createMockPiGateway();
    registerProviderAuthRoutes(app, { piGateway });
    await app.ready();
  });

  it("GET /api/provider-auth/providers returns OAuth provider list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-auth/providers" });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("anthropic");
  });

  it("GET /api/provider-auth/status returns all provider statuses", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-auth/status" });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data).toHaveLength(2);
    expect(data[0].authenticated).toBe(false);
    expect(data[1].authenticated).toBe(true);
  });

  it("POST /api/provider-auth/authorize returns authUrl for valid provider", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-auth/authorize",
      payload: { provider: "anthropic" },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.flowId).toBeTruthy();
    expect(data.authUrl).toContain("claude.ai/oauth/authorize");
  });

  it("POST /api/provider-auth/authorize rejects unknown provider", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-auth/authorize",
      payload: { provider: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/provider-auth/exchange rejects invalid flowId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-auth/exchange",
      payload: { flowId: "nonexistent", code: "abc" },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.payload);
    expect(data.error).toContain("Invalid or expired flow");
  });

  it("PUT /api/provider-auth/api-key saves and notifies", async () => {
    const { writeCredential } = await import("../provider-auth-storage.js");
    const res = await app.inject({
      method: "PUT",
      url: "/api/provider-auth/api-key",
      payload: { provider: "openai", key: "sk-test" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).ok).toBe(true);
    expect(writeCredential).toHaveBeenCalledWith("openai", { type: "api_key", key: "sk-test" });
    expect(piGateway.broadcast).toHaveBeenCalledWith({ type: "credentials_updated" });
  });

  it("DELETE /api/provider-auth/:provider removes and notifies", async () => {
    const { removeCredential } = await import("../provider-auth-storage.js");
    const res = await app.inject({
      method: "DELETE",
      url: "/api/provider-auth/anthropic",
    });
    expect(res.statusCode).toBe(200);
    expect(removeCredential).toHaveBeenCalledWith("anthropic");
    expect(piGateway.broadcast).toHaveBeenCalledWith({ type: "credentials_updated" });
  });

  it("GET /api/provider-auth/callback/:provider returns HTML with postMessage relay", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/provider-auth/callback/anthropic?code=testcode&state=teststate",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.payload).toContain("provider_oauth_callback");
    expect(res.payload).toContain("testcode");
    expect(res.payload).toContain("postMessage");
    expect(res.payload).toContain("BroadcastChannel");
    expect(res.payload).toContain("localStorage");
  });

  it("POST /api/provider-auth/device-code rejects auth_code provider", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-auth/device-code",
      payload: { provider: "anthropic" },
    });
    expect(res.statusCode).toBe(400);
  });
});
