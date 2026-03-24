import React, { useRef, useEffect, useCallback } from "react";
import Icon from "@mdi/react";
import { mdiContentCopy, mdiTextBox } from "@mdi/js";
import type { SessionState, ChatImage } from "../lib/event-reducer.js";
import type { ToolContext } from "./tool-renderers/index.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { CopyButton } from "./CopyButton.js";
import { ToolCallStep } from "./ToolCallStep.js";
import { ThinkingBlock } from "./ThinkingBlock.js";

interface Props {
  state: SessionState;
  toolContext: ToolContext;
}

function ImageAttachments({ images }: { images: ChatImage[] }) {
  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {images.map((img, i) => (
        <img
          key={i}
          src={`data:${img.mimeType};base64,${img.data}`}
          alt={`Attachment ${i + 1}`}
          className="max-w-[300px] max-h-[300px] rounded border border-white/20 object-contain"
        />
      ))}
    </div>
  );
}

function MessageBubble({ content, className }: { content: string; className: string }) {
  const contentRef = useRef<HTMLDivElement>(null);

  const getPlainText = useCallback(() => {
    return contentRef.current?.innerText ?? content;
  }, [content]);

  return (
    <div className={className}>
      <div ref={contentRef}>
        <MarkdownContent content={content} />
      </div>
      <div className="border-t border-[var(--border-secondary)] mt-2 pt-1.5 flex justify-end gap-0.5 opacity-50 hover:opacity-100 transition-opacity">
        <CopyButton text={content} icon={<Icon path={mdiContentCopy} size={0.6} />} title="Copy as Markdown" />
        <CopyButton text={getPlainText()} icon={<Icon path={mdiTextBox} size={0.6} />} title="Copy as plain text" />
      </div>
    </div>
  );
}

export function ChatView({ state, toolContext }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [state.messages.length, state.streamingText]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
      {state.messages.map((msg) => {
        if (msg.role === "user") {
          return (
            <div key={msg.id} className="mt-4 mb-4 flex justify-end">
              <div className="bg-blue-500/10 border border-blue-500/20 border-l-2 border-l-blue-400 rounded-xl shadow-md px-4 py-2 max-w-[80%]">
                {msg.images && msg.images.length > 0 && (
                  <ImageAttachments images={msg.images} />
                )}
                {msg.content && (
                  <MessageBubble
                    content={msg.content}
                    className=""
                  />
                )}
              </div>
            </div>
          );
        }

        if (msg.role === "thinking") {
          return (
            <ThinkingBlock
              key={msg.id}
              content={msg.content}
            />
          );
        }

        if (msg.role === "toolResult") {
          return (
            <ToolCallStep
              key={msg.id}
              toolName={msg.toolName ?? "unknown"}
              toolCallId={msg.toolCallId ?? msg.id}
              args={msg.args}
              status={msg.toolStatus ?? "running"}
              result={msg.result}
              context={toolContext}
            />
          );
        }

        // assistant
        return (
          <div key={msg.id} className="mt-4 mb-4 flex justify-start">
            <MessageBubble
              content={msg.content}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl shadow-md px-4 py-2 max-w-[80%]"
            />
          </div>
        );
      })}

      {/* Streaming thinking */}
      {state.streamingThinking && (
        <ThinkingBlock
          content={state.streamingThinking}
          isStreaming
          defaultExpanded
        />
      )}

      {/* Streaming text */}
      {state.streamingText && (
        <div className="flex justify-start">
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl shadow-md px-4 py-2 max-w-[80%]">
            <MarkdownContent content={state.streamingText} />
            <span className="inline-block w-1.5 h-4 bg-[var(--bg-surface)] animate-pulse ml-0.5" />
          </div>
        </div>
      )}

      {state.messages.length === 0 && !state.streamingText && (
        <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">
          <p>No messages yet</p>
        </div>
      )}
    </div>
  );
}
