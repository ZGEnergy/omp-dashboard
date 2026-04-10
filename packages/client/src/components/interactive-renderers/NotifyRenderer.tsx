import React from "react";
import type { InteractiveRendererProps } from "./types.js";

const levelColors: Record<string, string> = {
  info: "text-blue-400",
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
};

export function NotifyRenderer({ params }: InteractiveRendererProps) {
  const message = params.message as string;
  const level = (params.level as string) ?? "info";

  return (
    <div className={`mx-4 my-1 text-xs ${levelColors[level] ?? "text-[var(--text-secondary)]"}`}>
      {message}
    </div>
  );
}
