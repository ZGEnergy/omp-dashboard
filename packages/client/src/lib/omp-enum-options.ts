/** Known OMP enum option values (from omp settings-schema). */
export const OMP_ENUM_OPTIONS: Record<string, readonly string[]> = {
  "power.sleepPrevention": [
    "off",
    "idle",
    "display",
    "system"
  ],
  "advisor.syncBacklog": [
    "off",
    "1",
    "3",
    "5"
  ],
  "symbolPreset": [
    "unicode",
    "nerd",
    "ascii"
  ],
  "statusLine.preset": [
    "default",
    "minimal",
    "compact",
    "full",
    "nerd",
    "ascii",
    "custom"
  ],
  "statusLine.separator": [
    "powerline",
    "powerline-thin",
    "slash",
    "pipe",
    "block",
    "none",
    "ascii"
  ],
  "tui.hyperlinks": [
    "off",
    "auto",
    "always"
  ],
  "display.shimmer": [
    "classic",
    "kitt",
    "disabled"
  ],
  "defaultThinkingLevel": [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "auto"
  ],
  "inlineToolDescriptors": [
    "auto",
    "on",
    "off"
  ],
  "personality": [
    "default",
    "friendly",
    "pragmatic",
    "none"
  ],
  "textVerbosity": [
    "low",
    "medium",
    "high"
  ],
  "retry.fallbackRevertPolicy": [
    "cooldown-expiry",
    "never"
  ],
  "steeringMode": [
    "all",
    "one-at-a-time"
  ],
  "followUpMode": [
    "all",
    "one-at-a-time"
  ],
  "interruptMode": [
    "immediate",
    "wait"
  ],
  "loop.mode": [
    "prompt",
    "compact",
    "reset"
  ],
  "doubleEscapeAction": [
    "branch",
    "tree",
    "none"
  ],
  "treeFilterMode": [
    "default",
    "no-tools",
    "user-only",
    "labeled-only",
    "all"
  ],
  "marketplace.autoUpdate": [
    "off",
    "notify",
    "auto"
  ],
  "completion.notify": [
    "on",
    "off"
  ],
  "ask.notify": [
    "on",
    "off"
  ],
  "share.store": [
    "blob",
    "gist"
  ],
  "compaction.strategy": [
    "context-full",
    "handoff",
    "shake",
    "snapcompact",
    "off"
  ],
  "snapcompact.systemPrompt": [
    "none",
    "agents-md",
    "all"
  ],
  "tools.format": [
    "auto",
    "native",
    "glm",
    "hermes",
    "kimi",
    "xml",
    "anthropic",
    "deepseek",
    "harmony",
    "qwen3",
    "gemini",
    "gemma",
    "minimax"
  ],
  "snapcompact.shape": [
    "auto",
    "8x8r-bw",
    "8x8r-sent",
    "8x8u-bw",
    "8x8u-sent",
    "6x6u-bw",
    "6x6u-sent",
    "5x8-bw",
    "5x8-sent",
    "6x12-dim",
    "8x13-bw",
    "8on16-bw",
    "8on22-bw",
    "11on16-bw"
  ],
  "memory.backend": [
    "off",
    "local",
    "hindsight",
    "mnemopi"
  ],
  "mnemopi.scoping": [
    "global",
    "per-project",
    "per-project-tagged"
  ],
  "mnemopi.embeddingVariant": [
    "en",
    "multilingual"
  ],
  "mnemopi.llmMode": [
    "none",
    "smol",
    "remote"
  ],
  "hindsight.scoping": [
    "global",
    "per-project",
    "per-project-tagged"
  ],
  "hindsight.retainMode": [
    "full-session",
    "last-turn"
  ],
  "hindsight.recallBudget": [
    "low",
    "mid",
    "high"
  ],
  "ttsr.contextMode": [
    "discard",
    "keep"
  ],
  "ttsr.interruptMode": [
    "never",
    "prose-only",
    "tool-only",
    "always"
  ],
  "ttsr.repeatMode": [
    "once",
    "after-gap"
  ],
  "shellMinimizer.sourceOutlineLevel": [
    "default",
    "aggressive"
  ],
  "python.kernelMode": [
    "session",
    "per-call"
  ],
  "tools.approvalMode": [
    "always-ask",
    "write",
    "yolo"
  ],
  "todo.eager": [
    "default",
    "preferred",
    "always"
  ],
  "async.pollWaitDuration": [
    "5s",
    "10s",
    "30s",
    "1m",
    "5m",
    "smart"
  ],
  "tools.discoveryMode": [
    "auto",
    "off",
    "mcp-only",
    "all"
  ],
  "task.isolation.mode": [
    "none",
    "auto",
    "apfs",
    "btrfs",
    "zfs",
    "reflink",
    "overlayfs",
    "projfs",
    "block-clone",
    "rcopy"
  ],
  "task.isolation.merge": [
    "patch",
    "branch"
  ],
  "task.isolation.commits": [
    "generic",
    "ai"
  ],
  "task.eager": [
    "default",
    "preferred",
    "always"
  ],
  "providers.antigravityEndpoint": [
    "auto",
    "production",
    "sandbox"
  ],
  "providers.image": [
    "auto",
    "openai",
    "antigravity",
    "xai",
    "gemini",
    "openrouter"
  ],
  "providers.fireworksTier": [
    "standard",
    "priority"
  ],
  "providers.tts": [
    "auto",
    "local",
    "xai"
  ],
  "speech.mode": [
    "all",
    "assistant",
    "yield"
  ],
  "providers.kimiApiFormat": [
    "openai",
    "anthropic"
  ],
  "providers.openaiWebsockets": [
    "auto",
    "off",
    "on"
  ],
  "providers.openrouterVariant": [
    "default",
    "nitro",
    "floor",
    "online",
    "exacto"
  ],
  "providers.fetch": [
    "auto",
    "native",
    "trafilatura",
    "lynx",
    "parallel",
    "jina"
  ],
  "codexResets.autoRedeem": [
    "unset",
    "yes",
    "no"
  ],
  "provider.appendOnlyContext": [
    "auto",
    "on",
    "off"
  ],
  "dev.autoqa.consent": [
    "unset",
    "granted",
    "denied"
  ],
  "tier.openai": [
    "none",
    "auto",
    "default",
    "flex",
    "scale",
    "priority"
  ],
  "tier.anthropic": [
    "none",
    "priority"
  ],
  "tier.google": [
    "none",
    "flex",
    "priority"
  ],
  "tier.subagent": [
    "inherit",
    "none",
    "auto",
    "default",
    "flex",
    "scale",
    "priority"
  ],
  "tier.advisor": [
    "inherit",
    "none",
    "auto",
    "default",
    "flex",
    "scale",
    "priority"
  ],
  "edit.mode": [
    "apply_patch",
    "hashline",
    "patch",
    "replace"
  ],
  "providers.webSearch": [
    "auto",
    "perplexity",
    "gemini",
    "anthropic",
    "codex",
    "xai",
    "zai",
    "exa",
    "tinyfish",
    "jina",
    "kagi",
    "tavily",
    "firecrawl",
    "brave",
    "kimi",
    "parallel",
    "synthetic",
    "searxng",
    "startpage",
    "duckduckgo",
    "ecosia",
    "google",
    "mojeek",
    "public"
  ]
} as const;

export function enumOptionsFor(key: string): readonly string[] | undefined {
  return OMP_ENUM_OPTIONS[key];
}
