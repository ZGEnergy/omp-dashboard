/* Lifted from BlackBeltTechnology/pi-model-proxy@179d450, MIT licensed.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 */
import type { AnthropicMessagesRequest, AnthropicMessage, AnthropicContentBlock, AnthropicTool } from "./types.js";

/**
 * Convert Anthropic Messages request into pi-ai Context.
 */
export function convertAnthropicMessages(request: AnthropicMessagesRequest): { systemPrompt?: string; messages: any[] } {
  const systemPrompt = extractSystemPrompt(request.system);
  const messages: any[] = [];

  for (const msg of request.messages) {
    if (msg.role === "user") {
      messages.push(...convertUserMessage(msg));
    } else if (msg.role === "assistant") {
      messages.push(convertAssistantMessage(msg));
    }
  }

  return { systemPrompt: systemPrompt || undefined, messages };
}

export function convertAnthropicTools(tools: AnthropicTool[]): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    parameters: t.input_schema || { type: "object", properties: {} },
  }));
}

function extractSystemPrompt(system: string | AnthropicContentBlock[] | undefined): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  return (system as any[])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n") || undefined;
}

function convertUserMessage(msg: AnthropicMessage): any[] {
  if (typeof msg.content === "string") {
    return [{ role: "user", content: msg.content, timestamp: Date.now() }];
  }

  const results: any[] = [];
  const userParts: any[] = [];

  for (const block of msg.content as AnthropicContentBlock[]) {
    if (block.type === "text") {
      userParts.push({ type: "text", text: (block as any).text });
    } else if (block.type === "image") {
      userParts.push({
        type: "image",
        mimeType: (block as any).source.media_type,
        data: (block as any).source.data,
      });
    } else if (block.type === "tool_result") {
      if (userParts.length > 0) {
        results.push({
          role: "user",
          content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : [...userParts],
          timestamp: Date.now(),
        });
        userParts.length = 0;
      }
      const toolBlock = block as any;
      const toolContent = typeof toolBlock.content === "string"
        ? toolBlock.content
        : Array.isArray(toolBlock.content)
          ? toolBlock.content.map((b: any) => b.text).join("")
          : "";
      results.push({
        role: "toolResult",
        toolCallId: toolBlock.tool_use_id,
        toolName: "",
        content: [{ type: "text", text: toolContent }],
        isError: toolBlock.is_error || false,
        timestamp: Date.now(),
      });
    }
  }

  if (userParts.length > 0) {
    results.push({
      role: "user",
      content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : [...userParts],
      timestamp: Date.now(),
    });
  }

  if (results.length === 0) {
    results.push({ role: "user", content: "", timestamp: Date.now() });
  }

  return results;
}

function convertAssistantMessage(msg: AnthropicMessage): any {
  const content: any[] = [];
  if (typeof msg.content === "string") {
    if (msg.content) content.push({ type: "text", text: msg.content });
  } else {
    for (const block of msg.content as AnthropicContentBlock[]) {
      if (block.type === "text") {
        content.push({ type: "text", text: (block as any).text });
      } else if (block.type === "tool_use") {
        const tb = block as any;
        content.push({
          type: "toolCall",
          id: tb.id,
          name: tb.name,
          arguments: tb.input,
        });
      }
    }
  }

  return {
    role: "assistant",
    content,
    api: "anthropic",
    provider: "proxy",
    model: "proxy",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
