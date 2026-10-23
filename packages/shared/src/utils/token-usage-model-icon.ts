/**
 * Shared token-usage model icon mapping (QUALITY-030).
 * Clients resolve a platform-agnostic ref, then adapt to web URLs or mobile glyphs.
 */

/** Asset basenames present under web `public/ai-provider/`. */
export const AI_PROVIDER_ICON_IDS = new Set([
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
export const PROVIDER_TO_AI_PROVIDER_ICON: Record<string, string> = {
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

/** Providers without an ai-provider glyph — fall back to `/agents/*`. */
export const PROVIDER_TO_AGENT_ICON: Record<string, string> = {
  qwen: "qwen-code",
  mistral: "mistral-vibe",
  mistralai: "mistral-vibe",
};

export type TokenUsageModelIconRef =
  | { kind: "ai-provider"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "none" };

export function normalizeProviderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * tokscale may merge providers as `"openai, anthropic"`. Pick the first segment
 * that maps to a known icon, else the first non-empty segment.
 */
export function primaryProviderSegment(providerId: string): string | null {
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

/**
 * Infer provider when tokscale left `provider_id` empty — mirrors
 * `tokscale_core::provider_identity::inferred_provider_from_model` lightly.
 */
export function inferProviderIdFromModel(modelId: string): string | null {
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

/**
 * Resolve a platform-agnostic icon ref. Web/mobile adapters map this onto URLs or glyphs.
 */
export function resolveTokenUsageModelIconRef(
  providerId: string | null | undefined,
  modelId: string,
): TokenUsageModelIconRef {
  const candidates: string[] = [];
  if (providerId?.trim()) {
    const primary = primaryProviderSegment(providerId);
    if (primary) candidates.push(primary);
  }
  const inferred = inferProviderIdFromModel(modelId);
  if (inferred && !candidates.includes(inferred)) {
    candidates.push(inferred);
  }

  for (const key of candidates) {
    const mapped = PROVIDER_TO_AI_PROVIDER_ICON[key] ?? key;
    if (AI_PROVIDER_ICON_IDS.has(mapped)) {
      return { kind: "ai-provider", id: mapped };
    }
    const agentIcon = PROVIDER_TO_AGENT_ICON[key];
    if (agentIcon) {
      return { kind: "agent", id: agentIcon };
    }
  }

  return { kind: "none" };
}
