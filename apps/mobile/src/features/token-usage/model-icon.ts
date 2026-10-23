/**
 * Mobile adapter over the shared token-usage model-icon map (QUALITY-030).
 * Brands that mobile ships as Agent icons use those; the rest use the provider glyph.
 */
import { resolveTokenUsageModelIconRef } from "@atmos/shared";

export type TokenUsageModelIconKind =
  | { kind: "agent"; agentId: string }
  | { kind: "provider"; providerId: string }
  | { kind: "other" }
  | { kind: "unknown" };

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

export function resolveTokenUsageModelIcon(
  providerId: string | null | undefined,
  modelId: string,
): TokenUsageModelIconKind {
  if (modelId === "other") return { kind: "other" };

  const ref = resolveTokenUsageModelIconRef(providerId, modelId);
  if (ref.kind === "ai-provider") {
    const agentId = AGENT_ICON_FOR_PROVIDER[ref.id];
    if (agentId) return { kind: "agent", agentId };
    return { kind: "provider", providerId: ref.id };
  }
  if (ref.kind === "agent") return { kind: "agent", agentId: ref.id };
  return { kind: "unknown" };
}
