/**
 * REST routes for browser-based pi provider authentication.
 */
import type { FastifyInstance } from "fastify";
import {
  getProviderHandler,
  generatePKCE,
  generateState,
  type AuthCodeHandler,
  type DeviceCodeHandler,
  type PKCEPair,
} from "../provider-auth-handlers.js";
import {
  writeCredential,
  removeCredential,
  getAuthStatus,
  getOAuthProvidersMeta,
  type ApiKeyCredential,
} from "../provider-auth-storage.js";
import type { PiGateway } from "../pi-gateway.js";

// ── In-memory flow store (short-lived PKCE + device code state) ──────────────

interface AuthCodeFlow {
  providerId: string;
  pkce: PKCEPair;
  state: string;
  redirectUri: string;
  createdAt: number;
}

interface DeviceCodeFlow {
  providerId: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
  extra?: Record<string, unknown>;
  status: "pending" | "complete" | "error" | "expired";
  error?: string;
  createdAt: number;
}

const authCodeFlows = new Map<string, AuthCodeFlow>();
const deviceCodeFlows = new Map<string, DeviceCodeFlow>();

// Expire flows after 10 minutes
const FLOW_TTL_MS = 10 * 60 * 1000;

function pruneFlows() {
  const now = Date.now();
  for (const [id, f] of authCodeFlows) {
    if (now - f.createdAt > FLOW_TTL_MS) authCodeFlows.delete(id);
  }
  for (const [id, f] of deviceCodeFlows) {
    if (now - f.createdAt > FLOW_TTL_MS) deviceCodeFlows.delete(id);
  }
}

function makeFlowId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Callback HTML ────────────────────────────────────────────────────────────

function callbackHtml(params: Record<string, string | null>): string {
  const data = JSON.stringify(params);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OAuth Callback</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;}
