import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { useThemeContext } from "../ThemeProvider.js";
import { getSyntaxTheme } from "../../lib/syntax-theme.js";
import type { ToolRendererProps } from "./types.js";
import { OpenFileButton } from "./OpenFileButton.js";
import { detectLanguage } from "./lang-detect.js";

export function ReadToolRenderer({ args, status, result, context }: ToolRendererProps) {
  const { resolved: theme, themeName } = useThemeContext();
  const syntaxStyle = getSyntaxTheme(theme, themeName);
  const filePath = args?.path as string | undefined;
  const offset = args?.offset as number | undefined;
  const limit = args?.limit as number | undefined;
  const language = detectLanguage(filePath);

  const subtitle = [
    offset && `from line ${offset}`,
    limit && `${limit} lines`,
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] font-mono">{filePath ?? "file"}</span>
        {subtitle && <span className="text-[10px] text-[var(--text-muted)]">({subtitle})</span>}
        <OpenFileButton filePath={filePath} line={offset} context={context} />
      </div>

      {status === "running" && !result && (
        <div className="text-xs text-[var(--text-muted)] italic">Reading…</div>
      )}

      {result && (
        <div className="max-h-80 overflow-auto rounded text-xs">
          {language ? (
            <SyntaxHighlighter
              style={syntaxStyle}
              language={language}
              PreTag="div"
              showLineNumbers={true}
              startingLineNumber={offset ?? 1}
              customStyle={{ margin: 0, padding: "0.5rem", fontSize: "0.7rem", background: 'var(--bg-code)' }}
            >
              {result}
            </SyntaxHighlighter>
          ) : (
            <pre className="whitespace-pre-wrap text-[var(--text-secondary)] p-2 bg-[var(--bg-code)] rounded">{result}</pre>
          )}
        </div>
      )}
    </div>
  );
}
