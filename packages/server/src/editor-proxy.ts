/**
 * Dynamic reverse proxy for code-server instances.
 * Uses @fastify/reply-from for HTTP and raw TCP piping for WebSocket.
 */
import type { FastifyInstance } from "fastify";
import type { EditorManager } from "./editor-manager.js";
import net from "node:net";

export function registerEditorProxy(fastify: FastifyInstance, editorManager: EditorManager) {
  // Register reply-from plugin for proxying (no base — full URL passed per-request)
  fastify.register(import("@fastify/reply-from"));

  function resolveEditor(url: string) {
    // Match /editor/:id and capture everything after (path + query string)
    const match = url.match(/^\/editor\/([^/?]+)(.*)$/);
    if (!match) return null;
    const id = match[1];
    const inst = editorManager.get(id);
    if (!inst || inst.status !== "ready") return null;
    const rest = match[2] || "";
    // Ensure subPath starts with / (handles ?query without path)
    const subPath = rest.startsWith("/") || rest.startsWith("?") 
      ? (rest.startsWith("?") ? `/${rest}` : rest)
      : "/";
    return { inst, subPath };
  }

  // Proxy /editor/:id/* (with sub-path)
  fastify.all<{ Params: { id: string; "*": string } }>(
    "/editor/:id/*",
    (request, reply) => {
      const resolved = resolveEditor(request.url);
      if (!resolved) {
        return reply.code(404).send({ error: "Editor instance not found or not ready" });
      }
      const { inst, subPath } = resolved;
      const editorPrefix = `/editor/${request.params.id}`;
      reply.from(`http://127.0.0.1:${inst.port}${subPath}`, {
        rewriteRequestHeaders: (_req, headers) => {
          headers.host = `127.0.0.1:${inst.port}`;
          return headers;
        },
        rewriteHeaders: (headers) => {
          // Rewrite Location headers to include the editor prefix
          const location = headers.location;
          if (typeof location === "string") {
            if (location.startsWith("./")) {
              headers.location = `.${location.slice(1)}`;
            } else if (location.startsWith("/")) {
              headers.location = `${editorPrefix}${location}`;
            }
          }
          return headers;
        },
      });
    },
  );

  // Proxy /editor/:id (no sub-path — handles code-server redirects)
  fastify.all<{ Params: { id: string } }>(
    "/editor/:id",
    (request, reply) => {
      const resolved = resolveEditor(request.url);
      if (!resolved) {
        return reply.code(404).send({ error: "Editor instance not found or not ready" });
      }
      const { inst, subPath } = resolved;
      const editorPrefix = `/editor/${request.params.id}`;
      reply.from(`http://127.0.0.1:${inst.port}${subPath}`, {
        rewriteRequestHeaders: (_req, headers) => {
          headers.host = `127.0.0.1:${inst.port}`;
          return headers;
        },
        rewriteHeaders: (headers) => {
          const location = headers.location;
          if (typeof location === "string") {
            if (location.startsWith("./")) {
              headers.location = `${editorPrefix}/${location.slice(2)}`;
            } else if (location.startsWith("/")) {
              headers.location = `${editorPrefix}${location}`;
            }
          }
          return headers;
        },
      });
    },
  );

}

/**
 * Handle WebSocket upgrade for editor connections.
 * Called from server.ts upgrade handler.
 */
export function handleEditorUpgrade(
  editorManager: EditorManager,
  request: import("node:http").IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
) {
  const match = request.url?.match(/^\/editor\/([^/?]+)(.*)$/);
  if (!match) { socket.destroy(); return; }
  
  const id = match[1];
  const inst = editorManager.get(id);
  if (!inst || inst.status !== "ready") { socket.destroy(); return; }

  const rest = match[2] || "";
  const subPath = rest.startsWith("/") || rest.startsWith("?") 
    ? (rest.startsWith("?") ? `/${rest}` : rest)
    : "/";

  const upstream = net.connect(inst.port, "127.0.0.1", () => {
    const headers = Object.entries(request.headers)
      .filter(([k]) => !['host', 'origin'].includes(k.toLowerCase()))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");

    upstream.write(
      `${request.method} ${subPath} HTTP/1.1\r\n` +
      `Host: 127.0.0.1:${inst.port}\r\n` +
      `${headers}\r\n\r\n`
    );
    if (head.length > 0) upstream.write(head);

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
}
