/* Lifted from BlackBeltTechnology/pi-model-proxy@179d450, MIT licensed.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 *
 * Local type definitions mirroring upstream's types.ts for the convert/ module.
 * These types are used by the converter functions and map to the wire protocol
 * types in rest-api.ts. Pi-ai types are referenced via `any` since pi-ai is
 * runtime-resolved.
 */

// ── OpenAI types ────────────────────────────────────────────────────────────

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

// ── Anthropic types ─────────────────────────────────────────────────────────

export interface AnthropicMessagesRequest {
  model?: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: any;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string; [key: string]: any }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string }; [key: string]: any }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any>; [key: string]: any }
  | { type: "tool_result"; tool_use_id: string; content?: string | { type: "text"; text: string }[]; is_error?: boolean; [key: string]: any }
  | { type: "thinking"; thinking: string; [key: string]: any };

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: any;
}
