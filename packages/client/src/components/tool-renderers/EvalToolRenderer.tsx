import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getSyntaxTheme } from "../../lib/syntax-theme.js";
import { useThemeContext } from "../ThemeProvider.js";
import type { ToolRendererProps } from "./types.js";

export function EvalToolRenderer({ args, status, result }: ToolRendererProps) {
  let syntaxStyle;
  try {
    const { resolved: theme, themeName } = useThemeContext();
    syntaxStyle = getSyntaxTheme(theme, themeName);
  } catch {
    syntaxStyle = undefined;
  }

  const language = (args?.language as string) || "py";
  const code = (args?.code as string) || (args?.raw as string);
  const title = args?.title as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono font-bold text-[10px] text-[var(--accent)] uppercase">
          {language}
        </span>
        {title && <span className="font-semibold text-[var(--text-secondary)]">{title}</span>}
      </div>

      {code && (
        <div className="max-h-80 overflow-auto rounded border border-[var(--border-subtle)]">
          {syntaxStyle ? (
            <SyntaxHighlighter
              style={syntaxStyle}
              language={language === "py" ? "python" : language === "js" ? "javascript" : language}
              PreTag="div"
              showLineNumbers={true}
              customStyle={{ margin: 0, padding: "0.5rem", fontSize: "12px", background: "var(--bg-code)" }}
            >
              {code}
            </SyntaxHighlighter>
          ) : (
            <pre className="p-2 bg-[var(--bg-code)] font-mono text-[var(--text-secondary)]">{code}</pre>
          )}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Executing code…</div>
      )}

      {result && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">Output</div>
          <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
