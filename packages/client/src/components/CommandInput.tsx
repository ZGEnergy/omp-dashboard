import React, { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiFlash, mdiClipboardText, mdiWrench, mdiFolder, mdiFile, mdiPlay, mdiStop, mdiAlert, mdiConsole, mdiClose } from "@mdi/js";
import type { CommandInfo, ImageContent, FileEntry } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { ImageLightbox } from "./ImageLightbox.js";

/** Built-in pi commands available from the dashboard */
const BUILTIN_COMMANDS: CommandInfo[] = [
  { name: "compact", description: "Compact session context", source: "builtin" },
  { name: "reload", description: "Reload extensions, skills, prompts, and themes", source: "builtin" },
  { name: "new", description: "Start a new session", source: "builtin" },
];

interface Props {
  commands: CommandInfo[];
  onSend: (text: string, images?: ImageContent[]) => void;
  onListFiles?: (query: string) => void;
  fileResults?: { query: string; files: FileEntry[] } | null;
  disabled?: boolean;
  sessionStatus?: "idle" | "streaming" | "ended";
  onAbort?: () => void;
  onForceKill?: () => void;
  pendingPrompt?: boolean;
  onCancelPending?: () => void;
}

const sourceIcons: Record<string, ReactNode> = {
  extension: <Icon path={mdiFlash} size={0.6} />,
  prompt: <Icon path={mdiClipboardText} size={0.6} />,
  skill: <Icon path={mdiWrench} size={0.6} />,
  builtin: <Icon path={mdiConsole} size={0.6} />,
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type DropdownMode = "command" | "file" | null;

/**
 * Extract @ prefix from text before cursor.
 * Returns the query after @ if @ is at a token boundary, null otherwise.
 */
function extractAtQuery(text: string): string | null {
  const delimiters = new Set([" ", "\t", '"', "'"]);
  // Find last @ that's at a token boundary
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "@") {
      if (i === 0 || delimiters.has(text[i - 1]!)) {
        return text.slice(i + 1);
      }
      return null;
    }
    // Stop if we hit a delimiter without finding @
    if (delimiters.has(text[i]!)) {
      return null;
    }
  }
  return null;
}

type StopState = "idle" | "aborting" | "killing";

