/**
 * End-to-end smoke test for the model proxy using Google Gemini Flash (task 16.1).
 *
 * Skipped by default in CI. Enable with:
 *   E2E_MODEL_PROXY=1 GEMINI_API_KEY=<key> npm test -- model-proxy-google-flash
 *
 * Steps:
 *   1. Boot dashboard server on a random port
 *   2. POST /api/model-proxy/api-keys → get a proxy key
 *   3. GET /v1/models with the key → expect ≥1 model
 *   4. If google/gemini-2.5-flash* model present:
 *      a. POST /v1/chat/completions non-streaming → 200 + non-empty assistant text
 *      b. POST /v1/chat/completions streaming → SSE chunks with delta.content
 *      c. POST /v1/messages (Anthropic shape) → 200
 *   5. Delete the API key → re-use → expect 401
 *   6. Shutdown
 *
 * See change: add-dashboard-model-proxy, task 16.2.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, type TestServerHandle } from "../../test-support/test-server.js";

const ENABLED = process.env["E2E_MODEL_PROXY"] === "1";

let handle: TestServerHandle | null = null;
let httpPort: number;
let proxyKey: string;

beforeAll(async () => {
  if (!ENABLED) return;
  handle = await createTestServer();
  httpPort = handle.httpPort;
});

afterAll(async () => {
  if (handle) {
    try { await handle.stop(); } catch {}
    handle = null;
  }
});

describe.skipIf(!ENABLED)("model-proxy e2e: google gemini flash", () => {
  it("creates a proxy API key", async () => {
    const res = await fetch(`http://localhost:${httpPort}/api/model-proxy/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "e2e-test" }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    proxyKey = body.data.key;
    expect(proxyKey).toMatch(/^pi-proxy-/);
  });

  it("GET /v1/models returns at least 1 model", async () => {
    const res = await fetch(`http://localhost:${httpPort}/v1/models`, {
      headers: { authorization: `Bearer ${proxyKey}` },
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    expect(body.object).toBe("list");
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /v1/chat/completions non-streaming with google flash", async () => {
    const modelsRes = await fetch(`http://localhost:${httpPort}/v1/models`, {
      headers: { authorization: `Bearer ${proxyKey}` },
    });
    const modelsBody = await modelsRes.json() as any;
    const flashModel = modelsBody.data.find((m: any) =>
      m.id.includes("google/gemini-2.5-flash") || m.id.includes("gemini-2.5-flash"),
    );

    if (!flashModel) {
      console.warn("No google/gemini-2.5-flash model available — skipping");
      return;
    }

    const res = await fetch(`http://localhost:${httpPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${proxyKey}`,
      },
      body: JSON.stringify({
        model: flashModel.id,
        messages: [{ role: "user", content: "Reply with just the word: ok" }],
        stream: false,
        max_tokens: 20,
      }),
    });

    expect(res.ok).toBe(true);
    const body = await res.json() as any;
    const content = body.choices?.[0]?.message?.content ?? "";
    expect(content.length).toBeGreaterThan(0);
  });

  it("POST /v1/chat/completions streaming with google flash", async () => {
    const modelsRes = await fetch(`http://localhost:${httpPort}/v1/models`, {
      headers: { authorization: `Bearer ${proxyKey}` },
    });
    const modelsBody = await modelsRes.json() as any;
    const flashModel = modelsBody.data.find((m: any) =>
      m.id.includes("google/gemini-2.5-flash") || m.id.includes("gemini-2.5-flash"),
    );

    if (!flashModel) {
      console.warn("No google/gemini-2.5-flash model available — skipping");
      return;
    }

    const res = await fetch(`http://localhost:${httpPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${proxyKey}`,
      },
      body: JSON.stringify({
        model: flashModel.id,
        messages: [{ role: "user", content: "Reply with just the word: ok" }],
        stream: true,
        max_tokens: 20,
      }),
    });

    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    // Should contain at least one data chunk
    expect(text).toContain("data:");
    // Should end with [DONE]
    expect(text).toContain("[DONE]");
  });

  it("POST /v1/messages (Anthropic shape) with google flash", async () => {
    const modelsRes = await fetch(`http://localhost:${httpPort}/v1/models`, {
      headers: { authorization: `Bearer ${proxyKey}` },
    });
    const modelsBody = await modelsRes.json() as any;
    const flashModel = modelsBody.data.find((m: any) =>
      m.id.includes("google/gemini-2.5-flash") || m.id.includes("gemini-2.5-flash"),
    );

    if (!flashModel) {
      console.warn("No google/gemini-2.5-flash model available — skipping");
      return;
    }

    const res = await fetch(`http://localhost:${httpPort}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${proxyKey}`,
      },
      body: JSON.stringify({
        model: flashModel.id,
        messages: [{ role: "user", content: "Reply with just the word: ok" }],
        max_tokens: 20,
      }),
    });

    expect(res.ok).toBe(true);
  });

  it("deleted API key returns 401 on re-use", async () => {
    // Revoke the key first
    const keysRes = await fetch(`http://localhost:${httpPort}/api/model-proxy/api-keys`);
    const keysBody = await keysRes.json() as any;
    const keyId = keysBody.data?.keys?.[0]?.id;
    if (!keyId) return;

    await fetch(`http://localhost:${httpPort}/api/model-proxy/api-keys/${keyId}/revoke`, {
      method: "POST",
    });

    // Re-use should now fail
    const res = await fetch(`http://localhost:${httpPort}/v1/models`, {
      headers: { authorization: `Bearer ${proxyKey}` },
    });
    expect(res.status).toBe(401);
  });
});
