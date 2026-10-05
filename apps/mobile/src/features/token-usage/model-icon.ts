/**
 * Model-row icons follow web `resolveTokenUsageModelIconSrc`.
 * Brands that mobile ships as Agent icons use those; the rest use the provider glyph.
 */
export type TokenUsageModelIconKind =
  | { kind: "agent"; agentId: string }
  | { kind: "provider"; providerId: string }
  | { kind: "other" }
  | { kind: "unknown" };

/** Asset basenames present under web `public/ai-provider/`. */
const AI_PROVIDER_ICON_IDS = new Set([
  "amp",
  "antigravity",
  "claude",
  "codex",
  "commandcode",
  "cursor",
  "factory",
  "gemini",
  "grok",
  "kimi",
  "mimo",
  "minimax",
  "opencode",
  "zai",
  "zed",
  "deepseek",
]);

/** tokscale / litellm `provider_id` → ai-provider asset. Keys are lowercase with `-` → `_`. */
const PROVIDER_TO_AI_PROVIDER_ICON: Record<string, string> = {
  anthropic: "claude",
  claude: "claude",
  openai: "codex",
  openai_codex: "codex",
  codex: "codex",
  google: "gemini",
  gemini: "gemini",
  xai: "grok",
  x_ai: "grok",
  grok: "grok",
  moonshotai: "kimi",
  moonshot: "kimi",
  kimi: "kimi",
  minimax: "minimax",
  minimaxai: "minimax",
  minimax_ai: "minimax",
  zai: "zai",
  zhipu: "zai",
  z_ai: "zai",
  xiaomi: "mimo",
  mimo: "mimo",
  cursor: "cursor",
  amp: "amp",
  antigravity: "antigravity",
  factory: "factory",
  opencode: "opencode",
  zed: "zed",
  commandcode: "commandcode",
  command_code: "commandcode",
};

/** Providers without an ai-provider glyph — same `/agents/*` fallback as web. */
const PROVIDER_TO_AGENT_ICON: Record<string, string> = {
  qwen: "qwen-code",
  mistral: "mistral-vibe",
  mistralai: "mistral-vibe",
};

/** ai-provider basenames that mobile draws with `MobileAgentIcon`. */
const AGENT_ICON_FOR_PROVIDER: Record<string, string> = {
  amp: "amp",
  antigravity: "antigravity",
  claude: "claude",
  codex: "codex",
  commandcode: "commandcode",
  cursor: "cursor",
  gemini: "gemini",
  grok: "grok",
  kimi: "kimi",
  opencode: "opencode",
};

function normalizeProviderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}

function primaryProviderSegment(providerId: string): string | null {
  const parts = providerId
    .split(/[,/]/)
    .map((part) => normalizeProviderKey(part))
    .filter(Boolean);
  for (const part of parts) {
    if (
      PROVIDER_TO_AI_PROVIDER_ICON[part] ||
      PROVIDER_TO_AGENT_ICON[part] ||
      AI_PROVIDER_ICON_IDS.has(part)
    ) {
      return part;
    }
  }
  return parts[0] ?? null;
}

function inferProviderIdFromModel(modelId: string): string | null {
  const lower = modelId.trim().toLowerCase();
  if (!lower || lower === "unknown" || lower === "other") return null;

  if (lower.startsWith("ollama/")) {
    return inferProviderIdFromModel(lower.slice("ollama/".length));
  }

  if (
    lower.includes("claude") ||
    lower.includes("anthropic") ||
    /(^|[^a-z])(opus|sonnet|haiku)([^a-z]|$)/.test(lower)
  ) {
    return "anthropic";
  }
  if (
    lower.includes("gpt") ||
    lower.includes("openai") ||
    /(^|[^a-z])(o1|o3|o4)([^a-z]|$)/.test(lower)
  ) {
    return "openai";
  }
  if (lower.includes("gemini") || lower.includes("google")) return "google";
  if (lower.includes("grok")) return "xai";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
  if (lower.includes("llama") || /(^|[^a-z])meta([^a-z]|$)/.test(lower)) return "meta";
  if (lower.includes("qwen")) return "qwen";
  if (/(^|[^a-z])kimi([^a-z]|$)/.test(lower)) return "moonshotai";
  if (/(^|[^a-z])(k2|k3)([^a-z]|$)/.test(lower)) return "moonshotai";
  if (/(^|[^a-z])mimo([^a-z]|$)/.test(lower)) return "xiaomi";
  if (/(^|[^a-z])glm([^a-z]|$)/.test(lower)) return "zai";

  if (lower.includes("/")) {
    return primaryProviderSegment(lower.slice(0, lower.indexOf("/")));
  }

  return null;
}

export function resolveTokenUsageModelIcon(
  providerId: string | null | undefined,
  modelId: string,
): TokenUsageModelIconKind {
  if (modelId === "other") return { kind: "other" };

  const candidates: string[] = [];
  if (providerId?.trim()) {
    const primary = primaryProviderSegment(providerId);
    if (primary) candidates.push(primary);
  }
  const inferred = inferProviderIdFromModel(modelId);
  if (inferred && !candidates.includes(inferred)) candidates.push(inferred);

  for (const key of candidates) {
    const mapped = PROVIDER_TO_AI_PROVIDER_ICON[key] ?? key;
    if (AI_PROVIDER_ICON_IDS.has(mapped)) {
      const agentId = AGENT_ICON_FOR_PROVIDER[mapped];
      if (agentId) return { kind: "agent", agentId };
      return { kind: "provider", providerId: mapped };
    }
    const agentIcon = PROVIDER_TO_AGENT_ICON[key];
    if (agentIcon) return { kind: "agent", agentId: agentIcon };
  }

  return { kind: "unknown" };
}
