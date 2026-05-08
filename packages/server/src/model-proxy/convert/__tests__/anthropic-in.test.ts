/* Ported from BlackBeltTechnology/pi-model-proxy@179d450 test suite.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 */
import { describe, it, expect } from "vitest";
import { convertAnthropicMessages, convertAnthropicTools } from "../anthropic-in.js";

describe("convertAnthropicMessages", () => {
  it("string system prompt", () => {
    const req = { system: "You are helpful.", messages: [{ role: "user", content: "hi" }] };
    const { systemPrompt, messages } = convertAnthropicMessages(req as any);
    expect(systemPrompt).toBe("You are helpful.");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("array system prompt extracted as text", () => {
    const req = {
      system: [{ type: "text", text: "Part 1" }, { type: "text", text: "Part 2" }],
      messages: [],
    };
    const { systemPrompt } = convertAnthropicMessages(req as any);
    expect(systemPrompt).toBe("Part 1\nPart 2");
  });

  it("no system prompt", () => {
    const req = { messages: [{ role: "user", content: "hi" }] };
    const { systemPrompt } = convertAnthropicMessages(req as any);
    expect(systemPrompt).toBeUndefined();
  });

  it("string user message", () => {
    const req = { messages: [{ role: "user", content: "hello" }] };
    const { messages } = convertAnthropicMessages(req as any);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("hello");
  });

  it("user message with text content blocks", () => {
    const req = {
      messages: [
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ],
    };
    const { messages } = convertAnthropicMessages(req as any);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("hello");
  });

  it("user message with image block", () => {
    const req = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", source: { media_type: "image/png", data: "abc123" } },
          ],
        },
      ],
    };
    const { messages } = convertAnthropicMessages(req as any);
    expect(Array.isArray(messages[0].content)).toBe(true);
    const imgPart = (messages[0].content as any[]).find((p: any) => p.type === "image");
    expect(imgPart?.mimeType).toBe("image/png");
  });

  it("tool_result block splits into toolResult message", () => {
    const req = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu1",
              content: "result",
              is_error: false,
            },
          ],
        },
      ],
    };
    const { messages } = convertAnthropicMessages(req as any);
    const toolResult = messages.find((m: any) => m.role === "toolResult");
    expect(toolResult).toBeDefined();
    expect(toolResult.toolCallId).toBe("tu1");
    expect(toolResult.content[0].text).toBe("result");
  });

  it("assistant message with text", () => {
    const req = {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hey there" },
      ],
    };
    const { messages } = convertAnthropicMessages(req as any);
    const assistant = messages.find((m: any) => m.role === "assistant");
    expect(assistant).toBeDefined();
    const textPart = assistant.content.find((c: any) => c.type === "text");
    expect(textPart?.text).toBe("hey there");
  });

  it("assistant message with tool_use block", () => {
    const req = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu1", name: "my_fn", input: { x: 1 } },
          ],
        },
      ],
    };
    const { messages } = convertAnthropicMessages(req as any);
    const toolCall = messages[0].content.find((c: any) => c.type === "toolCall");
    expect(toolCall).toBeDefined();
    expect(toolCall.name).toBe("my_fn");
    expect(toolCall.arguments).toEqual({ x: 1 });
  });
});

describe("convertAnthropicTools", () => {
  it("converts tool definitions", () => {
    const tools = convertAnthropicTools([
      { name: "search", description: "Search the web", input_schema: { type: "object", properties: {} } },
    ]);
    expect(tools[0].name).toBe("search");
    expect(tools[0].description).toBe("Search the web");
  });

  it("handles missing description", () => {
    const tools = convertAnthropicTools([{ name: "no_desc" } as any]);
    expect(tools[0].description).toBe("");
  });
});
