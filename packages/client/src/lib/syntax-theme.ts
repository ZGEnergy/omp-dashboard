import type { CSSProperties } from "react";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ghcolors } from "react-syntax-highlighter/dist/esm/styles/prism";
import { getTheme } from "./themes.js";

type SyntaxStyle = { [key: string]: CSSProperties };

const syntaxStyles: Record<string, SyntaxStyle> = {
  oneDark: oneDark as SyntaxStyle,
  oneLight: oneLight as SyntaxStyle,
  dracula: dracula as SyntaxStyle,
  nord: nord as SyntaxStyle,
  ghcolors: ghcolors as SyntaxStyle,
};

export function getSyntaxTheme(resolved: "light" | "dark", themeName: string = "base"): SyntaxStyle {
  const theme = getTheme(themeName);
  if (theme) {
    const styleName = resolved === "light" ? theme.syntaxLight : theme.syntaxDark;
    const style = syntaxStyles[styleName];
    if (style) return style;
  }
  // Fallback
  return resolved === "light" ? oneLight : oneDark;
}
