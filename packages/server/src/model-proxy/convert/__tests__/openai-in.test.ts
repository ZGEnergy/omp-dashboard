/* Ported from BlackBeltTechnology/pi-model-proxy@179d450 test suite.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 */
import { describe, it, expect } from "vitest";
import { convertOpenAIMessages, convertOpenAITools } from "../openai-in.js";

describe("convertOpenAIMessages", () => {
  it("plain user message", () => {
    const { systemPrompt, messages } = convertOpenAIMessages([
      { role: "user", content: "hello" },
    ]);
    expect(systemPrompt).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("hello");
  });

  it("system message extracted as systemPrompt", () => {
    const { systemPrompt, messages } = convertOpenAIMessages([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hi" },
    ]);
    expect(systemPrompt).toBe("You are helpful.");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("multiple system messages joined with newline", () => {
    const { systemPrompt } = convertOpenAIMessages([
      { role: "system", content: "Part 1." },
      { role: "system", content: "Part 2." },
    ]);
    expect(systemPrompt).toBe("Part 1.\nPart 2.");
  });

  it("assistant message with text", () => {
    const { messages } = convertOpenAIMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    const textPart = messages[1].content.find((c: any) => c.type === "text");
    expect(textPart?.text).toBe("hey");
  });

  it("assistant message with tool_calls", () => {
    const { messages } = convertOpenAIMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "my_tool", arguments: '{"x":1}' } },
        ],
      },
    ]);
    expect(messages[0].role).toBe("assistant");
    const toolCall = messages[0].content.find((c: any) => c.type === "toolCall");
    expect(toolCall).toBeDefined();
    expect(toolCall.name).toBe("my_tool");
    expect(toolCall.arguments).toEqual({ x: 1 });
    expect(toolCall.id).toBe("tc1");
  });

  it("tool result message", () => {
    const { messages } = convertOpenAIMessages([
      { role: "tool", content: "result text", tool_call_id: "tc1", name: "my_tool" },
    ]);
    expect(messages[0].role).toBe("toolResult");
    expect(messages[0].toolCallId).toBe("tc1");
    expect(messages[0].content[0].text).toBe("result text");
  });

  it("user message with image content part", () => {
    const { messages } = convertOpenAIMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
        ],
      },
    ]);
    const content = messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const imgPart = (content as any[]).find((p: any) => p.type === "image");
    expect(imgPart).toBeDefined();
    expect(imgPart.mimeType).toBe("image/png");
    expect(imgPart.data).toBe("abc123");
  });

  it("user message with text-only content parts collapses to string", () => {
    const { messages } = convertOpenAIMessages([
      {
        role: "user",
        content: [{ type: "text", text: "just text" }],
      },
    ]);
    expect(messages[0].content).toBe("just text");
  });
});

describe("convertOpenAITools", () => {
  it("converts tool definitions", () => {
    const tools = convertOpenAITools([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the weather",
          parameters: { type: "object", properties: { city: { type: "string" } } },
        },
      },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_weather");
    expect(tools[0].description).toBe("Get the weather");
    expect(tools[0].parameters.properties.city).toBeDefined();
  });

  it("handles missing description", () => {
    const tools = convertOpenAITools([
      { type: "function", function: { name: "no_desc" } },
    ]);
    expect(tools[0].description).toBe("");
  });

  it("handles missing parameters", () => {
    const tools = convertOpenAITools([
      { type: "function", function: { name: "no_params" } },
    ]);
    expect(tools[0].parameters).toEqual({ type: "object", properties: {} });
  });
});
