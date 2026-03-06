export type AgentVendor = "claude" | "opencode" | "unknown";

const REGISTRY_VENDOR_MAP: Record<string, AgentVendor> = {
  claude_code: "claude",
  "claude-code": "claude",
  "claude-code-acp": "claude",
  "claude-acp": "claude",
  anthropic_claude_code: "claude",
  opencode: "opencode",
};

export function resolveAgentVendor(registryId: string): AgentVendor {
  const normalized = registryId.trim().toLowerCase();
  if (!normalized) return "unknown";

  const direct = REGISTRY_VENDOR_MAP[normalized];
  if (direct) return direct;

  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("opencode")) return "opencode";

  return "unknown";
}