export function CommandInput({ commands: externalCommands, onSend, onListFiles, fileResults, disabled, sessionStatus, onAbort, onForceKill, pendingPrompt, onCancelPending }: Props) {
  // Merge server commands with built-in commands, avoiding duplicates
  const commands = useMemo(() => {
    const names = new Set(externalCommands.map((c) => c.name));
    const builtins = BUILTIN_COMMANDS.filter((c) => !names.has(c.name));
    return [...builtins, ...externalCommands];
  }, [externalCommands]);
  const [text, setText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stopState, setStopState] = useState<StopState>("idle");

  // Reset stop state when session stops streaming
  useEffect(() => {
    if (sessionStatus !== "streaming") setStopState("idle");
  }, [sessionStatus]);
  const [pendingImages, setPendingImages] = useState<ImageContent[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null); // text value when Escape was pressed
  const prevDropdownKeyRef = useRef<string>(""); // tracks mode+filter to reset selectedIndex
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFileQueryRef = useRef<string | null>(null);

  // --- Command autocomplete ---
  const isCommand = text.startsWith("/") && !text.includes("\n");
  const commandFilter = isCommand ? text.slice(1).toLowerCase() : "";

  const filteredCommands = isCommand
    ? commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(commandFilter) ||
          (cmd.description?.toLowerCase().includes(commandFilter) ?? false)
      )
    : [];

  // --- @ file autocomplete ---
  const cursorPos = inputRef.current?.selectionStart ?? text.length;
  const textBeforeCursor = text.slice(0, cursorPos);
  const atQuery = extractAtQuery(textBeforeCursor);
  const isAtMode = atQuery !== null;

  // Debounced file search
  useEffect(() => {
    if (!isAtMode || !onListFiles) {
      lastFileQueryRef.current = null;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastFileQueryRef.current = atQuery;
      onListFiles(atQuery);
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [atQuery, isAtMode, onListFiles]);

  // Determine dropdown items
  const fileItems = (isAtMode && fileResults && fileResults.query === lastFileQueryRef.current)
    ? fileResults.files
    : [];

  // Derive dropdown mode directly (no useEffect needed)
  // If user pressed Escape at the current text value, stay dismissed
  const isDismissed = dismissed === text;
  const dropdownMode: DropdownMode =
    isDismissed ? null
    : isCommand && filteredCommands.length > 0 ? "command"
    : isAtMode && fileItems.length > 0 ? "file"
    : null;

  const dropdownLength = dropdownMode === "command" ? filteredCommands.length
    : dropdownMode === "file" ? fileItems.length
    : 0;

  // Reset selectedIndex when dropdown mode or filter changes
  const dropdownKey = dropdownMode ? `${dropdownMode}:${commandFilter}` : "";
  if (dropdownKey !== prevDropdownKeyRef.current) {
    prevDropdownKeyRef.current = dropdownKey;
    if (selectedIndex !== 0) {
      setSelectedIndex(0);
    }
  }

  // --- Handlers ---

  const selectCommand = useCallback((cmd: CommandInfo) => {
    const newText = `/${cmd.name} `;
    setText(newText);
    setDismissed(newText); // prevent dropdown from reopening for selected text
    inputRef.current?.focus();
  }, []);

  const selectFile = useCallback((file: FileEntry) => {
    const query = atQuery ?? "";
    const beforeAt = textBeforeCursor.slice(0, textBeforeCursor.length - query.length - 1); // remove @query
    const afterCursor = text.slice(cursorPos);
    const filePath = file.path;
    const suffix = file.isDirectory ? "" : " ";
    const newText = `${beforeAt}@${filePath}${suffix}${afterCursor}`;
    setText(newText);
    setDismissed(newText); // prevent dropdown from reopening for selected text
    // Set cursor after the inserted path
    const newCursorPos = beforeAt.length + 1 + filePath.length + suffix.length;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      inputRef.current?.focus();
    });
  }, [atQuery, textBeforeCursor, text, cursorPos]);

  const handleSend = useCallback(() => {
    if (text.trim()) {
      onSend(text.trim(), pendingImages.length > 0 ? pendingImages : undefined);
      setText("");
      setPendingImages([]);
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "38px";
      }
    }
  }, [text, pendingImages, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (dropdownMode) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => {
            const next = Math.min(i + 1, dropdownLength - 1);
            requestAnimationFrame(() => {
              document.querySelector(`[data-dropdown-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
            });
            return next;
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => {
            const next = Math.max(i - 1, 0);
            requestAnimationFrame(() => {
              document.querySelector(`[data-dropdown-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
            });
            return next;
          });
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          if (dropdownMode === "command") {
            const cmd = filteredCommands[selectedIndex];
            if (cmd) selectCommand(cmd);
          } else if (dropdownMode === "file") {
            const file = fileItems[selectedIndex];
            if (file) selectFile(file);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDismissed(text);
          return;
        }
      }

      // Cancel pending prompt on Escape
      if (e.key === "Escape" && pendingPrompt && onCancelPending) {
        e.preventDefault();
        onCancelPending();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [dropdownMode, dropdownLength, filteredCommands, fileItems, selectedIndex, selectCommand, selectFile, handleSend, text, pendingPrompt, onCancelPending]
  );

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        // Capture mimeType eagerly - DataTransferItem may become invalid after event
        const mimeType = item.type;
        if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
          setImageError(`Unsupported image type: ${mimeType}. Use JPEG, PNG, GIF, or WebP.`);
          setTimeout(() => setImageError(null), 3000);
          continue;
        }
        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          if (!base64) return;

          if (base64.length > MAX_IMAGE_SIZE) {
            setImageError("Image too large (max 10MB)");
            setTimeout(() => setImageError(null), 3000);
            return;
          }

          setPendingImages((prev) => [
            ...prev,
            { type: "image", data: base64, mimeType },
          ]);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="border-t border-[var(--border-primary)] p-3 relative">
      {/* Autocomplete dropdown */}
      {dropdownMode === "command" && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl max-h-64 overflow-y-auto shadow-lg z-10">
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              data-dropdown-index={i}
              onClick={() => selectCommand(cmd)}
              className={`w-full px-3 py-2 min-h-[44px] md:min-h-0 text-left text-sm flex items-center gap-2 ${
                i === selectedIndex ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-hover)]"
              }`}
            >
              <span className="inline-flex">{sourceIcons[cmd.source] ?? <Icon path={mdiFlash} size={0.6} />}</span>
              <span className="font-mono text-blue-400">/{cmd.name}</span>
              {cmd.description && (
                <span className="text-[var(--text-tertiary)] truncate">{cmd.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {dropdownMode === "file" && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl max-h-64 overflow-y-auto shadow-lg z-10">
          {fileItems.map((file, i) => {
            const name = file.path.split("/").pop() ?? file.path;
            return (
              <button
                key={file.path}
                data-dropdown-index={i}
                onClick={() => selectFile(file)}
                className={`w-full px-3 py-2 min-h-[44px] md:min-h-0 text-left text-sm flex items-center gap-2 ${
                  i === selectedIndex ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-hover)]"
                }`}
              >
                <span className="inline-flex"><Icon path={file.isDirectory ? mdiFolder : mdiFile} size={0.6} /></span>
                <span className="font-mono text-green-400">
                  {name}{file.isDirectory ? "/" : ""}
                </span>
                <span className="text-[var(--text-tertiary)] truncate">{file.path}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Image error */}
      {imageError && (
        <div className="mb-2 text-xs text-red-400 bg-red-900/20 px-3 py-1 rounded">
          {imageError}
        </div>
      )}

      {/* Image previews */}
      {pendingImages.length > 0 && (
        <div className="mb-2 flex gap-2 flex-wrap">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Attachment ${i + 1}`}
                className="h-16 w-16 object-cover rounded border border-[var(--border-secondary)] cursor-pointer"
                onClick={() => setLightboxSrc({ src: `data:${img.mimeType};base64,${img.data}`, alt: `Attachment ${i + 1}` })}
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon path={mdiClose} size={0.45} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message, /command, !shell, or @file..."
          disabled={disabled || pendingPrompt}
          rows={1}
          className="flex-1 bg-[var(--bg-tertiary)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 border border-[var(--border-secondary)] focus:border-blue-500 focus:outline-none disabled:opacity-50 resize-none"
          style={{ minHeight: "38px", maxHeight: "120px" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "38px";
            target.style.height = Math.min(target.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || pendingPrompt || !text.trim()}
          className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          title="Send"
          data-testid="send-button"
        >
          <Icon path={mdiPlay} size={0.7} />
        </button>
        {(sessionStatus === "streaming" || pendingPrompt) && (onAbort || onCancelPending) && stopState === "idle" && (
          <button
            onClick={() => {
              if (pendingPrompt) {
                onCancelPending?.();
              } else {
                onAbort?.();
                if (onForceKill) setStopState("aborting");
              }
            }}
            className="p-2 bg-red-600 rounded-lg hover:bg-red-500 self-end"
            title="Stop"
            data-testid="stop-button"
          >
            <Icon path={mdiStop} size={0.7} />
          </button>
        )}
        {sessionStatus === "streaming" && stopState === "aborting" && onForceKill && (
          <button
            onClick={() => { onForceKill(); setStopState("killing"); }}
            className="p-2 bg-orange-600 rounded-lg hover:bg-orange-500 self-end animate-pulse"
            title="Force Stop — kill the process"
            data-testid="force-stop-button"
          >
            <Icon path={mdiAlert} size={0.7} />
          </button>
        )}
        {sessionStatus === "streaming" && stopState === "killing" && (
          <button
            disabled
            className="p-2 bg-orange-800 rounded-lg opacity-60 cursor-not-allowed self-end"
            title="Killing process..."
            data-testid="killing-button"
          >
            <Icon path={mdiStop} size={0.7} />
          </button>
        )}
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc.src} alt={lightboxSrc.alt} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