.card{background:#1e293b;padding:40px;border-radius:12px;text-align:center;max-width:400px;}
.ok{color:#22c55e;font-size:48px;margin-bottom:16px;}</style>
</head><body><div class="card"><div class="ok">✓</div><h2>Authorization received</h2><p>This window will close automatically.</p></div>
<script>
(function(){
  var d=${data};
  try{window.opener&&window.opener.postMessage({type:"provider_oauth_callback",data:d},"*")}catch(e){}
  try{var c=new BroadcastChannel("provider_oauth_callback");c.postMessage(d);c.close()}catch(e){}
  try{localStorage.setItem("provider_oauth_callback",JSON.stringify(Object.assign({},d,{ts:Date.now()})))}catch(e){}
  setTimeout(function(){window.close();},1500);
})();
</script></body></html>`;
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerProviderAuthRoutes(
  fastify: FastifyInstance,
  deps: { piGateway: PiGateway },
) {
  const { piGateway } = deps;

  function notifyBridges() {
    piGateway.broadcast({ type: "credentials_updated" });
  }

  // List OAuth providers
  fastify.get("/api/provider-auth/providers", async () => {
    return getOAuthProvidersMeta();
  });

  // Full status (OAuth + API key)
  fastify.get("/api/provider-auth/status", async () => {
    return getAuthStatus();
  });

  // Start auth-code flow
  fastify.post<{ Body: { provider: string } }>("/api/provider-auth/authorize", async (request, reply) => {
    pruneFlows();
    const { provider } = request.body ?? {};
    const handler = getProviderHandler(provider);
    if (!handler || handler.flowType !== "auth_code") {
      return reply.code(400).send({ error: `Unknown auth-code provider: ${provider}` });
    }
    const h = handler as AuthCodeHandler;
    const pkce = await generatePKCE();
    const state = generateState();
    const port = (request.server as any).addresses?.()[0]?.port ?? 9998;
    const redirectUri = `http://localhost:${port}/api/provider-auth/callback/${provider}`;
    const authUrl = h.buildAuthUrl(redirectUri, state, pkce);
    const flowId = makeFlowId();
    authCodeFlows.set(flowId, { providerId: provider, pkce, state, redirectUri, createdAt: Date.now() });
    return { flowId, authUrl };
  });

  // OAuth callback (serves HTML that relays code back to opener)
  fastify.get<{ Params: { provider: string }; Querystring: Record<string, string> }>(
    "/api/provider-auth/callback/:provider",
    async (request, reply) => {
      const q = request.query;
      reply.type("text/html").send(callbackHtml({
        code: q.code ?? null,
        state: q.state ?? null,
        error: q.error ?? null,
        error_description: q.error_description ?? null,
      }));
    },
  );

  // Exchange code for tokens
  fastify.post<{ Body: { flowId: string; code: string; state?: string } }>(
    "/api/provider-auth/exchange",
    async (request, reply) => {
      const { flowId, code, state } = request.body ?? {};
      const flow = authCodeFlows.get(flowId);
      if (!flow) return reply.code(400).send({ error: "Invalid or expired flow" });
      authCodeFlows.delete(flowId);

      // Validate state if provided
      if (state && state !== flow.state) {
        return reply.code(400).send({ error: "State mismatch" });
      }

      const handler = getProviderHandler(flow.providerId) as AuthCodeHandler;
      try {
        const credential = await handler.exchangeCode(code, flow.redirectUri, flow.pkce, flow.state);
        writeCredential(flow.providerId, credential);
        notifyBridges();
        return { ok: true, provider: flow.providerId };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Start device-code flow
  fastify.post<{ Body: { provider: string; enterpriseDomain?: string } }>(
    "/api/provider-auth/device-code",
    async (request, reply) => {
      pruneFlows();
      const { provider, enterpriseDomain } = request.body ?? {};
      const handler = getProviderHandler(provider);
      if (!handler || handler.flowType !== "device_code") {
        return reply.code(400).send({ error: `Unknown device-code provider: ${provider}` });
      }
      const h = handler as DeviceCodeHandler;
      try {
        const dc = await h.requestDeviceCode(enterpriseDomain);
        const flowId = makeFlowId();
        deviceCodeFlows.set(flowId, {
          providerId: provider,
          deviceCode: dc.deviceCode,
          interval: dc.interval,
          expiresIn: dc.expiresIn,
          extra: dc.extra,
          status: "pending",
          createdAt: Date.now(),
        });
        // Start polling in background
        pollDeviceCode(flowId, h).catch(() => {});
        return {
          flowId,
          userCode: dc.userCode,
          verificationUri: dc.verificationUri,
          expiresIn: dc.expiresIn,
          interval: dc.interval,
        };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Poll device-code status
  fastify.get<{ Params: { flowId: string } }>(
    "/api/provider-auth/device-status/:flowId",
    async (request, reply) => {
      const flow = deviceCodeFlows.get(request.params.flowId);
      if (!flow) return reply.code(404).send({ error: "Unknown flow" });
      return { status: flow.status, error: flow.error };
    },
  );

  // Save API key
  fastify.put<{ Body: { provider: string; key: string } }>(
    "/api/provider-auth/api-key",
    async (request, reply) => {
      const { provider, key } = request.body ?? {};
      if (!provider || !key) return reply.code(400).send({ error: "provider and key required" });
      const credential: ApiKeyCredential = { type: "api_key", key };
      writeCredential(provider, credential);
      notifyBridges();
      return { ok: true };
    },
  );

  // Remove credential
  fastify.delete<{ Params: { provider: string } }>(
    "/api/provider-auth/:provider",
    async (request) => {
      removeCredential(request.params.provider);
      notifyBridges();
      return { ok: true };
    },
  );

  // ── Device-code background poller ──────────────────────────────────────────

  async function pollDeviceCode(flowId: string, handler: DeviceCodeHandler) {
    const flow = deviceCodeFlows.get(flowId);
    if (!flow) return;
    try {
      const credential = await handler.pollForToken(
        flow.deviceCode, flow.interval, flow.expiresIn, flow.extra,
      );
      writeCredential(flow.providerId, credential);
      notifyBridges();
      flow.status = "complete";
    } catch (err: any) {
      flow.status = err.message?.includes("expired") ? "expired" : "error";
      flow.error = err.message;
    }
  }
}
