const TOOL_ALIASES: Record<string, string> = {
  puppeteer: "browser",
  irc: "hub",
  job: "hub",
  await: "hub",
  poll: "hub",
};

export interface UnwrappedToolCall {
  effectiveToolName: string;
  effectiveArgs: Record<string, unknown>;
}

function parseXdPath(pathStr: string): string {
  const rawPath = pathStr.slice(5).split("?")[0].split("#")[0];
  if (!rawPath.startsWith("mcp__")) return rawPath;
  const inner = rawPath.slice(5);
  if (inner.includes("__")) return inner.split("__").pop() ?? inner;
  if (inner.includes("_ctx_")) return inner.slice(inner.indexOf("_ctx_") + 1);
  return inner;
}

function parseXdContent(args?: Record<string, unknown>): Record<string, unknown> {
  if (!args) return {};
  if (typeof args.content === "string") {
    try {
      const parsed = JSON.parse(args.content);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { raw: args.content };
    } catch {
      return { raw: args.content };
    }
  }
  if (typeof args.content === "object" && args.content !== null) {
    return args.content as Record<string, unknown>;
  }
  return args;
}

function getXdevUnwrapped(toolDetails?: Record<string, unknown>, fallbackArgs?: Record<string, unknown>): UnwrappedToolCall | null {
  const xdev = toolDetails?.xdev;
  if (xdev && typeof xdev === "object") {
    const obj = xdev as Record<string, unknown>;
    if (typeof obj.tool === "string" && obj.tool.length > 0) {
      const inner = (obj.inner ?? obj.args ?? fallbackArgs ?? {}) as Record<string, unknown>;
      return { effectiveToolName: TOOL_ALIASES[obj.tool] ?? obj.tool, effectiveArgs: inner };
    }
  }
  return null;
}

export function unwrapXdToolCall(
  toolName: string,
  args?: Record<string, unknown>,
  toolDetails?: Record<string, unknown>,
): UnwrappedToolCall {
  const xdevResult = getXdevUnwrapped(toolDetails, args);
  if (xdevResult) return xdevResult;

  const lowerName = toolName.toLowerCase();
  const isWrite = lowerName === "write" || lowerName === "write_file";
  if (isWrite && typeof args?.path === "string" && args.path.startsWith("xd://")) {
    const extractedTool = parseXdPath(args.path);
    const effectiveArgs = parseXdContent(args);
    return { effectiveToolName: TOOL_ALIASES[extractedTool] ?? extractedTool, effectiveArgs };
  }

  return { effectiveToolName: TOOL_ALIASES[toolName] ?? toolName, effectiveArgs: args ?? {} };
}
