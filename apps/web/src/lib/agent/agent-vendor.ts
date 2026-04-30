export type AgentVendor = "claude" | "opencode" | "cursor" | "gemini" | "factory-droid" | "kiro" | "unknown";

const REGISTRY_VENDOR_MAP: Record<string, AgentVendor> = {
  claude_code: "claude",
  "claude-code": "claude",
  "claude-code-acp": "claude",
  "claude-acp": "claude",
  anthropic_claude_code: "claude",
  opencode: "opencode",
  cursor: "cursor",
  "cursor-agent": "cursor",
  gemini: "gemini",
  "gemini-cli": "gemini",
  "factory-droid": "factory-droid",
  droid: "factory-droid",
  "factory-droid-acp": "factory-droid",
  kiro: "kiro",
  "kiro-cli": "kiro",
};

export function resolveAgentVendor(registryId: string): AgentVendor {
  const normalized = registryId.trim().toLowerCase();
  if (!normalized) return "unknown";

  const direct = REGISTRY_VENDOR_MAP[normalized];
  if (direct) return direct;

  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("opencode")) return "opencode";
  if (normalized.includes("cursor")) return "cursor";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("factory") || normalized.includes("droid")) return "factory-droid";
  if (normalized.includes("kiro")) return "kiro";

  return "unknown";
}
